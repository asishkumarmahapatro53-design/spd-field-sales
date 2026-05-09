import { Panel } from "@/components/Panel";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { ScheduleRequestCard } from "@/components/agent/CommercialRequestCards";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentOrderStatusPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user);

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="order-status"
      title="Order Status"
      subtitle="Track finance-verified order requests while Accounts and production move them forward."
    >
      <Panel title="Sales Order Status" description="Ledger-created and finance-verified requests stay visible here.">
        <ScheduleRequestCard salesOrderRequests={data.salesOrderRequests} />
      </Panel>
    </AgentWorkspaceShell>
  );
}
