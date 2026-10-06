import { prisma } from "@/lib/prisma";
import { Role, ThreadCategory, OfferingTeacherRole } from "@prisma/client";
import { ForbiddenError, NotFoundError } from "@/lib/auth/errors";
import { assertOfferingWritable } from "@/lib/auth/guards";
import { discussionRateLimiter } from "@/lib/rate-limiter";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  notifyNewDiscussionThread,
  notifyThreadReply,
} from "@/lib/notifications";
import {
  CreateThreadInput,
  CreatePostInput,
  createThreadSchema,
  createPostSchema,
} from "@/lib/validations/discussion";

export interface DiscussionAccessContext {
  isModerator: boolean;
  isTeacher: boolean;
  isStudent: boolean;
  role: Role;
  taRole?: OfferingTeacherRole;
  offeringId: string;
}

/**
 * Asserts that the caller has access to the discussion forum for this offering:
 * - SUPER_ADMIN: full moderator access
 * - DEPT_ADMIN: moderator access if department matches offering
 * - TEACHER: instructor or TA assigned to the offering -> moderator access
 * - STUDENT: enrolled actively in a section of a PUBLISHED offering -> student access
 */
export async function assertCanAccessDiscussion(
  userId: string,
  userRole: Role,
  offeringId: string
): Promise<DiscussionAccessContext> {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      course: {
        select: {
          id: true,
          code: true,
          departmentId: true,
        },
      },
      offeringTeachers: {
        where: { userId },
        select: {
          role: true,
        },
      },
      sections: {
        where: {
          enrollments: {
            some: {
              studentId: userId,
              status: "ACTIVE",
            },
          },
        },
        select: { id: true },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  if (userRole === Role.SUPER_ADMIN) {
    return {
      isModerator: true,
      isTeacher: true,
      isStudent: false,
      role: Role.SUPER_ADMIN,
      offeringId,
    };
  }

  if (userRole === Role.DEPT_ADMIN) {
    const adminProfile = await prisma.teacherProfile.findUnique({
      where: { userId },
      select: { departmentId: true },
    });
    if (adminProfile?.departmentId === offering.course.departmentId) {
      return {
        isModerator: true,
        isTeacher: true,
        isStudent: false,
        role: Role.DEPT_ADMIN,
        offeringId,
      };
    }
    throw new ForbiddenError(
      "Department Administrators may only access discussions in their own department."
    );
  }

  if (userRole === Role.TEACHER) {
    const teacherAssignment = offering.offeringTeachers[0];
    if (teacherAssignment) {
      return {
        isModerator: true,
        isTeacher: true,
        isStudent: false,
        role: Role.TEACHER,
        taRole: teacherAssignment.role,
        offeringId,
      };
    }
    throw new ForbiddenError(
      "You are not assigned to instruct or assist in this course offering."
    );
  }

  if (userRole === Role.STUDENT) {
    if (offering.status !== "PUBLISHED") {
      throw new ForbiddenError(
        "Discussions are not available for unpublished course offerings."
      );
    }
    const isEnrolled = offering.sections.length > 0;
    if (!isEnrolled) {
      throw new ForbiddenError(
        "You are not actively enrolled in this course offering."
      );
    }
    return {
      isModerator: false,
      isTeacher: false,
      isStudent: true,
      role: Role.STUDENT,
      offeringId,
    };
  }

  throw new ForbiddenError("You are not authorized to view this discussion forum.");
}

export interface SerializedAuthor {
  id: string;
  name: string;
  role: Role;
}

export interface SerializedPost {
  id: string;
  threadId: string;
  parentId: string | null;
  content: string;
  isAccepted: boolean;
  isAnonymous: boolean;
  createdAt: string;
  updatedAt: string;
  authorId: string | null;
  author: SerializedAuthor | null;
  replies?: SerializedPost[];
}

export interface SerializedThreadListItem {
  id: string;
  offeringId: string;
  title: string;
  content: string;
  category: ThreadCategory;
  isAnonymous: boolean;
  isLocked: boolean;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  latestActivityAt: string;
  authorId: string | null;
  author: SerializedAuthor | null;
  replyCount: number;
  isAnswered: boolean;
}

export interface SerializedThreadDetail extends SerializedThreadListItem {
  posts: SerializedPost[];
}

/**
 * Serializes thread or post author identity based strictly on viewer authorization:
 * - Teachers, TAs, and Admins (moderators) receive full identity (id and name).
 * - Students receive null authorId and null author for anonymous items.
 */
function serializeAuthorIdentity(
  author: { id: string; name: string; role: Role },
  isAnonymous: boolean,
  viewerIsModerator: boolean
): { authorId: string | null; author: SerializedAuthor | null } {
  if (isAnonymous && !viewerIsModerator) {
    return {
      authorId: null,
      author: null,
    };
  }

  return {
    authorId: author.id,
    author: {
      id: author.id,
      name: author.name,
      role: author.role,
    },
  };
}

export interface GetThreadsOptions {
  offeringId: string;
  userId: string;
  userRole: Role;
  category?: ThreadCategory | "ALL";
  unansweredOnly?: boolean;
  search?: string;
  sortBy?: "newest" | "activity";
}

/**
 * Fetches and filters threads for an offering with strict authorization and anonymization.
 */
export async function getOfferingThreads({
  offeringId,
  userId,
  userRole,
  category,
  unansweredOnly,
  search,
  sortBy = "activity",
}: GetThreadsOptions): Promise<SerializedThreadListItem[]> {
  const access = await assertCanAccessDiscussion(userId, userRole, offeringId);

  const whereClause: {
    offeringId: string;
    deletedAt: null;
    category?: ThreadCategory;
    title?: { contains: string; mode: "insensitive" };
  } = {
    offeringId,
    deletedAt: null,
  };

  if (category && category !== "ALL") {
    whereClause.category = category;
  }

  if (search && search.trim().length > 0) {
    whereClause.title = {
      contains: search.trim(),
      mode: "insensitive",
    };
  }

  const rawThreads = await prisma.thread.findMany({
    where: whereClause,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      posts: {
        where: { deletedAt: null },
        select: {
          id: true,
          isAccepted: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const processedList: SerializedThreadListItem[] = rawThreads.map((thread) => {
    const isAnswered = thread.posts.some((p) => p.isAccepted);
    const replyCount = thread.posts.length;
    const latestPostDate = thread.posts[0]?.createdAt;
    const latestActivityAt = latestPostDate
      ? (latestPostDate > thread.updatedAt ? latestPostDate : thread.updatedAt)
      : thread.updatedAt;

    const identity = serializeAuthorIdentity(
      thread.author,
      thread.isAnonymous,
      access.isModerator
    );

    return {
      id: thread.id,
      offeringId: thread.offeringId,
      title: thread.title,
      content: thread.content,
      category: thread.category,
      isAnonymous: thread.isAnonymous,
      isLocked: thread.isLocked,
      isPinned: thread.isPinned,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      latestActivityAt: latestActivityAt.toISOString(),
      authorId: identity.authorId,
      author: identity.author,
      replyCount,
      isAnswered,
    };
  });

  // Filter unanswered if requested
  let filtered = processedList;
  if (unansweredOnly) {
    filtered = processedList.filter((t) => !t.isAnswered);
  }

  // Sorting: Pinned threads always come first.
  // Then sort by newest or latest activity.
  filtered.sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }

    if (sortBy === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }

    // Default: latest activity
    return new Date(b.latestActivityAt).getTime() - new Date(a.latestActivityAt).getTime();
  });

  return filtered;
}

/**
 * Fetches a single thread with its nested replies, strictly sanitized and anonymized.
 */
export async function getThreadDetail(
  threadId: string,
  userId: string,
  userRole: Role
): Promise<SerializedThreadDetail> {
  const rawThread = await prisma.thread.findUnique({
    where: { id: threadId },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      posts: {
        where: { deletedAt: null },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!rawThread || rawThread.deletedAt !== null) {
    throw new NotFoundError("Thread not found or has been deleted.");
  }

  const access = await assertCanAccessDiscussion(
    userId,
    userRole,
    rawThread.offeringId
  );

  const isAnswered = rawThread.posts.some((p) => p.isAccepted);
  const replyCount = rawThread.posts.length;
  const latestPostDate = rawThread.posts[rawThread.posts.length - 1]?.createdAt;
  const latestActivityAt = latestPostDate
    ? (latestPostDate > rawThread.updatedAt ? latestPostDate : rawThread.updatedAt)
    : rawThread.updatedAt;

  const threadIdentity = serializeAuthorIdentity(
    rawThread.author,
    rawThread.isAnonymous,
    access.isModerator
  );

  // Group posts by parentId to establish one level of nesting
  const rootPosts: SerializedPost[] = [];
  const repliesByParentId = new Map<string, SerializedPost[]>();

  for (const post of rawThread.posts) {
    const postIdentity = serializeAuthorIdentity(
      post.author,
      post.isAnonymous,
      access.isModerator
    );

    const serializedPost: SerializedPost = {
      id: post.id,
      threadId: post.threadId,
      parentId: post.parentId,
      content: post.content,
      isAccepted: post.isAccepted,
      isAnonymous: post.isAnonymous,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      authorId: postIdentity.authorId,
      author: postIdentity.author,
      replies: [],
    };

    if (!post.parentId) {
      rootPosts.push(serializedPost);
    } else {
      const existing = repliesByParentId.get(post.parentId) || [];
      existing.push(serializedPost);
      repliesByParentId.set(post.parentId, existing);
    }
  }

  // Attach replies to root posts
  for (const root of rootPosts) {
    root.replies = repliesByParentId.get(root.id) || [];
  }

  // If an accepted reply exists among root posts, place it at the top
  rootPosts.sort((a, b) => {
    if (a.isAccepted !== b.isAccepted) {
      return a.isAccepted ? -1 : 1;
    }
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return {
    id: rawThread.id,
    offeringId: rawThread.offeringId,
    title: rawThread.title,
    content: rawThread.content,
    category: rawThread.category,
    isAnonymous: rawThread.isAnonymous,
    isLocked: rawThread.isLocked,
    isPinned: rawThread.isPinned,
    createdAt: rawThread.createdAt.toISOString(),
    updatedAt: rawThread.updatedAt.toISOString(),
    latestActivityAt: latestActivityAt.toISOString(),
    authorId: threadIdentity.authorId,
    author: threadIdentity.author,
    replyCount,
    isAnswered,
    posts: rootPosts,
  };
}

/**
 * Creates a new discussion thread.
 * Rate limit: 5 posts per minute per user.
 * Sanitizes rich text content.
 * Generates ActivityEvent and notifies course instructors.
 */
export async function createDiscussionThread(
  input: CreateThreadInput,
  caller: { id: string; role: Role }
) {
  const validated = createThreadSchema.parse(input);

  // Assert user is enrolled or teacher
  await assertCanAccessDiscussion(caller.id, caller.role, validated.offeringId);
  await assertOfferingWritable(validated.offeringId);

  // Enforce rate limiting: 5 posts per minute
  const rateLimitStatus = await discussionRateLimiter.check(caller.id);
  if (!rateLimitStatus.allowed) {
    throw new ForbiddenError(
      `Rate limit exceeded. You may post at most 5 times per minute. Please try again in ${rateLimitStatus.retryAfterSeconds} seconds.`
    );
  }
  await discussionRateLimiter.consume(caller.id);

  // Sanitize content
  const cleanContent = sanitizeHtml(validated.content);

  const thread = await prisma.thread.create({
    data: {
      offeringId: validated.offeringId,
      authorId: caller.id,
      title: validated.title,
      content: cleanContent,
      category: validated.category,
      isAnonymous: validated.isAnonymous,
    },
    include: {
      offering: {
        include: {
          course: { select: { code: true } },
          offeringTeachers: { select: { userId: true } },
        },
      },
    },
  });

  // Record ActivityEvent
  await prisma.activityEvent.create({
    data: {
      userId: caller.id,
      offeringId: validated.offeringId,
      type: "THREAD_CREATED",
    },
  });

  // Send ACADEMIC notifications to instructors (excluding the author if author is a teacher)
  const instructorIds = thread.offering.offeringTeachers
    .map((t) => t.userId)
    .filter((id) => id !== caller.id);

  if (instructorIds.length > 0) {
    await notifyNewDiscussionThread({
      threadId: thread.id,
      offeringId: thread.offeringId,
      courseCode: thread.offering.course.code,
      threadTitle: thread.title,
      category: thread.category,
      instructorUserIds: instructorIds,
    });
  }

  return thread;
}

/**
 * Creates a reply (post) to a thread or parent reply.
 * Rejects if thread is locked or deleted.
 * Rate limit: 5 posts per minute per user.
 * Sanitizes rich text content.
 * Generates ActivityEvent and notifies thread author.
 */
export async function createDiscussionPost(
  input: CreatePostInput,
  caller: { id: string; role: Role; name?: string }
) {
  const validated = createPostSchema.parse(input);

  const thread = await prisma.thread.findUnique({
    where: { id: validated.threadId },
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  if (!thread || thread.deletedAt !== null) {
    throw new NotFoundError("Discussion thread not found or has been deleted.");
  }

  if (thread.isLocked) {
    throw new ForbiddenError(
      "This discussion thread is locked. New replies cannot be submitted."
    );
  }

  await assertCanAccessDiscussion(caller.id, caller.role, thread.offeringId);
  await assertOfferingWritable(thread.offeringId);

  // Support 1 level of nesting: If parentId is specified, ensure it resolves to a root post
  let targetParentId: string | null = null;
  if (validated.parentId) {
    const parentPost = await prisma.post.findUnique({
      where: { id: validated.parentId },
      select: { id: true, threadId: true, parentId: true, deletedAt: true },
    });

    if (!parentPost || parentPost.threadId !== thread.id || parentPost.deletedAt !== null) {
      throw new NotFoundError("Parent post not found or has been deleted.");
    }

    // If parent is already a reply, collapse into its parent to maintain strictly 1 level of nesting
    targetParentId = parentPost.parentId ? parentPost.parentId : parentPost.id;
  }

  // Rate limiting check
  const rateLimitStatus = await discussionRateLimiter.check(caller.id);
  if (!rateLimitStatus.allowed) {
    throw new ForbiddenError(
      `Rate limit exceeded. You may post at most 5 times per minute. Please try again in ${rateLimitStatus.retryAfterSeconds} seconds.`
    );
  }
  await discussionRateLimiter.consume(caller.id);

  const cleanContent = sanitizeHtml(validated.content);

  const post = await prisma.post.create({
    data: {
      threadId: thread.id,
      parentId: targetParentId,
      authorId: caller.id,
      content: cleanContent,
      isAnonymous: validated.isAnonymous,
    },
  });

  // Touch thread's updatedAt
  await prisma.thread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() },
  });

  // Record ActivityEvent
  await prisma.activityEvent.create({
    data: {
      userId: caller.id,
      offeringId: thread.offeringId,
      type: "POST_CREATED",
    },
  });

  // Notify thread author (GENERAL) if replier is not the author
  if (thread.authorId !== caller.id) {
    const replierDisplayName = validated.isAnonymous
      ? "Anonymous student"
      : caller.name || "A course participant";

    await notifyThreadReply({
      threadId: thread.id,
      offeringId: thread.offeringId,
      threadTitle: thread.title,
      threadAuthorId: thread.authorId,
      replierName: replierDisplayName,
    });
  }

  return post;
}

/**
 * Marks a post as accepted answer.
 * Only the thread author or a course instructor can mark/unmark accepted answers.
 * Locked or deleted threads/posts cannot be modified.
 */
export async function togglePostAccepted(
  postId: string,
  caller: { id: string; role: Role }
) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      thread: {
        select: {
          id: true,
          offeringId: true,
          authorId: true,
          isLocked: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!post || post.deletedAt !== null) {
    throw new NotFoundError("Reply not found or has been deleted.");
  }

  if (post.thread.deletedAt !== null) {
    throw new ForbiddenError("Cannot modify replies in a deleted thread.");
  }

  if (post.thread.isLocked) {
    throw new ForbiddenError("Cannot modify accepted status in a locked thread.");
  }

  const access = await assertCanAccessDiscussion(
    caller.id,
    caller.role,
    post.thread.offeringId
  );

  const isThreadAuthor = post.thread.authorId === caller.id;
  const isAuthorized = isThreadAuthor || access.isModerator;

  if (!isAuthorized) {
    throw new ForbiddenError(
      "Only the thread author or an instructor can mark an answer as accepted."
    );
  }

  const willBeAccepted = !post.isAccepted;

  // If accepting this post, clear any other accepted posts in this thread first
  if (willBeAccepted) {
    await prisma.post.updateMany({
      where: {
        threadId: post.threadId,
        isAccepted: true,
      },
      data: { isAccepted: false },
    });
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { isAccepted: willBeAccepted },
  });

  return updated;
}

/**
 * Locks or unlocks a thread. Moderation action for teachers and admins.
 * Writes an AuditLog entry.
 */
export async function setThreadLock(
  threadId: string,
  lock: boolean,
  caller: { id: string; role: Role },
  clientIp?: string
) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      offeringId: true,
      title: true,
      isLocked: true,
      deletedAt: true,
    },
  });

  if (!thread || thread.deletedAt !== null) {
    throw new NotFoundError("Thread not found or has been deleted.");
  }

  const access = await assertCanAccessDiscussion(
    caller.id,
    caller.role,
    thread.offeringId
  );

  if (!access.isModerator) {
    throw new ForbiddenError("Only instructors and administrators can lock or unlock threads.");
  }

  const updated = await prisma.thread.update({
    where: { id: threadId },
    data: { isLocked: lock },
  });

  // AuditLog: THREAD_LOCKED or THREAD_UNLOCKED
  await prisma.auditLog.create({
    data: {
      action: lock ? "THREAD_LOCKED" : "THREAD_UNLOCKED",
      objectType: "Thread",
      objectId: thread.id,
      userId: caller.id,
      description: `Thread "${thread.title}" was ${lock ? "locked" : "unlocked"} by moderator.`,
      ip: clientIp,
    },
  });

  return updated;
}

/**
 * Pins or unpins a thread. Moderation action for teachers and admins.
 * Writes an AuditLog entry.
 */
export async function setThreadPin(
  threadId: string,
  pin: boolean,
  caller: { id: string; role: Role },
  clientIp?: string
) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      offeringId: true,
      title: true,
      isPinned: true,
      deletedAt: true,
    },
  });

  if (!thread || thread.deletedAt !== null) {
    throw new NotFoundError("Thread not found or has been deleted.");
  }

  const access = await assertCanAccessDiscussion(
    caller.id,
    caller.role,
    thread.offeringId
  );

  if (!access.isModerator) {
    throw new ForbiddenError("Only instructors and administrators can pin or unpin threads.");
  }

  const updated = await prisma.thread.update({
    where: { id: threadId },
    data: { isPinned: pin },
  });

  await prisma.auditLog.create({
    data: {
      action: pin ? "THREAD_PINNED" : "THREAD_UNPINNED",
      objectType: "Thread",
      objectId: thread.id,
      userId: caller.id,
      description: `Thread "${thread.title}" was ${pin ? "pinned" : "unpinned"} by moderator.`,
      ip: clientIp,
    },
  });

  return updated;
}

/**
 * Soft deletes a thread. Moderation action for teachers/admins or the thread author.
 * Writes an AuditLog entry.
 */
export async function deleteThread(
  threadId: string,
  caller: { id: string; role: Role },
  clientIp?: string
) {
  const thread = await prisma.thread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      offeringId: true,
      authorId: true,
      title: true,
      deletedAt: true,
    },
  });

  if (!thread || thread.deletedAt !== null) {
    throw new NotFoundError("Thread not found or already deleted.");
  }

  const access = await assertCanAccessDiscussion(
    caller.id,
    caller.role,
    thread.offeringId
  );

  const isAuthor = thread.authorId === caller.id;
  if (!access.isModerator && !isAuthor) {
    throw new ForbiddenError("You are not authorized to delete this discussion thread.");
  }

  const updated = await prisma.thread.update({
    where: { id: threadId },
    data: { deletedAt: new Date() },
  });

  // AuditLog for delete
  await prisma.auditLog.create({
    data: {
      action: "THREAD_DELETED",
      objectType: "Thread",
      objectId: thread.id,
      userId: caller.id,
      description: `Thread "${thread.title}" was soft deleted.`,
      ip: clientIp,
    },
  });

  return updated;
}

/**
 * Soft deletes a post/reply. Moderation action for teachers/admins or the post author.
 * Writes an AuditLog entry.
 */
export async function deletePost(
  postId: string,
  caller: { id: string; role: Role },
  clientIp?: string
) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      thread: {
        select: {
          id: true,
          offeringId: true,
          title: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!post || post.deletedAt !== null) {
    throw new NotFoundError("Post not found or already deleted.");
  }

  if (post.thread.deletedAt !== null) {
    throw new ForbiddenError("Cannot modify posts in a deleted thread.");
  }

  const access = await assertCanAccessDiscussion(
    caller.id,
    caller.role,
    post.thread.offeringId
  );

  const isAuthor = post.authorId === caller.id;
  if (!access.isModerator && !isAuthor) {
    throw new ForbiddenError("You are not authorized to delete this reply.");
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { deletedAt: new Date() },
  });

  // AuditLog for delete
  await prisma.auditLog.create({
    data: {
      action: "POST_DELETED",
      objectType: "Post",
      objectId: post.id,
      userId: caller.id,
      description: `Post in thread "${post.thread.title}" was soft deleted.`,
      ip: clientIp,
    },
  });

  return updated;
}
