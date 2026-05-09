import { Panel } from "@/components/Panel";
import { AgentReimbursementClaims } from "@/components/agent/AgentReimbursementClaims";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { ReadingLogList } from "@/components/agent/ReadingLogList";
import { ReimbursementSummaryList } from "@/components/agent/ReimbursementSummaryList";
import { SiteVisitLogList } from "@/components/agent/SiteVisitLogList";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentLogsPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user);

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="logs"
      title="Logs & Claims"
      subtitle="Daily reading history, site visit reports, and reimbursement summaries are grouped away from the main work pages."
    >
      <section className="agent-page-grid">
        <Panel title="Reading Log" description="Pending confirmations and full odometer history.">
          <ReadingLogList readings={data.readings} />
        </Panel>

        <Panel title="Site Visit Reports" description="Submitted site visit reports can still be reviewed and edited.">
          <SiteVisitLogList siteVisits={data.siteVisits} />
        </Panel>

        <Panel title="Reimbursement" description="Claim records and daily reimbursement summary.">
          <div className="section-stack">
            <AgentReimbursementClaims claims={data.reimbursementClaims} summaries={data.reimbursementSummaries} />
            <ReimbursementSummaryList summaries={data.reimbursementSummaries} />
          </div>
        </Panel>
      </section>
    </AgentWorkspaceShell>
  );
}
