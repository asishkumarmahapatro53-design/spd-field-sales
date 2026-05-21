"use client";

import { useMemo, useState } from "react";
import { toIndiaTimeLabel } from "@/lib/date";
import type { LeadStage, SiteMapMarker } from "@/lib/types";

const PIN_CLASS: Record<SiteMapMarker["pinColor"], string> = {
  GREEN: "site-map-pin-green",
  YELLOW: "site-map-pin-yellow",
  ORANGE: "site-map-pin-orange",
  RED: "site-map-pin-red",
  GRAY: "site-map-pin-gray",
  BLUE: "site-map-pin-blue",
};

const LEAD_STAGE_META: Record<LeadStage, { label: string; pinColor: SiteMapMarker["pinColor"] }> = {
  TALKS: { label: "Talks", pinColor: "BLUE" },
  NEGOTIATING: { label: "Negotiating", pinColor: "YELLOW" },
  FINALIZED: { label: "Finalized", pinColor: "GREEN" },
  MISSED: { label: "Missed", pinColor: "ORANGE" },
  DEAD: { label: "Dead", pinColor: "GRAY" },
  LOST: { label: "Lost", pinColor: "RED" },
};

function getGoogleDirectionsUrl(marker: SiteMapMarker) {
  if (marker.latLng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${marker.latLng.lat},${marker.latLng.lng}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(marker.siteAddress)}`;
}

function normalizePosition(value: number, min: number, max: number) {
  if (max === min) {
    return 50;
  }

  return Math.max(8, Math.min(92, ((value - min) / (max - min)) * 84 + 8));
}

export function AgentSiteMap({ markers }: { markers: SiteMapMarker[] }) {
  const [showClosed, setShowClosed] = useState(false);
  const [selectedId, setSelectedId] = useState(markers[0]?.siteId ?? "");
  const [busyVerification, setBusyVerification] = useState<"CALL" | "WHATSAPP" | null>(null);
  const [verificationNote, setVerificationNote] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const visibleMarkers = useMemo(
    () => (showClosed ? markers : markers.filter((marker) => marker.siteStatus !== "DEAD" && marker.siteStatus !== "LOST")),
    [markers, showClosed],
  );
  const selectedMarker = visibleMarkers.find((marker) => marker.siteId === selectedId) ?? visibleMarkers[0] ?? null;
  const locatedMarkers = visibleMarkers.filter((marker) => marker.latLng);
  const bounds = useMemo(() => {
    const lats = locatedMarkers.map((marker) => marker.latLng?.lat ?? 0);
    const lngs = locatedMarkers.map((marker) => marker.latLng?.lng ?? 0);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [locatedMarkers]);

  async function openDirections(marker: SiteMapMarker) {
    await fetch(`/api/sites/${marker.siteId}/directions`, { method: "POST" }).catch(() => undefined);
    window.open(getGoogleDirectionsUrl(marker), "_blank", "noopener,noreferrer");
  }

  async function requestVerification(marker: SiteMapMarker, channel: "CALL" | "WHATSAPP") {
    if (!marker.stakeholderMasterId) {
      setVerificationError("Save the stakeholder through a site visit before verification.");
      return;
    }

    setBusyVerification(channel);
    setVerificationNote("");
    setVerificationError("");

    const endpoint = channel === "CALL" ? "call-verification" : "whatsapp-verification";
    const response = await fetch(`/api/stakeholders/${marker.stakeholderMasterId}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const payload = (await response.json().catch(() => ({}))) as { error?: string; event?: { status?: string; error?: string } };
    setBusyVerification(null);

    if (!response.ok || payload.error) {
      setVerificationError(payload.error ?? "Verification request failed.");
      return;
    }

    if (payload.event?.error) {
      setVerificationError(payload.event.error);
      return;
    }

    setVerificationNote(`${channel === "CALL" ? "Call" : "WhatsApp"} verification ${payload.event?.status?.toLowerCase() ?? "sent"}.`);
  }

  if (!markers.length) {
    return <div className="note-box">No mapped sites yet. Site visits with saved location will appear here.</div>;
  }

  return (
    <div className="site-map-shell">
      <div className="site-map-toolbar">
        <div className="row-meta">
          <span>{visibleMarkers.length} visible</span>
          <span>{markers.filter((marker) => marker.missingLocation).length} missing location</span>
        </div>
        <div className="site-map-legend" aria-label="Lead stage legend">
          {(Object.keys(LEAD_STAGE_META) as LeadStage[]).map((stage) => (
            <span key={stage}>
              <span className={`site-map-dot ${PIN_CLASS[LEAD_STAGE_META[stage].pinColor]}`} />
              {LEAD_STAGE_META[stage].label}
            </span>
          ))}
        </div>
        <label className="row-meta">
          <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
          Show dead/lost
        </label>
      </div>

      <div className="site-map-canvas" aria-label="Site map view">
        {locatedMarkers.map((marker) => {
          const left = normalizePosition(marker.latLng?.lng ?? 0, bounds.minLng, bounds.maxLng);
          const top = 100 - normalizePosition(marker.latLng?.lat ?? 0, bounds.minLat, bounds.maxLat);
          return (
            <button
              key={marker.siteId}
              className={`site-map-pin ${PIN_CLASS[marker.pinColor]}`}
              type="button"
              style={{ left: `${left}%`, top: `${top}%` }}
              title={marker.siteName}
              aria-label={marker.siteName}
              onClick={() => setSelectedId(marker.siteId)}
            />
          );
        })}
        {!locatedMarkers.length ? <div className="site-map-empty">Missing location list</div> : null}
      </div>

      <aside className="site-map-detail">
        {selectedMarker ? (
          <>
            <div className="panel-header">
              <div>
                <h3>{selectedMarker.siteName}</h3>
                <p className="panel-copy">{selectedMarker.siteAddress}</p>
              </div>
              <span className={`site-map-dot ${PIN_CLASS[selectedMarker.pinColor]}`} />
            </div>
            <div className="row-meta">
              <span>{LEAD_STAGE_META[selectedMarker.leadStage].label}</span>
              <span>{selectedMarker.siteStatus}</span>
              <span>{selectedMarker.grade || "Grade pending"}</span>
              <span>{selectedMarker.quantityCum} CUM</span>
            </div>
            <p className="hint">
              {selectedMarker.stakeholderName
                ? `${selectedMarker.stakeholderName} ${selectedMarker.stakeholderPhone ?? ""}`
                : "Stakeholder pending"}
            </p>
            {selectedMarker.phoneVerificationStatus ? (
              <p className="hint">Contact status: {selectedMarker.phoneVerificationStatus.toLowerCase().replaceAll("_", " ")}</p>
            ) : null}
            <p className="hint">Last visit {toIndiaTimeLabel(selectedMarker.lastVisitedAt)}</p>
            <div className="button-row">
              <button className="button" type="button" onClick={() => void openDirections(selectedMarker)}>
                Get direction
              </button>
              {selectedMarker.stakeholderPhone ? (
                <a className="button-ghost" href={`tel:${selectedMarker.stakeholderPhone}`}>
                  Call stakeholder
                </a>
              ) : null}
              {selectedMarker.stakeholderPhone ? (
                <>
                  <button
                    className="button-ghost"
                    type="button"
                    disabled={busyVerification !== null}
                    onClick={() => void requestVerification(selectedMarker, "CALL")}
                  >
                    {busyVerification === "CALL" ? "Calling..." : "Verify call"}
                  </button>
                  <button
                    className="button-ghost"
                    type="button"
                    disabled={busyVerification !== null}
                    onClick={() => void requestVerification(selectedMarker, "WHATSAPP")}
                  >
                    {busyVerification === "WHATSAPP" ? "Sending..." : "Verify WhatsApp"}
                  </button>
                </>
              ) : null}
            </div>
            {verificationNote ? <div className="success-box mt-12">{verificationNote}</div> : null}
            {verificationError ? <div className="error-box mt-12">{verificationError}</div> : null}
          </>
        ) : null}
      </aside>

      <div className="site-map-list">
        {visibleMarkers.map((marker) => (
          <button
            key={marker.siteId}
            className={marker.siteId === selectedMarker?.siteId ? "site-map-list-item is-active" : "site-map-list-item"}
            type="button"
            onClick={() => setSelectedId(marker.siteId)}
          >
            <span className={`site-map-dot ${PIN_CLASS[marker.pinColor]}`} />
            <span>{marker.siteName}</span>
            <small>
              {LEAD_STAGE_META[marker.leadStage].label}
              {marker.missingLocation ? " / location missing" : ""}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
}
