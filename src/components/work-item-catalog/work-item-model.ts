/**
 * TKL-F1.3 · İş Kalemi Kataloğu — ekrandan bağımsız saf kurallar.
 * Kaynak: `projedesign/Katalog - İş Kalemleri.dc.html` (KIK) + TKL-F1-PLAN §1.2.
 * ÇEKİRDEK bölge: `earned-value` ithal edilmez (§2.7).
 */
import { toDecimalString } from "@/lib/decimal";
import { EMPTY_CELL, formatDateDots, formatFixedDecimal, toIstanbulDateOnly } from "@/lib/format";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

/** KIK:240 — fiyat bu günden eskiyse (`> 182`) tarih turuncu. */
export const PRICE_STALE_DAYS = 182;

const LOCALE = "tr-TR";
const MS_PER_DAY = 86_400_000;
const PRICE_DIGITS = 2;
const RATE_MIN_DIGITS = 2;
const RATE_MAX_DIGITS = 4;

export interface WorkItemFilter {
  query: string;
  /** null = "Tüm disiplinler". */
  disciplineId: string | null;
}

/** "KAB-0001" → ["KAB", 1]; ayraçsız/sayısız biçim → [tamamı, 0]. */
function pozParts(pozNo: string): [string, number] {
  const cut = pozNo.lastIndexOf("-");
  if (cut < 0) return [pozNo, 0];
  const sequence = Number(pozNo.slice(cut + 1));
  return [pozNo.slice(0, cut), Number.isFinite(sequence) ? sequence : 0];
}

/** KIK:247 — poz no'ya göre; 5 haneye taşan sıra (KAB-10000) sayısal sıralanır. */
export function sortByPozNo(items: readonly WorkItemRead[]): WorkItemRead[] {
  return [...items].sort((a, b) => {
    const [codeA, seqA] = pozParts(a.poz_no);
    const [codeB, seqB] = pozParts(b.poz_no);
    return codeA.localeCompare(codeB, LOCALE) || seqA - seqB || a.poz_no.localeCompare(b.poz_no, LOCALE);
  });
}

/** T47 — Bakanlık poz no'su ("15.100.1001"); yok/boş → null (alt satır basılmaz). */
export function sourceCodeLabel(item: Pick<WorkItemRead, "source_code">): string | null {
  const code = item.source_code?.trim();
  return code ? code : null;
}

/**
 * T47 — referans fiyatın kaynak tarihi alt satırı: kod VARSA "Bakanlık · 01.01.2026", kod yoksa
 * yalnız "01.01.2026", tarih yoksa null (satır basılmaz; kod tek başına bu satırı üretmez).
 */
export function refPriceDateLabel(item: Pick<WorkItemRead, "source_code" | "ref_price_date">): string | null {
  if (!item.ref_price_date) return null;
  const date = formatDateDots(item.ref_price_date);
  return sourceCodeLabel(item) === null ? date : `Bakanlık · ${date}`;
}

/** KIK:243-246 + T47 — `poz_no + Bakanlık no + tarif` içinde, tr-TR küçük harf, boşluk kırpılır. */
export function filterWorkItems(items: readonly WorkItemRead[], { query, disciplineId }: WorkItemFilter): WorkItemRead[] {
  const needle = query.trim().toLocaleLowerCase(LOCALE);
  return items.filter(
    (item) =>
      (disciplineId === null || item.discipline.id === disciplineId) &&
      (needle === "" ||
        `${item.poz_no} ${item.source_code ?? ""} ${item.name}`.toLocaleLowerCase(LOCALE).includes(needle)),
  );
}

/**
 * KIK:277 — çip sayaçları TÜM katalogdan, istemcide; henüz kaydedilmemiş yeni satırlar da
 * listenin parçasıdır (`extraDisciplineIds`: her yeni satırın disiplin kimliği).
 */
export function countByDiscipline(
  items: readonly WorkItemRead[],
  extraDisciplineIds: readonly string[] = [],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  const ids = [...items.map((item) => item.discipline.id), ...extraDisciplineIds];
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function dayNumber(isoDate: string): number {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

/** KIK:240 — İstanbul günü cinsinden `> 182` gün. Tarih yoksa (NULL) turuncu değil. */
export function isPriceStale(priceUpdatedAt: string | null, now: Date): boolean {
  if (priceUpdatedAt === null) return false;
  const age = dayNumber(toIstanbulDateOnly(now.toISOString())) - dayNumber(toIstanbulDateOnly(priceUpdatedAt));
  return age > PRICE_STALE_DAYS;
}

/** Ondalık metni kayıpsız yuvarlar ve tr-TR basar (binlik nokta, ondalık virgül). `Number()` YOK. */
const formatFixed = formatFixedDecimal;

/** KIK:253 `nf(ref,2)` — sabit 2 ondalık; fiyat yoksa EMPTY_CELL. */
export function formatPrice(value: string | null): string {
  const decimal = toDecimalString(value);
  return decimal === null ? EMPTY_CELL : formatFixed(decimal, PRICE_DIGITS);
}

/** TD `tl(v)` — `@/lib/format`ta tanımlı (teklif PDF'i de kullanır; sızıntı bekçisi `lib/format`a izin verir). */
export { formatMoneyTl } from "@/lib/format";

/**
 * Kuruşsuz tam sayı — TD `nf(v)` (= `toLocaleString('tr-TR', {maximumFractionDigits: 0})`, yarım SIFIRDAN
 * UZAĞA). Dize tabanlı (`Number()` yok, kayıpsız); null/boş → EMPTY_CELL. Teklif grup Σ a-s + toplam adam-saat.
 */
export function formatWholeNumber(value: string | null): string {
  const decimal = toDecimalString(value);
  return decimal === null ? EMPTY_CELL : formatFixed(decimal, 0);
}

/**
 * A-s / birim: en az 2, en çok 4 ondalık, sondaki sıfır atılır — backend 4 hane
 * tutar, gösterim kaybı yok (KIK `nf(as,2)` yalnız ≤2 haneli değerlerde birebir).
 */
export function formatStandardRate(value: string): string {
  const decimal = toDecimalString(value);
  if (decimal === null) return EMPTY_CELL;
  const full = formatFixed(decimal, RATE_MAX_DIGITS);
  const [whole = "", fraction = ""] = full.split(",");
  const trimmed = fraction.replace(/0+$/, "").padEnd(RATE_MIN_DIGITS, "0");
  return `${whole},${trimmed}`;
}

/** KIK:255 — "Fiyat güncelleme" GG.AA.YYYY; NULL → EMPTY_CELL. */
export function formatPriceUpdated(priceUpdatedAt: string | null): string {
  return priceUpdatedAt === null ? EMPTY_CELL : formatDateDots(toIstanbulDateOnly(priceUpdatedAt));
}

export interface TabCounts {
  items: number;
  disciplines: number;
  /** Katalogdaki FARKLI birim sayısı (S-K4 türevi). */
  units: number;
}

/** ÜS-9 — sekme sayaçları; "İçe aktarım geçmişi" sayaçsızdır. `newRowCount`: kaydedilmemiş yeni satırlar (KIK:279). */
export function tabCounts(
  items: readonly WorkItemRead[],
  disciplines: readonly WorkDisciplineRead[],
  newRowCount = 0,
): TabCounts {
  return {
    items: items.length + newRowCount,
    disciplines: disciplines.length,
    units: new Set(items.map((item) => item.uom)).size,
  };
}
