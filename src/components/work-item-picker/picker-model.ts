/**
 * TKL-F2.3 · "Katalogdan Poz Ekle" seçicisinin SAF modeli (TKL-F2-PLAN §1.5, §2.3).
 * React'sız; durum DEĞİŞTİRİLMEZ (her işlem yeni harita döner). ÇEKİRDEK bölge:
 * `earned-value` ithal edilmez.
 *
 * 🔴 Para/miktar yolu: girdi metni `lib/tr-decimal` ile okunur (T30: nokta binlik, virgül
 * ondalık, belirsiz "28.5" REDDEDİLİR); sonuç kayıpsız ondalık METİNdir, tutar ve Σ
 * `lib/decimal` string aritmetiğiyle hesaplanır — `Number()` YOK.
 */
import type { EmployerContractItemsResponse } from "@/lib/api/hooks/useContract";
import type { EmployerContractItemsBulkCreateRequest } from "@/lib/api/hooks/useContractMutations";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";
import { isZeroDecimalString, multiplyDecimalStrings, sumDecimalStrings } from "@/lib/decimal";
import {
  decimalDigitCounts,
  parseQuantityInput,
  parseRefPriceInput,
  REF_PRICE_AMBIGUOUS_DOT,
  type TrDecimalParse,
} from "@/lib/tr-decimal";
import { filterWorkItems, formatPrice, sortByPozNo } from "@/components/work-item-catalog/work-item-model";

/**
 * Tek istekte en çok kalem. Değer openapi `EmployerContractItemsBulkCreate.items.maxItems`tir;
 * `picker-limits.test.ts` sözleşmeden OKUYUP bu sabitle karşılaştırır. Parçalı gönderim
 * YAZILMAZ: uç hep-ya-hiç'tir, parçalamak o semantiği bozar.
 */
export const MAX_BULK_ITEMS = 200;

/**
 * ⚠️ Backend `quantity`/`unit_price` için hane sınırı TAŞIMAZ (openapi'de yok; kolonlar
 * `Numeric(14,3)` / `Numeric(18,2)`, fazla kesir PG'de SESSİZCE yuvarlanır) → bu istemci
 * korkuluğu TEK savunmadır (TKL-F2-PLAN §0, risk 5).
 */
const QUANTITY_FRACTION_DIGITS = 3;
const QUANTITY_INTEGER_DIGITS = 11;
const PRICE_FRACTION_DIGITS = 2;
const PRICE_INTEGER_DIGITS = 16;

const QUANTITY_REQUIRED = "Miktar girin";
const QUANTITY_NOT_POSITIVE = "Miktar 0'dan büyük olmalı";
const PRICE_REQUIRED = "Birim fiyat girin";
const QUANTITY_FRACTION_LIMIT = "En fazla 3 ondalık";
const PRICE_FRACTION_LIMIT = "En fazla 2 ondalık";
const QUANTITY_DIGIT_LIMIT = "En fazla 11 basamak";
const PRICE_DIGIT_LIMIT = "En fazla 16 basamak";

export type BlockReason = { kind: "linked"; groupName: string } | { kind: "code" };

export interface PickerRow {
  item: WorkItemRead;
  /** null = seçilebilir. */
  block: BlockReason | null;
}

export interface RowInput {
  selected: boolean;
  /** Kullanıcının yazdığı HAM metin (TR biçimi). */
  quantity: string;
  unitPrice: string;
}

export type PickerInputs = ReadonlyMap<string, RowInput>;

export interface ResolvedEntry {
  item: WorkItemRead;
  /** Kayıpsız ondalık metin (nokta ondalık). */
  quantity: string;
  unitPrice: string;
}

export interface RowProblem {
  row: PickerRow;
  message: string;
}

export interface Resolution {
  /** Seçili VE geçerli satırlar — gövdeye girecekler. */
  entries: ResolvedEntry[];
  /** Seçili ama eksik/hatalı satırlar. */
  problems: RowProblem[];
  /** Seçili satır sayısı (geçerli + hatalı). */
  selectedCount: number;
}

export interface PickerFilter {
  query: string;
  /** null = "Tüm disiplinler". */
  disciplineId: string | null;
  hideInContract: boolean;
}

export interface DisciplineSection {
  discipline: WorkItemRead["discipline"];
  rows: PickerRow[];
}

type ContractGroups = EmployerContractItemsResponse["groups"];

const EMPTY_INPUT: RowInput = { selected: false, quantity: "", unitPrice: "" };

function normalizeCode(code: string): string {
  return code.trim().toLocaleUpperCase("tr-TR");
}

/**
 * Katalog satırlarını sözleşmedeki mevcut kalemlerle eşler (bellek içi; ayrı istek YOK).
 * (a) `catalog_item_id` bu sözleşmede zaten bağlı → "linked"; (b) bağsız ama aynı `code`
 * (= poz no) başka bir kalemde kullanılıyor → "code". Backend ikisini de engellemez /
 * ikincisinde 409 verir (§0) — istemci korkuluğu + sunucu son savunma.
 */
export function buildPickerRows(items: readonly WorkItemRead[], groups: ContractGroups): PickerRow[] {
  const linkedGroup = new Map<string, string>();
  const usedCodes = new Set<string>();
  for (const group of groups) {
    for (const contractItem of group.items) {
      usedCodes.add(normalizeCode(contractItem.code));
      if (contractItem.catalog_item_id !== null && !linkedGroup.has(contractItem.catalog_item_id)) {
        linkedGroup.set(contractItem.catalog_item_id, group.name);
      }
    }
  }
  return items.map((item) => {
    const groupName = linkedGroup.get(item.id);
    if (groupName !== undefined) return { item, block: { kind: "linked", groupName } };
    if (usedCodes.has(normalizeCode(item.poz_no))) return { item, block: { kind: "code" } };
    return { item, block: null };
  });
}

export function blockReasonText(block: BlockReason): string {
  return block.kind === "linked"
    ? `Sözleşmede var · ${block.groupName}`
    : "Bu poz no sözleşmede başka bir kalemde kullanılıyor";
}

/**
 * Birim fiyat önerisi (T32/S-T8 sırası): son fiyat → referans fiyat → boş. Maskeli rolde
 * (`limited`) ikisi de null gelir → boş; hiçbir şey uydurulmaz. TR biçiminde ("1.250,50").
 */
export function suggestUnitPrice(item: WorkItemRead): string {
  const price = item.last_price?.price ?? item.ref_price;
  return price === null || price === undefined ? "" : formatPrice(price);
}

function withInput(inputs: PickerInputs, id: string, input: RowInput): PickerInputs {
  const next = new Map(inputs);
  next.set(id, input);
  return next;
}

/** Satır seçilirken boş B.F. kutusu öneriyle dolar; kullanıcının yazdığı ASLA ezilmez. */
function selectInput(row: PickerRow, current: RowInput): RowInput {
  const unitPrice = current.unitPrice.trim() === "" ? suggestUnitPrice(row.item) : current.unitPrice;
  return { ...current, selected: true, unitPrice };
}

export function toggleRow(inputs: PickerInputs, row: PickerRow, selected: boolean): PickerInputs {
  if (row.block !== null) return inputs;
  const current = inputs.get(row.item.id) ?? EMPTY_INPUT;
  if (current.selected === selected) return inputs;
  return withInput(inputs, row.item.id, selected ? selectInput(row, current) : { ...current, selected: false });
}

/** Başlık kutusu: yalnız verilen (görünür) VE seçilebilir satırlar. */
export function toggleRows(inputs: PickerInputs, rows: readonly PickerRow[], selected: boolean): PickerInputs {
  return rows.reduce((acc, row) => toggleRow(acc, row, selected), inputs);
}

/** Miktar yazmak satırı otomatik seçer (BoqItemPicker alışkanlığı); silmek seçimi bozmaz. */
export function setQuantity(inputs: PickerInputs, row: PickerRow, text: string): PickerInputs {
  if (row.block !== null) return inputs;
  const current = inputs.get(row.item.id) ?? EMPTY_INPUT;
  const typed = { ...current, quantity: text };
  const next = !current.selected && text.trim() !== "" ? selectInput(row, typed) : typed;
  return withInput(inputs, row.item.id, next);
}

export function setUnitPrice(inputs: PickerInputs, row: PickerRow, text: string): PickerInputs {
  if (row.block !== null) return inputs;
  const current = inputs.get(row.item.id) ?? EMPTY_INPUT;
  return withInput(inputs, row.item.id, { ...current, unitPrice: text });
}

function digitLimitError(
  value: string,
  limits: { fraction: number; integer: number },
  messages: { fraction: string; integer: string },
): string | null {
  const digits = decimalDigitCounts(value);
  if (digits.fraction > limits.fraction) return messages.fraction;
  if (digits.integer > limits.integer) return messages.integer;
  return null;
}

function parseError(parsed: TrDecimalParse, required: string): string | null {
  if (parsed.kind === "invalid") return required;
  if (parsed.kind === "ambiguous") return REF_PRICE_AMBIGUOUS_DOT;
  return null;
}

function quantityError(raw: string): string | null {
  const parsed = parseQuantityInput(raw);
  const syntax = parseError(parsed, QUANTITY_REQUIRED);
  if (syntax !== null || parsed.kind !== "ok") return syntax;
  const limit = digitLimitError(
    parsed.value,
    { fraction: QUANTITY_FRACTION_DIGITS, integer: QUANTITY_INTEGER_DIGITS },
    { fraction: QUANTITY_FRACTION_LIMIT, integer: QUANTITY_DIGIT_LIMIT },
  );
  if (limit !== null) return limit;
  return isZeroDecimalString(parsed.value) ? QUANTITY_NOT_POSITIVE : null;
}

function priceError(raw: string): string | null {
  const parsed = parseRefPriceInput(raw);
  const syntax = parseError(parsed, PRICE_REQUIRED);
  if (syntax !== null || parsed.kind !== "ok") return syntax;
  return digitLimitError(
    parsed.value,
    { fraction: PRICE_FRACTION_DIGITS, integer: PRICE_INTEGER_DIGITS },
    { fraction: PRICE_FRACTION_LIMIT, integer: PRICE_DIGIT_LIMIT },
  );
}

/** Satırın TEK ilk hatası (miktar → birim fiyat); geçerliyse null. B.F. 0 serbesttir (backend ≥ 0). */
export function validateRow(input: Pick<RowInput, "quantity" | "unitPrice">): string | null {
  return quantityError(input.quantity) ?? priceError(input.unitPrice);
}

/** Seçili satırları doğrular ve gövdeye girecek kayıpsız değerleri çözer. Sıra: verilen satır sırası. */
export function resolveSelection(rows: readonly PickerRow[], inputs: PickerInputs): Resolution {
  const entries: ResolvedEntry[] = [];
  const problems: RowProblem[] = [];
  let selectedCount = 0;
  for (const row of rows) {
    const input = inputs.get(row.item.id);
    if (row.block !== null || input === undefined || !input.selected) continue;
    selectedCount += 1;
    const message = validateRow(input);
    const quantity = parseQuantityInput(input.quantity);
    const unitPrice = parseRefPriceInput(input.unitPrice);
    if (message !== null || quantity.kind !== "ok" || unitPrice.kind !== "ok") {
      problems.push({ row, message: message ?? QUANTITY_REQUIRED });
      continue;
    }
    entries.push({ item: row.item, quantity: quantity.value, unitPrice: unitPrice.value });
  }
  return { entries, problems, selectedCount };
}

/** Σ miktar × birim fiyat — kayıpsız ondalık metin (`0.1 × 3 = 0.3`). */
export function totalAmount(entries: readonly ResolvedEntry[]): string {
  return sumDecimalStrings(entries.map((entry) => multiplyDecimalStrings(entry.quantity, entry.unitPrice)));
}

/**
 * Toplu uç gövdesi (§2.3): `code = poz_no`, `description = name`, `unit = uom`,
 * `catalog_item_id = id` (T4 — bağ YALNIZ bu uçta kurulur), `sort_order` = taban + sıra.
 * Sayılar dot-decimal METİN. Yalnız `resolveSelection`ın geçerli girdileriyle çağrılır.
 */
export function buildBulkBody(
  entries: readonly ResolvedEntry[],
  groupId: string,
  baseSortOrder: number,
): EmployerContractItemsBulkCreateRequest {
  return {
    items: entries.map((entry, index) => ({
      group_id: groupId,
      code: entry.item.poz_no,
      description: entry.item.name,
      unit: entry.item.uom,
      quantity: entry.quantity,
      unit_price: entry.unitPrice,
      sort_order: baseSortOrder + index,
      catalog_item_id: entry.item.id,
    })),
  };
}

/** tr-TR arama (poz no + tanım) · disiplin · "sözleşmede olanları gizle". */
export function filterRows(rows: readonly PickerRow[], filter: PickerFilter): PickerRow[] {
  const kept = new Set(
    filterWorkItems(
      rows.map((row) => row.item),
      { query: filter.query, disciplineId: filter.disciplineId },
    ).map((item) => item.id),
  );
  return rows.filter((row) => kept.has(row.item.id) && !(filter.hideInContract && row.block !== null));
}

/** Disiplin başlık satırlarına böler: disiplin listesi sırası, bölüm içi poz no sırası; bilinmeyen disiplin sona. */
export function groupByDiscipline(
  rows: readonly PickerRow[],
  disciplines: readonly WorkDisciplineRead[],
): DisciplineSection[] {
  const rowById = new Map(rows.map((row) => [row.item.id, row]));
  const byDiscipline = new Map<string, DisciplineSection>();
  for (const item of sortByPozNo(rows.map((row) => row.item))) {
    const row = rowById.get(item.id);
    if (row === undefined) continue;
    const section = byDiscipline.get(item.discipline.id) ?? { discipline: item.discipline, rows: [] };
    section.rows.push(row);
    byDiscipline.set(item.discipline.id, section);
  }
  const rank = new Map(
    [...disciplines].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code, "tr-TR")).map((d, i) => [d.id, i]),
  );
  return [...byDiscipline.values()].sort(
    (a, b) =>
      (rank.get(a.discipline.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.discipline.id) ?? Number.MAX_SAFE_INTEGER) ||
      a.discipline.code.localeCompare(b.discipline.code, "tr-TR"),
  );
}
