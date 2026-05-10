import { Panel } from "@/components/Panel";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { SiteVisitFlowCard } from "@/components/agent/SiteVisitFlowCard";
import { SiteVisitLogList } from "@/components/agent/SiteVisitLogList";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentSiteVisitPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user, {
    sections: ["leads", "leadSites", "siteVisits"],
  });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="site-visit"
      title="Site Visit Entry"
      subtitle="Create lead-site visit reports, capture GPS photos, update stakeholders, and edit submitted reports later."
    >
      <section className="agent-page-grid">
        <Panel title="Submit Site Visit" description="Existing lead/site and new lead/site entry stay in one field workflow.">
          <SiteVisitFlowCard
            agentName={data.user.name}
            employeeId={data.user.employeeId}
            leads={data.leads}
            leadSites={data.leadSites}
          />
        </Panel>

        <Panel title="Submitted Site Visit Reports" description="Submitted reports can be reviewed and edited from here.">
          <SiteVisitLogList siteVisits={data.siteVisits} />
        </Panel>
      </section>
    </AgentWorkspaceShell>
  );
}
