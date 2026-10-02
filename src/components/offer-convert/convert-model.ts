/**
 * TKL-F5.2 · Teklif → Proje dönüştürme SAF modeli (plan §3). React'sız; her işlem YENİ durum döndürür (mutasyon YOK).
 * Para türevleri `convert-money`, satır/özet türevleri `convert-derive`, doğrulama `convert-validate`, gövde `convert-body`.
 */
import { trPriceInputValue, trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import type { OfferItemRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import type { WorkItemRead } from "@/lib/api/models";

import type { ConvertDraft, ConvertGroupDraft, ConvertRow } from "./convert-types";

/** ÜS-F5-17: serbest not YOK, yalnız sistem notu. */
export const NEW_ROW_NOTE = "Katalogdan eklendi · teklifte yoktu";

const ZERO_MONEY = "0.00";
const DISCIPLINE_COUNT_MIXED = 1;

type DisciplineMap = ReadonlyMap<string, string>;

const groupKeyOf = (id: string): string => `g:${id}`;
const offerRowKeyOf = (id: string): string => `o:${id}`;
const newRowKeyOf = (seq: number): string => `n:${seq}`;

function rowFromOfferItem(item: OfferItemRead, groupKey: string, disciplines?: DisciplineMap): ConvertRow {
  return {
    key: offerRowKeyOf(item.id),
    groupKey,
    offerItemId: item.id,
    catalogItemId: item.catalog_item_id,
    code: item.poz_no,
    description: item.description,
    unit: item.unit,
    offer: {
      qty: item.quantity,
      unitPrice: item.customer?.unit_price ?? null,
      amount: item.customer?.amount ?? ZERO_MONEY,
    },
    // Fiyatsız kalem (priced=false): B.F. BOŞ + zorunlu — 0 varsayılmaz (ÜS-F5-16).
    contract: { qtyRaw: trQuantityInputValue(item.quantity), bfRaw: trPriceInputValue(item.customer?.unit_price ?? null) },
    included: true,
    isNew: false,
    note: null,
    disciplineId: disciplines?.get(item.catalog_item_id) ?? null,
    codeEdited: false,
  };
}

/** Teklifin SON revizyonundan başlangıç durumu: grup sırası + kalem sırası korunur. */
export function rowsFromRevision(revision: OfferRevisionRead, disciplines?: DisciplineMap): ConvertDraft {
  const groups: ConvertGroupDraft[] = revision.groups.map((group) => ({
    key: groupKeyOf(group.id),
    name: group.name,
    offerName: group.name,
    disciplineId: null,
    nameEdited: false,
  }));
  const rows = revision.groups.flatMap((group) =>
    group.items.map((item) => rowFromOfferItem(item, groupKeyOf(group.id), disciplines)),
  );
  return { groups, rows, nextNewSeq: 0 };
}

/** Katalog yüklendikten SONRA disiplinleri doldurur (satırın kendi değeri varsa ezmez). */
export function applyCatalogDisciplines(draft: ConvertDraft, disciplines: DisciplineMap): ConvertDraft {
  return {
    ...draft,
    rows: draft.rows.map((row) => ({ ...row, disciplineId: row.disciplineId ?? disciplines.get(row.catalogItemId) ?? null })),
  };
}

function mapRow(draft: ConvertDraft, key: string, change: (row: ConvertRow) => ConvertRow): ConvertDraft {
  if (!draft.rows.some((row) => row.key === key)) return draft;
  return { ...draft, rows: draft.rows.map((row) => (row.key === key ? change(row) : row)) };
}

function mapGroup(draft: ConvertDraft, key: string, change: (group: ConvertGroupDraft) => ConvertGroupDraft): ConvertDraft {
  if (!draft.groups.some((group) => group.key === key)) return draft;
  return { ...draft, groups: draft.groups.map((group) => (group.key === key ? change(group) : group)) };
}

/** Teklif satırı: dahil ↔ çıkarıldı. Yeni (katalogdan) satırda çıkarmak = SİL (TDN:284). */
export function toggleIncluded(draft: ConvertDraft, key: string): ConvertDraft {
  const target = draft.rows.find((row) => row.key === key);
  if (!target) return draft;
  if (target.isNew) return { ...draft, rows: draft.rows.filter((row) => row.key !== key) };
  return mapRow(draft, key, (row) => ({ ...row, included: !row.included }));
}

/** Kutudaki metin AYNEN saklanır; geçerlilik `convert-validate`te (T30: belirsiz "28.5" sessizce okunmaz). */
export function setQty(draft: ConvertDraft, key: string, raw: string): ConvertDraft {
  return mapRow(draft, key, (row) => ({ ...row, contract: { ...row.contract, qtyRaw: raw } }));
}

export function setBf(draft: ConvertDraft, key: string, raw: string): ConvertDraft {
  return mapRow(draft, key, (row) => ({ ...row, contract: { ...row.contract, bfRaw: raw } }));
}

/** ÜS-F5-15: B.F. varsayılanı son fiyat → referans fiyat → boş; miktar boş + zorunlu. */
function rowFromCatalog(entry: WorkItemRead, groupKey: string, seq: number): ConvertRow {
  const price = entry.last_price?.price ?? entry.ref_price ?? null;
  return {
    key: newRowKeyOf(seq),
    groupKey,
    offerItemId: null,
    catalogItemId: entry.id,
    code: entry.poz_no,
    description: entry.name,
    unit: entry.uom,
    offer: { qty: null, unitPrice: null, amount: ZERO_MONEY },
    contract: { qtyRaw: "", bfRaw: trPriceInputValue(price) },
    included: true,
    isNew: true,
    note: NEW_ROW_NOTE,
    disciplineId: entry.discipline.id,
    codeEdited: false,
  };
}

/** Seçilen kalemleri hedef grubun SONUNA ekler (grup sırası korunur). */
export function addFromCatalog(draft: ConvertDraft, groupKey: string, entries: readonly WorkItemRead[]): ConvertDraft {
  if (entries.length === 0 || !draft.groups.some((group) => group.key === groupKey)) return draft;
  const added = entries.map((entry, index) => rowFromCatalog(entry, groupKey, draft.nextNewSeq + index));
  const rows = draft.groups.flatMap((group) => {
    const own = draft.rows.filter((row) => row.groupKey === group.key);
    return group.key === groupKey ? [...own, ...added] : own;
  });
  return { ...draft, rows, nextNewSeq: draft.nextNewSeq + entries.length };
}

export function renameGroup(draft: ConvertDraft, groupKey: string, name: string): ConvertDraft {
  return mapGroup(draft, groupKey, (group) => ({ ...group, name, nameEdited: true }));
}

export function setCode(draft: ConvertDraft, key: string, code: string): ConvertDraft {
  return mapRow(draft, key, (row) => ({ ...row, code, codeEdited: true }));
}

export function setGroupDiscipline(draft: ConvertDraft, groupKey: string, disciplineId: string | null): ConvertDraft {
  return mapGroup(draft, groupKey, (group) => ({ ...group, disciplineId }));
}

export function includedRows(draft: ConvertDraft): readonly ConvertRow[] {
  return draft.rows.filter((row) => row.included);
}

/** Gövdeye girecek gruplar: en az bir DAHİL satırı olanlar (tamamen çıkarılmış / boş grup GİRMEZ — SO-46). */
export function sentGroupKeys(draft: ConvertDraft): readonly string[] {
  const withIncluded = new Set(includedRows(draft).map((row) => row.groupKey));
  return draft.groups.filter((group) => withIncluded.has(group.key)).map((group) => group.key);
}

/** Backend `strip + birebir` karşılaştırması (SO-29/30/52). */
const normalizedName = (value: string): string => value.trim();

function duplicateKeys<T extends { key: string }>(items: readonly T[], valueOf: (item: T) => string): ReadonlySet<string> {
  const counts = new Map<string, number>();
  items.forEach((item) => counts.set(valueOf(item), (counts.get(valueOf(item)) ?? 0) + 1));
  return new Set(items.filter((item) => (counts.get(valueOf(item)) ?? 0) > 1).map((item) => item.key));
}

/** Adı başka bir GÖVDE grubuyla çakışan gruplar (ikisi de işaretlenir; düzenleyici yalnız bunlarda açılır). */
export function collidingGroupKeys(draft: ConvertDraft): ReadonlySet<string> {
  const sent = new Set(sentGroupKeys(draft));
  return duplicateKeys(
    draft.groups.filter((group) => sent.has(group.key)),
    (group) => normalizedName(group.name),
  );
}

/** Kodu başka bir DAHİL satırla çakışan satırlar (gruplar arası da). */
export function collidingRowKeys(draft: ConvertDraft): ReadonlySet<string> {
  return duplicateKeys(includedRows(draft), (row) => normalizedName(row.code));
}

/** Karışık disiplin: DAHİL satırların bilinen katalog disiplin kümesi > 1 (bilinmeyen sayılmaz). */
export function mixedGroupKeys(draft: ConvertDraft): ReadonlySet<string> {
  const byGroup = new Map<string, Set<string>>();
  includedRows(draft).forEach((row) => {
    if (row.disciplineId === null) return;
    byGroup.set(row.groupKey, (byGroup.get(row.groupKey) ?? new Set<string>()).add(row.disciplineId));
  });
  return new Set([...byGroup].filter(([, set]) => set.size > DISCIPLINE_COUNT_MIXED).map(([key]) => key));
}
