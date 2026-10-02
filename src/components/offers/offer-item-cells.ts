/**
 * TKL-F3.6 · teklif kalem tablosunun HÜCRE okuma + gövde kurucusu (SAF; React'sız, ayrı test edilir).
 * Plan §3.2 "alan → gövde" tablosu BİREBİR burada yaşar; bileşenler yalnız çağırır.
 *
 * 🔴 T30 (para/miktar/yüzde yazımı — TEK kural `lib/tr-decimal`): nokta binlik, virgül ondalık, belirsiz "28.5"
 * KAYDEDİLMEZ. Sonuç kayıpsız ondalık METİNdir; `Number()` YOK. Hesap (tutar/toplam/türev kâr) SUNUCUDADIR
 * (`calc.py`, ÜS-F3-1): bu modül yalnız gösterir ve gövdeyi kurar.
 *
 * 🔶 B5 İLERİ UYUM: `quantity` null olabilir (B5: `OfferItemCreate.quantity` nullable + `unquantified_count`; bugün
 * maskeli rolde de null). Okuma/gövde yolu null'u taşır: miktar hücresi boş, tutar "—"; `isQuantityMissing` satır
 * uyarısı için TEK yer (B5 metni geldiğinde yalnız `OfferItemRow` bunu bağlar).
 */
import { trPriceInputValue, trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import type { OfferItemUpdateBody } from "@/lib/api/hooks/useOfferMutations";
import type { OfferItemRead } from "@/lib/api/hooks/useOffers";
import { compareDecimalStrings, isZeroDecimalString } from "@/lib/decimal";
import { EMPTY_CELL } from "@/lib/format";
import {
  REF_PRICE_AMBIGUOUS_DOT,
  decimalDigitCounts,
  parseQuantityInput,
  parseRefPriceInput,
  type TrDecimalParse,
} from "@/lib/tr-decimal";
import { formatPrice } from "@/components/work-item-catalog/work-item-model";

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

/** Backend sınırları (`offer_schemas.py`): miktar ≤ 1e9 / 3 kesir · a-s ≤ 1e6 / 4 kesir · fiyat ≤ 1e12 / 2 kesir · yüzde 2 kesir. */
const QUANTITY_LIMITS = { fraction: 3, max: "1000000000", maxText: "1.000.000.000" } as const;
const MHR_LIMITS = { fraction: 4, max: "1000000", maxText: "1.000.000" } as const;
const PRICE_LIMITS = { fraction: 2, max: "1000000000000", maxText: "1.000.000.000.000" } as const;
const PCT_FRACTION = 2;
const MAX_OVERHEAD_PCT = "100";
const MAX_PROFIT_PCT = "999.99";

const LABEL: Readonly<Record<ItemCellField, string>> = {
  quantity: "Miktar",
  unitMhr: "A-s",
  costUnitPrice: "Maliyet B.F.",
  overheadPct: "Gider %",
  profitPct: "Kâr %",
  offerUnitPrice: "Teklif B.F.",
};

export const MSG_COST_FIRST = "Önce maliyet girin";
const MSG_PCT_INVALID = "Geçerli bir yüzde girin";
const MSG_PCT_FRACTION = `En çok ${PCT_FRACTION} ondalık hane`;
const MSG_OVERHEAD_RANGE = "0–100 arasında olmalı";
const MSG_PROFIT_RANGE = "0–999,99 arasında olmalı";

// ───────────────────────────────────────────────────────────────────────── gösterim

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
      return trQuantityInputValue(profitPctShown(ctx));
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

export function isQuantityMissing(item: OfferItem): boolean {
  return item.quantity === null;
}

/** "₺1.288,00" ya da "—" (fiyatsız / maskeli / B5 miktarsız kalem). */
export function amountText(item: OfferItem): string {
  const amount = item.customer?.amount ?? null;
  return amount === null ? EMPTY_CELL : `₺${formatPrice(amount)}`;
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

/** Teklif B.F. alt satırı (TD:380). */
export function offerPriceHint(ctx: CellContext): string {
  const { item } = ctx;
  if (!isOfferPriceEnabled(item)) return "önce maliyet girin";
  if (item.offer_unit_price !== null) return `elle · kâr %${cellText("profitPct", ctx)}`;
  return "hesaplanan";
}

// ───────────────────────────────────────────────────────────────────────── yazma

type ParsedValue = { ok: true; value: string } | { ok: false; message: string };

interface DecimalLimits {
  fraction: number;
  max: string;
  maxText: string;
}

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
    return { ok: false, message: `En fazla ${limits.fraction} ondalık` };
  }
  if (compareDecimalStrings(parsed.value, limits.max) > 0) {
    return { ok: false, message: `En fazla ${limits.maxText}` };
  }
  if (mustBePositive && isZeroDecimalString(parsed.value)) {
    return { ok: false, message: `${label} 0'dan büyük olmalı` };
  }
  return { ok: true, value: parsed.value };
}

function parsePct(text: string, max: string, rangeMessage: string): ParsedValue {
  const parsed = parseQuantityInput(text);
  if (parsed.kind === "ambiguous") return { ok: false, message: REF_PRICE_AMBIGUOUS_DOT };
  if (parsed.kind === "invalid") return { ok: false, message: MSG_PCT_INVALID };
  if (decimalDigitCounts(parsed.value).fraction > PCT_FRACTION) return { ok: false, message: MSG_PCT_FRACTION };
  if (compareDecimalStrings(parsed.value, max) > 0) return { ok: false, message: rangeMessage };
  return { ok: true, value: parsed.value };
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
      return commitNullable(text, ctx.item.cost_unit_price, parsePrice(text, field), (value) => ({ cost_unit_price: value }));
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
  if (text === "") return { kind: "error", message: `${LABEL[field]} girin` };
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

function commitOverhead(text: string, ctx: CellContext): CellCommit {
  const { item } = ctx;
  const parsed = text === "" ? null : parsePct(text, MAX_OVERHEAD_PCT, MSG_OVERHEAD_RANGE);
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
  const parsed = parsePct(text, MAX_PROFIT_PCT, MSG_PROFIT_RANGE);
  if (!parsed.ok) return { kind: "error", message: parsed.message };
  if (!isLocked && sameNumber(parsed.value, item.profit_pct ?? ctx.revisionProfitPct)) return { kind: "noop" };
  return { kind: "patch", body: { profit_pct: parsed.value, offer_unit_price: null } };
}

function commitOfferPrice(text: string, ctx: CellContext): CellCommit {
  const { item } = ctx;
  // 🔴 SO-4: maliyet boşken elle B.F. YOK — istek uçmaz (sunucu da 422 verirdi).
  if (text !== "" && !isOfferPriceEnabled(item)) return { kind: "error", message: MSG_COST_FIRST };
  return commitNullable(text, item.offer_unit_price, parsePrice(text, "offerUnitPrice"), (value) => ({
    offer_unit_price: value,
  }));
}

/** "↺ kat.": a-s'yi katalog değerine geri yazar (T10). */
export function catalogResetBody(catalogUnitMhr: string): OfferItemUpdateBody {
  return { unit_mhr: catalogUnitMhr };
}

/** "↺ genel": kalem kârını ve elle B.F.'yi temizler (TD:377). */
export function generalProfitResetBody(): OfferItemUpdateBody {
  return { profit_pct: null, offer_unit_price: null };
}
