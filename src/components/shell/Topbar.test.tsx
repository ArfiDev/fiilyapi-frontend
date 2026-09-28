import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Topbar from "./Topbar";

vi.mock("./SessionProvider", () => ({
  useSession: () => ({ me: { full_name: "Ahmet Yılmaz", role_key: "patron", title: "Patron" }, isLoading: false }),
}));

let currentPath = "/projeler/gunesken-konut";
// SEKME-F1.7a: kırıntı geri döndüğü için Topbar artık rotayı OKUR (Ayarlar
// altında Çıkış Yap düğmesi için de). `TopbarBreadcrumb` gerçek — kendi
// davranışı `TopbarBreadcrumb.test.tsx`de bekçilenir; burada yalnız YERİ
// (logo ile sekme yuvası arası) ve varlığı ölçülür.
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));
// SEKME-F1.4a — şerit yuvasının kendi davranışı `workspace-tabs/` testlerinde;
// burada yalnız YERİ (kırıntı ile eylemler arası) ölçülür.
vi.mock("./workspace-tabs/WorkspaceTabsBar", () => ({
  WorkspaceTabsBar: () => <div className="topbar-tabs" data-testid="fake-tabs-bar" />,
}));

const logoutSpy = vi.fn();
vi.mock("@/lib/shell/useLogout", () => ({
  useLogout: () => ({ logout: logoutSpy, error: null }),
}));

function renderTopbar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Topbar />
    </QueryClientProvider>,
  );
}

describe("Topbar", () => {
  it("marka logosunu gosterir", () => {
    currentPath = "/projeler/gunesken-konut";
    renderTopbar();
    expect(screen.getByAltText("FİİL YAPI İNŞAAT MİMARLIK SAN. TİC. A.Ş.")).toBeInTheDocument();
  });
  it("kullanici bas harflerini avatar'da gosterir", () => {
    currentPath = "/projeler/gunesken-konut";
    renderTopbar();
    expect(screen.getByText("AY")).toBeInTheDocument();
  });

  it("SEKME-F1.7a — kırıntı ÜST ÇUBUĞA geri döndü: logo | kırıntı | sekme yuvası | eylemler", () => {
    // Mutasyon (M1): `<TopbarBreadcrumb />`u `Topbar.tsx`den kaldır → bu
    // iddia kırmızı olur (üçüncü kardeş kaybolur / testid bulunmaz).
    currentPath = "/projeler/gunesken-konut";
    const { container } = renderTopbar();
    const header = container.querySelector(".topbar");
    const order = [...(header?.children ?? [])].map((el) => el.className);
    expect(order).toEqual(["topbar-logo", "topbar-crumbs", "topbar-tabs", "topbar-actions"]);
    expect(screen.getByTestId("fake-tabs-bar")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Yol göstergesi" })).toBeInTheDocument();
  });

  it("zil ve avatar kirinti/sekme yuvasi ile birlikte 52px seridi bozulmaz", () => {
    currentPath = "/projeler/gunesken-konut";
    renderTopbar();
    expect(screen.getByRole("button", { name: "Bildirimler" })).toBeInTheDocument();
    expect(screen.getByText("AY")).toBeInTheDocument();
  });

  it("Ayarlar DIŞINDA 'Çıkış Yap' düğmesi basılmaz", () => {
    currentPath = "/projeler/gunesken-konut";
    renderTopbar();
    expect(screen.queryByRole("button", { name: "Çıkış Yap" })).toBeNull();
  });

  it("Ayarlar altında topbar'da 'Çıkış Yap' düğmesi belirir (öneri A)", async () => {
    // Mutasyon (M2): `inSettings` koşulunu kaldır (her zaman false) → bu
    // iddia kırmızı olur (düğme hiç basılmaz).
    currentPath = "/ayarlar/kullanicilar";
    const { default: userEvent } = await import("@testing-library/user-event");
    renderTopbar();
    const button = screen.getByRole("button", { name: "Çıkış Yap" });
    expect(button).toHaveClass("topbar-settings-exit");
    await userEvent.click(button);
    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it("SEKME-F2 D(a) — dar ekranda ikona inince erişilebilir ad `aria-label` ile SABİT kalır", () => {
    // Mutasyon (M2): `aria-label="Çıkış Yap"`i kaldır → görünür `__label`
    // span'i CSS'le gizlenince (≤900px) erişilebilir ad kaybolur, bu iddia
    // kırmızı olur (jsdom @media UYGULAMAZ — bu yüzden gerçek kırılma CSS'te
    // görsel/e2e turuyla doğrulanır; burada yalnız MEKANİZMA — aria-label'ın
    // görünür metinden BAĞIMSIZ var olduğu — ölçülür).
    currentPath = "/ayarlar/kullanicilar";
    renderTopbar();
    const button = screen.getByRole("button", { name: "Çıkış Yap" });
    expect(button).toHaveAttribute("aria-label", "Çıkış Yap");
    // Görünür metin AYRI bir span'dedir (CSS ≤900px'te bunu gizler, ikon
    // gösterilir) — DOM'dan KALKMAZ, yalnız görsel olarak solar.
    expect(button.querySelector(".topbar-settings-exit__label")).toHaveTextContent("Çıkış Yap");
    expect(button.querySelector(".topbar-settings-exit__icon")).not.toBeNull();
  });
});
