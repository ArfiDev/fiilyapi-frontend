"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Alert, Button } from "@/components/ui";
import { dismissFlashNotice, getFlashNotice, subscribeFlashNotice } from "./flash-notice";
import "./flash-notice.css";

/** Bildirim kendiliğinden kapanma süresi. */
const FLASH_AUTO_DISMISS_MS = 8000;

function serverSnapshot(): null {
  return null;
}

/**
 * SIL-F1.2 — kabuk düzeyinde başarı bildirimi (üst çubuğun altı).
 * Mockup'ı YOKTUR: `StaleBuildBanner` emsali `Alert` aynen kullanılır, yeni
 * renk/glif yok. Bildirim yokken DOM'a hiçbir şey girmez (görsel kareler
 * değişmez).
 */
export function FlashNoticeHost() {
  const notice = useSyncExternalStore(subscribeFlashNotice, getFlashNotice, serverSnapshot);
  const noticeId = notice?.id;

  useEffect(() => {
    if (noticeId === undefined) return;
    const timer = window.setTimeout(dismissFlashNotice, FLASH_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [noticeId]);

  if (!notice) return null;

  return (
    <Alert variant="success" role="status" className="flash-notice" data-testid="flash-notice">
      <span className="flash-notice__row">
        <span>{notice.message}</span>
        <Button variant="ghost" size="sm" onClick={dismissFlashNotice}>
          Kapat
        </Button>
      </span>
    </Alert>
  );
}
