"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseApiError, toDateTimeLocalValue } from "@/components/agent/action-helpers";
import { toIndiaTimeLabel } from "@/lib/date";
import { EXPECTED_SUPPLY_OPTIONS } from "@/lib/site-visit";
import type { ExpectedSupplyWindow, SiteVisit } from "@/lib/types";

interface SiteVisitLogListProps {
  siteVisits: SiteVisit[];
}

interface SiteVisitDraft {
  stageOfWork: string;
  futureScope: string;
  concreteGrade: string;
  quantityCum: string;
  leadStage: SiteVisit["leadStage"];
  nextFollowUpAt: string;
  expectedSupplyWindow: ExpectedSupplyWindow | "";
  remarksText: string;
}

function buildDraft(visit: SiteVisit): SiteVisitDraft {
  return {
    stageOfWork: visit.stageOfWork,
    futureScope: visit.futureScope,
    concreteGrade: visit.concreteGrade,
    quantityCum: String(visit.quantityCum),
    leadStage: visit.leadStage,
    nextFollowUpAt: toDateTimeLocalValue(visit.nextFollowUpAt),
    expectedSupplyWindow: visit.expectedSupplyWindow ?? "",
    remarksText: visit.remarksText ?? "",
  };
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function getVisitSearchText(visit: SiteVisit) {
  return [
    visit.leadId,
    visit.siteId,
    visit.siteName,
    visit.siteAddress,
    visit.stageOfWork,
    visit.futureScope,
    visit.concreteGrade,
    visit.currentSupplier,
    visit.priceExpectation,
    visit.remarksText,
    visit.stakeholders.map((stakeholder) => `${stakeholder.label} ${stakeholder.name} ${stakeholder.phone}`).join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function SiteVisitLogList({ siteVisits }: SiteVisitLogListProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [draft, setDraft] = useState<SiteVisitDraft | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearchQuery = normalizeSearch(searchQuery);
  const filteredVisits = useMemo(() => {
    if (!normalizedSearchQuery) {
      return siteVisits;
    }

    return siteVisits.filter((visit) => getVisitSearchText(visit).includes(normalizedSearchQuery));
  }, [normalizedSearchQuery, siteVisits]);

  function beginEdit(visit: SiteVisit) {
    setEditingId(visit.id);
    setDraft(buildDraft(visit));
    setError("");
    setFeedback("");
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
    setError("");
  }

  async function saveEdit(visitId: string) {
    if (!draft) {
      return;
    }

    setSavingId(visitId);
    setError("");
    setFeedback("");

    try {
      const response = await fetch(`/api/site-visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stageOfWork: draft.stageOfWork,
          futureScope: draft.futureScope,
          concreteGrade: draft.concreteGrade,
          quantityCum: draft.quantityCum,
          leadStage: draft.leadStage,
          nextFollowUpAt: draft.nextFollowUpAt,
          expectedSupplyWindow: draft.expectedSupplyWindow || null,
          remarksText: draft.remarksText,
        }),
      });

      if (!response.ok) {
        setError(await parseApiError(response));
        return;
      }

      setFeedback("Site visit report updated.");
      setEditingId(null);
      setDraft(null);
      startTransition(() => router.refresh());
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update this site visit.");
    } finally {
      setSavingId(null);
    }
  }

  if (!siteVisits.length) {
    return <div className="note-box">No site visits submitted yet.</div>;
  }

  return (
    <div className="section-stack">
      <div className="site-visit-search-card">
        <div className="field">
          <label htmlFor="site-visit-log-search">Search lead or site</label>
          <input
            id="site-visit-log-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search site name, address, lead ID, stakeholder, phone, or remarks"
          />
        </div>
        <div className="site-visit-search-meta">
          <span>
            Showing {filteredVisits.length} of {siteVisits.length} report{siteVisits.length === 1 ? "" : "s"}
          </span>
          {searchQuery ? (
            <button className="button-ghost" type="button" onClick={() => setSearchQuery("")}>
              Clear search
            </button>
          ) : null}
        </div>
      </div>

      {filteredVisits.length ? (
        <div className="data-list">
          {filteredVisits.map((visit) => {
            const activeDraft = editingId === visit.id ? draft : null;
            const isSaving = savingId === visit.id;

            return (
              <div key={visit.id} className="data-row">
                <div className="panel-header">
                  <div>
                    <h4>{visit.siteName}</h4>
                    <p className="panel-copy">{visit.siteAddress}</p>
                  </div>
                  <span className="metric-label">{toIndiaTimeLabel(visit.visitedAt)}</span>
                </div>

                {!activeDraft ? (
                  <>
                    <div className="row-meta">
                      <span>Stage {visit.stageOfWork}</span>
                      <span>Grade {visit.concreteGrade}</span>
                      <span>Qty {visit.quantityCum} CUM</span>
                    </div>
                    {visit.remarksText ? <p>{visit.remarksText}</p> : <p className="panel-copy">No remarks added.</p>}
                    <div className="button-row">
                      <button className="button-ghost" type="button" onClick={() => beginEdit(visit)} disabled={isRefreshing}>
                        Edit report
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="three-grid">
                      <div className="field">
                        <label>Stage of work</label>
                        <input
                          value={activeDraft.stageOfWork}
                          onChange={(event) =>
                            setDraft((current) => (current ? { ...current, stageOfWork: event.target.value } : current))
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Concrete grade</label>
                        <input
                          value={activeDraft.concreteGrade}
                          onChange={(event) =>
                            setDraft((current) => (current ? { ...current, concreteGrade: event.target.value } : current))
                          }
                        />
                      </div>
                      <div className="field">
                        <label>Quantity (CUM)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={activeDraft.quantityCum}
                          onChange={(event) =>
                            setDraft((current) => (current ? { ...current, quantityCum: event.target.value } : current))
                          }
                        />
                      </div>
                    </div>

                    <div className="three-grid">
                      <div className="field">
                        <label>Lead stage</label>
                        <select
                          value={activeDraft.leadStage}
                          onChange={(event) =>
                            setDraft((current) =>
                              current ? { ...current, leadStage: event.target.value as SiteVisit["leadStage"] } : current,
                            )
                          }
                        >
                          <option value="TALKS">Talks</option>
                          <option value="NEGOTIATING">Negotiating</option>
                          <option value="FINALIZED">Finalized</option>
                          <option value="MISSED">Missed</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Expected supply</label>
                        <select
                          value={activeDraft.expectedSupplyWindow}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    expectedSupplyWindow: event.target.value as ExpectedSupplyWindow | "",
                                  }
                                : current,
                            )
                          }
                        >
                          <option value="">Not set</option>
                          {EXPECTED_SUPPLY_OPTIONS.map((entry) => (
                            <option key={entry.value} value={entry.value}>
                              {entry.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label>Next follow-up</label>
                        <input
                          type="datetime-local"
                          value={activeDraft.nextFollowUpAt}
                          onChange={(event) =>
                            setDraft((current) => (current ? { ...current, nextFollowUpAt: event.target.value } : current))
                          }
                        />
                      </div>
                    </div>

                    <div className="field">
                      <label>Future scope / update</label>
                      <textarea
                        value={activeDraft.futureScope}
                        onChange={(event) =>
                          setDraft((current) => (current ? { ...current, futureScope: event.target.value } : current))
                        }
                      />
                    </div>

                    <div className="field">
                      <label>Remarks (includes transcript text)</label>
                      <textarea
                        value={activeDraft.remarksText}
                        onChange={(event) =>
                          setDraft((current) => (current ? { ...current, remarksText: event.target.value } : current))
                        }
                      />
                    </div>

                    <div className="button-row">
                      <button className="button-secondary" type="button" onClick={cancelEdit} disabled={isSaving || isRefreshing}>
                        Cancel
                      </button>
                      <button className="button" type="button" onClick={() => void saveEdit(visit.id)} disabled={isSaving || isRefreshing}>
                        {isSaving ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="note-box">No site visit report matched this search. Try the site name, lead ID, address, or stakeholder phone.</div>
      )}
      {feedback ? <div className="success-box">{feedback}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}
    </div>
  );
}
