// GLS-F1 GEÇİCİ — Geliştirme sayfası silinince bu klasör komple silinir.
import { routes } from "@/lib/routes";

/** Geliştirme sayfasını görebilen TEK rol (kozmetik gizlilik; veri pakette durur). */
export const GELISTIRME_ROLE_KEY = "system_admin";

export const GELISTIRME_NAV_LABEL = "Geliştirme";

export function gelistirmeHref(): string {
  return routes.development();
}

export function canSeeGelistirme(me: { role_key: string } | null | undefined): boolean {
  return me?.role_key === GELISTIRME_ROLE_KEY;
}
