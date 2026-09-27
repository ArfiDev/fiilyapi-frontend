import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PROJECT_QUERY_KEY } from "@/lib/api/hooks/useProjects";
import { loadWorkspaceTabs, saveWorkspaceTabs } from "@/lib/workspace-tabs/persistence";
import { openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { createWorkspaceTabsStore, type WorkspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";
import { initialTabsState } from "@/lib/workspace-tabs/types";
import { createUnsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { fakeAppRouter as fake } from "./fake-app-router.testkit";
import { createPendingNavigation, type PendingNavigation } from "./pending-navigation";
import { TabsRouterSync } from "./TabsRouterSync";
import { useWorkspaceTabsController, type WorkspaceTabsController } from "./useWorkspaceTabsController";

/**
 * SEKME-F1.4a-FIX · YARIŞ REGRESYONU (rv3 sondası depoya taşındı).
 *
 * Denetleyici ve senkron BİRLİKTE, Next 15 action-queue'yu taklit eden
 * ATMALI + ASENKRON sahte router üstünde koşar (`fake-app-router.testkit`):
 * push/replace `resolve()` gelene kadar URL'yi DEĞİŞTİRMEZ, yeni gezinme
 * bekleyeni ATAR, geri tuşu senkron uygulanır ve `popstate` atar.
 *
 * Kayıtlı başlangıç: panel + A(/projeler/1) + B(/hazine?x=b) + C(/puantaj?hafta=3).
 */
vi.mock("next/navigation", async () => (await import("./fake-app-router.testkit")).fakeNavigationModule());
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u-1" }, isLoading: false }),
}));

const OWN = { panel: "/", A: "/projeler/1", B: "/hazine?x=b", C: "/puantaj?hafta=3" };

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
let navigation: PendingNavigation;
let client: QueryClient;
const registry = createUnsavedRegistry();
const ctl: { current: WorkspaceTabsController | null } = { current: null };

function Probe() {
  ctl.current = useWorkspaceTabsController({ store, registry, navigation });
  return null;
}

function setup(start: string): void {
  storage = memoryStorage();
  let clock = 1000;
  let seq = 0;
  store = createWorkspaceTabsStore({ now: () => (clock += 10), newId: () => `t${++seq}`, storage: () => storage });
  navigation = createPendingNavigation();
  let s = initialTabsState(100);
  s = openTab(s, { newTabId: "A", url: OWN.A, now: 200 });
  s = openTab(s, { newTabId: "B", url: OWN.B, now: 300 });
  s = openTab(s, { newTabId: "C", url: OWN.C, now: 400 });
  saveWorkspaceTabs("u-1", s, storage);
  fake.reset(start);
  client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <TabsRouterSync store={store} navigation={navigation} />
      <Probe />
    </QueryClientProvider>,
  );
}

function tabs(): Record<string, string> {
  return Object.fromEntries(store.getSnapshot().tabs.map((t) => [t.id, t.url]));
}
function saved(): Record<string, string> | null {
  const loaded = loadWorkspaceTabs("u-1", storage);
  return loaded ? Object.fromEntries(loaded.tabs.map((t) => [t.id, t.url])) : null;
}
function activeId(): string {
  return store.getSnapshot().activeId;
}
const c = () => ctl.current!;

afterEach(() => {
  ctl.current = null;
  registry.set("race-dirty", null);
});

describe("YARIŞ — bugünkü doğru davranışlar korunur", () => {
  it("S0 başlangıç: kayıtlı sekmeler gelir, URL'deki A aktif", () => {
    setup(OWN.A);
    expect(activeId()).toBe("A");
    expect(tabs()).toEqual(OWN);
  });

  it("S1 seç B → seç C (B gelmeden) → C çözülür: her sekme kendi adresinde", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => c().selectTab("C"));
    act(() => fake.resolve());
    expect(tabs()).toEqual(OWN);
    expect(saved()).toEqual(OWN);
    expect(activeId()).toBe("C");
  });

  it("S2 seç B → gelir → seç C → gelir; fazladan yeniden-dayatma YOK (push+replace = 2)", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => fake.resolve());
    act(() => c().selectTab("C"));
    act(() => fake.resolve());
    expect(tabs()).toEqual(OWN);
    expect(saved()).toEqual(OWN);
    expect(fake.navigationCalls()).toBe(2);
  });

  it("S3 seç B (yolda) → sidebar /puantaj (C açık) → C öne, adresler kendi", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => c().openFromSidebar("/puantaj"));
    act(() => fake.resolve());
    expect(tabs()).toEqual(OWN);
    expect(activeId()).toBe("C");
  });

  it("S4 aktif A'yı kapat + hemen seç C", () => {
    setup(OWN.A);
    act(() => c().closeTab("A"));
    act(() => c().selectTab("C"));
    act(() => fake.resolve());
    const rest = { panel: "/", B: OWN.B, C: OWN.C };
    expect(tabs()).toEqual(rest);
    expect(saved()).toEqual(rest);
  });

  it("sekmeye vardıktan sonra sayfanın KENDİ gezinmesi o sekmeye yazılır (kayıt temizlendi)", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => fake.resolve());
    act(() => fake.router.replace("/hazine?x=b&sayfa=2"));
    act(() => fake.resolve());
    expect(tabs().B).toBe("/hazine?x=b&sayfa=2");
    expect(fake.navigationCalls()).toBe(2);
  });
});

describe("YARIŞ — eski sayfanın gezinmesi yeni aktif sekmeye YAZILMAZ", () => {
  it("S6 seç B → A sayfası router.replace → B kendi adresinde kalır, B yeniden dayatılır", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => fake.router.replace("/projeler/1?q=x")); // A'nın kendi replace'i B'nin push'unu ATAR
    act(() => fake.resolve());
    expect(tabs().B).toBe(OWN.B);
    expect(saved()!.B).toBe(OWN.B);
    expect(fake.hasPending()).toBe(true); // yeniden dayatma yolda
    act(() => fake.resolve());
    expect(fake.committed()).toBe(OWN.B);
    expect(tabs()).toEqual(OWN);
    expect(saved()).toEqual(OWN);
    expect(fake.log()).toEqual([
      "push /hazine?x=b",
      "discard /hazine?x=b",
      "replace /projeler/1?q=x",
      "commit /projeler/1?q=x",
      "replace /hazine?x=b",
      "commit /hazine?x=b",
    ]);
  });

  it("S7 seç B → eski içerikte bağlantı tıkı → B kendi adresinde kalır", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => fake.router.push("/projeler/1/sozlesmeler"));
    act(() => fake.resolve());
    expect(tabs().B).toBe(OWN.B);
    expect(saved()!.B).toBe(OWN.B);
    act(() => fake.resolve());
    expect(fake.committed()).toBe(OWN.B);
    expect(tabs()).toEqual(OWN);
  });

  it("S8 A→B→C hızlı + ARADA eski sayfa replace → C ezilmez, C'ye varılır", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => c().selectTab("C"));
    act(() => fake.router.replace("/projeler/1?q=x"));
    act(() => fake.resolve());
    expect(tabs().C).toBe(OWN.C);
    act(() => fake.resolve());
    expect(fake.committed()).toBe(OWN.C);
    expect(tabs()).toEqual(OWN);
    expect(saved()).toEqual(OWN);
  });

  it("S2b B'nin sonucu C seçildikten SONRA commit edilirse (superseded) C'ye geçici bile yazılmaz, yeniden dayatma YOK", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => c().selectTab("C"));
    act(() => fake.commitRaw(OWN.B, "push"));
    expect(tabs()).toEqual(OWN);
    expect(saved()).toEqual(OWN);
    act(() => fake.resolve());
    expect(tabs()).toEqual(OWN);
    expect(saved()).toEqual(OWN);
    expect(fake.navigationCalls()).toBe(2); // yalnız iki push; superseded için replace YOK
  });

  it("YÖNLENDİRME: push hedefi sunucuda başka yola döner → tek yeniden-dayatma, döngü yok (push+replace ≤ 2)", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    let rounds = 0;
    // Sunucu her istekte AYNI yönlendirmeyi yapar; sınır yoksa bu döngü dönmeye devam ederdi.
    while (fake.hasPending() && rounds < 10) {
      act(() => fake.resolveAs("/hazine/yeni"));
      rounds += 1;
    }
    expect(fake.navigationCalls()).toBeLessThanOrEqual(2);
    expect(rounds).toBe(2);
    expect(fake.committed()).toBe("/hazine/yeni");
    expect(activeId()).toBe("B");
    // Yeniden dayatma AYNI adrese döndü → URL değişmedi, gözlenecek olay yok:
    // B kendi (istenen) adresini korur, eski sekme yönlendirme adresiyle KİRLENMEZ.
    expect(tabs()).toEqual(OWN);
    expect(saved()).toEqual(OWN);
  });

  it("YÖNLENDİRME her istekte FARKLI adrese dönerse (URL her seferinde değişir) tek-sefer sınırı döngüyü keser: push+replace ≤ 2", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    let rounds = 0;
    while (fake.hasPending() && rounds < 10) {
      rounds += 1;
      const target = `/hazine/yeni?n=${rounds}`;
      act(() => fake.resolveAs(target));
    }
    expect(rounds).toBe(2); // sınırsız olsaydı 10'a kadar dönerdi
    expect(fake.navigationCalls()).toBeLessThanOrEqual(2);
    expect(fake.committed()).toBe("/hazine/yeni?n=2");
    expect(tabs().B).toBe("/hazine/yeni?n=2"); // ikinci yabancı kabul edildi
    expect(tabs().A).toBe(OWN.A);
  });

  it("YÖNLENDİRME sonrası B'deki ilk gezinme B'ye yazılır; sidebar'da B'nin modülü köke gider (kayıt asılı kalmaz)", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => fake.resolveAs("/hazine/yeni"));
    act(() => fake.resolveAs("/hazine/yeni"));
    act(() => c().openFromSidebar("/hazine"));
    expect(fake.hasPending()).toBe(true);
    act(() => fake.resolve());
    expect(fake.committed()).toBe("/hazine");
    expect(tabs().B).toBe("/hazine");
    act(() => fake.router.push("/hazine?durum=acik"));
    act(() => fake.resolve());
    expect(tabs().B).toBe("/hazine?durum=acik");
  });

  it("S3b seç B (yolda) → sidebar'da B'nin KENDİ modülü → B'nin query'li url'si köke EZİLMEZ", () => {
    setup(OWN.A);
    act(() => c().selectTab("B"));
    act(() => c().openFromSidebar("/hazine"));
    act(() => fake.resolve());
    expect(tabs().B).toBe(OWN.B);
    expect(fake.committed()).toBe(OWN.B);
    expect(activeId()).toBe("B");
  });
});

describe("YARIŞ — kabul edilmiş (Q5) davranışlar: bugünkü gibi", () => {
  it("S5 panelden A'ya sayfa içi → seç B (yolda) → geri: bekleyen atılır, panel öne gelir", () => {
    setup("/");
    act(() => fake.commitRaw(OWN.A, "push"));
    act(() => c().selectTab("B"));
    act(() => fake.back());
    expect(fake.committed()).toBe("/");
    expect(activeId()).toBe("panel");
    expect(tabs().B).toBe(OWN.B);
  });

  it("S5b BUGÜNKÜ DAVRANIŞ (Q5): A içinde ilerle → seç B (yolda) → geri: geri gelen adres AKTİF B'ye yazılır", () => {
    setup(OWN.A);
    act(() => fake.commitRaw("/projeler/1/sozlesmeler", "push"));
    act(() => c().selectTab("B"));
    act(() => fake.back());
    expect(fake.committed()).toBe(OWN.A);
    expect(activeId()).toBe("B");
    expect(tabs().B).toBe(OWN.A);
    expect(fake.hasPending()).toBe(false); // popstate için yeniden dayatma YOK
  });
});

describe("YARIŞ — dirty (CEO D1 kararı: sidebar kabuktur, aktif modül tıkı da onaydan geçer)", () => {
  it("D1 dirty varken aktif sekmenin KENDİ modülüne sidebar tıkı → onay; Vazgeç → push yok", () => {
    setup(OWN.C);
    registry.set("race-dirty", { label: "Puantaj" });
    act(() => c().openFromSidebar("/puantaj"));
    expect(c().guard.isOpen).toBe(true);
    act(() => c().guard.cancel());
    expect(fake.navigationCalls()).toBe(0);
    expect(tabs().C).toBe(OWN.C);
  });

  it("D1 dirty varken 'at ve geç' → modül köküne gidilir", () => {
    setup(OWN.C);
    registry.set("race-dirty", { label: "Puantaj" });
    act(() => c().openFromSidebar("/puantaj"));
    act(() => c().guard.confirm());
    act(() => fake.resolve());
    expect(fake.committed()).toBe("/puantaj");
    expect(tabs().C).toBe("/puantaj");
  });

  it("D2 seç B → modal → Vazgeç → mağaza ve router DOKUNULMAZ", () => {
    setup(OWN.A);
    registry.set("race-dirty", { label: "X" });
    const before = store.getSnapshot();
    act(() => c().selectTab("B"));
    expect(c().guard.isOpen).toBe(true);
    act(() => c().guard.cancel());
    expect(store.getSnapshot()).toBe(before);
    expect(fake.log()).toEqual([]);
  });
});

describe("N1 — başlık bekçisi: push yoldayken eski adresin adı YENİ aktif sekmeye yazılmaz", () => {
  it("A proje detayındayken B seçilir (yolda) → B'nin başlığı proje adı OLMAZ", async () => {
    setup(OWN.A);
    await act(async () => {
      client.setQueryData([PROJECT_QUERY_KEY, "1"], { name: "Güneşkent Konut" });
      await new Promise((r) => setTimeout(r, 0));
    });
    // POZİTİF KONTROL: URL'yle eşleşen aktif A adı alıyor (bekçi körlemesine her şeyi kesmiyor).
    expect(store.getSnapshot().tabs.find((t) => t.id === "A")?.title).toBe("Güneşkent Konut");
    act(() => c().selectTab("B"));
    // URL hâlâ A'nınki; ad değişip yeni bir render turu tetiklensin.
    await act(async () => {
      client.setQueryData([PROJECT_QUERY_KEY, "1"], { name: "Güneşkent Konut 2" });
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(store.getSnapshot().tabs.find((t) => t.id === "B")?.title).toBe("Hazine");
  });
});
