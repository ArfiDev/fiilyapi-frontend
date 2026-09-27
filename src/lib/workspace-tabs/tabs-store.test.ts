import { describe, expect, it, vi } from "vitest";

import { createWorkspaceTabsStore } from "./tabs-store";
import { closeTab, openTab, setTabTitle } from "./tabs-reducer";
import { saveWorkspaceTabs, workspaceTabsStorageKey } from "./persistence";
import { initialTabsState, PANEL_TAB_ID } from "./types";
import type { WorkspaceTabsStore } from "./tabs-store";
import type { WorkspaceTab, WorkspaceTabsState } from "./types";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    key(index: number) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
    removeItem(key: string) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
  };
}

function tab(overrides: Partial<WorkspaceTab> & { id: string }): WorkspaceTab {
  return {
    url: "/projeler",
    moduleKey: "/projeler",
    title: "Projeler",
    lastViewedAt: 1000,
    pinned: false,
    ...overrides,
  };
}

describe("createWorkspaceTabsStore", () => {
  it("dispatch sonrası subscribe aboneleri bilgilendirir", () => {
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "id-1", storage: () => null });
    const listener = vi.fn();
    store.subscribe(listener);
    store.dispatch(openTab, { url: "/projeler" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe sonrası bildirim gelmez", () => {
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "id-1", storage: () => null });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.dispatch(openTab, { url: "/projeler" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("snapshot referansı yalnız değişince değişir", () => {
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "id-1", storage: () => null });
    const before = store.getSnapshot();
    expect(store.getSnapshot()).toBe(before); // değişmedi, aynı referans

    store.dispatch(openTab, { url: "/projeler" });
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
    expect(store.getSnapshot()).toBe(after); // yeniden değişmedi
  });

  it("getServerSnapshot her zaman sabit panel-only durumdur", () => {
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "id-1", storage: () => null });
    store.dispatch(openTab, { url: "/projeler" });
    const server = store.getServerSnapshot();
    expect(server.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID]);
    expect(store.getServerSnapshot()).toBe(server); // sabit referans
  });

  it("dispatch now/id verilmediğinde mağazanın kendi üreticilerini kullanır", () => {
    const store = createWorkspaceTabsStore({
      now: () => 4242,
      newId: () => "generated-id",
      storage: () => null,
    });
    store.dispatch(openTab, { url: "/projeler" });
    const active = store.getSnapshot().tabs.find((t) => t.id === "generated-id");
    expect(active?.lastViewedAt).toBe(4242);
  });

  it("attachUser kayıtlı durumu yükler", () => {
    const storage = memoryStorage();
    const saved: WorkspaceTabsState = {
      tabs: [tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true }), tab({ id: "t1" })],
      activeId: "t1",
    };
    saveWorkspaceTabs("user-1", saved, storage);
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "id", storage: () => storage });
    store.attachUser("user-1");
    expect(store.getSnapshot()).toEqual(saved);
  });

  it("attachUser sonrası her değişiklik o kullanıcı için kaydedilir", () => {
    const storage = memoryStorage();
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "t1", storage: () => storage });
    store.attachUser("user-1");
    store.dispatch(openTab, { url: "/projeler" });
    const raw = storage.getItem(workspaceTabsStorageKey("user-1"));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).tabs.some((t: WorkspaceTab) => t.id === "t1")).toBe(true);
  });

  it("bozuk kayıtta varsayılan (yalnız panel) duruma DÖNER ve abonelere BİLDİRİR (K1/O8)", () => {
    // 🔴 ÇÜRÜTÜLDÜ: eski test "hiç değişmedi, bildirim yapılmadı" varsayıyordu.
    // K1 fix'i attachUser'ı HER ZAMAN (kayıt olsun/olmasın, bozuk/sağlam)
    // `loaded ?? initialTabsState(now())`e sıfırlayıp bildirir — aksi hâlde
    // A kullanıcısının bellekte kalan sekmeleri kayıtsız B'ye sızardı.
    const storage = memoryStorage({ [workspaceTabsStorageKey("user-1")]: "{bozuk json" });
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "id", storage: () => storage });
    const listener = vi.fn();
    store.subscribe(listener);
    store.attachUser("user-1");
    expect(store.getSnapshot()).toEqual(initialTabsState(1000));
    expect(listener).toHaveBeenCalledTimes(1); // O8: attach abonelere bildirir
  });

  it("aynı kullanıcıya ikinci attachUser etkisizdir (tekrar yüklemez)", () => {
    const storage = memoryStorage();
    saveWorkspaceTabs(
      "user-1",
      { tabs: [tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true })], activeId: PANEL_TAB_ID },
      storage,
    );
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "t1", storage: () => storage });
    store.attachUser("user-1");
    store.dispatch(openTab, { url: "/projeler" });
    store.attachUser("user-1"); // ikinci çağrı yeniden yükleyip t1'i SİLMEMELİ
    expect(store.getSnapshot().tabs.some((t) => t.id === "t1")).toBe(true);
  });

  it("detachUser sonrası değişiklikler artık kaydedilmez", () => {
    const storage = memoryStorage();
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "t1", storage: () => storage });
    store.attachUser("user-1");
    store.detachUser();
    store.dispatch(openTab, { url: "/projeler" });
    expect(storage.getItem(workspaceTabsStorageKey("user-1"))).toBeNull();
  });

  it("detachUser BELLEKTEKİ durumu da başlangıca (yalnız panel) SIFIRLAR (K1)", () => {
    // 🔴 Eskiden yalnız `currentUserId = null` yapılıyordu — bellekteki
    // `state` önceki kullanıcının sekmelerini TAŞIMAYA devam ediyordu; çıkış
    // ekranı arkasında kısa süre render edilen bir bileşen A'nın verisini
    // görebilirdi (dispatch'ler kaydedilmese BİLE).
    const storage = memoryStorage();
    const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "t1", storage: () => storage });
    store.attachUser("A");
    store.dispatch(openTab, { url: "/projeler/gizli-A" });
    store.detachUser();
    expect(store.getSnapshot()).toEqual(initialTabsState(1000));
  });

  describe("K1 — kullanıcı değişiminde ÖNCEKİ kullanıcının sekmeleri SIZMAZ", () => {
    it("A → detach → B (B'nin kaydı YOK): B yalnız paneli görür, A'nın url'i YOK", () => {
      let n = 0;
      const storage = memoryStorage();
      const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => `id-${++n}`, storage: () => storage });
      store.attachUser("A");
      store.dispatch(openTab, { url: "/projeler/gizli-A?x=1" });
      expect(store.getSnapshot().tabs.some((t) => t.url === "/projeler/gizli-A?x=1")).toBe(true);

      store.detachUser();
      store.attachUser("B"); // B'nin kaydı YOK (yalnız "A" anahtarı dolu)

      const bTabs = store.getSnapshot().tabs;
      expect(bTabs).toHaveLength(1);
      expect(bTabs[0].id).toBe(PANEL_TAB_ID);
      expect(bTabs.some((t) => t.url === "/projeler/gizli-A?x=1")).toBe(false);
    });

    it("(a) A'nın sekmeleri B'nin state'inde GÖRÜNMEZ (getSnapshot)", () => {
      let n = 0;
      const storage = memoryStorage();
      const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => `id-${++n}`, storage: () => storage });
      store.attachUser("A");
      store.dispatch(openTab, { url: "/projeler/gizli-A" });
      store.detachUser();
      store.attachUser("B");
      expect(store.getSnapshot().tabs.map((t) => t.url)).toEqual(["/"]);
    });

    it("(b) B'de dispatch → B'nin ham localStorage anahtarında A'nın HİÇBİR url'i YAZILMAZ", () => {
      let n = 0;
      const storage = memoryStorage();
      const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => `id-${++n}`, storage: () => storage });
      store.attachUser("A");
      store.dispatch(openTab, { url: "/projeler/gizli-A" });
      store.detachUser();
      store.attachUser("B");
      store.dispatch(openTab, { url: "/hazine" });

      const rawB = storage.getItem(workspaceTabsStorageKey("B"));
      expect(rawB).not.toBeNull();
      expect(rawB).not.toContain("gizli-A");

      const rawA = storage.getItem(workspaceTabsStorageKey("A"));
      expect(rawA).not.toBeNull();
      expect(rawA).not.toContain("/hazine");
    });

    it("(c) detach ile attach arasındaki dispatch HİÇBİR anahtara yazmaz", () => {
      let n = 0;
      const storage = memoryStorage();
      const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => `id-${++n}`, storage: () => storage });
      store.attachUser("A");
      store.dispatch(openTab, { url: "/projeler" });
      store.detachUser();

      const keysBefore = new Set<string>();
      for (let i = 0; i < storage.length; i++) keysBefore.add(storage.key(i)!);

      store.dispatch(openTab, { url: "/hazine" }); // kimse attach edilmemişken

      const keysAfter = new Set<string>();
      for (let i = 0; i < storage.length; i++) keysAfter.add(storage.key(i)!);

      expect(keysAfter).toEqual(keysBefore); // hiçbir yeni anahtar, hiçbir değişen içerik
      for (const key of keysAfter) {
        expect(storage.getItem(key)).not.toContain("/hazine");
      }
    });

    it("A → B DOĞRUDAN geçiş (detach ARADAN geçmeden): A'nın sekmeleri B'ye SIZMAZ", () => {
      let n = 0;
      const storage = memoryStorage();
      const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => `id-${++n}`, storage: () => storage });
      store.attachUser("A");
      store.dispatch(openTab, { url: "/projeler/gizli-A" });
      store.attachUser("B"); // detach ARADAN GEÇMEDEN doğrudan B
      expect(store.getSnapshot().tabs.map((t) => t.url)).toEqual(["/"]);
    });

    it("attach sonrası abone BİLDİRİLİR (O8)", () => {
      const storage = memoryStorage();
      const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "id", storage: () => storage });
      const listener = vi.fn();
      store.subscribe(listener);
      store.attachUser("A");
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it.each(["", "   ", "\t"])(
      "attachUser(%j) — boş/yalnız-boşluk id ATTACH EDİLMEZ, soneksiz anahtara YAZILMAZ",
      (emptyId) => {
        const storage = memoryStorage();
        const store = createWorkspaceTabsStore({ now: () => 1000, newId: () => "t1", storage: () => storage });
        const listener = vi.fn();
        store.subscribe(listener);
        store.attachUser(emptyId);
        expect(listener).not.toHaveBeenCalled(); // attach reddedildi, bildirim yok
        // Mağaza DETACHED kaldığı için snapshot değişmedi (yalnız panel).
        expect(store.getSnapshot()).toEqual(initialTabsState(1000));

        store.dispatch(openTab, { url: "/stok" });
        // Soneksiz anahtar (`fiil.workspaceTabs.v1:`) YAZILMAMALI — dispatch
        // bellekte değişikliği uygular (bu yüzden şimdi bildirim GELİR) ama
        // `currentUserId` hâlâ `null` olduğu için HİÇBİR anahtara yazmaz.
        expect(storage.getItem(workspaceTabsStorageKey(""))).toBeNull();
        expect(Array.from({ length: storage.length }, (_, i) => storage.key(i))).toEqual([]);
      },
    );
  });

  describe("O2 — dispatch tip deliği kapandı (yalnız DERLEME zamanı kontrolü)", () => {
    // ⚠️ SÖZLEŞME KORKULUĞU (derleme zamanı). Eskiden `dispatch`in `Omit<A,
    // "now"|"id"|"newTabId">` imzası hedef `id`yi de ÖRTÜYORDU:
    // `dispatch(closeTab, {})` DERLENİYORDU ve çalışınca mağazanın rastgele
    // ürettiği bir id ile SESSİZCE no-op oluyordu. `id` artık Omit kümesinden
    // ÇIKARILDI (bkz. `tabs-store.ts`), yani hedefi olan bir eylem `id`siz
    // ARTIK DERLENMEMELİ. Aşağıdaki fonksiyon HİÇ ÇAĞRILMAZ — amaç yalnız
    // `pnpm tsc`nin bu satırlara kızmasını (`@ts-expect-error` gerekçesiz
    // kalırsa TERS kızmasını) sağlamak; `scale.negative.test.ts` ile AYNI
    // desen (bu depoda tip-testi için emsal).
    it("dispatch(closeTab, {}) / dispatch(setTabTitle, {title}) hedef id'siz ARTIK DERLENMEZ", () => {
      function neverCalled(store: WorkspaceTabsStore): void {
        // @ts-expect-error hedef `id` artık `dispatch` tarafından otomatik doldurulmuyor — zorunlu
        store.dispatch(closeTab, {});
        // @ts-expect-error `title` verilse bile hedef `id` hâlâ zorunlu
        store.dispatch(setTabTitle, { title: "x" });
      }
      void neverCalled; // yalnız derleme zamanı kanıtı — çalışma zamanında çağrılmaz
      expect(true).toBe(true);
    });
  });
});
