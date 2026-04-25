import type { ReimbursementSummary } from "@/lib/types";

function renderValue(value: number | string | null) {
  return value ?? "-";
}

function getDisplayStatus(summary: ReimbursementSummary) {
  if (summary.status === "MANUAL_VERIFIED") {
    return { label: "Manager verified", badgeClass: "status-manual_verified" };
  }

  if (summary.status === "PENDING") {
    return { label: "Awaiting verification", badgeClass: "status-pending" };
  }

  return { label: "Verified by agent", badgeClass: "status-confirmed" };
}

export function ReimbursementSummaryList({ summaries }: { summaries: ReimbursementSummary[] }) {
  if (!summaries.length) {
    return <div className="note-box">No reimbursement summaries available yet.</div>;
  }

  return (
    <>
      <div className="mobile-only summary-card-list">
        {summaries.map((summary) => (
          <article key={`${summary.userId}-${summary.date}`} className="summary-card summary-card-compact">
            <div className="panel-header">
              <div>
                <h4>{summary.date}</h4>
                <p className="panel-copy">Daily reimbursement snapshot</p>
              </div>
              <span className={`status-badge ${getDisplayStatus(summary).badgeClass}`}>{getDisplayStatus(summary).label}</span>
            </div>
            <div className="summary-card-grid">
              <div className="summary-cell">
                <span className="summary-label">Start</span>
                <strong>{renderValue(summary.startReading)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">End</span>
                <strong>{renderValue(summary.endReading)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Distance</span>
                <strong>{renderValue(summary.totalDistance)}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Visits</span>
                <strong>{summary.totalSiteVisits}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Lunch</span>
                <strong>{summary.lunchAmount}</strong>
              </div>
              <div className="summary-cell">
                <span className="summary-label">Total</span>
                <strong>{renderValue(summary.totalAmount)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="desktop-only table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Start</th>
              <th>End</th>
              <th>Distance</th>
              <th>Visits</th>
              <th>Fuel</th>
              <th>Lunch</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={`${summary.userId}-${summary.date}`}>
                <td>{summary.date}</td>
                <td>{renderValue(summary.startReading)}</td>
                <td>{renderValue(summary.endReading)}</td>
                <td>{renderValue(summary.totalDistance)}</td>
                <td>{summary.totalSiteVisits}</td>
                <td>{renderValue(summary.fuelAmount)}</td>
                <td>{summary.lunchAmount}</td>
                <td>{renderValue(summary.totalAmount)}</td>
                <td>{getDisplayStatus(summary).label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
