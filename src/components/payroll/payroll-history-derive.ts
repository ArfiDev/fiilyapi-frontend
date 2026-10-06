import type { PayrollPeriodListRow } from "@/lib/api/hooks/usePayroll";

/**
 * F-BOR T3 · `/bordro/gecmis` ekranının SAF türetmeleri (mockup
 * `Bordro Geçmişi.dc.html` = "BG"; yorumlardaki sayılar O dosyanın SATIR
 * numaralarıdır).
 *
 * 🔴 K6 — sunucuda `year` SORGU PARAMETRESİ YOKTUR: `GET /payroll/periods`
 * yalnız `limit`/`offset` alır. Yıl süzgeci bu yüzden İSTEMCİDE çalışır ve
 * seçenekler GERÇEKTEN GELEN veriden türer (sabit yıl listesi yazılmaz).
 *
 * 🔴 K4 — tfoot toplamları burada, TAM SAYI KURUŞ üzerinden toplanır. Para
 * alanları `string`tir (Decimal); `Number` ile toplamak 0,01'lik kaymalar
 * üretirdi. `bigint` kuruş kullanılır ve sonuç yine `string` olarak döner —
 * hiçbir yerde kayan nokta aritmetiği yoktur.
 */

/** Decimal ondalık basamak sayısı (kuruş). */
const KURUS_SCALE = 2;

const DECIMAL_PATTERN = /^[+-]?\d+(\.\d+)?$/;

/**
 * `"743200.00"` → `74320000n`. Ayrıştırılamayan girdi `null` döner —
 * SESSİZCE 0 SAYILMAZ: 0 saymak, eksik veriyi "hiç para yok" gibi gösterip
 * toplamı sahte biçimde tamamlardı. Çağıran taraf `null`ları sayar ve
 * kullanıcıya toplamların eksik olduğunu söyler.
 */
export function parseKurus(value: string): bigint | null {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) return null;

  const isNegative = trimmed.startsWith("-");
  const unsigned = trimmed.startsWith("+") || isNegative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");
  // Sunucu iki basamak gönderir; fazlası KESİLİR (yuvarlama yapılmaz —
  // yuvarlama, olmayan bir hassasiyeti varmış gibi gösterirdi).
  const scaled = `${fraction}${"0".repeat(KURUS_SCALE)}`.slice(0, KURUS_SCALE);
  const magnitude = BigInt(`${whole}${scaled}`);
  return isNegative ? -magnitude : magnitude;
}

/** `74320000n` → `"743200.00"` — biçimleyicilere verilecek Decimal metni. */
export function kurusToDecimalString(total: bigint): string {
  const isNegative = total < 0n;
  const magnitude = (isNegative ? -total : total).toString().padStart(KURUS_SCALE + 1, "0");
  const whole = magnitude.slice(0, magnitude.length - KURUS_SCALE);
  const fraction = magnitude.slice(magnitude.length - KURUS_SCALE);
  return `${isNegative ? "-" : ""}${whole}.${fraction}`;
}

/* --------------------------------------------------------------- yıl süzgeci */

/**
 * BG:34 seçeneği — YALNIZ gelen veride geçen yıllar, yeniden eskiye. Mockup
 * `2026`/`2025` yazar ama o bir ÖRNEKTİR: sabit liste, veri başka bir yıla
 * aitken boş ekran üretirdi.
 */
export function availableYears(rows: readonly PayrollPeriodListRow[]): number[] {
  const unique = new Set(rows.map((row) => row.year));
  return [...unique].sort((a, b) => b - a);
}

/** Varsayılan yıl = veride geçen EN YENİ yıl; hiç dönem yoksa `undefined`. */
export function defaultYear(rows: readonly PayrollPeriodListRow[]): number | undefined {
  return availableYears(rows)[0];
}

/**
 * Seçili yılın satırları, YENİDEN ESKİYE (BG:50-104 Temmuz → Mart). Sunucunun
 * dizi sırası bir sözleşme değildir, sıra burada kurulur; girdi dizisi
 * MUTASYONA UĞRAMAZ.
 */
export function rowsForYear(
  rows: readonly PayrollPeriodListRow[],
  year: number | undefined,
): PayrollPeriodListRow[] {
  if (year === undefined) return [];
  return rows.filter((row) => row.year === year).sort((a, b) => b.month - a.month);
}

/* ------------------------------------------------------------ tfoot toplamı */

export interface HistoryTotals {
  /** 🔴 K4 — tfoot etiketindeki ay sayısı BURADAN gelir, sabitten DEĞİL. */
  periodCount: number;
  /** BG:109 "Ort. 45" — ortalama çalışan sayısı (tam sayıya yuvarlanır). */
  personnelAverage: number;
  /**
   * 🔴 IZN-F4c.2 — sütunda tek bir `null` (maskeli satır) varsa toplam `null`: eksik toplam
   * ASLA basılmaz ve `null` 0 SAYILMAZ (ekran "—" + kilit basar). Boş liste 0'dır (gerçek sıfır).
   */
  grossTotal: string | null;
  sgkEmployerTotal: string | null;
  netTotal: string | null;
  costTotal: string | null;
  /** Ayrıştırılamayan para alanı sayısı — `>0` ise toplamlar EKSİKTİR. */
  unparsedCount: number;
}

/**
 * 🔴 K4 — mockup'ın tfoot'u "2026 Toplam (7 Ay)" derken tbody'de BEŞ satır
 * vardır (BG:108 ↔ BG:50-104) ve tutar toplamları da satırlarla tutmaz. Bu
 * yüzden hem sayı hem toplamlar SATIRLARDAN türetilir; mockup'ın sayıları
 * KOPYALANMAZ.
 */
export function historyTotals(rows: readonly PayrollPeriodListRow[]): HistoryTotals {
  let unparsedCount = 0;

  const sum = (pick: (row: PayrollPeriodListRow) => string | null): string | null => {
    // Maskeli (`null`) satır varsa sütun toplamı bilinemez — 0 sayılmaz, okunamayanlar da sayılmaz.
    if (rows.some((row) => pick(row) === null)) return null;
    const total = rows.reduce((acc, row) => {
      const parsed = parseKurus(pick(row) as string);
      if (parsed === null) {
        unparsedCount += 1;
        return acc;
      }
      return acc + parsed;
    }, 0n);
    return kurusToDecimalString(total);
  };

  const grossTotal = sum((row) => row.gross_total);
  const sgkEmployerTotal = sum((row) => row.sgk_employer_total);
  const netTotal = sum((row) => row.net_total);
  const costTotal = sum((row) => row.total_cost);

  const personnelSum = rows.reduce((acc, row) => acc + row.personnel_count, 0);

  return {
    periodCount: rows.length,
    personnelAverage: rows.length === 0 ? 0 : Math.round(personnelSum / rows.length),
    grossTotal,
    sgkEmployerTotal,
    netTotal,
    costTotal,
    unparsedCount,
  };
}

/* ---------------------------------------------------------------- satır hâli */

/**
 * BG:51 — dönem adının altındaki ikincil "Ödeme bekliyor" satırı ve BG:50'nin
 * kehribar zemini. 🔴 Mockup bunu YALNIZ ilk satıra çizer; koşul SATIRDAN
 * türer: ödendi damgası (`paid_at`) basılmamış her dönem ödeme bekliyordur.
 */
export function isPaymentPending(row: PayrollPeriodListRow): boolean {
  return row.paid_at === null;
}

/**
 * BG:57/68 "Ödeme Tarihi" hücresi: ödendiyse ödeme damgasının günü, aksi
 * hâlde vade. İkisi de yoksa `undefined` (hücre `—` basar — tarih UYDURULMAZ).
 *
 * `paid_at` bir zaman damgası olabilir; yalnız `YYYY-MM-DD` başı alınır —
 * `new Date(...)` kullanılmaz (UTC yorumu TR saatinde günü geri kaydırırdı).
 */
export function paymentDateOf(row: PayrollPeriodListRow): string | undefined {
  const iso = row.paid_at ?? row.payment_due_date;
  if (iso === null) return undefined;
  return iso.slice(0, 10);
}
