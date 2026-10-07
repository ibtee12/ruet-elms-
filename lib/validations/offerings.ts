import { z } from "zod";
import { CourseOfferingStatus, OfferingTeacherRole } from "@prisma/client";

export const getOfferingsParamsSchema = z.object({
  term: z.string().trim().optional(),
  academicYear: z.string().trim().optional(),
  status: z.nativeEnum(CourseOfferingStatus).optional(),
  departmentId: z.string().trim().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(5).max(100).optional(),
});

export type GetOfferingsParams = z.infer<typeof getOfferingsParamsSchema>;

export const createOfferingSchema = z.object({
  courseId: z.string().trim().min(1, "Course ID is required."),
  term: z.string().trim().min(1, "Term is required."),
  academicYear: z.string().trim().min(1, "Academic year is required."),
  syllabus: z.string().trim().optional(),
});

export type CreateOfferingInput = z.infer<typeof createOfferingSchema>;

export const updateOfferingStatusSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  newStatus: z.nativeEnum(CourseOfferingStatus),
});

export const addSectionSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  name: z.string().trim().min(1, "Section name cannot be empty.").max(50, "Section name too long."),
});

export const renameSectionSchema = z.object({
  sectionId: z.string().trim().min(1, "Section ID is required."),
  newName: z.string().trim().min(1, "Section name cannot be empty.").max(50, "Section name too long."),
});

export const sectionIdParamSchema = z.string().trim().min(1, "Section ID is required.");

export const assignOfferingTeacherSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  userId: z.string().trim().min(1, "User ID is required."),
  role: z.nativeEnum(OfferingTeacherRole),
});

export const removeOfferingTeacherSchema = z.object({
  offeringId: z.string().trim().min(1, "Offering ID is required."),
  userId: z.string().trim().min(1, "User ID is required."),
});
