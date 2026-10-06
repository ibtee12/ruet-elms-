"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser, requireRole } from "@/lib/auth/session";
import { getClientIp } from "@/lib/utils/ip";
import { Role } from "@prisma/client";
import {
  createDiscussionThread,
  createDiscussionPost,
  togglePostAccepted,
  setThreadLock,
  setThreadPin,
  deleteThread,
  deletePost,
} from "@/services/discussions";
import {
  CreateThreadInput,
  CreatePostInput,
} from "@/lib/validations/discussion";

async function getSafeClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return getClientIp(headerList);
  } catch {
    return "127.0.0.1";
  }
}

export async function createThreadAction(input: CreateThreadInput) {
  const caller = await requireUser();
  const thread = await createDiscussionThread(input, caller);

  revalidatePath(`/courses/${input.offeringId}/discussions`);
  revalidatePath(`/teach/${input.offeringId}/discussions`);

  return { success: true, thread };
}

export async function createPostAction(input: CreatePostInput, offeringId?: string) {
  const caller = await requireUser();
  const post = await createDiscussionPost(input, caller);

  if (offeringId) {
    revalidatePath(`/courses/${offeringId}/discussions`);
    revalidatePath(`/teach/${offeringId}/discussions`);
    revalidatePath(`/courses/${offeringId}/discussions/${input.threadId}`);
    revalidatePath(`/teach/${offeringId}/discussions/${input.threadId}`);
  }

  return { success: true, post };
}

export async function togglePostAcceptedAction(postId: string, offeringId?: string, threadId?: string) {
  const caller = await requireUser();
  const post = await togglePostAccepted(postId, caller);

  if (offeringId && threadId) {
    revalidatePath(`/courses/${offeringId}/discussions/${threadId}`);
    revalidatePath(`/teach/${offeringId}/discussions/${threadId}`);
  }

  return { success: true, post };
}

export async function lockThreadAction(
  threadId: string,
  lock: boolean,
  offeringId?: string
) {
  const caller = await requireRole(Role.TEACHER, Role.DEPT_ADMIN, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();
  const updated = await setThreadLock(threadId, lock, caller, clientIp);

  if (offeringId) {
    revalidatePath(`/courses/${offeringId}/discussions`);
    revalidatePath(`/teach/${offeringId}/discussions`);
    revalidatePath(`/courses/${offeringId}/discussions/${threadId}`);
    revalidatePath(`/teach/${offeringId}/discussions/${threadId}`);
  }

  return { success: true, thread: updated };
}

export async function pinThreadAction(
  threadId: string,
  pin: boolean,
  offeringId?: string
) {
  const caller = await requireRole(Role.TEACHER, Role.DEPT_ADMIN, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();
  const updated = await setThreadPin(threadId, pin, caller, clientIp);

  if (offeringId) {
    revalidatePath(`/courses/${offeringId}/discussions`);
    revalidatePath(`/teach/${offeringId}/discussions`);
    revalidatePath(`/courses/${offeringId}/discussions/${threadId}`);
    revalidatePath(`/teach/${offeringId}/discussions/${threadId}`);
  }

  return { success: true, thread: updated };
}

export async function deleteThreadAction(threadId: string, offeringId?: string) {
  const caller = await requireUser();
  const clientIp = await getSafeClientIp();
  await deleteThread(threadId, caller, clientIp);

  if (offeringId) {
    revalidatePath(`/courses/${offeringId}/discussions`);
    revalidatePath(`/teach/${offeringId}/discussions`);
  }

  return { success: true };
}

export async function deletePostAction(
  postId: string,
  offeringId?: string,
  threadId?: string
) {
  const caller = await requireUser();
  const clientIp = await getSafeClientIp();
  await deletePost(postId, caller, clientIp);

  if (offeringId && threadId) {
    revalidatePath(`/courses/${offeringId}/discussions/${threadId}`);
    revalidatePath(`/teach/${offeringId}/discussions/${threadId}`);
  }

  return { success: true };
}
