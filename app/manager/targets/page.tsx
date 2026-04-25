import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { TargetCard } from "@/components/manager/ManagerActions";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerTargetsPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);

  return (
    <AppShell
      user={user}
      title="Targets Workspace"
      subtitle="Manage monthly agent targets in one clean page instead of mixing planning tools into the dashboard."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="targets" />

      <section className="metric-grid mt-24">
        <MetricCard label="Active agents" value={data.agents.length} note="Sales agents eligible for monthly targets" />
        <MetricCard label="Saved targets" value={data.targets.length} note="Target records in the system" />
        <MetricCard
          label="Plants"
          value={data.plants.length}
          note="Plants currently covered by the manager setup"
        />
        <MetricCard label="Open sessions" value={data.workdaySessions.filter((entry) => entry.status === "OPEN").length} note="Useful for checking live activity against targets" />
      </section>

      <section className="mt-24">
        <TargetCard agents={data.agents} targets={data.targets} />
      </section>
    </AppShell>
  );
}
