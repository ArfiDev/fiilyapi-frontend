import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import Link from "next/link";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import type { ReactNode } from "react";

import { useTabLinkCapture, WORKSPACE_TABS_IGNORE_ATTR } from "./useTabLinkCapture";

/**
 * SEKME-F1.4a · belge düzeyi Ctrl/Cmd+tık ve orta tık yakalayıcısı.
 *
 * Olaylar `dispatchEvent` ile GERÇEK DOM'a atılır (capture fazı jsdom'da da
 * çalışır). Her olayın `defaultPrevented` değeri, tarayıcının kendi "yeni
 * tarayıcı sekmesinde aç" davranışının bastırılıp bastırılmadığının tek ölçüsüdür.
 */

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function mount(onOpen: (url: string) => void, enabled = true) {
  return renderHook(() => useTabLinkCapture({ enabled, onOpenInBackground: onOpen }));
}

function anchor(href: string, attrs: Record<string, string> = {}): HTMLAnchorElement {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
  const inner = document.createElement("span");
  inner.textContent = "bağlantı";
  a.appendChild(inner);
  document.body.appendChild(a);
  return a;
}

function fire(target: Element, type: string, init: MouseEventInit): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe("useTabLinkCapture — yakalanan hareketler", () => {
  it("Ctrl+tık iç bağlantıda arka plan sekmesi açar ve preventDefault çağırır", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const a = anchor("/projeler?durum=aktif");
    const event = fire(a.firstElementChild!, "click", { button: 0, ctrlKey: true });
    expect(onOpen).toHaveBeenCalledWith("/projeler?durum=aktif");
    expect(event.defaultPrevented).toBe(true);
  });

  it("Cmd(meta)+tık iç bağlantıda arka plan sekmesi açar", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const event = fire(anchor("/puantaj"), "click", { button: 0, metaKey: true });
    expect(onOpen).toHaveBeenCalledWith("/puantaj");
    expect(event.defaultPrevented).toBe(true);
  });

  it("orta tık (auxclick button 1) iç bağlantıda arka plan sekmesi açar", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const event = fire(anchor("/hazine"), "auxclick", { button: 1 });
    expect(onOpen).toHaveBeenCalledWith("/hazine");
    expect(event.defaultPrevented).toBe(true);
  });

  it("orta tık mousedown'ı otomatik kaydırma için bastırılır ama sekme AÇMAZ (tek açılış auxclick'te)", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const event = fire(anchor("/hazine"), "mousedown", { button: 1 });
    expect(event.defaultPrevented).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("Türkçe karakterli href KODLANMIŞ url olarak iletilir (isSafeInternalUrl ham ASCII-dışını reddeder)", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    fire(anchor("/projeler/köprü"), "click", { button: 0, ctrlKey: true });
    expect(onOpen).toHaveBeenCalledWith("/projeler/k%C3%B6pr%C3%BC");
  });

  it("çapa (#) sekme url'sine girmez", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    fire(anchor("/projeler?a=1#bolum"), "click", { button: 0, ctrlKey: true });
    expect(onOpen).toHaveBeenCalledWith("/projeler?a=1");
  });
});

describe("useTabLinkCapture — dokunulmayanlar", () => {
  const cases: Array<[string, () => HTMLAnchorElement]> = [
    ["farklı köken", () => anchor("https://ornek.com/projeler")],
    ["target=_blank", () => anchor("/projeler", { target: "_blank" })],
    ["download", () => anchor("/projeler", { download: "" })],
    ["/api/ yolu", () => anchor("/api/backend/export.xlsx")],
    ["güvensiz url (/API büyük harf)", () => anchor("/API/x")],
    ["data-workspace-tabs-ignore bölgesi", () => {
      const zone = document.createElement("div");
      zone.setAttribute(WORKSPACE_TABS_IGNORE_ATTR, "");
      document.body.appendChild(zone);
      const a = anchor("/projeler");
      zone.appendChild(a);
      return a;
    }],
  ];

  it.each(cases)("%s → Ctrl+tık yakalanmaz, preventDefault YOK", (_name, make) => {
    const onOpen = vi.fn();
    mount(onOpen);
    const event = fire(make(), "click", { button: 0, ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(cases)("%s → orta tık yakalanmaz, preventDefault YOK", (_name, make) => {
    const onOpen = vi.fn();
    mount(onOpen);
    const event = fire(make(), "auxclick", { button: 1 });
    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("N10 olay DAHA ÖNCE başka bir dinleyicice engellenmişse (defaultPrevented) yakalanmaz", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    // Belgeden ÖNCE koşan pencere-capture dinleyicisi olayı sahiplenir.
    const claim = (e: Event) => e.preventDefault();
    window.addEventListener("click", claim, true);
    window.addEventListener("auxclick", claim, true);
    try {
      fire(anchor("/projeler"), "click", { button: 0, ctrlKey: true });
      fire(anchor("/hazine"), "auxclick", { button: 1 });
    } finally {
      window.removeEventListener("click", claim, true);
      window.removeEventListener("auxclick", claim, true);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("target=_self yakalanır (varsayılan hedefle aynıdır)", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    fire(anchor("/projeler", { target: "_self" }), "click", { button: 0, ctrlKey: true });
    expect(onOpen).toHaveBeenCalledWith("/projeler");
  });

  it("düz tık yakalanmaz", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const event = fire(anchor("/projeler"), "click", { button: 0 });
    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("sağ tık (auxclick button 2) yakalanmaz — tarayıcı menüsü ELLENMEZ", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const event = fire(anchor("/projeler"), "auxclick", { button: 2 });
    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("bağlantı dışı öğe yakalanmaz", () => {
    const onOpen = vi.fn();
    mount(onOpen);
    const button = document.createElement("button");
    document.body.appendChild(button);
    const event = fire(button, "click", { button: 0, ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("enabled=false iken (oturum yok) hiçbir şey yakalanmaz", () => {
    const onOpen = vi.fn();
    mount(onOpen, false);
    const event = fire(anchor("/projeler"), "click", { button: 0, ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("unmount sonrası dinleyiciler kalkar", () => {
    const onOpen = vi.fn();
    const { unmount } = mount(onOpen);
    unmount();
    fire(anchor("/projeler"), "auxclick", { button: 1 });
    expect(onOpen).not.toHaveBeenCalled();
  });
});

/**
 * next/link ile ÇAKIŞMA YOK — ölçüldü (next 15.5.20). Üretimde App Router
 * `next/link`i `dist/client/app-dir/link.js`e çözer: `onClick` önce
 * `e.defaultPrevented`e bakar (satır 310), `linkClicked` `isModifiedEvent`
 * (meta/ctrl/orta) varsa gezinmez (satır 47-58). Vitest aynı modülü takma adsız
 * `dist/client/link.js`e çözer; orada da AYNI iki koruma var (satır 363-365 ve
 * 70-81) — bu yüzden sahte router `RouterContext`ten verilir. `onNavigate`
 * yalnız Link GERÇEKTEN gezinecekse çağrılır — gezinmenin tek tanığı odur.
 */
describe("useTabLinkCapture — next/link ile çakışma yok", () => {
  const fakeRouter = {
    push: vi.fn(async () => true),
    replace: vi.fn(async () => true),
    prefetch: vi.fn(async () => undefined),
    beforePopState: vi.fn(),
  } as unknown as NextRouter;
  function Harness({ children, onOpen }: { children: ReactNode; onOpen: (url: string) => void }) {
    useTabLinkCapture({ enabled: true, onOpenInBackground: onOpen });
    return <RouterContext.Provider value={fakeRouter}>{children}</RouterContext.Provider>;
  }

  it("POZİTİF KONTROL: düz tıkta Link gezinir (onNavigate çağrılır), yakalayıcı dokunmaz", () => {
    const onOpen = vi.fn();
    const onNavigate = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <Harness onOpen={onOpen}>
        <Link href="/projeler" prefetch={false} onNavigate={onNavigate}>
          Projeler
        </Link>
      </Harness>,
    );
    fire(screen.getByText("Projeler"), "click", { button: 0 });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("Ctrl+tıkta Link GEZİNMEZ, yalnız arka plan sekmesi açılır", () => {
    const onOpen = vi.fn();
    const onNavigate = vi.fn();
    render(
      <Harness onOpen={onOpen}>
        <Link href="/projeler" prefetch={false} onNavigate={onNavigate}>
          Projeler
        </Link>
      </Harness>,
    );
    const event = fire(screen.getByText("Projeler"), "click", { button: 0, ctrlKey: true });
    expect(onOpen).toHaveBeenCalledWith("/projeler");
    expect(onNavigate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
});
