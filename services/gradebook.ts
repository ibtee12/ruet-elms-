import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, SubmissionStatus, QuizGradingMethod } from "@prisma/client";
import { assertOfferingTeacher, assertEnrolled } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/auth/errors";
import { calcFinalMarks } from "@/lib/grading";
import {
  calcStudentTotals,
  calcClassAverages,
  GradebookAssignmentMeta,
  GradebookStudentCellInput,
} from "@/lib/gradebook";
import { calcQuizGrade } from "@/lib/quiz-scoring";

export interface GradebookAssignmentColumn extends GradebookAssignmentMeta {
  deadline: Date;
  latePenaltyPercent: number;
  type?: "ASSIGNMENT" | "QUIZ";
  gradingMethod?: QuizGradingMethod;
}

export interface GradebookCellData extends GradebookStudentCellInput {
  submissionId: string | null;
  status: "not_submitted" | "submitted" | "submitted_late" | "graded";
  rawMarks: number | null;
  finalMarks: number | null;
  isLate: boolean;
  lateDeduction: number;
  submittedAt: Date | null;
  feedback: string | null;
}

export interface GradebookStudentRowData {
  studentId: string;
  name: string;
  email: string;
  roll: string | null;
  sectionName: string;
  cells: Record<string, GradebookCellData>;
  totalFinalMarks: number;
  totalMaxMarks: number;
  percentage: number | null;
  hasLate: boolean;
  hasMissing: boolean;
  isBelow40: boolean;
}

export interface TeacherGradebookData {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  isArchived: boolean;
  treatMissingAsZero: boolean;
  showClassAverageToStudents: boolean;
  assignments: GradebookAssignmentColumn[];
  students: GradebookStudentRowData[];
  classAveragePercentage: number | null;
  assignmentAverages: Record<
    string,
    {
      averageMarks: number | null;
      averagePercentage: number | null;
      submissionCount: number;
      gradedCount: number;
    }
  >;
}

/**
 * Loads the gradebook matrix for teachers.
 * Optimized to load with a small, constant number of queries (O(1) queries):
 * 1. CourseOffering
 * 2. Published Assignments
 * 3. Active Enrollments (with student profiles)
 * 4. Submissions for published assignments
 */
export async function getTeacherGradebookData(
  offeringId: string,
  caller: { id: string; role: Role }
): Promise<TeacherGradebookData> {
  if (caller.role !== Role.SUPER_ADMIN) {
    await assertOfferingTeacher(caller.id, offeringId, { allowTA: true });
  }

  // 1. Fetch offering
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      status: true,
      term: true,
      academicYear: true,
      treatMissingAsZero: true,
      showClassAverageToStudents: true,
      course: {
        select: {
          code: true,
          title: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  // 2. Fetch published assignments (quizzes intentionally excluded per prompt)
  const assignmentsData = await prisma.assignment.findMany({
    where: {
      offeringId,
      published: true,
    },
    select: {
      id: true,
      title: true,
      maxMarks: true,
      deadline: true,
      latePenaltyPercent: true,
    },
    orderBy: {
      deadline: "asc",
    },
  });

  const assignments: GradebookAssignmentColumn[] = assignmentsData.map((a) => ({
    id: a.id,
    title: a.title,
    maxMarks: Number(a.maxMarks),
    deadline: a.deadline,
    latePenaltyPercent: a.latePenaltyPercent,
    type: "ASSIGNMENT",
  }));

  const assignmentIds = assignments.map((a) => a.id);

  // 2b. Fetch published quizzes
  const quizzesData = await prisma.quiz.findMany({
    where: {
      offeringId,
      published: true,
    },
    select: {
      id: true,
      title: true,
      endAt: true,
      gradingMethod: true,
      questions: {
        select: { marks: true },
      },
    },
    orderBy: {
      endAt: "asc",
    },
  });

  const quizColumns: GradebookAssignmentColumn[] = quizzesData.map((q) => ({
    id: q.id,
    title: q.title,
    maxMarks: q.questions.reduce((sum, item) => sum + Number(item.marks), 0),
    deadline: q.endAt,
    latePenaltyPercent: 0,
    type: "QUIZ",
    gradingMethod: q.gradingMethod,
  }));

  const quizIds = quizColumns.map((q) => q.id);

  // Fetch all submitted attempts for published quizzes
  const quizAttempts =
    quizIds.length > 0
      ? await prisma.quizAttempt.findMany({
          where: {
            quizId: { in: quizIds },
            submittedAt: { not: null },
          },
          select: {
            id: true,
            quizId: true,
            studentId: true,
            score: true,
            submittedAt: true,
          },
        })
      : [];

  const studentQuizMap = new Map<string, typeof quizAttempts>();
  for (const qa of quizAttempts) {
    const key = `${qa.quizId}_${qa.studentId}`;
    const list = studentQuizMap.get(key) || [];
    list.push(qa);
    studentQuizMap.set(key, list);
  }

  const allColumns = [...assignments, ...quizColumns];

  // 3. Fetch all active enrollments
  const enrollments = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      section: {
        offeringId,
      },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: {
            select: {
              studentId: true,
            },
          },
        },
      },
      section: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { section: { name: "asc" } },
      { student: { name: "asc" } },
    ],
  });

  // 4. Fetch all submissions for published assignments in one query
  const submissions =
    assignmentIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            assignmentId: { in: assignmentIds },
          },
          include: {
            grade: {
              select: {
                marks: true,
                feedback: true,
              },
            },
            versions: {
              orderBy: { versionNo: "desc" },
              take: 1,
              select: {
                id: true,
                versionNo: true,
                isLate: true,
                submittedAt: true,
              },
            },
          },
        })
      : [];

  // Index submissions by `${assignmentId}_${studentId}`
  const subMap = new Map<string, (typeof submissions)[0]>();
  for (const s of submissions) {
    subMap.set(`${s.assignmentId}_${s.studentId}`, s);
  }

  // Assemble student rows
  const students: GradebookStudentRowData[] = enrollments.map((enr) => {
    const student = enr.student;
    const cells: Record<string, GradebookCellData> = {};
    let hasLate = false;
    let hasMissing = false;

    for (const a of assignments) {
      const sub = subMap.get(`${a.id}_${student.id}`) || null;
      const latestVer = sub?.versions[0] || null;
      const isLate = latestVer?.isLate ?? (sub?.status === SubmissionStatus.LATE);
      const isMissing = !sub;

      if (isMissing) {
        hasMissing = true;
      }
      if (isLate) {
        hasLate = true;
      }

      let status: GradebookCellData["status"] = "not_submitted";
      let rawMarks: number | null = null;
      let finalMarks: number | null = null;
      let lateDeduction = 0;

      if (sub) {
        if (sub.grade) {
          status = "graded";
          rawMarks = Number(sub.grade.marks);
          finalMarks = calcFinalMarks(
            rawMarks,
            a.maxMarks,
            isLate,
            a.latePenaltyPercent
          );
          lateDeduction = Math.round((rawMarks - finalMarks) * 100) / 100;
        } else if (isLate) {
          status = "submitted_late";
        } else {
          status = "submitted";
        }
      }

      cells[a.id] = {
        assignmentId: a.id,
        submissionId: sub?.id || null,
        status,
        rawMarks,
        finalMarks,
        isLate,
        lateDeduction,
        isMissing,
        latePenaltyPercent: a.latePenaltyPercent,
        submittedAt: latestVer?.submittedAt || sub?.createdAt || null,
        feedback: sub?.grade?.feedback || null,
      };
    }

    // Process published quizzes for this student
    for (const q of quizColumns) {
      const attempts = studentQuizMap.get(`${q.id}_${student.id}`) || [];
      const effectiveScore = calcQuizGrade(
        attempts.map((att) => ({ score: Number(att.score) || 0, submittedAt: att.submittedAt! })),
        q.gradingMethod
      );
      const isAttempted = attempts.length > 0 && effectiveScore !== null;
      if (!isAttempted) {
        hasMissing = true;
      }

      cells[q.id] = {
        assignmentId: q.id,
        submissionId: attempts[0]?.id || null,
        status: isAttempted ? "graded" : "not_submitted",
        rawMarks: effectiveScore,
        finalMarks: effectiveScore,
        isLate: false,
        lateDeduction: 0,
        isMissing: !isAttempted,
        latePenaltyPercent: 0,
        submittedAt: attempts[0]?.submittedAt || null,
        feedback: null,
      };
    }

    const cellsList = Object.values(cells);
    const totals = calcStudentTotals(
      cellsList,
      allColumns,
      offering.treatMissingAsZero
    );

    const isBelow40 = totals.percentage !== null && totals.percentage < 40;

    return {
      studentId: student.id,
      name: student.name,
      email: student.email,
      roll: student.studentProfile?.studentId || null,
      sectionName: enr.section.name,
      cells,
      totalFinalMarks: totals.totalFinalMarks,
      totalMaxMarks: totals.totalMaxMarks,
      percentage: totals.percentage,
      hasLate,
      hasMissing,
      isBelow40,
    };
  });

  // Calculate class-wide metrics
  const classAverages = calcClassAverages(
    students.map((s) => ({
      percentage: s.percentage,
      cells: s.cells,
    })),
    allColumns
  );

  return {
    offeringId: offering.id,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    isArchived: offering.status === CourseOfferingStatus.ARCHIVED,
    treatMissingAsZero: offering.treatMissingAsZero,
    showClassAverageToStudents: offering.showClassAverageToStudents,
    assignments: allColumns,
    students,
    classAveragePercentage: classAverages.classAveragePercentage,
    assignmentAverages: classAverages.assignmentAverages,
  };
}

export interface StudentAssignmentGradeRow {
  assignmentId: string;
  assignmentTitle: string;
  deadline: Date;
  maxMarks: number;
  latePenaltyPercent: number;
  submissionId: string | null;
  status: "not_submitted" | "submitted" | "submitted_late" | "graded";
  isLate: boolean;
  submittedAt: Date | null;
  rawMarks: number | null;
  finalMarks: number | null;
  lateDeduction: number;
  feedback: string | null;
  classAverageMarks: number | null;
  type?: "ASSIGNMENT" | "QUIZ";
}

export interface StudentGradebookData {
  offeringId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  academicYear: string;
  treatMissingAsZero: boolean;
  showClassAverageToStudents: boolean;
  totalFinalMarks: number;
  totalMaxMarks: number;
  percentage: number | null;
  classAveragePercentage: number | null;
  assignments: StudentAssignmentGradeRow[];
}

/**
 * Loads the grades tab data for an enrolled student.
 * Students can only view their own performance.
 * Class average is only populated if the instructor has enabled showClassAverageToStudents.
 */
export async function getStudentGradebookData(
  offeringId: string,
  studentId: string
): Promise<StudentGradebookData> {
  // Ensure the student has an ACTIVE enrollment in a PUBLISHED offering
  await assertEnrolled(studentId, offeringId);

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: {
      id: true,
      term: true,
      academicYear: true,
      treatMissingAsZero: true,
      showClassAverageToStudents: true,
      course: {
        select: {
          code: true,
          title: true,
        },
      },
    },
  });

  if (!offering) {
    throw new NotFoundError("Course offering not found.");
  }

  // Published assignments
  const assignmentsData = await prisma.assignment.findMany({
    where: {
      offeringId,
      published: true,
    },
    select: {
      id: true,
      title: true,
      maxMarks: true,
      deadline: true,
      latePenaltyPercent: true,
    },
    orderBy: {
      deadline: "asc",
    },
  });

  const assignmentIds = assignmentsData.map((a) => a.id);

  // Student's submissions
  const studentSubmissions =
    assignmentIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            assignmentId: { in: assignmentIds },
            studentId,
          },
          include: {
            grade: {
              select: {
                marks: true,
                feedback: true,
              },
            },
            versions: {
              orderBy: { versionNo: "desc" },
              take: 1,
              select: {
                id: true,
                isLate: true,
                submittedAt: true,
              },
            },
          },
        })
      : [];

  const subMap = new Map<string, (typeof studentSubmissions)[0]>();
  for (const s of studentSubmissions) {
    subMap.set(s.assignmentId, s);
  }

  // Compute class averages only if instructor enabled it
  let classAveragePercentage: number | null = null;
  const assignmentAveragesMap: Record<string, number | null> = {};

  if (offering.showClassAverageToStudents && assignmentIds.length > 0) {
    // Single aggregate query for all grades in this offering's assignments
    const allGrades = await prisma.grade.findMany({
      where: {
        submission: {
          assignmentId: { in: assignmentIds },
          student: {
            enrollments: {
              some: {
                status: "ACTIVE",
                section: { offeringId },
              },
            },
          },
        },
      },
      select: {
        marks: true,
        submission: {
          select: {
            assignmentId: true,
            status: true,
            versions: {
              orderBy: { versionNo: "desc" },
              take: 1,
              select: { isLate: true },
            },
          },
        },
      },
    });

    const assignmentMetaMap = new Map<string, { maxMarks: number; latePenaltyPercent: number }>();
    for (const a of assignmentsData) {
      assignmentMetaMap.set(a.id, {
        maxMarks: Number(a.maxMarks),
        latePenaltyPercent: a.latePenaltyPercent,
      });
    }

    const marksByAssignment: Record<string, number[]> = {};
    for (const g of allGrades) {
      const aid = g.submission.assignmentId;
      const meta = assignmentMetaMap.get(aid);
      if (!meta) continue;

      const isLate =
        g.submission.versions[0]?.isLate ?? (g.submission.status === SubmissionStatus.LATE);
      const finalM = calcFinalMarks(
        Number(g.marks),
        meta.maxMarks,
        isLate,
        meta.latePenaltyPercent
      );

      if (!marksByAssignment[aid]) marksByAssignment[aid] = [];
      marksByAssignment[aid].push(finalM);
    }

    let totalAvgPctSum = 0;
    let countedAssignments = 0;

    for (const a of assignmentsData) {
      const scores = marksByAssignment[a.id] || [];
      if (scores.length > 0) {
        const avg = Math.round((scores.reduce((p, c) => p + c, 0) / scores.length) * 100) / 100;
        assignmentAveragesMap[a.id] = avg;
        if (Number(a.maxMarks) > 0) {
          totalAvgPctSum += (avg / Number(a.maxMarks)) * 100;
          countedAssignments += 1;
        }
      } else {
        assignmentAveragesMap[a.id] = null;
      }
    }

    if (countedAssignments > 0) {
      classAveragePercentage =
        Math.round((totalAvgPctSum / countedAssignments) * 100) / 100;
    }
  }

  // 2b. Fetch published quizzes for this student's offering
  const quizzesData = await prisma.quiz.findMany({
    where: {
      offeringId,
      published: true,
    },
    select: {
      id: true,
      title: true,
      endAt: true,
      gradingMethod: true,
      questions: {
        select: { marks: true },
      },
    },
    orderBy: {
      endAt: "asc",
    },
  });

  const quizIds = quizzesData.map((q) => q.id);

  // Student's submitted quiz attempts
  const studentQuizAttempts =
    quizIds.length > 0
      ? await prisma.quizAttempt.findMany({
          where: {
            quizId: { in: quizIds },
            studentId,
            submittedAt: { not: null },
          },
          select: {
            id: true,
            quizId: true,
            score: true,
            submittedAt: true,
          },
        })
      : [];

  const studentQuizMap = new Map<string, typeof studentQuizAttempts>();
  for (const qa of studentQuizAttempts) {
    const list = studentQuizMap.get(qa.quizId) || [];
    list.push(qa);
    studentQuizMap.set(qa.quizId, list);
  }

  // Quiz class averages (if enabled by teacher)
  const quizAveragesMap: Record<string, number | null> = {};
  if (offering.showClassAverageToStudents && quizIds.length > 0) {
    const allEnrolledQuizAttempts = await prisma.quizAttempt.findMany({
      where: {
        quizId: { in: quizIds },
        submittedAt: { not: null },
        student: {
          enrollments: {
            some: { status: "ACTIVE", section: { offeringId } },
          },
        },
      },
      select: {
        quizId: true,
        studentId: true,
        score: true,
        submittedAt: true,
      },
    });

    const enrolledAttemptsByQuizAndStudent = new Map<string, typeof allEnrolledQuizAttempts>();
    for (const att of allEnrolledQuizAttempts) {
      const key = `${att.quizId}_${att.studentId}`;
      const list = enrolledAttemptsByQuizAndStudent.get(key) || [];
      list.push(att);
      enrolledAttemptsByQuizAndStudent.set(key, list);
    }

    for (const q of quizzesData) {
      const studentIdsSeen = new Set<string>();
      const scores: number[] = [];
      for (const att of allEnrolledQuizAttempts.filter((a) => a.quizId === q.id)) {
        if (!studentIdsSeen.has(att.studentId)) {
          studentIdsSeen.add(att.studentId);
          const sAttempts = enrolledAttemptsByQuizAndStudent.get(`${q.id}_${att.studentId}`) || [];
          const sScore = calcQuizGrade(
            sAttempts.map((a) => ({ score: Number(a.score) || 0, submittedAt: a.submittedAt! })),
            q.gradingMethod
          );
          if (sScore !== null) {
            scores.push(sScore);
          }
        }
      }
      quizAveragesMap[q.id] =
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
          : null;
    }
  }

  // Build student assignment rows
  const cellInputs: GradebookStudentCellInput[] = [];
  const assignmentRows: StudentAssignmentGradeRow[] = assignmentsData.map((a) => {
    const sub = subMap.get(a.id) || null;
    const latestVer = sub?.versions[0] || null;
    const isLate = latestVer?.isLate ?? (sub?.status === SubmissionStatus.LATE);
    const isMissing = !sub;

    let status: StudentAssignmentGradeRow["status"] = "not_submitted";
    let rawMarks: number | null = null;
    let finalMarks: number | null = null;
    let lateDeduction = 0;

    if (sub) {
      if (sub.grade) {
        status = "graded";
        rawMarks = Number(sub.grade.marks);
        finalMarks = calcFinalMarks(
          rawMarks,
          Number(a.maxMarks),
          isLate,
          a.latePenaltyPercent
        );
        lateDeduction = Math.round((rawMarks - finalMarks) * 100) / 100;
      } else if (isLate) {
        status = "submitted_late";
      } else {
        status = "submitted";
      }
    }

    cellInputs.push({
      assignmentId: a.id,
      finalMarks,
      isMissing,
    });

    return {
      assignmentId: a.id,
      assignmentTitle: a.title,
      deadline: a.deadline,
      maxMarks: Number(a.maxMarks),
      latePenaltyPercent: a.latePenaltyPercent,
      submissionId: sub?.id || null,
      status,
      isLate,
      submittedAt: latestVer?.submittedAt || sub?.createdAt || null,
      rawMarks,
      finalMarks,
      lateDeduction,
      feedback: sub?.grade?.feedback || null,
      classAverageMarks: assignmentAveragesMap[a.id] ?? null,
      type: "ASSIGNMENT",
    };
  });

  // Build quiz rows
  const quizRows: StudentAssignmentGradeRow[] = quizzesData.map((q) => {
    const qMaxMarks = q.questions.reduce((sum, item) => sum + Number(item.marks), 0);
    const attempts = studentQuizMap.get(q.id) || [];
    const effectiveScore = calcQuizGrade(
      attempts.map((att) => ({ score: Number(att.score) || 0, submittedAt: att.submittedAt! })),
      q.gradingMethod
    );
    const hasAttempt = attempts.length > 0 && effectiveScore !== null;

    cellInputs.push({
      assignmentId: q.id,
      finalMarks: effectiveScore,
      isMissing: !hasAttempt,
    });

    return {
      assignmentId: q.id,
      assignmentTitle: q.title,
      deadline: q.endAt,
      maxMarks: qMaxMarks,
      latePenaltyPercent: 0,
      submissionId: attempts[0]?.id || null,
      status: hasAttempt ? "graded" : "not_submitted",
      isLate: false,
      submittedAt: attempts[0]?.submittedAt || null,
      rawMarks: effectiveScore,
      finalMarks: effectiveScore,
      lateDeduction: 0,
      feedback: null,
      classAverageMarks: quizAveragesMap[q.id] ?? null,
      type: "QUIZ",
    };
  });

  const allRows = [...assignmentRows, ...quizRows];

  const allItemMetas = [
    ...assignmentsData.map((a) => ({
      id: a.id,
      title: a.title,
      maxMarks: Number(a.maxMarks),
    })),
    ...quizzesData.map((q) => ({
      id: q.id,
      title: q.title,
      maxMarks: q.questions.reduce((sum, item) => sum + Number(item.marks), 0),
    })),
  ];

  const totals = calcStudentTotals(
    cellInputs,
    allItemMetas,
    offering.treatMissingAsZero
  );

  return {
    offeringId: offering.id,
    courseCode: offering.course.code,
    courseTitle: offering.course.title,
    term: offering.term,
    academicYear: offering.academicYear,
    treatMissingAsZero: offering.treatMissingAsZero,
    showClassAverageToStudents: offering.showClassAverageToStudents,
    totalFinalMarks: totals.totalFinalMarks,
    totalMaxMarks: totals.totalMaxMarks,
    percentage: totals.percentage,
    classAveragePercentage,
    assignments: allRows,
  };
}
