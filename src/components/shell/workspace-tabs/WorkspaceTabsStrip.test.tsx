import { act, useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkspaceTabsStrip, type WorkspaceTabsStripTab } from "./WorkspaceTabsStrip";
import { reorderTab } from "@/lib/workspace-tabs/tabs-reducer";
import type { WorkspaceTab, WorkspaceTabsState } from "@/lib/workspace-tabs/types";

// jsdom `scrollIntoView`ı hiç tanımlamaz — bileşen `?.()` ile korumalı çağırır,
// burada global mock ekleyip ÇAĞRILDIĞINI doğruluyoruz (emir T: "jsdom'da mock").
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const TABS: WorkspaceTabsStripTab[] = [
  { id: "dashboard", title: "Gösterge Paneli", url: "/", pinned: true },
  { id: "a", title: "Proje A", url: "/proje/a", pinned: false },
  { id: "b", title: "Proje B", url: "/proje/b", pinned: false },
];

function renderStrip(overrides: Partial<React.ComponentProps<typeof WorkspaceTabsStrip>> = {}) {
  const props = {
    tabs: TABS,
    activeId: "a",
    onSelect: vi.fn(),
    onClose: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseRight: vi.fn(),
    onCloseAll: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
  const view = render(<WorkspaceTabsStrip {...props} />);
  return { ...view, props };
}

function dispatchDrag(
  element: Element,
  type: "dragstart" | "dragover" | "drop" | "dragend",
  init: Partial<MouseEventInit> = {},
) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      data: {} as Record<string, string>,
      setData(format: string, value: string) {
        this.data[format] = value;
      },
      getData(format: string) {
        return this.data[format] ?? "";
      },
      effectAllowed: "",
    },
    writable: true,
  });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

describe("WorkspaceTabsStrip", () => {
  it("role=tablist + her sekme role=tab + aria-selected doğru sekmede true", () => {
    renderStrip({ activeId: "a" });
    const tablist = screen.getByRole("tablist", { name: "Çalışma sekmeleri" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Proje A/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Proje B/ })).toHaveAttribute("aria-selected", "false");
  });

  it("sekmeye tık → onSelect(id)", async () => {
    const user = userEvent.setup();
    const { props } = renderStrip();
    await user.click(screen.getByRole("tab", { name: /Proje B/ }));
    expect(props.onSelect).toHaveBeenCalledWith("b");
  });

  it("Enter → onSelect(id)", async () => {
    const user = userEvent.setup();
    const { props } = renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    tab.focus();
    await user.keyboard("{Enter}");
    expect(props.onSelect).toHaveBeenCalledWith("b");
  });

  it("Space → onSelect(id)", async () => {
    const user = userEvent.setup();
    const { props } = renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    tab.focus();
    await user.keyboard(" ");
    expect(props.onSelect).toHaveBeenCalledWith("b");
  });

  it("ok tuşları hiçbir şey yapmaz (kısayol sayılır, EKLENMEDİ)", async () => {
    const user = userEvent.setup();
    const { props } = renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje A/ });
    tab.focus();
    await user.keyboard("{ArrowRight}{ArrowLeft}{ArrowUp}{ArrowDown}");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("× düğmesi → onClose(id), pinned sekmede × YOK", async () => {
    const user = userEvent.setup();
    const { props } = renderStrip();
    expect(
      within(screen.getByRole("tab", { name: "Gösterge Paneli" })).queryByRole("button"),
    ).toBeNull();
    const closeBtn = screen.getByRole("button", { name: "Proje B sekmesini kapat" });
    await user.click(closeBtn);
    expect(props.onClose).toHaveBeenCalledWith("b");
    // × tıklaması aynı zamanda onSelect'i TETİKLEMEMELİ (stopPropagation).
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("orta tık (auxclick button 1) → onClose(id)", () => {
    const { props } = renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    act(() => {
      tab.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    });
    expect(props.onClose).toHaveBeenCalledWith("b");
  });

  it("orta tık pinned sekmede onClose ÇAĞIRMAZ", () => {
    const { props } = renderStrip();
    const tab = screen.getByRole("tab", { name: "Gösterge Paneli" });
    act(() => {
      tab.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    });
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("sağ tık → menü açılır; üç öğe doğru geri çağrıyı hedef id ile çağırır", async () => {
    const user = userEvent.setup();
    const { props } = renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    act(() => {
      tab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 60 }));
    });

    const menu = await screen.findByRole("menu", { name: "Sekme seçenekleri" });
    await user.click(within(menu).getByRole("menuitem", { name: "Diğerlerini kapat" }));
    expect(props.onCloseOthers).toHaveBeenCalledWith("b");

    act(() => {
      tab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    const menu2 = await screen.findByRole("menu");
    await user.click(within(menu2).getByRole("menuitem", { name: "Sağdakileri kapat" }));
    expect(props.onCloseRight).toHaveBeenCalledWith("b");

    act(() => {
      tab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    const menu3 = await screen.findByRole("menu");
    await user.click(within(menu3).getByRole("menuitem", { name: "Tümünü kapat" }));
    expect(props.onCloseAll).toHaveBeenCalled();
  });

  it("Esc menüyü kapatır", async () => {
    const user = userEvent.setup();
    renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    act(() => {
      tab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("DnD: dragstart/dragover/drop → onReorder(id, doğru index — reducer sözleşmesine göre)", () => {
    // rv3 YÜKSEK bulgusu: `tabs-reducer.ts`teki `reorderTab` sürükleneni
    // ÖNCE dizi dışına alıp SONRA `toIndex`e ekler — yani `toIndex`
    // sürüklenen ÇIKARILMIŞ dizideki hedef konumdur. `a` (index 1) sağa,
    // `b`nin (index 2) SAĞ yarısına (`after`) bırakılıyor: sürüklenmeden
    // ÖNCEki ham hedef 2+1=3 olurdu, ama `a` çıkarılınca `b` bir index SOLA
    // kayar (index 1) — doğru `toIndex` 3 DEĞİL 2'dir (eskiden 3 sekmeyle
    // kırpılıp TESADÜFEN doğru çıkıyordu, ≥5 sekmeli entegrasyon testleri
    // aşağıda bunu ayırt eder).
    const { props } = renderStrip();
    const dragged = screen.getByRole("tab", { name: /Proje A/ }); // index 1
    const target = screen.getByRole("tab", { name: /Proje B/ }); // index 2

    dispatchDrag(dragged, "dragstart");
    // rv3 sonda düzeltilen ikinci bir tuzak: `onDragOver`/`onDrop` artık DIŞ
    // sarmalayıcıda (`.workspace-tab`) — `event.currentTarget.getBoundingClientRect()`
    // BUNU okur, `role="tab"` (iç `.workspace-tab__hit`) DEĞİL. Mock dış
    // sarmalayıcıya konur, aksi hâlde gerçek (sıfır) jsdom rect'i "sol yarı"yı
    // asla üretemez — tüm clientX değerleri "after"a düşer (kör bekçi).
    vi.spyOn(target.closest(".workspace-tab") as Element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 30,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    dispatchDrag(target, "dragover", { clientX: 190 });
    dispatchDrag(target, "drop", { clientX: 190 });

    expect(props.onReorder).toHaveBeenCalledWith("a", 2);
  });

  it("DnD: kendi üstüne bırakma no-op — onReorder ÇAĞRILMAZ", () => {
    const { props } = renderStrip();
    const dragged = screen.getByRole("tab", { name: /Proje A/ });

    dispatchDrag(dragged, "dragstart");
    vi.spyOn(dragged.closest(".workspace-tab") as Element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 30,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    dispatchDrag(dragged, "dragover", { clientX: 190 });
    dispatchDrag(dragged, "drop", { clientX: 190 });

    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("pinned sekme SÜRÜKLENEMEZ (draggable=false)", () => {
    renderStrip();
    const pinned = screen.getByRole("tab", { name: "Gösterge Paneli" });
    expect(pinned).toHaveAttribute("draggable", "false");
  });

  it("0. indekse bırakma 1'e KIRPILIR (pinned sekmenin önüne geçemez)", () => {
    // Gerekçe: dizinin 0. konumu her zaman pinned Gösterge Paneli'ne ayrılmış
    // (KARARLAR §1.10 "hiçbir sekme onun önüne bırakılamaz"). Kullanıcı en
    // sola bırakmayı DENEDİĞİNDE sessizce yok saymak yerine, niyeti pinned
    // sekmenin hemen ardındaki (1.) konuma çeviriyoruz.
    const { props } = renderStrip();
    const dragged = screen.getByRole("tab", { name: /Proje B/ }); // index 2
    const target = screen.getByRole("tab", { name: "Gösterge Paneli" }); // index 0

    dispatchDrag(dragged, "dragstart");
    // Mock DIŞ sarmalayıcıda (`event.currentTarget` — bkz. yukarıdaki not).
    vi.spyOn(target.closest(".workspace-tab") as Element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 30,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    // clientX 10 → sol yarı → "before" → rawIndex = 0 → minIndex(1)'e kırpılır
    dispatchDrag(target, "dragover", { clientX: 10 });
    dispatchDrag(target, "drop", { clientX: 10 });

    expect(props.onReorder).toHaveBeenCalledWith("b", 1);
  });

  it("aktif sekme scrollIntoView çağrılır — nearest/nearest, auto", () => {
    renderStrip({ activeId: "b" });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "auto",
    });
  });

  it("🔴 BEKÇİ (SEKME-F1.4c): sekme adı kısaltılmaz — max-width'i aşmayan bir başlık DOM'da tam metniyle basılır", () => {
    renderStrip({
      tabs: [
        TABS[0],
        { id: "a", title: "Çok Uzun Bir Şantiye Adı Örneği İçin Test", url: "/proje/a", pinned: false },
      ],
      activeId: "a",
    });
    // İçerik kısaltılmaz: `title` niteliği VE görünür metin aynı tam adı taşır
    // (kısaltma yalnız CSS `text-overflow: ellipsis` ile, DOM metni bozulmaz).
    expect(screen.getByText("Çok Uzun Bir Şantiye Adı Örneği İçin Test")).toBeInTheDocument();
  });

  it("kayma varken kenar ipucu sınıfı takılır, kayma bittiğinde söker", () => {
    const { container } = renderStrip();
    const list = container.querySelector(".workspace-tabs__list") as HTMLDivElement;
    const wrapper = container.querySelector(".workspace-tabs") as HTMLDivElement;

    Object.defineProperty(list, "scrollWidth", { value: 600, configurable: true });
    Object.defineProperty(list, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(list, "scrollLeft", { value: 0, configurable: true, writable: true });

    act(() => {
      list.dispatchEvent(new Event("scroll"));
    });
    expect(wrapper).not.toHaveClass("workspace-tabs--fade-left");
    expect(wrapper).toHaveClass("workspace-tabs--fade-right");

    Object.defineProperty(list, "scrollLeft", { value: 300, configurable: true, writable: true });
    act(() => {
      list.dispatchEvent(new Event("scroll"));
    });
    expect(wrapper).toHaveClass("workspace-tabs--fade-left");
    expect(wrapper).not.toHaveClass("workspace-tabs--fade-right");
  });

  it("🔴 DOM YAPISAL BEKÇİ: button içinde button YOK", () => {
    const { container } = renderStrip();
    expect(container.querySelectorAll("button button")).toHaveLength(0);
  });

  it("title niteliği tam başlığı taşır", () => {
    renderStrip();
    expect(screen.getByRole("tab", { name: /Proje A/ })).toHaveAttribute("title", "Proje A");
  });

  it("🔴 DOM BEKÇİ: role=tab içinde etkileşimli öğe YOK, erişilebilir ad yalnız başlık", () => {
    // rv3 ORTA bulgusu: × düğmesi eskiden role=tab'in İÇİNDEYDİ — axe
    // "nested-interactive" ihlali VE sekmenin erişilebilir adı × düğmesinin
    // kendi aria-label'ını da yutup "Proje B Proje B sekmesini kapat" gibi
    // kirleniyordu. `name` TAM (regex değil, düz metin) eşleşme — kirli ad
    // bu sorguyu YAKALAMAZDI.
    renderStrip();
    const tab = screen.getByRole("tab", { name: "Proje B" });
    expect(tab.querySelector("button, a, input, select, textarea")).toBeNull();
  });

  it("🔴 BEKÇİ: yalnız sekmenin KENDİSİNDEN gelen Enter/Space seçer — iç düğümden kabaran keydown YOK SAYILIR", () => {
    // Savunma amaçlı guard (`handleKeyDown`teki `event.target !== event.currentTarget`)
    // — normal kullanıcı etkileşiminde artık tetiklenmiyor (× kardeş oldu),
    // ama role=tab'in İÇİNDEKİ herhangi bir düğümden (ör. başlık span'i)
    // kabaran sentetik bir keydown'ın YANLIŞLIKLA seçim tetiklemediğini kanıtlar.
    const { props } = renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    const titleSpan = tab.querySelector(".workspace-tab__title") as HTMLElement;
    fireEvent.keyDown(titleSpan, { key: "Enter" });
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("× düğmesine odaklanıp Enter → onClose(id) çağrılır, onSelect ÇAĞRILMAZ", async () => {
    // rv3 ORTA bulgusu: eskiden × role=tab'in içindeydi, Enter/Space bu
    // div'in `onKeyDown`una kabarıp `onSelect`i tetikliyor, `preventDefault`
    // düğmenin kendi tıklama üretimini engelleyip `onClose`u hiç çağırmıyordu.
    const user = userEvent.setup();
    const { props } = renderStrip();
    const closeBtn = screen.getByRole("button", { name: "Proje B sekmesini kapat" });
    closeBtn.focus();
    await user.keyboard("{Enter}");
    expect(props.onClose).toHaveBeenCalledWith("b");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("× düğmesine Space → onClose(id) çağrılır, onSelect ÇAĞRILMAZ", async () => {
    const user = userEvent.setup();
    const { props } = renderStrip();
    const closeBtn = screen.getByRole("button", { name: "Proje B sekmesini kapat" });
    closeBtn.focus();
    await user.keyboard(" ");
    expect(props.onClose).toHaveBeenCalledWith("b");
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("N14 bekçisi: --pinned-tab-width, document.fonts.ready SONRASI yeniden ölçülür", async () => {
    // rv3 N14 bulgusu (DÜŞÜK, testsiz kör bekçi): font yüklenmeden ÖNCE
    // ölçülen genişlik (fallback font) donup kalıyordu — `document.fonts.ready`
    // çözüldükten SONRA yeniden ölçülmesi gerekir.
    let resolveReady: () => void = () => {};
    const ready = new Promise<FontFaceSet>((resolve) => {
      resolveReady = () => resolve({} as FontFaceSet);
    });
    const originalFonts = document.fonts;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready },
    });

    let call = 0;
    const widths = [100, 124.16]; // font yüklenmeden önce vs sonra (rv3 ölçümü)
    // Element MOUNT'tan ÖNCE prototip üzerinden mock'lanır — ilk (senkron,
    // mount içi) ölçüm de bu mock'u kullansın diye (spy'ı render'dan SONRA
    // spesifik elemana koymak ilk çağrıyı KAÇIRIRDI).
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ width: widths[Math.min(call++, widths.length - 1)] }) as DOMRect);
    const { container } = renderStrip();

    const list = container.querySelector(".workspace-tabs__list") as HTMLDivElement;
    // İlk ölçüm (mount) fallback genişliği yazdı.
    expect(list.style.getPropertyValue("--pinned-tab-width")).toBe("100px");

    await act(async () => {
      resolveReady();
      await ready;
    });

    expect(list.style.getPropertyValue("--pinned-tab-width")).toBe("124.16px");

    Object.defineProperty(document, "fonts", { configurable: true, value: originalFonts });
    rectSpy.mockRestore();
  });

  it("N14 bekçisi: panel ResizeObserver ile izlenir, boyut değişince yeniden ölçülür (jsdom'da yoksa güvenli düşüş)", () => {
    const observed: Element[] = [];
    const callbacks: ResizeObserverCallback[] = [];
    class FakeResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {}
    }
    const originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;

    let call = 0;
    const widths = [100, 150];
    const rectSpy = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({ width: widths[Math.min(call++, widths.length - 1)] }) as DOMRect);
    const { container } = renderStrip();
    const pinnedTab = container.querySelector(".workspace-tab--pinned") as HTMLDivElement;
    const list = container.querySelector(".workspace-tabs__list") as HTMLDivElement;

    expect(observed).toContain(pinnedTab);
    expect(list.style.getPropertyValue("--pinned-tab-width")).toBe("100px");
    act(() => {
      callbacks.forEach((cb) => cb([], {} as ResizeObserver));
    });
    expect(list.style.getPropertyValue("--pinned-tab-width")).toBe("150px");
    rectSpy.mockRestore();

    globalThis.ResizeObserver = originalRO;
  });

  it("kenar solması: sekme SAYISI aynı kalıp yalnız BAŞLIK değişince de yeniden ölçülür", () => {
    // rv3 DÜŞÜK bulgusu: eski bağımlılık yalnız `tabs.length`ti — sekme
    // sayısı sabitken bir başlık uzayıp genişlik (dolayısıyla scrollWidth)
    // değişse ölçüm YENİLENMİYORDU.
    const { container, rerender } = renderStrip();
    const list = container.querySelector(".workspace-tabs__list") as HTMLDivElement;
    const wrapper = container.querySelector(".workspace-tabs") as HTMLDivElement;

    Object.defineProperty(list, "scrollWidth", { value: 300, configurable: true });
    Object.defineProperty(list, "clientWidth", { value: 300, configurable: true });
    Object.defineProperty(list, "scrollLeft", { value: 0, configurable: true, writable: true });
    act(() => {
      list.dispatchEvent(new Event("scroll"));
    });
    expect(wrapper).not.toHaveClass("workspace-tabs--fade-right");

    // Sekme SAYISI aynı (3), yalnız "Proje B" başlığı çok uzadı — bu genişliği
    // artırıp scrollWidth'i clientWidth'in ÜZERİNE çıkarmış olsun. Yeni
    // genişlik, `titleSignature` bağımlılığı sayesinde YENİDEN çalışacak olan
    // efektin `updateEdgeFade()`ı OKUYACAĞI andan ÖNCE set edilir — rerender
    // İÇİNDE (senkron commit) efekt çalışır, sonradan set etmek GEÇ kalırdı.
    Object.defineProperty(list, "scrollWidth", { value: 600, configurable: true });
    rerender(
      <WorkspaceTabsStrip
        tabs={[
          TABS[0],
          TABS[1],
          { id: "b", title: "Çok Uzun Bir Proje B Başlığı — Kayma Üretir", url: "/proje/b", pinned: false },
        ]}
        activeId="a"
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseRight={vi.fn()}
        onCloseAll={vi.fn()}
        onReorder={vi.fn()}
      />,
    );
    expect(wrapper).toHaveClass("workspace-tabs--fade-right");
  });
});

describe("WorkspaceTabsStrip + GERÇEK reorderTab (CEO şartı: ≥5 sekme, her yön/uç/yarı)", () => {
  function makeFullTabs(): WorkspaceTab[] {
    const now = 1_000;
    const mk = (id: string, title: string, pinned = false): WorkspaceTab => ({
      id,
      title,
      url: `/proje/${id}`,
      moduleKey: "/proje",
      lastViewedAt: now,
      pinned,
    });
    return [
      { ...mk("dashboard", "Gösterge Paneli", true), url: "/", moduleKey: "/" },
      mk("t0", "Proje 0"),
      mk("t1", "Proje 1"),
      mk("t2", "Proje 2"),
      mk("t3", "Proje 3"),
      mk("t4", "Proje 4"),
    ];
  }

  function ReducerDndHarness() {
    const [state, setState] = useState<WorkspaceTabsState>({
      tabs: makeFullTabs(),
      activeId: "t0",
    });
    return (
      <WorkspaceTabsStrip
        tabs={state.tabs}
        activeId={state.activeId}
        onSelect={(id) => setState((s) => ({ ...s, activeId: id }))}
        onClose={() => {}}
        onCloseOthers={() => {}}
        onCloseRight={() => {}}
        onCloseAll={() => {}}
        onReorder={(id, toIndex) => setState((s) => reorderTab(s, { id, toIndex }))}
      />
    );
  }

  function dragTo(draggedName: string, targetName: string, side: "before" | "after") {
    const dragged = screen.getByRole("tab", { name: draggedName });
    const target = screen.getByRole("tab", { name: targetName });
    dispatchDrag(dragged, "dragstart");
    // `onDragOver` DIŞ sarmalayıcıda (`.workspace-tab`) — `event.currentTarget`
    // odur, `role="tab"` (iç `.workspace-tab__hit`) DEĞİL.
    vi.spyOn(target.closest(".workspace-tab") as Element, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 200,
      width: 200,
      top: 0,
      bottom: 30,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    const clientX = side === "before" ? 10 : 190;
    dispatchDrag(target, "dragover", { clientX });
    dispatchDrag(target, "drop", { clientX });
  }

  function visibleTitles(): (string | null)[] {
    return within(screen.getByRole("tablist"))
      .getAllByRole("tab")
      .map((el) => el.textContent);
  }

  it("sağa, SAĞ yarı → sona (son sekmenin arkasına)", () => {
    render(<ReducerDndHarness />);
    dragTo("Proje 0", "Proje 4", "after");
    expect(visibleTitles()).toEqual([
      "Gösterge Paneli",
      "Proje 1",
      "Proje 2",
      "Proje 3",
      "Proje 4",
      "Proje 0",
    ]);
  });

  it("sağa, SAĞ yarı → bir sağdaki komşuya (bitişik takas)", () => {
    render(<ReducerDndHarness />);
    dragTo("Proje 0", "Proje 1", "after");
    expect(visibleTitles()).toEqual([
      "Gösterge Paneli",
      "Proje 1",
      "Proje 0",
      "Proje 2",
      "Proje 3",
      "Proje 4",
    ]);
  });

  it("sağa, SOL yarı → ortaya (hedefin hemen önüne)", () => {
    render(<ReducerDndHarness />);
    dragTo("Proje 0", "Proje 3", "before");
    expect(visibleTitles()).toEqual([
      "Gösterge Paneli",
      "Proje 1",
      "Proje 2",
      "Proje 0",
      "Proje 3",
      "Proje 4",
    ]);
  });

  it("sola, SAĞ yarı → ortaya (hedefin hemen ardına)", () => {
    render(<ReducerDndHarness />);
    dragTo("Proje 4", "Proje 1", "after");
    expect(visibleTitles()).toEqual([
      "Gösterge Paneli",
      "Proje 0",
      "Proje 1",
      "Proje 4",
      "Proje 2",
      "Proje 3",
    ]);
  });

  it("sola, SOL yarı → başa (panelin hemen sağına; panelin ÖNÜNE geçemez)", () => {
    render(<ReducerDndHarness />);
    dragTo("Proje 4", "Gösterge Paneli", "before");
    expect(visibleTitles()).toEqual([
      "Gösterge Paneli",
      "Proje 4",
      "Proje 0",
      "Proje 1",
      "Proje 2",
      "Proje 3",
    ]);
  });

  it("sola, SOL yarı → bir soldaki komşuya (bitişik takas)", () => {
    render(<ReducerDndHarness />);
    dragTo("Proje 2", "Proje 1", "before");
    expect(visibleTitles()).toEqual([
      "Gösterge Paneli",
      "Proje 0",
      "Proje 2",
      "Proje 1",
      "Proje 3",
      "Proje 4",
    ]);
  });

  it("kendi üstüne bırakma → no-op, sıra DEĞİŞMEZ", () => {
    render(<ReducerDndHarness />);
    dragTo("Proje 2", "Proje 2", "after");
    expect(visibleTitles()).toEqual([
      "Gösterge Paneli",
      "Proje 0",
      "Proje 1",
      "Proje 2",
      "Proje 3",
      "Proje 4",
    ]);
  });
});

describe("Sağ tık menüsü klavye/odak/viewport davranışı", () => {
  function openMenu(tabName: string | RegExp) {
    const tab = screen.getByRole("tab", { name: tabName });
    act(() => {
      tab.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 60 }));
    });
  }

  it("açılınca İLK ÖĞEYE odaklanır", async () => {
    renderStrip();
    openMenu(/Proje B/);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
  });

  it("ArrowDown/ArrowUp menü İÇİNDE gezinir (uygulama kısayolu DEĞİL, yalnız menü açıkken)", async () => {
    const user = userEvent.setup();
    renderStrip();
    openMenu(/Proje B/);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus(); // sondan başa döner
    await user.keyboard("{ArrowUp}");
    expect(items[2]).toHaveFocus(); // baştan sona döner
  });

  it("Escape → menü kapanır VE odak sağ tıklanan sekmeye iade edilir", async () => {
    const user = userEvent.setup();
    renderStrip();
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    openMenu(/Proje B/);
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(tab).toHaveFocus();
  });

  it("menü viewport'a KIRPILIR — sağ/alt kenara taşmaz", async () => {
    // Konumlama efekti mount'ta (senkron) menünün `getBoundingClientRect`ini
    // okur — mock'un İLK ölçümden İTİBAREN aktif olması için prototip
    // üzerinden, menü açılmadan ÖNCE kuruluyor (aksi hâlde ilk — ve tek —
    // efekt çalışması gerçek/sıfır boyutla olurdu).
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
      width: 176,
      height: 120,
      left: 0,
      top: 0,
      right: 176,
      bottom: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    renderStrip();
    // jsdom varsayılan innerWidth/innerHeight: 1024x768 — sağ-alt köşeye YAKIN
    // bir noktaya sağ tıklanıyor.
    const tab = screen.getByRole("tab", { name: /Proje B/ });
    act(() => {
      tab.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, clientX: 1020, clientY: 760 }),
      );
    });
    const menu = await screen.findByRole("menu");
    const left = Number.parseFloat(menu.style.left);
    const top = Number.parseFloat(menu.style.top);
    expect(left).toBeLessThanOrEqual(1024 - 176);
    expect(top).toBeLessThanOrEqual(768 - 120);
    rectSpy.mockRestore();
  });
});
