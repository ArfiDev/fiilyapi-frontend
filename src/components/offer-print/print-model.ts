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
import { EMPTY_CELL, formatAmount, formatDateDots, formatDecimal, formatMoneyTl } from "@/lib/format";

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
 * yükseklikte, `offer-print.css` `--offer-print-row`: 28px; yükseklik ALT SINIRDIR; uzun tarif KIRPILMAZ, satırı büyütür — tam metin kaybı ürün kararı, bkz. offer-print.css).
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

/**
 * TKL-F3.8.1 (CEO kararı a) · kapanış BÖLÜNEBİLİR PARÇALARDAN oluşur: toplamlar | koşullar | notlar | imza.
 * Her parça kendi içinde bölünmez; parçalar arasında sayfa geçilebilir; İMZA her zaman SON parça (son sayfada).
 * Dikey (işveren) ve yatay (iç) çıktıda TEK kural. Boş parça (not yoksa notlar) listeye hiç girmez.
 */
export type ClosingPartId = "totals" | "terms" | "notes" | "signature";
export const CLOSING_ORDER: readonly ClosingPartId[] = ["totals", "terms", "notes", "signature"];

/** Kanonik sıra (çağıran karışık verse de): toplamlar → koşullar → notlar → imza. */
function inClosingOrder<Part extends { id: ClosingPartId }>(parts: readonly Part[]): Part[] {
  return [...parts].sort((a, b) => CLOSING_ORDER.indexOf(a.id) - CLOSING_ORDER.indexOf(b.id));
}

/** Basılacak kapanış parçaları: notlar yalnız doluysa. */
export function closingPartsOf(frame: Pick<PrintFrame, "notes">): ClosingPartId[] {
  return CLOSING_ORDER.filter((id) => id !== "notes" || frame.notes !== null);
}

export interface OfferPrintPage<Row> {
  /** Sayfadaki grup parçaları; `continued` → grup önceki sayfadan devam eder (yalnız sayfadan büyük gruplar). */
  readonly parts: readonly PaginatedGroup<Row>[];
  /** Bu sayfada basılan kapanış parçaları (kanonik sırada; çoğu sayfada boş). */
  readonly closing: readonly ClosingPartId[];
}

/**
 * Satırları sayfalara böler: GRUP BÖLÜNMEZ (sığmazsa tümüyle sonraki sayfaya); ilk sayfa daha az satır
 * alır; son sayfada kapanış payı sığmıyorsa sonuna BOŞ sayfa eklenir (kapanış ayrı sayfada). Bu yalnız İLK
 * TAHMİNDİR — tüm kapanış parçaları son sayfada; ölçüm (`paginateByHeights`) parçaları gerekirse böler.
 * Satır yoksa tek sayfa (başlık + kapanış yine basılır).
 */
export function paginateOfferRows<Row extends { groupId: string }>(
  rows: readonly Row[],
  layout: PageLayout,
  closing: readonly ClosingPartId[] = CLOSING_ORDER,
): OfferPrintPage<Row>[] {
  const ordered = inClosingOrder(closing.map((id) => ({ id }))).map((part) => part.id);
  if (rows.length === 0) return [{ parts: [], closing: ordered }];
  const capacityOf = (pageIndex: number) => (pageIndex === 0 ? layout.firstCapacity : layout.capacity);
  const pages = paginateByGroup(rows, capacityOf, (row) => row.groupId);
  const lastIndex = pages.length - 1;
  const used = pages[lastIndex]!.reduce((sum, part) => sum + part.rows.length, 0);
  const result: OfferPrintPage<Row>[] = pages.map((parts) => ({ parts, closing: [] }));
  if (used + layout.lastReserve > capacityOf(lastIndex)) result.push({ parts: [], closing: [] });
  return result.map((page, index) => (index === result.length - 1 ? { ...page, closing: ordered } : page));
}

/* ─── Ölçüme dayalı sayfalama (TKL-F3.6.1 · madde 1) ──────────────────────── */

/**
 * Statik `PageLayout` yalnız İLK TAHMİNDİR (satır 28px sanılır). Uzun iş adı/kapsam/koşul metni satırı
 * büyütür; gerçek yüksekliği tarayıcıda ÖLÇEN bileşen (`use-measured-pages.ts`) aşağıdaki saf fonksiyonla
 * yeniden böler. Hiçbir metin kırpılmaz: sığmayan satır/grup/kapanış sonraki sayfaya geçer.
 */
export interface PageBudgets {
  /** İlk sayfada tablo satırlarına kalan yükseklik (px; başlık + künye + tablo başı düşülmüş). */
  readonly first: number;
  /** Sonraki sayfalarda tablo satırlarına kalan yükseklik (px). */
  readonly rest: number;
  /** Kapanış parçalarının ölçülen yükseklikleri (yalnız basılacak parçalar). */
  readonly closing: readonly ClosingMeasure[];
  /** Sayfadaki İLK kapanış parçasının önündeki pay (kapanış kabının üst boşluğu + içerik aralığı). */
  readonly closingLead: number;
  /** Aynı sayfadaki iki kapanış parçası arasındaki boşluk. */
  readonly closingGap: number;
  /** Bölünmüş grubun "(devam)" başlık satırının yüksekliği. */
  readonly continuedHead: number;
}

export interface ClosingMeasure {
  readonly id: ClosingPartId;
  /** Ölçülen parça yüksekliği (px; boşluklar hariç). */
  readonly height: number;
}

export interface MeasuredRow<Row> {
  readonly row: Row;
  /** Ölçülen satır yüksekliği (px). */
  readonly height: number;
}

interface Cluster<Row> {
  readonly entries: MeasuredRow<Row>[];
  readonly height: number;
}

function clusterByGroup<Row extends { groupId: string }>(entries: readonly MeasuredRow<Row>[]): Cluster<Row>[] {
  const clusters: { entries: MeasuredRow<Row>[]; height: number }[] = [];
  for (const entry of entries) {
    const last = clusters[clusters.length - 1];
    if (last !== undefined && last.entries[0]!.row.groupId === entry.row.groupId) {
      last.entries.push(entry);
      last.height += entry.height;
    } else {
      clusters.push({ entries: [entry], height: entry.height });
    }
  }
  return clusters;
}

/**
 * Ölçülen yüksekliklerle sayfalama. Kurallar: (1) GRUP BÖLÜNMEZ — sığmazsa tümüyle sonraki sayfaya;
 * (2) tek başına sonraki sayfadan büyük grup satır satır bölünür, devam parçası "(devam)" başlığı yüksekliği
 * kadar yer tutar; (3) tek satır sayfadan büyükse KENDİ sayfasına konur (kırpılmaz); (4) kapanış parçaları
 * tablonun ardından SIRAYLA yerleşir: sığmayan parça yeni sayfaya geçer (parça bölünmez), boş sayfada sayfadan
 * büyük parça yine de konur (kırpılmaz); imza son parça olduğundan HEP son sayfadadır.
 */
export function paginateByHeights<Row extends { groupId: string }>(
  entries: readonly MeasuredRow<Row>[],
  budgets: PageBudgets,
): OfferPrintPage<Row>[] {
  const budgetOf = (pageIndex: number) => (pageIndex === 0 ? budgets.first : budgets.rest);
  const pages: OfferPrintPage<Row>[] = [];
  let parts: PaginatedGroup<Row>[] = [];
  let closing: ClosingPartId[] = [];
  let used = 0;
  const closePage = () => {
    pages.push({ parts, closing });
    parts = [];
    closing = [];
    used = 0;
  };

  for (const cluster of clusterByGroup(entries)) {
    if (used + cluster.height <= budgetOf(pages.length)) {
      parts.push({ rows: cluster.entries.map((entry) => entry.row), continued: false });
      used += cluster.height;
      continue;
    }
    if (cluster.height <= budgetOf(pages.length + 1)) {
      closePage();
      parts.push({ rows: cluster.entries.map((entry) => entry.row), continued: false });
      used += cluster.height;
      continue;
    }
    // Grup tek başına bir sayfadan büyük: satır satır bölünür.
    let current: Row[] = [];
    let isContinued = false;
    const flushPart = () => {
      if (current.length > 0) parts.push({ rows: current, continued: isContinued });
      current = [];
    };
    for (const entry of cluster.entries) {
      const headCost = current.length === 0 && isContinued ? budgets.continuedHead : 0;
      const fits = used + headCost + entry.height <= budgetOf(pages.length);
      const isPageEmpty = used === 0 && current.length === 0;
      if (!fits && !isPageEmpty) {
        const hadRows = current.length > 0;
        flushPart();
        closePage();
        if (hadRows) isContinued = true;
      }
      // Yeni sayfadaki ilk satır: devam başlığı yer tutar (yalnız bölünmüş grubun ikinci+ parçası).
      if (current.length === 0 && isContinued) used += budgets.continuedHead;
      current.push(entry.row);
      used += entry.height;
    }
    flushPart();
  }

  for (const part of inClosingOrder(budgets.closing)) {
    const spaceFor = () => part.height + (closing.length === 0 ? budgets.closingLead : budgets.closingGap);
    const isPageEmpty = used === 0 && parts.length === 0 && closing.length === 0;
    if (used + spaceFor() > budgetOf(pages.length) && !isPageEmpty) closePage();
    used += spaceFor();
    closing.push(part.id);
  }
  closePage();
  return pages;
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

/** Toplam satırı tutarı: "₺1.234,50" (detay ekranıyla aynı, TKL-F3.8.1); `null` → "—". */
export function formatTotal(value: string | null | undefined): string {
  return formatMoneyTl(value);
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
  /** Koşullar (ödeme · teslim · fiyat farkı); notlar AYRI parçadır (`notes`). */
  terms: LabelValue[];
  /** Notlar (boşsa `null` → "notlar" parçası basılmaz). */
  notes: string | null;
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
    notes: filled(revision.notes) ? revision.notes : null,
    signatures: [
      { role: "Hazırlayan", name: filled(offer.prepared_by_name) ? offer.prepared_by_name : null },
      { role: "Onaylayan", name: null },
    ],
    footerLabel: `${heading} · ${KIND_LABELS[kind]}`,
  };
}
