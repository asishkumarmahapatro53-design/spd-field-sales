"use client";

import { useMemo, useState } from "react";
import { MetricCard } from "@/components/MetricCard";
import { Panel } from "@/components/Panel";
import { compareIsoAsc, toDateKey, toIndiaTimeLabel } from "@/lib/date";
import type { LatLng, ManagerDashboardData, OdometerReading, SiteVisit, User, WorkdaySession } from "@/lib/types";

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
  checkpoints: AgentTrackingCheckpoint[];
  latestLocation: AgentTrackingLocation | null;
  latestEventAt: string | null;
  firstVisitAt: string | null;
  lastVisitAt: string | null;
  siteCount: number;
  startReading: number | null;
  endReading: number | null;
  totalDistance: number | null;
  status: AgentDayStatus;
};

function formatLatLng(latLng: LatLng | null) {
  if (!latLng) {
    return "Location not captured";
  }

  return `Lat ${latLng.lat.toFixed(5)}, Lng ${latLng.lng.toFixed(5)}`;
}

function getReadingValue(reading: OdometerReading) {
  return reading.finalValue ?? reading.ocrValue;
}

function getAgentStatusLabel(status: AgentDayStatus) {
  if (status === "ON_DUTY") {
    return "On duty";
  }

  if (status === "DAY_CLOSED") {
    return "Day closed";
  }

  return "No activity";
}

function getAgentStatusClass(status: AgentDayStatus) {
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
  const checkpoints: AgentTrackingCheckpoint[] = [];
  const locationEvents: AgentTrackingLocation[] = [];
  const startReading = sortedReadings.find((entry) => entry.type === "START" && getReadingValue(entry) !== null);
  const endReading = [...sortedReadings].reverse().find((entry) => entry.type === "END" && getReadingValue(entry) !== null);
  const startReadingValue = startReading ? getReadingValue(startReading) : null;
  const endReadingValue = endReading ? getReadingValue(endReading) : null;

  if (session) {
    checkpoints.push({
      id: `${session.id}-login`,
      label: "Office in",
      detail: session.loginLatLng ? formatLatLng(session.loginLatLng) : "Login recorded without location capture.",
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
          ? `Reading ${readingValue} captured with status ${reading.status.replaceAll("_", " ").toLowerCase()}.`
          : `Reading status is ${reading.status.replaceAll("_", " ").toLowerCase()}.`,
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
      detail: session.logoutLatLng ? formatLatLng(session.logoutLatLng) : "Logout recorded without location capture.",
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

  return {
    agent,
    session,
    checkpoints,
    latestLocation: locationEvents.length ? locationEvents[locationEvents.length - 1] : null,
    latestEventAt: checkpoints.length ? checkpoints[checkpoints.length - 1].capturedAt : null,
    firstVisitAt: sortedVisits[0]?.visitedAt ?? null,
    lastVisitAt: sortedVisits[sortedVisits.length - 1]?.visitedAt ?? null,
    siteCount: sortedVisits.length,
    startReading: startReadingValue,
    endReading: endReadingValue,
    totalDistance:
      startReadingValue !== null && endReadingValue !== null ? Math.max(endReadingValue - startReadingValue, 0) : null,
    status: session ? (session.status === "OPEN" ? "ON_DUTY" : "DAY_CLOSED") : "NO_ACTIVITY",
  };
}

export function ManagerTrackingWorkspace({ data }: { data: ManagerDashboardData }) {
  const [selectedPlantId, setSelectedPlantId] = useState(data.plants[0]?.id ?? "");
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const selectedPlant = data.plants.find((entry) => entry.id === selectedPlantId) ?? data.plants[0] ?? null;
  const plantAgents = useMemo(
    () =>
      data.agents
        .filter((agent) => agent.status === "ACTIVE" && agent.homePlantId === selectedPlant?.id)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [data.agents, selectedPlant?.id],
  );

  const trackingSummaries = useMemo(() => {
    if (!selectedPlant) {
      return [];
    }

    const sessions = data.workdaySessions
      .filter((session) => session.plantId === selectedPlant.id && session.date === selectedDate)
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
    const statusOrder: Record<AgentDayStatus, number> = {
      ON_DUTY: 0,
      DAY_CLOSED: 1,
      NO_ACTIVITY: 2,
    };

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

    return plantAgents
      .map((agent) => {
        const session = sessionsByUserId.get(agent.id) ?? null;

        return buildAgentTrackingSummary(
          agent,
          session,
          session ? visitsBySessionId.get(session.id) ?? [] : [],
          session ? readingsBySessionId.get(session.id) ?? [] : [],
        );
      })
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
  }, [data.odometerReadings, data.siteVisits, data.workdaySessions, plantAgents, selectedDate, selectedPlant]);

  const resolvedSelectedAgentId = trackingSummaries.some((entry) => entry.agent.id === selectedAgentId)
    ? selectedAgentId
    : trackingSummaries[0]?.agent.id ?? "";
  const selectedAgent = trackingSummaries.find((entry) => entry.agent.id === resolvedSelectedAgentId) ?? null;
  const agentsOnDuty = trackingSummaries.filter((entry) => entry.status === "ON_DUTY").length;
  const activeToday = trackingSummaries.filter((entry) => entry.latestEventAt).length;
  const totalVisits = trackingSummaries.reduce((sum, entry) => sum + entry.siteCount, 0);

  if (!selectedPlant) {
    return <div className="note-box mt-24">No plants are configured yet for tracking.</div>;
  }

  return (
    <>
      <section className="manager-plant-strip mt-24">
        <div className="manager-plant-strip-copy">
          <span className="metric-label">Tracking workspace</span>
          <h3>{selectedPlant.name}</h3>
          <p className="panel-copy">Pick a plant and date to review one agent at a time in a clean, focused view.</p>
        </div>
        <div className="manager-toolbar-actions">
          <div className="manager-date-control">
            <label htmlFor="tracking-date">Date</label>
            <input
              id="tracking-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="manager-plant-tabs mt-24">
        {data.plants.map((plant) => (
          <button
            key={plant.id}
            type="button"
            className={plant.id === selectedPlant.id ? "manager-plant-tab is-active" : "manager-plant-tab"}
            onClick={() => setSelectedPlantId(plant.id)}
          >
            <span>{plant.name}</span>
            <small>{plant.region}</small>
          </button>
        ))}
      </section>

      <section className="metric-grid mt-24">
        <MetricCard label="Active agents" value={plantAgents.length} note="Assigned to the selected plant" />
        <MetricCard label="Working now" value={agentsOnDuty} note="Open workday sessions on selected date" />
        <MetricCard label="Active today" value={activeToday} note="Agents with at least one captured event" />
        <MetricCard label="Site visits" value={totalVisits} note="Total visits logged on selected date" />
      </section>

      <section className="manager-tracking-shell mt-24">
        <Panel
          title="Sales Agent Roster"
          description="Click one agent to open the full day summary without crowding the dashboard."
        >
          <div className="agent-roster-list">
            {trackingSummaries.length ? (
              trackingSummaries.map((entry) => (
                <button
                  key={entry.agent.id}
                  type="button"
                  className={entry.agent.id === resolvedSelectedAgentId ? "agent-roster-card is-active" : "agent-roster-card"}
                  onClick={() => setSelectedAgentId(entry.agent.id)}
                >
                  <div className="panel-header">
                    <div>
                      <h4>{entry.agent.name}</h4>
                      <p className="panel-copy">{entry.agent.employeeId}</p>
                    </div>
                    <span className={`status-badge ${getAgentStatusClass(entry.status)}`}>{getAgentStatusLabel(entry.status)}</span>
                  </div>
                  <div className="row-meta">
                    <span>{entry.latestEventAt ? `Last update ${toIndiaTimeLabel(entry.latestEventAt)}` : "No event recorded"}</span>
                    <span>{entry.siteCount} visits</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="note-box">No tracking records were found for this plant on the selected date.</div>
            )}
          </div>
        </Panel>

        {selectedAgent ? (
          <div className="section-stack">
            <div className="manager-summary-card">
              <span className="metric-label">Latest captured location</span>
              <strong className="manager-tracking-location">
                {selectedAgent.latestLocation ? formatLatLng(selectedAgent.latestLocation.latLng) : "No captured location for this date"}
              </strong>
              <div className="row-meta">
                <span>{selectedAgent.latestLocation?.source ?? "Waiting for login, visit, reading, or logout capture"}</span>
                <span>{selectedAgent.latestLocation ? toIndiaTimeLabel(selectedAgent.latestLocation.capturedAt) : "No timestamp available"}</span>
              </div>
              <p>Location is based on event captures in the web workflow, not continuous background GPS.</p>
            </div>

            <Panel
              title={`${selectedAgent.agent.name} day summary`}
              description={`Focused daily summary for ${selectedDate}.`}
            >
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
                  <span className="summary-label">Distance</span>
                  <strong>{selectedAgent.totalDistance ?? "Pending"}{selectedAgent.totalDistance !== null ? " km" : ""}</strong>
                </div>
                <div className="summary-cell">
                  <span className="summary-label">Office out time</span>
                  <strong>{toIndiaTimeLabel(selectedAgent.session?.logoutAt ?? null)}</strong>
                </div>
              </div>
            </Panel>

            <Panel
              title="Captured timeline"
              description="Ordered workday events for the selected sales agent and date."
            >
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
                  <div className="note-box">No session, visit, or reading events were captured for this agent on this date.</div>
                )}
              </div>
            </Panel>
          </div>
        ) : (
          <div className="note-box">Select one agent from the roster to open the focused day summary.</div>
        )}
      </section>
    </>
  );
}
