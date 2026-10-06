import type { PageKey } from "@/lib/api/models";
import type { MeResponse } from "@/lib/auth/types";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import {
  DISCIPLINES_EDIT,
  EV_BUDGET_EDIT,
  EV_DAILY_APPROVE,
  EV_FREEZE_APPROVE,
  EV_SETTINGS_EDIT,
  EMPLOYER_PAYMENT_EDIT,
  EV_VIEW,
  SITE_DIARY_EDIT,
  SITE_DIARY_VIEW_PAGES,
  UNIT_RATE_CATALOG_EDIT,
} from "@/lib/auth/page-gates";
import { meFixture } from "@/lib/auth/page-grants.testkit";

/** IZN-F6a.3 · hakediş-değeri (earned value) ekranlarının sayfa kümelerinin birleşimi. */
const EV_PAGE_KEYS: readonly PageKey[] = [
  ...new Set<PageKey>([
    ...EV_VIEW,
    ...EV_BUDGET_EDIT,
    ...EV_SETTINGS_EDIT,
    ...UNIT_RATE_CATALOG_EDIT,
    ...DISCIPLINES_EDIT,
    ...EV_FREEZE_APPROVE,
    ...EV_DAILY_APPROVE,
  ]),
];

const sessionCache = new Map<string, MeResponse>();

/**
 * Eski `earned_value` modül seviyesi niyetini (`none/view/draft/full/approve/admin`) sayfa izni oturumuna çevirir.
 * `admin` ayrıca sistem yöneticisidir (silme gibi `need:"sa"` akışları). `diaryLevel` verilirse günlük kayıt sayfaları
 * için de aynı seviye kurulur (günlük ilerleme uzantıları günlüğü yazabilmeyi de sorar). `null/undefined` = tam yetkili SA.
 * Aynı girdiye AYNI nesne döner (kimlik kararlılığı: `useSession` taklitleri her render'da yeni `me` üretmesin).
 */
export function evMe(level: string | null | undefined, diaryLevel?: string): MeResponse {
  const key = `${level ?? "-"}|${diaryLevel ?? "-"}`;
  const cached = sessionCache.get(key);
  if (cached) return cached;
  const me =
    level == null
      ? meFixture({ isSystemAdmin: true })
      : meFixture({
          pages: {
            ...levelPages(EV_PAGE_KEYS, level),
            ...(diaryLevel === undefined ? {} : levelPages([...SITE_DIARY_VIEW_PAGES, ...SITE_DIARY_EDIT], diaryLevel)),
          },
          isSystemAdmin: level === "admin",
        });
  sessionCache.set(key, me);
  return me;
}

const diaryCache = new Map<string, MeResponse>();

/**
 * Günlük ilerleme uzantıları için eski `{ site_diary, earned_value, progress_payments }` niyetini oturuma çevirir
 * (`evMe` + günlük kayıt sayfaları + hakediş oluşturma kapısı). Anahtar yoksa o küme hiç verilmez (kapı KAPALI).
 * Aynı girdiye AYNI nesne döner.
 */
export function evDiaryMe(permissions: Record<string, string>): MeResponse {
  const key = JSON.stringify(permissions);
  const cached = diaryCache.get(key);
  if (cached) return cached;
  const me = meFixture({
    pages: {
      ...levelPages(EV_PAGE_KEYS, permissions.earned_value),
      ...levelPages([...SITE_DIARY_VIEW_PAGES, ...SITE_DIARY_EDIT], permissions.site_diary),
      ...(permissions.progress_payments === undefined
        ? {}
        : levelPages(EMPLOYER_PAYMENT_EDIT, permissions.progress_payments)),
    },
    isSystemAdmin: permissions.earned_value === "admin",
  });
  diaryCache.set(key, me);
  return me;
}
