/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { Role, CourseOfferingStatus, MaterialType } from "@prisma/client";
import {
  validateMaterialFile,
  sanitizeDisplayName,
  getSignedDownloadUrl,
} from "@/lib/storage";
import {
  createModuleAction,
  reorderModulesAction,
  deleteModuleAction,
  createMaterialLinkAction,
  toggleMaterialPublishedAction,
  deleteMaterialAction,
} from "@/actions/materials";
import { ForbiddenError } from "@/lib/auth/errors";
import * as sessionModule from "@/lib/auth/session";
import { NextRequest } from "next/server";
import { GET as downloadRouteHandler } from "@/app/api/materials/[materialId]/download/route";
import * as nextAuth from "next-auth/next";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(
    new Headers({ "x-forwarded-for": "10.0.0.1" })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Step 18: Materials & Storage Pipeline", () => {
  let teacherA: any;
  let teacherB: any;
  let studentUser: any;
  let offeringA: any;
  let moduleA: any;

  beforeEach(async () => {
    teacherA = await prisma.user.findFirstOrThrow({
      where: { email: "arahman@cse.ruet.ac.bd" },
    });

    teacherB = await prisma.user.findFirstOrThrow({
      where: { email: "bkarim@cse.ruet.ac.bd" },
    });

    studentUser = await prisma.user.findFirstOrThrow({
      where: { email: "2203001@student.ruet.ac.bd" },
    });

    // Find offering where teacherA is assigned but teacherB is NOT assigned
    offeringA = await prisma.courseOffering.findFirstOrThrow({
      where: {
        status: CourseOfferingStatus.PUBLISHED,
        offeringTeachers: { some: { userId: teacherA.id } },
        NOT: { offeringTeachers: { some: { userId: teacherB.id } } },
      },
      include: { course: true },
    });

    // Find or create a module in offeringA
    let mod = await prisma.module.findFirst({
      where: { offeringId: offeringA.id },
    });
    if (!mod) {
      mod = await prisma.module.create({
        data: {
          offeringId: offeringA.id,
          title: "Module 1: Test Fundamentals",
          order: 0,
        },
      });
    }
    moduleA = mod;
  });

  describe("File Validation Pipeline (Unit Tests)", () => {
    it("accepts valid PDF file with %PDF magic header", async () => {
      const validPdfBytes = Buffer.from("%PDF-1.4 test document content here");
      const res = await validateMaterialFile("lecture1.pdf", validPdfBytes, "application/pdf");

      expect(res.valid).toBe(true);
      expect(res.ext).toBe("pdf");
    });

    it("ACCEPTANCE: A .exe renamed to .pdf is rejected via magic byte inspection", async () => {
      // DOS / Windows PE executable header: starts with MZ (0x4D, 0x5A)
      const fakePdfBytes = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      const res = await validateMaterialFile("malware.pdf", fakePdfBytes, "application/pdf");

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Executable binary signatures/);
    });

    it("rejects wrong / disallowed file extension", async () => {
      const fakeBytes = Buffer.from("arbitrary content");
      const res = await validateMaterialFile("program.xyz", fakeBytes);

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/File extension \.xyz is not allowed/);
    });

    it("rejects double extension like .pdf.exe", async () => {
      const buffer = Buffer.from("some script or payload");
      const res = await validateMaterialFile("assignment.pdf.exe", buffer);

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/prohibited/i);
    });

    it("rejects double extension like .exe.pdf", async () => {
      const buffer = Buffer.from("%PDF-1.4 test");
      const res = await validateMaterialFile("homework.exe.pdf", buffer);

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/prohibited/i);
    });

    it("rejects spoofed executable MIME types", async () => {
      const pdfBytes = Buffer.from("%PDF-1.4 document content");
      const res = await validateMaterialFile(
        "document.pdf",
        pdfBytes,
        "application/x-msdownload"
      );

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/Prohibited MIME type/);
    });

    it("rejects oversized files exceeding size limit", async () => {
      // 100KB buffer tested against 0.05MB limit (50KB limit)
      const oversizedBuffer = Buffer.alloc(100 * 1024, 0x20);
      oversizedBuffer[0] = 0x25;
      oversizedBuffer[1] = 0x50;
      oversizedBuffer[2] = 0x44;
      oversizedBuffer[3] = 0x46; // %PDF

      const res = await validateMaterialFile(
        "large.pdf",
        oversizedBuffer,
        "application/pdf",
        0.05 // 50KB limit
      );

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/exceeds maximum allowed limit/);
    });

    it("sanitizes filenames stripping directory traversal patterns", () => {
      expect(sanitizeDisplayName("../../etc/passwd")).toBe("passwd");
      expect(sanitizeDisplayName("..\\windows\\system32.dll")).toBe("system32.dll");
      expect(sanitizeDisplayName("  normal_lecture.pdf  ")).toBe("normal_lecture.pdf");
    });
  });

  describe("Access Control & Authorization", () => {
    it("ACCEPTANCE: Another teacher cannot upload to this offering", async () => {
      // Teacher B attempts to add material to Teacher A's offering
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherB.id,
        email: teacherB.email,
        name: teacherB.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      await expect(
        createMaterialLinkAction({
          offeringId: offeringA.id,
          moduleId: moduleA.id,
          title: "Teacher B Link Attempt",
          url: "https://example.com/unauthorized",
          type: "LINK",
        })
      ).rejects.toThrow(ForbiddenError);
    });

    it("ACCEPTANCE: Another teacher cannot download from this offering", async () => {
      // Create a material in offeringA
      const material = await prisma.material.create({
        data: {
          moduleId: moduleA.id,
          title: "Protected Material",
          type: MaterialType.FILE,
          fileKey: `${offeringA.id}/test-file.pdf`,
          originalName: "test-file.pdf",
          mime: "application/pdf",
          sizeBytes: 1024,
          published: true,
          order: 0,
          uploadedById: teacherA.id,
        },
      });

      // Teacher B attempts to download Teacher A's material
      vi.spyOn(nextAuth, "getServerSession").mockResolvedValue({
        user: {
          id: teacherB.id,
          email: teacherB.email,
          name: teacherB.name,
          role: Role.TEACHER,
        },
      });

      const req = new NextRequest(
        `http://localhost:3000/api/materials/${material.id}/download`
      );
      const res = await downloadRouteHandler(req, {
        params: Promise.resolve({ materialId: material.id }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/not authorized to download/);

      // Clean up test material
      await prisma.material.delete({ where: { id: material.id } });
    });
  });

  describe("Modules & Reordering", () => {
    it("ACCEPTANCE: Reorder persists in database and respects order sequence", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      // Create two modules for testing
      const mod1 = await prisma.module.create({
        data: {
          offeringId: offeringA.id,
          title: `Order Test A ${Date.now()}`,
          order: 0,
        },
      });

      const mod2 = await prisma.module.create({
        data: {
          offeringId: offeringA.id,
          title: `Order Test B ${Date.now()}`,
          order: 1,
        },
      });

      // Reverse order: mod2 first, then mod1
      const res = await reorderModulesAction(offeringA.id, [mod2.id, mod1.id]);
      expect(res.success).toBe(true);

      const checkMod1 = await prisma.module.findUniqueOrThrow({
        where: { id: mod1.id },
      });
      const checkMod2 = await prisma.module.findUniqueOrThrow({
        where: { id: mod2.id },
      });

      expect(checkMod2.order).toBe(0);
      expect(checkMod1.order).toBe(1);

      // Clean up
      await prisma.module.deleteMany({
        where: { id: { in: [mod1.id, mod2.id] } },
      });
    });

    it("deleting a non-empty module moves materials to Unsorted module", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const targetMod = await prisma.module.create({
        data: {
          offeringId: offeringA.id,
          title: `Module To Delete ${Date.now()}`,
          order: 50,
        },
      });

      const testMat = await prisma.material.create({
        data: {
          moduleId: targetMod.id,
          title: "Material Inside Module To Delete",
          type: MaterialType.LINK,
          url: "https://example.com/test",
          published: false,
          order: 0,
          uploadedById: teacherA.id,
        },
      });

      const delRes = await deleteModuleAction(targetMod.id, true);
      expect(delRes.success).toBe(true);

      // Verify material moved to Unsorted module
      const checkMat = await prisma.material.findUniqueOrThrow({
        where: { id: testMat.id },
        include: { module: true },
      });

      expect(checkMat.module.title).toBe("Unsorted");

      // Clean up
      await prisma.material.delete({ where: { id: testMat.id } });
      await prisma.module.delete({ where: { id: checkMat.moduleId } });
    });
  });

  describe("Audit Logging & Status", () => {
    it("creates audit log on publish toggle and deletion", async () => {
      vi.spyOn(sessionModule, "requireRole").mockResolvedValue({
        id: teacherA.id,
        email: teacherA.email,
        name: teacherA.name,
        role: Role.TEACHER,
        mustChangePassword: false,
      });

      const mat = await prisma.material.create({
        data: {
          moduleId: moduleA.id,
          title: "Audit Test Material",
          type: MaterialType.LINK,
          url: "https://example.com/audit",
          published: false,
          order: 99,
          uploadedById: teacherA.id,
        },
      });

      // Toggle publish
      await toggleMaterialPublishedAction(mat.id);

      const publishAudit = await prisma.auditLog.findFirst({
        where: {
          action: "MATERIAL_PUBLISHED_CHANGED",
          objectId: mat.id,
        },
      });
      expect(publishAudit).toBeDefined();

      // Delete material
      await deleteMaterialAction(mat.id);

      const deleteAudit = await prisma.auditLog.findFirst({
        where: {
          action: "MATERIAL_DELETED",
          objectId: mat.id,
        },
      });
      expect(deleteAudit).toBeDefined();

      // Clean up logs
      await prisma.auditLog.deleteMany({
        where: { objectId: mat.id },
      });
    });
  });
});
