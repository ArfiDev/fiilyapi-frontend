import type { PageCatalogEntry } from "@/lib/api/hooks/usePages";
import type { PageLevel } from "@/lib/api/models";
import type { AccessDraft } from "./page-access-draft";
import { DISTRIBUTION_ORDER, LEVEL_LABELS } from "./page-access-labels";

export interface PageSubsection {
  /** Katalog `subgroup` değeri (proje içi: Proje / Şantiye / Bölüm); alt başlıksız grupta null. */
  readonly title: string | null;
  readonly pages: readonly PageCatalogEntry[];
}

export interface PageSection {
  readonly group: PageCatalogEntry["group"];
  readonly name: string;
  readonly pages: readonly PageCatalogEntry[];
  readonly subsections: readonly PageSubsection[];
}

/**
 * Katalogtan (menü sırasında) grup → alt başlık → sayfa ağacı. Grup sırası ve adı katalogdan gelir;
 * FE'de sayfa/grup sabiti YOKTUR.
 */
export function buildSections(catalog: readonly PageCatalogEntry[]): PageSection[] {
  const byGroup = new Map<PageSection["group"], { name: string; pages: PageCatalogEntry[] }>();
  for (const page of catalog) {
    const entry = byGroup.get(page.group);
    if (entry) entry.pages.push(page);
    else byGroup.set(page.group, { name: page.group_name, pages: [page] });
  }
  return [...byGroup].map(([group, entry]) => ({ group, ...entry, subsections: buildSubsections(entry.pages) }));
}

function buildSubsections(pages: readonly PageCatalogEntry[]): PageSubsection[] {
  const byTitle = new Map<string | null, PageCatalogEntry[]>();
  for (const page of pages) {
    const list = byTitle.get(page.subgroup);
    if (list) list.push(page);
    else byTitle.set(page.subgroup, [page]);
  }
  return [...byTitle].map(([title, list]) => ({ title, pages: list }));
}

export interface LevelCount {
  readonly level: PageLevel;
  readonly label: string;
  readonly count: number;
}

/** Grup başlığı sayaçları: yalnız sıfırdan büyük düzeyler, sıra Düzenler → Görür → Görmez. */
export function levelDistribution(pages: readonly PageCatalogEntry[], draft: AccessDraft): LevelCount[] {
  const counts: Record<PageLevel, number> = { none: 0, view: 0, edit: 0 };
  for (const page of pages) {
    const grant = draft.pages[page.key];
    if (grant) counts[grant.level] += 1;
  }
  return DISTRIBUTION_ORDER.filter((level) => counts[level] > 0).map((level) => ({
    level,
    label: LEVEL_LABELS[level],
    count: counts[level],
  }));
}
