"use client";

/**
 * SEKME-F1.4a · Ctrl/Cmd+tık ve orta tık → ARKA PLANDA yeni çalışma sekmesi.
 *
 * KARARLAR §1.10 (4) + ek kararlar: sayfa içi bağlantılar aynı sekmede
 * ilerler, Ctrl/Cmd+tık ve orta tık yeni sekmeyi ARKA PLANDA açar (aktif
 * sekme değişmez, onay modalı yok). Depoda `next/link` kullanan yüzlerce
 * bağlantı var; tek tek düzeltilmez — belgeye TEK bir yakalayıcı kurulur.
 *
 * ─── Neden capture fazı ───────────────────────────────────────────────────
 * React olay dinleyicileri kök kapsayıcıdadır; belge düzeyi capture dinleyici
 * ondan ÖNCE koşar. `preventDefault` burada çağrılınca `next/link`in kendi
 * `onClick`i `e.defaultPrevented`i görür ve GEZİNMEZ (ölçüldü:
 * `node_modules/next/dist/client/app-dir/link.js` satır 310; ayrıca
 * `isModifiedEvent` meta/ctrl/orta tıkta zaten gezinmez, satır 47-58).
 * Yani çakışma yok: ne Link gezinir ne tarayıcı kendi sekmesini açar.
 *
 * Sağ tık → "Yeni sekmede aç" (tarayıcı menüsü) ELLENMEZ: `contextmenu`
 * dinlenmez, `auxclick` yalnız button 1'de ele alınır.
 */
import { useEffect, useRef } from "react";

import { isSafeInternalUrl } from "@/lib/workspace-tabs/url-safety";

/** Bu özniteliği taşıyan bir atanın içindeki bağlantılar yakalanmaz. */
export const WORKSPACE_TABS_IGNORE_ATTR = "data-workspace-tabs-ignore";

const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;
/** BFF/indirme uçları — bir sayfa değil, sekme olamaz. */
const API_PATH_PREFIX = "/api/";

export interface TabLinkCaptureOptions {
  /** Oturum bağlanmadan (mağaza kullanıcıya iliştirilmeden) yakalama YAPILMAZ. */
  readonly enabled: boolean;
  readonly onOpenInBackground: (url: string) => void;
}

/** Olay, "arka planda yeni sekme" hareketi mi. */
export function isBackgroundOpenGesture(event: MouseEvent): boolean {
  if (event.type === "click") {
    return event.button === PRIMARY_BUTTON && (event.metaKey || event.ctrlKey);
  }
  if (event.type === "auxclick" || event.type === "mousedown") {
    return event.button === MIDDLE_BUTTON;
  }
  return false;
}

function hasForeignTarget(anchor: Element): boolean {
  const target = anchor.getAttribute("target");
  return target !== null && target !== "" && target !== "_self";
}

/**
 * Olayın hedefindeki bağlantıdan sekme url'si (pathname + search, çapa YOK).
 *
 * `anchor.href` tarayıcının ÇÖZDÜĞÜ mutlak adrestir: göreli yol, `..` ve
 * ASCII-dışı karakterler zaten kodlanmış gelir — `isSafeInternalUrl` ham
 * ASCII-dışı url'yi reddettiği için KODLANMIŞ hâl şarttır.
 */
export function tabUrlForAnchorEvent(event: MouseEvent, origin: string): string | null {
  const start = event.target;
  if (!(start instanceof Element)) return null;
  const anchor = start.closest("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.closest(`[${WORKSPACE_TABS_IGNORE_ATTR}]`) !== null) return null;
  if (hasForeignTarget(anchor) || anchor.hasAttribute("download")) return null;

  let resolved: URL;
  try {
    resolved = new URL(anchor.href);
  } catch {
    return null;
  }
  if (resolved.origin !== origin) return null;
  if (resolved.pathname.startsWith(API_PATH_PREFIX)) return null;
  const url = resolved.pathname + resolved.search;
  return isSafeInternalUrl(url) ? url : null;
}

export function useTabLinkCapture({ enabled, onOpenInBackground }: TabLinkCaptureOptions): void {
  // Geri çağırım her render'da değişebilir; dinleyici yeniden kurulmasın diye ref.
  const callbackRef = useRef(onOpenInBackground);
  useEffect(() => {
    callbackRef.current = onOpenInBackground;
  }, [onOpenInBackground]);

  useEffect(() => {
    if (!enabled) return;

    function handle(event: MouseEvent): void {
      if (event.defaultPrevented || !isBackgroundOpenGesture(event)) return;
      const url = tabUrlForAnchorEvent(event, window.location.origin);
      if (url === null) return;
      event.preventDefault();
      // mousedown yalnız orta tuşun otomatik kaydırmasını bastırır; açılış
      // TEK yerde (auxclick) olur, yoksa aynı tık iki sekme açardı.
      if (event.type === "mousedown") return;
      callbackRef.current(url);
    }

    const types = ["click", "auxclick", "mousedown"] as const;
    for (const type of types) document.addEventListener(type, handle, true);
    return () => {
      for (const type of types) document.removeEventListener(type, handle, true);
    };
  }, [enabled]);
}
