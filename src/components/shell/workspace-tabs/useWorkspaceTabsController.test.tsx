import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { createWorkspaceTabsStore, type WorkspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";
import { navigateActive, openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { createUnsavedRegistry, type UnsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { PANEL_TAB_ID } from "@/lib/workspace-tabs/types";
import { createPendingNavigation } from "./pending-navigation";
import { useWorkspaceTabsController } from "./useWorkspaceTabsController";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));
let sessionMe: { id: string } | null = { id: "u-1" };
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: sessionMe, isLoading: false }),
}));

let store: WorkspaceTabsStore;
let registry: UnsavedRegistry;

function makeStore(): WorkspaceTabsStore {
  let clock = 1000;
  let seq = 0;
  return createWorkspaceTabsStore({
    now: () => (clock += 10),
    newId: () => `t${++seq}`,
    storage: () => null,
  });
}

/** Panel + Projeler(t1, filtreli) + Puantaj(t2, aktif). */
function seedThreeTabs(): void {
  store.dispatch(openTab, { url: "/projeler?durum=aktif" });
  store.dispatch(openTab, { url: "/puantaj?hafta=32" });
}

function setup() {
  const navigation = createPendingNavigation();
  return renderHook(() => useWorkspaceTabsController({ store, registry, navigation }));
}

function markDirty(label = "Puantaj"): void {
  registry.set("kaynak-1", { label });
}

beforeEach(() => {
  store = makeStore();
  registry = createUnsavedRegistry();
  sessionMe = { id: "u-1" };
});
afterEach(() => {
  pushMock.mockReset();
});

describe("useWorkspaceTabsController — seç", () => {
  it("başka sekmeyi seçmek onu öne getirir ve HATIRLANAN url'sine (query dahil) gider", () => {
    seedThreeTabs();
    const { result } = setup();
    act(() => result.current.selectTab("t1"));
    expect(store.getSnapshot().activeId).toBe("t1");
    expect(pushMock).toHaveBeenCalledWith("/projeler?durum=aktif");
    expect(result.current.guard.isOpen).toBe(false);
  });

  it("zaten aktif sekmeyi seçmek hiçbir şey yapmaz (push YOK)", () => {
    seedThreeTabs();
    const { result } = setup();
    act(() => result.current.selectTab("t2"));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("dirty varken başka sekme seçmek ÖNCE modal açar; Vazgeç → hiçbir şey olmaz", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.selectTab("t1"));
    expect(result.current.guard.isOpen).toBe(true);
    expect(result.current.guard.labels).toEqual(["Puantaj"]);
    expect(store.getSnapshot().activeId).toBe("t2");
    expect(pushMock).not.toHaveBeenCalled();

    act(() => result.current.guard.cancel());
    expect(result.current.guard.isOpen).toBe(false);
    expect(store.getSnapshot().activeId).toBe("t2");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("dirty varken 'at ve geç' → eylem yürür ve push edilir", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.selectTab("t1"));
    act(() => result.current.guard.confirm());
    expect(result.current.guard.isOpen).toBe(false);
    expect(store.getSnapshot().activeId).toBe("t1");
    expect(pushMock).toHaveBeenCalledWith("/projeler?durum=aktif");
  });
});

describe("useWorkspaceTabsController — kapat", () => {
  it("aktif OLMAYAN sekmeyi kapatmak dirty olsa bile modal AÇMAZ, push YOK", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.closeTab("t1"));
    expect(result.current.guard.isOpen).toBe(false);
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t2"]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("aktif sekmeyi kapatmak komşuya geçer ve onun url'sine gider", () => {
    seedThreeTabs();
    const { result } = setup();
    act(() => result.current.closeTab("t2"));
    expect(store.getSnapshot().activeId).toBe("t1");
    expect(pushMock).toHaveBeenCalledWith("/projeler?durum=aktif");
  });

  it("dirty varken aktif sekmeyi kapatmak modal açar; Vazgeç → sekme durur", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.closeTab("t2"));
    expect(result.current.guard.isOpen).toBe(true);
    act(() => result.current.guard.cancel());
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1", "t2"]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("diğerlerini kapat — hedef aktifse modal YOK, push YOK", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.closeOthers("t2"));
    expect(result.current.guard.isOpen).toBe(false);
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t2"]);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("diğerlerini kapat — hedef aktif DEĞİLSE (aktif kapanır) dirty modalı ister", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.closeOthers("t1"));
    expect(result.current.guard.isOpen).toBe(true);
    act(() => result.current.guard.confirm());
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1"]);
    expect(pushMock).toHaveBeenCalledWith("/projeler?durum=aktif");
  });

  it("sağdakileri kapat — aktif sağdaysa dirty modalı ister, onayla panel+t1 kalır", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.closeRight("t1"));
    expect(result.current.guard.isOpen).toBe(true);
    act(() => result.current.guard.confirm());
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1"]);
    expect(store.getSnapshot().activeId).toBe("t1");
  });

  it("sağdakileri kapat — aktif solda kalıyorsa modal YOK", () => {
    seedThreeTabs();
    store.dispatch(openTab, { url: "/hazine" }); // t3 aktif
    store.dispatch(openTab, { url: "/bordro", background: true }); // t4
    markDirty();
    const { result } = setup();
    act(() => result.current.closeRight("t3"));
    expect(result.current.guard.isOpen).toBe(false);
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t1", "t2", "t3"]);
  });

  it("tümünü kapat — dirty varsa modal; onayla yalnız panel kalır ve '/'e gidilir", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.closeAll());
    expect(result.current.guard.isOpen).toBe(true);
    act(() => result.current.guard.confirm());
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID]);
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("panel aktifken tümünü kapat — aktif değişmez, modal YOK", () => {
    seedThreeTabs();
    store.dispatch(navigateActive, { url: "/" });
    markDirty();
    const { result } = setup();
    act(() => result.current.closeAll());
    expect(result.current.guard.isOpen).toBe(false);
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID]);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("useWorkspaceTabsController — sırala", () => {
  it("sıralama modal istemez ve gezinmez", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.reorderTab("t2", 1));
    expect(store.getSnapshot().tabs.map((t) => t.id)).toEqual([PANEL_TAB_ID, "t2", "t1"]);
    expect(result.current.guard.isOpen).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("useWorkspaceTabsController — sidebar düz tık", () => {
  it("açık modüle tık → o sekme öne + HATIRLANAN url (query dahil)", () => {
    seedThreeTabs();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/projeler"));
    expect(store.getSnapshot().activeId).toBe("t1");
    expect(pushMock).toHaveBeenCalledWith("/projeler?durum=aktif");
  });

  // CEO D1 kararı (2026-09-27): sidebar kabuğun parçasıdır, "sayfa içi
  // bağlantı" sayılmaz — eskiden bu tık dirty'de de ONAYSIZ köke gidiyordu;
  // beklenti TERSİNE çevrildi.
  it("D1 dirty varken aktif modüle tık → ONAY modalı; Vazgeç → push yok, url değişmez", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/puantaj"));
    expect(result.current.guard.isOpen).toBe(true);
    act(() => result.current.guard.cancel());
    expect(pushMock).not.toHaveBeenCalled();
    expect(store.getSnapshot().tabs[2].url).toBe("/puantaj?hafta=32");
  });

  it("D1 dirty varken aktif modüle tık → 'at ve geç' → aynı sekme modül köküne gider", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/puantaj"));
    act(() => result.current.guard.confirm());
    expect(store.getSnapshot().activeId).toBe("t2");
    expect(store.getSnapshot().tabs[2].url).toBe("/puantaj");
    expect(pushMock).toHaveBeenCalledWith("/puantaj");
  });

  it("dirty DEĞİLKEN aktif modüle tık → onaysız, aynı sekme modül köküne gider", () => {
    seedThreeTabs();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/puantaj"));
    expect(result.current.guard.isOpen).toBe(false);
    expect(store.getSnapshot().activeId).toBe("t2");
    expect(pushMock).toHaveBeenCalledWith("/puantaj");
  });

  it("dirty varken zaten modül kökündeki aktif modüle tık → hiçbir şey değişmez, modal YOK", () => {
    store.dispatch(openTab, { url: "/puantaj" });
    markDirty();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/puantaj"));
    expect(result.current.guard.isOpen).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("kapalı modüle tık → yeni ön plan sekmesi + push", () => {
    seedThreeTabs();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/hazine"));
    const state = store.getSnapshot();
    expect(state.tabs).toHaveLength(4);
    expect(state.tabs[3]).toMatchObject({ url: "/hazine", title: "Hazine" });
    expect(state.activeId).toBe(state.tabs[3].id);
    expect(pushMock).toHaveBeenCalledWith("/hazine");
  });

  it("dirty varken başka modüle tık → modal; Vazgeç → push YOK, sekme açılmaz", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/hazine"));
    expect(result.current.guard.isOpen).toBe(true);
    act(() => result.current.guard.cancel());
    expect(pushMock).not.toHaveBeenCalled();
    expect(store.getSnapshot().tabs).toHaveLength(3);
  });

  it("dirty varken başka modüle tık → 'at ve geç' → push", () => {
    seedThreeTabs();
    markDirty();
    const { result } = setup();
    act(() => result.current.openFromSidebar("/hazine"));
    act(() => result.current.guard.confirm());
    expect(pushMock).toHaveBeenCalledWith("/hazine");
  });

  it("panel aktifken panele tık → durum değişmez, push YOK", () => {
    const { result } = setup();
    act(() => result.current.openFromSidebar("/"));
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("useWorkspaceTabsController — hazırlık", () => {
  it("oturum yokken isReady=false, varken true", () => {
    sessionMe = null;
    const { result, rerender } = setup();
    expect(result.current.isReady).toBe(false);
    sessionMe = { id: "u-1" };
    rerender();
    expect(result.current.isReady).toBe(true);
  });
});
