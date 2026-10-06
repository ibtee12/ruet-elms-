import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import {
  getAuditLogs,
  exportAuditLogsCsv,
  sanitizeCsvCell,
  formatDhakaTime,
  AUDIT_ACTIONS,
  AUDIT_OBJECT_TYPES,
} from "@/services/audit-logs";
import * as auditActionsModule from "@/actions/audit-logs";

describe("Step 35: Audit Log Viewer and Security Trail", () => {
  let superAdminUser: { id: string; role: Role };
  let deptAdminCse: { id: string; role: Role; departmentId: string };
  let deptAdminEee: { id: string; role: Role; departmentId: string };
  let cseDept: { id: string; code: string };
  let eeeDept: { id: string; code: string };

  beforeEach(async () => {
    // 1. Locate Super Admin
    const sa = await prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN },
    });
    if (!sa) throw new Error("Super Admin user not found.");
    superAdminUser = { id: sa.id, role: sa.role };

    // 2. Locate CSE and EEE departments
    const cse = await prisma.department.findFirst({
      where: { code: "CSE" },
    });
    const eee = await prisma.department.findFirst({
      where: { code: "EEE" },
    });
    if (!cse || !eee) throw new Error("CSE or EEE department not found.");
    cseDept = { id: cse.id, code: cse.code };
    eeeDept = { id: eee.id, code: eee.code };

    // 3. Locate Dept Admins for CSE and EEE
    const daCse = await prisma.user.findFirst({
      where: {
        role: Role.DEPT_ADMIN,
        teacherProfile: { departmentId: cse.id },
      },
    });
    const daEee = await prisma.user.findFirst({
      where: {
        role: Role.DEPT_ADMIN,
        teacherProfile: { departmentId: eee.id },
      },
    });
    if (!daCse || !daEee) throw new Error("Department Admins not found.");
    deptAdminCse = { id: daCse.id, role: daCse.role, departmentId: cse.id };
    deptAdminEee = { id: daEee.id, role: daEee.role, departmentId: eee.id };
  });

  describe("Append-Only Integrity (Zero update/delete path in production code)", () => {
    it("proves statically that no update or delete mutations on AuditLog exist in production code", () => {
      // Production directories to audit: app, actions, services, lib
      const rootDir = process.cwd();
      const targetDirs = ["app", "actions", "services", "lib"];
      const forbiddenPatterns = [
        /\.auditLog\.update\(/,
        /\.auditLog\.updateMany\(/,
        /\.auditLog\.delete\(/,
        /\.auditLog\.deleteMany\(/,
        /\.auditLog\.upsert\(/,
      ];

      const scanDirectory = (dir: string): string[] => {
        const violations: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            violations.push(...scanDirectory(fullPath));
          } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, "utf-8");
            for (const pattern of forbiddenPatterns) {
              if (pattern.test(content)) {
                violations.push(`${fullPath} matches forbidden pattern ${pattern}`);
              }
            }
          }
        }
        return violations;
      };

      const allViolations: string[] = [];
      for (const d of targetDirs) {
        const fullDir = path.join(rootDir, d);
        if (fs.existsSync(fullDir)) {
          allViolations.push(...scanDirectory(fullDir));
        }
      }

      // Assert that ZERO update/delete/upsert invocations on auditLog exist in production code
      expect(allViolations).toEqual([]);
    });

    it("verifies that no audit-log server action or API route provides delete or update operations", () => {
      // Check exported members of actions/audit-logs
      const exportedKeys = Object.keys(auditActionsModule);
      for (const key of exportedKeys) {
        expect(key.toLowerCase()).not.toContain("delete");
        expect(key.toLowerCase()).not.toContain("update");
        expect(key.toLowerCase()).not.toContain("remove");
      }
    });
  });

  describe("Department Isolation for DEPT_ADMIN", () => {
    it("ensures CSE Dept Admin sees only entries for users and objects in CSE department", async () => {
      // Query as CSE Dept Admin
      const result = await getAuditLogs({
        caller: deptAdminCse,
        page: 1,
        pageSize: 50,
      });

      expect(result.departmentScope).toBeDefined();
      expect(result.departmentScope?.code).toBe("CSE");

      // Verify that every single returned log is either:
      // a) performed by a CSE member
      // b) targets CSE department or an object belonging to CSE
      // and NONE belongs to EEE users/objects
      const cseUsers = await prisma.user.findMany({
        where: {
          OR: [
            { studentProfile: { departmentId: cseDept.id } },
            { teacherProfile: { departmentId: cseDept.id } },
          ],
        },
        select: { id: true },
      });
      const cseUserIds = new Set(cseUsers.map((u) => u.id));

      const eeeUsers = await prisma.user.findMany({
        where: {
          OR: [
            { studentProfile: { departmentId: eeeDept.id } },
            { teacherProfile: { departmentId: eeeDept.id } },
          ],
        },
        select: { id: true },
      });
      const eeeUserIds = new Set(eeeUsers.map((u) => u.id));

      for (const log of result.logs) {
        if (log.userId && eeeUserIds.has(log.userId)) {
          // If actor is an EEE user, fail: CSE dept admin must not see it!
          throw new Error(
            `Audit log ${log.id} by EEE user ${log.userId} leaked to CSE admin view!`
          );
        }
        if (log.objectType === "Department") {
          expect(log.objectId).toBe(cseDept.id);
        }
      }
    });

    it("ensures EEE Dept Admin sees only entries for users and objects in EEE department", async () => {
      const result = await getAuditLogs({
        caller: deptAdminEee,
        page: 1,
        pageSize: 50,
      });

      expect(result.departmentScope).toBeDefined();
      expect(result.departmentScope?.code).toBe("EEE");

      const cseUsers = await prisma.user.findMany({
        where: {
          OR: [
            { studentProfile: { departmentId: cseDept.id } },
            { teacherProfile: { departmentId: cseDept.id } },
          ],
        },
        select: { id: true },
      });
      const cseUserIds = new Set(cseUsers.map((u) => u.id));

      for (const log of result.logs) {
        if (log.userId && cseUserIds.has(log.userId)) {
          throw new Error(
            `Audit log ${log.id} by CSE user ${log.userId} leaked to EEE admin view!`
          );
        }
        if (log.objectType === "Department") {
          expect(log.objectId).toBe(eeeDept.id);
        }
      }
    });

    it("allows SUPER_ADMIN to view all logs or filter by department", async () => {
      // Global view
      const globalResult = await getAuditLogs({
        caller: superAdminUser,
        page: 1,
        pageSize: 50,
      });
      expect(globalResult.departmentScope).toBeUndefined();
      expect(globalResult.logs.length).toBeGreaterThan(0);

      // Dept filtered view
      const cseFilteredResult = await getAuditLogs({
        caller: superAdminUser,
        departmentId: cseDept.id,
        page: 1,
        pageSize: 50,
      });
      expect(cseFilteredResult.departmentScope?.code).toBe("CSE");
    });
  });

  describe("Server-Side Pagination", () => {
    it("paginates with pageSize: 50 without loading entire database", async () => {
      const page1 = await getAuditLogs({
        caller: superAdminUser,
        page: 1,
        pageSize: 50,
      });

      expect(page1.page).toBe(1);
      expect(page1.pageSize).toBe(50);
      expect(page1.logs.length).toBeLessThanOrEqual(50);
      expect(page1.total).toBeGreaterThanOrEqual(page1.logs.length);

      if (page1.total > 50) {
        const page2 = await getAuditLogs({
          caller: superAdminUser,
          page: 2,
          pageSize: 50,
        });

        expect(page2.page).toBe(2);
        expect(page2.pageSize).toBe(50);
        // Ensure page 2 items are different from page 1
        const page1Ids = new Set(page1.logs.map((l) => l.id));
        for (const log of page2.logs) {
          expect(page1Ids.has(log.id)).toBe(false);
        }
      }
    });

    it("respects multi-select actions filter", async () => {
      const actions = ["LOGIN_SUCCESS", "LOGIN_FAILED"];
      const result = await getAuditLogs({
        caller: superAdminUser,
        actions,
        page: 1,
        pageSize: 50,
      });

      for (const log of result.logs) {
        expect(actions).toContain(log.action);
      }
    });

    it("respects objectType and objectId search", async () => {
      const result = await getAuditLogs({
        caller: superAdminUser,
        objectType: "User",
        page: 1,
        pageSize: 50,
      });

      for (const log of result.logs) {
        expect(log.objectType).toBe("User");
      }
    });
  });

  describe("Formula Injection Safe CSV Export", () => {
    it("sanitizes cells starting with =, +, -, @, \\t, \\r to prevent Excel DDE execution", () => {
      // Test formula triggers
      expect(sanitizeCsvCell("=1+1")).toBe("\"'=1+1\"");
      expect(sanitizeCsvCell("=cmd|' /C calc'!A0")).toBe("\"'=cmd|' /C calc'!A0\"");
      expect(sanitizeCsvCell("+12345")).toBe("\"'+12345\"");
      expect(sanitizeCsvCell("-55")).toBe("\"'-55\"");
      expect(sanitizeCsvCell("@SUM(A1:A10)")).toBe("\"'@SUM(A1:A10)\"");
      expect(sanitizeCsvCell("\tTabbed")).toBe("\"'\tTabbed\"");
      expect(sanitizeCsvCell("\rReturn")).toBe("\"'\rReturn\"");

      // Test regular values
      expect(sanitizeCsvCell("CSE Department")).toBe('"CSE Department"');
      expect(sanitizeCsvCell('Text with "quotes"')).toBe('"Text with ""quotes"""');
      expect(sanitizeCsvCell(null)).toBe('""');
      expect(sanitizeCsvCell(undefined)).toBe('""');
    });

    it("exports CSV with UTF-8 BOM and obeys row limits", async () => {
      const { csvContent, rowCount } = await exportAuditLogsCsv({
        caller: superAdminUser,
        maxRows: 10,
      });

      // Starts with UTF-8 BOM \uFEFF
      expect(csvContent.charCodeAt(0)).toBe(0xfeff);
      expect(rowCount).toBeLessThanOrEqual(10);

      // Contains header row
      expect(csvContent).toContain("Time (Asia/Dhaka)");
      expect(csvContent).toContain("Action");
      expect(csvContent).toContain("Object Type");
    });
  });

  describe("Asia/Dhaka Standard Time Formatting", () => {
    it("formats dates in UTC+6 Asia/Dhaka time zone", () => {
      // 2026-10-06 08:30:00 UTC = 2026-10-06 14:30:00 Asia/Dhaka (BST)
      const testDate = new Date("2026-10-06T08:30:00.000Z");
      const formatted = formatDhakaTime(testDate);

      expect(formatted).toContain("2026");
      expect(formatted).toContain("02:30:00 PM");
    });
  });

  describe("Required Audited Actions Completeness", () => {
    it("verifies all required actions are tracked in system catalog", () => {
      const required = [
        "LOGIN_FAILED",
        "FILE_UPLOADED",
        "FILE_DELETED",
        "GRADE_ASSIGNED",
        "GRADE_CHANGED",
        "USER_CREATED",
        "USER_UPDATED",
        "OFFERING_PUBLISHED",
        "CSV_IMPORT",
      ];

      for (const action of required) {
        expect(AUDIT_ACTIONS).toContain(action);
      }
    });

    it("confirms password hashes and tokens are never stored in audit logs", async () => {
      const logs = await prisma.auditLog.findMany({
        take: 100,
        orderBy: { createdAt: "desc" },
      });

      for (const log of logs) {
        // Description must never contain bcrypt/argon2 hashes ($2a$, $2b$, etc.) or plaintext tokens
        if (log.description) {
          expect(log.description).not.toMatch(/\$2[aby]\$[0-9]{2}\$/);
          expect(log.description.toLowerCase()).not.toContain("passwordhash");
        }
      }
    });
  });
});
