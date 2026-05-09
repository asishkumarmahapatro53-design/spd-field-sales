import { AppShell } from "@/components/AppShell";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { requireUser } from "@/lib/auth";

export default async function ManagerOrdersMovedPage() {
  const user = await requireUser("MANAGER");

  return (
    <AppShell
      user={user}
      title="Production Scheduling Moved"
      subtitle="Production schedule approval and pump/dump confirmation now belong to the Production Manager dashboard."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="orders" />
      <section className="panel mt-24">
        <div className="panel-header">
          <div>
            <h2>Separate Production Dashboard</h2>
            <p className="panel-copy">
              Use employee ID PM6001 to operate production schedules, pump dispatch, and dump/no-pump decisions.
            </p>
          </div>
          <span className="status-badge status-manager_view">/production</span>
        </div>
      </section>
    </AppShell>
  );
}
