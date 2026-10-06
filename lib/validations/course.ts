import { z } from "zod";

export const courseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(5, "Course code must be at least 5 characters (e.g., 'CSE 3205').")
    .max(12, "Course code cannot exceed 12 characters.")
    .regex(
      /^[A-Z]{2,6}\s\d{3,4}$/,
      "Course code must be 2-6 uppercase letters followed by a space and 3-4 digits (e.g., 'CSE 3205', 'EEE 2101')."
    ),
  title: z
    .string()
    .trim()
    .min(3, "Course title must be at least 3 characters.")
    .max(150, "Course title cannot exceed 150 characters."),
  credits: z.coerce
    .number()
    .min(0.75, "Credits must be between 0.75 and 6.00.")
    .max(6.0, "Credits must be between 0.75 and 6.00."),
  departmentId: z.string().min(1, "Please select an academic department."),
  description: z.string().trim().max(1000, "Description cannot exceed 1000 characters.").optional(),
});

export type CourseInput = z.infer<typeof courseSchema>;
