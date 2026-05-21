import { Panel } from "@/components/Panel";
import { AgentLeadFocus } from "@/components/agent/AgentLeadFocus";
import { AgentSiteMap } from "@/components/agent/AgentSiteMap";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentLeadsPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user, {
    sections: ["leads", "leadSites"],
  });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="leads"
      title="Lead Focus"
      subtitle="Review tracked sites, follow-up timing, supplier info, score, and map direction without opening the visit form."
    >
      <Panel title="Map View" description="Lead-stage colored site markers, missing-location records, and Google direction shortcuts for field planning.">
        <div className="button-row">
          <Link className="button-secondary" href="/agent/map">
            Open lead map
          </Link>
        </div>
        <AgentSiteMap markers={data.siteMapMarkers} />
      </Panel>

      <Panel title="Tracked Leads" description="Use this page for follow-up planning and site direction shortcuts.">
        <AgentLeadFocus leads={data.leads} />
      </Panel>
    </AgentWorkspaceShell>
  );
}
