"use client";

/**
 * SEKME-F1.4a · çalışma sekmelerinin KULLANICI eylemleri (şerit + sidebar).
 *
 * VERİ AKIŞI (döngü yok): bu kanca yalnız STORE → ROUTER yönünü yürütür —
 * eylemi mağazaya uygular, sonra aktif sekme değiştiyse ya da aktif sekmenin
 * adresi değiştiyse `router.push(aktif.url)` çağırır. Ters yön (URL → store)
 * `TabsRouterSync`in işidir ve YALNIZ URL değişimine tepki verir; push edilen
 * adres zaten aktif sekmenin adresi olduğundan `navigateActive` aynı url'yi
 * yazar ve ikinci bir push üretmez.
 *
 * KAYDEDİLMEMİŞ VERİ KORUMASI (KARARLAR §1.10 (2) + emir karar 4): AKTİF
 * sekmeyi değiştiren ya da kapatan her eylem, kayıtta dirty kaynak varsa ÖNCE
 * onay ister. "Değiştirir mi" sorusu eylemi mağazanın ANLIK durumuna saf
 * reducer ile ÖNİZLEYEREK cevaplanır — eylem başına ayrı kural yazılmaz, tek
 * kaynak reducer'dır (kapat/diğerleri/sağdakiler/tümü/sidebar hepsi aynı yol).
 * Keep-alive yok: yalnız aktif sekme dirty olabilir, o yüzden aktif OLMAYAN
 * sekmeyi kapatmak onay istemez. CEO D1 kararı: sidebar kabuğun parçasıdır —
 * aktif sekmenin KENDİ modülüne tık (kimlik aynı, ADRES köke değişir) da
 * onaydan geçer; ölçüt bu yüzden "aktif sekme ya da ADRESİ değişir mi"dir.
 *
 * SEKME-F1.4a-FIX · YARIŞ: push asenkrondur; aktif sekme hemen değişir ama
 * URL sunucu yanıtına kadar eski kalır. Her push'tan HEMEN önce beklenen
 * gezinme `pending-navigation.ts` kaydına yazılır — senkron, yoldayken gelen
 * yabancı URL'yi (eski sayfanın gezinmesi) yeni aktif sekmeye yazmaz.
 */
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { useSession } from "@/components/shell/SessionProvider";
import { moduleOf } from "@/lib/workspace-tabs/module-of";
import {
  activeTab,
  closeAll as closeAllAction,
  closeOthers as closeOthersAction,
  closeRight as closeRightAction,
  closeTab as closeTabAction,
  focusTab,
  openFromSidebar as openFromSidebarAction,
  reorderTab as reorderTabAction,
} from "@/lib/workspace-tabs/tabs-reducer";
import {
  useWorkspaceTabs,
  workspaceTabsStore,
  type TabsAction,
  type WorkspaceTabsStore,
} from "@/lib/workspace-tabs/tabs-store";
import { unsavedRegistry, type UnsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import type { WorkspaceTabsState } from "@/lib/workspace-tabs/types";
import { normalizeTabUrl, pendingNavigation, type PendingNavigation } from "./pending-navigation";

/** Önizlemede üretilen sahte yeni-sekme kimliği; mağazaya ASLA yazılmaz. */
const PREVIEW_TAB_ID = "__onizleme__";

export interface TabGuardState {
  readonly isOpen: boolean;
  readonly labels: readonly string[];
  readonly confirm: () => void;
  readonly cancel: () => void;
}

export interface WorkspaceTabsController {
  readonly state: WorkspaceTabsState;
  /** Oturum geldi mi (mağaza kullanıcıya iliştirildi mi) — öncesinde yakalama yok. */
  readonly isReady: boolean;
  selectTab(id: string): void;
  closeTab(id: string): void;
  closeOthers(id: string): void;
  closeRight(id: string): void;
  closeAll(): void;
  reorderTab(id: string, toIndex: number): void;
  /** Sidebar DÜZ tıkı (Ctrl/orta tık belge yakalayıcısındadır). */
  openFromSidebar(href: string): void;
  readonly guard: TabGuardState;
}

export interface WorkspaceTabsControllerDeps {
  readonly store?: WorkspaceTabsStore;
  readonly registry?: UnsavedRegistry;
  readonly navigation?: PendingNavigation;
}

interface PendingAction {
  readonly run: () => void;
  readonly labels: readonly string[];
}

type ActionArgs = Record<string, unknown>;

/** Eylem uygulanırsa aktif sekme (kapanması dahil) ya da onun ADRESİ DEĞİŞİR mi. */
function changesActive<A extends ActionArgs>(
  state: WorkspaceTabsState,
  fn: TabsAction<A>,
  args: Omit<A, "now" | "newTabId">,
): boolean {
  const preview = fn(state, { ...args, now: 0, newTabId: PREVIEW_TAB_ID } as unknown as A);
  if (preview.activeId !== state.activeId) return true;
  return activeTab(preview)?.url !== activeTab(state)?.url;
}

type GuardedRunner = <A extends ActionArgs>(fn: TabsAction<A>, args: Omit<A, "now" | "newTabId">) => void;

/**
 * Eylem yürütücüsü + onay durumu. `guarded` aktif sekme değişecekse ve dirty
 * kaynak varsa eylemi BEKLETİR (onay modalı); onaylanınca eylem mağazanın O
 * ANKİ durumuna uygulanır, vazgeçilirse hiçbir şey olmaz.
 */
function useGuardedCommit(
  store: WorkspaceTabsStore,
  registry: UnsavedRegistry,
  navigation: PendingNavigation,
): { guarded: GuardedRunner; guard: TabGuardState } {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);

  /** Eylemi uygular; aktif sekme ya da onun adresi değiştiyse oraya gider. */
  const commit = useCallback<GuardedRunner>(
    (fn, args) => {
      const before = activeTab(store.getSnapshot());
      store.dispatch(fn, args);
      const after = activeTab(store.getSnapshot());
      if (after === undefined) return;
      if (after.id === before?.id && after.url === before?.url) return;
      // Kayıt push'tan ÖNCE: URL zaten oradaysa beklenecek değişim yoktur
      // (yoksa kayıt hiç temizlenmez ve sonraki meşru gezinme yabancı sayılırdı).
      if (normalizeTabUrl(after.url) === navigation.currentUrl()) navigation.settle();
      else navigation.expect(after.id, after.url);
      router.push(after.url);
    },
    [store, router, navigation],
  );

  const guarded = useCallback<GuardedRunner>(
    (fn, args) => {
      const needsConfirm =
        registry.hasUnsaved() && changesActive(store.getSnapshot(), fn, args);
      if (!needsConfirm) {
        commit(fn, args);
        return;
      }
      setPending({ run: () => commit(fn, args), labels: registry.labels() });
    },
    [store, registry, commit],
  );

  const confirm = useCallback(() => {
    setPending(null);
    pending?.run();
  }, [pending]);
  const cancel = useCallback(() => setPending(null), []);

  return {
    guarded,
    guard: { isOpen: pending !== null, labels: pending?.labels ?? [], confirm, cancel },
  };
}

export function useWorkspaceTabsController(
  deps: WorkspaceTabsControllerDeps = {},
): WorkspaceTabsController {
  const store = deps.store ?? workspaceTabsStore;
  const registry = deps.registry ?? unsavedRegistry;
  const navigation = deps.navigation ?? pendingNavigation;
  const { me } = useSession();
  const { state } = useWorkspaceTabs(store);
  const { guarded, guard } = useGuardedCommit(store, registry, navigation);

  return {
    state,
    isReady: typeof me?.id === "string" && me.id.length > 0,
    selectTab: (id) => {
      if (id === store.getSnapshot().activeId) return;
      guarded(focusTab, { id });
    },
    closeTab: (id) => guarded(closeTabAction, { id }),
    closeOthers: (id) => guarded(closeOthersAction, { id }),
    closeRight: (id) => guarded(closeRightAction, { id }),
    closeAll: () => guarded(closeAllAction, {}),
    reorderTab: (id, toIndex) => store.dispatch(reorderTabAction, { id, toIndex }),
    openFromSidebar: (href) => {
      // S3b: aktif sekmeye giden push hâlâ yoldaysa kullanıcı o sekmeye
      // HENÜZ varmadı (ekranda eski sayfa, sidebar vurgusu URL'yi izler);
      // o sekmenin modülüne tık "modül köküne dön" değil "o sekmeye git"tir
      // ve gidiş zaten yolda — sekmenin query'li adresi köke EZİLMEZ.
      const active = activeTab(store.getSnapshot());
      if (active && navigation.isPendingFor(active.id) && moduleOf(href).key === active.moduleKey) return;
      guarded(openFromSidebarAction, { href, newTab: false });
    },
    guard,
  };
}
