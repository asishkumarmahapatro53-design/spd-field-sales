import { StatusBadge } from "@/components/StatusBadge";
import { toIndiaTimeLabel } from "@/lib/date";
import type { Lead } from "@/lib/types";

export function AgentLeadFocus({ leads, maxItems }: { leads: Lead[]; maxItems?: number }) {
  const visibleLeads = typeof maxItems === "number" ? leads.slice(0, maxItems) : leads;

  if (!visibleLeads.length) {
    return <div className="note-box">No site leads yet. Your first site visit will create one.</div>;
  }

  return (
    <div className="data-list">
      {visibleLeads.map((lead) => (
        <div key={lead.id} className="data-row">
          <div className="panel-header">
            <h4>{lead.siteName}</h4>
            <StatusBadge value={lead.stage} />
          </div>
          <p>{lead.siteAddress}</p>
          <div className="row-meta">
            <span>Score {lead.score}/10</span>
            <span>Follow-up {toIndiaTimeLabel(lead.nextFollowUpAt)}</span>
            <span>Supplier {lead.currentSupplier}</span>
            <span>
              {lead.siteCount ?? 1} site{(lead.siteCount ?? 1) === 1 ? "" : "s"}
            </span>
          </div>
          {lead.primarySiteLatLng ? (
            <div className="button-row">
              <a
                className="button-ghost"
                href={`https://www.google.com/maps/dir/?api=1&destination=${lead.primarySiteLatLng.lat},${lead.primarySiteLatLng.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Get direction
              </a>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
