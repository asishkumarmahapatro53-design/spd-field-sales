"use client";

import { useMemo, useState } from "react";

const GRADE_PRICES: Record<string, number> = {
  M10: 3500,
  M15: 3750,
  M20: 3900,
  M25: 4047,
  M30: 4227,
  M35: 4467,
  M40: 4667,
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function InstantPriceCard() {
  const [distanceKm, setDistanceKm] = useState("12");
  const [quantityCum, setQuantityCum] = useState("30");
  const [grade, setGrade] = useState("M25");
  const [trafficCount, setTrafficCount] = useState("1");

  const summary = useMemo(() => {
    const distance = Number(distanceKm);
    const quantity = Number(quantityCum);
    const traffic = Number(trafficCount);
    const basePrice = GRADE_PRICES[grade] ?? 0;
    const distanceCharge = Math.max(distance - 12, 0) * 13;
    const trafficCharge = Math.max(traffic, 0) * 15;
    const approximateRate = roundCurrency(basePrice + distanceCharge + trafficCharge);
    const estimatedOrderValue = Number.isFinite(quantity) && quantity > 0 ? roundCurrency(approximateRate * quantity) : null;

    return {
      basePrice,
      distanceCharge: roundCurrency(distanceCharge),
      trafficCharge: roundCurrency(trafficCharge),
      approximateRate,
      estimatedOrderValue,
    };
  }, [distanceKm, quantityCum, grade, trafficCount]);

  return (
    <div className="section-stack">
      <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
        <div className="three-grid">
          <div className="field">
            <label htmlFor="instantPriceDistance">Distance from plant (km)</label>
            <input
              id="instantPriceDistance"
              type="number"
              min="0"
              step="0.1"
              value={distanceKm}
              onChange={(event) => setDistanceKm(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="instantPriceQuantity">Quantity (CUM)</label>
            <input
              id="instantPriceQuantity"
              type="number"
              min="0"
              step="0.01"
              value={quantityCum}
              onChange={(event) => setQuantityCum(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="instantPriceTraffic">Number of traffic</label>
            <input
              id="instantPriceTraffic"
              type="number"
              min="0"
              value={trafficCount}
              onChange={(event) => setTrafficCount(event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="instantPriceGrade">Concrete grade</label>
          <select id="instantPriceGrade" value={grade} onChange={(event) => setGrade(event.target.value)}>
            {Object.keys(GRADE_PRICES).map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div className="summary-card">
        <div className="panel-header">
          <div>
            <h4>Approximate pricing</h4>
            <p className="panel-copy">Base price + traffic charge + extra distance charge over 12 km.</p>
          </div>
        </div>
        <div className="summary-card-grid">
          <div className="summary-cell">
            <span className="summary-label">Base price</span>
            <strong>{summary.basePrice}</strong>
          </div>
          <div className="summary-cell">
            <span className="summary-label">Traffic charge</span>
            <strong>{summary.trafficCharge}</strong>
          </div>
          <div className="summary-cell">
            <span className="summary-label">Distance charge</span>
            <strong>{summary.distanceCharge}</strong>
          </div>
          <div className="summary-cell">
            <span className="summary-label">Approx rate / CUM</span>
            <strong>{summary.approximateRate}</strong>
          </div>
        </div>
        <div className="note-box">
          {summary.estimatedOrderValue !== null
            ? `Estimated order value for ${quantityCum || "0"} CUM: ${summary.estimatedOrderValue}`
            : "Enter a quantity to see the estimated order value."}
        </div>
      </div>
    </div>
  );
}
