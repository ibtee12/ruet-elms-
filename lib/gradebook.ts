/**
 * Gradebook calculations, evaluation matrix aggregation, and CSV export utilities.
 */

export interface GradebookAssignmentMeta {
  id: string;
  title: string;
  maxMarks: number;
}

export interface GradebookStudentCellInput {
  assignmentId: string;
  finalMarks: number | null;
  rawMarks?: number | null;
  isLate?: boolean;
  latePenaltyPercent?: number;
  isMissing: boolean;
}

export interface StudentTotalsResult {
  totalFinalMarks: number;
  totalMaxMarks: number;
  percentage: number | null; // Rounded to 2 decimal places, or null if no scored items
}

/**
 * Calculates total final marks, total applicable max marks, and overall percentage for a student.
 * If treatMissingAsZero is false (default):
 * - Missing submissions are excluded from both total final marks and total max marks.
 * If treatMissingAsZero is true:
 * - Missing assignments add 0 to final marks and full maxMarks to total max marks.
 */
export function calcStudentTotals(
  cells: GradebookStudentCellInput[],
  assignments: GradebookAssignmentMeta[],
  treatMissingAsZero: boolean = false
): StudentTotalsResult {
  const cellMap = new Map<string, GradebookStudentCellInput>();
  for (const c of cells) {
    cellMap.set(c.assignmentId, c);
  }

  let totalFinalMarks = 0;
  let totalMaxMarks = 0;

  for (const assignment of assignments) {
    const cell = cellMap.get(assignment.id);
    const hasFinalMarks = cell?.finalMarks !== null && cell?.finalMarks !== undefined;

    if (hasFinalMarks) {
      totalFinalMarks += Number(cell!.finalMarks);
      totalMaxMarks += Number(assignment.maxMarks);
    } else {
      // Cell is missing or unsubmitted / ungraded
      if (treatMissingAsZero) {
        totalFinalMarks += 0;
        totalMaxMarks += Number(assignment.maxMarks);
      }
      // If !treatMissingAsZero, it is completely excluded from the total and max marks!
    }
  }

  totalFinalMarks = Math.round(totalFinalMarks * 100) / 100;
  totalMaxMarks = Math.round(totalMaxMarks * 100) / 100;

  let percentage: number | null = null;
  if (totalMaxMarks > 0) {
    percentage = Math.round((totalFinalMarks / totalMaxMarks) * 10000) / 100;
  }

  return {
    totalFinalMarks,
    totalMaxMarks,
    percentage,
  };
}

/**
 * Calculates class-wide metrics:
 * - Overall class average percentage across all active students with a valid percentage
 * - Per-assignment average marks and percentage among graded submissions
 */
export function calcClassAverages(
  students: { percentage: number | null; cells: Record<string, GradebookStudentCellInput> }[],
  assignments: GradebookAssignmentMeta[]
): {
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
} {
  // 1. Overall class average percentage
  const validPercentages = students
    .map((s) => s.percentage)
    .filter((p): p is number => p !== null && !isNaN(p));

  const classAveragePercentage =
    validPercentages.length > 0
      ? Math.round(
          (validPercentages.reduce((a, b) => a + b, 0) / validPercentages.length) * 100
        ) / 100
      : null;

  // 2. Per-assignment averages
  const assignmentAverages: Record<
    string,
    {
      averageMarks: number | null;
      averagePercentage: number | null;
      submissionCount: number;
      gradedCount: number;
    }
  > = {};

  for (const assignment of assignments) {
    let totalMarks = 0;
    let gradedCount = 0;
    let submissionCount = 0;

    for (const student of students) {
      const cell = student.cells[assignment.id];
      if (cell && !cell.isMissing) {
        submissionCount += 1;
      }
      if (cell && cell.finalMarks !== null && cell.finalMarks !== undefined) {
        totalMarks += Number(cell.finalMarks);
        gradedCount += 1;
      }
    }

    const avgMarks =
      gradedCount > 0 ? Math.round((totalMarks / gradedCount) * 100) / 100 : null;
    const avgPercentage =
      avgMarks !== null && assignment.maxMarks > 0
        ? Math.round((avgMarks / assignment.maxMarks) * 10000) / 100
        : null;

    assignmentAverages[assignment.id] = {
      averageMarks: avgMarks,
      averagePercentage: avgPercentage,
      submissionCount,
      gradedCount,
    };
  }

  return {
    classAveragePercentage,
    assignmentAverages,
  };
}

/**
 * Sanitizes a CSV cell against CSV Formula Injection (DDE / Command Execution in Excel/Sheets).
 * If a cell string starts with '=', '+', '-', or '@', it is prepended with a single quote (').
 * Also properly escapes quotes and wraps in double quotes if it contains commas, newlines, or quotes.
 */
export function sanitizeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);

  // If numeric, negative numbers should be treated carefully:
  // In pure CSV formula injection protection:
  // Any string beginning with =, +, -, or @ must be sanitized.
  // For negative numbers like -5, if exported as text, prefixing with ' ensures Excel doesn't misinterpret formula syntax.
  const trimmed = str.trimStart();
  const dangerousPrefixes = ["=", "+", "-", "@"];

  if (dangerousPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
    str = `'${str}`;
  }

  // Escape double quotes and enclose in quotes if needed
  const needsQuotes =
    str.includes(",") ||
    str.includes("\n") ||
    str.includes("\r") ||
    str.includes('"') ||
    str.startsWith("'");

  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export interface GradebookExportStudentRow {
  roll: string | null;
  name: string;
  email: string;
  section: string;
  totalFinalMarks: number;
  totalMaxMarks: number;
  percentage: number | null;
  assignmentScores: Record<
    string,
    {
      rawMarks: number | null;
      finalMarks: number | null;
      isLate: boolean;
      isMissing: boolean;
    }
  >;
}

/**
 * Builds a complete CSV file string for the Gradebook evaluation matrix.
 * Includes student identifiers, per-assignment raw & final marks, total earned, total possible, and percentage.
 * Completely sanitized against formula injection.
 */
export function generateGradebookCsv(
  assignments: GradebookAssignmentMeta[],
  students: GradebookExportStudentRow[]
): string {
  const headers = [
    "Roll / ID",
    "Student Name",
    "Email",
    "Section",
  ];

  for (const a of assignments) {
    headers.push(`${a.title} (Raw)`);
    headers.push(`${a.title} (Final / ${a.maxMarks})`);
  }

  headers.push("Total Earned");
  headers.push("Total Possible");
  headers.push("Overall Percentage (%)");

  const lines: string[] = [headers.map(sanitizeCsvCell).join(",")];

  for (const s of students) {
    const row: string[] = [
      sanitizeCsvCell(s.roll || "N/A"),
      sanitizeCsvCell(s.name),
      sanitizeCsvCell(s.email),
      sanitizeCsvCell(s.section),
    ];

    for (const a of assignments) {
      const score = s.assignmentScores[a.id];
      if (!score || score.isMissing || score.finalMarks === null) {
        row.push(sanitizeCsvCell("-"));
        row.push(sanitizeCsvCell("-"));
      } else {
        row.push(sanitizeCsvCell(score.rawMarks ?? score.finalMarks));
        row.push(sanitizeCsvCell(score.finalMarks));
      }
    }

    row.push(sanitizeCsvCell(s.totalFinalMarks));
    row.push(sanitizeCsvCell(s.totalMaxMarks));
    row.push(sanitizeCsvCell(s.percentage !== null ? `${s.percentage}%` : "-"));

    lines.push(row.join(","));
  }

  return lines.join("\r\n");
}
