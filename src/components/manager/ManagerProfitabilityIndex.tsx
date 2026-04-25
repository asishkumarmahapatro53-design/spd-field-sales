import type {
  ApprovalRequest,
  Lead,
  MaterialCostSnapshot,
  Plant,
  PlantPriceBenchmark,
  SiteVisit,
} from "@/lib/types";

const GRADE_RECIPES: Record<
  string,
  {
    cement: number;
    ggbs: number;
    flyAsh: number;
    aggregate: number;
    sand: number;
    diesel: number;
  }
> = {
  M20: { cement: 0.22, ggbs: 0.05, flyAsh: 0.07, aggregate: 1.08, sand: 0.52, diesel: 3.2 },
  M25: { cement: 0.25, ggbs: 0.06, flyAsh: 0.06, aggregate: 1.1, sand: 0.53, diesel: 3.3 },
  M30: { cement: 0.29, ggbs: 0.07, flyAsh: 0.05, aggregate: 1.12, sand: 0.55, diesel: 3.5 },
  M35: { cement: 0.32, ggbs: 0.08, flyAsh: 0.04, aggregate: 1.14, sand: 0.56, diesel: 3.7 },
};

interface ManagerProfitabilityIndexProps {
  plants: Plant[];
  leads: Lead[];
  approvals: ApprovalRequest[];
  siteVisits: SiteVisit[];
  materialCosts: MaterialCostSnapshot[];
  priceBenchmarks: PlantPriceBenchmark[];
}

function money(value: number) {
  return `Rs ${Math.round(value).toLocaleString("en-IN")}`;
}

function latestByDate<T>(items: T[], getDate: (item: T) => string) {
  return [...items].sort((left, right) => getDate(right).localeCompare(getDate(left)))[0] ?? null;
}

function parsePrice(value: string) {
  const match = value.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function estimateCostPerCum(cost: MaterialCostSnapshot | null, grade: string) {
  if (!cost) {
    return 0;
  }

  const recipe = GRADE_RECIPES[grade.toUpperCase()] ?? GRADE_RECIPES.M25;
  const rawMaterialCost =
    recipe.cement * cost.cementPerTon +
    recipe.ggbs * cost.ggbsPerTon +
    recipe.flyAsh * cost.flyAshPerTon +
    recipe.aggregate * cost.aggregatePerTon +
    recipe.sand * cost.sandPerTon;
  const logisticsCost = recipe.diesel * cost.dieselPerLitre + 280;

  return Math.round(rawMaterialCost + logisticsCost);
}

function getHealth(marginPercent: number) {
  if (marginPercent >= 22) {
    return { label: "Healthy", className: "status-approved", width: 92 };
  }

  if (marginPercent >= 12) {
    return { label: "Watch", className: "status-pending", width: 58 };
  }

  return { label: "Risk", className: "status-danger", width: 28 };
}

export function ManagerProfitabilityIndex({
  plants,
  leads,
  approvals,
  siteVisits,
  materialCosts,
  priceBenchmarks,
}: ManagerProfitabilityIndexProps) {
  const activeLeads = leads.filter((lead) => lead.stage !== "MISSED");
  const rows = activeLeads
    .map((lead) => {
      const plant = plants.find((entry) => entry.id === lead.plantId) ?? null;
      const materialCost =
        latestByDate(
          materialCosts.filter((entry) => entry.plantId === lead.plantId),
          (entry) => entry.effectiveAt,
        ) ?? null;
      const leadApprovals = approvals.filter((entry) => entry.leadId === lead.id);
      const selectedApproval =
        latestByDate(
          leadApprovals.filter((entry) => entry.status === "APPROVED"),
          (entry) => entry.createdAt,
        ) ??
        latestByDate(leadApprovals, (entry) => entry.createdAt);
      const latestVisit = latestByDate(
        siteVisits.filter((entry) => entry.leadId === lead.id),
        (entry) => entry.visitedAt,
      );
      const grade = selectedApproval?.grade || latestVisit?.concreteGrade || lead.currentConcreteGrade || "M25";
      const benchmark = priceBenchmarks.find(
        (entry) => entry.plantId === lead.plantId && entry.grade.toUpperCase() === grade.toUpperCase(),
      );
      const sellingPrice = selectedApproval?.quotedPrice || benchmark?.sellingPricePerCum || parsePrice(lead.priceExpectation);
      const quantity = selectedApproval?.quantity || latestVisit?.quantityCum || lead.currentQuantityCum || 0;
      const estimatedCost = estimateCostPerCum(materialCost, grade);
      const marginPerCum = Math.max(sellingPrice - estimatedCost, 0);
      const marginPercent = sellingPrice ? Math.round((marginPerCum / sellingPrice) * 100) : 0;
      const projectedProfit = marginPerCum * quantity;
      const health = getHealth(marginPercent);

      return {
        id: lead.id,
        siteName: lead.siteName,
        plantName: plant?.name ?? "Plant not linked",
        stage: lead.stage,
        grade,
        quantity,
        sellingPrice,
        estimatedCost,
        marginPerCum,
        marginPercent,
        projectedProfit,
        health,
      };
    })
    .sort((left, right) => right.projectedProfit - left.projectedProfit);

  const heatmapRows = plants.map((plant) => {
    const plantRows = rows.filter((row) => row.plantName === plant.name);
    const averageMargin = plantRows.length
      ? Math.round(plantRows.reduce((sum, row) => sum + row.marginPercent, 0) / plantRows.length)
      : 0;
    const projectedProfit = plantRows.reduce((sum, row) => sum + row.projectedProfit, 0);
    const health = getHealth(averageMargin);

    return {
      id: plant.id,
      name: plant.name,
      activeSites: plantRows.length,
      averageMargin,
      projectedProfit,
      health,
    };
  });

  const totalProjectedProfit = rows.reduce((sum, row) => sum + row.projectedProfit, 0);
  const averageMargin = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.marginPercent, 0) / rows.length) : 0;

  return (
    <section className="manager-profitability-index mt-24">
      <div className="manager-profitability-header">
        <div>
          <span className="metric-label">Live profitability index</span>
          <h2>Site-Wise Profitability</h2>
          <p className="panel-copy">Estimated from current site grade, quote, plant costs, and active site quantity.</p>
        </div>
        <div className="manager-profitability-totals">
          <div>
            <span className="summary-label">Projected site margin</span>
            <strong>{money(totalProjectedProfit)}</strong>
          </div>
          <div>
            <span className="summary-label">Avg margin</span>
            <strong>{averageMargin}%</strong>
          </div>
        </div>
      </div>

      <div className="profitability-index-grid">
        <div className="profitability-site-list">
          {rows.length ? (
            rows.slice(0, 6).map((row) => (
              <article key={row.id} className="profitability-site-row">
                <div className="profitability-site-main">
                  <div>
                    <h3>{row.siteName}</h3>
                    <div className="row-meta">
                      <span>{row.plantName}</span>
                      <span>{row.grade}</span>
                      <span>{row.quantity} CUM</span>
                    </div>
                  </div>
                  <span className={`status-badge ${row.health.className}`}>{row.health.label}</span>
                </div>
                <div className="profitability-site-numbers">
                  <span>Quote {money(row.sellingPrice)}</span>
                  <span>Cost {money(row.estimatedCost)}</span>
                  <span>Margin {money(row.marginPerCum)}/CUM</span>
                  <strong>{money(row.projectedProfit)}</strong>
                </div>
                <div className="heatbar-track">
                  <span className={`heatbar-fill profitability-${row.health.label.toLowerCase()}`} style={{ width: `${row.health.width}%` }} />
                </div>
              </article>
            ))
          ) : (
            <div className="note-box">No active sites are available for profitability tracking yet.</div>
          )}
        </div>

        <div className="profitability-plant-heatmap">
          <span className="metric-label">Plant heat index</span>
          {heatmapRows.map((row) => (
            <div key={row.id} className="profitability-plant-row">
              <div>
                <strong>{row.name}</strong>
                <small>{row.activeSites} active sites</small>
              </div>
              <div className="profitability-plant-meter">
                <span>{row.averageMargin}%</span>
                <div className="heatbar-track">
                  <span className={`heatbar-fill profitability-${row.health.label.toLowerCase()}`} style={{ width: `${row.health.width}%` }} />
                </div>
              </div>
              <small>{money(row.projectedProfit)}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
