import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, MaterialType } from "@prisma/client";
import { assertCanViewOffering, assertOfferingTeacher } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/auth/errors";

export interface MaterialItemData {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  type: MaterialType;
  fileKey: string | null;
  originalName: string | null;
  mime: string | null;
  sizeBytes: number | null;
  url: string | null;
  topicId: string | null;
  topicName: string | null;
  published: boolean;
  order: number;
  uploadedByName: string;
  createdAt: Date;
}

export interface ModuleItemData {
  id: string;
  offeringId: string;
  title: string;
  order: number;
  materials: MaterialItemData[];
}

export interface TopicItemData {
  id: string;
  name: string;
}

export interface OfferingMaterialsData {
  offeringId: string;
  isArchived: boolean;
  canManage: boolean;
  modules: ModuleItemData[];
  topics: TopicItemData[];
}

/**
 * Loads modules, materials, and topics for a course offering with authorization checks.
 */
export async function getOfferingMaterialsData(
  offeringId: string,
  caller: { id: string; role: Role }
): Promise<OfferingMaterialsData> {
  await assertCanViewOffering(caller, offeringId);

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      offeringTeachers: {
        where: { userId: caller.id },
        select: { role: true },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  const isArchived = offering.status === CourseOfferingStatus.ARCHIVED;
  const canManage =
    caller.role === Role.SUPER_ADMIN || offering.offeringTeachers.length > 0;

  const [modules, topics] = await Promise.all([
    prisma.module.findMany({
      where: { offeringId },
      orderBy: { order: "asc" },
      include: {
        materials: {
          orderBy: { order: "asc" },
          include: {
            topic: { select: { id: true, name: true } },
            uploadedBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.topic.findMany({
      where: { offeringId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return {
    offeringId,
    isArchived,
    canManage,
    topics,
    modules: modules.map((m) => ({
      id: m.id,
      offeringId: m.offeringId,
      title: m.title,
      order: m.order,
      materials: m.materials.map((mat) => ({
        id: mat.id,
        moduleId: mat.moduleId,
        title: mat.title,
        description: mat.description,
        type: mat.type,
        fileKey: mat.fileKey,
        originalName: mat.originalName,
        mime: mat.mime,
        sizeBytes: mat.sizeBytes,
        url: mat.url,
        topicId: mat.topicId,
        topicName: mat.topic?.name || null,
        published: mat.published,
        order: mat.order,
        uploadedByName: mat.uploadedBy.name,
        createdAt: mat.createdAt,
      })),
    })),
  };
}

export interface StudentMaterialItemData {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  type: MaterialType;
  fileKey: string | null;
  originalName: string | null;
  mime: string | null;
  sizeBytes: number | null;
  url: string | null;
  topicId: string | null;
  topicName: string | null;
  order: number;
  isCompleted: boolean;
  completedAt: Date | null;
}

export interface StudentModuleItemData {
  id: string;
  offeringId: string;
  title: string;
  order: number;
  materials: StudentMaterialItemData[];
  publishedCount: number;
  completedCount: number;
  progressPercentage: number;
}

export interface StudentOfferingMaterialsData {
  offeringId: string;
  code: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  modules: StudentModuleItemData[];
  totalPublishedCount: number;
  totalCompletedCount: number;
  totalPercentage: number;
}

/**
 * Loads published modules, materials, and student completion progress for a course offering.
 * Unpublished materials are strictly excluded.
 */
export async function getStudentOfferingMaterialsData(
  offeringId: string,
  studentId: string
): Promise<StudentOfferingMaterialsData> {
  await assertCanViewOffering({ id: studentId, role: Role.STUDENT }, offeringId);

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      term: true,
      academicYear: true,
      course: {
        select: {
          code: true,
          title: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  // Fetch modules with ONLY published materials
  const rawModules = await prisma.module.findMany({
    where: { offeringId },
    orderBy: { order: "asc" },
    include: {
      materials: {
        where: { published: true }, // NEVER load unpublished materials for students
        orderBy: { order: "asc" },
        include: {
          topic: { select: { id: true, name: true } },
          progress: {
            where: { studentId },
            select: { id: true, completedAt: true },
          },
        },
      },
    },
  });

  let totalPublishedCount = 0;
  let totalCompletedCount = 0;

  const modules: StudentModuleItemData[] = rawModules.map((m) => {
    const materials: StudentMaterialItemData[] = m.materials.map((mat) => {
      const isCompleted = mat.progress.length > 0;
      return {
        id: mat.id,
        moduleId: mat.moduleId,
        title: mat.title,
        description: mat.description,
        type: mat.type,
        fileKey: mat.fileKey,
        originalName: mat.originalName,
        mime: mat.mime,
        sizeBytes: mat.sizeBytes,
        url: mat.url,
        topicId: mat.topicId,
        topicName: mat.topic?.name || null,
        order: mat.order,
        isCompleted,
        completedAt: mat.progress[0]?.completedAt || null,
      };
    });

    const publishedCount = materials.length;
    const completedCount = materials.filter((mat) => mat.isCompleted).length;
    const progressPercentage =
      publishedCount > 0 ? Math.round((completedCount / publishedCount) * 100) : 0;

    totalPublishedCount += publishedCount;
    totalCompletedCount += completedCount;

    return {
      id: m.id,
      offeringId: m.offeringId,
      title: m.title,
      order: m.order,
      materials,
      publishedCount,
      completedCount,
      progressPercentage,
    };
  });

  const totalPercentage =
    totalPublishedCount > 0
      ? Math.round((totalCompletedCount / totalPublishedCount) * 100)
      : 0;

  return {
    offeringId: offering.id,
    code: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    modules,
    totalPublishedCount,
    totalCompletedCount,
    totalPercentage,
  };
}

