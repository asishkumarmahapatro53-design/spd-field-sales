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

  if (user.role === "BATCHER") {
    redirect("/batcher");
  }

  if (user.role === "MIX_DESIGN") {
    redirect("/mix-design");
  }

  if (user.role === "PRODUCTION_MANAGER") {
    redirect("/production");
  }

  redirect("/accounting");
}
