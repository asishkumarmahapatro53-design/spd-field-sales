import { Panel } from "@/components/Panel";
import { AgentSiteMap } from "@/components/agent/AgentSiteMap";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentMapPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user, {
    sections: ["leads", "leadSites"],
  });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="leads"
      title="Map View"
      subtitle="See all saved lead sites on one map, with pin colors based on lead stage."
    >
      <Panel title="Lead Stage Map" description="Blue talks, yellow negotiating, green finalized, orange missed, gray dead, and red lost. Direction clicks still open Google Maps.">
        <AgentSiteMap markers={data.siteMapMarkers} />
      </Panel>
    </AgentWorkspaceShell>
  );
}
