"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getApprovalItems } from "@/lib/commercial";
import { toIndiaTimeLabel } from "@/lib/date";
import type { ApprovalRequest, HelpRequest, Lead, OdometerReading, Target, User } from "@/lib/types";

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
