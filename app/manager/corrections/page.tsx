import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { HelpResolutionCard } from "@/components/manager/ManagerActions";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerCorrectionsPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);
  const openRequests = data.helpRequests.filter((entry) => entry.status === "OPEN").length;
  const resolvedRequests = data.helpRequests.filter((entry) => entry.status === "RESOLVED").length;

  return (
    <AppShell
      user={user}
      title="Correction Requests"
      subtitle="Review timing and entry exceptions in a separate manager support workspace."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="corrections" />

      <section className="metric-grid mt-24">
        <MetricCard label="Open requests" value={openRequests} note="Agent corrections still waiting" />
        <MetricCard label="Resolved" value={resolvedRequests} note="Requests already handled by managers" />
        <MetricCard label="Active agents" value={data.agents.length} note="Sales users who may raise support requests" />
        <MetricCard label="Workday sessions" value={data.workdaySessions.length} note="Recorded sessions behind correction activity" />
      </section>

      <section className="mt-24">
        <HelpResolutionCard helpRequests={data.helpRequests} />
      </section>
    </AppShell>
  );
}
