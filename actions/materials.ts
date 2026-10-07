"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import crypto from "crypto";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/utils/ip";
import { Role, MaterialType } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors";
import {
  assertOfferingTeacher,
  assertOfferingWritable,
  assertCanViewOffering,
} from "@/lib/auth/guards";
import {
  validateMaterialFile,
  uploadToSupabaseBucket,
  deleteFromSupabaseBucket,
  sanitizeDisplayName,
} from "@/lib/storage";
import { uploadRateLimiter } from "@/lib/rate-limiter";
import { z } from "zod";

async function getSafeClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return getClientIp(headerList);
  } catch {
    return "127.0.0.1";
  }
}

// ---------------------------------------------------------------------------
// MODULE ACTIONS
// ---------------------------------------------------------------------------

const ModuleTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Module title is required.")
    .max(120, "Module title cannot exceed 120 characters."),
});

/**
 * Creates a new module within an offering.
 */
export async function createModuleAction(offeringId: string, title: string) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  await assertOfferingWritable(offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, offeringId);
  }

  const { title: cleanTitle } = ModuleTitleSchema.parse({ title });

  // Compute next order index
  const lastModule = await prisma.module.findFirst({
    where: { offeringId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (lastModule?.order ?? -1) + 1;

  const moduleItem = await prisma.module.create({
    data: {
      offeringId,
      title: cleanTitle,
      order: nextOrder,
    },
  });

  revalidatePath(`/teach/${offeringId}/materials`);
  return { success: true, module: moduleItem };
}

/**
 * Renames an existing module.
 */
export async function renameModuleAction(moduleId: string, title: string) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  const existing = await prisma.module.findUnique({
    where: { id: moduleId },
    include: { offering: true },
  });
  if (!existing) {
    throw new NotFoundError("Module not found.");
  }

  await assertOfferingWritable(existing.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, existing.offeringId);
  }

  const { title: cleanTitle } = ModuleTitleSchema.parse({ title });

  const updated = await prisma.module.update({
    where: { id: moduleId },
    data: { title: cleanTitle },
  });

  revalidatePath(`/teach/${existing.offeringId}/materials`);
  return { success: true, module: updated };
}

/**
 * Reorders modules in an offering.
 */
export async function reorderModulesAction(
  offeringId: string,
  orderedModuleIds: string[]
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  await assertOfferingWritable(offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, offeringId);
  }

  if (!Array.isArray(orderedModuleIds) || orderedModuleIds.length === 0) {
    return { success: false, error: "Invalid module order list." };
  }

  await prisma.$transaction(
    orderedModuleIds.map((id, index) =>
      prisma.module.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  revalidatePath(`/teach/${offeringId}/materials`);
  return { success: true };
}

/**
 * Deletes a module. If moveMaterialsToUnsorted is true, moves existing materials
 * to an "Unsorted" module instead of preventing deletion.
 */
export async function deleteModuleAction(
  moduleId: string,
  moveMaterialsToUnsorted: boolean = false
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  const existing = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      _count: { select: { materials: true } },
    },
  });
  if (!existing) {
    throw new NotFoundError("Module not found.");
  }

  await assertOfferingWritable(existing.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, existing.offeringId);
  }

  if (existing._count.materials > 0) {
    if (!moveMaterialsToUnsorted) {
      return {
        success: false,
        error: `Cannot delete module "${existing.title}" because it contains ${existing._count.materials} material(s). Please move materials or select the unsorted option.`,
      };
    }

    // Move materials to "Unsorted" module
    let unsortedModule = await prisma.module.findFirst({
      where: {
        offeringId: existing.offeringId,
        title: "Unsorted",
        NOT: { id: moduleId },
      },
    });

    if (!unsortedModule) {
      unsortedModule = await prisma.module.create({
        data: {
          offeringId: existing.offeringId,
          title: "Unsorted",
          order: 9999,
        },
      });
    }

    await prisma.material.updateMany({
      where: { moduleId },
      data: { moduleId: unsortedModule.id },
    });
  }

  await prisma.module.delete({ where: { id: moduleId } });

  revalidatePath(`/teach/${existing.offeringId}/materials`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// MATERIAL ACTIONS
// ---------------------------------------------------------------------------

/**
 * Uploads a file material to Supabase Storage and creates a Material record.
 */
export async function uploadMaterialFileAction(formData: FormData) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  const offeringId = formData.get("offeringId") as string;
  const moduleId = formData.get("moduleId") as string;
  const title = (formData.get("title") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const topicId = (formData.get("topicId") as string)?.trim() || null;
  const newTopicName = (formData.get("newTopicName") as string)?.trim() || null;
  const published = formData.get("published") === "true";
  const file = formData.get("file") as File | null;

  if (!offeringId || !moduleId || !title || !file) {
    return { success: false, error: "Missing required fields or file." };
  }

  await assertOfferingWritable(offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, offeringId);
  }

  // Rate limit uploads
  const uploadStatus = await uploadRateLimiter.check(caller.id);
  if (!uploadStatus.allowed) {
    return {
      success: false,
      error: `Upload rate limit reached. Please wait ${uploadStatus.retryAfterSeconds}s before uploading again.`,
    };
  }
  await uploadRateLimiter.consume(caller.id);

  // Read file bytes into Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Validate file: extension allowlist, magic bytes, size limit, double extension
  const validation = await validateMaterialFile(
    file.name,
    buffer,
    file.type
  );

  if (!validation.valid || !validation.ext) {
    return {
      success: false,
      error: validation.error || "File validation failed.",
    };
  }

  // Generate random key: offeringId/uuid.ext
  const randomKey = `${offeringId}/${crypto.randomUUID()}.${validation.ext}`;

  // Upload to private Supabase bucket
  const uploadRes = await uploadToSupabaseBucket(
    randomKey,
    buffer,
    validation.mime || "application/octet-stream"
  );

  if (!uploadRes.success) {
    return { success: false, error: uploadRes.error };
  }

  // Handle inline topic creation if requested
  let resolvedTopicId = topicId;
  if (!resolvedTopicId && newTopicName) {
    const topic = await prisma.topic.upsert({
      where: {
        offeringId_name: {
          offeringId,
          name: newTopicName,
        },
      },
      update: {},
      create: {
        offeringId,
        name: newTopicName,
      },
    });
    resolvedTopicId = topic.id;
  }

  // Compute next order in this module
  const lastMaterial = await prisma.material.findFirst({
    where: { moduleId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (lastMaterial?.order ?? -1) + 1;

  const clientIp = await getSafeClientIp();

  const material = await prisma.$transaction(async (tx) => {
    const mat = await tx.material.create({
      data: {
        moduleId,
        title,
        description,
        type: MaterialType.FILE,
        fileKey: randomKey,
        originalName: validation.sanitizedName || sanitizeDisplayName(file.name),
        mime: validation.mime,
        sizeBytes: buffer.length,
        topicId: resolvedTopicId,
        published,
        order: nextOrder,
        uploadedById: caller.id,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "MATERIAL_UPLOADED",
        objectType: "Material",
        objectId: mat.id,
        userId: caller.id,
        description: `Uploaded file material "${title}" (${validation.sanitizedName})`,
        ip: clientIp,
      },
    });

    return mat;
  });

  revalidatePath(`/teach/${offeringId}/materials`);
  return { success: true, material };
}

/**
 * Creates an external link or video link material.
 */
export async function createMaterialLinkAction(input: {
  offeringId: string;
  moduleId: string;
  title: string;
  description?: string;
  url: string;
  type: "LINK" | "VIDEO";
  topicId?: string;
  newTopicName?: string;
  published?: boolean;
}) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  await assertOfferingWritable(input.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, input.offeringId);
  }

  // Validate URL: http:// or https:// scheme only
  const cleanUrl = input.url.trim();
  try {
    const parsed = new URL(cleanUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        success: false,
        error: "URL must use http:// or https:// protocol scheme.",
      };
    }
  } catch {
    return { success: false, error: "Invalid URL format." };
  }

  const cleanTitle = input.title.trim();
  if (!cleanTitle) {
    return { success: false, error: "Title is required." };
  }

  // Handle inline topic
  let resolvedTopicId = input.topicId || null;
  if (!resolvedTopicId && input.newTopicName?.trim()) {
    const topic = await prisma.topic.upsert({
      where: {
        offeringId_name: {
          offeringId: input.offeringId,
          name: input.newTopicName.trim(),
        },
      },
      update: {},
      create: {
        offeringId: input.offeringId,
        name: input.newTopicName.trim(),
      },
    });
    resolvedTopicId = topic.id;
  }

  const lastMaterial = await prisma.material.findFirst({
    where: { moduleId: input.moduleId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const nextOrder = (lastMaterial?.order ?? -1) + 1;

  const clientIp = await getSafeClientIp();

  const material = await prisma.$transaction(async (tx) => {
    const mat = await tx.material.create({
      data: {
        moduleId: input.moduleId,
        title: cleanTitle,
        description: input.description?.trim() || null,
        type: input.type === "VIDEO" ? MaterialType.VIDEO : MaterialType.LINK,
        url: cleanUrl,
        topicId: resolvedTopicId,
        published: input.published ?? false,
        order: nextOrder,
        uploadedById: caller.id,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "MATERIAL_UPLOADED",
        objectType: "Material",
        objectId: mat.id,
        userId: caller.id,
        description: `Added ${input.type.toLowerCase()} material "${cleanTitle}"`,
        ip: clientIp,
      },
    });

    return mat;
  });

  revalidatePath(`/teach/${input.offeringId}/materials`);
  return { success: true, material };
}

/**
 * Toggles a material's published status.
 */
export async function toggleMaterialPublishedAction(materialId: string) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { module: true },
  });
  if (!material) {
    throw new NotFoundError("Material not found.");
  }

  await assertOfferingWritable(material.module.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, material.module.offeringId);
  }

  const newStatus = !material.published;
  const clientIp = await getSafeClientIp();

  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.material.update({
      where: { id: materialId },
      data: { published: newStatus },
    });

    await tx.auditLog.create({
      data: {
        action: "MATERIAL_PUBLISHED_CHANGED",
        objectType: "Material",
        objectId: materialId,
        userId: caller.id,
        description: `${newStatus ? "Published" : "Unpublished"} material "${material.title}"`,
        ip: clientIp,
      },
    });

    return m;
  });

  revalidatePath(`/teach/${material.module.offeringId}/materials`);
  return { success: true, published: updated.published };
}

/**
 * Updates material title, description, URL, or topic.
 */
export async function updateMaterialAction(
  materialId: string,
  input: {
    title?: string;
    description?: string;
    url?: string;
    topicId?: string | null;
    published?: boolean;
    moduleId?: string;
  }
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { module: true },
  });
  if (!material) {
    throw new NotFoundError("Material not found.");
  }

  await assertOfferingWritable(material.module.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, material.module.offeringId);
  }

  const data: Record<string, unknown> = {};

  if (input.title !== undefined) {
    const t = input.title.trim();
    if (!t) return { success: false, error: "Title cannot be empty." };
    data.title = t;
  }

  if (input.description !== undefined) {
    data.description = input.description.trim() || null;
  }

  if (input.url !== undefined && (material.type === "LINK" || material.type === "VIDEO")) {
    const u = input.url.trim();
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return { success: false, error: "URL must use http:// or https:// scheme." };
      }
      data.url = u;
    } catch {
      return { success: false, error: "Invalid URL format." };
    }
  }

  if (input.topicId !== undefined) {
    data.topicId = input.topicId;
  }

  if (input.published !== undefined) {
    data.published = input.published;
  }

  if (input.moduleId !== undefined && input.moduleId !== material.moduleId) {
    data.moduleId = input.moduleId;
  }

  const updated = await prisma.material.update({
    where: { id: materialId },
    data,
  });

  revalidatePath(`/teach/${material.module.offeringId}/materials`);
  return { success: true, material: updated };
}

/**
 * Deletes a material and cleans up its storage file.
 */
export async function deleteMaterialAction(materialId: string) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { module: true },
  });
  if (!material) {
    throw new NotFoundError("Material not found.");
  }

  await assertOfferingWritable(material.module.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, material.module.offeringId);
  }

  // Delete storage file from Supabase bucket if present
  if (material.fileKey) {
    await deleteFromSupabaseBucket(material.fileKey);
  }

  const clientIp = await getSafeClientIp();

  await prisma.$transaction(async (tx) => {
    // Delete student progress records first
    await tx.materialProgress.deleteMany({
      where: { materialId },
    });

    await tx.material.delete({
      where: { id: materialId },
    });

    await tx.auditLog.create({
      data: {
        action: "MATERIAL_DELETED",
        objectType: "Material",
        objectId: materialId,
        userId: caller.id,
        description: `Deleted material "${material.title}"`,
        ip: clientIp,
      },
    });
  });

  revalidatePath(`/teach/${material.module.offeringId}/materials`);
  return { success: true };
}

/**
 * Reorders materials inside a module.
 */
export async function reorderMaterialsAction(
  moduleId: string,
  orderedMaterialIds: string[]
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

  const moduleItem = await prisma.module.findUnique({
    where: { id: moduleId },
  });
  if (!moduleItem) {
    throw new NotFoundError("Module not found.");
  }

  await assertOfferingWritable(moduleItem.offeringId);
  if (caller.role === Role.TEACHER) {
    await assertOfferingTeacher(caller.id, moduleItem.offeringId);
  }

  await prisma.$transaction(
    orderedMaterialIds.map((id, index) =>
      prisma.material.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  revalidatePath(`/teach/${moduleItem.offeringId}/materials`);
  return { success: true };
}

/**
 * Toggles a student's completion status for a published course material.
 * Returns the updated completion state.
 */
export async function toggleMaterialProgressAction(
  materialId: string,
  targetCompleted?: boolean
) {
  const caller = await requireRole(Role.STUDENT, Role.SUPER_ADMIN);

  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: {
      module: true,
    },
  });

  if (!material) {
    throw new NotFoundError("Material not found.");
  }

  // Unpublished materials cannot be marked as completed by students
  if (!material.published && caller.role === Role.STUDENT) {
    throw new ForbiddenError("Cannot track progress on unpublished materials.");
  }

  const offeringId = material.module.offeringId;

  // Verify student is enrolled and authorized to view this offering
  await assertCanViewOffering(caller, offeringId);

  const existing = await prisma.materialProgress.findUnique({
    where: {
      materialId_studentId: {
        materialId,
        studentId: caller.id,
      },
    },
  });

  const shouldBeCompleted =
    targetCompleted !== undefined ? targetCompleted : !existing;

  if (shouldBeCompleted) {
    await prisma.materialProgress.upsert({
      where: {
        materialId_studentId: {
          materialId,
          studentId: caller.id,
        },
      },
      create: {
        materialId,
        studentId: caller.id,
      },
      update: {},
    });
  } else {
    await prisma.materialProgress.deleteMany({
      where: {
        materialId,
        studentId: caller.id,
      },
    });
  }

  revalidatePath(`/courses/${offeringId}/materials`);
  revalidatePath("/courses");

  return { success: true, completed: shouldBeCompleted };
}

