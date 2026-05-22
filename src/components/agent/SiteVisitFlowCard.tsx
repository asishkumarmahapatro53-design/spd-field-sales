"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GpsCamera, type PhotoCaptureSource } from "@/components/agent/GpsCamera";
import { getLocationPayload, parseApiError, toDateTimeLocalValue, uploadDirectFile, type PresignedUploadPayload } from "@/components/agent/action-helpers";
import { reverseGeocode } from "@/lib/image-utils";
import { EXPECTED_SUPPLY_OPTIONS, getLocationVerification, getStakeholderLabel, STAKEHOLDER_OPTIONS, suggestLeadScore, suggestLeadStage, suggestNextFollowUp } from "@/lib/site-visit";
import type { ExpectedSupplyWindow, Lead, LeadSite, LeadStage, SiteLocationVerificationStatus, StakeholderContact, StakeholderRole } from "@/lib/types";

const CONCRETE_GRADE_OPTIONS = [
  "M5",
  "M7.5",
  "M10",
  "M15",
  "M20",
  "M25",
  "M30",
  "M35",
  "M40",
  "M45",
  "M50",
  "PCC",
  "OTHER",
];

function sanitizePhoneInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 10);
}

function getPhoneInputHint(value: string) {
  const phone = value.replace(/\D/g, "");

  if (!phone) {
    return "Enter 10-digit Indian mobile number.";
  }

  if (phone.length < 10) {
    return `Phone number needs ${10 - phone.length} more digit(s).`;
  }

  if (!/^[6-9]/.test(phone)) {
    return "Indian mobile number should start with 6, 7, 8, or 9.";
  }

  if (/^(\d)\1{9}$/.test(phone) || ["1234567890", "0123456789", "9876543210"].includes(phone)) {
    return "This appears to be a dummy phone number and will require manager review.";
  }

  return "Phone format looks valid. WhatsApp/call verification will be handled separately.";
}

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

interface VoiceNoteTranscript {
  text: string | null;
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

function isFoundNoOneStakeholder(entry: StakeholderContact) {
  const role = `${entry.role ?? ""}`.toUpperCase();
  const name = entry.name.trim().toLowerCase();
  return role === "FOUND_NO_ONE" || name === "found no one";
}

function normalizeTextForMatch(value: string) {
  return value.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

function hasConversationIntent(value: string) {
  return /\b(talk(?:ed|ing)?|spoke|speak|met|meeting|discuss(?:ed|ion)?)\b/i.test(value);
}

function getAutoSelectedStakeholderKeysFromRemarks(remarks: string, stakeholders: StakeholderContact[]) {
  if (!hasConversationIntent(remarks)) {
    return [];
  }

  const normalizedRemarks = normalizeTextForMatch(remarks);
  if (!normalizedRemarks) {
    return [];
  }

  return stakeholders
    .filter((entry) => {
      const normalizedName = normalizeTextForMatch(entry.name || "");
      return normalizedName.length >= 3 && normalizedRemarks.includes(normalizedName);
    })
    .map((entry) => stakeholderKey(entry));
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
  const [siteSearchQuery, setSiteSearchQuery] = useState("");
  const [siteName, setSiteName] = useState("");
  const [concreteGrade, setConcreteGrade] = useState("M25");
  const [currentSupplier, setCurrentSupplier] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [siteAddressEdited, setSiteAddressEdited] = useState(false);
  const [expectedSupplyWindow, setExpectedSupplyWindow] = useState<ExpectedSupplyWindow>("WITHIN_15_DAYS");
  const [newStakeholders, setNewStakeholders] = useState<StakeholderDraft[]>([createStakeholderDraft()]);
  const [selectedKnownStakeholderKeys, setSelectedKnownStakeholderKeys] = useState<string[]>([]);
  const [foundNoOne, setFoundNoOne] = useState(false);
  const [analysis, setAnalysis] = useState<SiteVisitAnalysis | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [arrivalPhoto, setArrivalPhoto] = useState<File | null>(null);
  const [arrivalPhotoUpload, setArrivalPhotoUpload] = useState<PresignedUploadPayload | null>(null);
  const [arrivalPhotoCoords, setArrivalPhotoCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [arrivalPhotoSource, setArrivalPhotoSource] = useState<PhotoCaptureSource>("camera");
  const [voiceNoteUpload, setVoiceNoteUpload] = useState<PresignedUploadPayload | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState<VoiceNoteTranscript | null>(null);
  const [voiceTranscriptBusy, setVoiceTranscriptBusy] = useState(false);
  const [voiceTranscriptError, setVoiceTranscriptError] = useState("");
  const [remarksText, setRemarksText] = useState("");
  const [remarksTranscriptText, setRemarksTranscriptText] = useState("");
  const [stakeholderHint, setStakeholderHint] = useState("");
  const [leadStage, setLeadStage] = useState<LeadStage>("TALKS");
  const [leadStageEdited, setLeadStageEdited] = useState(false);
  const [nextFollowUpAt, setNextFollowUpAt] = useState(toDateTimeLocalValue(suggestNextFollowUp({ expectedSupplyWindow: "WITHIN_15_DAYS" })));
  const [nextFollowUpEdited, setNextFollowUpEdited] = useState(false);

  const selectedLead = useMemo(() => leads.find((entry) => entry.id === leadId) ?? null, [leadId, leads]);
  const sitesForLead = useMemo(() => leadSites.filter((entry) => entry.leadId === leadId), [leadId, leadSites]);
  const filteredSitesForLead = useMemo(() => {
    return sitesForLead.filter((site) => {
      const query = siteSearchQuery.trim().toLowerCase();
      if (!query) return true;

      return [
        site.siteName,
        site.siteAddress,
        site.currentSupplier,
        site.currentConcreteGrade,
        ...(site.stakeholders ?? []).flatMap((stakeholder) => [
          stakeholder.name,
          stakeholder.phone,
          stakeholder.label,
          stakeholder.role,
        ]),
      ]
        .filter(Boolean)
        .some((value) => `${value}`.toLowerCase().includes(query));
    });
  }, [sitesForLead, siteSearchQuery]);
  const selectedSite = useMemo(() => sitesForLead.find((entry) => entry.id === siteId) ?? null, [siteId, sitesForLead]);
  const selectableKnownStakeholders = useMemo(
    () => (selectedSite?.stakeholders ?? []).filter((entry) => !isFoundNoOneStakeholder(entry)),
    [selectedSite],
  );
  const usingExistingSite = visitMode === "EXISTING_LEAD" && siteMode === "EXISTING_SITE" && !!selectedSite;
  const selectedKnownStakeholders = useMemo(
    () => selectableKnownStakeholders.filter((entry) => selectedKnownStakeholderKeys.includes(stakeholderKey(entry))),
    [selectableKnownStakeholders, selectedKnownStakeholderKeys],
  );
  const suggestedStakeholders = useMemo(
    () => toStakeholderPayload(newStakeholders, selectedKnownStakeholders, foundNoOne),
    [foundNoOne, newStakeholders, selectedKnownStakeholders],
  );
  const combinedRemarks = useMemo(
    () => [remarksText.trim(), remarksTranscriptText.trim()].filter(Boolean).join("\n"),
    [remarksText, remarksTranscriptText],
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
        currentSupplier: usingExistingSite && selectedSite ? selectedSite.currentSupplier : currentSupplier,
      }),
    [currentSupplier, expectedSupplyWindow, selectedSite, suggestedStakeholders, usingExistingSite],
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
    setArrivalPhotoUpload(null);
    setArrivalPhotoCoords(null);
    setArrivalPhotoSource("camera");
    setVoiceNoteUpload(null);
    setVoiceTranscript(null);
    setVoiceTranscriptBusy(false);
    setVoiceTranscriptError("");
    setRemarksText("");
    setRemarksTranscriptText("");
    setSiteAddressEdited(false);
    setSiteAddress(usingExistingSite ? selectedSite?.siteAddress ?? "" : "");
    setSiteName(usingExistingSite ? selectedSite?.siteName ?? "" : "");
    setSiteSearchQuery("");
    setConcreteGrade(usingExistingSite ? selectedSite?.currentConcreteGrade ?? "M25" : "M25");
    setCurrentSupplier(usingExistingSite ? selectedSite?.currentSupplier ?? "" : "");
    setSelectedKnownStakeholderKeys([]);
    setStakeholderHint("");
    setFoundNoOne(false);
    setNewStakeholders(usingExistingSite ? [] : [createStakeholderDraft()]);
  }, [leadId, selectedSite?.id, usingExistingSite]);

  useEffect(() => {
    if (!usingExistingSite || foundNoOne || !combinedRemarks.trim()) {
      return;
    }

    const autoKeys = getAutoSelectedStakeholderKeysFromRemarks(combinedRemarks, selectableKnownStakeholders);
    if (!autoKeys.length) {
      return;
    }

    setSelectedKnownStakeholderKeys((current) => {
      const merged = Array.from(new Set([...current, ...autoKeys]));
      if (merged.length !== current.length) {
        setStakeholderHint("Auto-selected stakeholder(s) mentioned in remarks/transcript.");
        return merged;
      }

      return current;
    });
  }, [combinedRemarks, foundNoOne, selectableKnownStakeholders, usingExistingSite]);

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

  async function analyzePhoto(upload: PresignedUploadPayload, file: File) {
    setAnalysisBusy(true);
    setAnalysisError("");

    const response = await fetch("/api/site-visit-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        s3Key: upload.key,
        photoName: upload.originalFileName || file.name,
        mimeType: file.type || "image/webp",
      }),
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

  async function handleArrivalPhotoCapture(file: File, coords: { lat: number; lng: number } | null, source: PhotoCaptureSource) {
    setArrivalPhoto(file);
    setArrivalPhotoUpload(null);
    setArrivalPhotoCoords(source === "camera" ? coords : null);
    setArrivalPhotoSource(source);

    if (source === "camera" && !usingExistingSite && coords && !siteAddressEdited) {
      const geocodedAddress = await reverseGeocode(coords.lat, coords.lng).catch(() => null);
      if (geocodedAddress) {
        setSiteAddress(geocodedAddress);
      }
    }

    setAnalysisBusy(true);
    try {
      const upload = await uploadDirectFile(file, "site-visit");
      setArrivalPhotoUpload(upload);
      await analyzePhoto(upload, file);
    } catch (error) {
      setAnalysis(null);
      setAnalysisError(error instanceof Error ? error.message : "Site photo upload failed. Please try again.");
      setAnalysisBusy(false);
    }
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

  async function transcribeVoiceNote(upload: PresignedUploadPayload, file: File) {
    setVoiceTranscriptBusy(true);
    setVoiceTranscriptError("");

    const response = await fetch("/api/site-visit-transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        s3Key: upload.key,
        voiceName: upload.originalFileName || file.name,
        mimeType: file.type || "audio/webm",
      }),
    });

    if (!response.ok) {
      setVoiceTranscript(null);
      setVoiceTranscriptError(await parseApiError(response));
      setVoiceTranscriptBusy(false);
      return;
    }

    const payload = (await response.json()) as { transcript?: VoiceNoteTranscript };
    const transcript = payload.transcript ?? null;
    setVoiceTranscript(transcript);
    setRemarksTranscriptText(transcript?.text?.trim() || "");
    setVoiceTranscriptBusy(false);
  }

  async function handleVoiceNoteChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setVoiceNoteUpload(null);
    setVoiceTranscript(null);
    setVoiceTranscriptError("");
    setRemarksTranscriptText("");

    if (!file) {
      return;
    }

    try {
      const upload = await uploadDirectFile(file, "site-visit-voice");
      setVoiceNoteUpload(upload);
      await transcribeVoiceNote(upload, file);
    } catch (voiceError) {
      setVoiceTranscriptError(voiceError instanceof Error ? voiceError.message : "Voice note upload failed.");
      setVoiceTranscriptBusy(false);
    }
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

    if (arrivalPhotoSource === "gallery" && (!analysis?.siteAddress || !analysis.latLng)) {
      setError("Uploaded past site visit photos must have a readable GPS watermark address and coordinates.");
      setBusy(false);
      return;
    }

    if (!usingExistingSite && !siteName.trim()) {
      setError("Site name is required.");
      setBusy(false);
      return;
    }

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const remarksVoiceNote = formData.get("remarksVoiceNote");
      const directArrivalUpload = arrivalPhotoUpload ?? (await uploadDirectFile(arrivalPhoto, "site-visit"));
      const directVoiceUpload =
        voiceNoteUpload ??
        (remarksVoiceNote instanceof File && remarksVoiceNote.size > 0
          ? await uploadDirectFile(remarksVoiceNote, "site-visit-voice")
          : null);
      const fallbackPhotoCapturedAt =
        Number.isFinite(arrivalPhoto.lastModified) && arrivalPhoto.lastModified > 0
          ? new Date(arrivalPhoto.lastModified).toISOString()
          : "";
      const visitCoords = arrivalPhotoSource === "gallery" ? analysis?.latLng ?? null : arrivalPhotoCoords ?? analysis?.latLng ?? null;
      const location = visitCoords
        ? { lat: String(visitCoords.lat), lng: String(visitCoords.lng) }
        : arrivalPhotoSource === "camera"
          ? await getLocationPayload()
          : { lat: "", lng: "" };
      const resolvedSiteAddress =
        analysis?.siteAddress ??
        (usingExistingSite && selectedSite ? selectedSite.siteAddress : siteAddress.trim());

      const response = await fetch("/api/site-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arrivalPhotoS3Key: directArrivalUpload.key,
          arrivalPhotoName: directArrivalUpload.originalFileName || arrivalPhoto.name,
          arrivalPhotoMimeType: arrivalPhoto.type || "image/webp",
          arrivalPhotoSizeBytes: arrivalPhoto.size,
          remarksVoiceNoteS3Key: directVoiceUpload?.key ?? "",
          remarksVoiceNoteName:
            directVoiceUpload?.originalFileName || (remarksVoiceNote instanceof File ? remarksVoiceNote.name : ""),
          remarksVoiceNoteMimeType:
            remarksVoiceNote instanceof File && remarksVoiceNote.size > 0 ? remarksVoiceNote.type || "audio/webm" : "",
          remarksVoiceNoteSizeBytes:
            remarksVoiceNote instanceof File && remarksVoiceNote.size > 0 ? remarksVoiceNote.size : "",
          lat: location.lat,
          lng: location.lng,
          leadId: visitMode === "EXISTING_LEAD" ? leadId : "",
          siteId: usingExistingSite && selectedSite ? selectedSite.id : "",
          siteName: usingExistingSite && selectedSite ? selectedSite.siteName : siteName.trim(),
          siteAddress: resolvedSiteAddress,
          stakeholders: JSON.stringify(encounteredStakeholders),
          concreteGrade,
          quantityCum: Number(formData.get("quantityCum")),
          stageOfWork: formData.get("stageOfWork"),
          futureScope: formData.get("futureScope"),
          remarksText,
          remarksTranscriptText,
          currentSupplier,
          expectedSupplyWindow,
          leadStage,
          nextFollowUpAt,
          score: String(suggestedScore),
          photoWatermarkAddress: analysis?.siteAddress ?? "",
          photoCapturedAt: analysis?.capturedAt ?? fallbackPhotoCapturedAt,
          detectedLat: analysis?.latLng ? String(analysis.latLng.lat) : arrivalPhotoSource === "camera" && arrivalPhotoCoords ? String(arrivalPhotoCoords.lat) : "",
          detectedLng: analysis?.latLng ? String(analysis.latLng.lng) : arrivalPhotoSource === "camera" && arrivalPhotoCoords ? String(arrivalPhotoCoords.lng) : "",
        }),
      });

      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }

      form.reset();
      setFeedback("Site visit recorded and lead/site summary updated.");
      setError("");
      setAnalysis(null);
      setArrivalPhoto(null);
      setArrivalPhotoUpload(null);
      setArrivalPhotoCoords(null);
      setArrivalPhotoSource("camera");
      setVoiceNoteUpload(null);
      setVoiceTranscript(null);
      setVoiceTranscriptError("");
      setRemarksText("");
      setRemarksTranscriptText("");
      setSiteAddress("");
      setSiteName("");
      setSiteSearchQuery("");
      setConcreteGrade("M25");
      setCurrentSupplier("");
      setSelectedKnownStakeholderKeys([]);
      setStakeholderHint("");
      setFoundNoOne(false);
      setNewStakeholders([createStakeholderDraft()]);
      setSiteAddressEdited(false);
      setLeadStageEdited(false);
      setNextFollowUpEdited(false);
      startTransition(() => router.refresh());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Site visit upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
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
              <label htmlFor="siteSearchQuery">Search existing site</label>
              <input
                id="siteSearchQuery"
                value={siteSearchQuery}
                onChange={(event) => setSiteSearchQuery(event.target.value)}
                placeholder="Search by site name, area, stakeholder, or phone"
              />
              <span className="hint">Search within the selected lead before creating a new site.</span>

              <label htmlFor="siteId" style={{ marginTop: "16px" }}>Site</label>
              <select id="siteId" value={siteId} onChange={(event) => setSiteId(event.target.value)}>
                {filteredSitesForLead.map((site) => (
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
          onCapture={(file, coords, source) => {
            void handleArrivalPhotoCapture(file, coords, source);
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

        {usingExistingSite && selectableKnownStakeholders.length ? (
          selectableKnownStakeholders.length > 1 ? (
            <details className="history-toggle">
              <summary>
                <span>Choose stakeholder ({selectableKnownStakeholders.length})</span>
                <span className="history-toggle-copy">{selectedKnownStakeholderKeys.length} selected</span>
              </summary>
              <div className="history-panel">
                <div className="chip-grid">
                  {selectableKnownStakeholders.map((stakeholder) => {
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
              </div>
            </details>
          ) : (
            <div className="chip-grid">
              {selectableKnownStakeholders.map((stakeholder) => {
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
          )
        ) : null}
        {stakeholderHint ? <div className="note-box">{stakeholderHint}</div> : null}

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
                    onChange={(event) => updateStakeholder(index, "phone", sanitizePhoneInput(event.target.value))}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit mobile number"
                  />
                  <span className="hint">{getPhoneInputHint(stakeholder.phone)}</span>
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
          <div className="field">
            <label htmlFor="currentSupplier">Current supplier</label>
            <input
              id="currentSupplier"
              list="currentSupplierOptions"
              value={currentSupplier}
              onChange={(event) => setCurrentSupplier(event.target.value)}
              placeholder="Select or enter current supplier"
            />

            <datalist id="currentSupplierOptions">
              <option value="No current supplier" />
              <option value="Local supplier" />
              <option value="Self mixing" />
              <option value="Unknown" />
              <option value="Other" />
            </datalist>

            <span className="hint">
              Capture current supplier context. Later changes will require manager review.
            </span>
          </div>
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
            <option value="">Select expected supply...</option>
            {EXPECTED_SUPPLY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="concreteGrade">Concrete grade</label>
          <select
            id="concreteGrade"
            value={concreteGrade}
            onChange={(event) => setConcreteGrade(event.target.value)}
            required
          >
            <option value="">Select grade</option>
            {CONCRETE_GRADE_OPTIONS.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>

          {concreteGrade === "OTHER" ? (
            <span className="hint">OTHER grade will require manager review.</span>
          ) : null}
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
        <textarea
          id="remarksText"
          name="remarksText"
          value={remarksText}
          onChange={(event) => setRemarksText(event.target.value)}
          placeholder="Type remarks here or attach a voice note below."
        />
      </div>

      <div className="field">
        <label htmlFor="remarksVoiceNote">Voice note (optional)</label>
        <input id="remarksVoiceNote" name="remarksVoiceNote" type="file" accept="audio/*" onChange={handleVoiceNoteChange} />
        <span className="hint">Voice note is transcribed before submit so you can edit transcript text.</span>
      </div>

      {voiceTranscriptBusy ? <div className="note-box">Transcribing voice note...</div> : null}
      {voiceTranscriptError ? <div className="error-box">{voiceTranscriptError}</div> : null}

      {voiceTranscript ? (
        <div className="field">
          <label htmlFor="remarksTranscriptText">Transcript (editable)</label>
          <textarea
            id="remarksTranscriptText"
            value={remarksTranscriptText}
            onChange={(event) => setRemarksTranscriptText(event.target.value)}
            placeholder="Transcript text will appear here."
          />
          <span className="hint">
            Confidence {(voiceTranscript.confidence * 100).toFixed(0)}%. {voiceTranscript.note}
          </span>
        </div>
      ) : null}

      <div className="note-box">Suggested lead score for this visit: {suggestedScore}/10</div>

      {feedback ? <div className="success-box">{feedback}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <button className="button" type="submit" disabled={busy || isRefreshing || analysisBusy}>
        {busy ? "Saving..." : isRefreshing ? "Refreshing..." : "Save site visit"}
      </button>
    </form>
  );
}
