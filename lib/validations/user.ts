import { z } from "zod";
import { Role } from "@prisma/client";

export const studentProfileSchema = z.object({
  studentId: z
    .string()
    .trim()
    .min(3, "Student ID must be at least 3 characters.")
    .max(20, "Student ID cannot exceed 20 characters."),
  departmentId: z.string().min(1, "Department is required."),
  batch: z
    .string()
    .trim()
    .min(2, "Batch is required (e.g., 2022).")
    .max(10, "Batch cannot exceed 10 characters."),
  level: z.coerce
    .number()
    .int()
    .min(1, "Level must be between 1 and 4.")
    .max(4, "Level must be between 1 and 4."),
  term: z.coerce
    .number()
    .int()
    .min(1, "Term must be 1 or 2.")
    .max(2, "Term must be 1 or 2."),
});

export const teacherProfileSchema = z.object({
  employeeId: z
    .string()
    .trim()
    .min(2, "Employee ID must be at least 2 characters.")
    .max(20, "Employee ID cannot exceed 20 characters."),
  departmentId: z.string().min(1, "Department is required."),
  designation: z
    .string()
    .trim()
    .min(2, "Designation is required.")
    .max(60, "Designation cannot exceed 60 characters."),
});

export const createUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be between 2 and 100 characters.")
    .max(100, "Name cannot exceed 100 characters."),
  email: z.string().trim().email("Please provide a valid email address."),
  role: z.nativeEnum(Role, {
    message: "Please select a valid university role.",
  }),
  sendWelcomeEmail: z.boolean().optional().default(false),
  studentProfile: studentProfileSchema.optional(),
  teacherProfile: teacherProfileSchema.optional(),
});

export const editUserSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be between 2 and 100 characters.")
    .max(100, "Name cannot exceed 100 characters."),
  email: z.string().trim().email("Please provide a valid email address."),
  studentProfile: studentProfileSchema.optional(),
  teacherProfile: teacherProfileSchema.optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type EditUserInput = z.infer<typeof editUserSchema>;
export type StudentProfileInput = z.infer<typeof studentProfileSchema>;
export type TeacherProfileInput = z.infer<typeof teacherProfileSchema>;
