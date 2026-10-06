import type { MeResponse } from "@/lib/auth/types";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { EMPLOYER_PAYMENT_EDIT, SITE_DIARY_EDIT, SITE_DIARY_VIEW_PAGES } from "@/lib/auth/page-gates";
import { meFixture } from "@/lib/auth/page-grants.testkit";

/**
 * IZN-F6a.3 · eski `{ site_diary, progress_payments }` modül seviyesi niyetini sayfa izni oturumuna çevirir.
 * site_diary: none/view/full(Düzenler)/admin(Düzenler + Onaylar: Kilidi Aç). progress_payments: hakediş oluşturma kapısı
 * (`view` → oluşturamaz; `full`/`draft`/… → oluşturur). Anahtar yoksa o küme hiç verilmez (kapı KAPALI).
 * `undefined` = tam yetkili (SA olmayan) oturum.
 */
export function diaryMe(permissions?: Record<string, string>): MeResponse {
  if (permissions === undefined) return meFixture();
  return meFixture({
    pages: {
      ...levelPages([...SITE_DIARY_VIEW_PAGES, ...SITE_DIARY_EDIT], permissions.site_diary),
      ...(permissions.progress_payments === undefined
        ? {}
        : levelPages(EMPLOYER_PAYMENT_EDIT, permissions.progress_payments)),
    },
  });
}
