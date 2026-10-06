import { redirect } from "next/navigation";

export default function DeptTeachersPage() {
  redirect("/admin/users?role=TEACHER");
}
