/**
 * PLN-F3.5 · QURR tablosunun 18 a–r kolonu — SAF değer okuma + biçim seçimi.
 * İş değeri (bant, sapma, toplam) BURADA HESAPLANMAZ (PLANLAMA-SPEC.md §3.15
 * S2 — bant kararı backend'de tek yerde) — bu dosya yalnız HANGİ alanın HANGİ kolona
 * gittiğini ve GÖRÜNTÜLEME biçimini (ondalık basamak, "aşım" kırmızısı)
 * taşır; hepsi mockup'ın kendi sabitleri (Q:294-330).
 */
import { EMPTY_CELL, formatDecimal } from "@/lib/format";
import { compareDecimalStrings } from "@/lib/earned-value/decimal-input";
import { formatFixedDecimal, formatPf, formatUnitRate, formatVariancePoints } from "@/lib/earned-value";
import type { EvQurrRow, EvQurrTotal } from "@/lib/api/models";

import type { QurrTreeNodeData } from "./qurr-tree";

export type QurrColumnKey = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h" | "i" | "j" | "k" | "l" | "m" | "n" | "o" | "p" | "q" | "r";

export const QURR_COLUMNS: readonly {
  key: QurrColumnKey;
  label: string;
  short: string;
  full: string;
  formula: string;
  note: string;
}[] = [
  { key: "a", label: "Önceki rev.", short: "Önc. rev", full: "Miktar · önceki revizyon (Rev 0)", formula: "Rev 0", note: "Baseline Rev 0 planlı miktarı" },
  { key: "b", label: "Güncel", short: "Güncel", full: "Miktar · güncel revizyon (Rev 1)", formula: "Rev 1", note: "Aktif baseline planlı miktarı (BOQ)" },
  { key: "c", label: "Bugüne kadar", short: "Küm.", full: "Miktar · bugüne kadar gerçekleşen", formula: "Σ günlük miktar", note: "Gönderilmiş + taslak günlüklerden" },
  { key: "d", label: "Kalan", short: "Kalan", full: "Miktar · kalan", formula: "d = b − c", note: "Güncel planlı − bugüne kadar" },
  { key: "e", label: "Bu hafta", short: "Hafta", full: "Miktar · bu hafta", formula: "Σ hafta günleri", note: "Hafta Cuma başlar" },
  { key: "f", label: "Önceki rev. bütçe", short: "Önc. bütçe", full: "Adam-saat · önceki rev. bütçe", formula: "f = a × m", note: "Rev 0 miktar × Rev 0 oran" },
  { key: "g", label: "Güncel bütçe", short: "Bütçe", full: "Adam-saat · güncel bütçe", formula: "g = b × n", note: "Rev 1 miktar × Rev 1 oran" },
  { key: "h", label: "Kazanılmış küm.", short: "Kaz. küm", full: "Adam-saat · bugüne kadar kazanılmış", formula: "h = c × n", note: "Yapılan miktar × güncel oran" },
  { key: "i", label: "Harcanan küm.", short: "Harc. küm", full: "Adam-saat · bugüne kadar harcanan", formula: "Σ puantaj dağıtımı", note: "Dağıtılmamış saat dahil değil" },
  { key: "j", label: "Kalan", short: "Kalan", full: "Adam-saat · kalan bütçe", formula: "j = g − h", note: "Güncel bütçe − kazanılmış" },
  { key: "k", label: "Kazanılmış hafta", short: "Kaz. hf", full: "Adam-saat · bu hafta kazanılmış", formula: "k = e × n", note: "Bu hafta miktar × güncel oran" },
  { key: "l", label: "Harcanan hafta", short: "Harc. hf", full: "Adam-saat · bu hafta harcanan", formula: "Σ hafta dağıtım", note: "Puantajdan iş kalemine bölünen" },
  { key: "m", label: "Önceki rev.", short: "Önc. oran", full: "Birim oran · önceki revizyon", formula: "Rev 0", note: "a-s / birim" },
  { key: "n", label: "Güncel", short: "Oran", full: "Birim oran · güncel revizyon", formula: "Rev 1", note: "a-s / birim" },
  { key: "o", label: "Bugüne kadar gerç.", short: "Gerç. küm", full: "Birim oran · bugüne kadar gerçekleşen", formula: "o = i ÷ c", note: "Harcanan a-s ÷ yapılan miktar. Güncel orandan (n) büyükse birim başına fazla saat harcanıyor." },
  { key: "p", label: "Bu hafta gerç.", short: "Gerç. hf", full: "Birim oran · bu hafta gerçekleşen", formula: "p = l ÷ e", note: "Bu hafta miktar yoksa \"–\"" },
  { key: "q", label: "PF bugüne kadar", short: "PF küm", full: "Performans · bugüne kadar", formula: "q = h ÷ i", note: "Kazanılmış ÷ harcanan" },
  { key: "r", label: "PF bu hafta", short: "PF hf", full: "Performans · bu hafta", formula: "r = k ÷ l", note: "Bu hafta harcanan yoksa \"–\"" },
];

/** Miktar/oran kolonu — yalnız satır (L3) taşır; ara toplamlarda basılmaz (Q sumCells). */
const ROW_ONLY_KEYS = new Set<QurrColumnKey>(["a", "b", "c", "d", "e", "m", "n", "o", "p"]);

function rowRaw(row: EvQurrRow, key: QurrColumnKey): string | null {
  switch (key) {
    case "a": return row.a_prev_qty;
    case "b": return row.b_qty;
    case "c": return row.c_qty_cum;
    case "d": return row.d_remaining_qty;
    case "e": return row.e_qty_week;
    case "f": return row.f_prev_budget_mhr;
    case "g": return row.g_budget_mhr;
    case "h": return row.h_earned_cum;
    case "i": return row.i_spent_cum;
    case "j": return row.j_remaining_mhr;
    case "k": return row.k_earned_week;
    case "l": return row.l_spent_week;
    case "m": return row.m_prev_unit_mhr;
    case "n": return row.n_unit_mhr;
    case "o": return row.o_actual_unit_mhr_cum;
    case "p": return row.p_actual_unit_mhr_week;
    case "q": return row.q_pf_cum;
    case "r": return row.r_pf_week;
  }
}

function totalRaw(total: EvQurrTotal, key: QurrColumnKey): string | null {
  if (ROW_ONLY_KEYS.has(key)) return null;
  switch (key) {
    case "f": return total.f_prev_budget_mhr;
    case "g": return total.g_budget_mhr;
    case "h": return total.h_earned_cum;
    case "i": return total.i_spent_cum;
    case "j": return total.j_remaining_mhr;
    case "k": return total.k_earned_week;
    case "l": return total.l_spent_week;
    case "q": return total.q_pf_cum;
    case "r": return total.r_pf_week;
    default: return null;
  }
}

/** Hücrenin ham (biçimlenmemiş) değeri — kaynak satır mı toplam mı fark etmez. */
export function qurrCellRaw(data: QurrTreeNodeData, key: QurrColumnKey): string | null {
  return data.kind === "row" ? rowRaw(data.row, key) : totalRaw(data.total, key);
}

/**
 * "Kod" yapışkan kolonu (Q:169/187, LİDER DÜZELTMESİ: mockup'ta Kod ve İş
 * tipi İKİ ayrı sticky kolondur). `QurrRow.code`/`QurrTotal.code` — ikisi de
 * şemada `string | null` (schema.d.ts:17303 `QurrRow.code`, :17356
 * `QurrTotal.code` — ikincisi opsiyonel anahtar ama değer aynı tip).
 */
export function qurrNodeCode(data: QurrTreeNodeData): string | null {
  return data.kind === "row" ? data.row.code : (data.total.code ?? null);
}

/** q/r kolonunun bandı; a-p'de bant yok (`null`). */
export function qurrCellBand(data: QurrTreeNodeData, key: QurrColumnKey): "red" | "amber" | "green" | "high" | null {
  if (key !== "q" && key !== "r") return null;
  const source = data.kind === "row" ? data.row : data.total;
  return key === "q" ? (source.q_band ?? null) : (source.r_band ?? null);
}

/** Anahtarlar küçük harf; karşılaştırma tr-TR küçük harfle (Ton / Ay kanonik yazımı da eşleşir). */
const WIDE_QTY_UOM = new Set(["ton", "ay"]);

/** Miktar kolonunun (a-d) ondalık basamağı — UOM'a göre (Q:318 `dec`/`qd`). */
export function qtyDigits(uom: string | null): number {
  return uom !== null && WIDE_QTY_UOM.has(uom.toLocaleLowerCase("tr-TR")) ? 1 : 0;
}

/**
 * `e` (bu hafta miktarı) kolonunun ondalık basamağı: değer 10'un altındaysa
 * 2 ondalık (küçük haftalık miktarlar görünür kalsın), aksi hâlde `qtyDigits`.
 *
 * CEO BULGUSU (ondalık kanonu): `Number()`e çevrilip karşılaştırılMAZ —
 * `compareDecimalStrings` (`lib/earned-value/decimal-input.ts`) kayıpsız
 * dize karşılaştırması yapar; `Number("1.00000000000000009")` gibi 2⁵³ üstü
 * veya çok basamaklı ondalıklarda `Number` sessizce YANILIR.
 */
export function weekQtyDigits(uom: string | null, weekValue: string | null): number {
  const base = qtyDigits(uom);
  if (weekValue === null) return base;
  return compareDecimalStrings(weekValue, "0") > 0 && compareDecimalStrings(weekValue, "10") < 0 ? 2 : base;
}

/**
 * o/p (gerçekleşen birim oran) güncel orandan (n) BÜYÜKSE kırmızı yazı
 * (Q:198 "Gerçek oran güncel orandan yüksekse kırmızı"). HAM değerle
 * karşılaştırılır — PF bandındaki gibi gösterilen değere YUVARLANMAZ
 * (mockup Q:324 `x[k] > x.nr` ham sayı).
 *
 * CEO BULGUSU: `Number()` karşılaştırması YASAK — `compareDecimalStrings`
 * kayıpsız dize karşılaştırması yapar (bkz. `weekQtyDigits` üstündeki not).
 */
export function isUnitRateOver(actual: string | null, current: string | null): boolean {
  if (actual === null || current === null) return false;
  return compareDecimalStrings(actual, current) > 0;
}

/** Kolonun ondalık basamağı — a-d UOM'a göre, e haftalık eşik, f-l tam sayı, m-p/q-r kendi biçimleyicisi (`qurrCellText`). */
export function qurrColumnDigits(key: QurrColumnKey, uom: string | null, weekRaw: string | null): number | undefined {
  if (key === "e") return weekQtyDigits(uom, weekRaw);
  if (key === "a" || key === "b" || key === "c" || key === "d") return qtyDigits(uom);
  if (key === "f" || key === "g" || key === "h" || key === "i" || key === "j" || key === "k" || key === "l") return 0;
  return undefined; // m/n/o/p → formatUnitRate kendi basamağını seçer; q/r → formatPf sabit 2
}

/**
 * LİDER DENETİMİ (madde 7, GERÇEK KUSUR): mockup `nf(v,d)` HER ZAMAN `d`
 * basamak basar (`minimumFractionDigits: d, maximumFractionDigits: d}` —
 * "Demir ton" satırı "520,0" yazar, "520" DEĞİL). Genel `lib/format.ts`
 * `formatDecimal` yalnız `maximumFractionDigits` verir (sondaki sıfırı
 * ATAR) — QURR'un miktar kolonları (a-e) için YANLIŞ aile.
 *
 * LİDER TALEBİ (DRY, 2026-09-26): bu iki adımlı desen (`roundHalfUp` →
 * sabit basamaklı `Intl`) `lib/earned-value/format.ts`teki `formatPf`/
 * `formatVariancePoints`le AYNIYDI — artık ORTAK `formatFixedDecimal`
 * (aynı dosya) BUNU tek yerde taşıyor. Burada yalnız ADI KORUNUR (test
 * dosyası SUT olarak doğrudan çağırıyor) — gövde ORTAK fonksiyona devreder,
 * kopya YOK.
 */
export function formatFixedQuantity(value: string | null, digits: number): string {
  return formatFixedDecimal(value, digits);
}

export interface QurrCellText {
  readonly text: string;
  /** o/p güncel orandan büyükse (Q:198). */
  readonly danger: boolean;
}

/**
 * Hücrenin GÖRÜNTÜLENEN metni — TEK kaynak, ekran (`WeeklyQurrScreen`) ve
 * yazdırma (`QurrPrintView`) AYNI fonksiyonu çağırır.
 *
 * CEO BULGUSU: önceden yazdırma kendi `Number(raw).toLocaleString(...)`
 * kopyasını tutuyordu — iki katman farklı yuvarlama üretebilir, aynı hücre
 * ekranda "0,95" yazdırmada "0,9500000000001" basabilirdi. Artık TEK
 * fonksiyon var; sapma yapısal olarak İMKÂNSIZ (iki ayrı çağıran değil,
 * bir tanesi).
 */
export function qurrCellText(data: QurrTreeNodeData, key: QurrColumnKey): QurrCellText {
  // LİDER DENETİMİ (madde 8): başlık/ara toplam satırlarında a-e/m-p BOŞTUR
  // (mockup `sumCells`: bu anahtarlar için `t:''` — "—" DEĞİL). "—" yalnız
  // GERÇEK bir satırda değer YOKSA basılır; toplam satırında alan zaten
  // UYGULANAMAZ (kavramsal olarak yok), o başka bir şeydir.
  if (data.kind === "total" && ROW_ONLY_KEYS.has(key)) return { text: "", danger: false };

  const raw = qurrCellRaw(data, key);
  if (key === "q" || key === "r") return { text: formatPf(raw), danger: false };
  if (key === "m" || key === "n" || key === "o" || key === "p") {
    const danger =
      data.kind === "row" &&
      ((key === "o" && isUnitRateOver(data.row.o_actual_unit_mhr_cum, data.row.n_unit_mhr)) ||
        (key === "p" && isUnitRateOver(data.row.p_actual_unit_mhr_week, data.row.n_unit_mhr)));
    return { text: formatUnitRate(raw), danger };
  }
  const uom = data.kind === "row" ? data.row.uom : null;
  const weekRaw = data.kind === "row" ? data.row.e_qty_week : null;
  if (key === "a" || key === "b" || key === "c" || key === "d" || key === "e") {
    const digits = qurrColumnDigits(key, uom, weekRaw) ?? 0;
    return { text: formatFixedQuantity(raw, digits), danger: false };
  }
  const digits = qurrColumnDigits(key, uom, weekRaw);
  return { text: formatDecimal(raw, digits ?? 0), danger: false };
}

const DEVIATION_SIGNS = ["+", "−"] as const;

/**
 * Paçal kartı sapması (Q:147 `p.d` — "+%2,6" / "−%4,9"): mockup
 * `(d > 0 ? '+' : '−') + '%' + nf(Math.abs(d), 1)` idi (`Number`/`toFixed`,
 * K18'İN ROUND_HALF_UP'ı DEĞİL + float kalıntı riski). `CompositeCard.
 * deviation` PF sapmasıyla AYNI biçim ailesidir (0–1 kesir, K27) — bu yüzden
 * TÜRETİLMİYOR, mevcut `formatVariancePoints` (ROUND_HALF_UP, `−` işareti)
 * çağrılıp yalnız "%" sembolü işaretten SONRA eklenir (mockup'ın harf sırası
 * "+%2,6", "%+2,6" DEĞİL).
 */
export function formatPacalDeviation(value: string | null): string {
  const points = formatVariancePoints(value);
  if (points === EMPTY_CELL) return points;
  const sign = points[0];
  if ((DEVIATION_SIGNS as readonly string[]).includes(sign)) return `${sign}%${points.slice(1)}`;
  return `%${points}`;
}

/**
 * Paçal sapması YUKARI (kırmızı) mı — HAM değerle, `Number()` DEĞİL
 * (CEO bulgusu; bkz. `isUnitRateOver`).
 */
export function isPacalDeviationUp(value: string | null): boolean {
  return value !== null && compareDecimalStrings(value, "0") > 0;
}

/** Değişen revizyon hücreleri (Q:197 "sarı") — backend BAYRAKLARINDAN, istemci karşılaştırma YAPMAZ. */
export function qurrChangedColumns(row: EvQurrRow): ReadonlySet<QurrColumnKey> {
  const changed = new Set<QurrColumnKey>();
  if (row.changed_qty) changed.add("a");
  if (row.changed_rate) changed.add("m");
  if (row.changed_budget) changed.add("f");
  return changed;
}
