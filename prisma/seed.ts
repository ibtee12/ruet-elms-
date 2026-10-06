import {
  PrismaClient,
  Role,
  CourseOfferingStatus,
  OfferingTeacherRole,
  EnrollmentStatus,
  MaterialType,
  SubmissionStatus,
  NotificationType,
  QuestionType,
  QuestionDifficulty,
  ThreadCategory,
  RiskLevel,
  Prisma,
  User,
  Course,
  Material,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEV_PASSWORD = "Password123!";
const SALT_ROUNDS = 10;

async function main() {
  const shouldReset =
    process.argv.includes("--reset") || process.env.SEED_RESET === "true";

  console.log("🌱 Starting RUET ELMS database seeding...");

  if (shouldReset) {
    console.log("🧹 Reset flag detected. Cleaning existing records...");
    await prisma.answer.deleteMany();
    await prisma.quizAttempt.deleteMany();
    await prisma.option.deleteMany();
    await prisma.question.deleteMany();
    await prisma.quiz.deleteMany();
    await prisma.post.deleteMany();
    await prisma.thread.deleteMany();
    await prisma.gradeHistory.deleteMany();
    await prisma.grade.deleteMany();
    await prisma.submissionVersion.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.assignmentAttachment.deleteMany();
    await prisma.assignment.deleteMany();
    await prisma.materialProgress.deleteMany();
    await prisma.material.deleteMany();
    await prisma.module.deleteMany();
    await prisma.topic.deleteMany();
    await prisma.announcement.deleteMany();
    await prisma.activityEvent.deleteMany();
    await prisma.analyticsSnapshot.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.enrollment.deleteMany();
    await prisma.offeringTeacher.deleteMany();
    await prisma.section.deleteMany();
    await prisma.courseOffering.deleteMany();
    await prisma.course.deleteMany();
    await prisma.studentProfile.deleteMany();
    await prisma.teacherProfile.deleteMany();
    await prisma.department.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.user.deleteMany();
    console.log("✅ Cleanup finished.");
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  // -------------------------------------------------------------------------
  // 1. SYSTEM SETTINGS
  // -------------------------------------------------------------------------
  console.log("⚙️  Seeding system settings...");
  const settingsToSeed = [
    {
      key: "upload_limits",
      value: {
        maxAssignmentSizeMb: 15,
        maxMaterialSizeMb: 50,
        allowedAttachmentTypes: ["pdf", "docx", "zip", "pptx", "txt"],
      },
    },
    {
      key: "progress_weights",
      value: {
        assignmentWeight: 0.4,
        quizWeight: 0.3,
        materialsWeight: 0.2,
        discussionWeight: 0.1,
      },
    },
    {
      key: "risk_thresholds",
      value: {
        highRiskScore: 70,
        mediumRiskScore: 40,
        inactiveDaysThreshold: 7,
        missedAssignmentPoints: 25,
        lowQuizScorePoints: 15,
      },
    },
    {
      key: "reminder_windows",
      value: {
        assignmentReminderHours: [48, 12, 3],
        quizReminderHours: [24, 2],
        digestFrequency: "daily",
      },
    },
    {
      key: "institution_profile",
      value: {
        name: "Rajshahi University of Engineering & Technology",
        acronym: "RUET",
        currentTerm: "Even Term 2026",
        timezone: "Asia/Dhaka",
      },
    },
  ];

  for (const s of settingsToSeed) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: { key: s.key, value: s.value },
    });
  }

  // -------------------------------------------------------------------------
  // 2. DEPARTMENTS
  // -------------------------------------------------------------------------
  console.log("🏛️  Seeding departments...");
  const cseDept = await prisma.department.upsert({
    where: { code: "CSE" },
    update: {
      name: "Computer Science & Engineering",
      description: "Department of Computer Science & Engineering, RUET",
    },
    create: {
      code: "CSE",
      name: "Computer Science & Engineering",
      description: "Department of Computer Science & Engineering, RUET",
    },
  });

  const eeeDept = await prisma.department.upsert({
    where: { code: "EEE" },
    update: {
      name: "Electrical & Electronic Engineering",
      description: "Department of Electrical & Electronic Engineering, RUET",
    },
    create: {
      code: "EEE",
      name: "Electrical & Electronic Engineering",
      description: "Department of Electrical & Electronic Engineering, RUET",
    },
  });

  // -------------------------------------------------------------------------
  // 3. SUPER ADMIN & DEPARTMENT ADMINS
  // -------------------------------------------------------------------------
  console.log("👤 Seeding administrators...");
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@ruet.ac.bd" },
    update: {
      name: "System Super Admin",
      role: Role.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      email: "admin@ruet.ac.bd",
      name: "System Super Admin",
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
    },
  });

  const cseDeptAdmin = await prisma.user.upsert({
    where: { email: "deptadmin.cse@ruet.ac.bd" },
    update: {
      name: "Dr. Shahidul Islam",
      role: Role.DEPT_ADMIN,
      isActive: true,
    },
    create: {
      email: "deptadmin.cse@ruet.ac.bd",
      name: "Dr. Shahidul Islam",
      passwordHash,
      role: Role.DEPT_ADMIN,
      isActive: true,
      mustChangePassword: false,
      teacherProfile: {
        create: {
          employeeId: "EMP-CSE-ADMIN",
          departmentId: cseDept.id,
          designation: "Professor & Head of Department",
        },
      },
    },
  });

  const eeeDeptAdmin = await prisma.user.upsert({
    where: { email: "deptadmin.eee@ruet.ac.bd" },
    update: {
      name: "Dr. Monirul Hasan",
      role: Role.DEPT_ADMIN,
      isActive: true,
    },
    create: {
      email: "deptadmin.eee@ruet.ac.bd",
      name: "Dr. Monirul Hasan",
      passwordHash,
      role: Role.DEPT_ADMIN,
      isActive: true,
      mustChangePassword: false,
      teacherProfile: {
        create: {
          employeeId: "EMP-EEE-ADMIN",
          departmentId: eeeDept.id,
          designation: "Professor & Head of Department",
        },
      },
    },
  });

  // -------------------------------------------------------------------------
  // 4. TEACHERS (3 CSE + 3 EEE)
  // -------------------------------------------------------------------------
  console.log("👨‍🏫 Seeding teachers...");
  const teachersData = [
    // CSE Teachers
    {
      email: "arahman@cse.ruet.ac.bd",
      name: "Dr. A. Rahman",
      designation: "Professor",
      employeeId: "EMP-CSE-001",
      deptId: cseDept.id,
    },
    {
      email: "bkarim@cse.ruet.ac.bd",
      name: "Dr. B. Karim",
      designation: "Associate Professor",
      employeeId: "EMP-CSE-002",
      deptId: cseDept.id,
    },
    {
      email: "csultana@cse.ruet.ac.bd",
      name: "Ms. C. Sultana",
      designation: "Assistant Professor",
      employeeId: "EMP-CSE-003",
      deptId: cseDept.id,
    },
    // EEE Teachers
    {
      email: "dhossain@eee.ruet.ac.bd",
      name: "Dr. D. Hossain",
      designation: "Professor",
      employeeId: "EMP-EEE-001",
      deptId: eeeDept.id,
    },
    {
      email: "ehaque@eee.ruet.ac.bd",
      name: "Dr. E. Haque",
      designation: "Associate Professor",
      employeeId: "EMP-EEE-002",
      deptId: eeeDept.id,
    },
    {
      email: "fislam@eee.ruet.ac.bd",
      name: "Mr. F. Islam",
      designation: "Lecturer",
      employeeId: "EMP-EEE-003",
      deptId: eeeDept.id,
    },
  ];

  const seededTeachers: Record<string, User> = {};

  for (const t of teachersData) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.name, role: Role.TEACHER, isActive: true },
      create: {
        email: t.email,
        name: t.name,
        passwordHash,
        role: Role.TEACHER,
        isActive: true,
        mustChangePassword: false,
        teacherProfile: {
          create: {
            employeeId: t.employeeId,
            departmentId: t.deptId,
            designation: t.designation,
          },
        },
      },
    });
    seededTeachers[t.email] = user;
  }

  // -------------------------------------------------------------------------
  // 5. STUDENTS (60 CSE Students, Batch 2022, Roll 2203001..2203060)
  // -------------------------------------------------------------------------
  console.log("🎓 Seeding 60 students...");
  const firstNames = [
    "Ibtee",
    "Nahyan",
    "Sadia",
    "Tanvir",
    "Arafat",
    "Nusrat",
    "Mehedi",
    "Fahim",
    "Tasnim",
    "Sakib",
    "Rifat",
    "Sumaiya",
    "Mahmud",
    "Sabbir",
    "Nafis",
    "Sharmin",
    "Zubair",
    "Anika",
    "Samiul",
    "Farhana",
  ];
  const lastNames = [
    "Rahman",
    "Farhan",
    "Afrin",
    "Ahmed",
    "Hossain",
    "Jahan",
    "Hasan",
    "Chowdhury",
    "Khan",
    "Islam",
    "Haque",
    "Akter",
    "Ali",
    "Karim",
    "Siddique",
    "Miah",
  ];

  const seededStudents: User[] = [];

  for (let i = 1; i <= 60; i++) {
    const rollNum = (2203000 + i).toString();
    const fName = firstNames[(i - 1) % firstNames.length];
    const lName = lastNames[(i - 1) % lastNames.length];
    const fullName = `${fName} ${lName}`;
    const email = `${rollNum}@student.ruet.ac.bd`;

    // Edge case: Student 60 has no activity / inactive
    const isActive = true;
    const lastActive =
      i === 60
        ? null
        : new Date(Date.now() - ((i % 10) + 1) * 24 * 60 * 60 * 1000);

    const studentUser = await prisma.user.upsert({
      where: { email },
      update: { name: fullName, role: Role.STUDENT, lastActiveAt: lastActive },
      create: {
        email,
        name: fullName,
        passwordHash,
        role: Role.STUDENT,
        isActive,
        mustChangePassword: false,
        lastActiveAt: lastActive,
        studentProfile: {
          create: {
            studentId: rollNum,
            departmentId: cseDept.id,
            batch: "2022",
            level: 3,
            term: 2,
          },
        },
      },
    });

    seededStudents.push(studentUser);
  }

  // -------------------------------------------------------------------------
  // 6. COURSE CATALOG (6 per Department)
  // -------------------------------------------------------------------------
  console.log("📚 Seeding course catalog...");
  const cseCatalogData = [
    { code: "CSE 3200", title: "System Development Project", credits: 1.5 },
    { code: "CSE 3201", title: "Operating Systems", credits: 3.0 },
    {
      code: "CSE 3203",
      title: "Microprocessors & Microcontrollers",
      credits: 3.0,
    },
    { code: "CSE 3205", title: "Database Management Systems", credits: 3.0 },
    { code: "CSE 3207", title: "Software Engineering", credits: 3.0 },
    { code: "CSE 3209", title: "Artificial Intelligence", credits: 3.0 },
  ];

  const eeeCatalogData = [
    { code: "EEE 3201", title: "Power Electronics", credits: 3.0 },
    { code: "EEE 3203", title: "Signals and Systems", credits: 3.0 },
    { code: "EEE 3205", title: "Electromagnetic Fields & Waves", credits: 3.0 },
    { code: "EEE 3207", title: "Electrical Power Systems II", credits: 3.0 },
    { code: "EEE 3209", title: "Communication Engineering", credits: 3.0 },
    { code: "EEE 3211", title: "Control Systems", credits: 3.0 },
  ];

  const cseCourses: Record<string, Course> = {};
  for (const c of cseCatalogData) {
    const course = await prisma.course.upsert({
      where: { departmentId_code: { departmentId: cseDept.id, code: c.code } },
      update: { title: c.title, credits: new Prisma.Decimal(c.credits) },
      create: {
        code: c.code,
        title: c.title,
        credits: new Prisma.Decimal(c.credits),
        departmentId: cseDept.id,
        description: `${c.title} course for engineering undergraduates.`,
      },
    });
    cseCourses[c.code] = course;
  }

  const eeeCourses: Record<string, Course> = {};
  for (const c of eeeCatalogData) {
    const course = await prisma.course.upsert({
      where: { departmentId_code: { departmentId: eeeDept.id, code: c.code } },
      update: { title: c.title, credits: new Prisma.Decimal(c.credits) },
      create: {
        code: c.code,
        title: c.title,
        credits: new Prisma.Decimal(c.credits),
        departmentId: eeeDept.id,
        description: `${c.title} core curriculum course.`,
      },
    });
    eeeCourses[c.code] = course;
  }

  // -------------------------------------------------------------------------
  // 7. COURSE OFFERINGS (Even Term 2026, 4 per Department, one DRAFT)
  // -------------------------------------------------------------------------
  console.log("📅 Seeding course offerings & sections...");

  // CSE Offering 1: CSE 3205 (PUBLISHED, Sections A & B)
  const dbmsOffering = await prisma.courseOffering.upsert({
    where: { joinCode: "DBMS-2026-EVEN" },
    update: { status: CourseOfferingStatus.PUBLISHED },
    create: {
      courseId: cseCourses["CSE 3205"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.PUBLISHED,
      syllabus:
        "Relational database concepts, SQL, Normalization, Query optimization, NoSQL.",
      joinCode: "DBMS-2026-EVEN",
    },
  });

  // CSE Offering 2: CSE 3201 (PUBLISHED, Section A)
  const osOffering = await prisma.courseOffering.upsert({
    where: { joinCode: "OS-2026-EVEN" },
    update: { status: CourseOfferingStatus.PUBLISHED },
    create: {
      courseId: cseCourses["CSE 3201"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.PUBLISHED,
      syllabus:
        "Processes, Threads, CPU scheduling, Memory virtualization, File systems.",
      joinCode: "OS-2026-EVEN",
    },
  });

  // CSE Offering 3: CSE 3207 (PUBLISHED, Section A)
  const seOffering = await prisma.courseOffering.upsert({
    where: { joinCode: "SE-2026-EVEN" },
    update: { status: CourseOfferingStatus.PUBLISHED },
    create: {
      courseId: cseCourses["CSE 3207"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.PUBLISHED,
      syllabus:
        "Software life cycles, Agile, Requirements engineering, Testing, Architecture.",
      joinCode: "SE-2026-EVEN",
    },
  });

  // CSE Offering 4: CSE 3209 (DRAFT edge case)
  const aiOfferingDraft = await prisma.courseOffering.upsert({
    where: { joinCode: "AI-2026-DRAFT" },
    update: { status: CourseOfferingStatus.DRAFT },
    create: {
      courseId: cseCourses["CSE 3209"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.DRAFT,
      syllabus:
        "Search algorithms, Knowledge representation, Machine learning basics.",
      joinCode: "AI-2026-DRAFT",
    },
  });

  // EEE Offerings (3 PUBLISHED + 1 DRAFT)
  await prisma.courseOffering.upsert({
    where: { joinCode: "EEE-PE-2026" },
    update: { status: CourseOfferingStatus.PUBLISHED },
    create: {
      courseId: eeeCourses["EEE 3201"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.PUBLISHED,
      syllabus: "Power semiconductor devices, Inverters, DC-DC converters.",
      joinCode: "EEE-PE-2026",
    },
  });

  const eeeSignalsOffering = await prisma.courseOffering.upsert({
    where: { joinCode: "EEE-SIG-2026" },
    update: { status: CourseOfferingStatus.PUBLISHED },
    create: {
      courseId: eeeCourses["EEE 3203"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.PUBLISHED,
      syllabus:
        "Continuous and discrete signals, Fourier, Laplace, and Z-transforms.",
      joinCode: "EEE-SIG-2026",
    },
  });

  await prisma.courseOffering.upsert({
    where: { joinCode: "EEE-POW-2026" },
    update: { status: CourseOfferingStatus.PUBLISHED },
    create: {
      courseId: eeeCourses["EEE 3207"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.PUBLISHED,
      syllabus: "Fault analysis, Stability, Grid operations.",
      joinCode: "EEE-POW-2026",
    },
  });

  await prisma.courseOffering.upsert({
    where: { joinCode: "EEE-COMM-DRAFT" },
    update: { status: CourseOfferingStatus.DRAFT },
    create: {
      courseId: eeeCourses["EEE 3209"].id,
      term: "Even",
      academicYear: "2026",
      status: CourseOfferingStatus.DRAFT,
      syllabus: "Analog and digital modulation, Information theory.",
      joinCode: "EEE-COMM-DRAFT",
    },
  });

  // Sections
  const dbmsSectionA = await prisma.section.upsert({
    where: {
      offeringId_name: { offeringId: dbmsOffering.id, name: "Section A" },
    },
    update: {},
    create: { offeringId: dbmsOffering.id, name: "Section A" },
  });

  const dbmsSectionB = await prisma.section.upsert({
    where: {
      offeringId_name: { offeringId: dbmsOffering.id, name: "Section B" },
    },
    update: {},
    create: { offeringId: dbmsOffering.id, name: "Section B" },
  });

  const osSectionA = await prisma.section.upsert({
    where: {
      offeringId_name: { offeringId: osOffering.id, name: "Section A" },
    },
    update: {},
    create: { offeringId: osOffering.id, name: "Section A" },
  });

  const seSectionA = await prisma.section.upsert({
    where: {
      offeringId_name: { offeringId: seOffering.id, name: "Section A" },
    },
    update: {},
    create: { offeringId: seOffering.id, name: "Section A" },
  });

  await prisma.section.upsert({
    where: {
      offeringId_name: { offeringId: aiOfferingDraft.id, name: "Section A" },
    },
    update: {},
    create: { offeringId: aiOfferingDraft.id, name: "Section A" },
  });

  const eeeSignalsSectionA = await prisma.section.upsert({
    where: {
      offeringId_name: { offeringId: eeeSignalsOffering.id, name: "Section A" },
    },
    update: {},
    create: { offeringId: eeeSignalsOffering.id, name: "Section A" },
  });

  // -------------------------------------------------------------------------
  // 8. OFFERING TEACHERS (DBMS has Instructor + TA)
  // -------------------------------------------------------------------------
  console.log("👨‍🏫 Assigning teachers and TAs to offerings...");
  // DBMS: Dr. A. Rahman (Instructor) + Ms. C. Sultana (TA)
  await prisma.offeringTeacher.upsert({
    where: {
      offeringId_userId: {
        offeringId: dbmsOffering.id,
        userId: seededTeachers["arahman@cse.ruet.ac.bd"].id,
      },
    },
    update: { role: OfferingTeacherRole.INSTRUCTOR },
    create: {
      offeringId: dbmsOffering.id,
      userId: seededTeachers["arahman@cse.ruet.ac.bd"].id,
      role: OfferingTeacherRole.INSTRUCTOR,
    },
  });

  await prisma.offeringTeacher.upsert({
    where: {
      offeringId_userId: {
        offeringId: dbmsOffering.id,
        userId: seededTeachers["csultana@cse.ruet.ac.bd"].id,
      },
    },
    update: { role: OfferingTeacherRole.TA },
    create: {
      offeringId: dbmsOffering.id,
      userId: seededTeachers["csultana@cse.ruet.ac.bd"].id,
      role: OfferingTeacherRole.TA,
    },
  });

  // OS: Dr. B. Karim (Instructor)
  await prisma.offeringTeacher.upsert({
    where: {
      offeringId_userId: {
        offeringId: osOffering.id,
        userId: seededTeachers["bkarim@cse.ruet.ac.bd"].id,
      },
    },
    update: { role: OfferingTeacherRole.INSTRUCTOR },
    create: {
      offeringId: osOffering.id,
      userId: seededTeachers["bkarim@cse.ruet.ac.bd"].id,
      role: OfferingTeacherRole.INSTRUCTOR,
    },
  });

  // SE: Dr. A. Rahman (Instructor)
  await prisma.offeringTeacher.upsert({
    where: {
      offeringId_userId: {
        offeringId: seOffering.id,
        userId: seededTeachers["arahman@cse.ruet.ac.bd"].id,
      },
    },
    update: { role: OfferingTeacherRole.INSTRUCTOR },
    create: {
      offeringId: seOffering.id,
      userId: seededTeachers["arahman@cse.ruet.ac.bd"].id,
      role: OfferingTeacherRole.INSTRUCTOR,
    },
  });

  // EEE Signals: Dr. E. Haque (Instructor)
  await prisma.offeringTeacher.upsert({
    where: {
      offeringId_userId: {
        offeringId: eeeSignalsOffering.id,
        userId: seededTeachers["ehaque@eee.ruet.ac.bd"].id,
      },
    },
    update: { role: OfferingTeacherRole.INSTRUCTOR },
    create: {
      offeringId: eeeSignalsOffering.id,
      userId: seededTeachers["ehaque@eee.ruet.ac.bd"].id,
      role: OfferingTeacherRole.INSTRUCTOR,
    },
  });

  // -------------------------------------------------------------------------
  // 9. ENROLLMENTS (Each of 60 students in 4 offerings)
  // -------------------------------------------------------------------------
  console.log("📝 Enrolling 60 students in 4 offerings each...");
  for (let idx = 0; idx < seededStudents.length; idx++) {
    const student = seededStudents[idx];

    // 1. DBMS: First 30 in Section A, next 30 in Section B
    const dbmsSection = idx < 30 ? dbmsSectionA : dbmsSectionB;
    await prisma.enrollment.upsert({
      where: {
        studentId_sectionId: {
          studentId: student.id,
          sectionId: dbmsSection.id,
        },
      },
      update: { status: EnrollmentStatus.ACTIVE },
      create: {
        studentId: student.id,
        sectionId: dbmsSection.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    // 2. OS: Section A
    await prisma.enrollment.upsert({
      where: {
        studentId_sectionId: {
          studentId: student.id,
          sectionId: osSectionA.id,
        },
      },
      update: { status: EnrollmentStatus.ACTIVE },
      create: {
        studentId: student.id,
        sectionId: osSectionA.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });

    // 3. SE: Section A (Edge case: student 58 and 59 dropped)
    const seStatus =
      idx === 57 || idx === 58
        ? EnrollmentStatus.DROPPED
        : EnrollmentStatus.ACTIVE;

    await prisma.enrollment.upsert({
      where: {
        studentId_sectionId: {
          studentId: student.id,
          sectionId: seSectionA.id,
        },
      },
      update: { status: seStatus },
      create: {
        studentId: student.id,
        sectionId: seSectionA.id,
        status: seStatus,
      },
    });

    // 4. EEE Signals: Section A (Inter-departmental elective)
    await prisma.enrollment.upsert({
      where: {
        studentId_sectionId: {
          studentId: student.id,
          sectionId: eeeSignalsSectionA.id,
        },
      },
      update: { status: EnrollmentStatus.ACTIVE },
      create: {
        studentId: student.id,
        sectionId: eeeSignalsSectionA.id,
        status: EnrollmentStatus.ACTIVE,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 10. CONTENT FOR TWO OFFERINGS (DBMS & OS): Modules, Topics, Materials
  // -------------------------------------------------------------------------
  console.log("📑 Seeding modules, topics, and materials for DBMS and OS...");

  // DBMS Topics
  const dbmsTopic1 = await prisma.topic.upsert({
    where: {
      offeringId_name: {
        offeringId: dbmsOffering.id,
        name: "Relational Modeling",
      },
    },
    update: {},
    create: { offeringId: dbmsOffering.id, name: "Relational Modeling" },
  });

  const dbmsTopic2 = await prisma.topic.upsert({
    where: {
      offeringId_name: {
        offeringId: dbmsOffering.id,
        name: "Normalization & Functional Dependencies",
      },
    },
    update: {},
    create: {
      offeringId: dbmsOffering.id,
      name: "Normalization & Functional Dependencies",
    },
  });

  // DBMS 3 Modules
  const dbmsMod1 = await prisma.module.upsert({
    where: { id: "mod-dbms-1" },
    update: {},
    create: {
      id: "mod-dbms-1",
      offeringId: dbmsOffering.id,
      title: "Module 1: Relational Algebra & SQL",
      order: 1,
    },
  });

  const dbmsMod2 = await prisma.module.upsert({
    where: { id: "mod-dbms-2" },
    update: {},
    create: {
      id: "mod-dbms-2",
      offeringId: dbmsOffering.id,
      title: "Module 2: Normalization (1NF to BCNF)",
      order: 2,
    },
  });

  const dbmsMod3 = await prisma.module.upsert({
    where: { id: "mod-dbms-3" },
    update: {},
    create: {
      id: "mod-dbms-3",
      offeringId: dbmsOffering.id,
      title: "Module 3: Transaction Processing & ACID",
      order: 3,
    },
  });

  // DBMS 8 Materials
  const dbmsMaterials = [
    {
      moduleId: dbmsMod1.id,
      title: "Lecture 01: Relational Model Fundamentals",
      type: MaterialType.FILE,
      originalName: "Lecture_01_Relational_Model.pdf",
      mime: "application/pdf",
      sizeBytes: 1540000,
      topicId: dbmsTopic1.id,
      order: 1,
    },
    {
      moduleId: dbmsMod1.id,
      title: "SQL Query Optimization Cheatsheet",
      type: MaterialType.FILE,
      originalName: "SQL_Cheatsheet_RUET.pdf",
      mime: "application/pdf",
      sizeBytes: 780000,
      topicId: dbmsTopic1.id,
      order: 2,
    },
    {
      moduleId: dbmsMod1.id,
      title: "Interactive PostgreSQL Tutorial",
      type: MaterialType.LINK,
      url: "https://www.postgresql.org/docs/current/tutorial.html",
      order: 3,
    },
    {
      moduleId: dbmsMod2.id,
      title: "Lecture 04: Functional Dependencies & Closure",
      type: MaterialType.FILE,
      originalName: "FD_Closure_Algorithms.pdf",
      mime: "application/pdf",
      sizeBytes: 2100000,
      topicId: dbmsTopic2.id,
      order: 1,
    },
    {
      moduleId: dbmsMod2.id,
      title: "Decomposition into 3NF and BCNF Explained",
      type: MaterialType.VIDEO,
      url: "https://youtube.com/watch?v=sample-normalization-ruet",
      topicId: dbmsTopic2.id,
      order: 2,
    },
    {
      moduleId: dbmsMod2.id,
      title: "Normalization Practice Worksheet",
      type: MaterialType.FILE,
      originalName: "Worksheet_Normalization.pdf",
      mime: "application/pdf",
      sizeBytes: 450000,
      topicId: dbmsTopic2.id,
      order: 3,
    },
    {
      moduleId: dbmsMod3.id,
      title: "Lecture 07: Concurrency Control & Two-Phase Locking",
      type: MaterialType.FILE,
      originalName: "Concurrency_2PL.pdf",
      mime: "application/pdf",
      sizeBytes: 1890000,
      order: 1,
    },
    {
      moduleId: dbmsMod3.id,
      title: "PostgreSQL WAL & Recovery Architecture",
      type: MaterialType.LINK,
      url: "https://www.postgresql.org/docs/current/wal-intro.html",
      order: 2,
    },
  ];

  const seededDbmsMaterials: Material[] = [];
  for (let mIdx = 0; mIdx < dbmsMaterials.length; mIdx++) {
    const matData = dbmsMaterials[mIdx];
    const mat = await prisma.material.upsert({
      where: { id: `mat-dbms-${mIdx + 1}` },
      update: {},
      create: {
        id: `mat-dbms-${mIdx + 1}`,
        moduleId: matData.moduleId,
        title: matData.title,
        type: matData.type,
        originalName: matData.originalName,
        mime: matData.mime,
        sizeBytes: matData.sizeBytes,
        url: matData.url,
        topicId: matData.topicId,
        order: matData.order,
        published: true,
        uploadedById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
      },
    });
    seededDbmsMaterials.push(mat);
  }

  // Material Progress for students (except Student 60 who has 0 progress)
  for (let sIdx = 0; sIdx < 50; sIdx++) {
    const student = seededStudents[sIdx];
    for (let mIdx = 0; mIdx < 4; mIdx++) {
      await prisma.materialProgress.upsert({
        where: {
          materialId_studentId: {
            materialId: seededDbmsMaterials[mIdx].id,
            studentId: student.id,
          },
        },
        update: {},
        create: {
          materialId: seededDbmsMaterials[mIdx].id,
          studentId: student.id,
        },
      });
    }
  }

  // OS Modules (3 Modules, 8 Materials)
  const osMod1 = await prisma.module.upsert({
    where: { id: "mod-os-1" },
    update: {},
    create: {
      id: "mod-os-1",
      offeringId: osOffering.id,
      title: "Module 1: Processes and Inter-Process Communication",
      order: 1,
    },
  });

  const osMod2 = await prisma.module.upsert({
    where: { id: "mod-os-2" },
    update: {},
    create: {
      id: "mod-os-2",
      offeringId: osOffering.id,
      title: "Module 2: CPU Scheduling & Synchronization",
      order: 2,
    },
  });

  const osMod3 = await prisma.module.upsert({
    where: { id: "mod-os-3" },
    update: {},
    create: {
      id: "mod-os-3",
      offeringId: osOffering.id,
      title: "Module 3: Virtual Memory & Page Replacement",
      order: 3,
    },
  });

  for (let oIdx = 1; oIdx <= 8; oIdx++) {
    const targetMod = oIdx <= 3 ? osMod1 : oIdx <= 6 ? osMod2 : osMod3;
    await prisma.material.upsert({
      where: { id: `mat-os-${oIdx}` },
      update: {},
      create: {
        id: `mat-os-${oIdx}`,
        moduleId: targetMod.id,
        title: `OS Chapter 0${oIdx}: Operating System Concept ${oIdx}`,
        type: oIdx % 3 === 0 ? MaterialType.LINK : MaterialType.FILE,
        originalName: oIdx % 3 === 0 ? null : `OS_Chapter_0${oIdx}.pdf`,
        mime: oIdx % 3 === 0 ? null : "application/pdf",
        sizeBytes: oIdx % 3 === 0 ? null : 1200000,
        url: oIdx % 3 === 0 ? "https://os-book.com" : null,
        order: oIdx,
        published: true,
        uploadedById: seededTeachers["bkarim@cse.ruet.ac.bd"].id,
      },
    });
  }

  // -------------------------------------------------------------------------
  // 11. ASSIGNMENTS, SUBMISSIONS, VERSIONS & GRADES (DBMS)
  // -------------------------------------------------------------------------
  console.log("📝 Seeding assignments, submissions, and grades...");

  const pastDate10Days = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const pastDate2Days = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const futureDate4Days = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

  // Assignment 1: Past deadline, all graded
  const dbmsA1 = await prisma.assignment.upsert({
    where: { id: "asgn-dbms-1" },
    update: {},
    create: {
      id: "asgn-dbms-1",
      offeringId: dbmsOffering.id,
      title: "Assignment 01: Entity-Relationship Design",
      description:
        "Design an ER diagram for a university library management system.",
      deadline: pastDate10Days,
      maxMarks: new Prisma.Decimal(20.0),
      allowedTypes: ["pdf", "docx"],
      maxSizeMb: 10,
      lateAllowed: true,
      latePenaltyPercent: 10,
      published: true,
      createdById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
    },
  });

  // Assignment 2: Past deadline, some graded, some ungraded (edge case)
  const dbmsA2 = await prisma.assignment.upsert({
    where: { id: "asgn-dbms-2" },
    update: {},
    create: {
      id: "asgn-dbms-2",
      offeringId: dbmsOffering.id,
      title: "Assignment 02: SQL Schema & Complex Queries",
      description:
        "Submit your DDL scripts and analytical queries with execution plans.",
      deadline: pastDate2Days,
      maxMarks: new Prisma.Decimal(20.0),
      allowedTypes: ["pdf", "sql", "zip"],
      maxSizeMb: 15,
      lateAllowed: true,
      latePenaltyPercent: 15,
      published: true,
      createdById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
    },
  });

  // Assignment 3: Upcoming deadline in 4 days
  await prisma.assignment.upsert({
    where: { id: "asgn-dbms-3" },
    update: {},
    create: {
      id: "asgn-dbms-3",
      offeringId: dbmsOffering.id,
      title: "Assignment 03: Database Normalization (3NF/BCNF)",
      description:
        "Decompose the provided unnormalized enterprise schemas into BCNF.",
      deadline: futureDate4Days,
      maxMarks: new Prisma.Decimal(25.0),
      allowedTypes: ["pdf"],
      maxSizeMb: 10,
      lateAllowed: false,
      published: true,
      createdById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
    },
  });

  // OS Assignment 1
  await prisma.assignment.upsert({
    where: { id: "asgn-os-1" },
    update: {},
    create: {
      id: "asgn-os-1",
      offeringId: osOffering.id,
      title: "OS Assignment 01: Multi-threaded Synchronization in C",
      description:
        "Implement the Producer-Consumer problem with POSIX semaphores.",
      deadline: futureDate4Days,
      maxMarks: new Prisma.Decimal(20.0),
      allowedTypes: ["c", "zip", "pdf"],
      maxSizeMb: 10,
      published: true,
      createdById: seededTeachers["bkarim@cse.ruet.ac.bd"].id,
    },
  });

  // Submissions for Assignment 1 (Graded, with versions)
  for (let s = 0; s < 40; s++) {
    const student = seededStudents[s];
    const isLate = s >= 35; // Edge case: Late submissions

    const sub = await prisma.submission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: dbmsA1.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        assignmentId: dbmsA1.id,
        studentId: student.id,
        status: isLate ? SubmissionStatus.LATE : SubmissionStatus.GRADED,
      },
    });

    // Version 1
    await prisma.submissionVersion.upsert({
      where: {
        submissionId_versionNo: { submissionId: sub.id, versionNo: 1 },
      },
      update: {},
      create: {
        submissionId: sub.id,
        versionNo: 1,
        fileKey: `asgn-1/${student.id}/v1.pdf`,
        originalName: "ER_Assignment_v1.pdf",
        mime: "application/pdf",
        sizeBytes: 1240000,
        submittedAt: new Date(pastDate10Days.getTime() - 24 * 60 * 60 * 1000),
        isLate: false,
      },
    });

    // Version 2 for a subset
    if (s % 3 === 0) {
      await prisma.submissionVersion.upsert({
        where: {
          submissionId_versionNo: { submissionId: sub.id, versionNo: 2 },
        },
        update: {},
        create: {
          submissionId: sub.id,
          versionNo: 2,
          fileKey: `asgn-1/${student.id}/v2_revised.pdf`,
          originalName: "ER_Assignment_Final.pdf",
          mime: "application/pdf",
          sizeBytes: 1310000,
          submittedAt: isLate
            ? new Date(pastDate10Days.getTime() + 4 * 60 * 60 * 1000)
            : new Date(pastDate10Days.getTime() - 2 * 60 * 60 * 1000),
          isLate,
        },
      });
    }

    // Grade for student (with marks and feedback)
    const marksObtained = isLate ? 15.0 : 18.0 - (s % 4);
    await prisma.grade.upsert({
      where: { submissionId: sub.id },
      update: {},
      create: {
        submissionId: sub.id,
        marks: new Prisma.Decimal(marksObtained),
        feedback: isLate
          ? "Late submission accepted with 10% penalty. Strong conceptual ER design."
          : "Excellent cardinality constraints and weak entity representation.",
        gradedById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
      },
    });

    // Grade history for student 0 (edge case: grade was revised)
    if (s === 0) {
      await prisma.gradeHistory.create({
        data: {
          submissionId: sub.id,
          oldMarks: new Prisma.Decimal(16.0),
          newMarks: new Prisma.Decimal(18.0),
          changedById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
          reason:
            "Corrected grading for Question 2 after student verification.",
        },
      });
    }
  }

  // Submissions for Assignment 2 (Edge case: Ungraded submissions and missing submissions)
  // Students 0..25 submitted, students 26..60 did NOT submit (missing submission edge case)
  for (let s = 0; s < 25; s++) {
    const student = seededStudents[s];
    const isUngraded = s >= 15; // Edge case: Ungraded submissions

    const sub = await prisma.submission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: dbmsA2.id,
          studentId: student.id,
        },
      },
      update: {},
      create: {
        assignmentId: dbmsA2.id,
        studentId: student.id,
        status: isUngraded
          ? SubmissionStatus.SUBMITTED
          : SubmissionStatus.GRADED,
      },
    });

    await prisma.submissionVersion.upsert({
      where: {
        submissionId_versionNo: { submissionId: sub.id, versionNo: 1 },
      },
      update: {},
      create: {
        submissionId: sub.id,
        versionNo: 1,
        fileKey: `asgn-2/${student.id}/sql_schema.zip`,
        originalName: "SQL_Queries_Solution.zip",
        mime: "application/zip",
        sizeBytes: 850000,
        submittedAt: new Date(pastDate2Days.getTime() - 6 * 60 * 60 * 1000),
        isLate: false,
      },
    });

    if (!isUngraded) {
      await prisma.grade.upsert({
        where: { submissionId: sub.id },
        update: {},
        create: {
          submissionId: sub.id,
          marks: new Prisma.Decimal(17.5),
          feedback: "Great indexing choices and optimized JOIN queries.",
          gradedById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // 12. QUIZZES, QUESTIONS, OPTIONS & ATTEMPTS (DBMS)
  // -------------------------------------------------------------------------
  console.log("📝 Seeding Quiz with 10 questions and student attempts...");
  const dbmsQuiz = await prisma.quiz.upsert({
    where: { id: "quiz-dbms-1" },
    update: {},
    create: {
      id: "quiz-dbms-1",
      offeringId: dbmsOffering.id,
      title: "Quiz 01: Relational Algebra & Normalization",
      description:
        "Covers 1NF, 2NF, 3NF, BCNF, Functional Dependencies, and Relational Calculus.",
      durationMin: 30,
      startAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      maxAttempts: 1,
      shuffleQuestions: true,
      shuffleOptions: true,
      negativeMarkPerWrong: new Prisma.Decimal(0.25),
      showAnswersAfterClose: true,
      published: true,
      createdById: seededTeachers["arahman@cse.ruet.ac.bd"].id,
    },
  });

  const mcqQuestions = [
    {
      text: "Which normal form requires that all non-key attributes are fully functionally dependent on the primary key?",
      type: QuestionType.SINGLE,
      difficulty: QuestionDifficulty.EASY,
      marks: 1.0,
      options: [
        { text: "First Normal Form (1NF)", isCorrect: false },
        { text: "Second Normal Form (2NF)", isCorrect: true },
        { text: "Third Normal Form (3NF)", isCorrect: false },
        { text: "Boyce-Codd Normal Form (BCNF)", isCorrect: false },
      ],
    },
    {
      text: "Which of the following properties guarantees that database transactions are executed reliably?",
      type: QuestionType.SINGLE,
      difficulty: QuestionDifficulty.EASY,
      marks: 1.0,
      options: [
        { text: "ACID properties", isCorrect: true },
        { text: "BASE properties", isCorrect: false },
        { text: "CAP theorem", isCorrect: false },
        { text: "RAID levels", isCorrect: false },
      ],
    },
    {
      text: "A relation is in BCNF if for every functional dependency X -> Y, X is a superkey.",
      type: QuestionType.TRUE_FALSE,
      difficulty: QuestionDifficulty.MEDIUM,
      marks: 1.0,
      options: [
        { text: "True", isCorrect: true },
        { text: "False", isCorrect: false },
      ],
    },
    {
      text: "Which SQL clause is executed first in query processing order?",
      type: QuestionType.SINGLE,
      difficulty: QuestionDifficulty.MEDIUM,
      marks: 1.0,
      options: [
        { text: "SELECT", isCorrect: false },
        { text: "WHERE", isCorrect: false },
        { text: "FROM", isCorrect: true },
        { text: "HAVING", isCorrect: false },
      ],
    },
    {
      text: "Select all relational operators that are considered fundamental operators in Relational Algebra:",
      type: QuestionType.MULTIPLE,
      difficulty: QuestionDifficulty.HARD,
      marks: 2.0,
      options: [
        { text: "Select (sigma)", isCorrect: true },
        { text: "Project (pi)", isCorrect: true },
        { text: "Cartesian Product (x)", isCorrect: true },
        { text: "Natural Join", isCorrect: false },
      ],
    },
    {
      text: "What anomaly is solved by decomposing a table into Third Normal Form (3NF)?",
      type: QuestionType.SINGLE,
      difficulty: QuestionDifficulty.MEDIUM,
      marks: 1.0,
      options: [
        { text: "Partial dependency anomaly", isCorrect: false },
        { text: "Transitive dependency anomaly", isCorrect: true },
        { text: "Multi-valued dependency anomaly", isCorrect: false },
        { text: "Atomicity violation", isCorrect: false },
      ],
    },
    {
      text: "A candidate key must satisfy which two properties?",
      type: QuestionType.MULTIPLE,
      difficulty: QuestionDifficulty.MEDIUM,
      marks: 2.0,
      options: [
        { text: "Uniqueness", isCorrect: true },
        { text: "Irreducibility (Minimality)", isCorrect: true },
        { text: "Must contain auto-increment integers", isCorrect: false },
        { text: "Foreign key reference", isCorrect: false },
      ],
    },
    {
      text: "In Two-Phase Locking (2PL), once a transaction releases any lock, it can acquire new locks.",
      type: QuestionType.TRUE_FALSE,
      difficulty: QuestionDifficulty.HARD,
      marks: 1.0,
      options: [
        { text: "True", isCorrect: false },
        { text: "False", isCorrect: true },
      ],
    },
    {
      text: "What is the primary purpose of a database index?",
      type: QuestionType.SINGLE,
      difficulty: QuestionDifficulty.EASY,
      marks: 1.0,
      options: [
        { text: "To enforce table styling", isCorrect: false },
        { text: "To speed up data retrieval operations", isCorrect: true },
        { text: "To reduce disk storage requirements", isCorrect: false },
        { text: "To encrypt confidential data", isCorrect: false },
      ],
    },
    {
      text: "Which join returns all rows from the left table and matched rows from the right table?",
      type: QuestionType.SINGLE,
      difficulty: QuestionDifficulty.EASY,
      marks: 1.0,
      options: [
        { text: "INNER JOIN", isCorrect: false },
        { text: "LEFT OUTER JOIN", isCorrect: true },
        { text: "RIGHT OUTER JOIN", isCorrect: false },
        { text: "FULL OUTER JOIN", isCorrect: false },
      ],
    },
  ];

  for (let qIdx = 0; qIdx < mcqQuestions.length; qIdx++) {
    const qData = mcqQuestions[qIdx];
    const qId = `q-dbms-${qIdx + 1}`;

    const question = await prisma.question.upsert({
      where: { id: qId },
      update: {},
      create: {
        id: qId,
        quizId: dbmsQuiz.id,
        text: qData.text,
        type: qData.type,
        marks: new Prisma.Decimal(qData.marks),
        difficulty: qData.difficulty,
        order: qIdx + 1,
      },
    });

    for (let optIdx = 0; optIdx < qData.options.length; optIdx++) {
      const opt = qData.options[optIdx];
      await prisma.option.upsert({
        where: { id: `opt-q${qIdx + 1}-${optIdx + 1}` },
        update: {},
        create: {
          id: `opt-q${qIdx + 1}-${optIdx + 1}`,
          questionId: question.id,
          text: opt.text,
          isCorrect: opt.isCorrect,
          order: optIdx + 1,
        },
      });
    }
  }

  // Quiz Attempts for 30 students
  for (let aIdx = 0; aIdx < 30; aIdx++) {
    const student = seededStudents[aIdx];
    await prisma.quizAttempt.upsert({
      where: { id: `attempt-dbms-${student.id}` },
      update: {},
      create: {
        id: `attempt-dbms-${student.id}`,
        quizId: dbmsQuiz.id,
        studentId: student.id,
        startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        submittedAt: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000
        ),
        score: new Prisma.Decimal(8.5 - (aIdx % 3)),
      },
    });
  }

  // -------------------------------------------------------------------------
  // 13. DISCUSSION THREADS & POSTS (DBMS)
  // -------------------------------------------------------------------------
  console.log("💬 Seeding discussion threads and replies...");
  const threadsData = [
    {
      title: "Clarification on BCNF decomposition step in Tutorial 2",
      content:
        "When decomposing R(A, B, C, D) with FDs A->B and B->C, does the intermediate relation preserve dependency B->C?",
      category: ThreadCategory.QUESTION,
      isAnonymous: false,
      author: seededStudents[0],
    },
    {
      title:
        "Anonymous doubt: Will transaction isolation level Serializable be in Midterm?",
      content:
        "Could the instructors please confirm if Phantom reads under Snapshot Isolation are included in syllabus?",
      category: ThreadCategory.DOUBT,
      isAnonymous: true,
      author: seededStudents[2],
    },
    {
      title: "Recommended resources for indexing with B+ Trees",
      content:
        "Sharing an intuitive visual simulator for B+ Tree insertion and split algorithms: https://visualgo.net",
      category: ThreadCategory.RESOURCE,
      isAnonymous: false,
      author: seededTeachers["arahman@cse.ruet.ac.bd"],
    },
    {
      title: "Group study and query practice session on Friday",
      content:
        "Section A students are organizing a peer review session at Central Library Room 204.",
      category: ThreadCategory.DISCUSSION,
      isAnonymous: false,
      author: seededStudents[5],
    },
    {
      title: "Query regarding Assignment 03 late submission policy",
      content:
        "Is there any grace period for power cuts or lab connectivity issues?",
      category: ThreadCategory.QUESTION,
      isAnonymous: false,
      author: seededStudents[8],
    },
  ];

  for (let tIdx = 0; tIdx < threadsData.length; tIdx++) {
    const td = threadsData[tIdx];
    const thread = await prisma.thread.upsert({
      where: { id: `thread-dbms-${tIdx + 1}` },
      update: {},
      create: {
        id: `thread-dbms-${tIdx + 1}`,
        offeringId: dbmsOffering.id,
        authorId: td.author.id,
        title: td.title,
        content: td.content,
        category: td.category,
        isAnonymous: td.isAnonymous,
      },
    });

    // Parent Reply
    const parentReply = await prisma.post.upsert({
      where: { id: `post-t${tIdx + 1}-1` },
      update: {},
      create: {
        id: `post-t${tIdx + 1}-1`,
        threadId: thread.id,
        authorId: seededTeachers["arahman@cse.ruet.ac.bd"].id,
        content:
          tIdx === 0
            ? "Yes, you must check for dependency preservation via closure of FDs. If lost, state it clearly."
            : "Refer to the official course policy on ELMS for all deadlines and exam scopes.",
        isAccepted: tIdx === 0, // Accepted answer edge case!
      },
    });

    // Nested Reply
    await prisma.post.upsert({
      where: { id: `post-t${tIdx + 1}-2` },
      update: {},
      create: {
        id: `post-t${tIdx + 1}-2`,
        threadId: thread.id,
        parentId: parentReply.id,
        authorId: td.author.id,
        content: "Understood, thank you sir!",
      },
    });
  }

  // -------------------------------------------------------------------------
  // 14. ANNOUNCEMENTS & NOTIFICATIONS
  // -------------------------------------------------------------------------
  console.log("📢 Seeding announcements and notifications...");
  await prisma.announcement.upsert({
    where: { id: "ann-dept-1" },
    update: {},
    create: {
      id: "ann-dept-1",
      departmentId: cseDept.id,
      title: "Notice: Academic Calendar for Even Term 2026",
      body: "All students and teachers must follow the revised academic schedule published by the Dean's Office.",
      authorId: cseDeptAdmin.id,
    },
  });

  await prisma.announcement.upsert({
    where: { id: "ann-dbms-1" },
    update: {},
    create: {
      id: "ann-dbms-1",
      offeringId: dbmsOffering.id,
      title: "Class Test 01 on Sunday at 10:00 AM",
      body: "The test will cover Modules 1 and 2. Bring scientific calculators and ID cards.",
      authorId: seededTeachers["arahman@cse.ruet.ac.bd"].id,
    },
  });

  // Seed notification for student 0
  await prisma.notification.upsert({
    where: { dedupeKey: "notif-student-0-welcome" },
    update: {},
    create: {
      userId: seededStudents[0].id,
      type: NotificationType.ACADEMIC,
      title: "Assignment 03 Posted",
      message:
        "Assignment 03: Database Normalization is now open for submissions.",
      link: `/courses/${dbmsOffering.id}/assignments/asgn-dbms-3`,
      dedupeKey: "notif-student-0-welcome",
    },
  });

  // -------------------------------------------------------------------------
  // 15. ANALYTICS SNAPSHOTS (At-risk edge case)
  // -------------------------------------------------------------------------
  console.log("📊 Seeding analytics risk snapshots...");
  // Student 0 (Low risk)
  await prisma.analyticsSnapshot.upsert({
    where: {
      offeringId_studentId_date: {
        offeringId: dbmsOffering.id,
        studentId: seededStudents[0].id,
        date: new Date("2026-10-05"),
      },
    },
    update: {},
    create: {
      offeringId: dbmsOffering.id,
      studentId: seededStudents[0].id,
      date: new Date("2026-10-05"),
      progress: new Prisma.Decimal(88.0),
      riskScore: 12,
      riskLevel: RiskLevel.LOW,
      reasons: ["Regular submission", "High quiz average"],
    },
  });

  // Student 59 (High risk edge case)
  await prisma.analyticsSnapshot.upsert({
    where: {
      offeringId_studentId_date: {
        offeringId: dbmsOffering.id,
        studentId: seededStudents[59].id,
        date: new Date("2026-10-05"),
      },
    },
    update: {},
    create: {
      offeringId: dbmsOffering.id,
      studentId: seededStudents[59].id,
      date: new Date("2026-10-05"),
      progress: new Prisma.Decimal(0.0),
      riskScore: 85,
      riskLevel: RiskLevel.HIGH,
      reasons: [
        "No activity in last 14 days",
        "Missed Assignment 01 and Assignment 02",
        "0 quiz attempts",
      ],
    },
  });

  console.log("✅ Seeding complete!\n");

  // -------------------------------------------------------------------------
  // 16. PRINT CREDENTIALS TABLE
  // -------------------------------------------------------------------------
  console.log(
    "═══════════════════════════════════════════════════════════════════════"
  );
  console.log(
    "                    RUET ELMS SEED ACCOUNTS                          "
  );
  console.log(
    "             (Default Password: " + DEV_PASSWORD + ")               "
  );
  console.log(
    "═══════════════════════════════════════════════════════════════════════"
  );

  const loginsTable = [
    {
      Role: "SUPER_ADMIN",
      Email: superAdmin.email,
      Name: superAdmin.name,
      Dept: "All",
    },
    {
      Role: "DEPT_ADMIN",
      Email: cseDeptAdmin.email,
      Name: cseDeptAdmin.name,
      Dept: "CSE",
    },
    {
      Role: "DEPT_ADMIN",
      Email: eeeDeptAdmin.email,
      Name: eeeDeptAdmin.name,
      Dept: "EEE",
    },
    {
      Role: "TEACHER",
      Email: "arahman@cse.ruet.ac.bd",
      Name: "Dr. A. Rahman",
      Dept: "CSE",
    },
    {
      Role: "TEACHER",
      Email: "bkarim@cse.ruet.ac.bd",
      Name: "Dr. B. Karim",
      Dept: "CSE",
    },
    {
      Role: "TEACHER (TA)",
      Email: "csultana@cse.ruet.ac.bd",
      Name: "Ms. C. Sultana",
      Dept: "CSE",
    },
    {
      Role: "TEACHER",
      Email: "dhossain@eee.ruet.ac.bd",
      Name: "Dr. D. Hossain",
      Dept: "EEE",
    },
    {
      Role: "TEACHER",
      Email: "ehaque@eee.ruet.ac.bd",
      Name: "Dr. E. Haque",
      Dept: "EEE",
    },
    {
      Role: "TEACHER",
      Email: "fislam@eee.ruet.ac.bd",
      Name: "Mr. F. Islam",
      Dept: "EEE",
    },
    {
      Role: "STUDENT (Top)",
      Email: "2203001@student.ruet.ac.bd",
      Name: "Ibtee Rahman",
      Dept: "CSE",
    },
    {
      Role: "STUDENT (Late)",
      Email: "2203036@student.ruet.ac.bd",
      Name: "Late Submitter",
      Dept: "CSE",
    },
    {
      Role: "STUDENT (Dropped)",
      Email: "2203058@student.ruet.ac.bd",
      Name: "Dropped Student",
      Dept: "CSE",
    },
    {
      Role: "STUDENT (Inactive/Risk)",
      Email: "2203060@student.ruet.ac.bd",
      Name: "Farhana Miah",
      Dept: "CSE",
    },
  ];

  console.table(loginsTable);
  console.log(
    "60 total students seeded: 2203001@student.ruet.ac.bd .. 2203060@student.ruet.ac.bd\n"
  );
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
