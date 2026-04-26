import { BatcherWorkspace } from "@/components/batcher/BatcherWorkspace";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { requireUser } from "@/lib/auth";
import { getBatcherDashboardData } from "@/lib/repository";
import { toIndiaTimeLabel } from "@/lib/date";

export default async function BatcherPage() {
  const user = await requireUser("BATCHER");
  const data = await getBatcherDashboardData(user);

  const pendingOrders = data.activeOrders.length;
  const totalVolumeRemaining = data.activeOrders.reduce((sum, o) => sum + o.remainingQuantity, 0);
  const idleTrucks = data.fleetVehicles.filter((v) => v.status === "IDLE").length;
  const todayDispatched = data.dispatchRecords.reduce((sum, d) => sum + d.dispatchedQuantityCum, 0);

  return (
    <AppShell
      user={user}
      title={`Batcher Dashboard - ${data.plant?.name || "Unknown Plant"}`}
      subtitle="Plant-scoped dispatch control and fleet management."
      statusLabel="DISPATCH_ACTIVE"
    >
      <section className="metric-grid mt-24">
        <MetricCard label="Approved Orders" value={pendingOrders} note="Queued for dispatch" />
        <MetricCard label="Remaining Volume" value={`${totalVolumeRemaining.toFixed(1)} CUM`} note="Total pending concrete" />
        <MetricCard label="IDLE Trucks" value={`${idleTrucks} / ${data.fleetVehicles.length}`} note="Ready for loading" />
        <MetricCard label="Today's Dispatch" value={`${todayDispatched.toFixed(1)} CUM`} note="Total loaded today" />
      </section>

      <BatcherWorkspace
        plantName={data.plant?.name || "Unknown Plant"}
        activeOrders={data.activeOrders}
        fleetVehicles={data.fleetVehicles}
        mixDesigns={data.mixDesigns}
        dispatchRecords={data.dispatchRecords}
      />
    </AppShell>
  );
}
