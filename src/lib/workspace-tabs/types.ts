/**
 * SEKME-F1.1 · çalışma sekmelerinin ÇEKİRDEK tipleri.
 *
 * Bu dosya yalnız veri şeklini tanımlar — reducer (`tabs-reducer.ts`), kalıcılık
 * (`persistence.ts`) ve mağaza (`tabs-store.ts`) hepsi bu tipleri paylaşır.
 * UI/router bu görevin KAPSAMI DIŞINDADIR (sonraki görev tüketir).
 */

/** Sabit Gösterge Paneli sekmesinin kimliği — kapanamaz, taşınamaz. */
export const PANEL_TAB_ID = "panel";

/** Sabit Gösterge Paneli sekmesinin URL'i. */
export const PANEL_URL = "/";

/** En çok açık sekme sayısı (11.'de en uzun süredir bakılmayan kapanır). */
export const MAX_WORKSPACE_TABS = 10;

/**
 * `url`/`title` uzunluk sınırları — TEK yerde tanımlı, `url-safety.ts`,
 * `tabs-reducer.ts` ve `persistence.ts` AYNI sabitleri paylaşır (N1 bulgusu:
 * eskiden url sınırı yalnız `persistence.ts`teydi, reducer'ın kendisi 2048
 * karakteri aşan bir url'i SESSİZCE kabul edip bir sekme üretebiliyordu —
 * bu sekme bir sonraki `save → load` gidiş-dönüşünde doğrulayıcı tarafından
 * reddedilip TÜM sekme verisini silebiliyordu).
 */
export const MAX_TAB_URL_LENGTH = 2048;
export const MAX_TAB_TITLE_LENGTH = 200;

/**
 * Tek bir çalışma sekmesi.
 *
 * `url` = pathname + search ("#" YOK — kullanıcı kararı, sayfa içi çapa
 * konumu sekme kimliğinin parçası değildir).
 */
export interface WorkspaceTab {
  readonly id: string;
  readonly url: string;
  readonly moduleKey: string;
  readonly title: string;
  readonly lastViewedAt: number;
  readonly pinned: boolean;
}

export interface WorkspaceTabsState {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeId: string;
}

/** Yalnız sabit panel sekmesini taşıyan başlangıç durumu. */
export function initialTabsState(now: number): WorkspaceTabsState {
  return {
    tabs: [
      {
        id: PANEL_TAB_ID,
        url: PANEL_URL,
        moduleKey: PANEL_URL,
        title: "Gösterge Paneli",
        lastViewedAt: now,
        pinned: true,
      },
    ],
    activeId: PANEL_TAB_ID,
  };
}
