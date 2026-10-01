import type {
  SectionDistributionGroup,
  SectionDistributionItem,
  SectionDistributionResponse,
  SectionDistributionSection,
} from "@/lib/api/hooks/useSectionDistribution";
import { compareDecimalStrings } from "@/lib/decimal";
import { remainingQuantity, type DistributeRemainingItem } from "@/lib/distribute-remaining";
import { formatQuantity } from "@/lib/format";
import { sectionDistributionCellKey } from "@/lib/section-distribution-save";

/**
 * BDG · Bölüm Dağılımı ızgarasının SAF türevleri (React yok). Sözleşme
 * karşılığı: `components/contracts/distribution-derive.ts`. Hücre gösterimi,
 * renk sırası ve rozet "kapandı mı" kuralı oradan AYNEN kullanılır; burada
 * yalnız bölüm şemasına özgü olanlar var.
 */

const ZERO = "0";

/** Bölüm kolon başlığı: kod varsa "kod · ad" (taslak bölüm de aynı — rozet yok). */
export function sectionColumnTitle(
  section: Pick<SectionDistributionSection, "code" | "name">,
): string {
  return section.code === null || section.code.trim().length === 0
    ? section.name
    : `${section.code} · ${section.name}`;
}

/** Kalemin bir bölümdeki sunucu payı — yoksa `null` (hücre boş açılır). */
export function allocationQuantityForSection(
  item: SectionDistributionItem,
  sectionId: string,
): string | null {
  return item.allocations.find((allocation) => allocation.section_id === sectionId)?.quantity ?? null;
}

/** Hiçbir bölüme pay verilmemiş kalem (sözleşme "dağıtılmamış satır" karşılığı). */
export function hasNoAllocation(item: SectionDistributionItem): boolean {
  return item.allocations.length === 0;
}

/**
 * Fail-closed (BoqAssignmentCard `some` deseni): HERHANGİ bir kalemde metraj
 * gizliyse yazma ve toplu dağıtım kapanır.
 */
export function isSectionDistributionMetrajHidden(
  groups: readonly SectionDistributionGroup[],
): boolean {
  return groups.some((group) =>
    group.items.some((item) => item.quantity === null || item.quantity === undefined),
  );
}

/** KDG yardımcısının genel kalem şekli; maskeli metrajda `null` (hesap yok). */
export function toDistributeRemainingItem(
  item: SectionDistributionItem,
): DistributeRemainingItem | null {
  if (item.quantity === null || item.quantity === undefined) return null;
  const shares = new Map<string, string>();
  for (const allocation of item.allocations) {
    if (allocation.quantity !== null) shares.set(allocation.section_id, allocation.quantity);
  }
  return { id: item.id, quantity: item.quantity, shares };
}

/**
 * Canlı atanmamış: kirli hücre varsa quantity − Σ etkin değer (KDG kuralı);
 * yoksa sunucunun `unallocated_quantity`si. Maskeli kalemde ya da geçersiz
 * taslakta canlı hesap YAPILMAZ (sunucu değeri; maskede `null`).
 *
 * @param drafts anahtar `sectionDistributionCellKey`, değer HAM metin.
 */
export function liveUnallocated(
  item: SectionDistributionItem,
  sectionIds: readonly string[],
  drafts: ReadonlyMap<string, string>,
): string | null {
  const hasDirtyCell = sectionIds.some((sectionId) =>
    drafts.has(sectionDistributionCellKey(item.id, sectionId)),
  );
  if (!hasDirtyCell || item.unallocated_quantity === null) return item.unallocated_quantity;
  const distributeItem = toDistributeRemainingItem(item);
  if (distributeItem === null) return item.unallocated_quantity;
  const live = remainingQuantity(distributeItem, sectionIds, drafts, sectionDistributionCellKey);
  return live ?? item.unallocated_quantity;
}

/**
 * K3/K5 · atanmamış uyarısı (bilgi, engel DEĞİL). `null` ⇒ uyarı yok.
 * Normal rolde liste KAYITLI durumdan (sunucu `unallocated_quantity`) kalem
 * kalem türetilir; birimler farklı olduğu için tek toplam yazılmaz. Maskeli
 * rolde yalnız `unallocated_item_codes`.
 */
export function buildUnallocatedWarning(data: SectionDistributionResponse): string | null {
  if (data.unallocated_item_count <= 0) return null;
  const prefix = `${data.unallocated_item_count} kalemde atanmamış miktar var: `;
  const items = data.groups.flatMap((group) => group.items);
  if (isSectionDistributionMetrajHidden(data.groups)) {
    return prefix + data.unallocated_item_codes.join(", ");
  }
  const entries = items.flatMap((item) =>
    item.unallocated_quantity !== null &&
    compareDecimalStrings(item.unallocated_quantity, ZERO) > 0
      ? [`${item.code} (${formatQuantity(item.unallocated_quantity)} ${item.unit})`]
      : [],
  );
  return prefix + entries.join(", ");
}
