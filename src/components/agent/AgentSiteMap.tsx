"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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

const MAPPLS_MAP_KEY =
  process.env.NEXT_PUBLIC_MAPPLS_MAP_SDK_KEY?.trim() || process.env.NEXT_PUBLIC_MAPPLS_STATIC_KEY?.trim() || "";

const PIN_COLOR_HEX: Record<SiteMapMarker["pinColor"], string> = {
  GREEN: "#15803d",
  YELLOW: "#ca8a04",
  ORANGE: "#ea580c",
  RED: "#dc2626",
  GRAY: "#6b7280",
  BLUE: "#2563eb",
};

type MapplsMap = {
  addListener?: (eventName: string, handler: () => void) => void;
  setCenter?: (center: { lat: number; lng: number }) => void;
  setZoom?: (zoom: number) => void;
  remove?: () => void;
};

type MapplsMarker = {
  remove?: () => void;
  setMap?: (map: MapplsMap | null) => void;
};

declare global {
  interface Window {
    mappls?: {
      Map: new (id: string, options: Record<string, unknown>) => MapplsMap;
      Marker: new (options: Record<string, unknown>) => MapplsMarker;
    };
  }
}

let mapplsScriptPromise: Promise<void> | null = null;

function loadMapplsScript(key: string) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.mappls?.Map && window.mappls.Marker) {
    return Promise.resolve();
  }

  if (mapplsScriptPromise) {
    return mapplsScriptPromise;
  }

  mapplsScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>("script[data-mappls-sdk='true']");
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Mappls SDK failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.dataset.mapplsSdk = "true";
    script.src = `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${encodeURIComponent(key)}`;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Mappls SDK failed to load.")), { once: true });
    document.head.appendChild(script);
  });

  return mapplsScriptPromise;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getMarkerHtml(marker: SiteMapMarker, selected: boolean) {
  const label = escapeHtml(marker.siteName);
  return `<button class="site-map-sdk-pin${selected ? " is-selected" : ""}" data-site-map-marker="${escapeHtml(marker.siteId)}" style="--pin-color:${PIN_COLOR_HEX[marker.pinColor]}" type="button" aria-label="${label}" title="${label}"></button>`;
}

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
  const mapId = `agent-lead-map-${useId().replaceAll(":", "")}`;
  const mapRef = useRef<MapplsMap | null>(null);
  const markerRefs = useRef<MapplsMarker[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [selectedId, setSelectedId] = useState(markers[0]?.siteId ?? "");
  const [mapStatus, setMapStatus] = useState<"missing-key" | "loading" | "ready" | "error">(
    MAPPLS_MAP_KEY ? "loading" : "missing-key",
  );
  const [busyVerification, setBusyVerification] = useState<"CALL" | "WHATSAPP" | null>(null);
  const [verificationNote, setVerificationNote] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const visibleMarkers = useMemo(
    () => (showClosed ? markers : markers.filter((marker) => marker.siteStatus !== "DEAD" && marker.siteStatus !== "LOST")),
    [markers, showClosed],
  );
  const selectedMarker = visibleMarkers.find((marker) => marker.siteId === selectedId) ?? visibleMarkers[0] ?? null;
  const locatedMarkers = useMemo(() => visibleMarkers.filter((marker) => marker.latLng), [visibleMarkers]);
  const fallbackBounds = useMemo(() => {
    const lats = locatedMarkers.map((marker) => marker.latLng?.lat ?? 0);
    const lngs = locatedMarkers.map((marker) => marker.latLng?.lng ?? 0);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [locatedMarkers]);
  const mapCenter = useMemo(() => {
    if (!locatedMarkers.length) {
      return null;
    }

    const totals = locatedMarkers.reduce(
      (current, marker) => ({
        lat: current.lat + (marker.latLng?.lat ?? 0),
        lng: current.lng + (marker.latLng?.lng ?? 0),
      }),
      { lat: 0, lng: 0 },
    );

    return {
      lat: totals.lat / locatedMarkers.length,
      lng: totals.lng / locatedMarkers.length,
    };
  }, [locatedMarkers]);

  useEffect(() => {
    const container = document.getElementById(mapId);
    if (!container) return undefined;

    const handleMarkerClick = (event: MouseEvent) => {
      const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-site-map-marker]") : null;
      const markerId = target?.dataset.siteMapMarker;
      if (markerId) {
        setSelectedId(markerId);
      }
    };

    container.addEventListener("click", handleMarkerClick);
    return () => container.removeEventListener("click", handleMarkerClick);
  }, [mapId]);

  useEffect(() => {
    if (!locatedMarkers.length) {
      markerRefs.current.forEach((marker) => {
        if (marker.remove) marker.remove();
        else marker.setMap?.(null);
      });
      markerRefs.current = [];
      return undefined;
    }

    if (!MAPPLS_MAP_KEY) {
      setMapStatus("missing-key");
      return undefined;
    }

    let cancelled = false;
    setMapStatus(mapRef.current ? "ready" : "loading");

    const renderMarkers = () => {
      const map = mapRef.current;
      if (!map || !window.mappls?.Marker) return;

      markerRefs.current.forEach((marker) => {
        if (marker.remove) marker.remove();
        else marker.setMap?.(null);
      });
      markerRefs.current = locatedMarkers
        .filter((marker) => marker.latLng)
        .map((marker) => {
          return new window.mappls!.Marker({
            map,
            position: { lat: marker.latLng!.lat, lng: marker.latLng!.lng },
            html: getMarkerHtml(marker, marker.siteId === selectedMarker?.siteId),
            popupHtml: `<strong>${escapeHtml(marker.siteName)}</strong><br>${escapeHtml(marker.siteAddress)}`,
          });
        });
    };

    void loadMapplsScript(MAPPLS_MAP_KEY)
      .then(() => {
        if (cancelled) return;

        if (!window.mappls?.Map || !window.mappls.Marker || !mapCenter) {
          setMapStatus("error");
          return;
        }

        if (!mapRef.current) {
          mapRef.current = new window.mappls.Map(mapId, {
            center: mapCenter,
            zoom: locatedMarkers.length > 1 ? 11 : 15,
            zoomControl: true,
            location: true,
          });
          mapRef.current.addListener?.("load", renderMarkers);
        } else {
          mapRef.current.setCenter?.(mapCenter);
          mapRef.current.setZoom?.(locatedMarkers.length > 1 ? 11 : 15);
        }

        window.setTimeout(renderMarkers, 250);
        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [locatedMarkers, mapCenter, mapId, selectedMarker?.siteId]);

  useEffect(() => {
    return () => {
      markerRefs.current.forEach((marker) => {
        if (marker.remove) marker.remove();
        else marker.setMap?.(null);
      });
      markerRefs.current = [];
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, []);

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

      <div className="site-map-canvas is-sdk-map" aria-label="Site map view">
        <div id={mapId} className="site-map-sdk-canvas" />
        {mapStatus === "missing-key" ? (
          <div className="site-map-status">Mappls map key missing. Add NEXT_PUBLIC_MAPPLS_MAP_SDK_KEY in AWS.</div>
        ) : null}
        {mapStatus === "loading" ? <div className="site-map-status">Loading Mappls map...</div> : null}
        {mapStatus === "error" ? <div className="site-map-status">Mappls map could not load. Check the static key and domain whitelist.</div> : null}
        {mapStatus !== "ready"
          ? locatedMarkers.map((marker) => {
              const left = normalizePosition(marker.latLng?.lng ?? 0, fallbackBounds.minLng, fallbackBounds.maxLng);
              const top = 100 - normalizePosition(marker.latLng?.lat ?? 0, fallbackBounds.minLat, fallbackBounds.maxLat);
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
            })
          : null}
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
