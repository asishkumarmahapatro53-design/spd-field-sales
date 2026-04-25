import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { TaskAssignmentCard } from "@/components/manager/ManagerActions";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { toIndiaTimeLabel } from "@/lib/date";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerTasksPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);
  const openTasks = data.tasks.filter((entry) => entry.status === "OPEN");
  const doneTasks = data.tasks.filter((entry) => entry.status === "DONE").length;
  const agentById = new Map(data.agents.map((entry) => [entry.id, entry]));

  return (
    <AppShell
      user={user}
      title="Agent Tasks Workspace"
      subtitle="Assign secondary work in a clean page and review open assignments without cluttering the main dashboard."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="tasks" />

      <section className="metric-grid mt-24">
        <MetricCard label="Open tasks" value={openTasks.length} note="Assignments still waiting for completion" />
        <MetricCard label="Completed" value={doneTasks} note="Tasks already marked as done" />
        <MetricCard label="Agents" value={data.agents.length} note="Active sales agents available for assignment" />
        <MetricCard label="Approvals waiting" value={data.approvals.filter((entry) => entry.status === "PENDING").length} note="Keep an eye on parallel manager workloads" />
      </section>

      <section className="manager-two-column mt-24">
        <TaskAssignmentCard agents={data.agents} />

        <Panel
          title="Open Assignments"
          description="Current secondary tasks already assigned to agents."
        >
          <div className="data-list">
            {openTasks.length ? (
              [...openTasks]
                .sort((left, right) => left.deadline.localeCompare(right.deadline))
                .map((task) => (
                  <div key={task.id} className="data-row">
                    <div className="panel-header">
                      <h4>{task.subject}</h4>
                      <span className="status-badge status-pending">{task.status}</span>
                    </div>
                    <p>{task.explanation}</p>
                    <div className="row-meta">
                      <span>{agentById.get(task.assignedTo)?.name ?? task.assignedTo}</span>
                      <span>Deadline {toIndiaTimeLabel(task.deadline)}</span>
                    </div>
                  </div>
                ))
            ) : (
              <div className="success-box">No open assignments right now.</div>
            )}
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}
