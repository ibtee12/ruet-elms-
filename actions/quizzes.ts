"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/session";
import { getClientIp } from "@/lib/utils/ip";
import { Role } from "@prisma/client";
import {
  createQuiz,
  updateQuiz,
  deleteQuiz,
  CreateQuizInput,
  UpdateQuizInput,
} from "@/services/quizzes";

async function getSafeClientIp(): Promise<string> {
  try {
    const headerList = await headers();
    return getClientIp(headerList);
  } catch {
    return "127.0.0.1";
  }
}

export async function createQuizAction(
  offeringId: string,
  input: CreateQuizInput
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const quiz = await createQuiz(
    offeringId,
    caller.id,
    caller.role,
    input,
    clientIp
  );

  revalidatePath(`/teach/${offeringId}/quizzes`);
  return { success: true, quiz };
}

export async function updateQuizAction(
  quizId: string,
  offeringId: string,
  input: UpdateQuizInput
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const quiz = await updateQuiz(
    quizId,
    offeringId,
    caller.id,
    caller.role,
    input,
    clientIp
  );

  revalidatePath(`/teach/${offeringId}/quizzes`);
  revalidatePath(`/teach/${offeringId}/quizzes/${quizId}`);
  return { success: true, quiz };
}

export async function deleteQuizAction(
  quizId: string,
  offeringId: string
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  await deleteQuiz(
    quizId,
    offeringId,
    caller.id,
    caller.role,
    clientIp
  );

  revalidatePath(`/teach/${offeringId}/quizzes`);
  return { success: true };
}

export async function toggleQuizPublishAction(
  quizId: string,
  offeringId: string,
  publish: boolean
) {
  const caller = await requireRole(Role.TEACHER, Role.SUPER_ADMIN);
  const clientIp = await getSafeClientIp();

  const quiz = await updateQuiz(
    quizId,
    offeringId,
    caller.id,
    caller.role,
    { published: publish },
    clientIp
  );

  revalidatePath(`/teach/${offeringId}/quizzes`);
  revalidatePath(`/teach/${offeringId}/quizzes/${quizId}`);
  return { success: true, quiz };
}
