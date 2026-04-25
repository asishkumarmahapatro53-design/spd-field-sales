"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { StatusBadge } from "@/components/StatusBadge";
import { compareIsoAsc, toDateKey, toIndiaTimeLabel } from "@/lib/date";
import {
  ApprovalDecisionCard,
  HelpResolutionCard,
  TargetCard,
  TaskAssignmentCard,
  VerificationCard,
} from "@/components/manager/ManagerActions";
import type {
  ApprovalRequest,
  AuditLogEntry,
  CustomerAccount,
  CustomerInvoice,
  FleetVehicle,
  HelpRequest,
  LatLng,
  Lead,
  ManagerDashboardData,
  MaterialCostSnapshot,
  OdometerReading,
  Plant,
  PlantPriceBenchmark,
  SiteVisit,
  Target,
  Task,
  User,
  WorkdaySession,
} from "@/lib/types";

type ManagerPlantView = {
  plant: Plant;
  leads: Lead[];
  approvals: ApprovalRequest[];
  helpRequests: HelpRequest[];
  tasks: Task[];
  targets: Target[];
  verificationQueue: OdometerReading[];
  activity: AuditLogEntry[];
  fleetVehicles: FleetVehicle[];
  accounts: CustomerAccount[];
  invoices: CustomerInvoice[];
  materialCost: MaterialCostSnapshot | null;
  priceBenchmarks: PlantPriceBenchmark[];
  volumeSold: number;
  deliveryEfficiency: number;
  activeFleet: number;
  leadConversionRate: number;
  activeSites: number;
  notifications: Array<{
    id: string;
    title: string;
    detail: string;
    badge: string;
  }>;
  aiSummary: string;
  profitabilityRows: Array<{
    grade: string;
    sellingPrice: number;
    estimatedCost: number;
    margin: number;
    ratio: number;
  }>;
  cashFlowRows: Array<{
    id: string;
    customerName: string;
    outstandingAmount: number;
    creditUsedPercent: number;
    dueInDays: number;
    reminderSuggested: boolean;
    alertLabel: string;
  }>;
  dsoDays: number;
};

type AgentDayStatus = "ON_DUTY" | "DAY_CLOSED" | "NO_ACTIVITY";

type AgentTrackingCheckpoint = {
  id: string;
  label: string;
  detail: string;
  capturedAt: string;
};

type AgentTrackingLocation = {
  latLng: LatLng;
  source: string;
  capturedAt: string;
};

type AgentTrackingSummary = {
  agent: User;
  session: WorkdaySession | null;
  visits: SiteVisit[];
  readings: OdometerReading[];
  checkpoints: AgentTrackingCheckpoint[];
  latestLocation: AgentTrackingLocation | null;
  latestEventAt: string | null;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  siteCount: number;
  startReading: number | null;
  endReading: number | null;
  status: AgentDayStatus;
};

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

function estimateCostPerCum(cost: MaterialCostSnapshot | null, grade: string) {
  if (!cost) {
    return 0;
  }

  const recipe = GRADE_RECIPES[grade] ?? GRADE_RECIPES.M25;
  const rawMaterialCost =
    recipe.cement * cost.cementPerTon +
    recipe.ggbs * cost.ggbsPerTon +
    recipe.flyAsh * cost.flyAshPerTon +
    recipe.aggregate * cost.aggregatePerTon +
    recipe.sand * cost.sandPerTon;
  const logisticsCost = recipe.diesel * cost.dieselPerLitre + 280;

  return Math.round(rawMaterialCost + logisticsCost);
}

function getAverageSellingPrice(priceBenchmarks: PlantPriceBenchmark[]) {
  if (!priceBenchmarks.length) {
    return 0;
  }

  return priceBenchmarks.reduce((sum, entry) => sum + entry.sellingPricePerCum, 0) / priceBenchmarks.length;
}

function formatLatLng(latLng: LatLng | null) {
  if (!latLng) {
    return "Location not captured";
  }

  return `Lat ${latLng.lat.toFixed(5)}, Lng ${latLng.lng.toFixed(5)}`;
}

function getReadingValue(reading: OdometerReading) {
  return reading.finalValue ?? reading.ocrValue;
}

function getAgentDayStatusLabel(status: AgentDayStatus) {
  if (status === "ON_DUTY") {
    return "On duty";
  }

  if (status === "DAY_CLOSED") {
    return "Day closed";
  }

  return "No activity";
}

function getAgentDayStatusClass(status: AgentDayStatus) {
  if (status === "ON_DUTY") {
    return "status-on_duty";
  }

  if (status === "DAY_CLOSED") {
    return "status-day_closed";
  }

  return "status-no_activity";
}

function buildAgentTrackingSummary(
  agent: User,
  session: WorkdaySession | null,
  visits: SiteVisit[],
  readings: OdometerReading[],
): AgentTrackingSummary {
  const sortedVisits = [...visits].sort((left, right) => compareIsoAsc(left.visitedAt, right.visitedAt));
  const sortedReadings = [...readings].sort((left, right) => compareIsoAsc(left.capturedAt, right.capturedAt));
  const startReading = sortedReadings.find((entry) => entry.type === "START" && getReadingValue(entry) !== null);
  const endReading = [...sortedReadings].reverse().find((entry) => entry.type === "END" && getReadingValue(entry) !== null);

  const checkpoints: AgentTrackingCheckpoint[] = [];
  const locationEvents: AgentTrackingLocation[] = [];

  if (session) {
    checkpoints.push({
      id: `${session.id}-login`,
      label: "Office in",
      detail: session.loginLatLng ? formatLatLng(session.loginLatLng) : "Location not captured at login.",
      capturedAt: session.loginAt,
    });

    if (session.loginLatLng) {
      locationEvents.push({
        latLng: session.loginLatLng,
        source: "Login capture",
        capturedAt: session.loginAt,
      });
    }
  }

  for (const reading of sortedReadings) {
    const readingValue = getReadingValue(reading);
    checkpoints.push({
      id: reading.id,
      label: `${reading.type} reading`,
      detail:
        readingValue !== null
          ? `Reading ${readingValue} recorded with status ${reading.status.replaceAll("_", " ").toLowerCase()}.`
          : `Reading is still ${reading.status.replaceAll("_", " ").toLowerCase()}.`,
      capturedAt: reading.capturedAt,
    });

    if (reading.capturedLatLng) {
      locationEvents.push({
        latLng: reading.capturedLatLng,
        source: `${reading.type} reading`,
        capturedAt: reading.capturedAt,
      });
    }
  }

  for (const visit of sortedVisits) {
    checkpoints.push({
      id: visit.id,
      label: "Site visit",
      detail: `${visit.siteName} (${visit.concreteGrade}, ${visit.quantityCum} cum).`,
      capturedAt: visit.visitedAt,
    });

    if (visit.latLng) {
      locationEvents.push({
        latLng: visit.latLng,
        source: `Site visit at ${visit.siteName}`,
        capturedAt: visit.visitedAt,
      });
    }
  }

  if (session?.logoutAt) {
    checkpoints.push({
      id: `${session.id}-logout`,
      label: "Office out",
      detail: session.logoutLatLng ? formatLatLng(session.logoutLatLng) : "Location not captured at logout.",
      capturedAt: session.logoutAt,
    });

    if (session.logoutLatLng) {
      locationEvents.push({
        latLng: session.logoutLatLng,
        source: "Logout capture",
        capturedAt: session.logoutAt,
      });
    }
  }

  checkpoints.sort((left, right) => compareIsoAsc(left.capturedAt, right.capturedAt));
  locationEvents.sort((left, right) => compareIsoAsc(left.capturedAt, right.capturedAt));

  const latestLocation = locationEvents.length ? locationEvents[locationEvents.length - 1] : null;
  const latestEventAt = checkpoints.length ? checkpoints[checkpoints.length - 1].capturedAt : null;

  return {
    agent,
    session,
    visits: sortedVisits,
    readings: sortedReadings,
    checkpoints,
    latestLocation,
    latestEventAt,
    firstVisitAt: sortedVisits[0]?.visitedAt ?? null,
    lastVisitAt: sortedVisits[sortedVisits.length - 1]?.visitedAt ?? null,
    siteCount: sortedVisits.length,
    startReading: startReading ? getReadingValue(startReading) : null,
    endReading: endReading ? getReadingValue(endReading) : null,
    status: session ? (session.status === "OPEN" ? "ON_DUTY" : "DAY_CLOSED") : "NO_ACTIVITY",
  };
}

function getAuditPlantId(
  entry: AuditLogEntry,
  {
    leadsById,
    approvalsById,
    tasksById,
    helpRequestsById,
    sessionsById,
    readingsById,
    visitsById,
    targetsById,
    usersById,
  }: {
    leadsById: Map<string, Lead>;
    approvalsById: Map<string, ApprovalRequest>;
    tasksById: Map<string, Task>;
    helpRequestsById: Map<string, HelpRequest>;
    sessionsById: Map<string, WorkdaySession>;
    readingsById: Map<string, OdometerReading>;
    visitsById: Map<string, { plantId: string }>;
    targetsById: Map<string, Target>;
    usersById: Map<string, User>;
  },
) {
  if (entry.entityType === "Lead") {
    return leadsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "ApprovalRequest") {
    return approvalsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "Task") {
    return tasksById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "HelpRequest") {
    return helpRequestsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "WorkdaySession") {
    return sessionsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "OdometerReading") {
    const reading = readingsById.get(entry.entityId);
    return reading ? sessionsById.get(reading.sessionId)?.plantId ?? null : null;
  }

  if (entry.entityType === "SiteVisit") {
    return visitsById.get(entry.entityId)?.plantId ?? null;
  }

  if (entry.entityType === "Target") {
    const target = targetsById.get(entry.entityId);
    return target ? usersById.get(target.userId)?.homePlantId ?? null : null;
  }

  return usersById.get(entry.actorId)?.homePlantId ?? null;
}

function buildPlantViews(data: ManagerDashboardData) {
  const usersById = new Map<string, User>([data.user, ...data.agents].map((entry) => [entry.id, entry]));
  const leadsById = new Map(data.leads.map((entry) => [entry.id, entry]));
  const approvalsById = new Map(data.approvals.map((entry) => [entry.id, entry]));
  const tasksById = new Map(data.tasks.map((entry) => [entry.id, entry]));
  const helpRequestsById = new Map(data.helpRequests.map((entry) => [entry.id, entry]));
  const sessionsById = new Map(data.workdaySessions.map((entry) => [entry.id, entry]));
  const readingsById = new Map(data.odometerReadings.map((entry) => [entry.id, entry]));
  const visitsById = new Map(data.siteVisits.map((entry) => [entry.id, { plantId: entry.plantId }]));
  const targetsById = new Map(data.targets.map((entry) => [entry.id, entry]));

  return data.plants.map<ManagerPlantView>((plant) => {
    const leads = data.leads.filter((entry) => entry.plantId === plant.id);
    const approvals = data.approvals.filter((entry) => entry.plantId === plant.id);
    const helpRequests = data.helpRequests.filter((entry) => entry.plantId === plant.id);
    const tasks = data.tasks.filter((entry) => entry.plantId === plant.id);
    const targets = data.targets.filter((entry) => usersById.get(entry.userId)?.homePlantId === plant.id);
    const verificationQueue = data.verificationQueue.filter((entry) => sessionsById.get(entry.sessionId)?.plantId === plant.id);
    const activity = data.auditLogs.filter(
      (entry) =>
        getAuditPlantId(entry, {
          leadsById,
          approvalsById,
          tasksById,
          helpRequestsById,
          sessionsById,
          readingsById,
          visitsById,
          targetsById,
          usersById,
        }) === plant.id,
    );
    const fleetVehicles = data.fleetVehicles.filter((entry) => entry.plantId === plant.id);
    const accounts = data.customerAccounts.filter((entry) => entry.plantId === plant.id);
    const invoices = data.customerInvoices.filter((entry) => entry.plantId === plant.id);
    const materialCost =
      data.materialCostSnapshots
        .filter((entry) => entry.plantId === plant.id)
        .sort((left, right) => right.effectiveAt.localeCompare(left.effectiveAt))[0] ?? null;
    const priceBenchmarks = data.priceBenchmarks.filter((entry) => entry.plantId === plant.id);

    const averageSellingPrice = getAverageSellingPrice(priceBenchmarks);
    const volumeFromInvoices = averageSellingPrice
      ? Math.round(invoices.reduce((sum, invoice) => sum + invoice.amount, 0) / averageSellingPrice)
      : 0;
    const approvedQuantity = approvals
      .filter((entry) => entry.status === "APPROVED")
      .reduce((sum, entry) => sum + entry.quantity, 0);
    const volumeSold = approvedQuantity || volumeFromInvoices;
    const activeFleet = fleetVehicles.filter((entry) => entry.status === "ACTIVE").length;
    const deliveryEfficiency = fleetVehicles.length
      ? Math.round(fleetVehicles.reduce((sum, vehicle) => sum + vehicle.onTimeRate, 0) / fleetVehicles.length)
      : 0;
    const activeSites = leads.filter((entry) => entry.stage !== "MISSED").length;
    const leadConversionRate = leads.length
      ? Math.round((leads.filter((entry) => entry.stage === "FINALIZED").length / leads.length) * 100)
      : 0;

    const profitabilityRows = priceBenchmarks.map((benchmark) => {
      const estimatedCost = estimateCostPerCum(materialCost, benchmark.grade);
      const margin = Math.max(benchmark.sellingPricePerCum - estimatedCost, 0);
      return {
        grade: benchmark.grade,
        sellingPrice: benchmark.sellingPricePerCum,
        estimatedCost,
        margin,
        ratio: Math.min(Math.max(Math.round((margin / Math.max(benchmark.sellingPricePerCum, 1)) * 100), 4), 92),
      };
    });

    const cashFlowRows = accounts.map((account) => {
      const relevantInvoices = invoices.filter((invoice) => invoice.accountId === account.id && invoice.status !== "PAID");
      const nearestDueAt = relevantInvoices
        .map((invoice) => new Date(invoice.dueAt).getTime())
        .sort((left, right) => left - right)[0];
      const dueInDays = nearestDueAt ? Math.ceil((nearestDueAt - Date.now()) / (24 * 60 * 60 * 1000)) : account.creditPeriodDays;
      const creditUsedPercent = Math.round((account.outstandingAmount / Math.max(account.creditLimit, 1)) * 100);
      const reminderSuggested = creditUsedPercent >= 90 || dueInDays <= 2;

      return {
        id: account.id,
        customerName: account.customerName,
        outstandingAmount: account.outstandingAmount,
        creditUsedPercent,
        dueInDays,
        reminderSuggested,
        alertLabel:
          creditUsedPercent >= 90
            ? "WhatsApp reminder suggested"
            : dueInDays < 0
              ? "Credit period exceeded"
              : "Within credit window",
      };
    });

    const dsoDays = invoices.length
      ? Math.round(
          invoices.reduce((sum, invoice) => {
            const settledAt = invoice.paidAt ? new Date(invoice.paidAt).getTime() : Date.now();
            return sum + Math.max(1, Math.round((settledAt - new Date(invoice.issuedAt).getTime()) / (24 * 60 * 60 * 1000)));
          }, 0) / invoices.length,
        )
      : 0;

    const notifications = [
      verificationQueue.length
        ? {
            id: `${plant.id}-verification`,
            title: `${verificationQueue.length} manual verification items`,
            detail: "Odometer readings are waiting for manager correction.",
            badge: "status-pending",
          }
        : null,
      approvals.filter((entry) => entry.status === "PENDING").length
        ? {
            id: `${plant.id}-approvals`,
            title: `${approvals.filter((entry) => entry.status === "PENDING").length} pending commercial decisions`,
            detail: "Final prices still need a manager decision.",
            badge: "status-danger",
          }
        : null,
      cashFlowRows.some((entry) => entry.creditUsedPercent >= 90)
        ? {
            id: `${plant.id}-cashflow`,
            title: "Credit threshold reached",
            detail: "One or more contractors crossed the 90% credit usage mark.",
            badge: "status-danger",
          }
        : null,
      fleetVehicles.some((entry) => entry.status === "SERVICE" || entry.status === "OFF_ROUTE")
        ? {
            id: `${plant.id}-fleet`,
            title: "Fleet efficiency watch",
            detail: "At least one vehicle is in service or off route.",
            badge: "status-manager_view",
          }
        : null,
      helpRequests.filter((entry) => entry.status === "OPEN").length
        ? {
            id: `${plant.id}-corrections`,
            title: `${helpRequests.filter((entry) => entry.status === "OPEN").length} open corrections`,
            detail: "Agents are waiting on exception handling.",
            badge: "status-approved",
          }
        : null,
    ].filter(Boolean) as Array<{ id: string; title: string; detail: string; badge: string }>;

    const aiSummary = `${verificationQueue.length} readings are waiting for review, ${approvals.filter((entry) => entry.status === "PENDING").length} commercial approvals are pending, ${cashFlowRows.filter((entry) => entry.reminderSuggested).length} contractor accounts need payment attention, and delivery efficiency is ${deliveryEfficiency}% for ${plant.name}.`;

    return {
      plant,
      leads,
      approvals,
      helpRequests,
      tasks,
      targets,
      verificationQueue,
      activity,
      fleetVehicles,
      accounts,
      invoices,
      materialCost,
      priceBenchmarks,
      volumeSold,
      deliveryEfficiency,
      activeFleet,
      leadConversionRate,
      activeSites,
      notifications,
      aiSummary,
      profitabilityRows,
      cashFlowRows,
      dsoDays,
    };
  });
}

export function ManagerWorkspace({ data }: { data: ManagerDashboardData }) {
  const plantViews = useMemo(() => buildPlantViews(data), [data]);
  const [selectedPlantId, setSelectedPlantId] = useState(plantViews[0]?.plant.id ?? "");
  const [hubOpen, setHubOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyType, setHistoryType] = useState("ALL");
  const [historyDate, setHistoryDate] = useState("");

  const selectedPlant = plantViews.find((entry) => entry.plant.id === selectedPlantId) ?? plantViews[0];
  const usersById = new Map<string, User>([data.user, ...data.agents].map((entry) => [entry.id, entry]));

  if (!selectedPlant) {
    return (
      <div className="note-box mt-24">
        No plant configuration is available yet. Add plant definitions to continue with the manager dashboard.
      </div>
    );
  }

  const historyTypes = Array.from(new Set(selectedPlant.activity.flatMap((entry) => [entry.entityType, entry.action])));
  const filteredHistory = selectedPlant.activity.filter((entry) => {
    const actorName = usersById.get(entry.actorId)?.name ?? entry.actorRole;
    const matchesQuery =
      !historyQuery ||
      `${entry.action} ${entry.entityType} ${entry.detail} ${actorName}`.toLowerCase().includes(historyQuery.toLowerCase());
    const matchesType = historyType === "ALL" || entry.entityType === historyType || entry.action === historyType;
    const matchesDate = !historyDate || toDateKey(entry.createdAt) === historyDate;

    return matchesQuery && matchesType && matchesDate;
  });

  return (
    <>
      <section className="manager-command-bar mt-24">
        <div>
          <p className="metric-label">Operations Header</p>
          <h2 className="manager-command-title">SPD Concrete manager command center across plants, approvals, and cash flow.</h2>
          <p className="panel-copy">
            Use the plant switcher, notification hub, and log archive to keep the main dashboard focused on live decisions.
          </p>
        </div>
        <div className="button-row">
          <button className="button-ghost" type="button" onClick={() => setHubOpen((open) => !open)}>
            Bell Hub {selectedPlant.notifications.length ? `(${selectedPlant.notifications.length})` : ""}
          </button>
          <button className="button-ghost" type="button" onClick={() => setHistoryOpen(true)}>
            History
          </button>
        </div>
      </section>

      <section className="manager-plant-strip">
        <div className="manager-plant-strip-copy">
          <span className="metric-label">Multi-Plant Performance Switcher</span>
          <h3>{selectedPlant.plant.name}</h3>
          <p className="panel-copy">{selectedPlant.plant.region}</p>
        </div>
        <div className="manager-plant-tabs">
          {plantViews.map((entry) => (
            <button
              key={entry.plant.id}
              type="button"
              className={entry.plant.id === selectedPlant.plant.id ? "manager-plant-tab is-active" : "manager-plant-tab"}
              onClick={() => setSelectedPlantId(entry.plant.id)}
            >
              <span>{entry.plant.name}</span>
              <small>{entry.plant.region}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="manager-kpi-grid">
        <ManagerInsightCard
          label="Concrete volume sold"
          value={`${selectedPlant.volumeSold.toLocaleString()} m3`}
          note={`${Math.round((selectedPlant.volumeSold / Math.max(selectedPlant.plant.monthlyVolumeTarget, 1)) * 100)}% of ${selectedPlant.plant.monthlyVolumeTarget.toLocaleString()} m3 target`}
        />
        <ManagerInsightCard
          label="Fleet status"
          value={`${selectedPlant.activeFleet}/${selectedPlant.fleetVehicles.length}`}
          note={`${selectedPlant.deliveryEfficiency}% average delivery efficiency`}
        />
        <ManagerInsightCard
          label="Lead conversion"
          value={`${selectedPlant.leadConversionRate}%`}
          note="Based on finalized vs tracked leads for this plant"
        />
        <ManagerInsightCard
          label="Current active sites"
          value={selectedPlant.activeSites}
          note={`Target ${selectedPlant.plant.currentActiveSitesTarget} active sites`}
        />
      </section>

      <section className="manager-layout-grid">
        <div className="section-stack">
          <VerificationCard verificationQueue={selectedPlant.verificationQueue} />
          <TargetCard agents={data.agents.filter((agent) => agent.homePlantId === selectedPlant.plant.id)} targets={selectedPlant.targets} />
          <TaskAssignmentCard agents={data.agents.filter((agent) => agent.homePlantId === selectedPlant.plant.id)} />
        </div>

        <div className="section-stack">
          <ApprovalDecisionCard approvals={selectedPlant.approvals} agents={data.agents} leads={selectedPlant.leads} />
          <HelpResolutionCard helpRequests={selectedPlant.helpRequests} />
          <ProfitabilityPanel selectedPlant={selectedPlant} plantViews={plantViews} />
          <CashFlowPanel selectedPlant={selectedPlant} />
        </div>

        <div className="section-stack">
          <LeadAuditOverviewPanel selectedPlant={selectedPlant} />
          <SalesAgentTrackingPanel selectedPlant={selectedPlant} data={data} />
        </div>
      </section>

      {hubOpen ? (
        <div className="manager-overlay-shell" onClick={() => setHubOpen(false)}>
          <div className="manager-overlay-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <h3>Smart Notification Hub</h3>
                <p className="panel-copy">Only live plant events appear here so the main workspace stays clean.</p>
              </div>
              <button className="button-ghost" type="button" onClick={() => setHubOpen(false)}>
                Close
              </button>
            </div>
            <div className="manager-summary-card">
              <span className="metric-label">AI summarized logs</span>
              <p>{selectedPlant.aiSummary}</p>
            </div>
            <div className="data-list mt-16">
              {selectedPlant.notifications.length ? (
                selectedPlant.notifications.map((item) => (
                  <div key={item.id} className="data-row">
                    <div className="panel-header">
                      <h4>{item.title}</h4>
                      <span className={`status-badge ${item.badge}`}>{item.badge.replace("status-", "").replaceAll("_", " ")}</span>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                ))
              ) : (
                <div className="success-box">No active notifications for this plant right now.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="manager-drawer-shell" onClick={() => setHistoryOpen(false)}>
          <aside className="manager-history-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <h3>Log Archive</h3>
                <p className="panel-copy">Search by event type, date, or agent to inspect the plant activity history.</p>
              </div>
              <button className="button-ghost" type="button" onClick={() => setHistoryOpen(false)}>
                Close
              </button>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="historyQuery">Search</label>
                <input id="historyQuery" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search action, entity, or detail" />
              </div>
              <div className="three-grid">
                <div className="field">
                  <label htmlFor="historyType">Event type</label>
                  <select id="historyType" value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
                    <option value="ALL">All</option>
                    {historyTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="historyDate">Date</label>
                  <input id="historyDate" type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} />
                </div>
              </div>
            </div>

            <div className="data-list mt-16">
              {filteredHistory.length ? (
                filteredHistory.map((entry) => (
                  <div key={entry.id} className="data-row">
                    <div className="panel-header">
                      <h4>{entry.action}</h4>
                      <span className="metric-label">{entry.entityType}</span>
                    </div>
                    <p>{entry.detail}</p>
                    <div className="row-meta">
                      <span>{usersById.get(entry.actorId)?.name ?? entry.actorRole}</span>
                      <span>{toIndiaTimeLabel(entry.createdAt)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="note-box">No activity matched your archive filters.</div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function ManagerInsightCard({ label, value, note }: { label: string; value: string | number; note: string }) {
  return (
    <article className="manager-kpi-card">
      <span className="metric-label">{label}</span>
      <strong className="manager-kpi-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}

function ProfitabilityPanel({
  selectedPlant,
  plantViews,
}: {
  selectedPlant: ManagerPlantView;
  plantViews: ManagerPlantView[];
}) {
  return (
    <Panel title="Live Profitability Section" description="Grade-based margin estimates built from structured material costs and price benchmarks.">
      <div className="profitability-list">
        {selectedPlant.profitabilityRows.length ? (
          selectedPlant.profitabilityRows.map((entry) => (
            <div key={entry.grade} className="profitability-row">
              <div className="panel-header">
                <h4>{entry.grade}</h4>
                <span className="metric-label">Margin Rs {entry.margin}</span>
              </div>
              <p>Selling Rs {entry.sellingPrice} | Estimated cost Rs {entry.estimatedCost}</p>
              <div className="heatbar-track">
                <span className="heatbar-fill" style={{ width: `${entry.ratio}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="note-box">No price benchmarks are configured for this plant yet.</div>
        )}
      </div>
      <div className="manager-summary-card mt-16">
        <span className="metric-label">Profitability heatmap</span>
        <div className="profitability-heatmap">
          {plantViews.map((entry) => {
            const averageMargin = entry.profitabilityRows.length
              ? Math.round(entry.profitabilityRows.reduce((sum, row) => sum + row.margin, 0) / entry.profitabilityRows.length)
              : 0;
            return (
              <div key={entry.plant.id} className="heatmap-row">
                <span>{entry.plant.name}</span>
                <div
                  className="heatmap-pill"
                  style={{
                    background:
                      averageMargin >= 900
                        ? "rgba(15, 118, 110, 0.18)"
                        : averageMargin >= 600
                          ? "rgba(180, 83, 9, 0.2)"
                          : "rgba(185, 28, 28, 0.18)",
                  }}
                >
                  Avg margin Rs {averageMargin}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}

function CashFlowPanel({ selectedPlant }: { selectedPlant: ManagerPlantView }) {
  const reminders = selectedPlant.cashFlowRows.filter((entry) => entry.reminderSuggested).length;

  return (
    <Panel title="Pending Payment & Cash Flow Tracker" description="Credit monitoring, DSO pressure, and reminder triggers based on structured receivables.">
      <div className="three-grid">
        <div className="summary-cell">
          <span className="summary-label">DSO alert</span>
          <strong>{selectedPlant.dsoDays} days</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Credit alarms</span>
          <strong>{selectedPlant.cashFlowRows.filter((entry) => entry.creditUsedPercent >= 85).length}</strong>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Auto reminders</span>
          <strong>{reminders}</strong>
        </div>
      </div>
      <div className="data-list mt-16">
        {selectedPlant.cashFlowRows.length ? (
          selectedPlant.cashFlowRows.map((entry) => (
            <div key={entry.id} className="data-row">
              <div className="panel-header">
                <h4>{entry.customerName}</h4>
                <span className={entry.creditUsedPercent >= 90 ? "status-badge status-danger" : entry.creditUsedPercent >= 80 ? "status-badge status-pending" : "status-badge status-approved"}>
                  {entry.creditUsedPercent}% credit used
                </span>
              </div>
              <p>Outstanding Rs {entry.outstandingAmount.toLocaleString()} | Due in {entry.dueInDays} days</p>
              <div className="row-meta">
                <span>{entry.alertLabel}</span>
                <span>{entry.reminderSuggested ? "Reminder ready" : "Monitoring"}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="note-box">No customer credit profiles are linked to this plant yet.</div>
        )}
      </div>
    </Panel>
  );
}

function LeadAuditOverviewPanel({ selectedPlant }: { selectedPlant: ManagerPlantView }) {
  return (
    <Panel title="Lead And Audit Overview" description="Live site pipeline, talks/negotiation status, and summarized audit context.">
      <div className="manager-summary-card">
        <span className="metric-label">AI summarized logs</span>
        <p>{selectedPlant.aiSummary}</p>
      </div>
      <div className="data-list mt-16">
        {selectedPlant.leads.length ? (
          selectedPlant.leads.slice(0, 5).map((lead) => (
            <div key={lead.id} className="data-row">
              <div className="panel-header">
                <h4>{lead.siteName}</h4>
                <StatusBadge value={lead.stage} />
              </div>
              <div className="row-meta">
                <span>Score {lead.score}</span>
                <span>Follow-up {toIndiaTimeLabel(lead.nextFollowUpAt)}</span>
                <span>Grade {lead.currentConcreteGrade}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="note-box">No active leads are linked to this plant yet.</div>
        )}
      </div>
    </Panel>
  );
}

function SalesAgentTrackingPanel({
  selectedPlant,
  data,
}: {
  selectedPlant: ManagerPlantView;
  data: ManagerDashboardData;
}) {
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const plantAgents = useMemo(
    () =>
      data.agents
        .filter((agent) => agent.status === "ACTIVE" && agent.homePlantId === selectedPlant.plant.id)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data.agents, selectedPlant.plant.id],
  );

  const trackingSummaries = useMemo(() => {
    const sessions = data.workdaySessions
      .filter((session) => session.plantId === selectedPlant.plant.id && session.date === selectedDate)
      .sort((left, right) => compareIsoAsc(right.loginAt, left.loginAt));
    const sessionsByUserId = new Map<string, WorkdaySession>();

    for (const session of sessions) {
      if (!sessionsByUserId.has(session.userId)) {
        sessionsByUserId.set(session.userId, session);
      }
    }

    const sessionIds = new Set(Array.from(sessionsByUserId.values()).map((entry) => entry.id));
    const visitsBySessionId = new Map<string, SiteVisit[]>();
    const readingsBySessionId = new Map<string, OdometerReading[]>();

    for (const visit of data.siteVisits) {
      if (sessionIds.has(visit.sessionId)) {
        const current = visitsBySessionId.get(visit.sessionId) ?? [];
        current.push(visit);
        visitsBySessionId.set(visit.sessionId, current);
      }
    }

    for (const reading of data.odometerReadings) {
      if (sessionIds.has(reading.sessionId)) {
        const current = readingsBySessionId.get(reading.sessionId) ?? [];
        current.push(reading);
        readingsBySessionId.set(reading.sessionId, current);
      }
    }

    const statusOrder: Record<AgentDayStatus, number> = {
      ON_DUTY: 0,
      DAY_CLOSED: 1,
      NO_ACTIVITY: 2,
    };

    return plantAgents
      .map((agent) =>
        buildAgentTrackingSummary(
          agent,
          sessionsByUserId.get(agent.id) ?? null,
          sessionsByUserId.get(agent.id) ? visitsBySessionId.get(sessionsByUserId.get(agent.id)!.id) ?? [] : [],
          sessionsByUserId.get(agent.id) ? readingsBySessionId.get(sessionsByUserId.get(agent.id)!.id) ?? [] : [],
        ),
      )
      .sort((left, right) => {
        const statusDiff = statusOrder[left.status] - statusOrder[right.status];
        if (statusDiff !== 0) {
          return statusDiff;
        }

        const rightTime = right.latestEventAt ? new Date(right.latestEventAt).getTime() : 0;
        const leftTime = left.latestEventAt ? new Date(left.latestEventAt).getTime() : 0;
        if (rightTime !== leftTime) {
          return rightTime - leftTime;
        }

        return left.agent.name.localeCompare(right.agent.name);
      });
  }, [data.odometerReadings, data.siteVisits, data.workdaySessions, plantAgents, selectedDate, selectedPlant.plant.id]);

  const resolvedSelectedAgentId = trackingSummaries.some((entry) => entry.agent.id === selectedAgentId)
    ? selectedAgentId
    : trackingSummaries[0]?.agent.id ?? "";
  const selectedAgent = trackingSummaries.find((entry) => entry.agent.id === resolvedSelectedAgentId) ?? null;

  return (
    <Panel
      title="Sales Agent Activity Tracking"
      description="Select a date and inspect each agent's workday timings, site visits, and latest captured location for that day."
      action={
        <div className="agent-tracker-filter">
          <label htmlFor="agentTrackingDate">Date</label>
          <input
            id="agentTrackingDate"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </div>
      }
    >
      {plantAgents.length ? (
        <div className="agent-tracker-shell">
          <div className="agent-tracker-list">
            {trackingSummaries.map((entry) => (
              <button
                key={entry.agent.id}
                type="button"
                className={entry.agent.id === resolvedSelectedAgentId ? "agent-tracker-button is-active" : "agent-tracker-button"}
                onClick={() => setSelectedAgentId(entry.agent.id)}
              >
                <div className="panel-header">
                  <div>
                    <h4>{entry.agent.name}</h4>
                    <p className="agent-tracker-meta">{entry.agent.employeeId}</p>
                  </div>
                  <span className={`status-badge ${getAgentDayStatusClass(entry.status)}`}>{getAgentDayStatusLabel(entry.status)}</span>
                </div>
                <div className="row-meta">
                  <span>{entry.latestEventAt ? `Last update ${toIndiaTimeLabel(entry.latestEventAt)}` : "No activity on this date"}</span>
                  <span>{entry.siteCount} site visits</span>
                </div>
              </button>
            ))}
          </div>

          {selectedAgent ? (
            <div className="agent-tracker-detail">
              <div className="manager-summary-card agent-tracker-location">
                <span className="metric-label">Latest captured location</span>
                <strong>
                  {selectedAgent.latestLocation ? formatLatLng(selectedAgent.latestLocation.latLng) : "No location capture for this date"}
                </strong>
                <div className="row-meta">
                  <span>{selectedAgent.latestLocation?.source ?? "Waiting for login, reading, visit, or logout capture"}</span>
                  <span>
                    {selectedAgent.latestLocation
                      ? toIndiaTimeLabel(selectedAgent.latestLocation.capturedAt)
                      : "No location timestamp"}
                  </span>
                </div>
                <p>
                  Location is based on event captures only. This web app does not run continuous background GPS tracking.
                </p>
              </div>

              <div className="summary-card">
                <div className="panel-header">
                  <div>
                    <h3>{selectedAgent.agent.name}</h3>
                    <p className="panel-copy">Day summary for {selectedDate}</p>
                  </div>
                  <span className={`status-badge ${getAgentDayStatusClass(selectedAgent.status)}`}>
                    {getAgentDayStatusLabel(selectedAgent.status)}
                  </span>
                </div>

                <div className="summary-card-grid">
                  <div className="summary-cell">
                    <span className="summary-label">Login time</span>
                    <strong>{toIndiaTimeLabel(selectedAgent.session?.loginAt ?? null)}</strong>
                  </div>
                  <div className="summary-cell">
                    <span className="summary-label">Site visit start</span>
                    <strong>{toIndiaTimeLabel(selectedAgent.firstVisitAt)}</strong>
                  </div>
                  <div className="summary-cell">
                    <span className="summary-label">Sites visited</span>
                    <strong>{selectedAgent.siteCount}</strong>
                  </div>
                  <div className="summary-cell">
                    <span className="summary-label">Site visit end</span>
                    <strong>{toIndiaTimeLabel(selectedAgent.lastVisitAt)}</strong>
                  </div>
                  <div className="summary-cell">
                    <span className="summary-label">Start reading</span>
                    <strong>{selectedAgent.startReading ?? "Not recorded"}</strong>
                  </div>
                  <div className="summary-cell">
                    <span className="summary-label">End reading</span>
                    <strong>{selectedAgent.endReading ?? "Not recorded"}</strong>
                  </div>
                  <div className="summary-cell">
                    <span className="summary-label">Office out time</span>
                    <strong>{toIndiaTimeLabel(selectedAgent.session?.logoutAt ?? null)}</strong>
                  </div>
                  <div className="summary-cell">
                    <span className="summary-label">Latest update</span>
                    <strong>{toIndiaTimeLabel(selectedAgent.latestEventAt)}</strong>
                  </div>
                </div>
              </div>

              <div className="data-list">
                {selectedAgent.checkpoints.length ? (
                  selectedAgent.checkpoints.map((checkpoint) => (
                    <div key={checkpoint.id} className="data-row">
                      <div className="panel-header">
                        <h4>{checkpoint.label}</h4>
                        <span className="metric-label">{toIndiaTimeLabel(checkpoint.capturedAt)}</span>
                      </div>
                      <p>{checkpoint.detail}</p>
                    </div>
                  ))
                ) : (
                  <div className="note-box">No session, visit, or reading data was captured for this agent on the selected date.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="note-box">Select an agent to inspect the captured workday activity.</div>
          )}
        </div>
      ) : (
        <div className="note-box">No active sales agents are assigned to this plant yet.</div>
      )}
    </Panel>
  );
}
