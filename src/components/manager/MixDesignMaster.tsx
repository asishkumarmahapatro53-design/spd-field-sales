"use client";

import { useState, useEffect, useCallback } from "react";
import type { MixDesign, Plant } from "@/lib/types";

interface MixDesignMasterProps {
  plants: Plant[];
  currentPlantId?: string;
}

const GRADES = ["M10", "M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50"];

const emptyForm = {
  grade: "M25",
  mixDesignType: "DESIGN_MIX" as const,
  targetSlumpMm: 100,
  cementKgPerCum: 0,
  ggbsKgPerCum: 0,
  flyAshKgPerCum: 0,
  sandKgPerCum: 0,
  aggregate10mmKgPerCum: 0,
  aggregate20mmKgPerCum: 0,
  admixtureKgPerCum: 0,
  waterLitresPerCum: 0,
};

export function MixDesignMaster({ plants, currentPlantId }: MixDesignMasterProps) {
  const [selectedPlantId, setSelectedPlantId] = useState(currentPlantId ?? plants[0]?.id ?? "");
  const [designs, setDesigns] = useState<MixDesign[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const loadDesigns = useCallback(async () => {
    if (!selectedPlantId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/mix-designs?plantId=${selectedPlantId}`);
      const data = await res.json();
      setDesigns(data.mixDesigns ?? []);
    } catch {
      setError("Failed to load Mix Designs.");
    } finally {
      setLoading(false);
    }
  }, [selectedPlantId]);

  useEffect(() => {
    loadDesigns();
  }, [loadDesigns]);

  function openNewForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setSuccess("");
    setError("");
  }

  function openEditForm(design: MixDesign) {
    setForm({
      grade: design.grade,
      mixDesignType: design.mixDesignType,
      targetSlumpMm: design.targetSlumpMm,
      cementKgPerCum: design.cementKgPerCum,
      ggbsKgPerCum: design.ggbsKgPerCum,
      flyAshKgPerCum: design.flyAshKgPerCum,
      sandKgPerCum: design.sandKgPerCum,
      aggregate10mmKgPerCum: design.aggregate10mmKgPerCum,
      aggregate20mmKgPerCum: design.aggregate20mmKgPerCum,
      admixtureKgPerCum: design.admixtureKgPerCum,
      waterLitresPerCum: design.waterLitresPerCum,
    });
    setEditingId(design.id);
    setShowForm(true);
    setSuccess("");
    setError("");
  }

  function setField(key: keyof typeof emptyForm, value: string | number) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/mix-designs/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        res = await fetch("/api/mix-designs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, plantId: selectedPlantId }),
        });
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Save failed." }));
        throw new Error(d.error ?? "Save failed.");
      }
      setSuccess(editingId ? "Mix Design updated successfully." : "Mix Design created successfully.");
      setShowForm(false);
      loadDesigns();
    } catch (e: any) {
      setError(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // Calculate water-binder ratio for display
  function wbRatio(d: MixDesign) {
    const binder = d.cementKgPerCum + d.ggbsKgPerCum + d.flyAshKgPerCum;
    if (binder === 0) return "—";
    return (d.waterLitresPerCum / binder).toFixed(2);
  }

  return (
    <div className="mix-design-master">
      {/* Header */}
      <div className="section-header">
        <div>
          <h2>Mix Design Master</h2>
          <p className="section-subtitle">Manage concrete recipes per grade and plant</p>
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
          <button className="button" onClick={openNewForm}>+ New Recipe</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      {/* Recipe Form */}
      {showForm && (
        <div className="card mix-design-form">
          <h3>{editingId ? "Edit Mix Design" : "New Mix Design"}</h3>
          <div className="form-grid">
            <div className="field">
              <label>Concrete Grade</label>
              <select
                className="select"
                value={form.grade}
                onChange={(e) => setField("grade", e.target.value)}
                disabled={!!editingId}
              >
                {GRADES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Mix Design Type</label>
              <select
                className="select"
                value={form.mixDesignType}
                onChange={(e) => setField("mixDesignType", e.target.value as "DESIGN_MIX" | "NOMINAL_MIX")}
              >
                <option value="DESIGN_MIX">Design Mix</option>
                <option value="NOMINAL_MIX">Nominal Mix</option>
              </select>
            </div>
            <div className="field">
              <label>Target Slump (mm)</label>
              <input
                type="number"
                className="input"
                value={form.targetSlumpMm}
                onChange={(e) => setField("targetSlumpMm", Number(e.target.value))}
                min={0}
              />
            </div>
          </div>

          <p className="form-section-label">Material Quantities (kg per m³ unless noted)</p>
          <div className="form-grid form-grid-3">
            {(
              [
                ["Cement (kg)", "cementKgPerCum"],
                ["GGBS (kg)", "ggbsKgPerCum"],
                ["Fly Ash (kg)", "flyAshKgPerCum"],
                ["Sand (kg)", "sandKgPerCum"],
                ["10mm Aggregate (kg)", "aggregate10mmKgPerCum"],
                ["20mm Aggregate (kg)", "aggregate20mmKgPerCum"],
                ["Admixture (kg)", "admixtureKgPerCum"],
                ["Water (Litres)", "waterLitresPerCum"],
              ] as [string, keyof typeof emptyForm][]
            ).map(([label, key]) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  type="number"
                  className="input"
                  value={form[key] as number}
                  onChange={(e) => setField(key, Number(e.target.value))}
                  min={0}
                  step={0.1}
                />
              </div>
            ))}
          </div>

          <div className="button-row">
            <button className="button button-secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancel
            </button>
            <button className="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update Recipe" : "Create Recipe"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="loading-text">Loading recipes…</p>
      ) : designs.length === 0 ? (
        <div className="empty-state">
          <p>No Mix Designs found for this plant.</p>
          <button className="button" onClick={openNewForm}>Create First Recipe</button>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Type</th>
                <th>Slump (mm)</th>
                <th>Cement</th>
                <th>GGBS</th>
                <th>Fly Ash</th>
                <th>Sand</th>
                <th>10mm Agg.</th>
                <th>20mm Agg.</th>
                <th>Admix.</th>
                <th>Water (L)</th>
                <th>W/B Ratio</th>
                <th>Ver.</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {designs
                .sort((a, b) => a.grade.localeCompare(b.grade))
                .map((d) => (
                  <tr key={d.id} className={d.isActive ? "" : "row-inactive"}>
                    <td><strong>{d.grade}</strong></td>
                    <td>{d.mixDesignType === "DESIGN_MIX" ? "Design" : "Nominal"}</td>
                    <td>{d.targetSlumpMm}</td>
                    <td>{d.cementKgPerCum}</td>
                    <td>{d.ggbsKgPerCum}</td>
                    <td>{d.flyAshKgPerCum}</td>
                    <td>{d.sandKgPerCum}</td>
                    <td>{d.aggregate10mmKgPerCum}</td>
                    <td>{d.aggregate20mmKgPerCum}</td>
                    <td>{d.admixtureKgPerCum}</td>
                    <td>{d.waterLitresPerCum}</td>
                    <td className={parseFloat(wbRatio(d)) > 0.5 ? "value-warning" : ""}>{wbRatio(d)}</td>
                    <td>v{d.version}</td>
                    <td>
                      <button className="button button-sm" onClick={() => openEditForm(d)}>Edit</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
