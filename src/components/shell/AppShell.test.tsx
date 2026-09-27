import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AppShell from "./AppShell";

/**
 * SEKME-F1.2 — `AppShell` yalnız KABUK MONTAJINI doğrular: kırıntının kendi
 * davranışı `breadcrumb/PageBreadcrumb.test.tsx`de, oturumun kendi davranışı
 * `SessionProvider.test.tsx`de zaten bekçilenmiş. Burada tek soru DOM SIRASI:
 * `PageBreadcrumb`, `StaleBuildBanner`in ALTINDA ve `{children}`dan ÖNCE mi?
 * Bu yüzden alt bileşenler test kimlikli sahte'lerle DEĞİŞTİRİLİR — gerçek
 * `Topbar`/`SessionProvider` ağı (fetch, router) burada GEREKSİZ gürültüdür.
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
vi.mock("./breadcrumb/PageBreadcrumb", () => ({
  PageBreadcrumb: () => <div data-testid="fake-page-breadcrumb" />,
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
  it("PageBreadcrumb `main.app-content` İÇİNDEDİR", () => {
    render(
      <AppShell>
        <div data-testid="fake-page-content">içerik</div>
      </AppShell>,
    );
    const main = screen.getByTestId("fake-page-breadcrumb").closest("main.app-content");
    expect(main).not.toBeNull();
  });

  it("DOM SIRASI: StaleBuildBanner → PageBreadcrumb → children", () => {
    // Mutasyon (M4): `<PageBreadcrumb />`u `{children}`dan SONRAYA taşı → bu
    // iddia kırmızı olur (sıra bozulur).
    render(
      <AppShell>
        <div data-testid="fake-page-content">içerik</div>
      </AppShell>,
    );
    const main = screen.getByTestId("fake-stale-banner").closest("main.app-content");
    expect(main).not.toBeNull();
    const order = [...(main?.children ?? [])].map((el) => el.getAttribute("data-testid"));
    expect(order).toEqual(["fake-stale-banner", "fake-page-breadcrumb", "fake-page-content"]);
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
