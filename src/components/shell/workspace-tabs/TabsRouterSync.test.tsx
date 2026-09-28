import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PROJECT_QUERY_KEY } from "@/lib/api/hooks/useProjects";
import { SITE_QUERY_KEY } from "@/lib/api/hooks/useSites";
import { loadWorkspaceTabs, saveWorkspaceTabs, workspaceTabsStorageKey } from "@/lib/workspace-tabs/persistence";
import { createWorkspaceTabsStore, type WorkspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";
import { openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { initialTabsState, PANEL_TAB_ID } from "@/lib/workspace-tabs/types";
import { TabsRouterSync, tabUrlOf } from "./TabsRouterSync";

let currentPath = "/";
let currentSearch = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
  useSearchParams: () => currentSearch,
  useRouter: () => ({ push: vi.fn() }),
}));
let sessionMe: { id: string } | null = null;
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: sessionMe, isLoading: sessionMe === null }),
}));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

let storage: Storage;
let store: WorkspaceTabsStore;
let client: QueryClient;

function makeStore(): WorkspaceTabsStore {
  let clock = 1000;
  let seq = 0;
  return createWorkspaceTabsStore({
    now: () => (clock += 10),
    newId: () => `t${++seq}`,
    storage: () => storage,
  });
}

function go(path: string, search = ""): void {
  currentPath = path;
  currentSearch = new URLSearchParams(search);
}

function ui() {
  return (
    <QueryClientProvider client={client}>
      <TabsRouterSync store={store} />
    </QueryClientProvider>
  );
}

function urls(): string[] {
  return store.getSnapshot().tabs.map((t) => t.url);
}

function active() {
  const s = store.getSnapshot();
  return s.tabs.find((t) => t.id === s.activeId)!;
}

beforeEach(() => {
  storage = memoryStorage();
  store = makeStore();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  sessionMe = { id: "u-1" };
  go("/");
});

describe("tabUrlOf — router'dan okunan url KODLANMIŞ olmalı", () => {
  it("pathname + search birleşir", () => {
    expect(tabUrlOf("/projeler", "durum=aktif")).toBe("/projeler?durum=aktif");
    expect(tabUrlOf("/projeler", "")).toBe("/projeler");
  });

  it("ham Türkçe karakter yüzde-kodlanır, zaten kodlu olan ikinci kez kodlanmaz", () => {
    expect(tabUrlOf("/projeler/köprü", "")).toBe("/projeler/k%C3%B6pr%C3%BC");
    expect(tabUrlOf("/projeler/k%C3%B6pr%C3%BC", "")).toBe("/projeler/k%C3%B6pr%C3%BC");
  });

  it("pathname yoksa null", () => {
    expect(tabUrlOf(null, "")).toBeNull();
  });
});

describe("TabsRouterSync — URL → store", () => {
  it("oturum yokken mağazaya dokunmaz", () => {
    sessionMe = null;
    go("/projeler");
    render(ui());
    expect(urls()).toEqual(["/"]);
  });

  it("attach sonrası reconcile: kayıtlı sekme geri gelir ve URL'yle eşleşen aktif olur", () => {
    const saved = openTab(openTab(initialTabsState(500), { newTabId: "a", url: "/projeler?durum=aktif", now: 600 }), {
      newTabId: "b",
      url: "/hazine",
      now: 700,
    });
    saveWorkspaceTabs("u-1", saved, storage);
    sessionMe = null;
    go("/projeler", "durum=aktif");
    const view = render(ui());
    expect(urls()).toEqual(["/"]);

    sessionMe = { id: "u-1" };
    view.rerender(ui());
    expect(urls()).toEqual(["/", "/projeler?durum=aktif", "/hazine"]);
    expect(store.getSnapshot().activeId).toBe("a");
  });

  it("URL değişimi aktif sekmenin url'sini QUERY DAHİL günceller", () => {
    go("/projeler");
    const view = render(ui());
    expect(active().url).toBe("/projeler");

    go("/projeler", "durum=aktif&sayfa=2");
    view.rerender(ui());
    expect(active().url).toBe("/projeler?durum=aktif&sayfa=2");
    expect(urls()).toHaveLength(2);
  });

  it("panel aktifken /projeler → YENİ ön plan sekmesi, panel '/' kalır", () => {
    go("/");
    const view = render(ui());
    expect(store.getSnapshot().activeId).toBe(PANEL_TAB_ID);

    go("/projeler");
    view.rerender(ui());
    expect(urls()).toEqual(["/", "/projeler"]);
    expect(active().url).toBe("/projeler");
  });

  it("geri/ileri (URL değişimi) YALNIZ aktif sekmeyi günceller", () => {
    go("/projeler");
    const view = render(ui());
    act(() => store.dispatch(openTab, { url: "/hazine" }));
    go("/hazine");
    view.rerender(ui());
    // Tarayıcı geri: önceki sekmenin adresi AKTİF sekmeye yazılır (KARARLAR bilinen davranış).
    go("/projeler");
    view.rerender(ui());
    expect(urls()).toEqual(["/", "/projeler", "/projeler"]);
    expect(store.getSnapshot().activeId).toBe(store.getSnapshot().tabs[2].id);
  });

  it("Türkçe karakterli yol kodlanmış olarak sekmeye yazılır", () => {
    go("/projeler/köprü");
    render(ui());
    expect(active().url).toBe("/projeler/k%C3%B6pr%C3%BC");
  });

  it("aynı URL'de yeniden render mağazaya yeni eylem göndermez", () => {
    go("/projeler");
    const view = render(ui());
    const before = store.getSnapshot();
    view.rerender(ui());
    expect(store.getSnapshot()).toBe(before);
  });
});

describe("N2 — kullanıcı değişince mağaza YENİDEN iliştirilir (mahremiyet yolu)", () => {
  it("aynı URL'de u-1 → u-2: u-1'in sekmeleri u-2'ye görünmez ve u-2'nin anahtarına yazılmaz", () => {
    const u1Saved = openTab(initialTabsState(500), { newTabId: "gizli", url: "/hazine", now: 600 });
    saveWorkspaceTabs("u-1", u1Saved, storage);
    sessionMe = { id: "u-1" };
    go("/projeler");
    const view = render(ui());
    expect(urls()).toEqual(["/", "/hazine", "/projeler"]);
    const u1Raw = storage.getItem(workspaceTabsStorageKey("u-1"));

    sessionMe = { id: "u-2" };
    view.rerender(ui());
    expect(urls()).toEqual(["/", "/projeler"]);
    const u2 = loadWorkspaceTabs("u-2", storage);
    expect(u2?.tabs.map((t) => t.url)).toEqual(["/", "/projeler"]);
    expect(storage.getItem(workspaceTabsStorageKey("u-1"))).toBe(u1Raw);
  });
});

describe("TabsRouterSync — sekme başlığı", () => {
  it("/projeler/<p>: önbellekte proje adı varsa sekme başlığı proje adı olur", () => {
    client.setQueryData([PROJECT_QUERY_KEY, "gunesken"], { name: "Güneşkent Konut" });
    go("/projeler/gunesken");
    render(ui());
    expect(active().title).toBe("Güneşkent Konut");
  });

  it("ad pending iken yazılmaz (modül etiketi kalır), ad gelince yazılır", async () => {
    go("/projeler/gunesken");
    render(ui());
    expect(active().title).toBe("Projeler");
    act(() => client.setQueryData([PROJECT_QUERY_KEY, "gunesken"], { name: "Güneşkent Konut" }));
    await waitFor(() => expect(active().title).toBe("Güneşkent Konut"));
  });

  it("şantiye alt ağacında ŞANTİYE adı proje adından önce gelir", () => {
    client.setQueryData([PROJECT_QUERY_KEY, "gunesken"], { name: "Güneşkent Konut" });
    client.setQueryData([SITE_QUERY_KEY, "a-blok", "gunesken"], {
      name: "A-Blok",
      project: { name: "Güneşkent Konut" },
    });
    go("/projeler/gunesken/santiyeler/a-blok");
    render(ui());
    expect(active().title).toBe("A-Blok");
  });

  it("detaydan modül köküne dönünce başlık modül etiketine döner", () => {
    client.setQueryData([PROJECT_QUERY_KEY, "gunesken"], { name: "Güneşkent Konut" });
    go("/projeler/gunesken");
    const view = render(ui());
    expect(active().title).toBe("Güneşkent Konut");
    go("/projeler");
    view.rerender(ui());
    expect(active().title).toBe("Projeler");
  });
});

describe("TabsRouterSync — Ctrl/orta tık yakalayıcısı bağlı", () => {
  it("oturum varken Ctrl+tık arka planda sekme açar, aktif değişmez", () => {
    go("/projeler");
    render(ui());
    const a = document.createElement("a");
    a.setAttribute("href", "/hazine");
    document.body.appendChild(a);
    act(() => {
      a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    });
    expect(urls()).toEqual(["/", "/projeler", "/hazine"]);
    expect(active().url).toBe("/projeler");
    a.remove();
  });
});
