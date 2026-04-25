import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { VerificationCard } from "@/components/manager/ManagerActions";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerVerificationsPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);
  const manualRequired = data.verificationQueue.length;
  const manualVerified = data.odometerReadings.filter((entry) => entry.status === "MANUAL_VERIFIED").length;
  const awaitingConfirmation = data.odometerReadings.filter((entry) => entry.status === "AWAITING_CONFIRMATION").length;

  return (
    <AppShell
      user={user}
      title="Manual Verification Queue"
      subtitle="Resolve odometer exceptions in a clean review page instead of keeping them expanded on the dashboard."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="verifications" />

      <section className="metric-grid mt-24">
        <MetricCard label="Needs review" value={manualRequired} note="Odometer items waiting for manual input" />
        <MetricCard label="Manual verified" value={manualVerified} note="Entries already corrected by a manager" />
        <MetricCard label="Awaiting agent" value={awaitingConfirmation} note="OCR succeeded but still needs agent confirmation" />
        <MetricCard label="All readings" value={data.odometerReadings.length} note="Captured odometer records in the system" />
      </section>

      <section className="mt-24">
        <VerificationCard verificationQueue={data.verificationQueue} />
      </section>
    </AppShell>
  );
}
