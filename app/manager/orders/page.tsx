import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { ManagerSalesOrderActions } from "@/components/manager/ManagerSalesOrderActions";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerOrdersPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);
  const requested = data.salesOrderRequests.filter((entry) => entry.status === "SCHEDULE_PENDING").length;
  const approved = data.salesOrderRequests.filter((entry) => entry.status === "SCHEDULE_APPROVED").length;
  const rejected = data.salesOrderRequests.filter((entry) => entry.status === "SCHEDULE_REJECTED").length;
  const financeVerified = data.salesOrderRequests.filter((entry) => entry.status === "FINANCE_VERIFIED").length;

  return (
    <AppShell
      user={user}
      title="Production Schedule Requests"
      subtitle="Approve or reject schedule slots after finance has verified the commercial sales order request."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="orders" />

      <section className="metric-grid mt-24">
        <MetricCard label="Schedule pending" value={requested} note="Requests waiting for production approval" />
        <MetricCard label="Schedule approved" value={approved} note="Ready for ledger and dispatch handoff" />
        <MetricCard label="Schedule rejected" value={rejected} note="Requests sent back to the agent" />
        <MetricCard label="Finance verified" value={financeVerified} note="Orders ready to be scheduled" />
      </section>

      <section className="mt-24">
        <ManagerSalesOrderActions
          requests={data.salesOrderRequests}
          leads={data.leads}
          agents={data.agents}
        />
      </section>
    </AppShell>
  );
}
