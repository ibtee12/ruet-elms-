import { z } from "zod";

export const departmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Department name must be between 3 and 100 characters.")
    .max(100, "Department name cannot exceed 100 characters."),
  code: z
    .string()
    .trim()
    .min(2, "Department code must be 2 to 6 uppercase letters.")
    .max(6, "Department code cannot exceed 6 characters.")
    .regex(
      /^[A-Z]{2,6}$/,
      "Code must be 2 to 6 uppercase English letters (e.g., CSE, EEE, ME, CE)."
    ),
  description: z.string().trim().max(500, "Description cannot exceed 500 characters.").optional(),
});

export type DepartmentInput = z.infer<typeof departmentSchema>;
