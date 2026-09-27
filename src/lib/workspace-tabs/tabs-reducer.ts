/**
 * SEKME-F1.1 · çalışma sekmeleri REDUCER'ı.
 *
 * Tüm fonksiyonlar SAF `(state, args) => yeni state` biçimindedir: girdi
 * MUTASYONA UĞRAMAZ, her eylem yeni bir `WorkspaceTabsState` döner. `id` ve
 * `now` DIŞARIDAN gelir (saflık için) — üretimi `tabs-store.ts`nin işidir.
 */
import { moduleOf } from "./module-of";
import { MAX_TAB_TITLE_LENGTH, MAX_WORKSPACE_TABS, PANEL_TAB_ID, PANEL_URL } from "./types";
import { isSafeInternalUrl } from "./url-safety";
import type { WorkspaceTab, WorkspaceTabsState } from "./types";

function indexOfTab(tabs: readonly WorkspaceTab[], id: string): number {
  return tabs.findIndex((t) => t.id === id);
}

function updateTabAt(
  tabs: readonly WorkspaceTab[],
  index: number,
  patch: Partial<WorkspaceTab>,
): readonly WorkspaceTab[] {
  return tabs.map((t, i) => (i === index ? { ...t, ...patch } : t));
}

/** Aynı modülde, verilenler arasından EN SON bakılanı seçer. */
function mostRecentlyViewed(candidates: readonly WorkspaceTab[]): WorkspaceTab {
  return candidates.reduce((a, b) => (b.lastViewedAt > a.lastViewedAt ? b : a));
}

export function activeTab(state: WorkspaceTabsState): WorkspaceTab | undefined {
  return state.tabs.find((t) => t.id === state.activeId);
}

/**
 * Yüklenen kayıtta `lastViewedAt` GELECEKTE olan sekmeleri `now`a kırpar
 * (D3 bulgusu: bozuk saatle kaydedilmiş `1e300` gibi bir zaman damgası,
 * `enforceLimit`in "en eski"yi bulma mantığını tersine çeviriyordu — arka
 * planda YENİ açılan bir sekme, gelecekteki sahte-yüksek zaman damgalı bir
 * sekmeyle karşılaştırıldığında EN ESKİ sayılıp anında kapanabiliyordu).
 *
 * TERCİH EDİLEN YAKLAŞIM (ikisinden biri seçildi — gerekçe): doğrulayıcıda
 * REDDETMEK yerine burada KIRPMAK; reddetmek "tek sekme bozuksa TÜM veri
 * reddedilir" kuralı gereği kullanıcının TÜM diğer geçerli sekmelerini de
 * (saat kayması gibi zararsız bir nedenle) sessizce silerdi — kırpmak veriyi
 * korur ve invaryantı (hiçbir `lastViewedAt` `now`ı geçemez) aynı güçle sağlar.
 */
export function clampFutureTimestamps(
  state: WorkspaceTabsState,
  now: number,
): WorkspaceTabsState {
  let changed = false;
  const tabs = state.tabs.map((t) => {
    if (t.lastViewedAt <= now) return t;
    changed = true;
    return { ...t, lastViewedAt: now };
  });
  return changed ? { tabs, activeId: state.activeId } : state;
}

/**
 * `tabs.length > MAX_WORKSPACE_TABS` iken aktif, sabitlenmiş (panel) VE
 * `protectedId` (yeni açılan sekme — D3) OLMAYAN sekmeler arasından
 * `lastViewedAt` en küçüğü (eşitlikte SOLDAKİ — D2) kaldırılır. Aktif sekme,
 * panel ve az önce açılan sekme ASLA kapanmaz.
 */
export function enforceLimit(
  state: WorkspaceTabsState,
  protectedId?: string,
): WorkspaceTabsState {
  let tabs = state.tabs;
  while (tabs.length > MAX_WORKSPACE_TABS) {
    let victimIndex = -1;
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      if (tab.pinned || tab.id === state.activeId || tab.id === protectedId) continue;
      if (victimIndex === -1 || tab.lastViewedAt < tabs[victimIndex].lastViewedAt) {
        victimIndex = i;
      }
    }
    if (victimIndex === -1) break; // kaldırılabilecek sekme kalmadı (savunma)
    tabs = tabs.filter((_, i) => i !== victimIndex);
  }
  return tabs === state.tabs ? state : { tabs, activeId: state.activeId };
}

/**
 * Hedef url PANEL modülüne aitse ("/", "/?x=1" …) panel ASLA ikinci bir
 * sekme olarak açılmaz/güncellenmez — mevcut panel sekmesi odaklanır ve
 * url'i HER ZAMAN "/" kalır (O1/Y2 bulgusu: panelin url'si sorguyla
 * kirlenirse bir sonraki yüklemede doğrulayıcı TÜM veriyi reddediyordu).
 */
export function openTab(
  state: WorkspaceTabsState,
  args: { newTabId: string; url: string; now: number; background?: boolean },
): WorkspaceTabsState {
  if (!isSafeInternalUrl(args.url)) return state;
  const mod = moduleOf(args.url);
  if (mod.key === PANEL_URL) {
    if (args.background) return state; // panel zaten açık, arka planda no-op
    return focusTab(state, { id: PANEL_TAB_ID, now: args.now });
  }
  const newTab: WorkspaceTab = {
    id: args.newTabId,
    url: args.url,
    moduleKey: mod.key,
    title: mod.label,
    lastViewedAt: args.now,
    pinned: false,
  };
  const tabs = [...state.tabs, newTab];
  const activeId = args.background ? state.activeId : args.newTabId;
  return enforceLimit({ tabs, activeId }, args.newTabId);
}

export function focusTab(
  state: WorkspaceTabsState,
  args: { id: string; now: number },
): WorkspaceTabsState {
  const idx = indexOfTab(state.tabs, args.id);
  if (idx === -1) return state;
  const tabs = updateTabAt(state.tabs, idx, { lastViewedAt: args.now });
  return { tabs, activeId: args.id };
}

export function closeTab(
  state: WorkspaceTabsState,
  args: { id: string; now: number },
): WorkspaceTabsState {
  const idx = indexOfTab(state.tabs, args.id);
  if (idx === -1) return state;
  if (state.tabs[idx].pinned) return state;

  const tabs = state.tabs.filter((t) => t.id !== args.id);
  if (state.activeId !== args.id) {
    return { tabs, activeId: state.activeId };
  }

  // Aktif kapandı: SAĞ komşu (aynı index, kaydırılmış dizide), yoksa SOL.
  const newActiveIndex = idx < tabs.length ? idx : idx - 1;
  const newActiveTab = tabs[newActiveIndex];
  const updatedTabs = updateTabAt(tabs, newActiveIndex, { lastViewedAt: args.now });
  return { tabs: updatedTabs, activeId: newActiveTab.id };
}

export function closeOthers(
  state: WorkspaceTabsState,
  args: { id: string; now: number },
): WorkspaceTabsState {
  if (indexOfTab(state.tabs, args.id) === -1) return state;

  const tabs = state.tabs.filter((t) => t.pinned || t.id === args.id);
  const activeStillPresent = tabs.some((t) => t.id === state.activeId);
  if (activeStillPresent) return { tabs, activeId: state.activeId };

  const idx = indexOfTab(tabs, args.id);
  const updatedTabs = updateTabAt(tabs, idx, { lastViewedAt: args.now });
  return { tabs: updatedTabs, activeId: args.id };
}

export function closeRight(
  state: WorkspaceTabsState,
  args: { id: string; now: number },
): WorkspaceTabsState {
  const idx = indexOfTab(state.tabs, args.id);
  if (idx === -1) return state;

  const tabs = state.tabs.filter((t, i) => t.pinned || i <= idx);
  const activeStillPresent = tabs.some((t) => t.id === state.activeId);
  if (activeStillPresent) return { tabs, activeId: state.activeId };

  const newIdx = indexOfTab(tabs, args.id);
  const updatedTabs = updateTabAt(tabs, newIdx, { lastViewedAt: args.now });
  return { tabs: updatedTabs, activeId: args.id };
}

export function closeAll(
  state: WorkspaceTabsState,
  args: { now: number },
): WorkspaceTabsState {
  const tabs = state.tabs.filter((t) => t.pinned);
  if (state.activeId === PANEL_TAB_ID) {
    return { tabs, activeId: PANEL_TAB_ID };
  }
  const idx = indexOfTab(tabs, PANEL_TAB_ID);
  const updatedTabs = updateTabAt(tabs, idx, { lastViewedAt: args.now });
  return { tabs: updatedTabs, activeId: PANEL_TAB_ID };
}

/**
 * Panel taşınamaz ve hiçbir sekme index 0'a (panelin önüne) geçemez.
 * Sınır dışı `toIndex` kırpılır. `toIndex` SONLU DEĞİLSE (NaN, ±Infinity)
 * state AYNEN döner (O3 bulgusu: `Math.min`/`Math.max` NaN'ı yutar,
 * `clamped` NaN olur ve `slice(0, NaN)` boş dizi üretip sekmeyi panelin
 * önüne taşırdı).
 */
export function reorderTab(
  state: WorkspaceTabsState,
  args: { id: string; toIndex: number },
): WorkspaceTabsState {
  if (args.id === PANEL_TAB_ID) return state;
  if (!Number.isFinite(args.toIndex)) return state;
  const idx = indexOfTab(state.tabs, args.id);
  if (idx === -1) return state;

  const tab = state.tabs[idx];
  const withoutTab = state.tabs.filter((t) => t.id !== args.id);
  const minIndex = 1;
  const maxIndex = withoutTab.length;
  const clamped = Math.min(Math.max(args.toIndex, minIndex), maxIndex);
  const tabs = [...withoutTab.slice(0, clamped), tab, ...withoutTab.slice(clamped)];
  return { tabs, activeId: state.activeId };
}

/**
 * Sayfa içi gezinme / geri-ileri: AKTİF sekmenin url'sini günceller.
 *
 * PANEL DEĞİŞMEZİ (O1 bulgusu): hedef url panel modülüne ("/", "/?x=1" …)
 * aitse — aktif sekme panel OLSUN ya da OLMASIN — panel odaklanır, url'i
 * HER ZAMAN "/" kalır. Eskiden panel-dışı bir sekmeden "/" yazılınca o
 * sekme SESSİZCE ikinci bir panel'e dönüşürdü.
 */
export function navigateActive(
  state: WorkspaceTabsState,
  args: { url: string; now: number; newTabId: string },
): WorkspaceTabsState {
  if (!isSafeInternalUrl(args.url)) return state;
  const activeIdx = indexOfTab(state.tabs, state.activeId);
  if (activeIdx === -1) return state; // savunma: aktif id sekmeler arasında yok

  const mod = moduleOf(args.url);
  if (mod.key === PANEL_URL) {
    if (state.activeId === PANEL_TAB_ID) return state; // zaten panel — gerçek no-op
    return focusTab(state, { id: PANEL_TAB_ID, now: args.now });
  }

  const active = state.tabs[activeIdx];

  if (active.id !== PANEL_TAB_ID) {
    const moduleChanged = mod.key !== active.moduleKey;
    const patch: Partial<WorkspaceTab> = {
      url: args.url,
      moduleKey: mod.key,
      lastViewedAt: args.now,
      ...(moduleChanged ? { title: mod.label } : {}),
    };
    const tabs = updateTabAt(state.tabs, activeIdx, patch);
    return { tabs, activeId: state.activeId };
  }

  // Aktif sekme PANEL, hedef panel-dışı bir modül.
  const candidates = state.tabs.filter((t) => t.id !== PANEL_TAB_ID && t.moduleKey === mod.key);
  if (candidates.length > 0) {
    const target = mostRecentlyViewed(candidates);
    const idx = indexOfTab(state.tabs, target.id);
    const tabs = updateTabAt(state.tabs, idx, {
      url: args.url,
      moduleKey: mod.key,
      lastViewedAt: args.now,
    });
    return { tabs, activeId: target.id };
  }

  return openTab(state, { newTabId: args.newTabId, url: args.url, now: args.now, background: false });
}

/**
 * Sidebar'dan bir modüle tıklama.
 *
 * PANEL DEĞİŞMEZİ (O1): hedef panel ise `openTab` zaten arka planda no-op /
 * ön planda panel'i odaklama davranışını uygular (bkz. `openTab`), bu yüzden
 * burada AYRICA bir panel dalı YOKTUR — tek gerçek kaynak `openTab`dadır.
 */
export function openFromSidebar(
  state: WorkspaceTabsState,
  args: { href: string; now: number; newTab: boolean; newTabId: string },
): WorkspaceTabsState {
  if (!isSafeInternalUrl(args.href)) return state;
  const mod = moduleOf(args.href);

  if (args.newTab) {
    return openTab(state, { newTabId: args.newTabId, url: args.href, now: args.now, background: true });
  }

  const activeIdx = indexOfTab(state.tabs, state.activeId);
  const active = activeIdx === -1 ? undefined : state.tabs[activeIdx];

  // Aktif sekmenin kendi modülüne tıklandı: sekme modül KÖKÜNE gider.
  if (active && active.moduleKey === mod.key) {
    if (active.id === PANEL_TAB_ID) return state; // panel zaten kökünde, url "/" sabit kalır
    const tabs = updateTabAt(state.tabs, activeIdx, {
      url: mod.rootHref,
      moduleKey: mod.key,
      lastViewedAt: args.now,
    });
    return { tabs, activeId: state.activeId };
  }

  // O modülde AÇIK başka bir sekme varsa, EN SON bakılanı öne getirir.
  const candidates = state.tabs.filter((t) => t.id !== state.activeId && t.moduleKey === mod.key);
  if (candidates.length > 0) {
    const target = mostRecentlyViewed(candidates);
    return focusTab(state, { id: target.id, now: args.now });
  }

  // Yoksa ön planda yeni sekme.
  return openTab(state, { newTabId: args.newTabId, url: args.href, now: args.now, background: false });
}

/**
 * Sayfa yükleme/geri yükleme: mevcut URL'yi sekme durumuyla UZLAŞTIRIR.
 *
 * Birebir url eşleşmesinde BİRDEN ÇOK sekme varsa EN SON bakılanı seçer
 * (D4 bulgusu: `Array.find` her zaman EN SOLDAKİ eşleşmeyi seçiyordu).
 */
export function reconcileWithUrl(
  state: WorkspaceTabsState,
  args: { url: string; now: number; newTabId: string },
): WorkspaceTabsState {
  if (!isSafeInternalUrl(args.url)) return state;
  const exactMatches = state.tabs.filter((t) => t.url === args.url);
  if (exactMatches.length > 0) {
    const target = mostRecentlyViewed(exactMatches);
    return focusTab(state, { id: target.id, now: args.now });
  }

  const mod = moduleOf(args.url);
  // PANEL DEĞİŞMEZİ (Y2 bulgusu): "/?x=1" gibi sorgulu bir panel-modülü
  // url'i panel'in KENDİ url'ini "/" DIŞINDA bir şeye yazamaz — aksi hâlde
  // bir sonraki yüklemede doğrulayıcı TÜM sekme verisini reddeder.
  if (mod.key === PANEL_URL) {
    return focusTab(state, { id: PANEL_TAB_ID, now: args.now });
  }

  const candidates = state.tabs.filter((t) => t.moduleKey === mod.key);
  if (candidates.length > 0) {
    const target = mostRecentlyViewed(candidates);
    const idx = indexOfTab(state.tabs, target.id);
    const tabs = updateTabAt(state.tabs, idx, { url: args.url, lastViewedAt: args.now });
    return { tabs, activeId: target.id };
  }

  return openTab(state, { newTabId: args.newTabId, url: args.url, now: args.now, background: false });
}

/**
 * `title` `MAX_TAB_TITLE_LENGTH`i aşarsa KIRPILIR, REDDEDİLMEZ (N1 bulgusu):
 * reducer'ın ürettiği HER durum `persistence.ts`teki `save → load`
 * gidiş-dönüşünden AYNEN geçmelidir — reddetseydik reducer sessizce
 * doğrulayıcının reddedeceği bir durum üretebilir ve bir sonraki yüklemede
 * TÜM sekme verisi (kısmi kurtarma YOK kuralı gereği) silinirdi.
 */
export function setTabTitle(
  state: WorkspaceTabsState,
  args: { id: string; title: string },
): WorkspaceTabsState {
  const idx = indexOfTab(state.tabs, args.id);
  if (idx === -1) return state;
  const title = args.title.slice(0, MAX_TAB_TITLE_LENGTH);
  const tabs = updateTabAt(state.tabs, idx, { title });
  return { tabs, activeId: state.activeId };
}
