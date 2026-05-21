"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getApprovalItems } from "@/lib/commercial";
import { toIndiaTimeLabel } from "@/lib/date";
import type { ApprovalRequest, HelpRequest, Lead, OdometerReading, ReimbursementClaim, SalesOrderRequest, Target, User } from "@/lib/types";

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

export function ManagerActions({
  agents,
  leads,
  verificationQueue,
  approvals,
  helpRequests,
  targets,
}: {
  agents: User[];
  leads: Lead[];
  verificationQueue: OdometerReading[];
  approvals: ApprovalRequest[];
  helpRequests: HelpRequest[];
  targets: Target[];
}) {
  return (
    <div className="panel-grid">
      <VerificationCard verificationQueue={verificationQueue} />
      <ApprovalDecisionCard approvals={approvals} agents={agents} leads={leads} />
      <LeadClosureDecisionCard leads={leads} agents={agents} />
      <TargetCard agents={agents} targets={targets} />
      <HelpResolutionCard helpRequests={helpRequests} />
      <TaskAssignmentCard agents={agents} />
    </div>
  );
}

export function VerificationCard({ verificationQueue }: { verificationQueue: OdometerReading[] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function resolve(readingId: string, formData: FormData) {
    setBusyId(readingId);
    setError("");

    const response = await fetch(`/api/manager/verifications/${readingId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manualValue: formData.get(`manualValue-${readingId}`),
        note: formData.get(`note-${readingId}`),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Manual Verification Queue</h2>
          <p className="panel-copy">Enter the correct reading when OCR fails or the agent rejects the result.</p>
        </div>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {verificationQueue.length ? (
          verificationQueue.map((reading) => (
            <form key={reading.id} className="data-row" action={() => undefined}>
              <div className="panel-header">
                <h4>{reading.type} reading</h4>
                <a className="button-ghost" href={`/api/media?url=${encodeURIComponent(reading.photoUrl)}`} target="_blank" rel="noreferrer">
                  View photo
                </a>
              </div>
              <p>{reading.verificationNote ?? "No note"}</p>
              <div className="row-meta">
                <span>Agent {reading.agentEnteredReading ?? "N/A"}</span>
                <span>OCR {reading.ocrValue ?? "N/A"}</span>
                <span>{reading.reviewReason ?? "Review required"}</span>
              </div>
              {reading.continuityNote ? <p className="hint">{reading.continuityNote}</p> : null}
              <div className="three-grid">
                <div className="field">
                  <label htmlFor={`manualValue-${reading.id}`}>Manual value</label>
                  <input id={`manualValue-${reading.id}`} name={`manualValue-${reading.id}`} type="number" required />
                </div>
                <div className="field">
                  <label htmlFor={`note-${reading.id}`}>Audit note</label>
                  <input id={`note-${reading.id}`} name={`note-${reading.id}`} required />
                </div>
              </div>
              <button
                className="button"
                type="button"
                onClick={(event) => {
                  const formData = new FormData(event.currentTarget.form as HTMLFormElement);
                  void resolve(reading.id, formData);
                }}
                disabled={busyId === reading.id}
              >
                {busyId === reading.id ? "Saving..." : "Resolve"}
              </button>
            </form>
          ))
        ) : (
          <div className="success-box">No manual verification items are pending.</div>
        )}
      </div>
    </section>
  );
}

export function ReimbursementVerificationCard({ claims, agents }: { claims: ReimbursementClaim[]; agents: User[] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const pendingClaims = claims.filter((claim) => claim.status === "CLAIM_REQUESTED" || claim.status === "REQUESTED");

  async function verify(id: string) {
    setBusyId(id);
    setError("");
    const response = await fetch(`/api/reimbursement-claims/${id}/manager-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Manager verified claim for Accounts payment." }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Reimbursement Verification</h2>
          <p className="panel-copy">Manager verification must happen before Accounts can create cash voucher and OTP.</p>
        </div>
        <span className="status-badge status-pending">{pendingClaims.length} pending</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {pendingClaims.length ? (
          pendingClaims.map((claim) => {
            const agent = agents.find((entry) => entry.id === claim.agentId);
            return (
              <div key={claim.id} className="data-row">
                <div className="panel-header">
                  <h4>{agent?.name ?? "Sales agent"}</h4>
                  <span className="status-badge status-pending">Claim requested</span>
                </div>
                <p>
                  {claim.periodStart} to {claim.periodEnd} | Rs {Math.round(claim.totalAmount).toLocaleString("en-IN")}
                </p>
                <button className="button" type="button" disabled={busyId === claim.id} onClick={() => void verify(claim.id)}>
                  {busyId === claim.id ? "Verifying..." : "Verify for Accounts"}
                </button>
              </div>
            );
          })
        ) : (
          <div className="success-box">No reimbursement claims are waiting for manager verification.</div>
        )}
      </div>
    </section>
  );
}

export function PoPdcExceptionDecisionCard({ requests }: { requests: SalesOrderRequest[] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const pending = requests.filter((request) => request.poPdcExceptionStatus === "REQUESTED");

  async function decide(id: string, action: "APPROVE" | "REJECT") {
    setBusyId(id);
    setError("");
    const response = await fetch(`/api/sales-order-requests/${id}/po-pdc-exception`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        note: action === "APPROVE" ? "Manager approved missing PO/PDC exception." : "Manager rejected missing PO/PDC exception.",
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>PO/PDC Exceptions</h2>
          <p className="panel-copy">Accounts cannot approve ledgers with missing PO/PDC until manager exception is approved.</p>
        </div>
        <span className="status-badge status-pending">{pending.length} pending</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {pending.length ? (
          pending.map((request) => (
            <div key={request.id} className="data-row">
              <div className="panel-header">
                <h4>{request.customerName}</h4>
                <span className="status-badge status-pending">Exception requested</span>
              </div>
              <p>{request.poPdcExceptionReason ?? "No reason captured."}</p>
              <div className="row-meta">
                <span>{request.poDocumentUrl ? "PO uploaded" : "PO missing"}</span>
                <span>{request.pdcDocumentUrl ? "PDC uploaded" : "PDC missing"}</span>
                <span>{request.paymentTerms}</span>
              </div>
              <div className="button-row">
                <button className="button" type="button" disabled={busyId === request.id} onClick={() => void decide(request.id, "APPROVE")}>
                  Approve exception
                </button>
                <button className="button-danger" type="button" disabled={busyId === request.id} onClick={() => void decide(request.id, "REJECT")}>
                  Reject
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="success-box">No PO/PDC exceptions are waiting.</div>
        )}
      </div>
    </section>
  );
}

export function CreditOverrideDecisionCard({ requests }: { requests: SalesOrderRequest[] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const creditRequests = requests.filter((request) => request.status === "PENDING_FINANCE" && request.paymentType === "CREDIT");

  async function approve(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    setBusyId(id);
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/sales-order-requests/${id}/credit-override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountLimit: Number(formData.get("amountLimit")),
        expiresAt: formData.get("expiresAt"),
        reason: formData.get("reason"),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Credit Exceptions</h2>
          <p className="panel-copy">Approve temporary credit exceptions before Accounts can bypass over-limit or blocked-risk checks.</p>
        </div>
        <span className="status-badge status-pending">{creditRequests.length} credit requests</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {creditRequests.length ? (
          creditRequests.map((request) => (
            <form key={request.id} className="data-row" onSubmit={(event) => void approve(event, request.id)}>
              <div className="panel-header">
                <h4>{request.customerName}</h4>
                <span className="status-badge status-pending">{request.creditOverrideApprovedBy ? "Override approved" : "Credit review"}</span>
              </div>
              <p>
                Order value Rs {Math.round(request.amount).toLocaleString("en-IN")} | Terms {request.paymentTerms} | Risk {request.creditRiskCategory ?? "LOW"}
              </p>
              <div className="three-grid">
                <div className="field">
                  <label htmlFor={`amountLimit-${request.id}`}>Temporary amount limit</label>
                  <input id={`amountLimit-${request.id}`} name="amountLimit" type="number" min="1" defaultValue={request.amount} required />
                </div>
                <div className="field">
                  <label htmlFor={`expiresAt-${request.id}`}>Expiry</label>
                  <input id={`expiresAt-${request.id}`} name="expiresAt" type="date" required />
                </div>
                <div className="field">
                  <label htmlFor={`reason-${request.id}`}>Reason</label>
                  <input id={`reason-${request.id}`} name="reason" required defaultValue="Temporary credit exception approved by manager." />
                </div>
              </div>
              <button className="button-secondary" type="submit" disabled={busyId === request.id}>
                {busyId === request.id ? "Saving..." : "Approve credit exception"}
              </button>
            </form>
          ))
        ) : (
          <div className="success-box">No credit requests are waiting for exception review.</div>
        )}
      </div>
    </section>
  );
}

export function LeadClosureDecisionCard({ leads, agents }: { leads: Lead[]; agents: User[] }) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const pendingLeads = leads.filter((lead) => lead.closureStatus === "PENDING_MANAGER_APPROVAL");

  async function decide(lead: Lead, action: "APPROVE" | "REJECT", formData: FormData) {
    setBusyId(lead.id);
    setError("");
    const note = `${formData.get(`closureNote-${lead.id}`) ?? ""}`.trim();
    const response = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        action === "APPROVE"
          ? {
              action: "close",
              reason: lead.closureReason ?? "DEAD",
              remarks: note || lead.closureRemarks || "Manager approved lead closure.",
            }
          : {
              action: "rejectClosure",
              reason: note || "Manager rejected lead closure request.",
            },
      ),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Lead Closure Requests</h2>
          <p className="panel-copy">Sales agents can request dead/lost closure, but manager approval is required before the lead and sites close.</p>
        </div>
        <span className="status-badge status-pending">{pendingLeads.length} pending</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {pendingLeads.length ? (
          pendingLeads.map((lead) => {
            const requestedBy = agents.find((agent) => agent.id === lead.closureRequestedBy);
            return (
              <form key={lead.id} className="data-row" action={() => undefined}>
                <div className="panel-header">
                  <h4>{lead.siteName}</h4>
                  <span className="status-badge status-pending">{lead.closureReason ?? "Closure requested"}</span>
                </div>
                <p>{lead.closureRemarks ?? "No agent remark captured."}</p>
                <div className="row-meta">
                  <span>{requestedBy?.name ?? lead.closureRequestedBy ?? "Sales agent"}</span>
                  <span>{toIndiaTimeLabel(lead.closureRequestedAt ?? null)}</span>
                  <span>{lead.siteAddress}</span>
                </div>
                <div className="field">
                  <label htmlFor={`closureNote-${lead.id}`}>Manager note</label>
                  <input id={`closureNote-${lead.id}`} name={`closureNote-${lead.id}`} required />
                </div>
                <div className="button-row">
                  <button
                    className="button"
                    type="button"
                    disabled={busyId === lead.id}
                    onClick={(event) => {
                      const formData = new FormData(event.currentTarget.form as HTMLFormElement);
                      void decide(lead, "APPROVE", formData);
                    }}
                  >
                    {busyId === lead.id ? "Saving..." : "Approve closure"}
                  </button>
                  <button
                    className="button-danger"
                    type="button"
                    disabled={busyId === lead.id}
                    onClick={(event) => {
                      const formData = new FormData(event.currentTarget.form as HTMLFormElement);
                      void decide(lead, "REJECT", formData);
                    }}
                  >
                    Reject
                  </button>
                </div>
              </form>
            );
          })
        ) : (
          <div className="success-box">No lead closure requests are waiting.</div>
        )}
      </div>
    </section>
  );
}

export function ApprovalDecisionCard({
  approvals,
  agents,
  leads,
}: {
  approvals: ApprovalRequest[];
  agents: User[];
  leads: Lead[];
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [selectedApprovalId, setSelectedApprovalId] = useState("");
  const pendingApprovals = approvals.filter((entry) => entry.status === "PENDING");
  const selectedApproval = pendingApprovals.find((entry) => entry.id === selectedApprovalId);
  const selectedLead = selectedApproval ? leads.find((entry) => entry.id === selectedApproval.leadId) : undefined;
  const selectedRequestedBy = selectedApproval ? agents.find((agent) => agent.id === selectedApproval.createdBy) : undefined;

  useEffect(() => {
    if (!selectedApprovalId) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedApprovalId("");
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedApprovalId]);

  async function decide(id: string, status: "APPROVED" | "REJECTED", note: string) {
    setBusyId(id);
    setError("");
    const response = await fetch(`/api/approval-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, decisionNote: note }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Pending Approvals</h2>
          <p className="panel-copy">Managers are the only role allowed to approve or reject final prices.</p>
        </div>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {pendingApprovals.length ? (
          pendingApprovals.map((approval) => (
            <div key={approval.id} className="data-row">
              <button
                className="detail-toggle"
                type="button"
                onClick={() => setSelectedApprovalId(approval.id)}
                aria-haspopup="dialog"
                aria-expanded={selectedApprovalId === approval.id}
              >
                <div className="panel-header">
                  <h4>{approval.customerName}</h4>
                  <span className="status-badge status-pending">{approval.status}</span>
                </div>
                <p>{getApprovalItems(approval).map((item) => `${item.grade} @ ${item.quotedPrice}`).join(" | ")}</p>
                <div className="row-meta">
                  <span>{approval.siteName}</span>
                  <span>{approval.quantity} CUM</span>
                  <span>{approval.paymentType.replaceAll("_", " ").toLowerCase()}/{approval.paymentTerms.replaceAll("_", " ").toLowerCase()}</span>
                </div>
                <span className="hint">Tap to open full summary</span>
              </button>
              <div className="button-row">
                <button
                  className="button"
                  type="button"
                  disabled={busyId === approval.id}
                  onClick={() => void decide(approval.id, "APPROVED", "Approved from manager dashboard.")}
                >
                  Approve
                </button>
                <button
                  className="button-danger"
                  type="button"
                  disabled={busyId === approval.id}
                  onClick={() => void decide(approval.id, "REJECTED", "Rejected from manager dashboard.")}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="success-box">No pending approvals right now.</div>
        )}
      </div>
      <ApprovalSummaryModal
        approval={selectedApproval}
        requestedBy={selectedRequestedBy}
        lead={selectedLead}
        busyId={busyId}
        onClose={() => setSelectedApprovalId("")}
        onDecide={decide}
      />
    </section>
  );
}

function ApprovalSummaryModal({
  approval,
  requestedBy,
  lead,
  busyId,
  onClose,
  onDecide,
}: {
  approval?: ApprovalRequest;
  requestedBy?: User;
  lead?: Lead;
  busyId: string;
  onClose: () => void;
  onDecide: (id: string, status: "APPROVED" | "REJECTED", note: string) => Promise<void>;
}) {
  if (!approval || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`approval-dialog-title-${approval.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card-header">
          <div>
            <div className="panel-header">
              <h3 id={`approval-dialog-title-${approval.id}`}>{approval.customerName}</h3>
              <span className="status-badge status-pending">{approval.status}</span>
            </div>
            <p className="panel-copy">Full approval summary for manager review.</p>
          </div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close approval summary">
            Close
          </button>
        </div>
        <div className="modal-scroll">
          <ApprovalDetails approval={approval} requestedBy={requestedBy} lead={lead} />
        </div>
        <div className="button-row">
          <button
            className="button"
            type="button"
            disabled={busyId === approval.id}
            onClick={() => void onDecide(approval.id, "APPROVED", "Approved from manager dashboard.")}
          >
            Approve
          </button>
          <button
            className="button-danger"
            type="button"
            disabled={busyId === approval.id}
            onClick={() => void onDecide(approval.id, "REJECTED", "Rejected from manager dashboard.")}
          >
            Reject
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ApprovalDetails({
  approval,
  requestedBy,
  lead,
}: {
  approval: ApprovalRequest;
  requestedBy?: User;
  lead?: Lead;
}) {
  const approvalItems = getApprovalItems(approval);

  return (
    <div className="details-grid">
      <DetailCell label="Customer" value={approval.customerName} />
      <DetailCell label="Requested by" value={requestedBy?.name ?? approval.createdBy} />
      <DetailCell label="Approved grades" value={approvalItems.map((item) => `${item.grade} @ ${item.quotedPrice}`).join(" | ")} />
      <DetailCell label="Quantity (CUM)" value={`${approval.quantity}`} />
      <DetailCell label="Required date" value={toIndiaTimeLabel(approval.requiredDate)} />
      <DetailCell label="One-way distance" value={`${approval.oneWayDistanceKm} km`} />
      <DetailCell label="Traffic count" value={`${approval.trafficCount}`} />
      <DetailCell label="Casting type" value={approval.castingType} />
      <DetailCell label="Mix design type" value={approval.mixDesignType.replaceAll("_", " ").toLowerCase()} />
      <DetailCell label="Payment type" value={approval.paymentType.replaceAll("_", " ").toLowerCase()} />
      <DetailCell label="Payment terms" value={approval.paymentTerms.replaceAll("_", " ").toLowerCase()} />
      <DetailCell label="Request created" value={toIndiaTimeLabel(approval.createdAt)} />
      <DetailCell label="Lead ID" value={approval.leadId} />
      <DetailCell label="Decision note" value={approval.decisionNote ?? "Pending manager decision"} />
      <DetailCell label="Site name" value={approval.siteName || lead?.siteName || "Not linked"} />
      <DetailCell label="Site address" value={approval.siteAddress || lead?.siteAddress || "Not linked"} />
      <DetailCell label="Lead stage" value={lead?.stage ?? "Not linked"} />
      <DetailCell label="Lead score" value={lead ? `${lead.score}` : "Not linked"} />
      <DetailCell label="Current supplier" value={lead?.currentSupplier ?? "Not linked"} />
      <DetailCell label="Price expectation" value={lead?.priceExpectation ?? "Not linked"} />
      <DetailCell label="Future scope" value={lead?.futureScope ?? "Not linked"} />
      <DetailCell label="Next follow-up" value={lead ? toIndiaTimeLabel(lead.nextFollowUpAt) : "Not linked"} />
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-cell">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  );
}

export function TargetCard({ agents, targets }: { agents: User[]; targets: Target[] }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    setMessage("Target saved.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Set Targets</h2>
          <p className="panel-copy">Targets drive the agent target-vs-achievement widget.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="agentId">Agent</label>
            <select id="agentId" name="agentId" defaultValue="" required>
              <option value="" disabled>
                Select agent
              </option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="month">Month</label>
            <input id="month" name="month" type="month" required />
          </div>
          <div className="field">
            <label htmlFor="quantityTarget">Quantity target</label>
            <input id="quantityTarget" name="quantityTarget" type="number" min="0" step="0.01" required />
          </div>
        </div>
        {message ? <div className="success-box">{message}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button-secondary" type="submit">
          Save target
        </button>
      </form>
      <div className="data-list mt-16">
        {targets.slice(0, 5).map((target) => (
          <div key={target.id} className="data-row">
            <h4>{target.month}</h4>
            <p>Target quantity {target.quantityTarget}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HelpResolutionCard({ helpRequests }: { helpRequests: HelpRequest[] }) {
  const [busyId, setBusyId] = useState("");
  const openRequests = helpRequests.filter((entry) => entry.status === "OPEN");

  async function resolve(id: string) {
    setBusyId(id);
    const response = await fetch(`/api/help-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutionNote: "Reviewed and resolved by manager." }),
    });

    if (!response.ok) {
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Correction Requests</h2>
          <p className="panel-copy">Resolve missed odometer or timing issues here.</p>
        </div>
      </div>
      <div className="data-list">
        {openRequests.length ? (
          openRequests.map((request) => (
            <div key={request.id} className="data-row">
              <h4>{request.requestedField}</h4>
              <p>{request.explanation}</p>
              <button className="button-ghost" type="button" disabled={busyId === request.id} onClick={() => void resolve(request.id)}>
                {busyId === request.id ? "Resolving..." : "Mark resolved"}
              </button>
            </div>
          ))
        ) : (
          <div className="success-box">No open correction requests.</div>
        )}
      </div>
    </section>
  );
}

export function TaskAssignmentCard({ agents }: { agents: User[] }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries())),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      return;
    }

    setMessage("Task assigned.");
    window.setTimeout(() => window.location.reload(), 700);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Assign Secondary Task</h2>
          <p className="panel-copy">These tasks appear in the sales agent secondary task section.</p>
        </div>
      </div>
      <form className="form-grid" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="assignedTo">Assign to</label>
          <select id="assignedTo" name="assignedTo" defaultValue="" required>
            <option value="" disabled>
              Select agent
            </option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="subject">Subject</label>
          <input id="subject" name="subject" required />
        </div>
        <div className="field">
          <label htmlFor="explanation">Explanation</label>
          <textarea id="explanation" name="explanation" required />
        </div>
        <div className="field">
          <label htmlFor="deadline">Deadline</label>
          <input id="deadline" name="deadline" type="datetime-local" required />
        </div>
        {message ? <div className="success-box">{message}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button" type="submit">
          Assign task
        </button>
      </form>
    </section>
  );
}
