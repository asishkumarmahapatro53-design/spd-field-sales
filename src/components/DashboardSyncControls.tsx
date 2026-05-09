"use client";

import Link from "next/link";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DashboardAutoRefresh } from "@/components/DashboardAutoRefresh";
import type { NotificationSummary, NotificationTone } from "@/lib/notifications";

function toneClass(tone: NotificationTone) {
  if (tone === "danger") {
    return "status-danger";
  }

  if (tone === "warning") {
    return "status-pending";
  }

  if (tone === "good") {
    return "status-approved";
  }

  return "status-manager_view";
}

function formatTime(value: string | null) {
  if (!value) {
    return "Not checked";
  }

  return new Date(value).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function DashboardSyncControls({
  autoRefreshIntervalMs,
  compact = false,
}: {
  autoRefreshIntervalMs: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState("");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();

  const checkNotifications = useCallback(async () => {
    setIsChecking(true);
    setError("");

    try {
      const response = await fetch("/api/notifications/summary", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error ?? "Notification check failed.");
      }

      setSummary(payload as NotificationSummary);
      setCheckedAt(new Date().toISOString());
      setPanelOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notification check failed.");
      setPanelOpen(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  const refreshPage = useCallback(() => {
    startRefreshTransition(() => {
      router.refresh();
    });
  }, [router, startRefreshTransition]);

  const total = summary?.total ?? 0;

  return (
    <div className={compact ? "dashboard-sync-controls is-compact" : "dashboard-sync-controls"}>
      {autoRefreshIntervalMs > 0 ? <DashboardAutoRefresh intervalMs={autoRefreshIntervalMs} /> : null}
      <div className="dashboard-sync-actions">
        <button className="sync-chip" type="button" onClick={checkNotifications} disabled={isChecking}>
          <span aria-hidden="true">!</span>
          {isChecking ? "Checking..." : "Notifications"}
          {summary ? <strong>{total}</strong> : null}
        </button>
        <button className="sync-chip sync-chip-primary" type="button" onClick={refreshPage} disabled={isRefreshing}>
          {isRefreshing ? "Refreshing this page..." : "Sync this page"}
        </button>
      </div>

      {panelOpen ? (
        <div className="notification-popover" role="dialog" aria-label="Scoped notification center">
          <div className="notification-popover-header">
            <div>
              <strong>Notification Center</strong>
              <span>Last check {formatTime(checkedAt)}</span>
            </div>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Close notifications">
              Close
            </button>
          </div>

          {error ? <div className="error-box">{error}</div> : null}

          {!error && summary ? (
            summary.sections.length ? (
              <div className="notification-list">
                {summary.sections.map((item) => (
                  <Link key={item.id} className="notification-row" href={item.href} onClick={() => setPanelOpen(false)}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <b className={`status-badge ${toneClass(item.tone)}`}>{item.count}</b>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="success-box">All caught up. No scoped updates need action right now.</div>
            )
          ) : null}

          <div className="notification-popover-footer">
            <button className="button-ghost" type="button" onClick={checkNotifications} disabled={isChecking}>
              Recheck
            </button>
            <button className="button" type="button" onClick={refreshPage} disabled={isRefreshing}>
              Sync current page
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
