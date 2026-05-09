import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { ManagerProfitabilityIndex } from "@/components/manager/ManagerProfitabilityIndex";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { ManagerWorkspaceCard } from "@/components/manager/ManagerWorkspaceCard";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);
  const pendingApprovals = data.approvals.filter((entry) => entry.status === "PENDING").length;
  const pendingInformalQuotations = data.informalQuotationRequests.filter((entry) => entry.status === "PENDING").length;
  const pendingCommercialDecisions = pendingApprovals + pendingInformalQuotations;
  const pendingOrders = data.salesOrderRequests.filter((entry) => entry.status === "SCHEDULE_PENDING").length;
  const openCorrections = data.helpRequests.filter((entry) => entry.status === "OPEN").length;
  const openSessions = data.workdaySessions.filter((entry) => entry.status === "OPEN").length;
  const openTasks = data.tasks.filter((entry) => entry.status === "OPEN").length;
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const plantSummaries = data.plants.map((plant) => {
    const plantAgentIds = new Set(
      data.agents.filter((agent) => agent.homePlantId === plant.id && agent.status === "ACTIVE").map((agent) => agent.id),
    );

    return {
      id: plant.id,
      name: plant.name,
      region: plant.region,
      agents: plantAgentIds.size,
      activeToday: data.workdaySessions.filter(
        (session) => session.plantId === plant.id && session.date === todayKey && plantAgentIds.has(session.userId),
      ).length,
      pendingApprovals:
        data.approvals.filter((entry) => entry.plantId === plant.id && entry.status === "PENDING").length +
        data.informalQuotationRequests.filter((entry) => entry.plantId === plant.id && entry.status === "PENDING").length,
    };
  });

  return (
    <AppShell
      user={user}
      title="Manager Command Center"
      subtitle="Use focused workspaces instead of one long dashboard. Open the exact manager section you want to work in."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="overview" />

      <section className="metric-grid mt-24">
        <MetricCard label="Agents on duty" value={openSessions} note="Open workday sessions across plants" />
        <MetricCard label="Pending decisions" value={pendingCommercialDecisions} note="Final approvals and informal quotations waiting" />
        <MetricCard label="Pending orders" value={pendingOrders} note="Sales/SLA requests waiting for decision" />
        <MetricCard label="Open corrections" value={openCorrections} note="Agent support requests" />
      </section>

      <ManagerProfitabilityIndex
        plants={data.plants}
        leads={data.leads}
        approvals={data.approvals}
        siteVisits={data.siteVisits}
        materialCosts={data.materialCostSnapshots}
        priceBenchmarks={data.priceBenchmarks}
      />

      <section className="manager-workspace-grid mt-24">
        <ManagerWorkspaceCard
          eyebrow="Live day view"
          title="Sales Agent Tracking"
          value={openSessions}
          note="Open one clean tracking workspace with date selection, agent roster, timings, visits, and captured locations."
          href="/manager/tracking"
        />
        <ManagerWorkspaceCard
          eyebrow="Commercial"
          title="Pending Approvals"
          value={pendingCommercialDecisions}
          note="Review final price requests and informal quotation documents in one focused decision page."
          href="/manager/approvals"
        />
        <ManagerWorkspaceCard
          eyebrow="Production schedule"
          title="Production Handoff"
          value={pendingOrders}
          note="Production approval now runs from the separate Production Manager dashboard."
          href="/manager/orders"
        />
        <ManagerWorkspaceCard
          eyebrow="Exception handling"
          title="Manual Verifications"
          value={data.verificationQueue.length}
          note="Resolve odometer exceptions in one dedicated review page with photo links and manual values."
          href="/manager/verifications"
        />
        <ManagerWorkspaceCard
          eyebrow="Support"
          title="Correction Requests"
          value={openCorrections}
          note="Handle missed timings and field corrections in a separate exception workspace."
          href="/manager/corrections"
        />
        <ManagerWorkspaceCard
          eyebrow="Planning"
          title="Set Targets"
          value={data.targets.length}
          note="Update monthly goals for agents without mixing target forms into the main dashboard."
          href="/manager/targets"
        />
        <ManagerWorkspaceCard
          eyebrow="Execution"
          title="Assign Tasks"
          value={openTasks}
          note="Create and review secondary assignments in one page built only for manager task flow."
          href="/manager/tasks"
        />
      </section>

      <section className="manager-plant-snapshot-grid mt-24">
        {plantSummaries.map((plant) => (
          <article key={plant.id} className="manager-plant-snapshot">
            <div className="panel-header">
              <div>
                <span className="metric-label">Plant snapshot</span>
                <h3>{plant.name}</h3>
              </div>
              <span className="status-badge status-manager_view">{plant.region}</span>
            </div>
            <div className="row-meta">
              <span>{plant.agents} active agents</span>
              <span>{plant.activeToday} sessions today</span>
              <span>{plant.pendingApprovals} approvals waiting</span>
            </div>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
