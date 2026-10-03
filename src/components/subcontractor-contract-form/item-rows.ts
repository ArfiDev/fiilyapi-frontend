import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";

/**
 * FSO 132 / 160 · poz tablosunun GRUP başlıkları. Grup, kalemin
 * `source_contract_item_id` → işveren kalem grubu üzerinden TÜREK gelir
 * (`SubcontractorContractItemGroup`; ayrı grup tablosu yoktur). Gruplar
 * kalemlerin GELİŞ SIRASINA göre oluşur — sunucu `sort_order`'ı zaten
 * uygulamıştır, istemci yeniden sıralamaz.
 *
 * Grubu olmayan kalemler (elle eklenen satırlar) `group: null` taşır ve
 * BAŞLIKSIZ tek bir kümede toplanır — satır gizlenmez.
 */
export interface ContractItemGroupRow {
  key: string;
  /** `null` → başlık satırı basılmaz (mockup'ta grupsuz satır çizilmemiştir). */
  name: string | null;
  items: SubcontractorContractItemResponse[];
}

export function groupContractItems(
  items: readonly SubcontractorContractItemResponse[],
): ContractItemGroupRow[] {
  const groups: ContractItemGroupRow[] = [];
  for (const item of items) {
    const key = item.group?.id ?? "__ungrouped__";
    const last = groups.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.push({ key, name: item.group?.name ?? null, items: [item] });
  }
  return groups;
}
