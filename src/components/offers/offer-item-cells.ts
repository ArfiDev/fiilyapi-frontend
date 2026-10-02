/**
 * TKL-F3.6 · teklif kalem tablosunun HÜCRE okuma + gövde kurucusu (SAF; React'sız, ayrı test edilir).
 * Plan §3.2 "alan → gövde" tablosu BİREBİR burada yaşar; bileşenler yalnız çağırır.
 *
 * 🔴 T30 (para/miktar/yüzde yazımı — TEK kural `lib/tr-decimal`): nokta binlik, virgül ondalık, belirsiz "28.5"
 * KAYDEDİLMEZ. Sonuç kayıpsız ondalık METİNdir; `Number()` YOK. Hesap (tutar/toplam/türev kâr) SUNUCUDADIR
 * (`calc.py`, ÜS-F3-1): bu modül yalnız gösterir ve gövdeyi kurar.
 *
 * 🔶 `quantity` null olabilir: miktarsız kalem (SO-21) YA DA `finance` maskesi. Okuma/gövde yolu null'u taşır: miktar
 * hücresi boş, tutar "—"; ayrımın TEK karar noktası sunucunun `quantified` bayrağı (`isQuantityMissing`, F4.2b).
 */
import { trPriceInputValue, trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import type { OfferItemUpdateBody } from "@/lib/api/hooks/useOfferMutations";
import type { OfferItemRead } from "@/lib/api/hooks/useOffers";
import { compareDecimalStrings, isZeroDecimalString } from "@/lib/decimal";
import { EMPTY_CELL } from "@/lib/format";
import {
  OFFER_MHR_LIMITS,
  OFFER_PRICE_LIMITS,
  OFFER_QUANTITY_LIMITS,
  fractionLimitMessage,
  maxLimitMessage,
  type DecimalLimits,
} from "@/lib/offer-limits";
import {
  REF_PRICE_AMBIGUOUS_DOT,
  decimalDigitCounts,
  parseQuantityInput,
  parseRefPriceInput,
  type TrDecimalParse,
} from "@/lib/tr-decimal";
import { formatMoneyTl } from "@/components/work-item-catalog/work-item-model";

import { parseOverheadPct, parseProfitPct, type PctParse } from "./offer-form";

export type OfferItem = OfferItemRead;
export type ItemCellField = "quantity" | "unitMhr" | "costUnitPrice" | "overheadPct" | "profitPct" | "offerUnitPrice";

export interface CellContext {
  item: OfferItem;
  /** Revizyon geneli GG % ("12.00"): kalem değeri null iken gösterilen/uygulanan. */
  revisionOverheadPct: string;
  /** Revizyon geneli kâr % ("15.00"). */
  revisionProfitPct: string;
  /** Katalogdaki standart a-s (`standard_unit_mhr`); katalogda bulunamayan kalemde null (karşılaştırma yok). */
  catalogUnitMhr: string | null;
}

export type CellCommit =
  | { kind: "noop" }
  | { kind: "error"; message: string }
  | { kind: "patch"; body: OfferItemUpdateBody };

export type CellTone = "general" | "override" | "missing";

/** Hane sınırları `lib/offer-limits` TEK KAYNAĞINDAN (katalog seçicisinin teklif hedefiyle ortak); yüzde 2 kesir. */
const QUANTITY_LIMITS = OFFER_QUANTITY_LIMITS;
const MHR_LIMITS = OFFER_MHR_LIMITS;
const PRICE_LIMITS = OFFER_PRICE_LIMITS;

export const MSG_CLEAR_OFFER_FIRST = "Önce teklif B.F.'yi temizleyin";

const LABEL: Readonly<Record<ItemCellField, string>> = {
  quantity: "Miktar",
  unitMhr: "A-s",
  costUnitPrice: "Maliyet B.F.",
  overheadPct: "Gider %",
  profitPct: "Kâr %",
  offerUnitPrice: "Teklif B.F.",
};

/** SO-24: dolu miktar boşaltılamaz (sunucu `quantity:null` 422); boş kalem boş kalırsa istek zaten uçmaz. */
export const MSG_QUANTITY_NOT_CLEARABLE = "Miktar boşaltılamaz";
export const MSG_COST_FIRST = "Önce maliyet girin";

// ───────────────────────────────────────────────────────────────────────── gösterim

/**
 * T30 gösterimi İŞARETLİ değer için: `trInputValue` yalnız işaretsiz ondalığı Türkçeleştirir ("-5.00" → olduğu
 * gibi, noktalı). Türev kâr negatif olabilir (B.F. maliyetin altında): işaret ayrılır, kalan T30 biçimlenir.
 * ASCII "-" kalır — hücre aynen geri yazılınca `parseBounded`/`commitProfit` aynı metni okur.
 */
function signedDisplay(raw: string | null, format: (unsigned: string | null) => string): string {
  if (raw === null) return "";
  const trimmed = raw.trim();
  return trimmed.startsWith("-") ? `-${format(trimmed.slice(1))}` : format(trimmed);
}

/** Hücrede GÖSTERİLEN metin (kayıt kararı bununla kıyaslanır). */
export function cellText(field: ItemCellField, ctx: CellContext): string {
  const { item } = ctx;
  switch (field) {
    case "quantity":
      return trQuantityInputValue(item.quantity);
    case "unitMhr":
      return trPriceInputValue(item.unit_mhr);
    case "costUnitPrice":
      return trPriceInputValue(item.cost_unit_price);
    case "overheadPct":
      return trQuantityInputValue(item.overhead_pct ?? ctx.revisionOverheadPct);
    case "profitPct":
      return signedDisplay(profitPctShown(ctx), trQuantityInputValue);
    case "offerUnitPrice":
      return trPriceInputValue(item.customer?.unit_price ?? null);
  }
}

/** Elle B.F. varken kâr % TÜREVdir (`internal.profit_pct`, c=0 → null); yoksa kalem → genel. */
function profitPctShown(ctx: CellContext): string | null {
  const { item } = ctx;
  if (item.offer_unit_price !== null) return item.internal.profit_pct;
  return item.profit_pct ?? ctx.revisionProfitPct;
}

/** Teklif B.F. YALNIZ maliyet doluyken yazılabilir (SO-4: elle B.F. kâr % geri hesabı için maliyet ister). */
export function isOfferPriceEnabled(item: OfferItem): boolean {
  return item.cost_unit_price !== null;
}

/** Sunucunun `priced` bayrağı: maskeli (limited) rolde maliyet null ama kalem FİYATLIdır. */
export function isUnpriced(item: OfferItem): boolean {
  return !item.priced;
}

/**
 * TKL-F4.2b · miktar eksikliğinin TEK karar noktası: sunucunun `quantified` bayrağı (`kimlik` kovası — maskelenmez).
 * 🔴 `finance` kapsamında `quantity` MASKELİ null döner ama `quantified` doğru kalır; salt `quantity === null` her kalemi
 * "miktarsız" sanardı, sayaç-eşitlik sezgiseli de karışık grupta yanılırdı.
 */
export function isQuantityMissing(item: OfferItem): boolean {
  return !item.quantified;
}

/** "₺1.288,00" ya da "—" (fiyatsız / maskeli / B5 miktarsız kalem). */
export function amountText(item: OfferItem): string {
  const amount = item.customer?.amount ?? null;
  return formatMoneyTl(amount);
}

export function cellTone(field: ItemCellField, ctx: CellContext): CellTone {
  const { item } = ctx;
  switch (field) {
    case "overheadPct":
      return item.overhead_pct !== null ? "override" : "general";
    case "profitPct":
      return item.profit_pct !== null || item.offer_unit_price !== null ? "override" : "general";
    case "offerUnitPrice":
      return item.offer_unit_price !== null ? "override" : "general";
    case "unitMhr":
      return isMhrOverridden(item, ctx.catalogUnitMhr) ? "override" : "general";
    case "costUnitPrice":
      return isUnpriced(item) ? "missing" : "general";
    case "quantity":
      return "general";
  }
}

function isMhrOverridden(item: OfferItem, catalogUnitMhr: string | null): boolean {
  return catalogUnitMhr !== null && compareDecimalStrings(item.unit_mhr, catalogUnitMhr) !== 0;
}

/** Elle B.F.'nin türev kâr %'si ("%33,93" · "%-5,00"); maliyet 0 iken türev YOK → "—" (sarkık "%" basılmaz). */
function derivedProfitText(ctx: CellContext): string {
  const derived = profitPctShown(ctx);
  return derived === null ? EMPTY_CELL : `%${signedDisplay(derived, trPriceInputValue)}`;
}

/** Teklif B.F. alt satırı (TD:380). */
export function offerPriceHint(ctx: CellContext): string {
  const { item } = ctx;
  if (!isOfferPriceEnabled(item)) return "önce maliyet girin";
  if (item.offer_unit_price !== null) return `elle · kâr ${derivedProfitText(ctx)}`;
  return "hesaplanan";
}

// ───────────────────────────────────────────────────────────────────────── yazma

type ParsedValue = { ok: true; value: string } | { ok: false; message: string };

function parseBounded(
  text: string,
  field: ItemCellField,
  parse: (raw: string) => TrDecimalParse,
  limits: DecimalLimits,
  mustBePositive: boolean,
): ParsedValue {
  const label = LABEL[field];
  const isNegative = text.startsWith("-");
  const parsed = parse(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return { ok: false, message: REF_PRICE_AMBIGUOUS_DOT };
  if (parsed.kind === "invalid") return { ok: false, message: `${label} sayı olmalıdır.` };
  if (isNegative) {
    return { ok: false, message: mustBePositive ? `${label} 0'dan büyük olmalı` : `${label} negatif olamaz.` };
  }
  if (decimalDigitCounts(parsed.value).fraction > limits.fraction) {
    return { ok: false, message: fractionLimitMessage(limits) };
  }
  if (compareDecimalStrings(parsed.value, limits.max) > 0) {
    return { ok: false, message: maxLimitMessage(limits) };
  }
  if (mustBePositive && isZeroDecimalString(parsed.value)) {
    return { ok: false, message: `${label} 0'dan büyük olmalı` };
  }
  return { ok: true, value: parsed.value };
}

/** Oran ayrıştırıcıları `offer-form.ts`te TEK kaynak (T30); burada yalnız sonuç biçimi çevrilir. */
function pctResult(parsed: PctParse): ParsedValue {
  return "error" in parsed ? { ok: false, message: parsed.error } : { ok: true, value: parsed.value };
}

function sameNumber(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return compareDecimalStrings(a, b) === 0;
}

/**
 * Tek hücrenin kaydetme kararı. `draft` kullanıcının yazdığı HAM metin (dokunulmadıysa `undefined`).
 * `noop`: istek UÇMAZ · `error`: korkuluk ihlali, istek UÇMAZ · `patch`: kısmi gövde (yalnız ilgili alanlar).
 */
export function commitCell(field: ItemCellField, draft: string | undefined, ctx: CellContext): CellCommit {
  if (draft === undefined) return { kind: "noop" };
  const text = draft.trim();
  if (text === cellText(field, ctx)) return { kind: "noop" };
  switch (field) {
    case "quantity":
      return commitRequired(field, text, "quantity", parseBounded(text, field, parseQuantityInput, QUANTITY_LIMITS, true), ctx);
    case "unitMhr":
      return commitRequired(field, text, "unit_mhr", parseBounded(text, field, parseQuantityInput, MHR_LIMITS, true), ctx);
    case "costUnitPrice":
      return commitCost(text, ctx);
    case "overheadPct":
      return commitOverhead(text, ctx);
    case "profitPct":
      return commitProfit(text, ctx);
    case "offerUnitPrice":
      return commitOfferPrice(text, ctx);
  }
}

function parsePrice(text: string, field: ItemCellField): ParsedValue {
  return parseBounded(text, field, parseRefPriceInput, PRICE_LIMITS, false);
}

function currentValue(field: "quantity" | "unit_mhr", item: OfferItem): string | null {
  return field === "quantity" ? item.quantity : item.unit_mhr;
}

/** Miktar ve a-s ZORUNLUdur (backend `> 0`, açık null 422): boş → "girin". */
function commitRequired(
  field: ItemCellField,
  text: string,
  key: "quantity" | "unit_mhr",
  parsed: ParsedValue,
  ctx: CellContext,
): CellCommit {
  if (text === "") return { kind: "error", message: key === "quantity" ? MSG_QUANTITY_NOT_CLEARABLE : `${LABEL[field]} girin` };
  if (!parsed.ok) return { kind: "error", message: parsed.message };
  if (sameNumber(parsed.value, currentValue(key, ctx.item))) return { kind: "noop" };
  return { kind: "patch", body: { [key]: parsed.value } };
}

/** Boş = temizle (açık null); kayıtta zaten boşsa istek UÇMAZ; aynı sayı noop. */
function commitNullable(
  text: string,
  stored: string | null,
  parsed: ParsedValue,
  body: (value: string | null) => OfferItemUpdateBody,
): CellCommit {
  if (text === "") return stored === null ? { kind: "noop" } : { kind: "patch", body: body(null) };
  if (!parsed.ok) return { kind: "error", message: parsed.message };
  if (sameNumber(parsed.value, stored)) return { kind: "noop" };
  return { kind: "patch", body: body(parsed.value) };
}

/**
 * 🔴 SO-4 TERS YÖN: elle teklif B.F. varken maliyeti SİLMEK backend'de 422'dir (kâr % geri hesabı maliyet ister);
 * istek uçmadan engellenir. Maliyet zaten boşsa (kayıtta) noop; değiştirmek serbesttir.
 */
function commitCost(text: string, ctx: CellContext): CellCommit {
  const { item } = ctx;
  if (text === "" && item.cost_unit_price !== null && item.offer_unit_price !== null) {
    return { kind: "error", message: MSG_CLEAR_OFFER_FIRST };
  }
  return commitNullable(text, item.cost_unit_price, parsePrice(text, "costUnitPrice"), (value) => ({ cost_unit_price: value }));
}

function commitOverhead(text: string, ctx: CellContext): CellCommit {
  const { item } = ctx;
  const parsed = text === "" ? null : pctResult(parseOverheadPct(text));
  // Genel değerin AYNISI yazılırsa kalemde null kalır (override'a çevrilmez).
  if (parsed?.ok === true && item.overhead_pct === null && sameNumber(parsed.value, ctx.revisionOverheadPct)) {
    return { kind: "noop" };
  }
  return commitNullable(text, item.overhead_pct, parsed ?? { ok: true, value: "" }, (value) => ({ overhead_pct: value }));
}

/**
 * 🔴 Kâr yazmak elle B.F. kilidini KALDIRIR (TD:376): gövde HER ZAMAN `offer_unit_price: null` taşır.
 * Kilitliyken hücre TÜREV kârı gösterir; onu aynen bırakmak noop (kilit korunur), başka yazımla yazmak
 * kilidi açma niyetidir (gövde gider). Boş/"↺ genel" ikisini null'lar.
 */
function commitProfit(text: string, ctx: CellContext): CellCommit {
  const { item } = ctx;
  const isLocked = item.offer_unit_price !== null;
  if (text === "") {
    return item.profit_pct === null && !isLocked
      ? { kind: "noop" }
      : { kind: "patch", body: generalProfitResetBody() };
  }
  const parsed = pctResult(parseProfitPct(text));
  if (!parsed.ok) return { kind: "error", message: parsed.message };
  if (!isLocked && sameNumber(parsed.value, item.profit_pct ?? ctx.revisionProfitPct)) return { kind: "noop" };
  return { kind: "patch", body: { profit_pct: parsed.value, offer_unit_price: null } };
}

function commitOfferPrice(text: string, ctx: CellContext): CellCommit {
  const { item } = ctx;
  // 🔴 SO-4: maliyet boşken elle B.F. YOK — istek uçmaz (sunucu da 422 verirdi).
  if (text !== "" && !isOfferPriceEnabled(item)) return { kind: "error", message: MSG_COST_FIRST };
  const parsed = parsePrice(text, "offerUnitPrice");
  // GÖSTERİLEN hesaplanan B.F. ("128,80") başka yazımla ("128,8") yazılırsa kilit KURULMAZ — GG/kâr deseninin aynısı.
  const shown = item.customer?.unit_price ?? null;
  if (parsed.ok && text !== "" && item.offer_unit_price === null && shown !== null && sameNumber(parsed.value, shown)) {
    return { kind: "noop" };
  }
  return commitNullable(text, item.offer_unit_price, parsed, (value) => ({ offer_unit_price: value }));
}

/**
 * "↺ kat." yalnız katalog a-s'si TEKLİF sınırına sığıyorsa açıktır (≤ 1.000.000, 4 kesir): sığmayan değeri yazmak
 * backend'de 422 olurdu (katalog sınırı teklifinkinden geniş olabilir).
 */
export function isCatalogResetAllowed(catalogUnitMhr: string): boolean {
  return (
    decimalDigitCounts(catalogUnitMhr).fraction <= MHR_LIMITS.fraction &&
    compareDecimalStrings(catalogUnitMhr, MHR_LIMITS.max) <= 0
  );
}

/** "↺ kat.": a-s'yi katalog değerine geri yazar (T10). */
export function catalogResetBody(catalogUnitMhr: string): OfferItemUpdateBody {
  return { unit_mhr: catalogUnitMhr };
}

/** "↺ genel": kalem kârını ve elle B.F.'yi temizler (TD:377). */
export function generalProfitResetBody(): OfferItemUpdateBody {
  return { profit_pct: null, offer_unit_price: null };
}
