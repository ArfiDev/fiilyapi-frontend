import { normalizeDecimalInput } from "@/lib/decimal";
import { EMPTY_CELL } from "@/lib/format";
import { roundHalfUp } from "@/lib/earned-value/decimal-input";
import type { EvFillFromContractOut } from "@/lib/api/hooks/useEvBudgetMutations";
import type { EvBudgetView, EvFillOut } from "@/lib/api/models";

/**
 * PLN-F1.6 · Adam-Saat Bütçesi ekranına ÖZGÜ sayı/etiket biçimleri. Ortak
 * EV biçimleri (`formatPercent01`, `formatUnitRate`) `@/lib/earned-value`
 * içindedir; buradakiler yalnız bu ekranın mockup yardımcılarının karşılığıdır
 * (Adam-Saat Bütçesi.dc.html:517-519 `nf`/`num`/`fr`, :681 `dstr`).
 */

type LeafOut = EvBudgetView["disciplines"][number]["groups"][number]["items"][number]["leaves"][number];

const LOCALE = "tr-TR";
const MINUS_SIGN = "−";
const RATE_MIN_DIGITS = 2;

function groupInteger(rounded: string): string {
  const negative = rounded.startsWith("-");
  const digits = negative ? rounded.slice(1) : rounded;
  const text = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(Number(digits));
  return negative && Number(digits) !== 0 ? `${MINUS_SIGN}${text}` : text;
}

/** Adam-saat: tam sayı, binlik ayraçlı — "27.626" (BÜT:517 `nf(v)`), ROUND_HALF_UP. */
export function formatMhr(value: string | number | null | undefined): string {
  const rounded = roundHalfUp(value, 0);
  return rounded === null ? EMPTY_CELL : groupInteger(rounded);
}

/** İşaretli adam-saat farkı — "+126" · "−114" · "0" (BÜT:586 `bd`). */
export function formatSignedMhr(value: string | number | null | undefined): string {
  const rounded = roundHalfUp(value, 0);
  if (rounded === null) return EMPTY_CELL;
  if (Number(rounded) === 0) return "0";
  const text = groupInteger(rounded);
  return rounded.startsWith("-") ? text : `+${text}`;
}

/**
 * Oran hücresinin METNİ (BÜT:519 `fr` = 2 ondalık). Backend Decimal'i sondaki
 * sıfırlarla döner ("1.800000"): en az 2 ondalık gösterilir, fazlası (0,125)
 * korunur — kullanıcının girdiği hassasiyet yuvarlanıp kaybolmaz.
 */
export function formatRateInput(value: string | null | undefined): string {
  if (value === null || value === undefined || value.trim() === "") return "";
  const [integer, fraction = ""] = value.trim().split(".");
  const trimmed = fraction.replace(/0+$/, "").padEnd(RATE_MIN_DIGITS, "0");
  return `${integer},${trimmed}`;
}

export type RateInput = { kind: "value"; value: string } | { kind: "empty" } | { kind: "invalid" };

/** Oran girişi: boş = oranı sil (`unit_mhr: null`), negatif/anlamsız = reddet. */
export function parseRateInput(raw: string): RateInput {
  if (raw.trim() === "") return { kind: "empty" };
  const normalized = normalizeDecimalInput(raw);
  if (normalized === null || normalized.startsWith("-")) return { kind: "invalid" };
  return { kind: "value", value: normalized };
}

/** F0-6: bölümsüz yaprak doğrudansa "Bölümsüz", dolaylıysa "Tüm şantiye" (aynı veri). */
export function leafLabel(leaf: Pick<LeafOut, "section_name" | "is_direct">): string {
  if (leaf.section_name) return leaf.section_name;
  return leaf.is_direct ? "Bölümsüz" : "Tüm şantiye";
}

/** ISO → "06.05.26" (BÜT:681 `dstr`). `new Date` KULLANILMAZ (UTC kayması). */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return EMPTY_CELL;
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}.${month}.${year.slice(2)}`;
}

/** Yerel (TR) bugünün ISO tarihi — Gantt/S-eğrisi "bugün" çizgisi (BÜT:292). */
export function localTodayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const VOWEL_HARMONY: Record<string, string> = { a: "ı", ı: "ı", e: "i", i: "i", o: "u", u: "u", ö: "ü", ü: "ü" };

/**
 * Özel adın tamlayan eki, kesme işaretiyle: "Peyzaj'ın" · "Elektrik'in" ·
 * "Duvar & Sıva'nın" (Ek Formlar M4 alt satırı). Son ünlü uyumu; ünlüyle
 * biten ada kaynaştırma "n".
 */
export function genitive(name: string): string {
  const lower = name.trim().toLocaleLowerCase("tr-TR");
  const vowels = [...lower].filter((ch) => ch in VOWEL_HARMONY);
  const last = vowels.at(-1);
  if (last === undefined) return `${name}'in`;
  const endsWithVowel = lower.at(-1)! in VOWEL_HARMONY;
  return `${name.trim()}'${endsWithVowel ? "n" : ""}${VOWEL_HARMONY[last]}n`;
}

/**
 * "Katalogdan öner (tümü)" sonuç bildirimi (BÜT:667 + B1-4). Belirsiz eşleşme
 * varsa kullanıcı nereye bakacağını bilsin diye yönlendirme eklenir (CEO p) —
 * sayı yetim kalmaz.
 */
export function fillMessage(out: EvFillOut): string {
  if (out.filled_leaf_count === 0 && out.ambiguous_count === 0 && out.unmatched_count === 0) {
    return "Boş oran yok · mevcut oranlar korunuyor";
  }
  const parts = [`${out.filled_leaf_count} boş satır katalogdan dolduruldu`];
  if (out.ambiguous_count > 0) parts.push(`${out.ambiguous_count} kalemde eşleşme belirsiz`);
  if (out.unmatched_count > 0) parts.push(`${out.unmatched_count} kalemde katalog eşleşmesi yok`);
  // Yönlendirme EN SONDA: belirsiz sayısını açıklar, eşleşmesiz sayısının arasına girmez.
  if (out.ambiguous_count > 0) parts.push("ayrıntı için oran hücresindeki önerilere bakın");
  return parts.join(" · ");
}

/**
 * TKL-F5.5 · "Sözleşmeden doldur" sonuç bandı (ÜS-F5-24): "{n} satır sözleşmeden dolduruldu" + sunucu uyarı
 * metinleri AYNEN (" · " ile). `n` = bu çağrının yazdığı oran satırı (`filled_leaf_count`).
 */
export function fillFromContractMessage(out: Pick<EvFillFromContractOut, "filled_leaf_count" | "warnings">): string {
  return [`${out.filled_leaf_count} satır sözleşmeden dolduruldu`, ...out.warnings.map((warning) => warning.message)].join(" · ");
}
