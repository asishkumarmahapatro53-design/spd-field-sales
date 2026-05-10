import { Panel } from "@/components/Panel";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { ApprovalRequestCard } from "@/components/agent/CommercialRequestCards";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentApprovalPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user, {
    sections: ["leads", "leadSites", "approvals"],
  });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="approval"
      title="Final Approval"
      subtitle="Send negotiated commercial terms to the manager before creating a sales or SLA order request."
    >
      <Panel title="Raise Approval Request" description="Manager approval is required before the salesperson can move to order request.">
        <ApprovalRequestCard leads={data.leads} leadSites={data.leadSites} approvals={data.approvals} />
      </Panel>
    </AgentWorkspaceShell>
  );
}
