import { describe, expect, it } from "vitest";

import { NAV_GROUPS } from "@/components/shell/nav-config";

import {
  activeTab,
  closeAll,
  closeOthers,
  closeRight,
  closeTab,
  enforceLimit,
  focusTab,
  navigateActive,
  openFromSidebar,
  openTab,
  reconcileWithUrl,
  reorderTab,
  setTabTitle,
} from "./tabs-reducer";
import { loadWorkspaceTabs, saveWorkspaceTabs } from "./persistence";
import { initialTabsState, MAX_TAB_TITLE_LENGTH, MAX_WORKSPACE_TABS, PANEL_TAB_ID } from "./types";
import type { WorkspaceTab, WorkspaceTabsState } from "./types";

const T0 = 1_000;

function tab(overrides: Partial<WorkspaceTab> & { id: string }): WorkspaceTab {
  return {
    url: "/projeler",
    moduleKey: "/projeler",
    title: "Projeler",
    lastViewedAt: T0,
    pinned: false,
    ...overrides,
  };
}

/** Derin-donuk durum: reducer girdiyi mutasyona uğratırsa test AYNI ANDA patlar. */
function frozen(state: WorkspaceTabsState): WorkspaceTabsState {
  state.tabs.forEach((t) => Object.freeze(t));
  Object.freeze(state.tabs);
  return Object.freeze(state);
}

function stateWith(tabs: WorkspaceTab[], activeId: string): WorkspaceTabsState {
  return frozen({ tabs, activeId });
}

describe("openTab", () => {
  it("yeni sekmeyi sona ekler ve aktif yapar (background verilmemişse)", () => {
    const s0 = stateWith([tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true })], PANEL_TAB_ID);
    const s1 = openTab(s0, { newTabId: "t1", url: "/projeler", now: T0 + 1 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1"]);
    expect(s1.activeId).toBe("t1");
    expect(s1.tabs[1].title).toBe("Projeler");
  });

  it("background=true iken aktifi DEĞİŞTİRMEZ", () => {
    const s0 = stateWith([tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true })], PANEL_TAB_ID);
    const s1 = openTab(s0, { newTabId: "t1", url: "/projeler", now: T0 + 1, background: true });
    expect(s1.activeId).toBe(PANEL_TAB_ID);
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1"]);
  });
});

describe("focusTab", () => {
  it("var olan sekmeyi aktif yapar ve lastViewedAt günceller", () => {
    const s0 = stateWith(
      [
        tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true }),
        tab({ id: "t1", lastViewedAt: T0 }),
      ],
      PANEL_TAB_ID,
    );
    const s1 = focusTab(s0, { id: "t1", now: T0 + 50 });
    expect(s1.activeId).toBe("t1");
    expect(s1.tabs.find((t) => t.id === "t1")!.lastViewedAt).toBe(T0 + 50);
  });

  it("olmayan id → state aynen döner", () => {
    const s0 = stateWith([tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true })], PANEL_TAB_ID);
    const s1 = focusTab(s0, { id: "yok", now: T0 + 1 });
    expect(s1).toEqual(s0);
  });
});

describe("closeTab", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("panel sekmesi ASLA kapanmaz", () => {
    const s0 = stateWith([panel, tab({ id: "t1" })], "t1");
    const s1 = closeTab(s0, { id: PANEL_TAB_ID, now: T0 + 1 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1"]);
  });

  it("aktif olmayan sekme kapanınca aktif değişmez", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t2");
    const s1 = closeTab(s0, { id: "t1", now: T0 + 1 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t2"]);
    expect(s1.activeId).toBe("t2");
  });

  it("aktif kapanınca SAĞ komşu aktif olur", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t1");
    const s1 = closeTab(s0, { id: "t1", now: T0 + 5 });
    expect(s1.activeId).toBe("t2");
    expect(s1.tabs.find((t) => t.id === "t2")!.lastViewedAt).toBe(T0 + 5);
  });

  it("sağ komşu YOKSA aktif kapanınca SOL komşu aktif olur", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t2");
    const s1 = closeTab(s0, { id: "t2", now: T0 + 5 });
    expect(s1.activeId).toBe("t1");
    expect(s1.tabs.find((t) => t.id === "t1")!.lastViewedAt).toBe(T0 + 5);
  });

  it("girdi state'i DEĞİŞMEZ (donmuş girdi patlamaz)", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t1");
    expect(() => closeTab(s0, { id: "t1", now: T0 + 5 })).not.toThrow();
  });
});

describe("closeOthers", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("panel + hedef dışındakileri kapatır", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" }), tab({ id: "t3" })], "t3");
    const s1 = closeOthers(s0, { id: "t2", now: T0 + 1 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t2"]);
  });

  it("aktif kapandıysa hedef (id) aktif olur", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" }), tab({ id: "t3" })], "t3");
    const s1 = closeOthers(s0, { id: "t2", now: T0 + 1 });
    expect(s1.activeId).toBe("t2");
  });

  it("aktif zaten hedefse aktif değişmeden kalır", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t2");
    const s1 = closeOthers(s0, { id: "t2", now: T0 + 1 });
    expect(s1.activeId).toBe("t2");
  });
});

describe("closeRight", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("hedefin sağındaki sekmeleri kapatır, panel kalır", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" }), tab({ id: "t3" })], "t1");
    const s1 = closeRight(s0, { id: "t1", now: T0 + 1 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1"]);
    expect(s1.activeId).toBe("t1");
  });

  it("aktif sağdaysa ve kapandıysa hedef (id) aktif olur", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" }), tab({ id: "t3" })], "t3");
    const s1 = closeRight(s0, { id: "t1", now: T0 + 1 });
    expect(s1.activeId).toBe("t1");
  });
});

describe("closeAll", () => {
  it("panel dışında hepsini kapatır ve panel aktif olur", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t2");
    const s1 = closeAll(s0, { now: T0 + 1 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID]);
    expect(s1.activeId).toBe(PANEL_TAB_ID);
  });
});

describe("10 sınırı (enforceLimit)", () => {
  it("11. sekme açılınca en eski (aktif OLMAYAN) kapanır", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true, lastViewedAt: 0 });
    const others = Array.from({ length: 9 }, (_, i) =>
      tab({ id: `t${i}`, lastViewedAt: T0 + i }),
    );
    const s0 = stateWith([panel, ...others], "t8");
    expect(s0.tabs.length).toBe(10);
    const s1 = openTab(s0, { newTabId: "t9", url: "/hazine", now: T0 + 100 });
    expect(s1.tabs.length).toBe(10);
    expect(s1.tabs.find((t) => t.id === "t0")).toBeUndefined(); // en eski
    expect(s1.tabs.find((t) => t.id === "t9")).toBeDefined();
  });

  it("aktif sekme en eski olsa bile KAPANMAZ", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true, lastViewedAt: 0 });
    const others = Array.from({ length: 9 }, (_, i) =>
      tab({ id: `t${i}`, lastViewedAt: T0 + i }),
    );
    // t0 en eski VE aktif.
    const s0 = stateWith([panel, ...others], "t0");
    const s1 = openTab(s0, { newTabId: "t9", url: "/hazine", now: T0 + 100, background: true });
    expect(s1.tabs.find((t) => t.id === "t0")).toBeDefined();
    // t1 en eski aktif-olmayan olduğu için o kapanır.
    expect(s1.tabs.find((t) => t.id === "t1")).toBeUndefined();
    expect(s1.tabs.length).toBe(MAX_WORKSPACE_TABS);
  });
});

describe("reorderTab", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("panel taşınamaz", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t1");
    const s1 = reorderTab(s0, { id: PANEL_TAB_ID, toIndex: 1 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1", "t2"]);
  });

  it("hiçbir sekme index 0'a geçemez (panelin önüne)", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t1");
    const s1 = reorderTab(s0, { id: "t2", toIndex: 0 });
    expect(s1.tabs[0].id).toBe(PANEL_TAB_ID);
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t2", "t1"]);
  });

  it("sınır dışı index kırpılır", () => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t1");
    const s1 = reorderTab(s0, { id: "t1", toIndex: 999 });
    expect(s1.tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t2", "t1"]);
  });
});

describe("openFromSidebar", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("aktif sekmenin kendi modülüne tıklanırsa modül KÖKÜNE gider", () => {
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/hazine/cek-senet", moduleKey: "/hazine/cek-senet" })],
      "t1",
    );
    const s1 = openFromSidebar(s0, {
      href: "/hazine/cek-senet",
      now: T0 + 1,
      newTab: false,
      newTabId: "new",
    });
    expect(s1.activeId).toBe("t1");
    expect(s1.tabs.find((t) => t.id === "t1")!.url).toBe("/hazine/cek-senet");
  });

  it("başka modülde açık sekme varsa EN SON bakılana geçer", () => {
    const s0 = stateWith(
      [
        panel,
        tab({ id: "t1", url: "/hazine", moduleKey: "/hazine", lastViewedAt: T0 }),
        tab({ id: "t2", url: "/hazine/cek-senet", moduleKey: "/hazine", lastViewedAt: T0 + 10 }),
        tab({ id: "t3", url: "/projeler", moduleKey: "/projeler" }),
      ],
      "t3",
    );
    const s1 = openFromSidebar(s0, { href: "/hazine", now: T0 + 20, newTab: false, newTabId: "new" });
    expect(s1.activeId).toBe("t2");
  });

  it("o modülde hiç sekme yoksa ön planda YENİ sekme açılır", () => {
    const s0 = stateWith([panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler" })], "t1");
    const s1 = openFromSidebar(s0, { href: "/hazine", now: T0 + 1, newTab: false, newTabId: "new" });
    expect(s1.activeId).toBe("new");
    expect(s1.tabs.some((t) => t.id === "new" && t.url === "/hazine")).toBe(true);
  });

  it("newTab=true → arka planda açılır, aktif değişmez", () => {
    const s0 = stateWith([panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler" })], "t1");
    const s1 = openFromSidebar(s0, { href: "/hazine", now: T0 + 1, newTab: true, newTabId: "new" });
    expect(s1.activeId).toBe("t1");
    expect(s1.tabs.some((t) => t.id === "new")).toBe(true);
  });
});

describe("navigateActive", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("aktif panel DEĞİLSE url/moduleKey günceller, aynı modülde title KORUNUR", () => {
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler", title: "Projeler" })],
      "t1",
    );
    const s1 = navigateActive(s0, { url: "/projeler/abc", now: T0 + 5, newTabId: "new" });
    const t1 = s1.tabs.find((t) => t.id === "t1")!;
    expect(t1.url).toBe("/projeler/abc");
    expect(t1.title).toBe("Projeler"); // modül değişmedi
    expect(t1.lastViewedAt).toBe(T0 + 5);
  });

  it("aktif panel DEĞİLSE ve modül DEĞİŞTİYSE title yeni modüle SIFIRLANIR", () => {
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler", title: "Projeler" })],
      "t1",
    );
    const s1 = navigateActive(s0, { url: "/hazine", now: T0 + 5, newTabId: "new" });
    const t1 = s1.tabs.find((t) => t.id === "t1")!;
    expect(t1.moduleKey).toBe("/hazine");
    expect(t1.title).toBe("Hazine");
  });

  it("aktif panel VE url '/' ise değişiklik yok", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = navigateActive(s0, { url: "/", now: T0 + 5, newTabId: "new" });
    expect(s1).toEqual(s0);
  });

  it("aktif panel VE url '/' dışındaysa, o modülde sekme varsa ona geçilir + url yazılır", () => {
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/hazine", moduleKey: "/hazine", lastViewedAt: T0 })],
      PANEL_TAB_ID,
    );
    const s1 = navigateActive(s0, { url: "/hazine/baska", now: T0 + 5, newTabId: "new" });
    expect(s1.activeId).toBe("t1");
    expect(s1.tabs.find((t) => t.id === "t1")!.url).toBe("/hazine/baska");
  });

  it("aktif panel VE url '/' dışındaysa, o modülde sekme YOKSA yeni ÖN PLAN sekme açılır", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = navigateActive(s0, { url: "/hazine", now: T0 + 5, newTabId: "new" });
    expect(s1.activeId).toBe("new");
    expect(s1.tabs.some((t) => t.id === "new" && t.url === "/hazine")).toBe(true);
  });
});

describe("reconcileWithUrl", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("url'si birebir eşleşen sekme varsa onu focus eder", () => {
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/hazine/cek-senet", moduleKey: "/hazine/cek-senet" })],
      PANEL_TAB_ID,
    );
    const s1 = reconcileWithUrl(s0, { url: "/hazine/cek-senet", now: T0 + 1, newTabId: "new" });
    expect(s1.activeId).toBe("t1");
  });

  it("url '/' ise panel focus edilir", () => {
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/hazine", moduleKey: "/hazine" })],
      "t1",
    );
    const s1 = reconcileWithUrl(s0, { url: "/", now: T0 + 1, newTabId: "new" });
    expect(s1.activeId).toBe(PANEL_TAB_ID);
  });

  it("aynı modülde en son bakılan sekmeye url yazılır ve focus edilir", () => {
    const s0 = stateWith(
      [
        panel,
        tab({ id: "t1", url: "/hazine", moduleKey: "/hazine", lastViewedAt: T0 }),
        tab({ id: "t2", url: "/hazine/cek-senet", moduleKey: "/hazine", lastViewedAt: T0 + 10 }),
      ],
      PANEL_TAB_ID,
    );
    const s1 = reconcileWithUrl(s0, { url: "/hazine/yeni-yol", now: T0 + 20, newTabId: "new" });
    expect(s1.activeId).toBe("t2");
    expect(s1.tabs.find((t) => t.id === "t2")!.url).toBe("/hazine/yeni-yol");
  });

  it("eşleşme yoksa yeni ön plan sekme açılır", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = reconcileWithUrl(s0, { url: "/projeler", now: T0 + 1, newTabId: "new" });
    expect(s1.activeId).toBe("new");
    expect(s1.tabs.some((t) => t.id === "new" && t.url === "/projeler")).toBe(true);
  });
});

describe("setTabTitle / activeTab", () => {
  it("setTabTitle var olan sekmenin title'ını değiştirir", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });
    const s0 = stateWith([panel, tab({ id: "t1" })], "t1");
    const s1 = setTabTitle(s0, { id: "t1", title: "Özel Ad" });
    expect(s1.tabs.find((t) => t.id === "t1")!.title).toBe("Özel Ad");
  });

  it("activeTab seçicisi aktif sekmeyi döner", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });
    const s0 = initialTabsState(T0);
    expect(activeTab(s0)?.id).toBe(PANEL_TAB_ID);
    const s1 = stateWith([panel, tab({ id: "t1" })], "t1");
    expect(activeTab(s1)?.id).toBe("t1");
  });
});

describe("PANEL DEĞİŞMEZİ — reducer paneli ASLA ikinci bir sekmeye çevirmez (O1)", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("navigateActive('/') panel-dışı sekmeden — ikinci '/' sekmesi OLUŞMAZ, panel odaklanır", () => {
    const s0 = stateWith([panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler" })], "t1");
    const s1 = navigateActive(s0, { url: "/", now: T0 + 5, newTabId: "new" });
    expect(s1.activeId).toBe(PANEL_TAB_ID);
    expect(s1.tabs.filter((t) => t.url === "/")).toHaveLength(1);
    expect(s1.tabs.find((t) => t.id === "t1")!.url).toBe("/projeler"); // eski sekme BOZULMADI
  });

  it("navigateActive('/?utm=x') panelin url'sini asla sorguya YAZMAZ", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = navigateActive(s0, { url: "/?utm=x", now: T0 + 5, newTabId: "new" });
    expect(s1.tabs.find((t) => t.id === PANEL_TAB_ID)!.url).toBe("/");
  });

  it("openTab('/') ön planda — ikinci sekme açmaz, mevcut paneli odaklar", () => {
    const s0 = stateWith([panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler" })], "t1");
    const s1 = openTab(s0, { newTabId: "new", url: "/", now: T0 + 5 });
    expect(s1.activeId).toBe(PANEL_TAB_ID);
    expect(s1.tabs.filter((t) => t.id === "new")).toHaveLength(0);
    expect(s1.tabs).toHaveLength(2);
  });

  it("openTab('/') arka planda (Ctrl+tık) — panel ZATEN açık, tam no-op", () => {
    const s0 = stateWith([panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler" })], "t1");
    const s1 = openTab(s0, { newTabId: "new", url: "/", now: T0 + 5, background: true });
    expect(s1).toBe(s0);
  });

  it("openFromSidebar('/', newTab: true) — arka planda no-op", () => {
    const s0 = stateWith([panel, tab({ id: "t1", url: "/projeler", moduleKey: "/projeler" })], "t1");
    const s1 = openFromSidebar(s0, { href: "/", now: T0 + 1, newTab: true, newTabId: "new" });
    expect(s1).toBe(s0);
  });

  it("reconcileWithUrl('/?x=1') panelin url'sini sorguya YAZMAZ", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = reconcileWithUrl(s0, { url: "/?x=1", now: T0 + 1, newTabId: "new" });
    expect(s1.activeId).toBe(PANEL_TAB_ID);
    expect(s1.tabs.find((t) => t.id === PANEL_TAB_ID)!.url).toBe("/");
  });
});

describe("reducer güvensiz url alırsa state AYNEN döner (Y1/Y2)", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("openTab güvensiz url ile no-op", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = openTab(s0, { newTabId: "new", url: "/./api/auth/logout", now: T0 + 1 });
    expect(s1).toBe(s0);
  });

  it("navigateActive güvensiz url ile no-op", () => {
    const s0 = stateWith([panel, tab({ id: "t1" })], "t1");
    const s1 = navigateActive(s0, { url: "//evil.com", now: T0 + 1, newTabId: "new" });
    expect(s1).toBe(s0);
  });

  it("openFromSidebar güvensiz href ile no-op", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = openFromSidebar(s0, { href: "/x/../api/x", now: T0 + 1, newTab: false, newTabId: "new" });
    expect(s1).toBe(s0);
  });

  it("reconcileWithUrl güvensiz url ile no-op", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = reconcileWithUrl(s0, { url: "/API/x", now: T0 + 1, newTabId: "new" });
    expect(s1).toBe(s0);
  });
});

describe("reorderTab — sonlu OLMAYAN toIndex reddedilir (O3)", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it.each([NaN, Infinity, -Infinity])("toIndex=%s → state aynen döner", (toIndex) => {
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t1");
    const s1 = reorderTab(s0, { id: "t2", toIndex });
    expect(s1).toBe(s0);
  });
});

describe("D2 — bekçisiz eşitlik kuralları", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true, lastViewedAt: 0 });

  it("enforceLimit eşitlikte SOLDAKİ (daha önce eklenen) kapanır", () => {
    const others = Array.from({ length: 9 }, (_, i) => tab({ id: `t${i}`, lastViewedAt: T0 }));
    const s0 = stateWith([panel, ...others], "t8");
    const s1 = openTab(s0, { newTabId: "t9", url: "/hazine", now: T0 + 100, background: true });
    // Tüm t0..t8 eşit lastViewedAt'a sahip: SOLDAKİ (t0) kapanmalı.
    expect(s1.tabs.find((t) => t.id === "t0")).toBeUndefined();
    expect(s1.tabs.find((t) => t.id === "t1")).toBeDefined();
  });

  it("openFromSidebar aynı modülde iki eşit lastViewedAt'lı sekmede SOLDAKİ seçilir", () => {
    const s0 = stateWith(
      [
        panel,
        tab({ id: "t1", url: "/hazine", moduleKey: "/hazine", lastViewedAt: T0 }),
        tab({ id: "t2", url: "/hazine/cek-senet", moduleKey: "/hazine", lastViewedAt: T0 }),
        tab({ id: "t3", url: "/projeler", moduleKey: "/projeler" }),
      ],
      "t3",
    );
    const s1 = openFromSidebar(s0, { href: "/hazine", now: T0 + 20, newTab: false, newTabId: "new" });
    expect(s1.activeId).toBe("t1"); // SOLDAKİ kazanır
  });
});

describe("D3 — enforceLimit YENİ açılan sekmeyi korur", () => {
  it("panel + aktif + yeni açılan 11. sekme HİÇBİRİ kapanmaz, en eski dördüncü sekme kapanır", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true, lastViewedAt: 0 });
    const others = Array.from({ length: 9 }, (_, i) => tab({ id: `t${i}`, lastViewedAt: T0 + i }));
    // t0 en eski VE aktif; yeni açılan sekme arka planda (background) açılıyor —
    // enforceLimit korumasız olsaydı yeni açılan en düşük lastViewedAt'a sahip
    // olduğu için HEMEN kapanırdı.
    const s0 = stateWith([panel, ...others], "t0");
    const s1 = openTab(s0, { newTabId: "bg", url: "/hazine", now: T0 - 1000, background: true });
    expect(s1.tabs.find((t) => t.id === "bg")).toBeDefined();
    expect(s1.tabs.find((t) => t.id === "t0")).toBeDefined(); // aktif, korunur
    expect(s1.tabs.find((t) => t.id === "t1")).toBeUndefined(); // en eski aktif-olmayan-korumasız
    expect(s1.tabs.length).toBe(MAX_WORKSPACE_TABS);
  });
});

describe("D4 — reconcileWithUrl aynı url'de EN SON bakılanı seçer", () => {
  it("iki sekme aynı url'i taşıyorsa (veri bozukluğu) en son bakılan focus edilir", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });
    const s0 = stateWith(
      [
        panel,
        tab({ id: "t1", url: "/projeler", moduleKey: "/projeler", lastViewedAt: T0 }),
        tab({ id: "t2", url: "/projeler", moduleKey: "/projeler", lastViewedAt: T0 + 50 }),
      ],
      PANEL_TAB_ID,
    );
    const s1 = reconcileWithUrl(s0, { url: "/projeler", now: T0 + 100, newTabId: "new" });
    expect(s1.activeId).toBe("t2"); // EN SON bakılan, en soldaki DEĞİL
  });
});

describe("girdi state'i mutasyona uğramaz (Object.freeze ile ölçülür)", () => {
  it("her eylem donmuş girdide patlamadan çalışır", () => {
    const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });
    const s0 = stateWith([panel, tab({ id: "t1" }), tab({ id: "t2" })], "t1");
    expect(() => {
      openTab(s0, { newTabId: "n1", url: "/hazine", now: T0 + 1 });
      focusTab(s0, { id: "t2", now: T0 + 1 });
      closeTab(s0, { id: "t2", now: T0 + 1 });
      closeOthers(s0, { id: "t1", now: T0 + 1 });
      closeRight(s0, { id: "t1", now: T0 + 1 });
      closeAll(s0, { now: T0 + 1 });
      reorderTab(s0, { id: "t2", toIndex: 1 });
      navigateActive(s0, { url: "/hazine", now: T0 + 1, newTabId: "n2" });
      openFromSidebar(s0, { href: "/hazine", now: T0 + 1, newTab: false, newTabId: "n3" });
      reconcileWithUrl(s0, { url: "/hazine", now: T0 + 1, newTabId: "n4" });
      setTabTitle(s0, { id: "t1", title: "x" });
      enforceLimit(s0);
    }).not.toThrow();
  });
});

/** Basit bellek-içi Storage sahtesi (persistence.test.ts / tabs-store.test.ts ile AYNI desen). */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
    clear: () => data.clear(),
  };
}

/**
 * `state`i kaydedip GERİ okur; sonucu `"OK"` (aynen geri geldi), `"DIFF"`
 * (geri geldi ama FARKLI) ya da `"REJECTED"` (doğrulayıcı TÜM veriyi
 * reddetti) olarak özetler. N1'in tek gerçek iddiası: reducer'ın ürettiği
 * HİÇBİR durum `"REJECTED"`/`"DIFF"` ÜRETMEZ.
 */
function roundTrip(state: WorkspaceTabsState): "OK" | "DIFF" | "REJECTED" {
  const storage = memoryStorage();
  saveWorkspaceTabs("u", state, storage);
  const loaded = loadWorkspaceTabs("u", storage);
  if (loaded === null) return "REJECTED";
  return JSON.stringify(loaded) === JSON.stringify({ tabs: state.tabs, activeId: state.activeId })
    ? "OK"
    : "DIFF";
}

describe("N1 — reducer'ın ürettiği HER durum save→load gidiş-dönüşünden AYNEN geçer", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("openTab 2100 karakterlik url ile — sınır TEK yerde (isSafeInternalUrl), sekme AÇILMAZ, roundtrip OK kalır", () => {
    const s0 = stateWith([panel, tab({ id: "a", url: "/projeler", moduleKey: "/projeler" })], "a");
    const s1 = openTab(s0, { newTabId: "n", url: "/projeler/" + "a".repeat(2100), now: T0 + 1 });
    expect(s1).toBe(s0); // güvensiz (aşırı uzun) url → no-op
    expect(roundTrip(s1)).toBe("OK");
  });

  it("setTabTitle 201 karakterlik başlıkla — REDDETMEZ, MAX_TAB_TITLE_LENGTH'e KIRPAR, roundtrip OK kalır", () => {
    const s0 = stateWith([panel, tab({ id: "a" })], "a");
    const s1 = setTabTitle(s0, { id: "a", title: "t".repeat(201) });
    const title = s1.tabs.find((t) => t.id === "a")!.title;
    expect(title).toHaveLength(MAX_TAB_TITLE_LENGTH);
    expect(title).toBe("t".repeat(MAX_TAB_TITLE_LENGTH));
    expect(roundTrip(s1)).toBe("OK");
  });

  it("panelin başlığı da 201 karakterle KIRPILIR (panel ÖZEL değil)", () => {
    const s0 = stateWith([panel], PANEL_TAB_ID);
    const s1 = setTabTitle(s0, { id: PANEL_TAB_ID, title: "t".repeat(201) });
    expect(s1.tabs[0].title).toHaveLength(MAX_TAB_TITLE_LENGTH);
    expect(roundTrip(s1)).toBe("OK");
  });

  describe("ÖZELLİK TESTİ — sabit tohumlu RNG, 40 koşu × 20 adım = 800 eylem, HER adımdan sonra roundtrip", () => {
    // Sabit tohum: deterministik, <1sn. `y2.test.ts` sonda probu (500×40, tek
    // seferlik betik) buradan KALICI bir teste taşındı; adım sayısı süre
    // bütçesi için küçültüldü ama aynı eylem karışımını korur.
    it("hiçbir adım REJECTED/DIFF üretmez (N1 dahil)", () => {
      let seed = 12345;
      const rnd = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
      const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
      const urls = [
        ...hrefs,
        "/",
        "/?x=1",
        "/?utm=a",
        "/projeler/1",
        "/projeler/2?tab=x",
        "/ayarlar/kullanicilar",
        "/bilinmeyen/y",
        "/x?y=//evil",
        "//evil.com",
        "/api/x",
        "/%61pi/x",
        "/a#b",
        "/stok?q=1",
        "/projeler/" + "a".repeat(2100), // N1: aşırı uzun url
      ];
      const titles = ["Başlık", "x".repeat(50), "y".repeat(201)]; // N1: aşırı uzun başlık dahil
      const violations: string[] = [];

      for (let run = 0; run < 40; run++) {
        let s: WorkspaceTabsState = initialTabsState(0);
        let t = 1;
        let idc = 0;
        for (let k = 0; k < 20; k++) {
          t += Math.floor(rnd() * 3);
          const ids = s.tabs.map((x) => x.id).concat(["zz", PANEL_TAB_ID]);
          const action = Math.floor(rnd() * 11);
          switch (action) {
            case 0:
              s = openTab(s, { newTabId: `t${idc++}`, url: pick(urls), now: t, background: rnd() < 0.5 });
              break;
            case 1:
              s = focusTab(s, { id: pick(ids), now: t });
              break;
            case 2:
              s = closeTab(s, { id: pick(ids), now: t });
              break;
            case 3:
              s = closeOthers(s, { id: pick(ids), now: t });
              break;
            case 4:
              s = closeRight(s, { id: pick(ids), now: t });
              break;
            case 5:
              if (rnd() < 0.3) s = closeAll(s, { now: t });
              break;
            case 6:
              s = reorderTab(s, { id: pick(ids), toIndex: pick([0, 1, 2, 3, 5, 9, 12, -1, 1.5, NaN]) });
              break;
            case 7:
              s = navigateActive(s, { url: pick(urls), now: t, newTabId: `t${idc++}` });
              break;
            case 8:
              s = openFromSidebar(s, { href: pick(urls), now: t, newTab: rnd() < 0.5, newTabId: `t${idc++}` });
              break;
            case 9:
              s = reconcileWithUrl(s, { url: pick(urls), now: t, newTabId: `t${idc++}` });
              break;
            case 10:
              s = setTabTitle(s, { id: pick(ids), title: pick(titles) });
              break;
            default:
              break;
          }
          const result = roundTrip(s);
          if (result !== "OK") {
            violations.push(`run${run} step${k} action${action} rt=${result}`);
          }
        }
      }

      expect(violations, violations.join("\n")).toEqual([]);
    });
  });
});

describe("N2 — reconcileWithUrl / openFromSidebar KENDİ güvenlik denetimleri (test boşluğu kapatıldı)", () => {
  const panel = tab({ id: PANEL_TAB_ID, url: "/", moduleKey: "/", pinned: true });

  it("reconcileWithUrl — GÜVENSİZ url, aynı modülde ADAY sekme varken BİLE o sekmeye YAZILMAZ", () => {
    // 🔴 Bu senaryo `openTab`in kendi doğrulamasından GEÇMEZ: "aday var"
    // dalı `updateTabAt`i DOĞRUDAN çağırır. `reconcileWithUrl`in KENDİ
    // `isSafeInternalUrl` denetimi silinirse bu test KIRMIZI olur (satır
    // silinerek doğrulandı, aşağıdaki MUTASYON raporuna bakınız).
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/hazine/cek-senet", moduleKey: "/hazine/cek-senet" })],
      PANEL_TAB_ID,
    );
    const unsafeUrl = "/hazine/cek-senet/x\\evil"; // ters bölü içeriyor — isSafeInternalUrl RET eder
    const s1 = reconcileWithUrl(s0, { url: unsafeUrl, now: T0 + 1, newTabId: "new" });
    expect(s1).toBe(s0);
    expect(s1.tabs.find((t) => t.id === "t1")!.url).toBe("/hazine/cek-senet");
  });

  it("openFromSidebar — GÜVENSİZ href, aktifin kendi modülüne 'tıklama' dalında bile no-op'tur", () => {
    // Bu dal `mod.rootHref`i (nav-config'ten SABİT/güvenli) yazar, `args.href`i
    // DEĞİL — yani nihai url her zaman güvenli kalır. Ama kendi denetimi
    // silinirse GÜVENSİZ bir href'e tıklamak yine de bir "gezinme" (lastViewedAt
    // güncellemesi + state referans değişimi) ÜRETİR; denetim BUNU da engeller,
    // yani girdi tamamen YOK sayılmalıdır (true no-op).
    const s0 = stateWith(
      [panel, tab({ id: "t1", url: "/hazine/cek-senet", moduleKey: "/hazine/cek-senet", lastViewedAt: T0 })],
      "t1",
    );
    const unsafeHref = "/hazine/cek-senet/x\\evil"; // aynı modüle eşleşir ama güvensiz
    const s1 = openFromSidebar(s0, { href: unsafeHref, now: T0 + 99, newTab: false, newTabId: "new" });
    expect(s1).toBe(s0);
    expect(s1.tabs.find((t) => t.id === "t1")!.lastViewedAt).toBe(T0);
  });
});
