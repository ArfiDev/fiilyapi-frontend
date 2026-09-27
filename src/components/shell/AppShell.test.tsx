import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AppShell from "./AppShell";

/**
 * SEKME-F1.7a — `AppShell` yalnız KABUK MONTAJINI doğrular: kırıntı üst
 * çubuğa taşındığı için (`Topbar.tsx` → `TopbarBreadcrumb`) burada TEK soru
 * `<main class="app-content">`in kırıntı BASMADIĞI ve DOM sırasının
 * (StaleBuildBanner → children) doğru olduğu. Alt bileşenler test kimlikli
 * sahte'lerle DEĞİŞTİRİLİR — gerçek `Topbar`/`SessionProvider` ağı (fetch,
 * router) burada GEREKSİZ gürültüdür.
 */
vi.mock("./Topbar", () => ({
  default: () => <div data-testid="fake-topbar" />,
}));
vi.mock("./Sidebar", () => ({
  default: () => <div data-testid="fake-sidebar" />,
}));
vi.mock("./SessionProvider", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/query/QueryProvider", () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("./StaleBuildBanner", () => ({
  StaleBuildBanner: () => <div data-testid="fake-stale-banner" />,
}));
// SEKME-F1.4a — senkron bileşeni `useSearchParams` kullanır; `suspendSync`
// açıkken ASKIYA ALINIR (hiç çözülmeyen söz fırlatır). Kabuğun geri kalanı
// yine basılıyorsa Suspense sınırı DOĞRU yerdedir.
let suspendSync = false;
const NEVER = new Promise<never>(() => {});
vi.mock("./workspace-tabs/TabsRouterSync", () => ({
  TabsRouterSync: () => {
    if (suspendSync) throw NEVER;
    return <div data-testid="fake-tabs-router-sync" />;
  },
}));

describe("AppShell — kabuk montajı", () => {
  it("`main.app-content` İÇİNDE kırıntı YOK (kırıntı üst çubuğa taşındı)", () => {
    // Mutasyon (M1): `<PageBreadcrumb />`u/`<TopbarBreadcrumb />`ı `{children}`
    // ÖNCESİNE `<main>`e geri koy → bu iddia kırmızı olur (nav[aria-label=
    // "Yol göstergesi"] bulunur).
    render(
      <AppShell>
        <div data-testid="fake-page-content">içerik</div>
      </AppShell>,
    );
    const main = screen.getByTestId("fake-page-content").closest("main.app-content");
    expect(main).not.toBeNull();
    expect(main?.querySelector('nav[aria-label="Yol göstergesi"]')).toBeNull();
  });

  it("DOM SIRASI: StaleBuildBanner → children", () => {
    // Mutasyon (M4): `<StaleBuildBanner />`u `{children}`dan SONRAYA taşı →
    // bu iddia kırmızı olur (sıra bozulur).
    render(
      <AppShell>
        <div data-testid="fake-page-content">içerik</div>
      </AppShell>,
    );
    const main = screen.getByTestId("fake-stale-banner").closest("main.app-content");
    expect(main).not.toBeNull();
    const order = [...(main?.children ?? [])].map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["fake-stale-banner", "fake-page-content"]);
  });
});

describe("AppShell — SEKME-F1.4a router senkronu", () => {
  it("TabsRouterSync kabukta bir kez monte edilir, `main` DIŞINDA", () => {
    suspendSync = false;
    render(
      <AppShell>
        <div data-testid="fake-page-content">içerik</div>
      </AppShell>,
    );
    const sync = screen.getByTestId("fake-tabs-router-sync");
    expect(sync.closest("main")).toBeNull();
  });

  it("senkron askıdayken (useSearchParams) kabuk ve içerik YİNE basılır — Suspense sınırı yalnız onu sarar", () => {
    // Mutasyon (M7 birim karşılığı): `<Suspense>` sarmalayıcısını kaldır →
    // askı kabuğun tamamını düşürür, bu iddialar kırmızı olur. Asıl kanıt
    // `next build`tir (lider), bu test yalnız sınırın YERİNİ bekçiler.
    suspendSync = true;
    render(
      <AppShell>
        <div data-testid="fake-page-content">içerik</div>
      </AppShell>,
    );
    expect(screen.getByTestId("fake-topbar")).toBeInTheDocument();
    expect(screen.getByTestId("fake-page-content")).toBeInTheDocument();
    expect(screen.queryByTestId("fake-tabs-router-sync")).toBeNull();
    suspendSync = false;
  });
});
