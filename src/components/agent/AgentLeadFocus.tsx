"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { toIndiaTimeLabel } from "@/lib/date";
import type { Lead } from "@/lib/types";

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

export function AgentLeadFocus({ leads, maxItems }: { leads: Lead[]; maxItems?: number }) {
  const router = useRouter();
  const [leadState, setLeadState] = useState(leads);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isRefreshing, startTransition] = useTransition();
  const visibleLeads = typeof maxItems === "number" ? leadState.slice(0, maxItems) : leadState;

  async function requestClosure(event: React.FormEvent<HTMLFormElement>, leadId: string) {
    event.preventDefault();
    setBusyId(leadId);
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close",
        reason: formData.get("reason"),
        remarks: formData.get("remarks"),
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    const payload = (await response.json()) as { lead?: Lead };
    setLeadState((current) => current.map((lead) => (lead.id === leadId && payload.lead ? payload.lead : lead)));
    setBusyId("");
    setMessage("Closure request sent to manager approval.");
    startTransition(() => router.refresh());
  }

  if (!visibleLeads.length) {
    return <div className="note-box">No site leads yet. Your first site visit will create one.</div>;
  }

  return (
    <div className="data-list">
      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
      {visibleLeads.map((lead) => (
        <div key={lead.id} className="data-row">
          <div className="panel-header">
            <h4>{lead.siteName}</h4>
            <div className="button-row">
              <StatusBadge value={lead.stage} />
              {lead.closureStatus && lead.closureStatus !== "OPEN" ? <StatusBadge value={lead.closureStatus} /> : null}
            </div>
          </div>
          <p>{lead.siteAddress}</p>
          <div className="row-meta">
            <span>Score {lead.score}/10</span>
            <span>Follow-up {toIndiaTimeLabel(lead.nextFollowUpAt)}</span>
            <span>Supplier {lead.currentSupplier}</span>
            <span>
              {lead.siteCount ?? 1} site{(lead.siteCount ?? 1) === 1 ? "" : "s"}
            </span>
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
          {lead.closureStatus === "PENDING_MANAGER_APPROVAL" ? (
            <div className="warning-box">Closure is waiting for manager approval. This lead stays active until approved.</div>
          ) : null}
          {lead.stage !== "DEAD" && lead.stage !== "LOST" && lead.closureStatus !== "PENDING_MANAGER_APPROVAL" ? (
            <details className="history-toggle">
              <summary>
                <span>Request closure</span>
                <span className="history-toggle-copy">Dead/lost needs manager approval</span>
              </summary>
              <form className="form-grid mt-16" onSubmit={(event) => void requestClosure(event, lead.id)}>
                <div className="three-grid">
                  <div className="field">
                    <label htmlFor={`close-reason-${lead.id}`}>Closure type</label>
                    <select id={`close-reason-${lead.id}`} name="reason" defaultValue="DEAD" required>
                      <option value="DEAD">Dead</option>
                      <option value="LOST">Lost</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={`close-remarks-${lead.id}`}>Reason</label>
                    <input id={`close-remarks-${lead.id}`} name="remarks" required />
                  </div>
                </div>
                <button className="button-secondary" type="submit" disabled={busyId === lead.id || isRefreshing}>
                  {busyId === lead.id ? "Sending..." : "Send to manager"}
                </button>
              </form>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
}
