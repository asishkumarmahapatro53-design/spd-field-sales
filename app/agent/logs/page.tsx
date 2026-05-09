import Link from "next/link";
import { Panel } from "@/components/Panel";
import { AgentReimbursementClaims } from "@/components/agent/AgentReimbursementClaims";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { ReadingLogList } from "@/components/agent/ReadingLogList";
import { ReimbursementSummaryList } from "@/components/agent/ReimbursementSummaryList";
import { SiteVisitLogList } from "@/components/agent/SiteVisitLogList";
import { requireUser } from "@/lib/auth";
import { getAgentDashboardData } from "@/lib/repository";

export default async function AgentLogsPage({
  searchParams,
}: {
  searchParams?: Promise<{ history?: string }>;
}) {
  const user = await requireUser("SALES_AGENT");
  const params = await searchParams;
  const historyScope = params?.history === "full" ? "full" : "recent";
  const data = await getAgentDashboardData(user, { historyScope });

  return (
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="logs"
      title="Logs & Claims"
      subtitle="Daily reading history, site visit reports, and reimbursement summaries are grouped away from the main work pages."
    >
      <div className="history-scope-bar">
        <div>
          <strong>{historyScope === "full" ? "Full allowed history" : "Recent view"}</strong>
          <span>
            {historyScope === "full"
              ? "Showing all records allowed for this sales agent only."
              : "Showing the fast recent view. Full history stays available on demand."}
          </span>
        </div>
        <div className="button-row">
          <Link className={historyScope === "recent" ? "button" : "button-ghost"} href="/agent/logs">
            Recent
          </Link>
          <Link className={historyScope === "full" ? "button" : "button-ghost"} href="/agent/logs?history=full">
            Full history
          </Link>
        </div>
      </div>

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
