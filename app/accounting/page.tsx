import { AccountingWorkspace } from "@/components/accounting/AccountingWorkspace";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { requireUser } from "@/lib/auth";
import { getLedgerCustomerNames } from "@/lib/customer-ledger";
import { getAccountingDashboardData } from "@/lib/repository";

export default async function AccountingPage() {
  const user = await requireUser("ACCOUNTING");
  const data = await getAccountingDashboardData(user);
  const paidClaimIds = new Set(data.reimbursementClaims.filter((entry) => entry.status === "PAID").map((entry) => entry.id));
  const pendingFinanceOrders = data.salesOrderRequests.filter((entry) => entry.status === "PENDING_FINANCE").length;
  const totalOutstanding = data.reimbursements.reduce((sum, entry) => {
    if (!entry.totalAmount) {
      return sum;
    }

    if (entry.claimId && paidClaimIds.has(entry.claimId)) {
      return sum;
    }

    return sum + entry.totalAmount;
  }, 0);

  const customerLedgerNames = getLedgerCustomerNames({
    customerAccounts: data.customerAccounts,
    customerLedgerEntries: data.customerLedgerEntries,
    salesOrderRequests: data.salesOrderRequests,
  });
  const customerLedgerBalance = data.customerLedgerEntries.reduce((sum, entry) => {
    return entry.type === "DEBIT" ? sum + entry.amount : sum - entry.amount;
  }, 0);

  return (
    <AppShell
      user={user}
      title="Accounting Dashboard"
      subtitle="Department payment workspace for claims, reimbursements, OTP verification, and export review."
      statusLabel="ACCOUNTING_VIEW"
    >
      <section className="metric-grid mt-24">
        <MetricCard label="Pending claims" value={data.reimbursementClaims.filter((entry) => entry.status === "REQUESTED" || entry.status === "OTP_SENT").length} note="Needs accountant action" />
        <MetricCard label="Sales ledgers" value={data.agents.length} note="Active agent payment files" />
        <MetricCard label="Ledger queue" value={pendingFinanceOrders} note="Sales requests waiting for ledger creation" />
        <MetricCard label="Outstanding amount" value={`₹${Math.round(totalOutstanding).toLocaleString("en-IN")}`} note="Unpaid verified reimbursements" />
        <MetricCard label="Paid claims" value={data.reimbursementClaims.filter((entry) => entry.status === "PAID").length} note="OTP verified payments" />
        <MetricCard label="Customer ledgers" value={customerLedgerNames.length} note="Active client accounts" />
        <MetricCard label="Customer outstanding" value={`₹${Math.round(Math.max(0, customerLedgerBalance)).toLocaleString("en-IN")}`} note="Total customer receivables" />
      </section>

      <AccountingWorkspace
        agents={data.agents}
        plants={data.plants}
        reimbursements={data.reimbursements}
        claims={data.reimbursementClaims}
        salesOrderRequests={data.salesOrderRequests}
        customerAccounts={data.customerAccounts}
        customerLedgerEntries={data.customerLedgerEntries}
        documentTemplates={data.documentTemplates}
      />
    </AppShell>
  );
}
