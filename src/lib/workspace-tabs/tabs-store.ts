"use client";

/**
 * SEKME-F1.1 · çalışma sekmeleri MAĞAZASI.
 *
 * Reducer'ı (`tabs-reducer.ts`) `useSyncExternalStore` uyumlu dış bir mağazaya
 * bağlar: `id`/`now` üretimi ve `localStorage` kalıcılığı burada canlanır,
 * reducer saf kalır. Snapshot referansı YALNIZ değişince değişir.
 */
import { useSyncExternalStore } from "react";

import { clampFutureTimestamps, enforceLimit } from "./tabs-reducer";
import { loadWorkspaceTabs, saveWorkspaceTabs } from "./persistence";
import { initialTabsState } from "./types";
import type { WorkspaceTabsState } from "./types";

export type TabsAction<A> = (state: WorkspaceTabsState, args: A) => WorkspaceTabsState;

export interface WorkspaceTabsStoreDeps {
  now?: () => number;
  newId?: () => string;
  storage?: () => Storage | null;
}

export interface WorkspaceTabsStore {
  getSnapshot(): WorkspaceTabsState;
  getServerSnapshot(): WorkspaceTabsState;
  subscribe(listener: () => void): () => void;
  /**
   * `args` reducer'ın TAM eylem argümanıdır; YALNIZ `now` VE `newTabId`
   * alanları mağazanın kendi (mockable) üreticileriyle DOLDURULUR — çağıran
   * eylemin GERÇEK verisini (`url`, `href`, `toIndex` …) taşır.
   *
   * 🔴 O2 bulgusu: `id` (bir eylemin HEDEFİ olan mevcut sekmenin kimliği —
   * `closeTab`/`focusTab`/`setTabTitle` …) burada ARTIK OTOMATİK
   * DOLDURULMUYOR/ÖRTÜLMÜYOR. Eskiden `id` de `now`/`newTabId` ile birlikte
   * `Omit`teydi, yani `dispatch(closeTab, {})` DERLENİYORDU ve çalışınca
   * rastgele üretilmiş bir id ile SESSİZCE no-op oluyordu. `id`yi Omit
   * kümesinden çıkarmak onu TİP DÜZEYİNDE zorunlu bırakır: hedefi olan her
   * eylem artık `id`yi AÇIKÇA vermek ZORUNDADIR.
   */
  dispatch<A extends Record<string, unknown>>(
    fn: TabsAction<A>,
    args: Omit<A, "now" | "newTabId">,
  ): void;
  attachUser(userId: string): void;
  detachUser(): void;
}

function defaultStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

/** SSR'da her zaman aynı referans (yalnız panel) — hydration uyuşmazlığı yok. */
const SERVER_SNAPSHOT: WorkspaceTabsState = initialTabsState(0);

export function createWorkspaceTabsStore(deps: WorkspaceTabsStoreDeps = {}): WorkspaceTabsStore {
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const getStorage = deps.storage ?? defaultStorage;

  let state: WorkspaceTabsState = initialTabsState(now());
  let currentUserId: string | null = null;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function setState(next: WorkspaceTabsState): void {
    if (next === state) return;
    state = next;
    if (currentUserId !== null) {
      saveWorkspaceTabs(currentUserId, state, getStorage() ?? undefined);
    }
    notify();
  }

  return {
    getSnapshot() {
      return state;
    },
    getServerSnapshot() {
      return SERVER_SNAPSHOT;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(fn, args) {
      const defaults = { now: now(), newTabId: newId() };
      const merged = { ...defaults, ...args } as unknown as Parameters<typeof fn>[1];
      setState(fn(state, merged));
    },
    /**
     * K1 bulgusu: eskiden yüklenecek kayıt YOKSA (`loaded === null`) mağaza
     * belleği sıfırlamıyordu — önceki kullanıcının sekmeleri bellekte
     * KALIYOR ve YENİ kullanıcının anahtarına YAZILIYORDU (kullanıcı A'nın
     * gizli proje sekmeleri B'ye görünür + B'nin localStorage'ına sızardı).
     * Artık kullanıcı DEĞİŞTİĞİNDE — kayıt olsun ya da olmasın — bellek her
     * zaman `loaded ?? initialTabsState(now())`e sıfırlanır.
     */
    attachUser(userId) {
      // Boş / yalnız boşluktan oluşan id `fiil.workspaceTabs.v1:` (soneksiz)
      // ÖNEK anahtarına yazardı — bu anahtar `clearAllWorkspaceTabs`in
      // taradığı ÖNEKLE başlıyor ama hiçbir gerçek kullanıcıya ait değil;
      // attach EDİLMEZ, mağaza detached kalır.
      if (userId.trim().length === 0) return;
      if (currentUserId === userId) return; // aynı kullanıcıya ikinci attach etkisiz
      currentUserId = userId;
      const loaded = loadWorkspaceTabs(userId, getStorage() ?? undefined);
      const nowValue = now();
      state =
        loaded !== null
          ? enforceLimit(clampFutureTimestamps(loaded, nowValue))
          : initialTabsState(nowValue);
      notify();
    },
    /**
     * K1 bulgusu: eskiden yalnız `currentUserId = null` yapılıyordu — bellek
     * (`state`) önceki kullanıcının sekmelerini TAŞIMAYA devam ediyordu.
     * `detach()`ten sonra `attach()`e kadar geçen süre boyunca dispatch'ler
     * `currentUserId === null` olduğu için HİÇBİR anahtara YAZILMAZ (bkz.
     * `setState`), ama bellek görünür kalıyordu (çıkış ekranı arkasında
     * kısa süre render edilen bir bileşen önceki kullanıcının verisini
     * görebilirdi). Artık bellek de başlangıç durumuna döner.
     */
    detachUser() {
      currentUserId = null;
      state = initialTabsState(now());
      notify();
    },
  };
}

/** Uygulama genelinde paylaşılan TEK mağaza. */
export const workspaceTabsStore: WorkspaceTabsStore = createWorkspaceTabsStore();

/**
 * `useWorkspaceTabs()` — `useSyncExternalStore` kancası.
 *
 * UI/router görevi `dispatch(openTab, { url })`, `dispatch(closeTab, { id })`
 * gibi çağırır (`tabs-reducer.ts` eylemleriyle BİREBİR); yalnız `now` ve
 * (yeni sekme açan eylemlerde) `newTabId` mağaza tarafından doldurulur — bir
 * eylemin HEDEF `id`si (`closeTab`, `focusTab`, `setTabTitle` …) her zaman
 * çağıran tarafından AÇIKÇA verilmelidir.
 */
export function useWorkspaceTabs(store: WorkspaceTabsStore = workspaceTabsStore) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return { state, dispatch: store.dispatch };
}
