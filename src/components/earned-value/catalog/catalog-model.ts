/**
 * PLN-F1.5 · Birim Oran Kataloğu — ekrandan bağımsız saf kurallar.
 *
 * Kaynak: `projedesign/Planlama - Birim Oran Kataloğu.dc.html` (KAT) ve
 * PLANLAMA-SPEC §3.8 K4. Fark = (geçmiş ort. − standart) ÷ standart (KAT:227);
 * backend `diff_pct`i HAM 0–1 oran olarak döner (`catalog_service.diff_ratio`).
 *
 * K4: "büyük fark" eşiği SABİT ±%10 (istemci). K18/K27 ikizi olarak eşik,
 * GÖSTERİLEN (1 ondalıklı puan) değere uygulanır — rozet "+%10,0" yazıp
 * kırmızı boyanmaz.
 */
import { subtractDecimalStrings, divideDecimalStrings } from "@/lib/decimal";
import { compareDecimalStrings, roundHalfUp, toDecimalString, toPoints } from "@/lib/earned-value/decimal-input";
import type { EvNumber } from "@/lib/earned-value";
import type { EvCatalogItemRead } from "@/lib/api/models";
import { asFractionOrNull } from "@/lib/api/scale";
import { EMPTY_CELL } from "@/lib/format";

/** ±%10 fark bandı (K4 · KAT:449-450) — puan cinsinden, sınır NORMAL sayılır. */
export const DIFF_BAND_THRESHOLD_POINTS = "10";
const NEGATIVE_THRESHOLD_POINTS = `-${DIFF_BAND_THRESHOLD_POINTS}`;
/** Fark rozetinin gösterim basamağı (KAT:448 `nf(|d|, 1)`). */
const DIFF_DIGITS = 1;
/** Şantiye sapma oranı ara hassasiyeti (yalnız gösterime gider). */
const RATIO_SCALE = 6;
const MINUS_SIGN = "−";
const LOCALE = "tr-TR";

export type DiffBand = "over" | "under" | "normal" | "none";

/** 0–1 oranın gösterilen puanı ("13.9") ya da veri yoksa null. */
function shownPoints(ratio: EvNumber): string | null {
  return roundHalfUp(toPoints(asFractionOrNull(ratio)), DIFF_DIGITS);
}

/** KAT:446-451 — over (+%10 üstü, kırmızı) · under (−%10 altı, yeşil) · normal. */
export function diffBand(ratio: EvNumber): DiffBand {
  const shown = shownPoints(ratio);
  if (shown === null) return "none";
  if (compareDecimalStrings(shown, DIFF_BAND_THRESHOLD_POINTS) > 0) return "over";
  if (compareDecimalStrings(shown, NEGATIVE_THRESHOLD_POINTS) < 0) return "under";
  return "normal";
}

/** KAT:448 — "+%13,9" · "−%5,0" · yuvarlanınca sıfırsa "%0,0". */
export function formatDiffPercent(ratio: EvNumber): string {
  const shown = shownPoints(ratio);
  if (shown === null) return EMPTY_CELL;
  const magnitude = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: DIFF_DIGITS,
    maximumFractionDigits: DIFF_DIGITS,
  }).format(Math.abs(Number(shown)));
  const sign = Number(shown) === 0 ? "" : shown.startsWith("-") ? MINUS_SIGN : "+";
  return `${sign}%${magnitude}`;
}

/** KAT:488 — şantiye oranının standarttan farkı (0–1); standart 0 → null (§3.6). */
export function siteDeviationRatio(rate: EvNumber, standard: EvNumber): string | null {
  const r = toDecimalString(rate);
  const s = toDecimalString(standard);
  if (r === null || s === null) return null;
  return divideDecimalStrings(subtractDecimalStrings(r, s), s, RATIO_SCALE);
}

export function isBigDiff(item: EvCatalogItemRead): boolean {
  const band = diffBand(item.diff_pct);
  return band === "over" || band === "under";
}

export interface CatalogFilter {
  query: string;
  /** null = "Tüm disiplinler". */
  disciplineId: string | null;
  onlyBig: boolean;
}

/** KAT:484 — ad araması (TR harf duyarsız) · disiplin · yalnız büyük fark. */
export function filterCatalogItems(
  items: readonly EvCatalogItemRead[],
  { query, disciplineId, onlyBig }: CatalogFilter,
): EvCatalogItemRead[] {
  const needle = query.trim().toLocaleLowerCase(LOCALE);
  return items.filter(
    (item) =>
      (disciplineId === null || item.discipline.id === disciplineId) &&
      (needle === "" || item.name.toLocaleLowerCase(LOCALE).includes(needle)) &&
      (!onlyBig || isBigDiff(item)),
  );
}

export interface CatalogSummary {
  total: number;
  withActual: number;
  bigDiff: number;
  /** Gerçekleşeni besleyen TAMAMLANMIŞ şantiyelerin tekil sayısı (KAT:87). */
  completedSites: number;
}

/** KAT:84-87 üst çipleri. */
export function summarizeCatalog(items: readonly EvCatalogItemRead[]): CatalogSummary {
  const siteIds = new Set(items.flatMap((item) => item.actual.sites.map((site) => site.site_id)));
  return {
    total: items.length,
    withActual: items.filter((item) => item.actual.avg !== null).length,
    bigDiff: items.filter(isBigDiff).length,
    completedSites: siteIds.size,
  };
}

/** Disiplin açılır listesindeki sayılar (KAT:525) + disiplin "kullanımda" sinyali. */
export function countByDiscipline(items: readonly EvCatalogItemRead[]): Map<string, number> {
  return items.reduce(
    (acc, item) => new Map(acc).set(item.discipline.id, (acc.get(item.discipline.id) ?? 0) + 1),
    new Map<string, number>(),
  );
}

/** KAT:487 — ↺ yalnız ortalama varken ve gösterilen fark sıfır değilken. */
export function canAdoptActual(item: EvCatalogItemRead): boolean {
  if (item.actual.avg === null) return false;
  const shown = shownPoints(item.diff_pct);
  return shown !== null && Number(shown) !== 0;
}
