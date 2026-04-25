import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { ApprovalDecisionCard } from "@/components/manager/ManagerActions";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerApprovalsPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);
  const pending = data.approvals.filter((entry) => entry.status === "PENDING");
  const approved = data.approvals.filter((entry) => entry.status === "APPROVED").length;
  const rejected = data.approvals.filter((entry) => entry.status === "REJECTED").length;

  return (
    <AppShell
      user={user}
      title="Commercial Approvals"
      subtitle="Review final price requests in one focused workspace with clean approval summaries."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="approvals" />

      <section className="metric-grid mt-24">
        <MetricCard label="Pending" value={pending.length} note="Requests waiting for a manager decision" />
        <MetricCard label="Approved" value={approved} note="Requests already cleared" />
        <MetricCard label="Rejected" value={rejected} note="Requests declined by manager review" />
        <MetricCard label="Tracked leads" value={data.leads.length} note="Lead records linked to approval context" />
      </section>

      <section className="mt-24">
        <ApprovalDecisionCard approvals={data.approvals} agents={data.agents} leads={data.leads} />
      </section>
    </AppShell>
  );
}
