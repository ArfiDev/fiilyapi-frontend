import { cx } from "@/lib/cx";

import type { TabCounts } from "./work-item-model";

/** ÜS-9 — devre-dışı sekme gerekçesi (`title`); rotası olmayan mockup öğesi silinmez, gerekçeyle basılır. */
const SOON_TITLE = "Yakında · bu sekme sonraki sürümde açılacak";

interface TabSpec {
  label: string;
  /** null = sayaçsız (ÜS-9: "İçe aktarım geçmişi"). */
  count: number | null;
  isActive: boolean;
}

interface WorkItemCatalogTabsProps {
  /** Veri yüklenmeden sayaç basılmaz. */
  counts: TabCounts | null;
}

/** KIK:72-76, 279 — dört sekme; yalnız "İş Kalemleri" etkin. */
export function WorkItemCatalogTabs({ counts }: WorkItemCatalogTabsProps) {
  const tabs: TabSpec[] = [
    { label: "İş Kalemleri", count: counts?.items ?? null, isActive: true },
    { label: "Disiplinler", count: counts?.disciplines ?? null, isActive: false },
    { label: "Birimler", count: counts?.units ?? null, isActive: false },
    { label: "İçe aktarım geçmişi", count: null, isActive: false },
  ];
  return (
    <div className="wik-tabs" role="group" aria-label="Katalog sekmeleri">
      {tabs.map((tab) => (
        <button
          key={tab.label}
          type="button"
          className={cx("wik-tab", tab.isActive && "wik-tab--active")}
          aria-current={tab.isActive ? "page" : undefined}
          disabled={!tab.isActive}
          title={tab.isActive ? undefined : SOON_TITLE}
        >
          {tab.label}
          {tab.count !== null && <span className="wik-tab__count">{tab.count}</span>}
          {!tab.isActive && <span className="wik-tab__soon">Yakında</span>}
        </button>
      ))}
    </div>
  );
}
