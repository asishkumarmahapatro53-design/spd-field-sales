import { AppShell } from "@/components/AppShell";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { ManagerTrackingWorkspace } from "@/components/manager/ManagerTrackingWorkspace";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerTrackingPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);

  return (
    <AppShell
      user={user}
      title="Sales Agent Tracking"
      subtitle="Open one focused tracking page for live day summaries, date-based review, and captured field events."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="tracking" />
      <ManagerTrackingWorkspace data={data} />
    </AppShell>
  );
}
