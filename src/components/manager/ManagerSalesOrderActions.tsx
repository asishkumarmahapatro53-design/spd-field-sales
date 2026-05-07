"use client";

import { useState } from "react";
import { getSalesOrderStatusMeta } from "@/lib/commercial";
import { toIndiaTimeLabel } from "@/lib/date";
import type { Lead, SalesOrderRequest, User } from "@/lib/types";

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

export function ManagerSalesOrderActions({
  requests,
  leads,
  agents,
}: {
  requests: SalesOrderRequest[];
  leads: Lead[];
  agents: User[];
}) {
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [pumpNotes, setPumpNotes] = useState<Record<string, string>>({});
  const [pumpVehicles, setPumpVehicles] = useState<Record<string, string>>({});
  const [pumpOperators, setPumpOperators] = useState<Record<string, string>>({});
  const [pumpPhones, setPumpPhones] = useState<Record<string, string>>({});
  const pendingRequests = requests.filter((entry) => entry.status === "SCHEDULE_PENDING");
  const leadsById = new Map(leads.map((entry) => [entry.id, entry]));
  const agentsById = new Map(agents.map((entry) => [entry.id, entry]));
  const recentPipeline = requests
    .filter((entry) => entry.status !== "SCHEDULE_PENDING")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6);

  async function decide(id: string, status: "SCHEDULE_APPROVED" | "SCHEDULE_REJECTED", note: string) {
    setBusyId(id);
    setError("");

    const response = await fetch(`/api/sales-order-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    window.location.reload();
  }

  async function updatePumpDispatch(request: SalesOrderRequest, pumpDispatched: boolean) {
    setBusyId(request.id);
    setError("");

    const response = await fetch(`/api/sales-order-requests/${request.id}/pump-dispatch`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pumpDispatched,
        pumpVehicleNumber: pumpVehicles[request.id] ?? "",
        pumpOperatorName: pumpOperators[request.id] ?? "",
        pumpOperatorPhone: pumpPhones[request.id] ?? "",
        note: pumpNotes[request.id] ?? "",
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
          <h2>Production Schedule Requests</h2>
          <p className="panel-copy">Approve or reject schedule slots after finance has already verified the sales order request.</p>
        </div>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      <div className="data-list">
        {pendingRequests.length ? (
          pendingRequests.map((request) => {
            const lead = leadsById.get(request.leadId);
            const createdBy = agentsById.get(request.createdBy);
            return (
              <article key={request.id} className="data-row">
                <div className="panel-header">
                  <h4>{request.customerName}</h4>
                  <span className="status-badge status-manager_view">Schedule pending</span>
                </div>
                <div className="row-meta">
                  <span>{request.grade}</span>
                  <span>{request.quantity} CUM</span>
                  <span>{toIndiaTimeLabel(request.scheduleDateTime ?? request.requiredDate)}</span>
                </div>
                <p>{request.siteAddress}</p>
                <div className="row-meta">
                  <span>Receiver {request.scheduleReceiverName ?? request.receiverName}</span>
                  <span>{request.scheduleReceiverPhone ?? request.receiverPhone}</span>
                  <span>Created by {createdBy?.name ?? request.createdBy}</span>
                </div>
                {request.scheduleNote ? <p>{request.scheduleNote}</p> : null}
                <div className="row-meta">
                  <span>Lead {lead?.siteName ?? request.siteName}</span>
                  <span>{request.priority.toLowerCase()} priority</span>
                  <span>{request.mixDesignType.replaceAll("_", " ").toLowerCase()}</span>
                </div>
                <div className="button-row">
                  <button
                    className="button"
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => void decide(request.id, "SCHEDULE_APPROVED", "Schedule approved by production manager workflow.")}
                  >
                    {busyId === request.id ? "Saving..." : "Approve schedule"}
                  </button>
                  <button
                    className="button-danger"
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => void decide(request.id, "SCHEDULE_REJECTED", "Schedule rejected. Agent may edit and resubmit.")}
                  >
                    {busyId === request.id ? "Saving..." : "Reject schedule"}
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="success-box">No schedule requests are waiting for production approval right now.</div>
        )}
      </div>

      <div className="data-list mt-16">
        {recentPipeline.length ? (
          recentPipeline.map((request) => {
            const statusMeta = getSalesOrderStatusMeta(request.status);
            return (
              <article key={request.id} className="data-row">
                <div className="panel-header">
                  <h4>{request.customerName}</h4>
                  <span className={`status-badge ${statusMeta.className}`}>{statusMeta.label}</span>
                </div>
                <div className="row-meta">
                  <span>{request.grade}</span>
                  <span>{request.quantity} CUM</span>
                  <span>{toIndiaTimeLabel(request.createdAt)}</span>
                </div>
                <p>{request.siteName}</p>
                {request.status === "SCHEDULE_APPROVED" ? (
                  <div className="summary-card">
                    <div className="panel-header">
                      <div>
                        <h4>Pump dispatch decision</h4>
                        <p className="panel-copy">
                          Planned {request.plannedCastingType.toLowerCase()}, actual {request.actualCastingType.toLowerCase()}.
                        </p>
                      </div>
                      <span className="status-badge status-manager_view">{request.pumpDispatchStatus.replaceAll("_", " ").toLowerCase()}</span>
                    </div>
                    <div className="three-grid">
                      <div className="field">
                        <label htmlFor={`pumpVehicle-${request.id}`}>Pump vehicle</label>
                        <input
                          id={`pumpVehicle-${request.id}`}
                          value={pumpVehicles[request.id] ?? request.pumpVehicleNumber ?? ""}
                          onChange={(event) => setPumpVehicles((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Pump vehicle no."
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`pumpOperator-${request.id}`}>Pump operator</label>
                        <input
                          id={`pumpOperator-${request.id}`}
                          value={pumpOperators[request.id] ?? request.pumpOperatorName ?? ""}
                          onChange={(event) => setPumpOperators((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Operator name"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor={`pumpPhone-${request.id}`}>Operator phone</label>
                        <input
                          id={`pumpPhone-${request.id}`}
                          value={pumpPhones[request.id] ?? request.pumpOperatorPhone ?? ""}
                          onChange={(event) => setPumpPhones((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Mobile"
                        />
                      </div>
                    </div>
                    <div className="field">
                      <label htmlFor={`pumpNote-${request.id}`}>Pump decision note</label>
                      <textarea
                        id={`pumpNote-${request.id}`}
                        value={pumpNotes[request.id] ?? request.pumpDispatchNote ?? ""}
                        onChange={(event) => setPumpNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                        placeholder="Reason if planned and actual casting differ"
                      />
                    </div>
                    <div className="button-row">
                      <button className="button" type="button" disabled={busyId === request.id} onClick={() => void updatePumpDispatch(request, true)}>
                        Mark pump dispatched
                      </button>
                      <button className="button-secondary" type="button" disabled={busyId === request.id} onClick={() => void updatePumpDispatch(request, false)}>
                        Mark dump/no pump
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : null}
      </div>
    </section>
  );
}
