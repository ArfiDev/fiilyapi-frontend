/**
 * TKL-F2.3 · "Katalogdan Poz Ekle" seçicisinin SAF modeli (TKL-F2-PLAN §1.5, §2.3).
 * React'sız; durum DEĞİŞTİRİLMEZ (her işlem yeni harita döner). ÇEKİRDEK bölge:
 * `earned-value` ithal edilmez.
 *
 * 🔴 Para/miktar yolu: girdi metni `lib/tr-decimal` ile okunur (T30: nokta binlik, virgül
 * ondalık, belirsiz "28.5" REDDEDİLİR); sonuç kayıpsız ondalık METİNdir, tutar ve Σ
 * `lib/decimal` string aritmetiğiyle hesaplanır — `Number()` YOK.
 */
import { NEW_GROUP_OPTION } from "@/components/contract-item-form/constants";
import type { EmployerContractItemsBulkCreateRequest } from "@/lib/api/hooks/useContractMutations";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";
import { compareDecimalStrings, isZeroDecimalString, multiplyDecimalStrings, sumDecimalStrings } from "@/lib/decimal";
import {
  decimalDigitCounts,
  parseQuantityInput,
  parseRefPriceInput,
  REF_PRICE_AMBIGUOUS_DOT,
  type TrDecimalParse,
} from "@/lib/tr-decimal";
import { lineAmount } from "@/components/offer-convert/convert-money";
import { filterWorkItems, formatPrice, sortByPozNo } from "@/components/work-item-catalog/work-item-model";

import { CONTRACT_RULES, type DecimalBound, type PickerPriceMessages, type PickerRules } from "./picker-rules";

/**
 * Tek istekte en çok kalem. Değer openapi `EmployerContractItemsBulkCreate.items.maxItems`tir;
 * `picker-limits.test.ts` sözleşmeden OKUYUP bu sabitle karşılaştırır. Parçalı gönderim
 * YAZILMAZ: uç hep-ya-hiç'tir, parçalamak o semantiği bozar.
 */
export const MAX_BULK_ITEMS = 200;

/**
 * Hane sınırları HEDEFE göredir (`picker-rules.ts` `quantityBound`/`priceBound`): sözleşmede backend sınır
 * taşımaz (istemci korkuluğu TEK savunma, TKL-F2-PLAN §0 risk 5); teklifte backend `le=` sınırı kalem
 * tablosuyla TEK KAYNAKtan gelir (TKL-F3.6.1).
 */

const QUANTITY_REQUIRED = "Miktar girin";
const QUANTITY_NOT_POSITIVE = "Miktar 0'dan büyük olmalı";
/** `contract-item-form/validate.ts` ONAYLI metinleri (birebir; `picker-model.test.ts` drift bekçisi). Fiyat metinleri `picker-rules`te (hedefe göre). */
const QUANTITY_NOT_A_NUMBER = "Miktar sayı olmalıdır.";

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
  /**
   * Kayıpsız ondalık metin. `null` YALNIZ fiyatın isteğe bağlı olduğu hedefte (teklif maliyet B.F.)
   * ve kutu BOŞ bırakıldığında; sözleşme hedefinde her zaman dolu.
   */
  unitPrice: string | null;
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

/**
 * Seçicinin hedef grup görünümü: sözleşme grupları (`EmployerContractItemsResponse["groups"]`) ve teklif
 * grupları (`code` = poz no olarak eşlenir) bu YAPISAL tipe uyar — seçici hedefi tanımaz.
 */
export interface PickerGroup {
  id: string;
  name: string;
  sort_order: number;
  items: readonly { code: string; catalog_item_id: string | null; sort_order: number; isExcluded?: boolean }[];
}

type HostGroups = readonly PickerGroup[];

/** ÜS-F2-19: varsayılan hedef = sort_order'ı en büyük grup; grupsuz sözleşmede "+ Yeni Grup". */
export function defaultGroupId(groups: HostGroups): string {
  const last = groups.reduce<PickerGroup | null>(
    (best, group) => (best === null || group.sort_order >= best.sort_order ? group : best),
    null,
  );
  return last === null ? NEW_GROUP_OPTION : last.id;
}

/**
 * Hedef grup TÜRETİLMİŞ değerdir (TKL-F2.4.1 ORTA-2): kullanıcının tuttuğu `choice` artık `groups`ta
 * (ya da açılmış `createdGroup`ta) yoksa — 422 tazelemesi grubu silmiş olabilir — varsayılana düşer.
 * Select gösterimi ile gövde AYNI sonucu kullanır; seçici başka grubu gösterip eskisine yazamaz.
 * Açılmış grup varken "+ Yeni Grup" o gruba çözülür (ikinci grup açılmaz, §2.5).
 */
export function resolveTargetGroup(
  choice: string,
  groups: HostGroups,
  createdGroup: { id: string } | null,
): string {
  const isKnown = groups.some((group) => group.id === choice) || (createdGroup !== null && createdGroup.id === choice);
  const resolved = choice === NEW_GROUP_OPTION || isKnown ? choice : defaultGroupId(groups);
  return resolved === NEW_GROUP_OPTION && createdGroup !== null ? createdGroup.id : resolved;
}

const EMPTY_INPUT: RowInput = { selected: false, quantity: "", unitPrice: "" };

/**
 * Katalog satırlarını sözleşmedeki mevcut kalemlerle eşler (bellek içi; ayrı istek YOK).
 * (a) `catalog_item_id` bu sözleşmede zaten bağlı → "linked"; (b) bağsız ama aynı `code`
 * (= poz no) başka bir kalemde kullanılıyor → "code". Karşılaştırma BİREBİR (backend
 * `list_employer_item_codes` `code.in_` ile aynı; harf/boşluk normalizasyonu YOK — TKL-F2.4.1 DÜŞÜK-5). Backend ikisini de engellemez /
 * ikincisinde 409 verir (§0) — istemci korkuluğu + sunucu son savunma.
 */
export function buildPickerRows(
  items: readonly WorkItemRead[],
  groups: HostGroups,
  rules: PickerRules = CONTRACT_RULES,
): PickerRow[] {
  const linkedGroup = new Map<string, string>();
  const usedCodes = new Set<string>();
  for (const group of groups) {
    for (const contractItem of group.items) {
      usedCodes.add(contractItem.code);
      if (contractItem.catalog_item_id !== null && !linkedGroup.has(contractItem.catalog_item_id)) {
        linkedGroup.set(contractItem.catalog_item_id, group.name);
      }
    }
  }
  return items.map((item) => {
    const groupName = linkedGroup.get(item.id);
    if (groupName !== undefined) return { item, block: { kind: "linked", groupName } };
    if (rules.blocksOnCodeCollision && usedCodes.has(item.poz_no)) return { item, block: { kind: "code" } };
    return { item, block: null };
  });
}

export function blockReasonText(block: BlockReason, rules: PickerRules = CONTRACT_RULES): string {
  return block.kind === "linked" ? `${rules.linkedLabel} · ${block.groupName}` : rules.codeBlockText;
}

/**
 * Birim fiyat önerisi (T32/S-T8 sırası): son fiyat → referans fiyat → boş. Maskeli rolde
 * (`limited`) ikisi de null gelir → boş; hiçbir şey uydurulmaz. TR biçiminde ("1.250,50").
 */
export function suggestUnitPrice(item: WorkItemRead): string {
  const price = suggestedPriceValue(item);
  return price === null ? "" : formatPrice(price);
}

/** Aynı öneri, kayıpsız ondalık METİN olarak (nokta ondalık); yoksa/maskeliyse null. */
export function suggestedPriceValue(item: WorkItemRead): string | null {
  return item.last_price?.price ?? item.ref_price ?? null;
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

/**
 * Satır girdileri kullanıcı emeği taşıyor mu: seçili · miktar · KENDİ yazdığı birim fiyat.
 * Seçimde otomatik dolan ÖNERİ fiyatı tek başına emek sayılmaz (seç-sonra-kaldır temiz kalır).
 */
export function isPickerInputsDirty(rows: readonly PickerRow[], inputs: PickerInputs): boolean {
  const suggestionById = new Map(rows.map((row) => [row.item.id, suggestUnitPrice(row.item)]));
  return [...inputs.entries()].some(
    ([id, input]) =>
      input.selected ||
      input.quantity.trim() !== "" ||
      (input.unitPrice.trim() !== "" && input.unitPrice !== suggestionById.get(id)),
  );
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

/**
 * "Tümünü seç" TAVANLI: görünen seçilebilir satırları sırayla seçer; mevcut seçimle (görünmeyenler dahil)
 * toplam `max`ı AŞMAZ. `isTruncated` = tavan yüzünden en az bir satır seçilmedi.
 */
export function selectRowsUpTo(
  inputs: PickerInputs,
  rows: readonly PickerRow[],
  max: number,
): { inputs: PickerInputs; isTruncated: boolean } {
  let room = Math.max(0, max - [...inputs.values()].filter((input) => input.selected).length);
  let next = inputs;
  let isTruncated = false;
  for (const row of rows) {
    if (row.block !== null || next.get(row.item.id)?.selected === true) continue;
    if (room === 0) {
      isTruncated = true;
      break;
    }
    next = toggleRow(next, row, true);
    room -= 1;
  }
  return { inputs: next, isTruncated };
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

/** Önce kesir, sonra aşım (kalem tablosuyla aynı sıra). */
function boundError(value: string, bound: DecimalBound): string | null {
  const digits = decimalDigitCounts(value);
  if (digits.fraction > bound.fraction) return bound.fractionMessage;
  if (bound.kind === "digits") return digits.integer > bound.integer ? bound.integerMessage : null;
  return compareDecimalStrings(value, bound.max) > 0 ? bound.maxMessage : null;
}

interface FieldMessages {
  required: string;
  notANumber: string;
  negative: string;
}

/** Boş → "girin"; "-" önekli → negatif (gövde okunabiliyorsa); okunamayan → "sayı olmalı"; belirsiz → virgül metni. */
function syntaxError(raw: string, parse: (text: string) => TrDecimalParse, messages: FieldMessages): string | null {
  const text = raw.trim();
  if (text === "") return messages.required;
  const isNegative = text.startsWith("-");
  const parsed = parse(isNegative ? text.slice(1) : text);
  if (parsed.kind === "invalid") return messages.notANumber;
  if (parsed.kind === "ambiguous") return REF_PRICE_AMBIGUOUS_DOT;
  return isNegative ? messages.negative : null;
}

function quantityError(raw: string, rules: PickerRules): string | null {
  const syntax = syntaxError(raw, parseQuantityInput, {
    required: QUANTITY_REQUIRED,
    notANumber: QUANTITY_NOT_A_NUMBER,
    negative: QUANTITY_NOT_POSITIVE,
  });
  if (syntax !== null) return syntax;
  const parsed = parseQuantityInput(raw);
  if (parsed.kind !== "ok") return QUANTITY_NOT_A_NUMBER;
  const limit = boundError(parsed.value, rules.quantityBound);
  if (limit !== null) return limit;
  return isZeroDecimalString(parsed.value) ? QUANTITY_NOT_POSITIVE : null;
}

function priceError(raw: string, rules: PickerRules): string | null {
  // Fiyatın isteğe bağlı olduğu hedefte (teklif maliyet B.F.) boş kutu GEÇERLİDİR: "fiyatsız kalem".
  if (!rules.isPriceRequired && raw.trim() === "") return null;
  const messages: PickerPriceMessages = rules.priceMessages;
  const syntax = syntaxError(raw, parseRefPriceInput, messages);
  if (syntax !== null) return syntax;
  const parsed = parseRefPriceInput(raw);
  if (parsed.kind !== "ok") return messages.notANumber;
  return boundError(parsed.value, rules.priceBound);
}

/** Satırın TEK ilk hatası (miktar → birim fiyat); geçerliyse null. B.F. 0 serbesttir (backend ≥ 0). */
export function validateRow(
  input: Pick<RowInput, "quantity" | "unitPrice">,
  rules: PickerRules = CONTRACT_RULES,
): string | null {
  return quantityError(input.quantity, rules) ?? priceError(input.unitPrice, rules);
}

/** Seçili satırları doğrular ve gövdeye girecek kayıpsız değerleri çözer. Sıra: verilen satır sırası. */
export function resolveSelection(
  rows: readonly PickerRow[],
  inputs: PickerInputs,
  rules: PickerRules = CONTRACT_RULES,
): Resolution {
  const entries: ResolvedEntry[] = [];
  const problems: RowProblem[] = [];
  let selectedCount = 0;
  for (const row of rows) {
    const input = inputs.get(row.item.id);
    if (row.block !== null || input === undefined || !input.selected) continue;
    selectedCount += 1;
    if (rules.entryMode === "selectOnly") {
      // Miktar/fiyat tutulmaz: doğrulama YOK; boş değerler yalnız tip gereği (gövde kalem kimliğinden kurulur).
      entries.push({ item: row.item, quantity: "", unitPrice: null });
      continue;
    }
    const message = validateRow(input, rules);
    const quantity = parseQuantityInput(input.quantity);
    const unitPrice = parseRefPriceInput(input.unitPrice);
    const isPriceBlank = !rules.isPriceRequired && input.unitPrice.trim() === "";
    if (message !== null || quantity.kind !== "ok" || (!isPriceBlank && unitPrice.kind !== "ok")) {
      problems.push({ row, message: message ?? QUANTITY_REQUIRED });
      continue;
    }
    entries.push({
      item: row.item,
      quantity: quantity.value,
      unitPrice: unitPrice.kind === "ok" && !isPriceBlank ? unitPrice.value : null,
    });
  }
  return { entries, problems, selectedCount };
}

/**
 * Σ miktar × birim fiyat — kayıpsız ondalık metin (`0.1 × 3 = 0.3`). Fiyatsız (`null`) satırlar toplama
 * GİRMEZ (teklif "Eklenecek maliyet": yalnız maliyeti dolu satırlar); sayıları `unpricedCount`.
 */
export function totalAmount(entries: readonly ResolvedEntry[], rules: PickerRules = CONTRACT_RULES): string {
  const amounts = entries.flatMap((entry) => {
    if (entry.unitPrice === null) return [];
    // Dönüştürme: sunucu SATIR BAŞI ROUND_HALF_UP yazar → Σ de aynı (tablo Σ'sıyla kuruşu kuruşuna eşit).
    return [rules.roundsLineAmounts ? lineAmount(entry.quantity, entry.unitPrice) : multiplyDecimalStrings(entry.quantity, entry.unitPrice)];
  });
  return sumDecimalStrings(amounts);
}

/** Fiyatsız (maliyet B.F. boş) seçili satır sayısı — sözleşme hedefinde her zaman 0. */
export function unpricedCount(entries: readonly ResolvedEntry[]): number {
  return entries.filter((entry) => entry.unitPrice === null).length;
}

/** Sözleşme gövdesi fiyatı ZORUNLU ister; `null` kalmışsa çağıran akış (hedef kuralları) bozulmuştur. */
export type PricedEntry = ResolvedEntry & { unitPrice: string };

export function requirePricedEntries(entries: readonly ResolvedEntry[]): PricedEntry[] {
  return entries.map((entry) => {
    if (entry.unitPrice === null) throw new Error("requirePricedEntries: birim fiyat zorunlu hedefte fiyatsız satır");
    return { ...entry, unitPrice: entry.unitPrice };
  });
}

/**
 * Toplu uç gövdesi (§2.3): `code = poz_no`, `description = name`, `unit = uom`,
 * `catalog_item_id = id` (T4 — bağ YALNIZ bu uçta kurulur), `sort_order` = taban + sıra.
 * Sayılar dot-decimal METİN. Yalnız `resolveSelection`ın geçerli girdileriyle çağrılır.
 */
export function buildBulkBody(
  entries: readonly PricedEntry[],
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

/**
 * Bir seçimde en çok kaç kalem seçilebilir + aşılınca bant metni. `priced`: tek istek tavanı (`MAX_BULK_ITEMS`).
 * `selectOnly` (şablon): hedefteki TOPLAM tavan − mevcut kalem sayısı (eksiye düşmez); metin backend'inkiyle aynı.
 * `priced` + toplam tavan: YEREL gövdeli hedefte (dönüştürme 2000, çıkarılmış satırlar sayılmaz) tavan YALNIZ toplam tavan − dahil
 * (HTTP isteği yok → tek seferlik 200 sınırı YOK, F5.4b); HTTP gövdeli priced hedefte tek istek tavanıyla KÜÇÜK olan.
 */
export function selectionLimit(rules: PickerRules, groups: HostGroups): { max: number; message: string } {
  const bulk = { max: MAX_BULK_ITEMS, message: `Tek seferde en fazla ${MAX_BULK_ITEMS} ${rules.words.noun} eklenebilir` };
  if (rules.maxTotalItems === null) return bulk;
  // `isExcluded` satırlar (dönüştürmede çıkarılmış) gövdeye girmez → toplam tavana SAYILMAZ.
  const existing = groups.reduce((sum, group) => sum + group.items.filter((item) => item.isExcluded !== true).length, 0);
  const total = { max: Math.max(0, rules.maxTotalItems - existing), message: rules.totalCapMessage };
  if (rules.entryMode === "selectOnly" || rules.usesLocalGroups) return total;
  return total.max < bulk.max ? total : bulk;
}
