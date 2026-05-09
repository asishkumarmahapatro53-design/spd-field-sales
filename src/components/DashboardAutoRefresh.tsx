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
    return () => {
      window.clearInterval(interval);
    };
  }, [intervalMs, refresh]);

  return (
    <span className={`status-badge ${isPending ? "status-pending" : "status-open-good"}`}>
      {isPending ? "Safety sync..." : `Safety sync ${lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
    </span>
  );
}
