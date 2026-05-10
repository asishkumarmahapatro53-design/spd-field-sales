import { Panel } from "@/components/Panel";
import { HelpRequestCard } from "@/components/agent/AgentActions";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { requireUser } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentHelpPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user, {
    sections: ["tasks"],
  });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="help"
      title="Help & Corrections"
      subtitle="Raise correction requests and review tasks assigned by manager or accounts."
    >
      <section className="agent-page-grid">
        <Panel title="Correction Request" description="Use this when timings, readings, or visit updates need manual correction.">
          <HelpRequestCard />
        </Panel>

        <Panel title="Assigned Tasks" description="Open work assigned to the sales agent.">
          <div className="data-list">
            {data.tasks.length ? (
              data.tasks.map((task) => (
                <div key={task.id} className="data-row">
                  <h4>{task.subject}</h4>
                  <p>{task.explanation}</p>
                  <div className="row-meta">
                    <span>Deadline {toIndiaTimeLabel(task.deadline)}</span>
                    <span>{task.status}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="note-box">No secondary tasks assigned.</div>
            )}
          </div>
        </Panel>
      </section>
    </AgentWorkspaceShell>
  );
}
