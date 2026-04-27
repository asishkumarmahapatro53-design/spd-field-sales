"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GpsCamera } from "@/components/agent/GpsCamera";
import { getLocationPayload, parseApiError, toDateTimeLocalValue } from "@/components/agent/action-helpers";
import { reverseGeocode } from "@/lib/image-utils";
import { EXPECTED_SUPPLY_OPTIONS, getLocationVerification, getStakeholderLabel, STAKEHOLDER_OPTIONS, suggestLeadScore, suggestLeadStage, suggestNextFollowUp } from "@/lib/site-visit";
import type { ExpectedSupplyWindow, Lead, LeadSite, LeadStage, SiteLocationVerificationStatus, StakeholderContact, StakeholderRole } from "@/lib/types";

interface SiteVisitFlowCardProps {
  agentName: string;
  employeeId: string;
  leads: Lead[];
  leadSites: LeadSite[];
}

interface StakeholderDraft {
  id: string;
  role: StakeholderRole;
  name: string;
  phone: string;
}

interface SiteVisitAnalysis {
  siteAddress: string | null;
  latLng: { lat: number; lng: number } | null;
  capturedAt: string | null;
  confidence: number;
  note: string;
}

const DEFAULT_STAKEHOLDER_ROLE: StakeholderRole = "SITE_SUPERVISOR";

function createStakeholderDraft(): StakeholderDraft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    role: DEFAULT_STAKEHOLDER_ROLE,
    name: "",
    phone: "",
  };
}

function stakeholderKey(entry: StakeholderContact) {
  return `${entry.role ?? entry.label}:${entry.name}:${entry.phone}`;
}

function getVerificationMessage(status: SiteLocationVerificationStatus | null, distanceMeters: number | null) {
  switch (status) {
    case "MATCHED":
      return `Photo coordinates match the saved site within ${distanceMeters ?? 0} m.`;
    case "OUT_OF_RANGE":
      return `Photo coordinates are ${distanceMeters ?? 0} m away from the saved site, so this visit should be reviewed carefully.`;
    case "PHOTO_COORDS_MISSING":
      return "Coordinates were not found in the uploaded photo watermark.";
    case "SAVED_COORDS_MISSING":
      return "This site does not have a saved location yet, so verification cannot run.";
    default:
      return "Location verification will run after the photo watermark is read.";
  }
}

function toStakeholderPayload(stakeholders: StakeholderDraft[], selectedKnownStakeholders: StakeholderContact[], foundNoOne: boolean) {
  const payload: StakeholderContact[] = [];

  if (foundNoOne) {
    payload.push({
      label: getStakeholderLabel("FOUND_NO_ONE"),
      role: "FOUND_NO_ONE",
      name: "Found no one",
      phone: "",
    });
  } else {
    payload.push(...selectedKnownStakeholders);
    stakeholders.forEach((entry) => {
      if (!entry.name.trim()) {
        return;
      }

      payload.push({
        label: getStakeholderLabel(entry.role),
        role: entry.role,
        name: entry.name.trim(),
        phone: entry.phone.trim(),
      });
    });
  }

  return payload;
}

export function SiteVisitFlowCard({ agentName, employeeId, leads, leadSites }: SiteVisitFlowCardProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [visitMode, setVisitMode] = useState<"NEW_LEAD" | "EXISTING_LEAD">(leads.length ? "EXISTING_LEAD" : "NEW_LEAD");
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [siteMode, setSiteMode] = useState<"EXISTING_SITE" | "NEW_SITE">("EXISTING_SITE");
  const [siteId, setSiteId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteAddressEdited, setSiteAddressEdited] = useState(false);
  const [currentSupplierMode, setCurrentSupplierMode] = useState<"MANUAL_MIX" | "ADD_SUPPLIER">("MANUAL_MIX");
  const [supplierInputs, setSupplierInputs] = useState([""]);
  const [expectedSupplyWindow, setExpectedSupplyWindow] = useState<ExpectedSupplyWindow>("WITHIN_15_DAYS");
  const [newStakeholders, setNewStakeholders] = useState<StakeholderDraft[]>([createStakeholderDraft()]);
  const [selectedKnownStakeholderKeys, setSelectedKnownStakeholderKeys] = useState<string[]>([]);
  const [foundNoOne, setFoundNoOne] = useState(false);
  const [analysis, setAnalysis] = useState<SiteVisitAnalysis | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [arrivalPhoto, setArrivalPhoto] = useState<File | null>(null);
  const [arrivalPhotoCoords, setArrivalPhotoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [leadStage, setLeadStage] = useState<LeadStage>("TALKS");
  const [leadStageEdited, setLeadStageEdited] = useState(false);
  const [nextFollowUpAt, setNextFollowUpAt] = useState(toDateTimeLocalValue(suggestNextFollowUp({ expectedSupplyWindow: "WITHIN_15_DAYS" })));
  const [nextFollowUpEdited, setNextFollowUpEdited] = useState(false);

  const selectedLead = useMemo(() => leads.find((entry) => entry.id === leadId) ?? null, [leadId, leads]);
  const sitesForLead = useMemo(() => leadSites.filter((entry) => entry.leadId === leadId), [leadId, leadSites]);
  const selectedSite = useMemo(() => sitesForLead.find((entry) => entry.id === siteId) ?? null, [siteId, sitesForLead]);
  const usingExistingSite = visitMode === "EXISTING_LEAD" && siteMode === "EXISTING_SITE" && !!selectedSite;
  const selectedKnownStakeholders = useMemo(
    () => (selectedSite?.stakeholders ?? []).filter((entry) => selectedKnownStakeholderKeys.includes(stakeholderKey(entry))),
    [selectedKnownStakeholderKeys, selectedSite],
  );
  const suggestedStakeholders = useMemo(
    () => toStakeholderPayload(newStakeholders, selectedKnownStakeholders, foundNoOne),
    [foundNoOne, newStakeholders, selectedKnownStakeholders],
  );
  const suggestedLeadStage = useMemo(
    () =>
      suggestLeadStage({
        expectedSupplyWindow,
        stakeholders: suggestedStakeholders,
      }),
    [expectedSupplyWindow, suggestedStakeholders],
  );
  const suggestedFollowUpAt = useMemo(
    () =>
      toDateTimeLocalValue(
        suggestNextFollowUp({
          baseIso: analysis?.capturedAt,
          expectedSupplyWindow,
        }),
      ),
    [analysis?.capturedAt, expectedSupplyWindow],
  );
  const suggestedScore = useMemo(
    () =>
      suggestLeadScore({
        expectedSupplyWindow,
        stakeholders: suggestedStakeholders,
        currentSupplier:
          usingExistingSite && selectedSite
            ? selectedSite.currentSupplier
            : currentSupplierMode === "MANUAL_MIX"
              ? "Manual mix"
              : supplierInputs.join(" | "),
      }),
    [currentSupplierMode, expectedSupplyWindow, selectedSite, suggestedStakeholders, supplierInputs, usingExistingSite],
  );
  const verification = useMemo(
    () =>
      usingExistingSite && selectedSite
        ? getLocationVerification({
            savedLatLng: selectedSite.latLng,
            detectedLatLng: analysis?.latLng ?? null,
          })
        : null,
    [analysis?.latLng, selectedSite, usingExistingSite],
  );

  useEffect(() => {
    if (visitMode === "EXISTING_LEAD" && !leadId && leads[0]) {
      setLeadId(leads[0].id);
    }
  }, [visitMode, leadId, leads]);

  useEffect(() => {
    if (visitMode !== "EXISTING_LEAD") {
      setLeadId("");
      setSiteMode("NEW_SITE");
      setSiteId("");
      return;
    }

    if (!sitesForLead.length) {
      setSiteMode("NEW_SITE");
      setSiteId("");
      return;
    }

    if (siteMode === "EXISTING_SITE") {
      setSiteId((current) => (sitesForLead.some((entry) => entry.id === current) ? current : sitesForLead[0]?.id ?? ""));
    }
  }, [leadId, siteMode, sitesForLead, visitMode]);

  useEffect(() => {
    setAnalysis(null);
    setAnalysisError("");
    setArrivalPhoto(null);
    setArrivalPhotoCoords(null);
    setSiteAddressEdited(false);
    setSiteAddress(usingExistingSite ? selectedSite?.siteAddress ?? "" : "");
    setSiteName(usingExistingSite ? selectedSite?.siteName ?? "" : "");
    setSelectedKnownStakeholderKeys([]);
    setFoundNoOne(false);
    setNewStakeholders(usingExistingSite ? [] : [createStakeholderDraft()]);
  }, [leadId, selectedSite?.id, usingExistingSite]);

  useEffect(() => {
    if (!leadStageEdited) {
      setLeadStage(suggestedLeadStage);
    }
  }, [leadStageEdited, suggestedLeadStage]);

  useEffect(() => {
    if (!nextFollowUpEdited) {
      setNextFollowUpAt(suggestedFollowUpAt);
    }
  }, [nextFollowUpEdited, suggestedFollowUpAt]);

  async function analyzePhoto(file: File) {
    setAnalysisBusy(true);
    setAnalysisError("");

    const formData = new FormData();
    formData.set("photo", file);

    const response = await fetch("/api/site-visit-analysis", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setAnalysis(null);
      setAnalysisError(await parseApiError(response));
      setAnalysisBusy(false);
      return;
    }

    const payload = (await response.json()) as { metadata?: SiteVisitAnalysis };
    const metadata = payload.metadata ?? null;
    setAnalysis(metadata);

    if (!usingExistingSite && metadata?.siteAddress && !siteAddressEdited) {
      setSiteAddress(metadata.siteAddress);
    }

    setAnalysisBusy(false);
  }

  async function handleArrivalPhotoCapture(file: File, coords: { lat: number; lng: number } | null) {
    setArrivalPhoto(file);
    setArrivalPhotoCoords(coords);

    if (!usingExistingSite && coords && !siteAddressEdited) {
      const geocodedAddress = await reverseGeocode(coords.lat, coords.lng).catch(() => null);
      if (geocodedAddress) {
        setSiteAddress(geocodedAddress);
      }
    }

    await analyzePhoto(file);
  }

  function updateSupplierInput(index: number, value: string) {
    setSupplierInputs((current) => current.map((entry, currentIndex) => (currentIndex === index ? value : entry)));
  }

  function updateStakeholder(index: number, field: keyof StakeholderDraft, value: string) {
    setNewStakeholders((current) =>
      current.map((entry, currentIndex) =>
        currentIndex === index
          ? {
              ...entry,
              [field]: value,
            }
          : entry,
      ),
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    setError("");

    const encounteredStakeholders = toStakeholderPayload(newStakeholders, selectedKnownStakeholders, foundNoOne);

    if (!encounteredStakeholders.length) {
      setError("Select the stakeholder you met or choose 'Found no one'.");
      setBusy(false);
      return;
    }

    if (!arrivalPhoto) {
      setError("Please capture the site visit photo first.");
      setBusy(false);
      return;
    }

    if (!usingExistingSite && !siteName.trim()) {
      setError("Site name is required.");
      setBusy(false);
      return;
    }

    const currentSupplier =
      usingExistingSite && selectedSite
        ? selectedSite.currentSupplier
        : currentSupplierMode === "MANUAL_MIX"
          ? "Manual mix"
          : supplierInputs.map((entry) => entry.trim()).filter(Boolean).join("|");

    if (!usingExistingSite && currentSupplierMode === "ADD_SUPPLIER" && !currentSupplier) {
      setError("Add at least one current supplier or choose manual mix.");
      setBusy(false);
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const location = arrivalPhotoCoords
      ? { lat: String(arrivalPhotoCoords.lat), lng: String(arrivalPhotoCoords.lng) }
      : await getLocationPayload();
    formData.set("lat", location.lat);
    formData.set("lng", location.lng);
    formData.set("arrivalPhoto", arrivalPhoto, arrivalPhoto.name);
    formData.set("leadId", visitMode === "EXISTING_LEAD" ? leadId : "");
    formData.set("siteId", usingExistingSite && selectedSite ? selectedSite.id : "");
    formData.set("siteName", usingExistingSite && selectedSite ? selectedSite.siteName : siteName.trim());
    formData.set("siteAddress", usingExistingSite && selectedSite ? selectedSite.siteAddress : siteAddress.trim());
    formData.set("stakeholders", JSON.stringify(encounteredStakeholders));
    formData.set("currentSupplier", currentSupplier);
    formData.set("expectedSupplyWindow", expectedSupplyWindow);
    formData.set("leadStage", leadStage);
    formData.set("nextFollowUpAt", nextFollowUpAt);
    formData.set("score", String(suggestedScore));
    formData.set("photoWatermarkAddress", analysis?.siteAddress ?? siteAddress.trim());
    formData.set("photoCapturedAt", analysis?.capturedAt ?? "");
    formData.set("detectedLat", analysis?.latLng ? String(analysis.latLng.lat) : arrivalPhotoCoords ? String(arrivalPhotoCoords.lat) : "");
    formData.set("detectedLng", analysis?.latLng ? String(analysis.latLng.lng) : arrivalPhotoCoords ? String(arrivalPhotoCoords.lng) : "");

    const response = await fetch("/api/site-visits", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      setError(await parseApiError(response));
      setBusy(false);
      return;
    }

    form.reset();
    setFeedback("Site visit recorded and lead/site summary updated.");
    setError("");
    setAnalysis(null);
    setArrivalPhoto(null);
    setArrivalPhotoCoords(null);
    setSiteAddress("");
    setSiteName("");
    setSelectedKnownStakeholderKeys([]);
    setFoundNoOne(false);
    setNewStakeholders([createStakeholderDraft()]);
    setSiteAddressEdited(false);
    setLeadStageEdited(false);
    setNextFollowUpEdited(false);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="two-grid">
        <div className="field">
          <label htmlFor="visitMode">Visit flow</label>
          <select
            id="visitMode"
            value={visitMode}
            onChange={(event) => setVisitMode(event.target.value as "NEW_LEAD" | "EXISTING_LEAD")}
          >
            <option value="NEW_LEAD">Create new lead</option>
            <option value="EXISTING_LEAD" disabled={!leads.length}>
              Existing lead
            </option>
          </select>
        </div>

        {visitMode === "EXISTING_LEAD" ? (
          <div className="field">
            <label htmlFor="visitLeadId">Lead</label>
            <select id="visitLeadId" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.siteName}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {visitMode === "EXISTING_LEAD" ? (
        <div className="two-grid">
          <label className="choice-card">
            <input
              checked={siteMode === "EXISTING_SITE"}
              disabled={!sitesForLead.length}
              name="siteMode"
              type="radio"
              value="EXISTING_SITE"
              onChange={() => setSiteMode("EXISTING_SITE")}
            />
            <span>
              <strong>Use existing site</strong>
              <small>{sitesForLead.length ? "Reuse saved address, location, and stakeholders." : "No sites saved under this lead yet."}</small>
            </span>
          </label>
          <label className="choice-card">
            <input checked={siteMode === "NEW_SITE"} name="siteMode" type="radio" value="NEW_SITE" onChange={() => setSiteMode("NEW_SITE")} />
            <span>
              <strong>Create new site</strong>
              <small>Add another site under the same lead.</small>
            </span>
          </label>
        </div>
      ) : null}

      {usingExistingSite && selectedSite ? (
        <div className="summary-card">
          <div className="panel-header">
            <div>
              <h4>{selectedSite.siteName}</h4>
              <p className="panel-copy">{selectedSite.siteAddress}</p>
            </div>
            <span className="status-badge status-confirmed">Saved site</span>
          </div>
          <div className="row-meta">
            <span>Supplier {selectedSite.currentSupplier || "Not saved"}</span>
            <span>Score {selectedSite.score}/10</span>
            <span>Last visit {selectedSite.lastVisitedAt.slice(0, 10)}</span>
          </div>
          {sitesForLead.length > 1 ? (
            <div className="field">
              <label htmlFor="siteId">Site</label>
              <select id="siteId" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                {sitesForLead.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.siteName}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {!usingExistingSite ? (
        <div className="two-grid">
          <div className="field">
            <label htmlFor="siteName">Site name</label>
            <input id="siteName" value={siteName} onChange={(event) => setSiteName(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="siteAddress">Site address</label>
            <input
              id="siteAddress"
              value={siteAddress}
              onChange={(event) => {
                setSiteAddress(event.target.value);
                setSiteAddressEdited(true);
              }}
              placeholder="Auto-filled from GPS camera watermark"
              required
            />
            <span className="hint">This is auto-filled from the site visit photo watermark and can be corrected if needed.</span>
          </div>
        </div>
      ) : null}

      <div className="field">
        <label>Arrival photo</label>
        <GpsCamera
          label="Take Site Visit Photo"
          agentName={agentName}
          employeeId={employeeId}
          siteName={usingExistingSite && selectedSite ? selectedSite.siteName : siteName.trim() || undefined}
          onCapture={(file, coords) => {
            void handleArrivalPhotoCapture(file, coords);
          }}
          disabled={busy || analysisBusy}
        />
        {arrivalPhoto ? (
          <span className="hint">
            Photo ready: {arrivalPhoto.name} ({(arrivalPhoto.size / 1024).toFixed(0)} KB)
          </span>
        ) : (
          <span className="hint">Use the in-app GPS camera so the photo carries address, date, and coordinates for extraction.</span>
        )}
      </div>

      {analysisBusy ? <div className="note-box">Reading the GPS watermark from the uploaded site photo...</div> : null}
      {analysisError ? <div className="error-box">{analysisError}</div> : null}
      {analysis ? (
        <div className="summary-card summary-card-compact">
          <div className="summary-card-grid">
            <div className="summary-cell">
              <span className="summary-label">Watermark address</span>
              <strong>{analysis.siteAddress ?? "Not found"}</strong>
            </div>
            <div className="summary-cell">
              <span className="summary-label">Watermark coordinates</span>
              <strong>
                {analysis.latLng ? `${analysis.latLng.lat.toFixed(5)}, ${analysis.latLng.lng.toFixed(5)}` : "Not found"}
              </strong>
            </div>
            <div className="summary-cell">
              <span className="summary-label">Captured time</span>
              <strong>{analysis.capturedAt ? analysis.capturedAt.slice(0, 16).replace("T", " ") : "Not found"}</strong>
            </div>
          </div>
          <p className="panel-copy">{analysis.note}</p>
          {verification ? (
            <div className={verification.status === "MATCHED" ? "success-box" : "warning-box"}>
              {getVerificationMessage(verification.status, verification.distanceMeters)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="section-stack">
        <div className="panel-header">
          <div>
            <h4>Stakeholder details</h4>
            <p className="panel-copy">Choose the person you talked to and add new contacts only if they were not already saved.</p>
          </div>
        </div>

        {usingExistingSite && selectedSite?.stakeholders.length ? (
          <div className="chip-grid">
            {selectedSite.stakeholders.map((stakeholder) => {
              const key = stakeholderKey(stakeholder);
              const checked = selectedKnownStakeholderKeys.includes(key);

              return (
                <label key={key} className={checked ? "selection-chip is-selected" : "selection-chip"}>
                  <input
                    checked={checked}
                    disabled={foundNoOne}
                    type="checkbox"
                    onChange={(event) =>
                      setSelectedKnownStakeholderKeys((current) =>
                        event.target.checked ? [...current, key] : current.filter((entry) => entry !== key),
                      )
                    }
                  />
                  <span>
                    <strong>{stakeholder.name || stakeholder.label}</strong>
                    <small>{stakeholder.phone || stakeholder.label}</small>
                  </span>
                </label>
              );
            })}
          </div>
        ) : null}

        <label className="choice-card">
          <input
            checked={foundNoOne}
            type="checkbox"
            onChange={(event) => {
              setFoundNoOne(event.target.checked);
              if (event.target.checked) {
                setSelectedKnownStakeholderKeys([]);
                setNewStakeholders([]);
              } else if (!newStakeholders.length) {
                setNewStakeholders([createStakeholderDraft()]);
              }
            }}
          />
          <span>
            <strong>Found no one</strong>
            <small>Use this when no decision-maker or site contact was available.</small>
          </span>
        </label>

        {!foundNoOne ? (
          <>
            {newStakeholders.map((stakeholder, index) => (
              <div key={stakeholder.id} className="three-grid">
                <div className="field">
                  <label htmlFor={`stakeholder-role-${stakeholder.id}`}>Role</label>
                  <select
                    id={`stakeholder-role-${stakeholder.id}`}
                    value={stakeholder.role}
                    onChange={(event) => updateStakeholder(index, "role", event.target.value)}
                  >
                    {STAKEHOLDER_OPTIONS.filter((entry) => entry.role !== "FOUND_NO_ONE").map((entry) => (
                      <option key={entry.role} value={entry.role}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`stakeholder-name-${stakeholder.id}`}>Name</label>
                  <input
                    id={`stakeholder-name-${stakeholder.id}`}
                    value={stakeholder.name}
                    onChange={(event) => updateStakeholder(index, "name", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`stakeholder-phone-${stakeholder.id}`}>Contact number</label>
                  <input
                    id={`stakeholder-phone-${stakeholder.id}`}
                    value={stakeholder.phone}
                    onChange={(event) => updateStakeholder(index, "phone", event.target.value)}
                  />
                </div>
              </div>
            ))}
            <button
              className="button-ghost"
              type="button"
              onClick={() => setNewStakeholders((current) => [...current, createStakeholderDraft()])}
            >
              Add new stakeholder
            </button>
          </>
        ) : null}
      </div>

      {!usingExistingSite ? (
        <div className="section-stack">
          <div className="panel-header">
            <div>
              <h4>Current supplier</h4>
              <p className="panel-copy">Choose manual mix or add one or more existing suppliers.</p>
            </div>
          </div>
          <div className="two-grid">
            <label className="choice-card">
              <input
                checked={currentSupplierMode === "MANUAL_MIX"}
                name="currentSupplierMode"
                type="radio"
                value="MANUAL_MIX"
                onChange={() => setCurrentSupplierMode("MANUAL_MIX")}
              />
              <span>
                <strong>Manual mix</strong>
                <small>No ready-mix supplier is currently serving the site.</small>
              </span>
            </label>
            <label className="choice-card">
              <input
                checked={currentSupplierMode === "ADD_SUPPLIER"}
                name="currentSupplierMode"
                type="radio"
                value="ADD_SUPPLIER"
                onChange={() => setCurrentSupplierMode("ADD_SUPPLIER")}
              />
              <span>
                <strong>Add current supplier</strong>
                <small>Capture one or more competitors already supplying the site.</small>
              </span>
            </label>
          </div>
          {currentSupplierMode === "ADD_SUPPLIER" ? (
            <div className="section-stack">
              {supplierInputs.map((supplier, index) => (
                <div key={`supplier-${index}`} className="field">
                  <label htmlFor={`supplier-${index}`}>Supplier {index + 1}</label>
                  <input id={`supplier-${index}`} value={supplier} onChange={(event) => updateSupplierInput(index, event.target.value)} />
                </div>
              ))}
              <button className="button-ghost" type="button" onClick={() => setSupplierInputs((current) => [...current, ""])}>
                Add another supplier
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="three-grid">
        <div className="field">
          <label htmlFor="expectedSupplyWindow">Expected supply</label>
          <select
            id="expectedSupplyWindow"
            value={expectedSupplyWindow}
            onChange={(event) => setExpectedSupplyWindow(event.target.value as ExpectedSupplyWindow)}
          >
            {EXPECTED_SUPPLY_OPTIONS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="concreteGrade">Concrete grade</label>
          <input id="concreteGrade" name="concreteGrade" defaultValue={selectedSite?.currentConcreteGrade ?? "M25"} required />
        </div>
        <div className="field">
          <label htmlFor="quantityCum">Quantity (CUM)</label>
          <input id="quantityCum" name="quantityCum" type="number" min="0" step="0.01" defaultValue={selectedSite?.currentQuantityCum ?? ""} required />
        </div>
      </div>

      <div className="three-grid">
        <div className="field">
          <label htmlFor="stageOfWork">Stage of work</label>
          <input id="stageOfWork" name="stageOfWork" placeholder="Foundation / Slab / Column" required />
        </div>
        <div className="field">
          <label htmlFor="leadStage">Lead stage</label>
          <select
            id="leadStage"
            value={leadStage}
            onChange={(event) => {
              setLeadStage(event.target.value as LeadStage);
              setLeadStageEdited(true);
            }}
          >
            <option value="TALKS">Talks</option>
            <option value="NEGOTIATING">Negotiating</option>
            <option value="FINALIZED">Finalized</option>
            <option value="MISSED">Missed</option>
          </select>
          <span className="hint">Suggested stage: {suggestedLeadStage}</span>
        </div>
        <div className="field">
          <label htmlFor="nextFollowUpAt">Next follow-up</label>
          <input
            id="nextFollowUpAt"
            type="datetime-local"
            value={nextFollowUpAt}
            onChange={(event) => {
              setNextFollowUpAt(event.target.value);
              setNextFollowUpEdited(true);
            }}
            required
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="futureScope">Future scope / update</label>
        <textarea id="futureScope" name="futureScope" defaultValue={selectedSite?.futureScope ?? ""} required />
      </div>

      <div className="field">
        <label htmlFor="remarksText">Remarks</label>
        <textarea id="remarksText" name="remarksText" placeholder="Type remarks here or attach a voice note below." />
      </div>

      <div className="field">
        <label htmlFor="remarksVoiceNote">Voice note (optional)</label>
        <input id="remarksVoiceNote" name="remarksVoiceNote" type="file" accept="audio/*" />
        <span className="hint">If a voice note is attached, Gemini will try to transcribe it into English after submit.</span>
      </div>

      <div className="note-box">Suggested lead score for this visit: {suggestedScore}/10</div>

      {feedback ? <div className="success-box">{feedback}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <button className="button" type="submit" disabled={busy || isRefreshing || analysisBusy}>
        {busy ? "Saving..." : isRefreshing ? "Refreshing..." : "Save site visit"}
      </button>
    </form>
  );
}
