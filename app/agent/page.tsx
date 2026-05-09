import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { AgentLeadFocus } from "@/components/agent/AgentLeadFocus";
import { AgentWorkspaceShell } from "@/components/agent/AgentWorkspaceShell";
import { requireUser } from "@/lib/auth";
import { toIndiaTimeLabel } from "@/lib/date";
import { getAgentDashboardData } from "@/lib/repository";

type ActionIcon = "odometer" | "site" | "price" | "quote" | "approval" | "order" | "status" | "help";

const ACTION_TILES: Array<{ href: string; label: string; icon: ActionIcon; highlight?: boolean }> = [
  { href: "/agent/odometer", label: "Odometer", icon: "odometer" },
  { href: "/agent/site-visit", label: "Site Visit", icon: "site" },
  { href: "/agent/instant-price", label: "Price", icon: "price" },
  { href: "/agent/informal-quotation", label: "Quotation", icon: "quote" },
  { href: "/agent/approval", label: "Final Approval", icon: "approval" },
  { href: "/agent/sales-order", label: "Sales Order", icon: "order" },
  { href: "/agent/order-status", label: "Status", icon: "status" },
  { href: "/agent/help", label: "Help", icon: "help", highlight: true },
];

function ActionTileIcon({ icon }: { icon: ActionIcon }) {
  const shared = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  };

  switch (icon) {
    case "odometer":
      return (
        <svg {...shared}>
          <path d="M4 15.5a8 8 0 1 1 16 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="m12 15 4-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          <path d="M7 17h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "site":
      return (
        <svg {...shared}>
          <path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" stroke="currentColor" strokeWidth="1.9" />
          <path d="M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" stroke="currentColor" strokeWidth="1.9" />
        </svg>
      );
    case "price":
      return (
        <svg {...shared}>
          <path d="M8 5h8M8 9h8M9 13h4a3 3 0 0 0 0-6H8l7 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "quote":
      return (
        <svg {...shared}>
          <path d="M7 3h7l4 4v14H7V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 3v5h5M9.5 12h5M9.5 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "approval":
      return (
        <svg {...shared}>
          <path d="M6 4h12v16H6V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="m8.5 12 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "order":
      return (
        <svg {...shared}>
          <path d="M5 5h2l1.4 9.2a2 2 0 0 0 2 1.8h5.7a2 2 0 0 0 1.9-1.4L20 8H8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 20h.1M17 20h.1" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "status":
      return (
        <svg {...shared}>
          <path d="M5 19V5M5 19h14M9 16v-5M13 16V8M17 16v-2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9.8 9.2a2.3 2.3 0 1 1 3.8 1.8c-.9.7-1.6 1.1-1.6 2.3M12 17h.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
  }
}

export default async function AgentPage() {
  const user = await requireUser("SALES_AGENT");
  const data = await getAgentDashboardData(user);
  const firstName = data.user.name.split(" ")[0] || data.user.name;
  const currentTarget = data.targets[0]?.quantityTarget ?? 0;
  const openTasksCount = data.tasks.filter((task) => task.status === "OPEN").length;
  const pendingReadingsCount = data.readings.filter((reading) => reading.status === "AWAITING_CONFIRMATION").length;
  const pendingInformalQuotations = data.informalQuotationRequests.filter((quotation) => quotation.status === "PENDING").length;
  const pendingApprovals = data.approvals.filter((approval) => approval.status === "PENDING").length;
  const latestVisit = data.siteVisits[0] ?? null;
  const rejectedGstOrder = data.salesOrderRequests.find((order) => order.gstVerificationStatus === "REJECTED") ?? null;
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
    <AgentWorkspaceShell
      user={data.user}
      activeSession={data.activeSession}
      current="overview"
      title={`Hi, ${firstName}`}
      subtitle={`Senior Sales Agent - ${data.user.employeeId}`}
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

      <section className="agent-command-board">
        <div className="agent-command-center">
          <section className="agent-action-center">
            <div className="agent-command-section-title">
              <h2>Action Center</h2>
              <p>Core field work stays in the center, one page per job.</p>
            </div>
            <div className="agent-action-tile-grid">
              {ACTION_TILES.map((item) => (
                <Link key={item.href} href={item.href} className={item.highlight ? "agent-action-tile is-help" : "agent-action-tile"}>
                  <span className="agent-action-tile-icon">
                    <ActionTileIcon icon={item.icon} />
                  </span>
                  <strong>{item.label}</strong>
                </Link>
              ))}
            </div>
          </section>

          <section className="agent-log-panel">
            <div className="agent-log-header">
              <h2>Operational Logs</h2>
              <div className="button-row">
                <Link className="button-ghost" href="/agent/logs">
                  History
                </Link>
                <Link className="button" href="/agent/site-visit">
                  New Entry
                </Link>
              </div>
            </div>
            <div className="agent-log-list">
              <div className="agent-log-row">
                <span className="agent-log-icon">KM</span>
                <div>
                  <strong>Odometer Reading Required</strong>
                  <p>{pendingReadingsCount} reading item{pendingReadingsCount === 1 ? "" : "s"} need confirmation</p>
                </div>
                <Link className="button-ghost" href="/agent/odometer">
                  Confirm
                </Link>
              </div>
              <div className="agent-log-row">
                <span className="agent-log-icon is-warm">SV</span>
                <div>
                  <strong>{latestVisit ? latestVisit.siteName : "No site visit submitted today"}</strong>
                  <p>{latestVisit ? `Visited ${toIndiaTimeLabel(latestVisit.visitedAt)} | Site readiness ${latestVisit.score}/10` : "Create the first field report from Site Visit."}</p>
                </div>
                <Link className="button-ghost" href="/agent/site-visit">
                  Open
                </Link>
              </div>
              <div className="agent-log-row is-danger">
                <span className="agent-log-icon is-danger">GST</span>
                <div>
                  <strong>{rejectedGstOrder ? "Action: Re-verify GSTIN" : "GSTIN validation active"}</strong>
                  <p>{rejectedGstOrder ? `${rejectedGstOrder.customerName} needs accounts correction` : "New GST orders verify legal name and billing address."}</p>
                </div>
                <Link className="button-danger" href="/agent/sales-order">
                  Resolve Now
                </Link>
              </div>
            </div>
          </section>

          <section className="agent-payment-card">
            <div>
              <h2>Payment Claims & Reimbursement</h2>
              <p>{todayStatusLabel}</p>
            </div>
            <div className="agent-payment-grid">
              <div>
                <span>Claimable amount</span>
                <strong>Rs {Math.round(todaySummary?.totalAmount ?? 0).toLocaleString("en-IN")}</strong>
              </div>
              <div>
                <span>Accrued days</span>
                <strong>{data.reimbursementSummaries.length} Days</strong>
              </div>
              <Link className="agent-payment-button" href="/agent/logs">
                Request Claim
              </Link>
            </div>
          </section>
        </div>

        <aside className="agent-command-right">
          <section className="agent-right-card">
            <div className="agent-right-card-header">
              <h2>Lead Focus</h2>
              <span className="agent-filter-lines" aria-hidden="true" />
            </div>
            <AgentLeadFocus leads={data.leads} maxItems={3} />
            <Link className="agent-wide-button" href="/agent/leads">
              View All Leads
            </Link>
          </section>

          <section className="agent-compliance-card">
            <h2>Compliance Monitor</h2>
            <ul>
              <li>Quotations strictly restricted to in-app view only.</li>
              <li>{pendingApprovals} approval request{pendingApprovals === 1 ? "" : "s"} waiting for manager action.</li>
              <li>GSTIN auto-validation active on sales order creation.</li>
              <li>{openTasksCount} open support task{openTasksCount === 1 ? "" : "s"} in the work queue.</li>
            </ul>
          </section>
        </aside>
      </section>
    </AgentWorkspaceShell>
  );
}
