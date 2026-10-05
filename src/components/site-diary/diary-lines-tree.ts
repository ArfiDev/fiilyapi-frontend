import { siteDiaryLineKey } from "@/lib/api/hooks/site-diary-save-bodies";
import type { SiteDiaryLineRead } from "@/lib/api/hooks/useSiteDiary";
import { normalizeDecimalInput, subtractDecimalStrings, sumDecimalStrings, isZeroDecimalString } from "@/lib/decimal";

import { parseDiaryQuantity, type DiaryAddedLine, type DiaryFormState } from "./form-state";

/**
 * PLN-F2.2 · "📋 Yapılan Miktarlar" tablosunun SAF türevleri (spec §3.14
 * G1–G8; Ek Formlar M1–M4). Bileşen yalnız basar — hesap burada.
 *
 * Ağaç: kalem başlık satırı (G2 toplamları) → altında Bölümsüz (önce) ve
 * bölüm satırları (bölümün `sort_order`ı). Kümülatif/Kalan yazarken istemcide
 * ANINDA önizlenir (G8: kayıtlı kümülatif − kayıtlı bugün + yazılan); kayıttan
 * sonra backend değeri esastır. Hakediş ₺ YANITTAN okunur (K16), istemci
 * hesaplamaz.
 */

/** Şantiye bölümü — `useSite().sections` (sıra + kısa kod burada). */
export interface DiaryTreeSection {
  id: string;
  name: string;
  code: string | null;
  sort_order: number;
}

/** Sözleşme BOQ kalemi — `useBoq` yanıtından (sıra + Bölümsüz planlısı). */
export interface DiaryTreeBoqItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  unit_price: string | null;
  unallocated_quantity: string | null;
}

/**
 * Ağacın okuduğu satır: kayıtlı satır (`id` var) ya da GKS-F1.2a önizleme
 * iskeleti (`SiteDiarySkeletonLine`, kimliksiz). Ağaç kimliği YALNIZ öksüz
 * satırın anahtarı için okur; ikinci ağaç kodu yoktur.
 */
export type DiaryTreeLine = Omit<SiteDiaryLineRead, "id"> & { id?: string };

export interface DiaryLeafRow {
  key: string;
  boqItemId: string | null;
  sectionId: string | null;
  /** "Bölümsüz" ya da bölüm adı. */
  label: string;
  sectionCode: string | null;
  isUnsectioned: boolean;
  /** "+ Bölüm" ile eklenmiş, henüz kaydedilmemiş (M4 "YENİ" çipi). */
  isAdded: boolean;
  /** G3: Bölümsüz iskelet ve öksüz satır kaldırılamaz. */
  isRemovable: boolean;
  isOrphan: boolean;
  todayText: string;
  /** Yazılan bugünkü miktar (ondalık dize); geçersizse `null`. */
  todayValue: string | null;
  /** G8 önizlemesi; bilinmiyorsa (eklenmiş satır) `null`. */
  cumulative: string | null;
  planned: string | null;
  remaining: string | null;
  /** Kümülatif planlıyı AŞIYOR (M4 · B2-8 gerekçe ister). */
  isOverrun: boolean;
  /** Aşım miktarı (pozitif), aşım yoksa `null`. */
  overrunExcess: string | null;
  /** Satır hakedişi — YANITTAN (K16); eklenmiş satırda henüz yok, maskeli rolde (IZN-F4d.2) `null`. */
  amount: string | null;
}

export interface DiaryItemGroup {
  /** Öksüz grupta `null`. */
  boqItemId: string | null;
  key: string;
  code: string;
  description: string;
  unit: string;
  unitPrice: string | null;
  isOrphan: boolean;
  /** Bölümsüz iskeleti var mı (G4 menüsündeki "Bölümsüz" seçeneği için). */
  hasUnsectioned: boolean;
  /** Tahsis dışı kalan (Bölümsüz planlısı) — BOQ'tan. */
  unallocatedQuantity: string | null;
  leaves: DiaryLeafRow[];
  /** G2 — bölüm satırlarının toplamları; bileşenlerden biri bilinmiyorsa `null`. */
  totals: {
    today: string | null;
    cumulative: string | null;
    planned: string | null;
    remaining: string | null;
    amount: string | null;
  };
}

export const UNSECTIONED_LABEL = "Bölümsüz";
const UNKNOWN_SECTION_LABEL = "Bilinmeyen bölüm";

/** "Bugün" hücresinin ondalık değeri: boş = "0", geçersiz = `null`. */
export function diaryQuantityDecimal(text: string): string | null {
  if (parseDiaryQuantity(text) === null) return null;
  if (text.trim() === "") return "0";
  return normalizeDecimalInput(text);
}

function isPositiveDecimal(value: string): boolean {
  return !value.trim().startsWith("-") && !isZeroDecimalString(value);
}

interface LeafInput {
  key: string;
  boqItemId: string | null;
  sectionId: string | null;
  saved: DiaryTreeLine | null;
  added: DiaryAddedLine | null;
}

function buildLeaf(
  input: LeafInput,
  form: DiaryFormState,
  sectionById: ReadonlyMap<string, DiaryTreeSection>,
  isPreview: boolean,
): DiaryLeafRow {
  const { saved, added, sectionId } = input;
  const section = sectionId === null ? undefined : sectionById.get(sectionId);
  const todayText = form.quantities[input.key] ?? "";
  const todayValue = diaryQuantityDecimal(todayText);
  const planned = saved ? (saved.planned_quantity ?? null) : (added?.plannedQuantity ?? null);

  let cumulative: string | null = null;
  if (saved) {
    const base = saved.leaf_cumulative_quantity ?? saved.cumulative_quantity;
    // G8: geçersiz hücrede önizleme kayıttaki değerde kalır.
    cumulative = todayValue === null ? base : sumDecimalStrings([subtractDecimalStrings(base, saved.quantity), todayValue]);
  }
  const remaining = planned !== null && cumulative !== null ? subtractDecimalStrings(planned, cumulative) : null;
  // Eklenmiş satırda kayıtlı kümülatif bilinmez; aşım en az yazılan miktarla ölçülür (G5: planlı 0).
  const reached = cumulative ?? todayValue;
  const excess = planned !== null && reached !== null ? subtractDecimalStrings(reached, planned) : null;
  const isOverrun = excess !== null && isPositiveDecimal(excess);
  const isOrphan = input.boqItemId === null;

  return {
    key: input.key,
    boqItemId: input.boqItemId,
    sectionId,
    label: sectionId === null ? UNSECTIONED_LABEL : (section?.name ?? UNKNOWN_SECTION_LABEL),
    sectionCode: section?.code ?? null,
    isUnsectioned: sectionId === null,
    isAdded: added !== null && saved === null,
    // GKS-F1.2a: önizlemede iskelet satırı kaldırılamaz (POST birleştirmesi silemez);
    // yalnız "+ Bölüm" ile eklenen satır kaldırılabilir.
    isRemovable: !isOrphan && ((!isPreview && sectionId !== null) || (added !== null && saved === null)),
    isOrphan,
    todayText,
    todayValue,
    cumulative,
    planned,
    remaining,
    isOverrun,
    overrunExcess: isOverrun ? excess : null,
    amount: saved ? saved.line_amount : null,
  };
}

function leafOrder(sectionById: ReadonlyMap<string, DiaryTreeSection>) {
  return (a: DiaryLeafRow, b: DiaryLeafRow): number => {
    if (a.isUnsectioned !== b.isUnsectioned) return a.isUnsectioned ? -1 : 1;
    const sa = a.sectionId === null ? undefined : sectionById.get(a.sectionId);
    const sb = b.sectionId === null ? undefined : sectionById.get(b.sectionId);
    if (sa && sb) return sa.sort_order - sb.sort_order;
    if (sa) return -1;
    if (sb) return 1;
    return a.label.localeCompare(b.label, "tr");
  };
}

function totalsOf(leaves: readonly DiaryLeafRow[]): DiaryItemGroup["totals"] {
  const pick = (read: (leaf: DiaryLeafRow) => string | null) =>
    leaves.length === 0 ? null : sumDecimalStrings(leaves.map(read));
  return {
    today: pick((leaf) => leaf.todayValue),
    cumulative: pick((leaf) => leaf.cumulative),
    planned: pick((leaf) => leaf.planned),
    remaining: pick((leaf) => leaf.remaining),
    // Eklenmiş satırın ₺'si henüz yok (backend kayıtta hesaplar) — toplamı bozmaz. Kayıtlı satırın (`!isAdded`) `null`ı GİZLİ'dir
    // (IZN-F4d.2): toplam bilinmez → `null`, 0 SAYILMAZ.
    amount: leaves.length === 0 ? null : sumDecimalStrings(leaves.filter((leaf) => !leaf.isAdded).map((leaf) => leaf.amount)),
  };
}

export interface DiaryLineTreeInput {
  lines: readonly DiaryTreeLine[];
  form: DiaryFormState;
  /** BOQ sırası (grup → kalem). Okunamadıysa boş: ağaç satırlardan kurulur. */
  boqItems: readonly DiaryTreeBoqItem[];
  sections: readonly DiaryTreeSection[];
  /**
   * GKS-F1.2a: satırlar kaydedilmemiş önizlemeden geliyor → iskelet satırı
   * `isRemovable=false`; yalnız `form.addedLines` kaldırılabilir.
   */
  isPreview?: boolean;
}

/**
 * Kalem ağacı. Kalem sırası BOQ'tan (satırı olmayan kalem de başlık olarak
 * basılır — G4 "tamamen tahsisli · iskelet yok"); BOQ'ta olmayan kalemler
 * satır sırasıyla sona eklenir. Kaldırılan satırlar ağaçta YOKTUR.
 */
export function buildDiaryLineTree({
  lines,
  form,
  boqItems,
  sections,
  isPreview = false,
}: DiaryLineTreeInput): DiaryItemGroup[] {
  const sectionById = new Map(sections.map((section) => [section.id, section]));
  const removed = new Set(form.removedLines);
  const leavesByItem = new Map<string, LeafInput[]>();
  const firstLineByItem = new Map<string, DiaryTreeLine>();
  const orphans: DiaryItemGroup[] = [];
  const itemOrder: string[] = [];

  const push = (itemId: string, leaf: LeafInput) => {
    if (!leavesByItem.has(itemId)) {
      leavesByItem.set(itemId, []);
      itemOrder.push(itemId);
    }
    leavesByItem.get(itemId)?.push(leaf);
  };

  for (const [index, line] of lines.entries()) {
    if (line.boq_item_id === null) {
      const leaf = buildLeaf(
        { key: `orphan:${line.id ?? index}`, boqItemId: null, sectionId: line.section_id ?? null, saved: line, added: null },
        form,
        sectionById,
        isPreview,
      );
      orphans.push({
        boqItemId: null,
        key: leaf.key,
        code: line.code,
        description: line.description,
        unit: line.unit,
        unitPrice: line.unit_price,
        isOrphan: true,
        hasUnsectioned: false,
        unallocatedQuantity: null,
        leaves: [leaf],
        totals: totalsOf([leaf]),
      });
      continue;
    }
    const key = siteDiaryLineKey(line.boq_item_id, line.section_id);
    if (removed.has(key)) continue;
    if (!firstLineByItem.has(line.boq_item_id)) firstLineByItem.set(line.boq_item_id, line);
    push(line.boq_item_id, { key, boqItemId: line.boq_item_id, sectionId: line.section_id ?? null, saved: line, added: null });
  }
  const savedKeys = new Set(lines.map((line) => siteDiaryLineKey(line.boq_item_id ?? "", line.section_id)));
  for (const added of form.addedLines) {
    const key = siteDiaryLineKey(added.boqItemId, added.sectionId);
    if (savedKeys.has(key)) continue;
    push(added.boqItemId, { key, boqItemId: added.boqItemId, sectionId: added.sectionId, saved: null, added });
  }

  const boqById = new Map(boqItems.map((item) => [item.id, item]));
  const orderedIds = [...boqItems.map((item) => item.id), ...itemOrder.filter((id) => !boqById.has(id))];
  const sortLeaves = leafOrder(sectionById);

  const groups: DiaryItemGroup[] = [];
  for (const itemId of orderedIds) {
    const boq = boqById.get(itemId);
    const line = firstLineByItem.get(itemId);
    const inputs = leavesByItem.get(itemId) ?? [];
    if (!boq && !line && inputs.length === 0) continue;
    const leaves = inputs.map((input) => buildLeaf(input, form, sectionById, isPreview)).sort(sortLeaves);
    groups.push({
      boqItemId: itemId,
      key: itemId,
      code: boq?.code ?? line?.code ?? "",
      description: boq?.description ?? line?.description ?? "",
      unit: boq?.unit ?? line?.unit ?? "",
      unitPrice: boq?.unit_price ?? line?.unit_price ?? null,
      isOrphan: false,
      hasUnsectioned: leaves.some((leaf) => leaf.isUnsectioned),
      unallocatedQuantity: boq?.unallocated_quantity ?? null,
      leaves,
      totals: totalsOf(leaves),
    });
  }
  return [...groups, ...orphans];
}

/** Ağacın bütün (öksüz olmayan) yaprakları — uzantı bağlamı ve doğrulama için. */
export function diaryTreeLeaves(groups: readonly DiaryItemGroup[]): DiaryLeafRow[] {
  return groups.flatMap((group) => group.leaves).filter((leaf) => !leaf.isOrphan);
}

/** "+ Bölüm" seçicisinin tek seçeneği (M1). */
export interface DiarySectionPickerOption {
  sectionId: string | null;
  label: string;
  code: string | null;
  /** Seçicide görülen planlı (tahsis); tahsissizde `"0"` (G5). */
  planned: string | null;
  /** Kalemde zaten satırı var → pasif, "eklendi". */
  isPresent: boolean;
}

export interface DiarySectionPickerOptions {
  /** G4: tam tahsisli kalemde "Tahsis dışı · Bölümsüz" (iskelet yoksa). */
  unsectioned: DiarySectionPickerOption | null;
  /** "BOQ tahsisi olan" — üstte. */
  allocated: DiarySectionPickerOption[];
  /** "Tahsis yok · planlı 0" — altta (G5). */
  unallocated: DiarySectionPickerOption[];
}

/** Seçicinin okuduğu tahsis kaydı (`BoqItemAllocation`). */
export interface DiaryPickerAllocation {
  section_id: string;
  quantity: string | null;
}

/**
 * Seçici listesi: bu kaleme BOQ tahsisi olan bölümler üstte, tahsissizler
 * altta ("planlı 0"), zaten eklenmiş bölüm pasif. Bölümsüz iskelet yoksa
 * (G4) "Bölümsüz" seçeneği tahsis dışı kalanla açılır. Sıra bölümün
 * `sort_order`ı; `query` ad/kod içinde (TR küçük harf) süzer.
 */
export function buildSectionPickerOptions(
  group: DiaryItemGroup,
  sections: readonly DiaryTreeSection[],
  allocations: readonly DiaryPickerAllocation[],
  query = "",
): DiarySectionPickerOptions {
  const present = new Set(group.leaves.map((leaf) => leaf.sectionId));
  const allocationBySection = new Map(allocations.map((allocation) => [allocation.section_id, allocation]));
  const needle = query.trim().toLocaleLowerCase("tr");
  const matches = (label: string, code: string | null) =>
    needle === "" || `${label} ${code ?? ""}`.toLocaleLowerCase("tr").includes(needle);

  const ordered = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const allocated: DiarySectionPickerOption[] = [];
  const unallocated: DiarySectionPickerOption[] = [];
  for (const section of ordered) {
    if (!matches(section.name, section.code)) continue;
    const allocation = allocationBySection.get(section.id);
    const option: DiarySectionPickerOption = {
      sectionId: section.id,
      label: section.name,
      code: section.code,
      planned: allocation ? allocation.quantity : "0",
      isPresent: present.has(section.id),
    };
    (allocation ? allocated : unallocated).push(option);
  }
  const unsectioned =
    group.hasUnsectioned || !matches(UNSECTIONED_LABEL, null)
      ? null
      : {
          sectionId: null,
          label: UNSECTIONED_LABEL,
          code: null,
          planned: group.unallocatedQuantity ?? "0",
          isPresent: false,
        };
  return { unsectioned, allocated, unallocated };
}
