"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AccountingSalesOrderVerification } from "@/components/accounting/AccountingSalesOrderVerification";
import { CommissionVoucherPanel } from "@/components/accounting/CommissionVoucherPanel";
import { toIndiaTimeLabel } from "@/lib/date";
import type { CustomerAccount, CustomerLedgerEntry, Plant, ReimbursementClaim, ReimbursementSummary, SalesOrderRequest, User } from "@/lib/types";

type DepartmentId = "SALES" | "PRODUCTION" | "HR" | "LABOR" | "COMMISSION" | "CUSTOMER_LEDGERS";

const departments: Array<{ id: DepartmentId; label: string; scope: string }> = [
  { id: "SALES", label: "Sales Department", scope: "Agent fuel and lunch reimbursement" },
  { id: "CUSTOMER_LEDGERS", label: "Customer Ledgers", scope: "Client-wise debit, credit, and balance tracking" },
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
  if (claim.status === "OTP_SENT") {
    return "OTP sent";
  }

  if (claim.status === "PAID") {
    return "Paid";
  }

  if (claim.status === "REJECTED") {
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
}

export function AccountingWorkspace({ agents, plants, reimbursements, claims, salesOrderRequests, customerAccounts, customerLedgerEntries }: AccountingWorkspaceProps) {
  const router = useRouter();
  const [departmentId, setDepartmentId] = useState<DepartmentId>("SALES");
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id ?? "");
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [showLetter, setShowLetter] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, startTransition] = useTransition();
  const claimById = useMemo(() => new Map(claims.map((claim) => [claim.id, claim])), [claims]);
  const pendingClaims = claims.filter((claim) => claim.status === "REQUESTED" || claim.status === "OTP_SENT");
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
    refreshWithMessage("Payment marked as paid after OTP verification.");
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
                          {claim.status === "REQUESTED" ? (
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
        <CustomerLedgerPanel customerAccounts={customerAccounts} customerLedgerEntries={customerLedgerEntries} />
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

function CustomerLedgerPanel({
  customerAccounts,
  customerLedgerEntries,
}: {
  customerAccounts: CustomerAccount[];
  customerLedgerEntries: CustomerLedgerEntry[];
}) {
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Build unique customer list from accounts + ledger entries
  const customerNames = useMemo(() => {
    const names = new Set<string>();
    customerAccounts.forEach((account) => names.add(account.customerName));
    customerLedgerEntries.forEach((entry) => names.add(entry.customerName));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [customerAccounts, customerLedgerEntries]);

  // Compute balance per customer
  const customerBalances = useMemo(() => {
    const map = new Map<string, number>();
    for (const name of customerNames) {
      const entries = customerLedgerEntries.filter((entry) => entry.customerName === name);
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
    (entry) => entry.customerName === selectedCustomer,
  );
  const selectedBalance = customerBalances.get(selectedCustomer) ?? 0;
  const selectedAccount = customerAccounts.find(
    (account) => account.customerName === selectedCustomer,
  );

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
                  <div className="note-box" style={{ marginTop: "12px" }}>No transactions yet for this customer.</div>
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
