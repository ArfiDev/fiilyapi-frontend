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
