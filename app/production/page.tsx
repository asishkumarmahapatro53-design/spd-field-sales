import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { ManagerSalesOrderActions } from "@/components/manager/ManagerSalesOrderActions";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ProductionDashboardPage() {
  const user = await requireUser("PRODUCTION_MANAGER");
  const data = await getManagerDashboardData(user);
  const requested = data.salesOrderRequests.filter((entry) => entry.status === "SCHEDULE_PENDING").length;
  const approved = data.salesOrderRequests.filter((entry) => entry.status === "SCHEDULE_APPROVED").length;
  const pumpDispatched = data.salesOrderRequests.filter((entry) => entry.pumpDispatchStatus === "DISPATCHED").length;
  const dumpConfirmed = data.salesOrderRequests.filter(
    (entry) => entry.status === "SCHEDULE_APPROVED" && entry.pumpDispatchStatus === "NOT_DISPATCHED",
  ).length;

  return (
    <AppShell
      user={user}
      title="Production Manager Dashboard"
      subtitle="Approve production schedules and confirm pump or dump before batcher dispatch."
      statusLabel="PRODUCTION_VIEW"
      compact
    >
      <section className="metric-grid mt-24">
        <MetricCard label="Schedule pending" value={requested} note="Waiting for production decision" />
        <MetricCard label="Schedule approved" value={approved} note="Ready for pump/dump decision and dispatch" />
        <MetricCard label="Pump dispatched" value={pumpDispatched} note="Actual casting will be pump" />
        <MetricCard label="Dump/no pump" value={dumpConfirmed} note="Actual casting will be dump" />
      </section>

      <section className="mt-24">
        <ManagerSalesOrderActions requests={data.salesOrderRequests} leads={data.leads} agents={data.agents} />
      </section>
    </AppShell>
  );
}
