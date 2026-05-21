"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { toIndiaTimeLabel } from "@/lib/date";
import { groupAgentReadings } from "@/lib/agent-dashboard";
import type { OdometerReading } from "@/lib/types";

function formatReadingValue(value: number | null, fallback: string) {
  return value ?? fallback;
}

async function parseApiError(response: Response) {
  const payload = await response.json().catch(() => ({ error: "Request failed." }));
  return payload.error ?? "Request failed.";
}

interface ReadingRowProps {
  reading: OdometerReading;
  busy: boolean;
  onConfirm?: (readingId: string) => void;
  onReject?: (readingId: string) => void;
  onDiscard?: (readingId: string) => void;
}

function ReadingRow({ reading, busy, onConfirm, onReject, onDiscard }: ReadingRowProps) {
  const isAwaitingConfirmation = reading.status === "AWAITING_CONFIRMATION";
  const isOcrPending = reading.status === "OCR_PENDING";
  const canDiscard = reading.status === "AWAITING_CONFIRMATION" || reading.status === "MANUAL_REVIEW_REQUIRED" || reading.status === "OCR_PENDING";

  return (
    <article className="reading-card">
      <div className="panel-header">
        <div>
          <h4>{reading.type} reading</h4>
          <p className="panel-copy">Captured {toIndiaTimeLabel(reading.capturedAt)}</p>
        </div>
        <StatusBadge value={reading.status} />
      </div>

      <div className="reading-stat-grid">
        <div className="reading-stat">
          <span className="reading-stat-label">Agent value</span>
          <strong>{formatReadingValue(reading.agentEnteredReading ?? null, "N/A")}</strong>
        </div>
        <div className="reading-stat">
          <span className="reading-stat-label">Extracted value</span>
          <strong>{formatReadingValue(reading.ocrValue, "N/A")}</strong>
        </div>
        <div className="reading-stat">
          <span className="reading-stat-label">Final value</span>
          <strong>{formatReadingValue(reading.finalValue, "Pending")}</strong>
        </div>
      </div>

      {reading.verificationNote ? <p>{reading.verificationNote}</p> : null}
      {reading.reviewReason ? <p className="hint">Review: {reading.reviewReason}</p> : null}
      {reading.continuityStatus && reading.continuityStatus !== "OK" ? <p className="hint">{reading.continuityNote}</p> : null}
      {reading.duplicateOfReadingId ? <p className="hint">Possible duplicate of {reading.duplicateOfReadingId.slice(0, 8)}.</p> : null}
      {isOcrPending ? <p className="hint">OCR is still processing this image.</p> : null}

      <div className="button-row">
        {isAwaitingConfirmation && onConfirm ? (
          <button className="button" type="button" disabled={busy} onClick={() => onConfirm(reading.id)}>
            {busy ? "Saving..." : "Confirm reading"}
          </button>
        ) : null}
        {isAwaitingConfirmation && onReject ? (
          <button className="button-danger" type="button" disabled={busy} onClick={() => onReject(reading.id)}>
            {busy ? "Saving..." : "Send for review"}
          </button>
        ) : null}
        {canDiscard && onDiscard ? (
          <button className="button-ghost" type="button" disabled={busy} onClick={() => onDiscard(reading.id)}>
            {busy ? "Saving..." : "Discard proof"}
          </button>
        ) : null}
        <a className="button-ghost" href={`/api/media?url=${encodeURIComponent(reading.photoUrl)}`} target="_blank" rel="noreferrer">
          View photo
        </a>
      </div>
    </article>
  );
}

export function ReadingLogList({ readings }: { readings: OdometerReading[] }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [readingState, setReadingState] = useState(readings);
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const { needsAction, history } = groupAgentReadings(readingState);

  async function confirmReading(readingId: string) {
    setBusyId(readingId);
    setFeedback("");
    setError("");

    const response = await fetch(`/api/odometer-readings/${readingId}/confirm`, { method: "POST" });
    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    const payload = (await response.json()) as { reading?: OdometerReading };
    setReadingState((currentReadings) =>
      currentReadings.map((reading) =>
        reading.id === readingId ? (payload.reading ?? { ...reading, status: "CONFIRMED" }) : reading,
      ),
    );
    setBusyId("");
    setFeedback("Reading confirmed and moved to Reading History.");
    startTransition(() => router.refresh());
  }

  async function rejectReading(readingId: string) {
    setBusyId(readingId);
    setFeedback("");
    setError("");

    const response = await fetch(`/api/odometer-readings/${readingId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Agent marked OCR as incorrect from the reading log." }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    const payload = (await response.json()) as { reading?: OdometerReading };
    setReadingState((currentReadings) =>
      currentReadings.map((reading) =>
        reading.id === readingId
          ? (payload.reading ?? {
              ...reading,
              status: "MANUAL_REVIEW_REQUIRED",
              verificationNote: "Agent marked OCR as incorrect from the reading log.",
            })
          : reading,
      ),
    );
    setBusyId("");
    setFeedback("Reading sent to manager review and moved to Reading History.");
    startTransition(() => router.refresh());
  }

  async function discardReading(readingId: string) {
    setBusyId(readingId);
    setFeedback("");
    setError("");

    const response = await fetch(`/api/odometer-readings/${readingId}/discard`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "RETAKE",
        note: "Agent discarded this proof from the reading log and will upload the correct START/END image.",
      }),
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusyId("");
      return;
    }

    const payload = (await response.json()) as { reading?: OdometerReading };
    setReadingState((currentReadings) =>
      currentReadings.map((reading) =>
        reading.id === readingId
          ? (payload.reading ?? {
              ...reading,
              status: "DISCARDED",
              isActiveReading: false,
              finalValue: null,
            })
          : reading,
      ),
    );
    setBusyId("");
    setFeedback("Reading discarded. Upload the correct START/END proof for that captured date.");
    startTransition(() => router.refresh());
  }

  return (
    <div className="section-stack">
      <section className="daily-log-section">
        <div className="section-head">
          <div>
            <h3 className="section-title">Needs Action</h3>
            <p className="section-copy">Only reading items that still need agent attention stay visible here.</p>
          </div>
          <span className="status-badge status-awaiting_confirmation">{needsAction.length} active</span>
        </div>

        {needsAction.length ? (
          <div className="warning-box">
            {needsAction.length} reading item{needsAction.length === 1 ? "" : "s"} still need your attention.
          </div>
        ) : (
          <div className="note-box">No reading actions pending. Confirmed items now stay tucked inside history.</div>
        )}

        {feedback ? <div className="success-box">{feedback}</div> : null}
        {error ? <div className="error-box">{error}</div> : null}

        <div className="data-list">
          {needsAction.map((reading) => (
            <ReadingRow
              key={reading.id}
              reading={reading}
              busy={busyId === reading.id || isRefreshing}
              onConfirm={reading.status === "AWAITING_CONFIRMATION" ? confirmReading : undefined}
              onReject={reading.status === "AWAITING_CONFIRMATION" ? rejectReading : undefined}
              onDiscard={discardReading}
            />
          ))}
        </div>
      </section>

      {history.length ? (
        <details className="history-toggle">
          <summary>
            <span>Reading History ({history.length})</span>
            <span className="history-toggle-copy">Show resolved items</span>
          </summary>
          <div className="history-panel">
            <div className="data-list">
              {history.map((reading) => (
                <ReadingRow key={reading.id} reading={reading} busy={false} />
              ))}
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
