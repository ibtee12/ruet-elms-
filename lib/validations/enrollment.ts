import { z } from "zod";

export const joinCodeSchema = z
  .string({
    message: "Join code is required.",
  })
  .trim()
  .min(4, "Join code must be at least 4 characters.")
  .max(32, "Join code cannot exceed 32 characters.")
  .regex(
    /^[A-Za-z0-9-]+$/,
    "Join code may only contain alphanumeric characters and hyphens."
  );

export const singleEnrollSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  studentUserId: z.string().trim().min(1, "Student user ID is required."),
  sectionId: z.string().trim().min(1, "Section ID is required."),
});

export const bulkEnrollInputSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  rawInput: z
    .string({
      message: "Student IDs or CSV text must be provided.",
    })
    .trim()
    .min(1, "Student IDs cannot be empty.")
    .max(50000, "Input exceeds maximum allowed size (50KB)."),
  defaultSectionId: z.string().trim().min(1, "Default section ID is required."),
});

export const moveEnrollmentsSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  enrollmentIds: z
    .array(z.string().trim().min(1))
    .min(1, "Select at least one student to move.")
    .max(1000, "You can move at most 1,000 students at once."),
  targetSectionId: z.string().trim().min(1, "Target section ID is required."),
});

export const enrollmentIdParamSchema = z
  .string({
    message: "Enrollment ID is required.",
  })
  .trim()
  .min(1, "Enrollment ID cannot be empty.");

export const offeringIdParamSchema = z
  .string({
    message: "Offering ID is required.",
  })
  .trim()
  .min(1, "Offering ID cannot be empty.");

