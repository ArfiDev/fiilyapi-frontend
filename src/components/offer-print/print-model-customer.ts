/**
 * TKL-F3.7 · İŞVEREN teklifi modeli (A4 dikey, 6 kolon): Poz No · Tarif · Birim · Miktar · Teklif B.F. ·
 * Tutar (gruplu + grup ara toplamı) + KDV hariç / KDV / genel toplam + koşullar + imza (§5.1 "İşveren").
 *
 * 🔴 SIZINTI SINIRI. Girdi tipleri YAPISAL ve DAR: yalnız `customer` alt nesnelerini ve ortak koşulları
 * tanımlar — iç alan tanımda YOKTUR. Çağıran tam API nesnesini verebilir (fazla alanlı nesne yapısal
 * olarak uyar) ama model YALNIZ adını verdiği alanları KOPYALAR; iç alanlar buradan geçtikten sonra
 * artık hiçbir yerde YOKTUR (çıktı modeli seri hâle getirilince sentinel testi bunu doğrular).
 * Bu dosya `offer-print-leak-guard.test.ts` kapsamındadır: iç alan adı anılamaz, iç modül ithal edilemez.
 */
import { sumDecimalStrings } from "@/lib/decimal";
import { formatQuantity } from "@/lib/format";

import {
  EMPTY_PRICE,
  PORTRAIT_LAYOUT,
  buildPrintFrame,
  closingPartsOf,
  formatMoney,
  formatPct,
  formatTotal,
  paginateOfferRows,
  type OfferPrintPage,
  type PrintCompanySource,
  type PrintFrame,
  type PrintOfferSource,
  type PrintRevisionSource,
  type TotalRow,
} from "./print-model";

export interface CustomerSourceItem {
  id: string;
  poz_no: string;
  description: string;
  unit: string;
  quantity: string | null;
  priced: boolean;
  customer: { unit_price: string | null; amount: string | null } | null;
}
export interface CustomerSourceGroup {
  id: string;
  name: string;
  items: readonly CustomerSourceItem[];
}
export interface CustomerSourceRevision extends PrintRevisionSource {
  groups: readonly CustomerSourceGroup[];
  totals: {
    unpriced_count: number;
    customer: { net: string | null; vat: string | null; gross: string | null };
  };
}

export interface CustomerPrintRow {
  kind: "group" | "item" | "subtotal";
  key: string;
  groupId: string;
  groupName: string;
  /** Grup adı (group) · "{grup} ara toplamı" (subtotal) · boş (item). */
  name: string;
  poz: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  amount: string;
  /** Fiyatsız kalem: B.F./tutar "—" + dipnot işareti. */
  isUnpriced: boolean;
}
export interface CustomerPrintModel {
  frame: PrintFrame;
  pages: OfferPrintPage<CustomerPrintRow>[];
  totals: TotalRow[];
  /** "* Fiyatı belirlenmemiş N kalem toplama dahil değildir." — fiyatsız yoksa `null`. */
  footnote: string | null;
}

const BLANK_ROW = {
  name: "",
  poz: "",
  description: "",
  unit: "",
  quantity: "",
  unitPrice: "",
  amount: "",
  isUnpriced: false,
} as const;

function isUnpricedItem(item: CustomerSourceItem): boolean {
  return !item.priced || item.customer === null || item.customer.unit_price === null;
}

function itemRow(group: CustomerSourceGroup, item: CustomerSourceItem): CustomerPrintRow {
  const isUnpriced = isUnpricedItem(item);
  return {
    ...BLANK_ROW,
    kind: "item",
    key: item.id,
    groupId: group.id,
    groupName: group.name,
    poz: item.poz_no,
    description: item.description,
    unit: item.unit,
    quantity: formatQuantity(item.quantity),
    unitPrice: isUnpriced ? EMPTY_PRICE : formatMoney(item.customer?.unit_price),
    amount: isUnpriced ? EMPTY_PRICE : formatMoney(item.customer?.amount),
    isUnpriced,
  };
}

/** Grup ara toplamı: yalnız FİYATLI kalemlerin tutarı (kayıpsız); hiç fiyatlı yoksa "—". */
function subtotalAmount(group: CustomerSourceGroup): string {
  const amounts = group.items
    .filter((item) => !isUnpricedItem(item))
    .map((item) => item.customer?.amount)
    .filter((amount): amount is string => amount !== null && amount !== undefined);
  return amounts.length === 0 ? EMPTY_PRICE : formatMoney(sumDecimalStrings(amounts));
}

function groupRows(group: CustomerSourceGroup): CustomerPrintRow[] {
  const base = { groupId: group.id, groupName: group.name };
  return [
    { ...BLANK_ROW, ...base, kind: "group", key: `${group.id}:head`, name: group.name },
    ...group.items.map((item) => itemRow(group, item)),
    { ...BLANK_ROW, ...base, kind: "subtotal", key: `${group.id}:sum`, name: `${group.name} ara toplamı`, amount: subtotalAmount(group) },
  ];
}

function unpricedNote(count: number): string | null {
  return count > 0 ? `* Fiyatı belirlenmemiş ${count} kalem toplama dahil değildir.` : null;
}

function totalRows(revision: CustomerSourceRevision): TotalRow[] {
  const { customer } = revision.totals;
  return [
    { label: "Toplam (KDV hariç)", value: formatTotal(customer.net), tone: "net" },
    { label: `KDV ${formatPct(revision.vat_pct)}`, value: formatTotal(customer.vat) },
    { label: "Genel toplam", value: formatTotal(customer.gross), tone: "gross" },
  ];
}

export interface CustomerPrintInput {
  offer: PrintOfferSource;
  revision: CustomerSourceRevision;
  company: PrintCompanySource | null;
}

export function buildCustomerPrintModel({ offer, revision, company }: CustomerPrintInput): CustomerPrintModel {
  const rows = revision.groups.filter((group) => group.items.length > 0).flatMap(groupRows);
  const frame = buildPrintFrame({ offer, revision, company, kind: "isveren" });
  return {
    frame,
    pages: paginateOfferRows(rows, PORTRAIT_LAYOUT, closingPartsOf(frame)),
    totals: totalRows(revision),
    footnote: unpricedNote(revision.totals.unpriced_count),
  };
}
