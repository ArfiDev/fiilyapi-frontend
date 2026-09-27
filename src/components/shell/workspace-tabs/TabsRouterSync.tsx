"use client";

/**
 * SEKME-F1.4a · ROUTER → SEKME senkronu (görünmez bileşen, `null` döner).
 *
 * ─── VERİ AKIŞI ───────────────────────────────────────────────────────────
 * URL → store (bu dosya): URL, AKTİF sekmenin adresinin TEK doğruluk
 * kaynağıdır. Her URL değişiminde (sayfa içi bağlantı, `router.push`,
 * geri/ileri) `navigateActive` aktif sekmenin url'sini QUERY DAHİL yazar;
 * panel kuralı reducer'dadır. Oturum gelince önce `attachUser` (kayıtlı
 * sekmeler yüklenir), hemen ardından `reconcileWithUrl`.
 *
 * store → router (`useWorkspaceTabsController`): kullanıcı eylemi aktif
 * sekmeyi değiştirirse `router.push(aktif.url)`.
 *
 * SEKME-F1.4a-FIX · YARIŞ: push asenkrondur; denetleyici push'tan hemen önce
 * "beklenen gezinme"yi `pending-navigation.ts` kaydına yazar. Bu bileşen her
 * yeni URL'yi o kayda SINIFLATIR: izle (`navigateActive`) · yok say
 * (superseded) · yeniden dayat (`router.replace(beklenen)`, TEK SEFER).
 * Böylece push yoldayken ESKİ sayfanın gezinmesi yeni aktif sekmeye yazılmaz.
 *
 * DÖNGÜ YOK: bu bileşenin etkisi YALNIZ `url` (ve kullanıcı) değişince koşar,
 * mağaza durumuna bağımlı DEĞİLDİR — mağazanın değişmesi buradan tekrar
 * eylem üretmez. Denetleyicinin push ettiği adres zaten aktif sekmenin
 * adresidir; o adres URL'ye yansıyınca `navigateActive` aynı url'yi yazar ve
 * push üretmez. Bu bileşenin ÜRETTİĞİ tek gezinme yeniden dayatmadır ve kayıt
 * başına en çok BİR kez olur (`reasserted` bayrağı); sunucu yönlendirmesi
 * dayatmayı yine yabancı adrese döndürürse ikinci gelişte kabul edilir.
 *
 * Başlık eşitlemesi mağazayı okur ama yalnız `setTabTitle` yazar ve yalnız
 * istenen başlık mevcuttan FARKLIYSA — ikinci turda eşittir, durur.
 *
 * 🔴 `useSearchParams` kabuk layout'unda Suspense sınırı ister (yoksa
 * `next build` statik ön-render'da kırılır) — `AppShell` bu bileşeni
 * `<Suspense fallback={null}>` içine alır.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useSession } from "@/components/shell/SessionProvider";
import { routeKeysOf, type CrumbNames } from "@/components/shell/breadcrumb/trail";
import { useCrumbNames } from "@/components/shell/breadcrumb/useCrumbNames";
import type { NamedEntity, RouteKeys } from "@/components/shell/breadcrumb/trail-node";
import { moduleOf } from "@/lib/workspace-tabs/module-of";
import {
  activeTab,
  navigateActive,
  openTab,
  reconcileWithUrl,
  setTabTitle,
} from "@/lib/workspace-tabs/tabs-reducer";
import {
  useWorkspaceTabs,
  workspaceTabsStore,
  type WorkspaceTabsStore,
} from "@/lib/workspace-tabs/tabs-store";
import { pendingNavigation, tabUrlOf, type PendingNavigation } from "./pending-navigation";
import { useTabLinkCapture } from "./useTabLinkCapture";

// Mevcut tüketiciler (testler) için: kodlama yardımcısı artık kayıt modülünde.
export { tabUrlOf };

/**
 * Sekmenin olması gereken başlığı. `undefined` = ad henüz gelmedi, YAZMA.
 *
 * En özgül ad: ŞANTİYE > PROJE (ölçüldü: `route-tree.ts`te adı çözülen
 * düğümler project · site · section · diaryEntry). Bölüm adı ("A Blok")
 * şantiyesiz belirsizdir, günlük kaydın adı bir TARİHTİR — ikisi de bir
 * sekmeyi tanıtmaz; bu yüzden bölüm/kayıt ekranları üstteki şantiye adını
 * taşır. Adı çözülemeyen (404/403) kayıt modül etiketine düşer.
 */
export function resolveTabTitle(url: string, keys: RouteKeys, names: CrumbNames): string | undefined {
  const entity: NamedEntity | null = keys.siteId ? "site" : keys.projectId ? "project" : null;
  const fallback = moduleOf(url).label;
  if (entity === null) return fallback;
  const name = names[entity];
  if (name !== undefined) return name;
  return names.unresolved?.has(entity) ? fallback : undefined;
}

interface SyncDeps {
  readonly store: WorkspaceTabsStore;
  readonly navigation: PendingNavigation;
  readonly replace: (url: string) => void;
}

/** Yeni gelen URL'yi beklenen gezinme kaydına göre sınıflar ve uygular. */
function applyObservedUrl({ store, navigation, replace }: SyncDeps, url: string): void {
  const verdict = navigation.observe(url, store.getSnapshot().activeId);
  if (verdict.kind === "follow") store.dispatch(navigateActive, { url });
  else if (verdict.kind === "reassert") replace(verdict.url);
  // "ignore": yerine yenisi konmuş eski bir push'un sonucu — hiçbir sekmeye yazılmaz.
}

function useUrlToTabsSync(deps: SyncDeps, userId: string | null, url: string | null): void {
  const lastRef = useRef<{ userId: string; url: string } | null>(null);
  const { navigation } = deps;

  // Geri/ileri (Q5) — işaret bir sonraki gözlemde BİR KEZ tüketilir.
  useEffect(() => {
    const onPopstate = () => navigation.markPopstate();
    window.addEventListener("popstate", onPopstate);
    return () => window.removeEventListener("popstate", onPopstate);
  }, [navigation]);

  useEffect(() => {
    if (userId === null || url === null) return;
    const last = lastRef.current;
    if (last !== null && last.userId === userId && last.url === url) return;
    if (last === null || last.userId !== userId) {
      deps.navigation.reset(url);
      deps.store.attachUser(userId);
      deps.store.dispatch(reconcileWithUrl, { url });
    } else {
      applyObservedUrl(deps, url);
    }
    lastRef.current = { userId, url };
  }, [deps, userId, url]);
}

function useActiveTabTitleSync(store: WorkspaceTabsStore, pathname: string, url: string | null): void {
  const { state } = useWorkspaceTabs(store);
  const keys = routeKeysOf(pathname);
  const names = useCrumbNames(keys);
  const current = activeTab(state);
  const desired = url === null ? undefined : resolveTabTitle(url, keys, names);

  useEffect(() => {
    // Yalnız URL'yle EŞLEŞMİŞ aktif sekmeye yazılır: push henüz yansımadıysa
    // başka bir sekmenin başlığı bu adresin adıyla ezilmez.
    if (current === undefined || current.pinned || current.url !== url) return;
    if (desired === undefined || desired === current.title) return;
    store.dispatch(setTabTitle, { id: current.id, title: desired });
  }, [store, current, url, desired]);
}

export interface TabsRouterSyncProps {
  /** Test için enjekte edilebilir; uygulamada tekil mağaza. */
  readonly store?: WorkspaceTabsStore;
  /** Test için enjekte edilebilir; uygulamada denetleyiciyle PAYLAŞILAN tekil kayıt. */
  readonly navigation?: PendingNavigation;
}

export function TabsRouterSync({
  store = workspaceTabsStore,
  navigation = pendingNavigation,
}: TabsRouterSyncProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { me } = useSession();
  const userId = typeof me?.id === "string" && me.id.length > 0 ? me.id : null;
  const url = tabUrlOf(pathname, searchParams?.toString() ?? "");
  const replace = useCallback((target: string) => router.replace(target), [router]);
  const deps = useMemo<SyncDeps>(() => ({ store, navigation, replace }), [store, navigation, replace]);

  useUrlToTabsSync(deps, userId, url);
  useActiveTabTitleSync(store, pathname ?? "/", url);

  const openInBackground = useCallback(
    (target: string) => store.dispatch(openTab, { url: target, background: true }),
    [store],
  );
  useTabLinkCapture({ enabled: userId !== null, onOpenInBackground: openInBackground });

  return null;
}
