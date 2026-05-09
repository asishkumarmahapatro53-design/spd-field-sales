import { Panel } from "@/components/Panel";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { InstantPriceCard } from "@/components/agent/InstantPriceCard";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentInstantPricePage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user);

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="instant-price"
      title="Instant Price"
      subtitle="Use the saved grade formula to estimate a working site price without opening commercial request forms."
    >
      <Panel title="Instant Price Calculator" description="Quick calculator for field discussion only. Final terms still require approval.">
        <InstantPriceCard />
      </Panel>
    </AgentWorkspaceShell>
  );
}
