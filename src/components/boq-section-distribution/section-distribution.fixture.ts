import type {
  SectionDistributionAllocation,
  SectionDistributionGroup,
  SectionDistributionItem,
  SectionDistributionResponse,
  SectionDistributionSection,
  SectionDistributionSectionSummary,
} from "@/lib/api/hooks/useSectionDistribution";

/**
 * BDG · Bölüm Dağılımı test fikstürü (F1.3 birim testleri + F1.4 e2e ORTAK).
 *
 * Şantiye "A-Blok", proje "Güneşkent Konut"; bölümler Kat 1-5 · Kat 6-10 ·
 * Kat 11-15 (3. is_draft). Dört kalem: kısmi (03.001), tam (03.002), hiç
 * dağıtılmamış (04.001), uzun adlı kısmi (04.002). Sayaçlar: dağıtılmış 1,
 * atanmamış 3, toplam 4.
 *
 * Türetilmiş alanlar (allocated/unallocated/özetler/sayaçlar) payların
 * KENDİSİNDEN hesaplanır: fikstür kendi içinde çelişemez. Para/miktar
 * aritmetiği burada yalnız test verisi üretir (üretim kodu `decimal.ts`).
 */

export const FIXTURE_SITE_ID = "site-a-blok";

interface ItemDef {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  groupIndex: number;
  /** Bölüm SIRASI (0 tabanlı) → pay. */
  shares: Readonly<Record<number, number>>;
}

interface GroupDef {
  id: string;
  name: string;
}

const GROUP_DEFS: readonly GroupDef[] = [
  { id: "bg-a", name: "A — BETONARME" },
  { id: "bg-b", name: "B — İNCE İŞLER" },
];

export const LONG_ITEM_DESCRIPTION =
  "Dış cephe ısı yalıtım sistemi (mantolama) — 5 cm EPS levha, mineral sıva, file ve iskele dahil";

const ITEM_DEFS: readonly ItemDef[] = [
  {
    id: "bi-1",
    code: "03.001",
    description: "Beton C30/37",
    unit: "m³",
    quantity: 1200,
    unitPrice: 2450,
    groupIndex: 0,
    shares: { 0: 400, 1: 300 },
  },
  {
    id: "bi-2",
    code: "03.002",
    description: "Nervürlü demir Ø12–Ø20",
    unit: "ton",
    quantity: 96,
    unitPrice: 21500,
    groupIndex: 0,
    shares: { 0: 32, 1: 32, 2: 32 },
  },
  {
    id: "bi-3",
    code: "04.001",
    description: "Seramik kaplama",
    unit: "m²",
    quantity: 1200,
    unitPrice: 640,
    groupIndex: 1,
    shares: {},
  },
  {
    id: "bi-4",
    code: "04.002",
    description: LONG_ITEM_DESCRIPTION,
    unit: "m²",
    quantity: 800,
    unitPrice: 520,
    groupIndex: 1,
    shares: { 0: 200 },
  },
];

const SECTION_DEFS: readonly SectionDistributionSection[] = [
  { id: "sec-1", code: null, name: "Kat 1-5", sort_order: 1, is_draft: false },
  { id: "sec-2", code: null, name: "Kat 6-10", sort_order: 2, is_draft: false },
  { id: "sec-3", code: null, name: "Kat 11-15", sort_order: 3, is_draft: true },
];

const quantityText = (value: number): string => value.toFixed(3);
const amountText = (value: number): string => value.toFixed(2);

function buildItem(
  def: ItemDef,
  sections: readonly SectionDistributionSection[],
  isMasked: boolean,
): SectionDistributionItem {
  const allocations: SectionDistributionAllocation[] = sections.flatMap((section, index) => {
    const share = def.shares[index];
    if (share === undefined) return [];
    return [{ section_id: section.id, quantity: isMasked ? null : quantityText(share) }];
  });
  const allocated = Object.values(def.shares).reduce((sum, share) => sum + share, 0);
  return {
    id: def.id,
    code: def.code,
    description: def.description,
    unit: def.unit,
    quantity: isMasked ? null : quantityText(def.quantity),
    unit_price: isMasked ? null : amountText(def.unitPrice),
    allocated_quantity: isMasked ? null : quantityText(allocated),
    unallocated_quantity: isMasked ? null : quantityText(def.quantity - allocated),
    allocations,
  };
}

function buildSummaries(
  sections: readonly SectionDistributionSection[],
  isMasked: boolean,
): SectionDistributionSectionSummary[] {
  return sections.map((section, index) => {
    const lines = ITEM_DEFS.flatMap((def) => {
      const share = def.shares[index];
      return share === undefined ? [] : [{ def, share }];
    });
    const total = lines.reduce((sum, { def, share }) => sum + share * def.unitPrice, 0);
    return {
      section_id: section.id,
      section_name: section.name,
      total_amount: isMasked ? null : amountText(total),
      items: lines.map(({ def, share }) => ({
        boq_item_id: def.id,
        code: def.code,
        description: def.description,
        unit: def.unit,
        quantity: isMasked ? null : quantityText(share),
        unit_price: isMasked ? null : amountText(def.unitPrice),
        amount: isMasked ? null : amountText(share * def.unitPrice),
      })),
    };
  });
}

function assemble(
  sections: readonly SectionDistributionSection[],
  itemDefs: readonly ItemDef[],
  isMasked: boolean,
): SectionDistributionResponse {
  const groups: SectionDistributionGroup[] = GROUP_DEFS.map((group, groupIndex) => ({
    id: group.id,
    name: group.name,
    sort_order: (groupIndex + 1) * 10,
    items: itemDefs
      .filter((def) => def.groupIndex === groupIndex)
      .map((def) => buildItem(def, sections, isMasked)),
  }));
  const unallocatedCodes = itemDefs
    .filter((def) => def.quantity - Object.values(def.shares).reduce((s, v) => s + v, 0) > 0)
    .map((def) => def.code);
  return {
    site_id: FIXTURE_SITE_ID,
    site_name: "A-Blok",
    project_name: "Güneşkent Konut",
    sections: [...sections],
    groups,
    section_summaries: buildSummaries(sections, isMasked),
    total_item_count: itemDefs.length,
    unallocated_item_count: unallocatedCodes.length,
    distributed_item_count: itemDefs.length - unallocatedCodes.length,
    unallocated_item_codes: unallocatedCodes,
  };
}

/** Ana fikstür: 3 bölüm (3. is_draft), 4 kalem; dağıtılmış 1, atanmamış 3. */
export const SECTION_DISTRIBUTION_FIXTURE: SectionDistributionResponse = assemble(
  SECTION_DEFS,
  ITEM_DEFS,
  false,
);

/**
 * Metraj gizli rol: miktar/fiyat/tutar alanları null; sayaç ve
 * `unallocated_item_codes` maskelenmez (CEO kararı).
 */
export function maskedSectionDistribution(): SectionDistributionResponse {
  return assemble(SECTION_DEFS, ITEM_DEFS, true);
}

/**
 * Geniş varyant: `sectionCount` bölüm ("Kat 1" … "Kat N"), seyrek paylar —
 * yatay kaydırma ve yapışkan kolon ölçümü için.
 */
export function wideSectionDistribution(sectionCount = 12): SectionDistributionResponse {
  const sections: SectionDistributionSection[] = Array.from({ length: sectionCount }, (_, index) => ({
    id: `sec-${index + 1}`,
    code: null,
    name: `Kat ${index + 1}`,
    sort_order: index + 1,
    is_draft: false,
  }));
  const everyThird = Object.fromEntries(
    sections.flatMap((_, index) => (index % 3 === 0 ? [[index, 100]] : [])),
  );
  const evenly = Object.fromEntries(sections.map((_, index) => [index, 96 / sectionCount]));
  const itemDefs: ItemDef[] = [
    { ...ITEM_DEFS[0], shares: everyThird },
    { ...ITEM_DEFS[1], shares: evenly },
    { ...ITEM_DEFS[2], shares: {} },
    { ...ITEM_DEFS[3], shares: { 1: 50 } },
  ];
  return assemble(sections, itemDefs, false);
}
