import { redirect } from "next/navigation";

export default function DeptStudentsPage() {
  redirect("/admin/users?role=STUDENT");
}
