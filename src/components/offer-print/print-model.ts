/**
 * TKL-F3.7 · Teklif yazdırma — İŞVEREN ve İÇ çıktının ORTAK saf modeli (sayfalama, biçim, başlık/künye/
 * koşul/imza çerçevesi). TKL-F3-PLAN §5.
 *
 * 🔴 Bu dosya işveren çıktısının ithal kapanışındadır (`offer-print-leak-guard.test.ts`): iç alan adı
 * (maliyet, gider, kâr, adam-saat, düz B.F. alanları) ve iç etiket İÇERMEZ; yalnız İKİ türde de basılan
 * alanları bilir. İç modele özgü her şey `print-model-internal.ts`tedir.
 */
import { paginateByGroup, type PaginatedGroup } from "@/components/print-sheet/paginate";
import { PRICE_INDEX_TYPE_LABELS, type PriceIndexType } from "@/lib/contract-labels";
import { EMPTY_CELL, formatAmount, formatDateDots, formatDecimal } from "@/lib/format";

export type PrintKind = "isveren" | "ic";
export const EMPTY_PRICE = EMPTY_CELL;

/** Altlık tür etiketi (`TKL-… Rev.n · {tür}`). */
const KIND_LABELS: Readonly<Record<PrintKind, string>> = { isveren: "İşveren teklifi", ic: "İç döküm" };
const COMPANY_LOGO_SRC = "/api/backend/company/logo";
const PERCENT_DIGITS = 2;
const MONEY_DIGITS = 2;

/* ─── Sayfa düzeni ───────────────────────────────────────────────────────── */

/**
 * Sayfa başına tablo SATIR kapasitesi (grup başlığı + kalem + ara toplam satırları HEP aynı sabit
 * yükseklikte, `offer-print.css` `--offer-print-row`: 28px; uzun tarif 2 satırda kırpılır).
 *
 * 🔴 STATİK HESAP (F3.7) — playwright'ta (F3.8, T13 onay kareleri) DOĞRULANACAK:
 *   A4 dikey içerik = 1123 − 26 (üst dolgu) − 40 (altlık payı) = 1057 px.
 *     ilk sayfa: başlık+künye ≈ 156 + tablo başı 24 → (1057 − 180) / 28 ≈ 31 → 30 (güvenli);
 *     sonraki:   (1057 − 24 − 6) / 28 ≈ 36;
 *     son sayfa payı: toplam (~74) + dipnot (~18) + koşullar (~100) + imza (~90) + boşluklar (~30)
 *                     ≈ 312 px ≈ 12 satır.
 *   A4 yatay içerik = 794 − 26 − 40 = 728 px.
 *     ilk sayfa: başlık+künye yan yana ≈ 146 + 24 → (728 − 170) / 28 ≈ 19;
 *     sonraki:   (728 − 24 − 6) / 28 ≈ 24;
 *     son sayfa payı: koşullar ∥ toplam (~110) + imza (~90) + boşluk ≈ 224 px ≈ 8 satır.
 */
export interface PageLayout {
  /** İlk sayfa (başlık + künye bloğu yüzünden daha az). */
  readonly firstCapacity: number;
  readonly capacity: number;
  /** Son sayfada toplam + koşul + imza için ayrılan satır payı; sığmazsa toplam AYRI sayfaya düşer. */
  readonly lastReserve: number;
}
export const PORTRAIT_LAYOUT: PageLayout = { firstCapacity: 30, capacity: 36, lastReserve: 12 };
export const LANDSCAPE_LAYOUT: PageLayout = { firstCapacity: 19, capacity: 24, lastReserve: 8 };

export interface OfferPrintPage<Row> {
  /** Sayfadaki grup parçaları; `continued` → grup önceki sayfadan devam eder (yalnız sayfadan büyük gruplar). */
  readonly parts: readonly PaginatedGroup<Row>[];
}

/**
 * Satırları sayfalara böler: GRUP BÖLÜNMEZ (sığmazsa tümüyle sonraki sayfaya); ilk sayfa daha az satır
 * alır; son sayfada toplam+koşul+imza payı sığmıyorsa sonuna BOŞ sayfa eklenir (toplam ayrı sayfada).
 * Satır yoksa tek boş sayfa (başlık + toplam + imza yine basılır).
 */
export function paginateOfferRows<Row extends { groupId: string }>(
  rows: readonly Row[],
  layout: PageLayout,
): OfferPrintPage<Row>[] {
  if (rows.length === 0) return [{ parts: [] }];
  const capacityOf = (pageIndex: number) => (pageIndex === 0 ? layout.firstCapacity : layout.capacity);
  const pages = paginateByGroup(rows, capacityOf, (row) => row.groupId);
  const lastIndex = pages.length - 1;
  const used = pages[lastIndex]!.reduce((sum, part) => sum + part.rows.length, 0);
  const result = pages.map((parts) => ({ parts }));
  if (used + layout.lastReserve > capacityOf(lastIndex)) result.push({ parts: [] });
  return result;
}

/* ─── Biçim ──────────────────────────────────────────────────────────────── */

/** Tutar/B.F. (₺ sembolsüz; sütun başlığı "(₺)"): hep iki kuruş hanesi. `null` → "—" (sıfır DEĞİL). */
export function formatMoney(value: string | null | undefined): string {
  if (value === null || value === undefined) return EMPTY_PRICE;
  const text = formatAmount(value);
  const comma = text.indexOf(",");
  if (comma === -1) return `${text},${"0".repeat(MONEY_DIGITS)}`;
  return text + "0".repeat(Math.max(0, MONEY_DIGITS - (text.length - comma - 1)));
}

/** Toplam satırı tutarı: "₺ 1.234,50"; `null` → "—". */
export function formatTotal(value: string | null | undefined): string {
  return value === null || value === undefined ? EMPTY_PRICE : `₺ ${formatMoney(value)}`;
}

export function formatPct(value: string | null | undefined): string {
  return value === null || value === undefined ? EMPTY_PRICE : `%${formatDecimal(value, PERCENT_DIGITS)}`;
}

export interface TotalRow {
  label: string;
  value: string;
  tone?: "net" | "gross";
}

/* ─── Çerçeve: başlık · künye · koşullar · imza · altlık ──────────────────── */

export interface PrintCompanySource {
  name?: string | null;
  address?: string | null;
  tax_number?: string | null;
  tax_office?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  has_logo?: boolean;
}
export interface PrintOfferSource {
  offer_no: string;
  title: string;
  employer_name: string;
  scope_summary: string | null;
  prepared_by_name: string | null;
}
export interface PrintRevisionSource {
  rev_no: number;
  offer_date: string;
  valid_until: string;
  vat_pct: string;
  payment_terms: string | null;
  delivery_days: number | null;
  price_escalation: string;
  price_index_type: string | null;
  notes: string | null;
}

export interface LabelValue {
  label: string;
  value: string;
}
export interface PrintFrame {
  company: { title: string | null; logoSrc: string | null; lines: string[] };
  /** "TKL-2026-0014 · Rev.2" */
  heading: string;
  kunye: LabelValue[];
  terms: LabelValue[];
  signatures: { role: string; name: string | null }[];
  footerLabel: string;
}

function filled(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== "";
}

function taxLine(company: PrintCompanySource): string | null {
  const office = filled(company.tax_office) ? `${company.tax_office} V.D.` : null;
  const number = filled(company.tax_number) ? `VKN ${company.tax_number}` : null;
  const parts = [office, number].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

function companyBlock(company: PrintCompanySource | null): PrintFrame["company"] {
  if (company === null) return { title: null, logoSrc: null, lines: [] };
  const lines = [company.address, taxLine(company), company.phone, company.email, company.website].filter(filled);
  return {
    title: filled(company.name) ? company.name : null,
    logoSrc: company.has_logo === true ? COMPANY_LOGO_SRC : null,
    lines,
  };
}

function escalationText(revision: PrintRevisionSource): string {
  if (revision.price_escalation !== "tuik") return "Sabit fiyat";
  const index = revision.price_index_type === null ? undefined : PRICE_INDEX_TYPE_LABELS[revision.price_index_type as PriceIndexType];
  return index === undefined ? "TÜİK endeksli" : `TÜİK endeksli · ${index}`;
}

function termRows(revision: PrintRevisionSource): LabelValue[] {
  return [
    filled(revision.payment_terms) ? { label: "Ödeme koşulları", value: revision.payment_terms } : null,
    revision.delivery_days === null ? null : { label: "Teslim süresi", value: `${revision.delivery_days} takvim günü` },
    { label: "Fiyat farkı", value: escalationText(revision) },
    filled(revision.notes) ? { label: "Notlar", value: revision.notes } : null,
  ].filter((row): row is LabelValue => row !== null);
}

export interface FrameInput {
  offer: PrintOfferSource;
  revision: PrintRevisionSource;
  company: PrintCompanySource | null;
  kind: PrintKind;
}

export function buildPrintFrame({ offer, revision, company, kind }: FrameInput): PrintFrame {
  const heading = `${offer.offer_no} · Rev.${revision.rev_no}`;
  const kunye: LabelValue[] = [
    { label: "Teklif tarihi", value: formatDateDots(revision.offer_date) },
    { label: "Geçerlilik bitişi", value: formatDateDots(revision.valid_until) },
    { label: "İşveren", value: offer.employer_name },
    { label: "İş adı", value: offer.title },
    ...(filled(offer.scope_summary) ? [{ label: "Kapsam", value: offer.scope_summary }] : []),
  ];
  return {
    company: companyBlock(company),
    heading,
    kunye,
    terms: termRows(revision),
    signatures: [
      { role: "Hazırlayan", name: filled(offer.prepared_by_name) ? offer.prepared_by_name : null },
      { role: "Onaylayan", name: null },
    ],
    footerLabel: `${heading} · ${KIND_LABELS[kind]}`,
  };
}
