import { Panel } from "@/components/Panel";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { InformalQuotationRequestCard } from "@/components/agent/InformalQuotationRequestCard";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentInformalQuotationPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user);

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="informal-quotation"
      title="Informal Quotation"
      subtitle="Request an informal quotation for selected lead, site, stakeholder, and grade-wise quantities."
    >
      <Panel title="Request Informal Quotation" description="The salesperson can request, but final document generation still needs manager approval.">
        <InformalQuotationRequestCard
          leads={data.leads}
          leadSites={data.leadSites}
          quotations={data.informalQuotationRequests}
        />
      </Panel>
    </AgentWorkspaceShell>
  );
}
