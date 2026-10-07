import { z } from "zod";
import { ThreadCategory } from "@prisma/client";

export const createThreadSchema = z.object({
  offeringId: z.string().min(1, "Course offering ID is required"),
  title: z
    .string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title cannot exceed 200 characters"),
  content: z
    .string()
    .trim()
    .min(1, "Thread content is required")
    .max(5000, "Thread content cannot exceed 5,000 characters"),
  category: z.nativeEnum(ThreadCategory, {
    message: "Please select a valid thread category",
  }),
  isAnonymous: z.boolean().default(false),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;

export const createPostSchema = z.object({
  threadId: z.string().min(1, "Thread ID is required"),
  parentId: z.string().nullable().optional(),
  content: z
    .string()
    .trim()
    .min(1, "Reply content is required")
    .max(5000, "Reply content cannot exceed 5,000 characters"),
  isAnonymous: z.boolean().default(false),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const threadQuerySchema = z.object({
  offeringId: z.string().min(1),
  category: z.union([z.nativeEnum(ThreadCategory), z.literal("ALL")]).optional(),
  unansweredOnly: z.boolean().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["newest", "activity"]).default("activity"),
});

export type ThreadQueryInput = z.infer<typeof threadQuerySchema>;

export const threadModerationActionSchema = z.object({
  threadId: z.string().min(1),
  action: z.enum(["lock", "unlock", "pin", "unpin", "delete"]),
});

export type ThreadModerationActionInput = z.infer<typeof threadModerationActionSchema>;

export const postModerationActionSchema = z.object({
  postId: z.string().min(1),
  action: z.enum(["accept", "delete"]),
});

export type PostModerationActionInput = z.infer<typeof postModerationActionSchema>;
