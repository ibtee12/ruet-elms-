"use server";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/session";
import { assertOfferingTeacher } from "@/lib/auth/guards";
import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function updateGradebookSettingsAction(
  offeringId: string,
  settings: {
    treatMissingAsZero?: boolean;
    showClassAverageToStudents?: boolean;
  }
) {
  try {
    const user = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);

    if (user.role !== Role.SUPER_ADMIN) {
      await assertOfferingTeacher(user.id, offeringId, { allowTA: false });
    }

    await prisma.courseOffering.update({
      where: { id: offeringId },
      data: {
        ...(typeof settings.treatMissingAsZero === "boolean"
          ? { treatMissingAsZero: settings.treatMissingAsZero }
          : {}),
        ...(typeof settings.showClassAverageToStudents === "boolean"
          ? { showClassAverageToStudents: settings.showClassAverageToStudents }
          : {}),
      },
    });

    revalidatePath(`/teach/${offeringId}/gradebook`);
    revalidatePath(`/courses/${offeringId}/grades`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update gradebook settings",
    };
  }
}
