import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  if (user.role === "SALES_AGENT") {
    redirect("/agent");
  }

  if (user.role === "MANAGER") {
    redirect("/manager");
  }

  redirect("/accounting");
}
