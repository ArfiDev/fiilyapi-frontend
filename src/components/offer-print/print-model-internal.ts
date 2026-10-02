/**
 * TKL-F3.7 · İÇ DÖKÜM modeli (A4 yatay, 11 kolon): işverene verilen alanlara ek olarak A-s/birim,
 * maliyet B.F., maliyet, gider %, kâr %, grup maliyeti/a-s ve maliyet · genel gider · kâr · toplam
 * adam-saat toplamları (TKL-F3-PLAN §5.1 "İç" sütunu).
 *
 * 🔴 İŞVEREN ÇIKTISI BU DOSYAYI ASLA İTHAL ETMEZ (`offer-print-leak-guard.test.ts`). Ters yön serbesttir.
 */
import { sumDecimalStrings } from "@/lib/decimal";
import { formatDecimal, formatQuantity } from "@/lib/format";

import {
  EMPTY_PRICE,
  LANDSCAPE_LAYOUT,
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

const UNIT_MHR_DIGITS = 2;

export interface InternalSourceItem {
  id: string;
  poz_no: string;
  description: string;
  unit: string;
  quantity: string | null;
  unit_mhr: string;
  cost_unit_price: string | null;
  overhead_pct: string | null;
  profit_pct: string | null;
  priced: boolean;
  customer: { unit_price: string | null; amount: string | null } | null;
  internal: { cost: string | null; profit_pct: string | null; man_hours: string | null };
}
export interface InternalSourceGroup {
  id: string;
  name: string;
  items: readonly InternalSourceItem[];
}
export interface InternalSourceRevision extends PrintRevisionSource {
  overhead_pct: string;
  profit_pct: string;
  groups: readonly InternalSourceGroup[];
  totals: {
    unpriced_count: number;
    /** SO-21: miktarı girilmemiş kalem sayısı. */
    unquantified_count: number;
    customer: { net: string | null; vat: string | null; gross: string | null };
    internal: {
      cost: string | null;
      overhead: string | null;
      profit: string | null;
      profit_pct: string | null;
      man_hours: string;
    };
  };
}

export interface InternalPrintRow {
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
  unitMhr: string;
  costUnitPrice: string;
  cost: string;
  overheadPct: string;
  profitPct: string;
  unitPrice: string;
  amount: string;
  /** Grup ara toplamı: Σ adam-saat. */
  manHours: string;
  isUnpriced: boolean;
}
export interface InternalPrintModel {
  frame: PrintFrame;
  pages: OfferPrintPage<InternalPrintRow>[];
  totals: TotalRow[];
}

const BLANK_ROW = {
  name: "",
  poz: "",
  description: "",
  unit: "",
  quantity: "",
  unitMhr: "",
  costUnitPrice: "",
  cost: "",
  overheadPct: "",
  profitPct: "",
  unitPrice: "",
  amount: "",
  manHours: "",
  isUnpriced: false,
} as const;

/** Dolu değerlerin kayıpsız toplamı; hiç dolu değer yoksa `null` ("—"). */
function sumOrNull(values: readonly (string | null | undefined)[]): string | null {
  const present = values.filter((value): value is string => value !== null && value !== undefined);
  return present.length === 0 ? null : sumDecimalStrings(present);
}

function itemRow(group: InternalSourceGroup, item: InternalSourceItem, revision: InternalSourceRevision): InternalPrintRow {
  const customer = item.customer;
  const isUnpriced = !item.priced || customer === null || customer.unit_price === null;
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
    unitMhr: formatDecimal(item.unit_mhr, UNIT_MHR_DIGITS),
    costUnitPrice: formatMoney(item.cost_unit_price),
    cost: formatMoney(item.internal.cost),
    overheadPct: formatPct(item.overhead_pct ?? revision.overhead_pct),
    profitPct: formatPct(item.internal.profit_pct ?? item.profit_pct ?? revision.profit_pct),
    unitPrice: isUnpriced ? EMPTY_PRICE : formatMoney(customer?.unit_price),
    amount: isUnpriced ? EMPTY_PRICE : formatMoney(customer?.amount),
    isUnpriced,
  };
}

function groupRows(group: InternalSourceGroup, revision: InternalSourceRevision): InternalPrintRow[] {
  const base = { groupId: group.id, groupName: group.name };
  const items = group.items.map((item) => itemRow(group, item, revision));
  const pricedAmounts = group.items.map((item) => (item.priced ? (item.customer?.amount ?? null) : null));
  return [
    { ...BLANK_ROW, ...base, kind: "group", key: `${group.id}:head`, name: group.name },
    ...items,
    {
      ...BLANK_ROW,
      ...base,
      kind: "subtotal",
      key: `${group.id}:sum`,
      name: `${group.name} ara toplamı`,
      cost: formatMoney(sumOrNull(group.items.map((item) => item.internal.cost))),
      manHours: formatQuantity(sumOrNull(group.items.map((item) => item.internal.man_hours))),
      amount: formatMoney(sumOrNull(pricedAmounts)),
    },
  ];
}

function totalRows(revision: InternalSourceRevision): TotalRow[] {
  const { customer, internal } = revision.totals;
  return [
    { label: "Toplam (KDV hariç)", value: formatTotal(customer.net), tone: "net" },
    { label: `KDV ${formatPct(revision.vat_pct)}`, value: formatTotal(customer.vat) },
    { label: "Genel toplam", value: formatTotal(customer.gross), tone: "gross" },
    { label: "Maliyet", value: formatTotal(internal.cost) },
    { label: `Genel gider (${formatPct(revision.overhead_pct)})`, value: formatTotal(internal.overhead) },
    { label: `Kâr (${formatPct(internal.profit_pct ?? revision.profit_pct)})`, value: formatTotal(internal.profit) },
    { label: "Toplam adam-saat", value: formatQuantity(internal.man_hours) },
    { label: "Fiyatsız kalem", value: String(revision.totals.unpriced_count) },
    { label: "Miktarsız kalem", value: String(revision.totals.unquantified_count) },
  ];
}

export interface InternalPrintInput {
  offer: PrintOfferSource;
  revision: InternalSourceRevision;
  company: PrintCompanySource | null;
}

export function buildInternalPrintModel({ offer, revision, company }: InternalPrintInput): InternalPrintModel {
  const rows = revision.groups.filter((group) => group.items.length > 0).flatMap((group) => groupRows(group, revision));
  const frame = buildPrintFrame({ offer, revision, company, kind: "ic" });
  return {
    frame,
    pages: paginateOfferRows(rows, LANDSCAPE_LAYOUT, closingPartsOf(frame)),
    totals: totalRows(revision),
  };
}
