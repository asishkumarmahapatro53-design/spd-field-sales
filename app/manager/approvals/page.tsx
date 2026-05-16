import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { InformalQuotationDecisionCard } from "@/components/manager/InformalQuotationDecisionCard";
import { ApprovalDecisionCard, CreditOverrideDecisionCard, PoPdcExceptionDecisionCard, ReimbursementVerificationCard } from "@/components/manager/ManagerActions";
import { ManagerSectionNav } from "@/components/manager/ManagerSectionNav";
import { requireUser } from "@/lib/auth";
import { getManagerDashboardData } from "@/lib/repository";

export default async function ManagerApprovalsPage() {
  const user = await requireUser("MANAGER");
  const data = await getManagerDashboardData(user);
  const pendingFinalApprovals = data.approvals.filter((entry) => entry.status === "PENDING");
  const pendingInformalQuotations = data.informalQuotationRequests.filter((entry) => entry.status === "PENDING");
  const pendingReimbursementClaims = data.reimbursementClaims.filter((entry) => entry.status === "CLAIM_REQUESTED" || entry.status === "REQUESTED");
  const pendingPoPdcExceptions = data.salesOrderRequests.filter((entry) => entry.poPdcExceptionStatus === "REQUESTED");
  const approved =
    data.approvals.filter((entry) => entry.status === "APPROVED").length +
    data.informalQuotationRequests.filter((entry) => entry.status === "APPROVED").length;
  const rejected =
    data.approvals.filter((entry) => entry.status === "REJECTED").length +
    data.informalQuotationRequests.filter((entry) => entry.status === "REJECTED").length;

  return (
    <AppShell
      user={user}
      title="Commercial Approvals"
      subtitle="Review final price requests in one focused workspace with clean approval summaries."
      statusLabel="MANAGER_VIEW"
      compact
    >
      <ManagerSectionNav current="approvals" />

      <section className="metric-grid mt-24">
        <MetricCard label="Final price pending" value={pendingFinalApprovals.length} note="Formal price approvals waiting" />
        <MetricCard label="Informal pending" value={pendingInformalQuotations.length} note="Document requests waiting for review" />
        <MetricCard label="Approved" value={approved} note="Formal and informal requests already cleared" />
        <MetricCard label="Rejected" value={rejected} note="Formal and informal requests declined" />
        <MetricCard label="Claim verification" value={pendingReimbursementClaims.length} note="Reimbursements waiting for manager" />
        <MetricCard label="PO/PDC exceptions" value={pendingPoPdcExceptions.length} note="Ledger exceptions waiting" />
      </section>

      <section className="mt-24">
        <ReimbursementVerificationCard claims={data.reimbursementClaims} agents={data.agents} />
      </section>

      <section className="mt-24">
        <PoPdcExceptionDecisionCard requests={data.salesOrderRequests} />
      </section>

      <section className="mt-24">
        <CreditOverrideDecisionCard requests={data.salesOrderRequests} />
      </section>

      <section className="mt-24">
        <InformalQuotationDecisionCard quotations={data.informalQuotationRequests} agents={data.agents} />
      </section>

      <section className="mt-24">
        <ApprovalDecisionCard approvals={data.approvals} agents={data.agents} leads={data.leads} />
      </section>
    </AppShell>
  );
}
