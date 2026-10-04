import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { navigateActive, openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { workspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import Sidebar from "./Sidebar";
import { pendingNavigation } from "./workspace-tabs/pending-navigation";

const pushMock = vi.fn();
let currentPath = "/";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => currentPath,
}));
// SEKME-F1.4a: `id` YOKKEN mağaza kullanıcıya iliştirilmemiş sayılır ve nav
// öğeleri düz Link gibi davranır (eski testler bu hâlde koşar); sekme
// davranışı testleri `id`li oturumla koşar.
const BASE_ME = { full_name: "Ahmet Yılmaz", role_key: "patron", title: "Patron" };
let sessionMe: Record<string, string> = BASE_ME;
vi.mock("./SessionProvider", () => ({
  useSession: () => ({ me: sessionMe, isLoading: false }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  pushMock.mockReset();
  currentPath = "/";
  sessionMe = BASE_ME;
  unsavedRegistry.set("sidebar-test", null);
});

describe("Sidebar", () => {
  // 🔴 F-NAVSAHA · KULLANICI KARARI 2026-09-05 — `Saha & İK` başlığı İKİYE
  // ayrıldı (`Saha` + `İK`). Beklenti GEVŞETİLMEDİ: eskiden iki başlık
  // aranıyordu, şimdi BEŞİNİN HEPSİ DOM'da aranır, yani bir grup sessizce
  // düşerse test kırmızıya döner.
  it("bes grup basligini ve nav ogelerini gosterir", () => {
    render(<Sidebar />);
    for (const heading of ["Genel", "Saha", "İK", "Teklif ve Sözleşmeler", "Stok & Satınalma", "Mali"]) {
      expect(screen.getByText(heading), `"${heading}" grup başlığı`).toBeInTheDocument();
    }
    // Ayrılan grupların öğeleri DOM'da gerçekten duruyor mu.
    expect(screen.getByRole("link", { name: /Gösterge Paneli/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Projeler/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Günlük Kayıt/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Personel/ })).toBeInTheDocument();
  });

  it("aktif rotayi vurgular (aria-current)", () => {
    currentPath = "/";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Gösterge Paneli/ })).toHaveAttribute("aria-current", "page");
  });

  it("prefix eslesmeyle alt rotayi aktif sayar", () => {
    currentPath = "/projeler/123";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Projeler/ })).toHaveAttribute("aria-current", "page");
  });

  // 🔴 F-UNIT1 T4 · ÇİFT AKTİFLİK BEKÇİSİ (DOM düzeyinde). `Çek & Ödeme`
  // nav'ın İLK iç içe href'idir; satır başına `isActivePath` çağıran eski
  // sürüm bu yolda `Hazine`yi de yakar ve aynı `<nav>` içinde İKİ
  // `aria-current="page"` basardı.
  it("ic ice rotada YALNIZ alt oge aktiftir (cift aria-current YOK)", () => {
    currentPath = "/hazine/cek-senet";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Çek & Ödeme/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /^Hazine$/ })).not.toHaveAttribute("aria-current");
    expect(
      screen.getAllByRole("link").filter((el) => el.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  it("kullanici adini gosterir ve cikis /login'e yonlendirir", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 204 }));
    render(<Sidebar />);
    expect(screen.getByText("Ahmet Yılmaz")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /çıkış/i }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  // 🔴 KAYIT NO 297 — bekci (a): BFF basarisiz donerse (403/500) KOSULSUZ
  // /login'e atilmamali — sunucu oturumu GERCEKTEN kapatmamis olabilir.
  // MUTASYON KANITI: `if (!res.ok) { ...; return; }` satiri silinirse bu test
  // KIRMIZI doner (pushMock cagrilir).
  it("cikis BFF basarisiz donerse /login'e ATILMAZ, hata gosterilir", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 403 }));
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("button", { name: /çıkış/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/tekrar deneyin/i));
    expect(pushMock).not.toHaveBeenCalled();
  });

  // 🔴 KAYIT NO 297 — bekci (b): ag hatasinda (fetch reddi) yakalanmamis bir
  // promise reddi OLMAMALI ve kullaniciya GORUNUR bir hata basilmali.
  // MUTASYON KANITI: `try/catch` kaldirilirsa bu test bir unhandled rejection
  // ile KIRMIZI doner.
  it("cikista ag hatasi olursa yakalanmamis reddi OLMAZ, hata gosterilir", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("button", { name: /çıkış/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/tekrar deneyin/i));
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("Sidebar — SEKME-F1.4a nav düz tık çalışma sekmesi kuralıyla yürür", () => {
  beforeEach(() => {
    sessionMe = { ...BASE_ME, id: "u-1" };
    workspaceTabsStore.detachUser();
    pendingNavigation.reset(null);
    // Panel + Projeler (filtreli, arka planda) + Puantaj (aktif).
    act(() => {
      workspaceTabsStore.dispatch(openTab, { url: "/projeler?durum=aktif", background: true });
      workspaceTabsStore.dispatch(openTab, { url: "/puantaj?hafta=32" });
    });
    currentPath = "/puantaj";
  });

  function activeUrl(): string | undefined {
    const s = workspaceTabsStore.getSnapshot();
    return s.tabs.find((t) => t.id === s.activeId)?.url;
  }

  it("açık modüle tık → o sekme öne gelir ve HATIRLANAN url'sine (query dahil) gidilir", async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /Projeler/ }));
    expect(activeUrl()).toBe("/projeler?durum=aktif");
    expect(workspaceTabsStore.getSnapshot().tabs).toHaveLength(3);
    expect(pushMock).toHaveBeenCalledWith("/projeler?durum=aktif");
  });

  it("aktif modüle tık → aynı sekme modül köküne gider", async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /Puantaj/ }));
    expect(activeUrl()).toBe("/puantaj");
    expect(workspaceTabsStore.getSnapshot().tabs).toHaveLength(3);
    expect(pushMock).toHaveBeenCalledWith("/puantaj");
  });

  it("kapalı modüle tık → yeni ön plan sekmesi + push", async () => {
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /^Hazine$/ }));
    expect(workspaceTabsStore.getSnapshot().tabs.map((t) => t.url)).toEqual([
      "/",
      "/projeler?durum=aktif",
      "/puantaj?hafta=32",
      "/hazine",
    ]);
    expect(activeUrl()).toBe("/hazine");
    expect(pushMock).toHaveBeenCalledWith("/hazine");
  });

  it("dirty varken başka modüle tık → modal; Vazgeç → push YOK", async () => {
    unsavedRegistry.set("sidebar-test", { label: "Puantaj" });
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /^Hazine$/ }));
    expect(screen.getByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
    expect(workspaceTabsStore.getSnapshot().tabs).toHaveLength(3);
  });

  it("dirty varken başka modüle tık → 'Değişiklikleri at ve geç' → push", async () => {
    unsavedRegistry.set("sidebar-test", { label: "Puantaj" });
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /^Hazine$/ }));
    await userEvent.click(screen.getByRole("button", { name: "Değişiklikleri at ve geç" }));
    expect(pushMock).toHaveBeenCalledWith("/hazine");
  });

  // CEO D1 kararı: sidebar kabuktur, "sayfa içi bağlantı" DEĞİLDİR — eski
  // "modal YOK" beklentisi TERSİNE çevrildi.
  it("D1 dirty varken AKTİF modüle tık → onay modalı; Vazgeç → push YOK", async () => {
    unsavedRegistry.set("sidebar-test", { label: "Puantaj" });
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /Puantaj/ }));
    expect(screen.getByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(pushMock).not.toHaveBeenCalled();
    expect(activeUrl()).toBe("/puantaj?hafta=32");
  });

  it("D1 dirty varken AKTİF modüle tık → 'at ve geç' → modül köküne", async () => {
    unsavedRegistry.set("sidebar-test", { label: "Puantaj" });
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /Puantaj/ }));
    await userEvent.click(screen.getByRole("button", { name: "Değişiklikleri at ve geç" }));
    expect(pushMock).toHaveBeenCalledWith("/puantaj");
    expect(activeUrl()).toBe("/puantaj");
  });

  it("N11 oturum id'si YOKKEN (mağaza iliştirilmemiş) düz tık ELLENMEZ: preventDefault yok, mağaza/router dokunulmaz", () => {
    sessionMe = BASE_ME;
    render(<Sidebar />);
    const before = workspaceTabsStore.getSnapshot();
    const link = screen.getByRole("link", { name: /^Hazine$/ });
    const notPrevented = fireEvent.click(link, { button: 0 });
    expect(notPrevented).toBe(true);
    expect(workspaceTabsStore.getSnapshot()).toBe(before);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it.each([
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
  ])("N12 %s+tık ELLENMEZ (tarayıcının yeni pencere/indirme davranışı gasp edilmez)", (_name, init) => {
    render(<Sidebar />);
    const before = workspaceTabsStore.getSnapshot();
    const notPrevented = fireEvent.click(screen.getByRole("link", { name: /^Hazine$/ }), { button: 0, ...init });
    expect(notPrevented).toBe(true);
    expect(workspaceTabsStore.getSnapshot()).toBe(before);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("POZİTİF KONTROL (N11/N12): düz sol tık ELLENİR — preventDefault çağrılır", () => {
    render(<Sidebar />);
    const notPrevented = fireEvent.click(screen.getByRole("link", { name: /^Hazine$/ }), { button: 0 });
    expect(notPrevented).toBe(false);
    expect(pushMock).toHaveBeenCalledWith("/hazine");
  });

  it("Ctrl+tık sidebar'da ELLENMEZ (belge yakalayıcısına kalır): mağaza ve router dokunulmaz", () => {
    render(<Sidebar />);
    const before = workspaceTabsStore.getSnapshot();
    fireEvent.click(screen.getByRole("link", { name: /^Hazine$/ }), { ctrlKey: true });
    expect(workspaceTabsStore.getSnapshot()).toBe(before);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("panel aktifken panele tık → push YOK", async () => {
    act(() => workspaceTabsStore.dispatch(navigateActive, { url: "/" }));
    render(<Sidebar />);
    await userEvent.click(screen.getByRole("link", { name: /Gösterge Paneli/ }));
    expect(pushMock).not.toHaveBeenCalled();
  });
});

// NAV-F1 (kullanıcı onaylı) — aktif öğe nav'ın görünür alanında değilse YALNIZ nav'ın scrollTop'u ayarlanır.
describe("Sidebar · aktif öğe görünür alana alınır", () => {
  function fakeBoxes(itemTop: number) {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("sidebar-nav")) return { top: 0, bottom: 500 } as DOMRect;
      if (this.getAttribute("aria-current") === "page") return { top: itemTop, bottom: itemTop + 36 } as DOMRect;
      return { top: 0, bottom: 0 } as DOMRect;
    });
  }

  it("aşağıda kalan aktif öğe için nav scrollTop'u en az kaydırmayla ayarlanır, scrollIntoView çağrılmaz", () => {
    currentPath = "/muhasebe";
    fakeBoxes(800);
    const intoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = intoView;
    const { container } = render(<Sidebar />);
    const nav = container.querySelector<HTMLElement>(".sidebar-nav")!;
    expect(nav.scrollTop).toBe(800 + 36 - 500 + 8);
    expect(intoView).not.toHaveBeenCalled();
  });

  it("aktif öğe zaten görünüyorsa nav kaydırılmaz", () => {
    currentPath = "/muhasebe";
    fakeBoxes(100);
    const { container } = render(<Sidebar />);
    expect(container.querySelector<HTMLElement>(".sidebar-nav")!.scrollTop).toBe(0);
  });
});
