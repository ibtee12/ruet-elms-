import { z } from "zod";

/**
 * Validates that an announcement belongs to either a course offering OR a department,
 * but never both and never neither.
 */
export function isValidAnnouncementScope(
  offeringId?: string | null,
  departmentId?: string | null
): boolean {
  const hasOffering = Boolean(offeringId && offeringId.trim() !== "");
  const hasDepartment = Boolean(departmentId && departmentId.trim() !== "");
  return hasOffering !== hasDepartment;
}

export const announcementInputSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(200, "Title is too long"),
    body: z.string().min(1, "Body is required"),
    offeringId: z.string().nullable().optional(),
    departmentId: z.string().nullable().optional(),
  })
  .refine(
    (data) => isValidAnnouncementScope(data.offeringId, data.departmentId),
    {
      message:
        "An announcement must belong to either a course offering or a department, but not both.",
      path: ["offeringId"],
    }
  );

export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
