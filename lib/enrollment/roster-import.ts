/**
 * Pure helpers for bulk enrollment input (pasted IDs or CSV).
 * No database access here so this module is fully unit-testable.
 */

export const MAX_ENROLL_ROWS = 1000;

/** Student IDs at RUET are numeric roll numbers, e.g. 2203001. */
export const STUDENT_ID_PATTERN = /^\d{5,12}$/;

/** Join codes: uppercase letters, digits, and hyphens (e.g. RUET-3FA9C1, DBMS-2026-EVEN). */
export const JOIN_CODE_PATTERN = /^[A-Z0-9-]{4,32}$/;

export interface RawEnrollEntry {
  /** 1-based line number in the original input (header counts as line 1 for CSV). */
  line: number;
  studentId: string;
  /** Optional section name from the CSV `section` column. */
  section?: string;
}

export interface ParseEnrollInputResult {
  entries: RawEnrollEntry[];
  /** Fatal problems with the input as a whole (e.g. too many rows, missing column). */
  errors: string[];
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * Parses either:
 *  - a CSV whose first line is a header containing `studentId` (and optionally `section`), or
 *  - a free-form pasted list of student IDs separated by newlines, commas, semicolons, or spaces.
 */
export function parseEnrollInput(input: string): ParseEnrollInputResult {
  const text = (input ?? "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0);

  if (firstNonEmptyIdx === -1) {
    return { entries: [], errors: ["No student IDs were provided."] };
  }

  const headerCells = splitCsvLine(lines[firstNonEmptyIdx]).map(normalizeHeader);
  const isCsv = headerCells.includes("studentid");

  const entries: RawEnrollEntry[] = [];

  if (isCsv) {
    const idIdx = headerCells.indexOf("studentid");
    const sectionIdx = headerCells.indexOf("section");

    for (let i = firstNonEmptyIdx + 1; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim()) continue;
      const cells = splitCsvLine(raw);
      const studentId = (cells[idIdx] ?? "").trim();
      const section = sectionIdx >= 0 ? (cells[sectionIdx] ?? "").trim() : "";
      entries.push({
        line: i + 1,
        studentId,
        section: section || undefined,
      });
    }
  } else {
    lines.forEach((raw, i) => {
      raw
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((token) => entries.push({ line: i + 1, studentId: token }));
    });
  }

  const errors: string[] = [];
  if (entries.length === 0) {
    errors.push(
      isCsv ? "The CSV has a header but no data rows." : "No student IDs were provided."
    );
  }
  if (entries.length > MAX_ENROLL_ROWS) {
    errors.push(
      `Too many rows: ${entries.length}. A maximum of ${MAX_ENROLL_ROWS} students can be enrolled at once.`
    );
  }

  return { entries, errors };
}

export type EnrollRowStatus =
  | "READY" // found, will be enrolled
  | "REENROLL" // found, previously dropped; will be re-activated
  | "ALREADY_ENROLLED"
  | "NOT_FOUND"
  | "INVALID";

export interface ClassifiedEnrollRow {
  line: number;
  studentId: string;
  status: EnrollRowStatus;
  message: string;
  userId?: string;
  name?: string;
  /** Target section the row will be enrolled into (for READY/REENROLL). */
  sectionId?: string;
  sectionName?: string;
  /** Existing enrollment id (for ALREADY_ENROLLED / REENROLL). */
  enrollmentId?: string;
}

export interface StudentLookup {
  userId: string;
  name: string;
  studentId: string;
  isActive: boolean;
}

export interface ExistingEnrollmentLookup {
  enrollmentId: string;
  sectionId: string;
  sectionName: string;
  status: "ACTIVE" | "DROPPED";
}

export interface ClassifyContext {
  /** Keyed by studentId (roll number). Only users with role STUDENT should be included. */
  studentsById: Map<string, StudentLookup>;
  /** Keyed by userId. Enrollments of that student in ANY section of this offering. */
  enrollmentsByUserId: Map<string, ExistingEnrollmentLookup>;
  /** Keyed by lower-cased section name. */
  sectionsByName: Map<string, { id: string; name: string }>;
  /** Section used when a row does not specify one. */
  defaultSection: { id: string; name: string };
}

/**
 * Classifies each parsed entry against looked-up DB state.
 * Order of checks: format -> duplicate in input -> section -> existence -> current enrollment.
 */
export function classifyEnrollEntries(
  entries: RawEnrollEntry[],
  ctx: ClassifyContext
): ClassifiedEnrollRow[] {
  const seen = new Set<string>();

  return entries.map((entry): ClassifiedEnrollRow => {
    const studentId = entry.studentId.trim();
    const base = { line: entry.line, studentId };

    if (!studentId) {
      return { ...base, status: "INVALID", message: "Missing student ID." };
    }
    if (!STUDENT_ID_PATTERN.test(studentId)) {
      return { ...base, status: "INVALID", message: "Student ID must be 5-12 digits." };
    }
    if (seen.has(studentId)) {
      return { ...base, status: "INVALID", message: "Duplicate ID in this list." };
    }
    seen.add(studentId);

    let section = ctx.defaultSection;
    if (entry.section) {
      const match = ctx.sectionsByName.get(entry.section.trim().toLowerCase());
      if (!match) {
        return {
          ...base,
          status: "INVALID",
          message: `Unknown section '${entry.section}'.`,
        };
      }
      section = match;
    }

    const student = ctx.studentsById.get(studentId);
    if (!student) {
      return { ...base, status: "NOT_FOUND", message: "No student with this ID." };
    }
    if (!student.isActive) {
      return {
        ...base,
        status: "INVALID",
        userId: student.userId,
        name: student.name,
        message: "Student account is deactivated.",
      };
    }

    const existing = ctx.enrollmentsByUserId.get(student.userId);
    if (existing?.status === "ACTIVE") {
      return {
        ...base,
        status: "ALREADY_ENROLLED",
        userId: student.userId,
        name: student.name,
        enrollmentId: existing.enrollmentId,
        sectionId: existing.sectionId,
        sectionName: existing.sectionName,
        message: `Already enrolled in ${existing.sectionName}.`,
      };
    }

    if (existing?.status === "DROPPED") {
      return {
        ...base,
        status: "REENROLL",
        userId: student.userId,
        name: student.name,
        enrollmentId: existing.enrollmentId,
        sectionId: section.id,
        sectionName: section.name,
        message: `Previously dropped; will be re-enrolled in ${section.name}.`,
      };
    }

    return {
      ...base,
      status: "READY",
      userId: student.userId,
      name: student.name,
      sectionId: section.id,
      sectionName: section.name,
      message: `Will be enrolled in ${section.name}.`,
    };
  });
}

export function summarizeClassified(rows: ClassifiedEnrollRow[]) {
  const count = (s: EnrollRowStatus) => rows.filter((r) => r.status === s).length;
  return {
    total: rows.length,
    ready: count("READY"),
    reenroll: count("REENROLL"),
    alreadyEnrolled: count("ALREADY_ENROLLED"),
    notFound: count("NOT_FOUND"),
    invalid: count("INVALID"),
  };
}

/** Normalizes user-typed join codes: trims, uppercases, strips inner whitespace. */
export function normalizeJoinCode(input: string): string {
  return (input ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isWellFormedJoinCode(code: string): boolean {
  return JOIN_CODE_PATTERN.test(code);
}

export const ENROLL_CSV_TEMPLATE = "studentId,section\n2203001,Section A\n2203002,\n";
