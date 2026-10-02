// TKL-F3.2 · TEKLİF HESAP İKİZİ — SAF, dize + bigint tabanlı (Number()/float YOK).
//
// Backend `app/modules/offers/calc.py`nin BİREBİR aynasıdır (origin/tkl-b4-teklif-cekirdegi
// 3efb5e1). Sahte backend (`mock-offers.ts`) kalem ve revizyon hesabını YALNIZ buradan alır; bu
// dosya yanlışsa tüm teklif e2e'si sahte-yeşildir. Bu yüzden bağlayıcı kaynaklar ikidir:
// `src/lib/api/mock-offer-calc.test.ts` (calc.py test_calc.py aynası + GERÇEK calc.py'nin
// ürettiği altın vektörler).
//
// ## Formül (kalem)
// `g` = kalem GG % ?? revizyon GG %, `k` = kalem kâr % ?? revizyon kâr %, `c` = maliyet B.F.
//  · Elle teklif B.F. (`P`) varsa B.F. = ROUND(P); `c` BOŞSA HATA (SO-4). Türev kâr % =
//    ROUND((P / (c x (1+g)) - 1) x 100) (`c x (1+g) > 0` iken; aksi `null`).
//  · Yoksa `c` varsa B.F. = ROUND(c x (1+g) x (1+k)); `c` yoksa kalem FİYATSIZdır.
//  · tutar = ROUND(B.F. x miktar) · maliyet = ROUND(c x miktar) ·
//    GG = ROUND(c x (1+g) x miktar) - maliyet · kâr = tutar - maliyet - GG.
//  🔴 DEĞİŞMEZ: maliyet + GG + kâr = tutar BİREBİR (kâr tutardan KALAN olarak türer).
//
// ## Miktarsız kalem (SO-21, F4.2)
// `quantity === null` = "miktar girilmedi": B.F. (fiyatlıysa) hesaplanır; tutar, maliyet, GG, kâr VE adam-saat
// `null` (bilinmiyor — 0 DEĞİL); kalem toplamlara girmez; AYRI sayaç `unquantified_count` (`unpriced_count`la
// bağımsız: hem fiyatsız hem miktarsız kalem İKİSİNDE de sayılır).
//
// ## Toplam (revizyon)
// net = Σ tutar · KDV = ROUND(net x kdv %) · brüt = net + KDV · adam-saat = Σ miktar x a-s
// (fiyatsız DAHİL; miktarsız kalem KATKISIZ — toplam kısmi olabilir) · genel kâr % = ROUND(Σkâr / (Σmaliyet + ΣGG) x 100) (payda 0 ise null).
//
// ## Yuvarlama
// ROUND_HALF_UP = en yakına, yarım sıfırdan UZAĞA (negatifte de). Python `Decimal` ölçek
// kurallarını izler: toplam ölçek = ölçeklerin toplamı (çarpma), en büyüğü (toplama) — böylece
// dizi çıktıları (`"10.0000000"`, boş toplam `"0"`) calc.py ile aynıdır.
//
// Bölme (türev yüzdeler) tam rasyoneldir; calc.py 60 hanede böler — fark yalnız 1e-58'lik
// bir yarım-kuruş sınırında doğabilir, tavanlı şema girdileriyle erişilemez.

/** İkizin hesap hatası (calc.py `OfferCalcError`): servis 422'ye çevirir. */
export class OfferCalcError extends Error {}

/** SO-4: maliyet B.F. boşken elle teklif B.F. verilemez. */
export class ManualPriceWithoutCostError extends OfferCalcError {}

export const MANUAL_PRICE_WITHOUT_COST_MESSAGE =
  "Maliyet birim fiyatı boşken elle teklif birim fiyatı girilemez";

/** Kalemin hesap girdisi; `null` = girilmemiş (revizyon değeri / hesaplanır). Yüzdeler 12 = %12. */
export interface ItemInput {
  /** `null` = miktar girilmedi (SO-21). */
  quantity: string | null;
  unit_mhr: string;
  cost_unit_price: string | null;
  overhead_pct: string | null;
  profit_pct: string | null;
  offer_unit_price: string | null;
}

export interface ItemResult {
  priced: boolean;
  customer: { unit_price: string; amount: string | null } | null;
  internal: {
    /** `null` = miktar girilmedi (adam-saat BİLİNMİYOR, 0 değil). */
    man_hours: string | null;
    cost: string | null;
    overhead: string | null;
    profit: string | null;
    profit_pct: string | null;
  };
}

export interface RevisionPercents {
  overhead_pct: string;
  profit_pct: string;
}

export interface RevisionResult {
  items: ItemResult[];
  customer: { net: string; vat: string; gross: string };
  internal: {
    cost: string;
    overhead: string;
    profit: string;
    profit_pct: string | null;
    man_hours: string;
  };
  unpriced_count: number;
  /** Miktarı boş kalem sayısı (SO-21); `unpriced_count`tan bağımsız. */
  unquantified_count: number;
}

// ------------------------------------------------------------------ ondalık (bigint)

/** değer = units / 10^scale. `negativeZero`: Python `quantize` küçük negatifte "-0.00" üretir. */
interface Dec {
  readonly units: bigint;
  readonly scale: number;
  readonly negativeZero?: true;
}

const DECIMAL_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;
const PLACES = 2;
const ZERO: Dec = { units: 0n, scale: 0 };

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function parse(text: string): Dec {
  const trimmed = text.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) throw new OfferCalcError(`Geçersiz ondalık: ${text}`);
  const negative = trimmed.startsWith("-");
  const [whole = "", fraction = ""] = trimmed.replace(/^[+-]/, "").split(".");
  const units = BigInt(`${whole}${fraction}` || "0");
  return { units: negative ? -units : units, scale: fraction.length };
}

function toScale(value: Dec, scale: number): bigint {
  return value.units * pow10(scale - value.scale);
}

function add(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale);
  return { units: toScale(a, scale) + toScale(b, scale), scale };
}

function sub(a: Dec, b: Dec): Dec {
  const scale = Math.max(a.scale, b.scale);
  return { units: toScale(a, scale) - toScale(b, scale), scale };
}

function mul(a: Dec, b: Dec): Dec {
  return { units: a.units * b.units, scale: a.scale + b.scale };
}

/** `x / 100` (yüzde → oran çarpanı) — kayıpsız: yalnız ölçek büyür. */
function percentFactor(pct: Dec): Dec {
  return { units: pct.units, scale: pct.scale + 2 };
}

function compare(a: Dec, b: Dec): number {
  const scale = Math.max(a.scale, b.scale);
  const left = toScale(a, scale);
  const right = toScale(b, scale);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Bölüm + kalan → en yakına, yarım sıfırdan UZAĞA (ROUND_HALF_UP). */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d + (((n % d) * 2n >= d) ? 1n : 0n);
  return negative ? -quotient : quotient;
}

/** Python `Decimal.quantize(Decimal("0.01"), ROUND_HALF_UP)`. */
function quantize(value: Dec, places: number = PLACES): Dec {
  if (value.scale <= places) return { units: value.units * pow10(places - value.scale), scale: places };
  const units = divideRoundHalfUp(value.units, pow10(value.scale - places));
  if (units === 0n && value.units < 0n) return { units, scale: places, negativeZero: true };
  return { units, scale: places };
}

/** `ROUND(numerator / denominator x 100)` — tam rasyonel; `denominator` ≠ 0. */
function ratioPercent(numerator: Dec, denominator: Dec): Dec {
  const scaled =
    numerator.units * pow10(denominator.scale) * 100n * pow10(PLACES);
  const base = denominator.units * pow10(numerator.scale);
  const units = divideRoundHalfUp(scaled, base);
  const negative = numerator.units < 0n !== denominator.units < 0n;
  if (units === 0n && negative) return { units, scale: PLACES, negativeZero: true };
  return { units, scale: PLACES };
}

function format(value: Dec): string {
  const negative = value.units < 0n || value.negativeZero === true;
  const digits = (value.units < 0n ? -value.units : value.units).toString().padStart(value.scale + 1, "0");
  const whole = digits.slice(0, digits.length - value.scale);
  const fraction = digits.slice(digits.length - value.scale);
  return `${negative ? "-" : ""}${whole}${value.scale === 0 ? "" : `.${fraction}`}`;
}

// ---------------------------------------------------- dışa açık ondalık yardımcıları (mock)

/** İki ondalık dizeyi sayısal karşılaştırır (-1 | 0 | 1) — ölçek farkı önemsizdir. */
export function compareDecimal(a: string, b: string): number {
  return compare(parse(a), parse(b));
}

/** Dizeyi `places` haneye ROUND_HALF_UP ile kanonlar (`"185"` → `"185.00"`). */
export function quantizeDecimal(text: string, places: number): string {
  return format(quantize(parse(text), places));
}

/** `ROUND(numerator x 100 / denominator)` iki TAM SAYI için (kazanma oranı); payda > 0. */
export function percentOfIntegers(numerator: number, denominator: number): string {
  return format(
    ratioPercent({ units: BigInt(numerator), scale: 0 }, { units: BigInt(denominator), scale: 0 }),
  );
}

/** İki ondalık dizenin toplamı (Python `Decimal` toplama ölçeği). */
export function addDecimal(a: string, b: string): string {
  return format(add(parse(a), parse(b)));
}

/** İki ondalık dizenin KESİN çarpımı (Python `Decimal` çarpma ölçeği: ölçeklerin toplamı). */
export function multiplyDecimal(a: string, b: string): string {
  return format(mul(parse(a), parse(b)));
}

/** Ondalık dizenin sayısal olarak sıfırdan büyük olup olmadığı. */
export function isPositiveDecimal(text: string): boolean {
  return compare(parse(text), ZERO) > 0;
}

// ---------------------------------------------------------------------------- kalem

function pick(own: string | null, general: string): Dec {
  return parse(own !== null ? own : general);
}

export function calcItem(item: ItemInput, revision: RevisionPercents): ItemResult {
  const quantity = item.quantity === null ? null : parse(item.quantity);
  const manHours = quantity === null ? null : mul(quantity, parse(item.unit_mhr));
  const manHoursText = manHours === null ? null : format(manHours);
  if (item.cost_unit_price === null) {
    if (item.offer_unit_price !== null) {
      throw new ManualPriceWithoutCostError(MANUAL_PRICE_WITHOUT_COST_MESSAGE);
    }
    return {
      priced: false,
      customer: null,
      internal: { man_hours: manHoursText, cost: null, overhead: null, profit: null, profit_pct: null },
    };
  }
  const cost = parse(item.cost_unit_price);
  const overheadPct = pick(item.overhead_pct, revision.overhead_pct);
  const profitPct = pick(item.profit_pct, revision.profit_pct);
  const loadedUnit = mul(cost, add({ units: 1n, scale: 0 }, percentFactor(overheadPct))); // c x (1+g)

  let unitPrice: Dec;
  let profitPctOut: Dec | null;
  if (item.offer_unit_price !== null) {
    unitPrice = quantize(parse(item.offer_unit_price));
    profitPctOut =
      compare(loadedUnit, ZERO) > 0 ? ratioPercent(sub(unitPrice, loadedUnit), loadedUnit) : null;
  } else {
    unitPrice = quantize(mul(loadedUnit, add({ units: 1n, scale: 0 }, percentFactor(profitPct))));
    profitPctOut = profitPct;
  }

  if (quantity === null) {
    // SO-21: B.F. var; tutar/maliyet/GG/kâr/adam-saat YOK (null, 0 değil).
    return {
      priced: true,
      customer: { unit_price: format(unitPrice), amount: null },
      internal: {
        man_hours: null,
        cost: null,
        overhead: null,
        profit: null,
        profit_pct: profitPctOut === null ? null : format(profitPctOut),
      },
    };
  }
  const amount = quantize(mul(unitPrice, quantity));
  const costTotal = quantize(mul(cost, quantity));
  const overhead = sub(quantize(mul(loadedUnit, quantity)), costTotal);
  const profit = sub(sub(amount, costTotal), overhead);
  return {
    priced: true,
    customer: { unit_price: format(unitPrice), amount: format(amount) },
    internal: {
      man_hours: format(mul(quantity, parse(item.unit_mhr))),
      cost: format(costTotal),
      overhead: format(overhead),
      profit: format(profit),
      profit_pct: profitPctOut === null ? null : format(profitPctOut),
    },
  };
}

// ------------------------------------------------------------------------- revizyon

function sumOf(values: readonly Dec[]): Dec {
  return values.reduce((total, value) => add(total, value), ZERO);
}

/**
 * calc.py `i.cost or Decimal(0)`: Decimal("0.00") YANLIŞ (falsy) → `Decimal(0)` (ölçek 0). Toplamın ölçeği bu yüzden
 * "tüm terimler sıfır" iken "0" olur ("0.00" DEĞİL); en az bir sıfırdan farklı terim varsa ölçek 2'ye çıkar.
 */
function orZero(text: string | null): Dec {
  const value = parse(text ?? "0");
  return value.units === 0n ? ZERO : value;
}

export function calcRevision(
  items: readonly ItemInput[],
  revision: RevisionPercents & { vat_pct: string },
): RevisionResult {
  const results = items.map((entry) => calcItem(entry, revision));
  // Toplama YALNIZ fiyatlı ∧ miktarlı kalem girer (calc.py: `customer.amount is not None`).
  const lines = results.filter((r) => r.customer !== null && r.customer.amount !== null);
  const net = sumOf(lines.map((r) => parse(r.customer?.amount ?? "0")));
  const cost = sumOf(lines.map((r) => orZero(r.internal.cost)));
  const overhead = sumOf(lines.map((r) => orZero(r.internal.overhead)));
  const profit = sumOf(lines.map((r) => orZero(r.internal.profit)));
  const vat = quantize(mul(mul(net, parse(revision.vat_pct)), { units: 1n, scale: 2 }));
  const base = add(cost, overhead);
  return {
    items: results,
    customer: { net: format(net), vat: format(vat), gross: format(add(net, vat)) },
    internal: {
      cost: format(cost),
      overhead: format(overhead),
      profit: format(profit),
      profit_pct: compare(base, ZERO) > 0 ? format(ratioPercent(profit, base)) : null,
      man_hours: format(sumOf(results.flatMap((r) => (r.internal.man_hours === null ? [] : [parse(r.internal.man_hours)])))),
    },
    unpriced_count: results.filter((r) => !r.priced).length,
    unquantified_count: items.filter((entry) => entry.quantity === null).length,
  };
}

/** Maliyet önerisi (T32/SO-6): son fiyat → referans fiyat → boş (sıfır da geçerlidir). */
export function suggestCost(lastPrice: string | null, refPrice: string | null): string | null {
  return lastPrice !== null ? lastPrice : refPrice;
}
