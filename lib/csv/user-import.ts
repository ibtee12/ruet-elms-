export interface ParsedCsvRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  isValid: boolean;
}

export interface ValidationContext {
  existingEmails: Set<string>;
  existingStudentIds: Set<string>;
  existingEmployeeIds: Set<string>;
  departmentCodeToId: Map<string, string>;
  allowedDepartmentCode?: string; // If restricted to a specific department (e.g. DEPT_ADMIN)
}

/**
 * Splits a CSV line handling quotes and commas properly.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Parses and validates CSV content for user batch import.
 */
export function parseUsersCsv(
  csvContent: string,
  role: "STUDENT" | "TEACHER",
  context: ValidationContext
): {
  success: boolean;
  rows: ParsedCsvRow[];
  totalCount: number;
  validCount: number;
  errorCount: number;
  globalError?: string;
} {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      success: false,
      rows: [],
      totalCount: 0,
      validCount: 0,
      errorCount: 0,
      globalError: "CSV file is empty or missing data rows.",
    };
  }

  const rawHeaders = parseCsvLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, "")
  );

  const studentRequiredHeaders = [
    "name",
    "email",
    "studentid",
    "departmentcode",
    "batch",
    "level",
    "term",
  ];
  const teacherRequiredHeaders = [
    "name",
    "email",
    "employeeid",
    "departmentcode",
    "designation",
  ];

  const requiredHeaders =
    role === "STUDENT" ? studentRequiredHeaders : teacherRequiredHeaders;

  const missingHeaders = requiredHeaders.filter(
    (h) => !rawHeaders.includes(h)
  );

  if (missingHeaders.length > 0) {
    return {
      success: false,
      rows: [],
      totalCount: 0,
      validCount: 0,
      errorCount: 0,
      globalError: `Missing required column headers: ${missingHeaders.join(", ")}. Please use the template format.`,
    };
  }

  const dataLines = lines.slice(1);
  if (dataLines.length > 1000) {
    return {
      success: false,
      rows: [],
      totalCount: dataLines.length,
      validCount: 0,
      errorCount: 0,
      globalError: `File contains ${dataLines.length} rows. Maximum allowed per batch is 1,000 rows.`,
    };
  }

  // Duplicate tracking across current CSV
  const seenEmails = new Set<string>();
  const seenIds = new Set<string>();

  const rows: ParsedCsvRow[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let idx = 0; idx < dataLines.length; idx++) {
    const rowNumber = idx + 2; // 1-indexed, header is row 1
    const rawCells = parseCsvLine(dataLines[idx]);
    const rowData: Record<string, string> = {};

    rawHeaders.forEach((header, colIdx) => {
      rowData[header] = rawCells[colIdx] || "";
    });

    const errors: string[] = [];

    // 1. Name validation
    const name = rowData["name"]?.trim();
    if (!name || name.length < 2) {
      errors.push("Name must be at least 2 characters.");
    }

    // 2. Email validation
    const email = rowData["email"]?.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      errors.push("Invalid email address format.");
    } else if (seenEmails.has(email)) {
      errors.push(`Duplicate email '${email}' in this CSV.`);
    } else if (context.existingEmails.has(email)) {
      errors.push(`Email '${email}' is already registered in the system.`);
    } else {
      seenEmails.add(email);
    }

    // 3. Department validation
    const deptCode = rowData["departmentcode"]?.toUpperCase().trim();
    if (!deptCode) {
      errors.push("Department code is required.");
    } else if (!context.departmentCodeToId.has(deptCode)) {
      errors.push(`Unknown department code '${deptCode}'.`);
    } else if (
      context.allowedDepartmentCode &&
      deptCode !== context.allowedDepartmentCode
    ) {
      errors.push(
        `Department Administrator is only authorized to add users to '${context.allowedDepartmentCode}'.`
      );
    }

    // 4. Role-specific validation
    if (role === "STUDENT") {
      const studentId = rowData["studentid"]?.trim();
      if (!studentId || studentId.length < 3) {
        errors.push("Student ID must be at least 3 characters.");
      } else if (seenIds.has(studentId)) {
        errors.push(`Duplicate Student ID '${studentId}' in this CSV.`);
      } else if (context.existingStudentIds.has(studentId)) {
        errors.push(`Student ID '${studentId}' is already registered.`);
      } else {
        seenIds.add(studentId);
      }

      const batch = rowData["batch"]?.trim();
      if (!batch) {
        errors.push("Batch is required (e.g., 2022).");
      }

      const level = Number(rowData["level"]);
      if (isNaN(level) || level < 1 || level > 4) {
        errors.push("Level must be an integer between 1 and 4.");
      }

      const term = Number(rowData["term"]);
      if (isNaN(term) || term < 1 || term > 2) {
        errors.push("Term must be either 1 or 2.");
      }
    } else if (role === "TEACHER") {
      const employeeId = rowData["employeeid"]?.trim();
      if (!employeeId || employeeId.length < 2) {
        errors.push("Employee ID must be at least 2 characters.");
      } else if (seenIds.has(employeeId)) {
        errors.push(`Duplicate Employee ID '${employeeId}' in this CSV.`);
      } else if (context.existingEmployeeIds.has(employeeId)) {
        errors.push(`Employee ID '${employeeId}' is already registered.`);
      } else {
        seenIds.add(employeeId);
      }

      const designation = rowData["designation"]?.trim();
      if (!designation || designation.length < 2) {
        errors.push("Designation is required (e.g., Assistant Professor).");
      }
    }

    const isValid = errors.length === 0;
    if (isValid) {
      validCount++;
    } else {
      errorCount++;
    }

    rows.push({
      rowNumber,
      data: rowData,
      errors,
      isValid,
    });
  }

  return {
    success: true,
    rows,
    totalCount: dataLines.length,
    validCount,
    errorCount,
  };
}

/**
 * Generates sample CSV template for students.
 */
export function generateStudentTemplateCsv(): string {
  return [
    "name,email,studentId,departmentCode,batch,level,term",
    "Md. Tanvir Hossain,2203061@student.ruet.ac.bd,2203061,CSE,2022,3,2",
    "Afsana Rahman,2203062@student.ruet.ac.bd,2203062,CSE,2022,3,2",
    "Nafis Fuad,2203063@student.ruet.ac.bd,2203063,CSE,2022,3,2",
  ].join("\n");
}

/**
 * Generates sample CSV template for teachers.
 */
export function generateTeacherTemplateCsv(): string {
  return [
    "name,email,employeeId,departmentCode,designation",
    "Dr. Ashraful Islam,aislam@cse.ruet.ac.bd,EMP401,CSE,Associate Professor",
    "Farzana Yeasmin,fyeasmin@cse.ruet.ac.bd,EMP402,CSE,Assistant Professor",
    "Mahmudul Hasan,mhasan@cse.ruet.ac.bd,EMP403,CSE,Lecturer",
  ].join("\n");
}

/**
 * Generates a downloadable result CSV file containing user credentials and generated temporary passwords.
 */
export function generateImportResultCsv(
  items: Array<{
    name: string;
    email: string;
    identifier: string;
    role: string;
    tempPassword?: string;
    status: string;
    error?: string;
  }>
): string {
  const header = "Name,Email,ID,Role,Temporary Password,Status,Error";
  const rows = items.map((u) => {
    const escape = (val?: string) => `"${(val || "").replace(/"/g, '""')}"`;
    return [
      escape(u.name),
      escape(u.email),
      escape(u.identifier),
      escape(u.role),
      escape(u.tempPassword || "N/A"),
      escape(u.status),
      escape(u.error || ""),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}
