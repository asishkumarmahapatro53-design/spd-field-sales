"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function DashboardAutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [lastSyncedAt, setLastSyncedAt] = useState(() => new Date());

  const refresh = useCallback(() => {
    if (document.visibilityState === "hidden") {
      return;
    }

    startTransition(() => {
      router.refresh();
    });
    setLastSyncedAt(new Date());
  }, [router, startTransition]);

  useEffect(() => {
    if (intervalMs <= 0) {
      return undefined;
    }

    const interval = window.setInterval(refresh, intervalMs);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [intervalMs, refresh]);

  return (
    <span className={`status-badge ${isPending ? "status-pending" : "status-open-good"}`}>
      {isPending ? "Syncing..." : `Auto sync ${lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
    </span>
  );
}
