import { Panel } from "@/components/Panel";
import { OdometerUploadCard } from "@/components/agent/AgentActions";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { ReadingLogList } from "@/components/agent/ReadingLogList";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentOdometerPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user, {
    sections: ["readings"],
  });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="odometer"
      title="Odometer Capture"
      subtitle="Take the start or end odometer photo, confirm OCR, and review reading history from one focused page."
    >
      <section className="agent-page-grid">
        <Panel title="Upload Reading" description="Camera capture stays separate so the agent does not scroll through other workflows.">
          <OdometerUploadCard agentName={data.user.name} employeeId={data.user.employeeId} />
        </Panel>

        <Panel title="Reading Log" description="Pending confirmations and resolved reading history.">
          <ReadingLogList readings={data.readings} />
        </Panel>
      </section>
    </AgentWorkspaceShell>
  );
}
