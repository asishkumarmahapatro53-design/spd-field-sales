"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AccountingSalesOrderVerification } from "@/components/accounting/AccountingSalesOrderVerification";
import { CommissionVoucherPanel } from "@/components/accounting/CommissionVoucherPanel";
import { uploadDocumentTemplate } from "@/components/document-template-upload";
import { getSalesOrderStatusMeta, normalizePaymentTerms } from "@/lib/commercial";
import { customerLedgerKey, findCustomerAccountByName, getLedgerCustomerNames, isLedgerReadySalesOrder } from "@/lib/customer-ledger";
import { toIndiaTimeLabel } from "@/lib/date";
import type {
  CustomerAccount,
  CustomerLedgerEntry,
  DocumentTemplate,
  DocumentTemplateType,
  Plant,
  ReimbursementClaim,
  ReimbursementSummary,
  SalesOrderRequest,
  User,
} from "@/lib/types";

type DepartmentId = "SALES" | "PRODUCTION" | "HR" | "LABOR" | "COMMISSION" | "CUSTOMER_LEDGERS" | "DOCUMENT_TEMPLATES";

const departments: Array<{ id: DepartmentId; label: string; scope: string }> = [
  { id: "SALES", label: "Sales Department", scope: "Agent fuel and lunch reimbursement" },
  { id: "CUSTOMER_LEDGERS", label: "Customer Ledgers", scope: "Client-wise debit, credit, and balance tracking" },
  { id: "DOCUMENT_TEMPLATES", label: "Document Templates", scope: "Upload quotation, challan, and invoice templates" },
  { id: "COMMISSION", label: "Commission & Vouchers", scope: "Third-party and agent commissions with Tally Export" },
  { id: "PRODUCTION", label: "Production Department", scope: "Food and plant support expenses" },
  { id: "HR", label: "HR Department", scope: "Staff payment and welfare requests" },
  { id: "LABOR", label: "Labor Department", scope: "Daily labor payment register" },
];

function money(value: number | null | undefined) {
  return `₹${Math.round(value ?? 0).toLocaleString("en-IN")}`;
}

function numberValue(value: number | null | undefined) {
  return Math.round(value ?? 0).toLocaleString("en-IN");
}

function claimStatusLabel(claim: ReimbursementClaim) {
  if (claim.status === "CLAIM_REQUESTED" || claim.status === "REQUESTED") {
    return "Waiting for manager";
  }

  if (claim.status === "MANAGER_VERIFIED" || claim.status === "ACCOUNTS_PAYMENT_PENDING") {
    return "Payment pending";
  }

  if (claim.status === "CASH_VOUCHER_CREATED") {
    return "Voucher created";
  }

  if (claim.status === "OTP_SENT") {
    return "OTP sent";
  }

  if (claim.status === "AGENT_RECEIPT_CONFIRMED") {
    return "Receipt confirmed";
  }

  if (claim.status === "PARTIAL_PAYMENT" || claim.status === "BALANCE_OUTSTANDING") {
    return "Partial payment";
  }

  if (claim.status === "PAYMENT_HOLD") {
    return "Payment hold";
  }

  if (claim.status === "PAID") {
    return "Paid";
  }

  if (claim.status === "REJECTED" || claim.status === "PAYMENT_REJECTED") {
    return "Rejected";
  }

  return "Pending claim";
}

function getLedgerStatus(summary: ReimbursementSummary, claimById: Map<string, ReimbursementClaim>) {
  if (!summary.totalAmount) {
    return "Awaiting verification";
  }

  if (!summary.claimId) {
    return "Unclaimed";
  }

  const claim = claimById.get(summary.claimId);
  return claim ? claimStatusLabel(claim) : "Claimed";
}

function parseApiError(response: Response) {
  return response.json().then((payload) => payload.error ?? "Request failed.").catch(() => "Request failed.");
}

interface AccountingWorkspaceProps {
  agents: User[];
  plants: Plant[];
  reimbursements: ReimbursementSummary[];
  claims: ReimbursementClaim[];
  salesOrderRequests: SalesOrderRequest[];
  customerAccounts: CustomerAccount[];
  customerLedgerEntries: CustomerLedgerEntry[];
  documentTemplates: DocumentTemplate[];
}

export function AccountingWorkspace({ agents, plants, reimbursements, claims, salesOrderRequests, customerAccounts, customerLedgerEntries, documentTemplates }: AccountingWorkspaceProps) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState<DepartmentId>("SALES");
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [showLetter, setShowLetter] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, startTransition] = useTransition();
  const claimById = useMemo(() => new Map(claims.map((claim) => [claim.id, claim])), [claims]);
  const pendingClaims = claims.filter((claim) => claim.status !== "PAID" && claim.status !== "PAYMENT_REJECTED" && claim.status !== "REJECTED");
  const paidClaimIds = new Set(claims.filter((claim) => claim.status === "PAID").map((claim) => claim.id));
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? agents[0] ?? null;
  const selectedAgentSummaries = selectedAgent
    ? reimbursements.filter((summary) => summary.userId === selectedAgent.id)
    : [];
  const selectedAgentClaims = selectedAgent
    ? claims.filter((claim) => claim.agentId === selectedAgent.id)
    : [];
  const selectedClaim =
    claims.find((claim) => claim.id === selectedClaimId) ??
    selectedAgentClaims.find((claim) => claim.status === "REQUESTED" || claim.status === "OTP_SENT") ??
    null;
  const salesOutstanding = reimbursements.reduce((sum, summary) => {
    if (!summary.totalAmount) {
      return sum;
    }

    if (summary.claimId && paidClaimIds.has(summary.claimId)) {
      return sum;
    }

    return sum + summary.totalAmount;
  }, 0);
  const selectedOutstanding = selectedAgentSummaries.reduce((sum, summary) => {
    if (!summary.totalAmount) {
      return sum;
    }

    if (summary.claimId && paidClaimIds.has(summary.claimId)) {
      return sum;
    }

    return sum + summary.totalAmount;
  }, 0);

  function refreshWithMessage(nextMessage: string) {
    setMessage(nextMessage);
    setError("");
    startTransition(() => router.refresh());
  }

  async function sendOtp(claimId: string) {
    setMessage("");
    setError("");
    const response = await fetch(`/api/reimbursement-claims/${claimId}/send-otp`, { method: "POST" });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    setSelectedClaimId(claimId);
    refreshWithMessage("OTP sent to the sales agent dashboard.");
  }

  async function createCashVoucher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const claimId = `${formData.get("claimId") ?? ""}`;
    const response = await fetch(`/api/reimbursement-claims/${claimId}/cash-voucher`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cashVoucherNumber: formData.get("cashVoucherNumber"),
        amount: Number(formData.get("amount")),
        remarks: formData.get("remarks"),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    event.currentTarget.reset();
    setSelectedClaimId(claimId);
    refreshWithMessage("Cash voucher created. OTP can now be sent.");
  }

  async function verifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const claimId = `${formData.get("claimId") ?? ""}`;
    const otpCode = `${formData.get("otpCode") ?? ""}`;
    const response = await fetch(`/api/reimbursement-claims/${claimId}/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ otpCode }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    event.currentTarget.reset();
    refreshWithMessage("Agent receipt confirmed by OTP. Record full or partial payment to close the claim.");
  }

  async function recordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const claimId = `${formData.get("claimId") ?? ""}`;
    const action = `${formData.get("action") ?? "FULL"}`;
    const response = await fetch(`/api/reimbursement-claims/${claimId}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        amount: Number(formData.get("amount")),
        paymentMode: formData.get("paymentMode"),
        referenceNumber: formData.get("referenceNumber"),
        remarks: formData.get("remarks"),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    event.currentTarget.reset();
    refreshWithMessage(action === "FULL" ? "Reimbursement fully paid." : "Reimbursement action saved.");
  }

  return (
    <div className="accounting-workspace">
      <section className="department-switcher" aria-label="Department payment sections">
        {departments.map((department) => (
          <button
            key={department.id}
            className={departmentId === department.id ? "department-button is-active" : "department-button"}
            type="button"
            onClick={() => {
              setDepartmentId(department.id);
              setShowLetter(false);
            }}
          >
            <span>{department.label}</span>
            <small>{department.scope}</small>
          </button>
        ))}
      </section>

      {departmentId === "SALES" ? (
        <section className="accounting-section">
          <div className="accounting-command-row">
            <div>
              <h2>Sales Reimbursements</h2>
              <p className="panel-copy">Fuel is calculated at ₹4.5/km and lunch is added per verified workday.</p>
            </div>
            <div className="button-row">
              <a className="button-secondary" href="/api/accounting/reimbursements/export?format=csv">
                CSV
              </a>
              <a className="button-secondary" href="/api/accounting/reimbursements/export?format=xlsx">
                XLSX
              </a>
            </div>
          </div>

          <div className="accounting-metric-row">
            <div className="summary-cell">
              <span className="summary-label">Pending claims</span>
              <strong>{pendingClaims.length}</strong>
            </div>
            <div className="summary-cell">
              <span className="summary-label">Total outstanding</span>
              <strong>{money(salesOutstanding)}</strong>
            </div>
            <div className="summary-cell">
              <span className="summary-label">Paid claims</span>
              <strong>{claims.filter((claim) => claim.status === "PAID").length}</strong>
            </div>
            <div className="summary-cell">
              <span className="summary-label">Agent ledgers</span>
              <strong>{agents.length}</strong>
            </div>
          </div>

          {message ? <div className="success-box">{message}</div> : null}
          {error ? <div className="error-box">{error}</div> : null}

          <div className="accounting-sales-grid">
            <section className="accounting-panel">
              <div className="panel-header">
                <div>
                  <h3>Pending Claims</h3>
                  <p className="panel-copy">Claims wait here until OTP verification confirms payment.</p>
                </div>
              </div>
              <div className="data-list">
                {pendingClaims.length ? (
                  pendingClaims.map((claim) => {
                    const agent = agents.find((entry) => entry.id === claim.agentId);
                    return (
                      <article key={claim.id} className="claim-row">
                        <button
                          className="claim-row-main"
                          type="button"
                          onClick={() => {
                            setSelectedAgentId(claim.agentId);
                            setSelectedClaimId(claim.id);
                            setShowLetter(true);
                          }}
                        >
                          <span>
                            <strong>{agent?.name ?? "Sales agent"}</strong>
                            <small>
                              {claim.periodStart} to {claim.periodEnd}
                            </small>
                          </span>
                          <b>{money(claim.totalAmount)}</b>
                        </button>
                        <div className="claim-actions">
                          <span className={`status-badge status-${claim.status.toLowerCase()}`}>{claimStatusLabel(claim)}</span>
                          {claim.status === "ACCOUNTS_PAYMENT_PENDING" || claim.status === "MANAGER_VERIFIED" || claim.status === "PARTIAL_PAYMENT" || claim.status === "BALANCE_OUTSTANDING" || claim.status === "PAYMENT_HOLD" ? (
                            <form className="otp-inline-form" onSubmit={createCashVoucher}>
                              <input name="claimId" type="hidden" value={claim.id} />
                              <input name="cashVoucherNumber" placeholder="Voucher no." required />
                              <input name="amount" type="number" min="1" max={claim.outstandingAmount ?? claim.balanceAmount ?? claim.totalAmount} placeholder="Amount" required />
                              <input name="remarks" placeholder="Remarks" required />
                              <button className="button-secondary" type="submit" disabled={isRefreshing}>
                                Create voucher
                              </button>
                            </form>
                          ) : null}
                          {claim.status === "CASH_VOUCHER_CREATED" ? (
                            <button className="button-secondary" type="button" disabled={isRefreshing} onClick={() => sendOtp(claim.id)}>
                              Send OTP
                            </button>
                          ) : null}
                          {claim.status === "OTP_SENT" ? (
                            <form className="otp-inline-form" onSubmit={verifyOtp}>
                              <input name="claimId" type="hidden" value={claim.id} />
                              <input name="otpCode" placeholder="OTP" inputMode="numeric" maxLength={6} required />
                              <button className="button" type="submit" disabled={isRefreshing}>
                                Verify
                              </button>
                            </form>
                          ) : null}
                          {claim.status === "AGENT_RECEIPT_CONFIRMED" ? (
                            <form className="otp-inline-form" onSubmit={recordPayment}>
                              <input name="claimId" type="hidden" value={claim.id} />
                              <select name="action" defaultValue="FULL">
                                <option value="FULL">Full</option>
                                <option value="PARTIAL">Partial</option>
                                <option value="HOLD">Hold</option>
                                <option value="REJECT">Reject</option>
                              </select>
                              <select name="paymentMode" defaultValue="CASH">
                                <option value="CASH">Cash</option>
                                <option value="CHEQUE">Cheque</option>
                                <option value="NEFT">NEFT</option>
                                <option value="UPI">UPI</option>
                              </select>
                              <input name="amount" type="number" min="1" max={claim.outstandingAmount ?? claim.balanceAmount ?? claim.totalAmount} placeholder="Amount" />
                              <input name="referenceNumber" placeholder="Ref no." />
                              <input name="remarks" placeholder="Remarks" required />
                              <button className="button" type="submit" disabled={isRefreshing}>
                                Save payment
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="note-box">No pending reimbursement claims right now.</div>
                )}
              </div>
            </section>

            <section className="accounting-panel">
              <div className="panel-header">
                <div>
                  <h3>Sales Agents</h3>
                  <p className="panel-copy">Open an agent to inspect daily reimbursement lines.</p>
                </div>
              </div>
              <div className="agent-ledger-list">
                {agents.map((agent) => {
                  const agentRows = reimbursements.filter((summary) => summary.userId === agent.id);
                  const outstanding = agentRows.reduce((sum, summary) => {
                    if (!summary.totalAmount) {
                      return sum;
                    }

                    if (summary.claimId && paidClaimIds.has(summary.claimId)) {
                      return sum;
                    }

                    return sum + summary.totalAmount;
                  }, 0);

                  return (
                    <button
                      key={agent.id}
                      className={selectedAgent?.id === agent.id ? "agent-ledger-button is-active" : "agent-ledger-button"}
                      type="button"
                      onClick={() => {
                        setSelectedAgentId(agent.id);
                        setSelectedClaimId("");
                        setShowLetter(false);
                      }}
                    >
                      <span>
                        <strong>{agent.name}</strong>
                        <small>{agent.employeeId}</small>
                      </span>
                      <b>{money(outstanding)}</b>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="accounting-panel">
            <div className="panel-header">
              <div>
                <h3>{selectedAgent ? `${selectedAgent.name} Ledger` : "Agent Ledger"}</h3>
                <p className="panel-copy">Outstanding amount is fuel plus lunch for unpaid verified days.</p>
              </div>
              <button className="button" type="button" onClick={() => setShowLetter((value) => !value)}>
                Reimbursement Letter
              </button>
            </div>

            <div className="accounting-metric-row compact">
              <div className="summary-cell">
                <span className="summary-label">Outstanding</span>
                <strong>{money(selectedOutstanding)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Verified distance</span>
                <strong>{numberValue(selectedAgentSummaries.reduce((sum, row) => sum + (row.totalDistance ?? 0), 0))} km</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Claim history</span>
                <strong>{selectedAgentClaims.length}</strong>
              </div>
            </div>

            {showLetter ? (
              <div className="reimbursement-letter">
                <div>
                  <span className="summary-label">Payment request</span>
                  <h4>{selectedAgent?.name ?? "Sales agent"}</h4>
                  <p>
                    {selectedClaim
                      ? `Claim ${selectedClaim.id.slice(0, 8)} covers ${selectedClaim.periodStart} to ${selectedClaim.periodEnd}.`
                      : "No active claim selected. This letter previews the current unpaid ledger."}
                  </p>
                </div>
                <div className="letter-total">
                  <span>Total payable</span>
                  <strong>{money(selectedClaim?.totalAmount ?? selectedOutstanding)}</strong>
                </div>
              </div>
            ) : null}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Distance</th>
                    <th>Fuel</th>
                    <th>Lunch</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAgentSummaries.length ? (
                    selectedAgentSummaries.map((summary) => (
                      <tr key={summary.sessionId}>
                        <td>{summary.date}</td>
                        <td>{summary.startReading ?? "-"}</td>
                        <td>{summary.endReading ?? "-"}</td>
                        <td>{summary.totalDistance ?? "-"}</td>
                        <td>{summary.fuelAmount === null ? "-" : money(summary.fuelAmount)}</td>
                        <td>{money(summary.lunchAmount)}</td>
                        <td>{summary.totalAmount === null ? "-" : money(summary.totalAmount)}</td>
                        <td>{getLedgerStatus(summary, claimById)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8}>No reimbursement records for this agent yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <AccountingSalesOrderVerification requests={salesOrderRequests} />
        </section>
      ) : departmentId === "CUSTOMER_LEDGERS" ? (
        <CustomerLedgerPanel
          plants={plants}
          customerAccounts={customerAccounts}
          customerLedgerEntries={customerLedgerEntries}
          salesOrderRequests={salesOrderRequests}
        />
      ) : departmentId === "DOCUMENT_TEMPLATES" ? (
        <DocumentTemplatePanel templates={documentTemplates} />
      ) : departmentId === "COMMISSION" ? (
        <section className="accounting-section">
          <CommissionVoucherPanel plants={plants} />
        </section>
      ) : (
        <DepartmentPlaceholder departmentId={departmentId as Exclude<DepartmentId, "SALES">} />
      )}
    </div>
  );
}


function DepartmentPlaceholder({ departmentId }: { departmentId: Exclude<DepartmentId, "SALES"> }) {
  const dept = departments.find((department) => department.id === departmentId);

  return (
    <section className="accounting-section">
      <div className="accounting-command-row">
        <div>
          <h2>{dept?.label}</h2>
          <p className="panel-copy">{dept?.scope}</p>
        </div>
        <span className="status-badge status-no_activity">Coming soon</span>
      </div>
      <div className="note-box">
        <strong>This section is not yet active for the current pilot.</strong>
        <p style={{ margin: "8px 0 0", color: "var(--muted)" }}>
          Payment registers for {dept?.label.toLowerCase()} are being prepared for the next release phase.
          Use the <strong>Sales Department</strong> tab to access agent reimbursements.
        </p>
      </div>
    </section>
  );
}

const TEMPLATE_TYPES: Array<{ type: DocumentTemplateType; label: string; purpose: string }> = [
  { type: "QUOTATION", label: "Quotation", purpose: "Used before manager-approved quotation PDF release." },
  { type: "CHALLAN", label: "Challan", purpose: "Used on dispatch challan print pages." },
  { type: "INVOICE", label: "Invoice", purpose: "Used on invoice print pages." },
];

function DocumentTemplatePanel({ templates }: { templates: DocumentTemplate[] }) {
  const router = useRouter();
  const [busyType, setBusyType] = useState<DocumentTemplateType | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const activeTemplateByType = useMemo(() => {
    const map = new Map<DocumentTemplateType, DocumentTemplate>();
    templates
      .filter((template) => template.status === "ACTIVE")
      .forEach((template) => {
        if (!map.has(template.type)) {
          map.set(template.type, template);
        }
      });
    return map;
  }, [templates]);

  async function uploadTemplate(event: React.FormEvent<HTMLFormElement>, type: DocumentTemplateType) {
    event.preventDefault();
    const form = event.currentTarget;
    setMessage("");
    setError("");
    setBusyType(type);

    try {
      await uploadDocumentTemplate({ form, type });
      form.reset();
      setMessage(`${type.toLowerCase().replaceAll("_", " ")} template uploaded and activated.`);
      startTransition(() => router.refresh());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Template upload failed.");
    } finally {
      setBusyType(null);
    }
  }

  return (
    <section className="accounting-section">
      <div className="accounting-command-row">
        <div>
          <h2>Document Templates</h2>
          <p className="panel-copy">
            Upload the official templates that the app must use for quotations, challans, and invoices. A new upload
            automatically becomes active and replaces the previous template for that document type.
          </p>
        </div>
        <span className="status-badge status-confirmed">{templates.filter((template) => template.status === "ACTIVE").length} active</span>
      </div>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <div className="three-grid">
        {TEMPLATE_TYPES.map((entry) => {
          const activeTemplate = activeTemplateByType.get(entry.type);
          return (
            <div key={entry.type} className="panel">
              <div className="panel-header">
                <div>
                  <h3>{entry.label} template</h3>
                  <p className="panel-copy">{entry.purpose}</p>
                </div>
                <span className={activeTemplate ? "status-badge status-confirmed" : "status-badge status-pending"}>
                  {activeTemplate ? "Active" : "Missing"}
                </span>
              </div>

              {activeTemplate ? (
                <div className="note-box">
                  <strong>{activeTemplate.name}</strong>
                  <p style={{ margin: "6px 0 0" }}>{activeTemplate.originalFileName}</p>
                  <p style={{ margin: "6px 0 0" }}>Uploaded {toIndiaTimeLabel(activeTemplate.uploadedAt)}</p>
                  <a href={activeTemplate.fileUrl} target="_blank" rel="noopener noreferrer">Open active template</a>
                </div>
              ) : (
                <div className="note-box">No active template uploaded yet.</div>
              )}

              <form className="form-grid mt-16" onSubmit={(event) => void uploadTemplate(event, entry.type)}>
                <div className="field">
                  <label htmlFor={`${entry.type}-template-name`}>Template name</label>
                  <input id={`${entry.type}-template-name`} name="name" placeholder={`${entry.label} official template`} />
                </div>
                <div className="field">
                  <label htmlFor={`${entry.type}-template-file`}>Template file</label>
                  <input
                    id={`${entry.type}-template-file`}
                    name="file"
                    type="file"
                    accept={entry.type === "QUOTATION" ? ".docx,.pdf,.jpg,.jpeg,.png,.webp" : ".pdf,.jpg,.jpeg,.png,.webp"}
                    required
                  />
                  <span className="hint">
                    {entry.type === "QUOTATION"
                      ? "Use the official quotation DOCX for data-filled release, or PDF/image files as references."
                      : "Use image files for print-page background templates. PDFs are stored as controlled official template references."}
                  </span>
                </div>
                <button className="button" type="submit" disabled={busyType === entry.type}>
                  {busyType === entry.type ? "Uploading..." : `Upload ${entry.label.toLowerCase()} template`}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CustomerLedgerPanel({
  plants,
  customerAccounts,
  customerLedgerEntries,
  salesOrderRequests,
}: {
  plants: Plant[];
  customerAccounts: CustomerAccount[];
  customerLedgerEntries: CustomerLedgerEntry[];
  salesOrderRequests: SalesOrderRequest[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();
  const plantById = useMemo(() => new Map(plants.map((plant) => [plant.id, plant])), [plants]);

  // Include legacy ledger-created orders so old production rows do not disappear from the ledger list.
  const customerNames = useMemo(() => {
    return getLedgerCustomerNames({ customerAccounts, customerLedgerEntries, salesOrderRequests });
  }, [customerAccounts, customerLedgerEntries, salesOrderRequests]);

  // Compute balance per customer
  const customerBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const name of customerNames) {
      const entries = customerLedgerEntries.filter(
        (entry) => customerLedgerKey(entry.customerName) === customerLedgerKey(name),
      );
      const balance = entries.reduce((sum, entry) => {
        return entry.type === "DEBIT" ? sum + entry.amount : sum - entry.amount;
      }, 0);
      map.set(name, balance);
    }
    return map;
  }, [customerNames, customerLedgerEntries]);

  const filteredCustomers = customerNames.filter((name) =>
    name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedEntries = customerLedgerEntries.filter(
    (entry) => customerLedgerKey(entry.customerName) === customerLedgerKey(selectedCustomer),
  );
  const selectedBalance = customerBalances.get(selectedCustomer) ?? 0;
  const selectedAccount = findCustomerAccountByName(customerAccounts, selectedCustomer);
  const selectedOrders = salesOrderRequests.filter(
    (request) => isLedgerReadySalesOrder(request) && customerLedgerKey(request.customerName) === customerLedgerKey(selectedCustomer),
  );
  const selectedOrderValue = selectedOrders.reduce((sum, order) => sum + order.amount, 0);
  const selectedOrderQuantity = selectedOrders.reduce((sum, order) => sum + order.quantity, 0);
  const selectedRemainingQuantity = selectedOrders.reduce((sum, order) => sum + order.remainingQuantity, 0);

  async function handleRecordPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setBusy(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/accounting/ledger/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: selectedCustomer,
        amount: Number(formData.get("creditAmount")),
        paymentMode: formData.get("paymentMode"),
        description: formData.get("creditDescription"),
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Request failed." }));
      setError(payload.error ?? "Request failed.");
      setBusy(false);
      return;
    }

    event.currentTarget.reset();
    setMessage("Payment recorded successfully.");
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <section className="accounting-section">
      <div className="accounting-command-row">
        <div>
          <h2>Customer Ledgers</h2>
          <p className="panel-copy">One ledger per client. View all debits (dispatches) and credits (payments) in one place.</p>
        </div>
        <span className="status-badge status-confirmed">{customerNames.length} clients</span>
      </div>

      <div className="three-grid" style={{ gap: "16px", alignItems: "start" }}>
        {/* Client list */}
        <div className="panel" style={{ maxHeight: "520px", overflow: "auto" }}>
          <div className="field" style={{ marginBottom: "8px" }}>
            <input
              id="ledger-search"
              type="text"
              placeholder="Search customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="data-list">
            {filteredCustomers.length ? (
              filteredCustomers.map((name) => {
                const balance = customerBalances.get(name) ?? 0;
                return (
                  <button
                    key={name}
                    type="button"
                    className={selectedCustomer === name ? "data-row is-selected" : "data-row"}
                    onClick={() => {
                      setSelectedCustomer(name);
                      setMessage("");
                      setError("");
                    }}
                    style={{ cursor: "pointer", textAlign: "left", width: "100%" }}
                  >
                    <h4>{name}</h4>
                    <p style={{ color: balance > 0 ? "var(--danger)" : "var(--success)" }}>
                      {balance > 0 ? `₹${Math.round(balance).toLocaleString("en-IN")} due` : balance < 0 ? `₹${Math.round(Math.abs(balance)).toLocaleString("en-IN")} advance` : "Settled"}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="note-box">No customers found.</div>
            )}
          </div>
        </div>

        {/* Transaction history + payment form */}
        <div style={{ gridColumn: "span 2" }}>
          {selectedCustomer ? (
            <>
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h3>{selectedCustomer}</h3>
                    <p className="panel-copy">
                      Balance: <strong style={{ color: selectedBalance > 0 ? "var(--danger)" : "var(--success)" }}>
                        {selectedBalance > 0 ? `₹${Math.round(selectedBalance).toLocaleString("en-IN")} due` : selectedBalance < 0 ? `₹${Math.round(Math.abs(selectedBalance)).toLocaleString("en-IN")} advance` : "Settled"}
                      </strong>
                      {selectedAccount ? ` | Credit limit: ₹${selectedAccount.creditLimit.toLocaleString("en-IN")} | Risk: ${selectedAccount.riskLevel}` : ""}
                    </p>
                  </div>
                </div>

                {selectedOrders.length ? (
                  <>
                    <div className="metric-grid" style={{ marginTop: "12px" }}>
                      <div className="metric-card">
                        <span className="metric-label">Linked order value</span>
                        <strong>{money(selectedOrderValue)}</strong>
                        <small>Commercial value, not yet ledger debit</small>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Order quantity</span>
                        <strong>{numberValue(selectedOrderQuantity)} CUM</strong>
                        <small>{numberValue(selectedRemainingQuantity)} CUM remaining</small>
                      </div>
                      <div className="metric-card">
                        <span className="metric-label">Ledger status</span>
                        <strong>{selectedEntries.length ? "Transactions posted" : "Order data only"}</strong>
                        <small>Debit starts after site acceptance</small>
                      </div>
                    </div>

                    <div className="table-scroll" style={{ marginTop: "12px" }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Created</th>
                            <th>Plant</th>
                            <th>Site</th>
                            <th>Grade</th>
                            <th>Qty</th>
                            <th>Remaining</th>
                            <th>Rate</th>
                            <th>Order value</th>
                            <th>Payment</th>
                            <th>GSTIN</th>
                            <th>Odoo ledger</th>
                            <th>Odoo SO</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrders.map((order) => {
                            const statusMeta = getSalesOrderStatusMeta(order.status);
                            const paymentTerms = normalizePaymentTerms(order.paymentType, order.paymentTerms).replaceAll("_", " ");
                            return (
                              <tr key={order.id}>
                                <td>{toIndiaTimeLabel(order.createdAt)}</td>
                                <td>{plantById.get(order.plantId)?.name ?? order.plantId}</td>
                                <td>{order.siteName}</td>
                                <td>{order.grade}</td>
                                <td>{numberValue(order.quantity)} CUM</td>
                                <td>{numberValue(order.remainingQuantity)} CUM</td>
                                <td>{money(order.approvedPrice)}/CUM</td>
                                <td>{money(order.amount)}</td>
                                <td>{order.paymentType} / {paymentTerms}</td>
                                <td>{order.gstin ?? "-"}</td>
                                <td>{order.odooPartnerId ? `Partner #${order.odooPartnerId}` : order.odooLedgerSyncStatus?.replaceAll("_", " ").toLowerCase() ?? "-"}</td>
                                <td>{order.odooSaleOrderName ?? order.odooSalesOrderSyncStatus?.replaceAll("_", " ").toLowerCase() ?? "-"}</td>
                                <td>
                                  <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : null}

                {selectedEntries.length ? (
                  <div className="table-scroll" style={{ marginTop: "12px" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Description</th>
                          <th>Mode</th>
                          <th style={{ textAlign: "right" }}>Debit</th>
                          <th style={{ textAlign: "right" }}>Credit</th>
                          <th style={{ textAlign: "right" }}>Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{toIndiaTimeLabel(entry.createdAt)}</td>
                            <td>
                              <span className={entry.type === "DEBIT" ? "status-badge status-rejected" : "status-badge status-confirmed"}>
                                {entry.type}
                              </span>
                            </td>
                            <td>{entry.description}</td>
                            <td>{entry.paymentMode.replaceAll("_", " ")}</td>
                            <td style={{ textAlign: "right" }}>{entry.type === "DEBIT" ? `₹${Math.round(entry.amount).toLocaleString("en-IN")}` : "-"}</td>
                            <td style={{ textAlign: "right" }}>{entry.type === "CREDIT" ? `₹${Math.round(entry.amount).toLocaleString("en-IN")}` : "-"}</td>
                            <td style={{ textAlign: "right", fontWeight: 600 }}>₹{Math.round(entry.runningBalance).toLocaleString("en-IN")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="note-box" style={{ marginTop: "12px" }}>
                    No debit or credit transactions yet. The customer ledger is created; debit entries will appear after site-accepted dispatches, and credit entries will appear after recorded payments.
                  </div>
                )}
              </div>

              {/* Record Payment Form */}
              <div className="panel" style={{ marginTop: "16px" }}>
                <h4>Record Payment (Credit)</h4>
                <p className="panel-copy" style={{ marginBottom: "12px" }}>Manually record a cash, cheque, NEFT, or UPI payment from this customer.</p>
                {message ? <div className="success-box">{message}</div> : null}
                {error ? <div className="error-box">{error}</div> : null}
                <form className="form-grid" onSubmit={handleRecordPayment}>
                  <div className="three-grid">
                    <div className="field">
                      <label htmlFor="creditAmount">Amount (₹)</label>
                      <input id="creditAmount" name="creditAmount" type="number" min="1" step="0.01" required />
                    </div>
                    <div className="field">
                      <label htmlFor="paymentMode">Payment Mode</label>
                      <select id="paymentMode" name="paymentMode" defaultValue="NEFT" required>
                        <option value="CASH">Cash</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="NEFT">NEFT</option>
                        <option value="UPI">UPI</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="creditDescription">Description</label>
                      <input id="creditDescription" name="creditDescription" placeholder="Cheque #, UTR, etc." />
                    </div>
                  </div>
                  <button className="button" type="submit" disabled={busy}>
                    {busy ? "Recording..." : "Record Payment"}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="panel">
              <div className="note-box">Select a customer from the list to view their ledger statement and record payments.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
