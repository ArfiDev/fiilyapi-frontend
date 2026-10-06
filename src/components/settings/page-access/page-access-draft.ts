import type { HiddenCategory, PageGrant, PageLevel, RolePagesResponse, RolePagesUpdate } from "@/lib/api/models";
import { HIDDEN_CATEGORIES } from "./page-access-labels";

/**
 * Sayfa İzinleri taslağı: rolün 100 sayfalık matrisi + gizli alan kümesi.
 * Tüm yardımcılar SAFTIR — girdiyi değiştirmez, yeni nesne döner.
 */
export interface AccessDraft {
  readonly pages: Readonly<Record<string, PageGrant>>;
  readonly hidden: readonly HiddenCategory[];
}

export function draftFromResponse(response: Pick<RolePagesResponse, "pages" | "hidden_fields">): AccessDraft {
  return { pages: { ...response.pages }, hidden: [...response.hidden_fields] };
}

function withGrant(draft: AccessDraft, key: string, grant: PageGrant): AccessDraft {
  return { ...draft, pages: { ...draft.pages, [key]: grant } };
}

/** Düzey değişir; "Görmez"e geçen sayfanın onayı KAPANIR (backend: Görmez'de onay yok → 422). */
export function withLevel(draft: AccessDraft, key: string, level: PageLevel): AccessDraft {
  const current = draft.pages[key];
  if (!current || current.level === level) return draft;
  return withGrant(draft, key, { level, approve: level === "none" ? false : current.approve });
}

/** Onay kutucuğu; yalnız Görmez olmayan sayfada işler (çağıran `has_approval` denetler). */
export function withApprove(draft: AccessDraft, key: string, approve: boolean): AccessDraft {
  const current = draft.pages[key];
  if (!current || current.level === "none" || current.approve === approve) return draft;
  return withGrant(draft, key, { level: current.level, approve });
}

/** Grup başlığındaki "tümü:" seçici — grubun TÜM sayfalarını aynı düzeye çeker. */
export function withGroupLevel(draft: AccessDraft, keys: readonly string[], level: PageLevel): AccessDraft {
  return keys.reduce((acc, key) => withLevel(acc, key, level), draft);
}

export function withHiddenToggled(draft: AccessDraft, category: HiddenCategory): AccessDraft {
  const next = draft.hidden.includes(category)
    ? draft.hidden.filter((item) => item !== category)
    : [...draft.hidden, category];
  return { ...draft, hidden: next };
}

function sameGrant(a: PageGrant | undefined, b: PageGrant | undefined): boolean {
  return a?.level === b?.level && a?.approve === b?.approve;
}

/** Tabana göre farklı sayfa anahtarları. */
export function changedPageKeys(baseline: AccessDraft, draft: AccessDraft): string[] {
  return Object.keys(draft.pages).filter((key) => !sameGrant(baseline.pages[key], draft.pages[key]));
}

/** Tabana göre eklenen/çıkarılan gizli alan kategorileri. */
export function changedHiddenCategories(baseline: AccessDraft, draft: AccessDraft): HiddenCategory[] {
  return HIDDEN_CATEGORIES.map((info) => info.key).filter(
    (key) => baseline.hidden.includes(key) !== draft.hidden.includes(key),
  );
}

/** "N kaydedilmemiş değişiklik" sayacı: değişen sayfa + değişen hassas alan. */
export function countChanges(baseline: AccessDraft, draft: AccessDraft): number {
  return changedPageKeys(baseline, draft).length + changedHiddenCategories(baseline, draft).length;
}

/** `PUT /roles/{id}/pages` gövdesi: 100 anahtarın HEPSİ (tam matris) + gizli alan kümesi. */
export function toUpdateBody(draft: AccessDraft): RolePagesUpdate {
  const pages: Record<string, PageGrant> = {};
  for (const [key, grant] of Object.entries(draft.pages)) pages[key] = { level: grant.level, approve: grant.approve };
  const hidden_fields = HIDDEN_CATEGORIES.map((info) => info.key).filter((key) => draft.hidden.includes(key));
  return { pages, hidden_fields };
}

