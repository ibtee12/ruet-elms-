import { Role } from "@prisma/client";
import {
  LayoutDashboard,
  BookOpen,
  FileCheck2,
  HelpCircle,
  Award,
  Calendar,
  Bell,
  User,
  Users,
  Building2,
  ShieldCheck,
  Settings,
  Megaphone,
  BarChart3,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export const ROLE_NAVIGATION: Record<Role, NavItem[]> = {
  STUDENT: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "My Courses", href: "/courses", icon: BookOpen },
    { title: "Assignments", href: "/assignments", icon: FileCheck2 },
    { title: "Quizzes", href: "/quizzes", icon: HelpCircle },
    { title: "Grades", href: "/grades", icon: Award },
    { title: "Calendar", href: "/calendar", icon: Calendar },
    { title: "Notifications", href: "/notifications", icon: Bell },
    { title: "Profile", href: "/profile", icon: User },
  ],
  TEACHER: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "My Courses", href: "/teach", icon: BookOpen },
    { title: "Assignments", href: "/teach/assignments", icon: FileCheck2 },
    { title: "Quizzes", href: "/teach/quizzes", icon: HelpCircle },
    { title: "Gradebook", href: "/teach/gradebook", icon: Award },
    { title: "Calendar", href: "/calendar", icon: Calendar },
    { title: "Notifications", href: "/notifications", icon: Bell },
    { title: "Profile", href: "/profile", icon: User },
  ],
  DEPT_ADMIN: [
    { title: "Dashboard", href: "/dept", icon: LayoutDashboard },
    { title: "Offerings", href: "/dept/offerings", icon: BookOpen },
    { title: "Teachers", href: "/dept/teachers", icon: Users },
    { title: "Students", href: "/dept/students", icon: GraduationCap },
    { title: "Announcements", href: "/dept/announcements", icon: Megaphone },
    { title: "Stats", href: "/dept/stats", icon: BarChart3 },
    { title: "Audit Logs", href: "/dept/audit-logs", icon: ShieldCheck },
    { title: "Profile", href: "/profile", icon: User },
  ],
  SUPER_ADMIN: [
    { title: "Dashboard", href: "/admin", icon: LayoutDashboard },
    { title: "Users", href: "/admin/users", icon: Users },
    { title: "Departments", href: "/admin/departments", icon: Building2 },
    { title: "Courses", href: "/admin/courses", icon: BookOpen },
    { title: "Audit Logs", href: "/admin/audit-logs", icon: ShieldCheck },
    { title: "Settings", href: "/admin/settings", icon: Settings },
    { title: "Profile", href: "/profile", icon: User },
  ],
};

export const STUDENT_BOTTOM_TABS: NavItem[] = [
  { title: "Home", href: "/dashboard", icon: LayoutDashboard },
  { title: "Courses", href: "/courses", icon: BookOpen },
  { title: "Calendar", href: "/calendar", icon: Calendar },
  { title: "Alerts", href: "/notifications", icon: Bell },
];
