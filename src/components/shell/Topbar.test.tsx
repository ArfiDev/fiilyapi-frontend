import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Topbar from "./Topbar";

vi.mock("./SessionProvider", () => ({
  useSession: () => ({ me: { full_name: "Ahmet Yılmaz", role_key: "patron", title: "Patron" }, isLoading: false }),
}));
// SEKME-F1.2: kırıntı topbar'dan KALKTI, Topbar artık rotayı OKUMUYOR; bu
// mock yalnız `usePathname` başka bir yerden çağrılırsa (yanlışlıkla) patlamaz.
vi.mock("next/navigation", () => ({
  usePathname: () => "/projeler/gunesken-konut",
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
    renderTopbar();
    expect(screen.getByAltText("FİİL YAPI İNŞAAT MİMARLIK SAN. TİC. A.Ş.")).toBeInTheDocument();
  });
  it("kullanici bas harflerini avatar'da gosterir", () => {
    renderTopbar();
    expect(screen.getByText("AY")).toBeInTheDocument();
  });

  it("SEKME-F1.2 — kırıntı artık TOPBAR'DA basılmaz, logo + eylemler tek çift kardeştir", () => {
    // Mutasyon (M2): `<PageBreadcrumb />`u `Topbar.tsx`e geri koy → bu iddia
    // kırmızı olur (üçüncü bir kardeş belirir / testid bulunur).
    const { container } = renderTopbar();
    const header = container.querySelector(".topbar");
    const order = [...(header?.children ?? [])].map((el) => el.className);
    expect(order).toEqual(["topbar-logo", "topbar-actions"]);
    expect(screen.queryByTestId("page-crumbs")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Yol göstergesi" })).toBeNull();
  });

  it("zil ve avatar kirinti OLMADAN da 52px seridi bozulmaz", () => {
    renderTopbar();
    expect(screen.getByRole("button", { name: "Bildirimler" })).toBeInTheDocument();
    expect(screen.getByText("AY")).toBeInTheDocument();
  });
});
