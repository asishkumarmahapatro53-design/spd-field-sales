"use client";

import { useState } from "react";
import { toIndiaTimeLabel } from "@/lib/date";
import type { DispatchRecord, FleetVehicle, MixDesign, SalesOrderRequest } from "@/lib/types";

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
  
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [returnDispatchId, setReturnDispatchId] = useState("");
  const [returnQty, setReturnQty] = useState<number | "">("");
  const [processingReturn, setProcessingReturn] = useState(false);

  const selectedOrder = activeOrders.find((o) => o.id === selectedOrderId);
  const selectedVehicle = fleetVehicles.find((v) => v.id === selectedVehicleId);
  const idleVehicles = fleetVehicles.filter((v) => v.status === "IDLE");

  // Determine active mix design for the selected order
  const activeMixDesign = selectedOrder 
    ? mixDesigns.find((m) => m.grade === selectedOrder.grade) 
    : null;

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
      setError(`No active Mix Design found for grade ${selectedOrder.grade}. Please ask QC to create one.`);
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
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Dispatch failed" }));
        throw new Error(d.error ?? "Dispatch failed");
      }

      setSuccess(`Dispatched ${dispatchQty} CUM to ${selectedOrder.siteName} using truck ${selectedVehicle.vehicleCode}.`);
      setDispatchQty("");
      setSelectedVehicleId("");
      
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

  async function handleReturnLoad() {
    setError("");
    setSuccess("");

    if (!returnDispatchId) {
      setError("Please select a dispatch record to return.");
      return;
    }
    if (!returnQty || returnQty <= 0) {
      setError("Please enter a valid return quantity.");
      return;
    }

    const record = dispatchRecords.find((d) => d.id === returnDispatchId);
    if (!record) return;
    if (returnQty > record.dispatchedQuantityCum) {
      setError("Return quantity cannot be more than the dispatched quantity.");
      return;
    }

    setProcessingReturn(true);
    try {
      const res = await fetch(`/api/dispatch/${returnDispatchId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnedQuantityCum: Number(returnQty) }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Return failed" }));
        throw new Error(d.error ?? "Return failed");
      }

      setSuccess(`Successfully logged return load of ${returnQty} CUM for truck ${record.vehicleCode}.`);
      setReturnDispatchId("");
      setReturnQty("");
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      setError(e.message ?? "An error occurred.");
    } finally {
      setProcessingReturn(false);
    }
  }

  // Pre-fill suggested quantity when a truck is selected
  function onVehicleSelect(id: string) {
    setSelectedVehicleId(id);
    const v = fleetVehicles.find((vh) => vh.id === id);
    if (v && selectedOrder) {
      setDispatchQty(Math.min(v.capacityCum, selectedOrder.remainingQuantity));
    }
  }

  // Filter dispatch records that can have a return load (must be DISPATCHED status)
  const activeDispatches = dispatchRecords.filter((d) => d.status === "DISPATCHED");

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

        {selectedOrder && !activeMixDesign && (
          <div className="note-box mt-16" style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}>
            <strong>Missing Mix Design:</strong> There is no active Mix Design for grade <strong>{selectedOrder.grade}</strong>. 
            You cannot dispatch this order until QC configures the Mix Design in the Manager Dashboard.
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

      {/* Return Load Section */}
      <div className="card mt-24">
        <div className="panel-header">
          <div>
            <h3>Log Return Load</h3>
            <p className="panel-copy">If a truck returns with leftover concrete, log it here to adjust the material consumption audit.</p>
          </div>
        </div>

        <div className="form-grid mt-16">
          <div className="field">
            <label>Select Active Dispatch</label>
            <select
              className="select"
              value={returnDispatchId}
              onChange={(e) => setReturnDispatchId(e.target.value)}
            >
              <option value="">-- Choose Dispatch --</option>
              {activeDispatches.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.vehicleCode} | Dispatched: {d.dispatchedQuantityCum} CUM | {toIndiaTimeLabel(d.dispatchedAt)}
                </option>
              ))}
            </select>
          </div>
          
          <div className="field">
            <label>Returned Quantity (CUM)</label>
            <input
              type="number"
              className="input"
              value={returnQty}
              onChange={(e) => setReturnQty(e.target.value ? Number(e.target.value) : "")}
              placeholder="e.g. 1.5"
              step="0.1"
              min="0"
            />
          </div>
        </div>

        <div className="button-row mt-16">
          <button 
            className="button button-secondary" 
            onClick={handleReturnLoad}
            disabled={processingReturn || !returnDispatchId || !returnQty}
          >
            {processingReturn ? "Logging..." : "Log Return Load"}
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
                <th>Truck</th>
                <th>Order Grade</th>
                <th>Dispatch (CUM)</th>
                <th>Return (CUM)</th>
                <th>Final (CUM)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dispatchRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                    No dispatches recorded today.
                  </td>
                </tr>
              ) : (
                dispatchRecords.slice(0, 15).map((d) => {
                  const order = activeOrders.find(o => o.id === d.orderId); // Note: might not be in activeOrders if complete, but good enough for UI
                  return (
                    <tr key={d.id}>
                      <td>{toIndiaTimeLabel(d.dispatchedAt)}</td>
                      <td><strong>{d.vehicleCode}</strong></td>
                      <td>{order?.grade || "N/A"}</td>
                      <td>{d.dispatchedQuantityCum}</td>
                      <td>{d.returnedQuantityCum > 0 ? <span style={{color: "#b91c1c"}}>{d.returnedQuantityCum}</span> : "-"}</td>
                      <td><strong>{d.finalSuppliedCum}</strong></td>
                      <td>
                        <span className={`status-badge ${d.status === "DISPATCHED" ? "status-pending" : "status-paid"}`}>
                          {d.status}
                        </span>
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
