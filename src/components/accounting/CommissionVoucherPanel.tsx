"use client";

import { useCallback, useEffect, useState } from "react";
import type { CommissionVoucher, Plant } from "@/lib/types";

interface CommissionVoucherPanelProps {
  plants: Plant[];
}

export function CommissionVoucherPanel({ plants }: CommissionVoucherPanelProps) {
  const [selectedPlantId, setSelectedPlantId] = useState(plants[0]?.id ?? "");
  const [vouchers, setVouchers] = useState<CommissionVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);

  // Form State
  const [brokerName, setBrokerName] = useState("");
  const [siteName, setSiteName] = useState("");
  const [quantityCum, setQuantityCum] = useState<number | "">("");
  const [ratePerCum, setRatePerCum] = useState<number | "">("");

  const loadVouchers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounting/commission?plantId=${selectedPlantId}`);
      if (res.ok) {
        const data = await res.json();
        setVouchers(data.commissionVouchers ?? []);
      }
    } catch {
      setError("Failed to load commission vouchers.");
    } finally {
      setLoading(false);
    }
  }, [selectedPlantId]);

  useEffect(() => {
    loadVouchers();
  }, [loadVouchers]);

  async function handleGenerateVoucher() {
    setSaving(true);
    setError("");
    setSuccess("");

    if (!brokerName || !siteName || !quantityCum || !ratePerCum) {
      setError("All fields are required.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/accounting/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plantId: selectedPlantId,
          brokerName,
          siteName,
          quantityCum: Number(quantityCum),
          ratePerCum: Number(ratePerCum),
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Failed to generate voucher." }));
        throw new Error(d.error ?? "Failed to generate voucher.");
      }

      setSuccess("Commission voucher generated successfully.");
      setShowForm(false);
      setBrokerName("");
      setSiteName("");
      setQuantityCum("");
      setRatePerCum("");
      loadVouchers();
    } catch (e: any) {
      setError(e.message ?? "An error occurred.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTallyExport() {
    const unexported = vouchers.filter((v) => !v.exportedAt);
    if (unexported.length === 0) {
      setError("No new vouchers to export.");
      return;
    }

    setError("");
    setSuccess("");

    try {
      // Direct form submission approach to download a file
      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/accounting/tally-export";
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);

      setSuccess("Tally export started. Unexported vouchers have been marked as EXPORTED_TO_TALLY.");
      
      // Refresh list after a short delay to reflect the new statuses
      setTimeout(() => loadVouchers(), 2000);
    } catch {
      setError("Export failed.");
    }
  }

  const unexportedCount = vouchers.filter((v) => !v.exportedAt).length;

  return (
    <div className="card mt-24">
      <div className="panel-header">
        <div>
          <h3>Commission Vouchers & Tally Export</h3>
          <p className="panel-copy">Manually generate commission vouchers and export directly to Tally ERP 9 XML.</p>
        </div>
        <div className="header-actions">
          <select
            className="select"
            value={selectedPlantId}
            onChange={(e) => setSelectedPlantId(e.target.value)}
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="button button-secondary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "+ New Voucher"}
          </button>
          <button 
            className="button" 
            onClick={handleTallyExport}
            disabled={unexportedCount === 0}
          >
            Export to Tally ({unexportedCount})
          </button>
        </div>
      </div>

      {error && <div className="error-box mt-16">{error}</div>}
      {success && <div className="success-box mt-16">{success}</div>}

      {/* Manual Creation Form */}
      {showForm && (
        <div className="mix-design-form mt-16">
          <h3>Generate Manual Commission Voucher</h3>
          <div className="form-grid">
            <div className="field">
              <label>Broker / Recipient Name</label>
              <input
                type="text"
                className="input"
                placeholder="E.g. RK Construction / Agent Name"
                value={brokerName}
                onChange={(e) => setBrokerName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Site Name</label>
              <input
                type="text"
                className="input"
                placeholder="E.g. Skyline Towers"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
              />
            </div>
          </div>
          <div className="form-grid mt-16">
            <div className="field">
              <label>Final Delivered Quantity (CUM)</label>
              <input
                type="number"
                className="input"
                value={quantityCum}
                onChange={(e) => setQuantityCum(e.target.value ? Number(e.target.value) : "")}
                min={0}
                step={0.1}
              />
            </div>
            <div className="field">
              <label>Commission Rate (₹ per CUM)</label>
              <input
                type="number"
                className="input"
                value={ratePerCum}
                onChange={(e) => setRatePerCum(e.target.value ? Number(e.target.value) : "")}
                min={0}
              />
            </div>
            <div className="field">
              <label>Total Commission</label>
              <div className="input" style={{ background: "rgba(0,0,0,0.05)", fontWeight: "bold" }}>
                ₹{((Number(quantityCum) || 0) * (Number(ratePerCum) || 0)).toLocaleString("en-IN")}
              </div>
            </div>
          </div>
          <div className="button-row mt-16">
            <button className="button" onClick={handleGenerateVoucher} disabled={saving}>
              {saving ? "Generating..." : "Generate Voucher"}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="table-wrapper mt-24">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Recipient</th>
              <th>Site</th>
              <th>Qty (CUM)</th>
              <th>Rate (₹)</th>
              <th>Total (₹)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="loading-text" style={{ textAlign: "center" }}>Loading vouchers...</td></tr>
            ) : vouchers.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>No vouchers found for this plant.</td></tr>
            ) : (
              vouchers.map((v) => (
                <tr key={v.id}>
                  <td>{new Date(v.createdAt).toLocaleDateString()}</td>
                  <td><strong>{v.brokerName}</strong></td>
                  <td>{v.siteName}</td>
                  <td>{v.quantityCum}</td>
                  <td>₹{v.ratePerCum}</td>
                  <td><strong>₹{v.totalCommission.toLocaleString("en-IN")}</strong></td>
                  <td>
                    <span className={`status-badge ${v.exportedAt ? "status-paid" : "status-pending"}`}>
                      {v.exportedAt ? "EXPORTED" : "APPROVED"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
