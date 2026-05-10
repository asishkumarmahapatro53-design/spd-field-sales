import { Panel } from "@/components/Panel";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { SalesOrderRequestCard } from "@/components/agent/CommercialRequestCards";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentSalesOrderPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user, {
    sections: ["approvals", "salesOrders"],
  });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="sales-order"
      title="Sales/SLA Order"
      subtitle="Create finance-ready sales order requests from approved terms, including GST and billing details."
    >
      <Panel title="Create Sales/SLA Order Request" description="Accounts will verify ledger and finance documents before order release.">
        <SalesOrderRequestCard approvals={data.approvals} salesOrderRequests={data.salesOrderRequests} />
      </Panel>
    </AgentWorkspaceShell>
  );
}
