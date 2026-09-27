import { describe, expect, it } from "vitest";

import {
  clearAllWorkspaceTabs,
  clearWorkspaceTabs,
  loadWorkspaceTabs,
  saveWorkspaceTabs,
  workspaceTabsStorageKey,
} from "./persistence";
import { initialTabsState, PANEL_TAB_ID } from "./types";
import type { WorkspaceTab, WorkspaceTabsState } from "./types";

const USER = "user-1";

/** Basit bellek-içi Storage sahtesi. */
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

function panelTab(overrides: Partial<WorkspaceTab> = {}): WorkspaceTab {
  return tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", title: "Gösterge Paneli", pinned: true, ...overrides });
}

describe("workspaceTabsStorageKey", () => {
  it("kullanıcıya özel anahtar üretir", () => {
    expect(workspaceTabsStorageKey("abc")).toBe("fiil.workspaceTabs.v1:abc");
    expect(workspaceTabsStorageKey("xyz")).not.toBe(workspaceTabsStorageKey("abc"));
  });
});

describe("saveWorkspaceTabs / loadWorkspaceTabs — gidiş-dönüş", () => {
  it("kaydedilen durum aynen geri okunur", () => {
    const storage = memoryStorage();
    const state: WorkspaceTabsState = { tabs: [panelTab(), tab({ id: "t1" })], activeId: "t1" };
    expect(saveWorkspaceTabs(USER, state, storage)).toBe(true);
    expect(loadWorkspaceTabs(USER, storage)).toEqual(state);
  });
});

describe("loadWorkspaceTabs — bozuk veri SESSİZCE varsayılana döner (null)", () => {
  it("bozuk JSON", () => {
    const storage = memoryStorage({ [workspaceTabsStorageKey(USER)]: "{not json" });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("yanlış şema versiyonu", () => {
    const state = { tabs: [panelTab()], activeId: PANEL_TAB_ID };
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 2, ...state }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("activeId listede yok", () => {
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({
        version: 1,
        tabs: [panelTab()],
        activeId: "yok",
      }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("11 sekme (MAX aşımı) reddedilir", () => {
    const tabs = [panelTab(), ...Array.from({ length: 10 }, (_, i) => tab({ id: `t${i}` }))];
    expect(tabs.length).toBe(11);
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t0" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("'//evil.com' url'li sekme reddedilir (protokol-göreli sızma)", () => {
    const tabs = [panelTab(), tab({ id: "t1", url: "//evil.com" })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("'/api/x' url'li sekme reddedilir", () => {
    const tabs = [panelTab(), tab({ id: "t1", url: "/api/x" })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("panel ilk sırada değilse reddedilir", () => {
    const tabs = [tab({ id: "t1" }), panelTab()];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("çift id reddedilir", () => {
    const tabs = [panelTab(), tab({ id: "t1" }), tab({ id: "t1" })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("ikinci pinned sekme reddedilir (D2)", () => {
    const tabs = [panelTab(), tab({ id: "t1", pinned: true })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it.each([
    ["/\t/evil.com", "kontrol karakteri"],
    ["/./api/auth/logout", "/api/ önek denetimini aşma girişimi"],
    ["/x/../api/x", "'..' ile /api/ aşma girişimi"],
    ["/API/x", "büyük harfli /API aşma girişimi"],
  ])("reducer/persistence AYNI doğrulayıcıyı kullanır — %s reddedilir (%s)", (url) => {
    const tabs = [panelTab(), tab({ id: "t1", url, moduleKey: "/api" })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("url MAX_URL_LENGTH (2048) aşarsa reddedilir (D8)", () => {
    const longUrl = "/projeler/" + "a".repeat(2048);
    const tabs = [panelTab(), tab({ id: "t1", url: longUrl, moduleKey: "/projeler" })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("title 200 karakteri aşarsa reddedilir (D8)", () => {
    const tabs = [panelTab(), tab({ id: "t1", title: "x".repeat(201) })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("moduleKey url'in gerçek modülüyle UYUŞMUYORSA reddedilir (D8)", () => {
    const tabs = [panelTab(), tab({ id: "t1", url: "/projeler", moduleKey: "/hazine" })];
    const storage = memoryStorage({
      [workspaceTabsStorageKey(USER)]: JSON.stringify({ version: 1, tabs, activeId: "t1" }),
    });
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });

  it("getItem atan storage → null (try/catch)", () => {
    const storage: Storage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
    };
    expect(loadWorkspaceTabs(USER, storage)).toBeNull();
  });
});

describe("saveWorkspaceTabs — hata try/catch içinde yutulur, boolean döner", () => {
  it("setItem atan storage → false", () => {
    const storage: Storage = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
      clear: () => {},
    };
    expect(saveWorkspaceTabs(USER, initialTabsState(1000), storage)).toBe(false);
  });
});

describe("anahtar kullanıcıya özeldir", () => {
  it("A kullanıcısının verisi B'ye gelmez", () => {
    const storage = memoryStorage();
    const stateA: WorkspaceTabsState = { tabs: [panelTab(), tab({ id: "a1" })], activeId: "a1" };
    saveWorkspaceTabs("user-A", stateA, storage);
    expect(loadWorkspaceTabs("user-B", storage)).toBeNull();
    expect(loadWorkspaceTabs("user-A", storage)).toEqual(stateA);
  });
});

describe("clearWorkspaceTabs / clearAllWorkspaceTabs", () => {
  it("clearWorkspaceTabs yalnız o kullanıcının anahtarını siler", () => {
    const storage = memoryStorage();
    saveWorkspaceTabs("user-A", initialTabsState(1000), storage);
    saveWorkspaceTabs("user-B", initialTabsState(1000), storage);
    expect(clearWorkspaceTabs("user-A", storage)).toBe(true);
    expect(loadWorkspaceTabs("user-A", storage)).toBeNull();
    expect(loadWorkspaceTabs("user-B", storage)).not.toBeNull();
  });

  it("clearAllWorkspaceTabs YALNIZ önekli anahtarları siler", () => {
    const storage = memoryStorage({ "baska-uygulama.ayarlar": "dokunma" });
    saveWorkspaceTabs("user-A", initialTabsState(1000), storage);
    saveWorkspaceTabs("user-B", initialTabsState(1000), storage);
    expect(clearAllWorkspaceTabs(storage)).toBe(true);
    expect(loadWorkspaceTabs("user-A", storage)).toBeNull();
    expect(loadWorkspaceTabs("user-B", storage)).toBeNull();
    expect(storage.getItem("baska-uygulama.ayarlar")).toBe("dokunma");
  });
});
