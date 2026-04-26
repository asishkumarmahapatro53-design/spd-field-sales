import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { AgentActionPanel } from "@/components/agent/AgentActions";
import { AgentReimbursementClaims } from "@/components/agent/AgentReimbursementClaims";
import { AiAssistant } from "@/components/agent/AiAssistant";
import { ReadingLogList } from "@/components/agent/ReadingLogList";
import { ReimbursementSummaryList } from "@/components/agent/ReimbursementSummaryList";
import { requireUser } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user);
  const currentTarget = data.targets[0]?.quantityTarget ?? 0;
  const openTasksCount = data.tasks.filter((task) => task.status === "OPEN").length;
  const todaySummary = data.reimbursementSummaries[0] ?? null;
  const todayStatusLabel =
    !todaySummary
      ? "No record yet"
      : todaySummary.status === "MANUAL_VERIFIED"
      ? "Manager verified"
      : todaySummary.status === "PENDING"
        ? "Awaiting verification"
        : "Verified by agent";

  return (
    <AppShell
      user={user}
      title="Sales Agent Dashboard"
      subtitle="Capture readings, track site leads, request approvals, and keep the reimbursement record complete."
      statusLabel={data.activeSession ? "WORKDAY_OPEN" : "READY"}
      compact
    >
      <section className="metric-grid metric-grid-compact">
        <MetricCard
          label="Office in"
          value={data.activeSession ? toIndiaTimeLabel(data.activeSession.loginAt) : "Not started"}
          note="Login becomes the office in time."
        />
        <MetricCard label="Today's pipeline" value={`${data.pipelineQuantity} CUM`} note="Open opportunity volume" />
        <MetricCard label="Approved quantity" value={`${data.approvedQuantity} CUM`} note="Manager-approved quantity" />
        <MetricCard
          label="Target achievement"
          value={currentTarget ? `${Math.min(Math.round((data.approvedQuantity / currentTarget) * 100), 999)}%` : "0%"}
          note={currentTarget ? `Target ${currentTarget} CUM` : "Waiting for target"}
        />
      </section>

      <Panel title="Action Center" description="Move through the day one workflow at a time.">
        <AgentActionPanel
          user={data.user}
          leads={data.leads}
          leadSites={data.leadSites}
          approvals={data.approvals}
          salesOrderRequests={data.salesOrderRequests}
        />
      </Panel>

      <section className="agent-secondary-grid">
        <Panel title="Daily Logs" description="Compact daily view of readings, tasks, and reimbursement status.">
          <div className="section-stack">
            <div className="three-grid">
              <div className="summary-cell">
                <span className="summary-label">Pending readings</span>
                <strong>{data.readings.filter((reading) => reading.status === "AWAITING_CONFIRMATION").length}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Open tasks</span>
                <strong>{openTasksCount}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Reimbursement</span>
                <strong>{todayStatusLabel}</strong>
              </div>
            </div>

            <ReadingLogList readings={data.readings} />

            <details className="history-toggle">
              <summary>
                <span>Assigned Tasks ({data.tasks.length})</span>
                <span className="history-toggle-copy">Show task list</span>
              </summary>
              <div className="history-panel">
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
              </div>
            </details>

            <details className="history-toggle" open>
              <summary>
                <span>Reimbursement Summary ({data.reimbursementSummaries.length})</span>
                <span className="history-toggle-copy">Show daily reimbursement</span>
              </summary>
              <div className="history-panel">
                <AgentReimbursementClaims claims={data.reimbursementClaims} summaries={data.reimbursementSummaries} />
                <ReimbursementSummaryList summaries={data.reimbursementSummaries} />
              </div>
            </details>
          </div>
        </Panel>

        <Panel
          title="Lead Focus"
          description="Upcoming follow-ups and strongest opportunities stay nearby, but out of the main action flow."
        >
          <div className="data-list">
            {data.leads.length ? (
              data.leads.slice(0, 5).map((lead) => (
                <div key={lead.id} className="data-row">
                  <div className="panel-header">
                    <h4>{lead.siteName}</h4>
                    <StatusBadge value={lead.stage} />
                  </div>
                  <p>{lead.siteAddress}</p>
                  <div className="row-meta">
                    <span>Score {lead.score}/10</span>
                    <span>Follow-up {toIndiaTimeLabel(lead.nextFollowUpAt)}</span>
                    <span>Supplier {lead.currentSupplier}</span>
                    <span>{lead.siteCount ?? 1} site{(lead.siteCount ?? 1) === 1 ? "" : "s"}</span>
                  </div>
                  {lead.primarySiteLatLng ? (
                    <div className="button-row">
                      <a
                        className="button-ghost"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${lead.primarySiteLatLng.lat},${lead.primarySiteLatLng.lng}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get direction
                      </a>
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="note-box">No site leads yet. Your first site visit will create one.</div>
            )}
          </div>
        </Panel>
      </section>
      {/* Floating AI Assistant — available on every scroll position */}
      <AiAssistant agentId={data.user.id} />
    </AppShell>
  );
}
