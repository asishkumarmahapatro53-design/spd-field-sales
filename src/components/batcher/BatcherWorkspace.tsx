"use client";

import { useEffect, useState } from "react";
import { toIndiaTimeLabel } from "@/lib/date";
import { canUseInvoiceDocumentMode, getDocumentModeLabel } from "@/lib/legal-workflow";
import { findMixDesignForOrder } from "@/lib/mix-design";
import type { DispatchDocumentMode, DispatchRecord, FleetVehicle, MixDesign, SalesOrderRequest } from "@/lib/types";

interface BatcherWorkspaceProps {
  plantName: string;
  activeOrders: SalesOrderRequest[];
  fleetVehicles: FleetVehicle[];
  mixDesigns: MixDesign[];
  dispatchRecords: DispatchRecord[];
}

export function BatcherWorkspace({ plantName, activeOrders, fleetVehicles, mixDesigns, dispatchRecords }: BatcherWorkspaceProps) {
  const [selectedOrderId, setSelectedOrderId] = useState(activeOrders[0]?.id ?? "");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [dispatchQty, setDispatchQty] = useState<number | "">("");
  const [documentMode, setDocumentMode] = useState<DispatchDocumentMode>("CHALLAN_ONLY");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedOrder = activeOrders.find((o) => o.id === selectedOrderId);
  const selectedVehicle = fleetVehicles.find((v) => v.id === selectedVehicleId);
  const idleVehicles = fleetVehicles.filter((v) => v.status === "IDLE");
  const invoiceModeAllowed = selectedOrder ? canUseInvoiceDocumentMode(selectedOrder) : false;

  useEffect(() => {
    if (!invoiceModeAllowed) {
      setDocumentMode("CHALLAN_ONLY");
    }
  }, [invoiceModeAllowed]);

  const activeMixDesign = selectedOrder ? findMixDesignForOrder(mixDesigns, selectedOrder) : null;

  async function handleDispatch() {
    setError("");
    setSuccess("");

    if (!selectedOrder) {
      setError("Please select an order.");
      return;
    }
    if (!selectedVehicle) {
      setError("Please select a vehicle.");
      return;
    }
    if (!dispatchQty || dispatchQty <= 0) {
      setError("Please enter a valid dispatch quantity.");
      return;
    }
    if (!activeMixDesign) {
      setError(`No linked or active Mix Design found for grade ${selectedOrder.grade}. Please ask QC to create one.`);
      return;
    }
    if (dispatchQty > selectedOrder.remainingQuantity) {
      setError(`Cannot dispatch more than the remaining quantity (${selectedOrder.remainingQuantity} CUM).`);
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          vehicleId: selectedVehicle.id,
          dispatchedQuantityCum: Number(dispatchQty),
          documentMode,
          driverName,
          driverPhone,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Dispatch failed" }));
        throw new Error(d.error ?? "Dispatch failed");
      }

      setSuccess(`Dispatched ${dispatchQty} CUM to ${selectedOrder.siteName} using truck ${selectedVehicle.vehicleCode}.`);
      setDispatchQty("");
      setSelectedVehicleId("");
      setDocumentMode("CHALLAN_ONLY");
      setDriverName("");
      setDriverPhone("");

      // We rely on router.refresh() in the page to fetch fresh data
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      setError(e.message ?? "An error occurred.");
    } finally {
      setProcessing(false);
    }
  }

  // Pre-fill suggested quantity when a truck is selected
  function onVehicleSelect(id: string) {
    setSelectedVehicleId(id);
    const v = fleetVehicles.find((vh) => vh.id === id);
    if (v && selectedOrder) {
      setDispatchQty(Math.min(v.capacityCum, selectedOrder.remainingQuantity));
      setDriverName(v.driverName || "");
    }
  }

  async function markSiteStatus(dispatchId: string, status: "SITE_ACCEPTED" | "SITE_REJECTED") {
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/dispatch/${dispatchId}/site-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Site status update failed" }));
        throw new Error(d.error ?? "Site status update failed");
      }

      setSuccess(status === "SITE_ACCEPTED" ? "Challan marked accepted and billable." : "Challan rejected and returned to review.");
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (e: any) {
      setError(e.message ?? "An error occurred.");
    }
  }

  return (
    <div className="batcher-workspace">
      <div className="card mt-24">
        <div className="panel-header">
          <div>
            <h3>Dispatch Queue</h3>
            <p className="panel-copy">Plant: <strong>{plantName}</strong> | Showing approved orders ready for dispatch.</p>
          </div>
        </div>

        {error && <div className="error-box mt-16">{error}</div>}
        {success && <div className="success-box mt-16">{success}</div>}

        <div className="form-grid mt-24">
          <div className="field">
            <label>Select Order</label>
            <select
              className="select"
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
            >
              {activeOrders.length === 0 && <option value="">No active orders</option>}
              {activeOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.siteName} | {o.grade} | {o.remainingQuantity} CUM remaining
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Select IDLE Truck</label>
            <select
              className="select"
              value={selectedVehicleId}
              onChange={(e) => onVehicleSelect(e.target.value)}
            >
              <option value="">-- Choose Truck --</option>
              {idleVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vehicleCode} ({v.capacityCum} CUM Cap) - {v.driverName || "No Driver"}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Dispatch Quantity (CUM)</label>
            <input
              type="number"
              className="input"
              value={dispatchQty}
              onChange={(e) => setDispatchQty(e.target.value ? Number(e.target.value) : "")}
              placeholder="e.g. 7"
              step="0.1"
              min="0"
              max={selectedOrder?.remainingQuantity || 100}
            />
            {selectedOrder && (
              <small style={{ color: "var(--brand)", marginTop: "4px", display: "block" }}>
                Max available: {selectedOrder.remainingQuantity} CUM
              </small>
            )}
          </div>
        </div>

        <div className="three-grid mt-16">
          <div className="field">
            <label>Driver name</label>
            <input className="input" value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver name" />
          </div>
          <div className="field">
            <label>Driver phone</label>
            <input className="input" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="Driver mobile" />
          </div>
          <div className="field">
            <label>Document mode</label>
            <select
              className="select"
              value={documentMode}
              onChange={(e) => setDocumentMode(e.target.value as DispatchDocumentMode)}
              disabled={!invoiceModeAllowed}
            >
              <option value="CHALLAN_ONLY">Challan only</option>
              {invoiceModeAllowed ? <option value="CHALLAN_AND_INVOICE">Challan + invoice</option> : null}
              {invoiceModeAllowed ? <option value="CHALLAN_AND_GST_E_INVOICE">Challan + GST invoice/e-invoice</option> : null}
            </select>
            <small style={{ color: "var(--muted)", marginTop: "4px", display: "block" }}>
              {invoiceModeAllowed ? "GSTIN verified: invoice modes are unlocked." : "No verified GSTIN: challan only is enforced."}
            </small>
          </div>
        </div>

        {selectedOrder ? (
          <div className="row-meta mt-16">
            <span>GSTIN {selectedOrder.gstin ?? "not provided"}</span>
            <span>Actual casting {selectedOrder.actualCastingType.toLowerCase()}</span>
            <span>Pump {selectedOrder.pumpDispatchStatus.replaceAll("_", " ").toLowerCase()}</span>
          </div>
        ) : null}

        {selectedOrder && !activeMixDesign && (
          <div className="note-box mt-16" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
            <strong>Missing Mix Design:</strong> There is no linked or active Mix Design for grade <strong>{selectedOrder.grade}</strong>.
            You cannot dispatch this order until QC configures the Mix Design in the Mix Design Dashboard.
          </div>
        )}

        <div className="button-row mt-24">
          <button
            className="button"
            onClick={handleDispatch}
            disabled={processing || !selectedOrderId || !selectedVehicleId || !dispatchQty || !activeMixDesign}
          >
            {processing ? "Dispatching..." : "Confirm Dispatch"}
          </button>
        </div>
      </div>

      {/* Recent Dispatches Table */}
      <div className="card mt-24">
        <div className="panel-header">
          <div>
            <h3>Recent Dispatches (Today)</h3>
          </div>
        </div>
        <div className="table-wrapper mt-16">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Challan</th>
                <th>Truck</th>
                <th>Order Grade</th>
                <th>Dispatch (CUM)</th>
                <th>Doc Mode</th>
                <th>Casting</th>
                <th>Return (CUM)</th>
                <th>Final (CUM)</th>
                <th>Status</th>
                <th>Invoice</th>
                <th>Site</th>
              </tr>
            </thead>
            <tbody>
              {dispatchRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                    No dispatches recorded today.
                  </td>
                </tr>
              ) : (
                dispatchRecords.slice(0, 15).map((d) => {
                  const order = activeOrders.find(o => o.id === d.orderId); // Note: might not be in activeOrders if complete, but good enough for UI
                  return (
                    <tr key={d.id}>
                      <td>{toIndiaTimeLabel(d.dispatchedAt)}</td>
                      <td>{d.challanNumber}</td>
                      <td><strong>{d.vehicleCode}</strong></td>
                      <td>{order?.grade || "N/A"}</td>
                      <td>{d.dispatchedQuantityCum}</td>
                      <td>{getDocumentModeLabel(d.documentMode)}</td>
                      <td>{d.actualCastingType.toLowerCase()}</td>
                      <td>{d.returnedQuantityCum > 0 ? <span style={{ color: "#b91c1c" }}>{d.returnedQuantityCum}</span> : "-"}</td>
                      <td><strong>{d.finalSuppliedCum}</strong></td>
                      <td>
                        <span className={`status-badge ${d.status === "DISPATCHED" ? "status-pending" : "status-paid"}`}>
                          {d.status}
                        </span>
                      </td>
                      <td>
                        {d.documentMode === "CHALLAN_ONLY" ? (
                          "-"
                        ) : (
                          <a className="button-ghost" href={`/dispatch/${d.id}/invoice`} target="_blank" rel="noopener noreferrer">
                            Print invoice
                          </a>
                        )}
                      </td>
                      <td>
                        {d.status === "DISPATCHED" ? (
                          <div className="button-row">
                            <button className="button-ghost" type="button" onClick={() => void markSiteStatus(d.id, "SITE_ACCEPTED")}>
                              Accepted
                            </button>
                            <button className="button-danger" type="button" onClick={() => void markSiteStatus(d.id, "SITE_REJECTED")}>
                              Rejected
                            </button>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
