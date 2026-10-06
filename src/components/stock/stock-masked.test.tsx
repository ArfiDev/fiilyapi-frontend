import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SectionStockPanel } from "@/components/section-detail/SectionStockPanel";
import { useSession } from "@/components/shell/SessionProvider";
import type { SectionStockKpis, SectionStockRow } from "@/lib/api/hooks/useSectionStock";
import type { SiteStockKpis } from "@/lib/api/hooks/useSiteStock";
import type { StockSummaryKpis } from "@/lib/api/hooks/useStockSummary";
import type { HiddenCategory } from "@/lib/api/models";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { SiteStockKpiStrip } from "./SiteStockKpiStrip";
import { StockKpiStrip } from "./StockKpiStrip";

/**
 * IZN-F4d.2 — stok değerleri (sözleşme `IZN-B4d-SOZLESME.md` §1/§3): kategori gizliyken değer toplamları `null`;
 * miktarlar AÇIK; "—" + başlıkta/kartta TEK kilit; toplam 0 SAYILMAZ; kategori gizli değilse kilit YOK.
 */
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function setHidden(hidden: readonly HiddenCategory[]) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ hiddenFields: hidden }),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => setHidden([]));

const PENDING = { available: false, value: null, pending_module: "purchasing" } as const;

describe("StockKpiStrip / SiteStockKpiStrip — stok değeri", () => {
  const kpis = { total_value: null, critical_count: 2, low_count: 1, total_items: 5, items_without_price: 0, pending_orders: PENDING } as unknown as StockSummaryKpis;
  const siteKpis = { total_value: null, critical_count: 2, low_count: 1, total_items: 5, items_without_price: 0 } as unknown as SiteStockKpis;

  it("gizli: değer '—' + kilit; miktar kartları AÇIK", () => {
    setHidden(["maliyet_kar"]);
    render(<StockKpiStrip kpis={kpis} />);
    const card = screen.getByText("Toplam Stok Değeri").closest(".stok-kpi__card") as HTMLElement;
    expect(card).toHaveTextContent("—");
    expect(within(card).getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.getByText("2 Kalem")).toBeInTheDocument();
  });

  it("şantiye şeridi: gizli → kilit; gizli değil → kilit yok", () => {
    setHidden(["tum_tutarlar"]);
    const { unmount } = render(<SiteStockKpiStrip kpis={siteKpis} />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    unmount();
    setHidden([]);
    render(<SiteStockKpiStrip kpis={siteKpis} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });

  it("dolu değer + gizli kategori (proje bağlamı farkı) → yalan kilit basılmaz", () => {
    setHidden(["maliyet_kar"]);
    render(<SiteStockKpiStrip kpis={{ ...siteKpis, total_value: "1500000.00" }} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});

describe("SectionStockPanel — tutarlar", () => {
  const row = { item_id: "i", code: "DMR", name: "Demir", category: "steel", unit: "Ton", boq_item_id: null, boq_code: null, boq_description: null, assigned_quantity: "10.000", issued_quantity: "4.000", net_quantity: "6.000", total_value: null } as unknown as SectionStockRow;
  const kpis = { issued_value: null, total_value: null, item_count: 1, lines_without_price: 3 } as unknown as SectionStockKpis;
  const renderPanel = () =>
    render(<SectionStockPanel sectionName="Kat" siteStockHref="/x" total={1} rows={[row]} kpis={kpis} isLoading={false} isError={false} />);

  it("gizli: tutar hücresi ve iki KPI '—' (₺0 / ₺— DEĞİL), miktarlar açık, 'fiyatsız' notu yok, kilitler", () => {
    setHidden(["maliyet_kar"]);
    renderPanel();
    expect(screen.getByTestId("section-stock-kpi-total-value")).toHaveTextContent(/^—/);
    expect(screen.getByTestId("section-stock-kpi-issued-value")).toHaveTextContent(/^—/);
    expect(screen.getByTestId("section-stock-row-DMR")).toHaveTextContent("—");
    expect(screen.getByTestId("section-stock-row-DMR")).not.toHaveTextContent("₺");
    expect(screen.getByTestId("section-stock-row-DMR")).toHaveTextContent("10 Ton");
    expect(screen.queryByTestId("section-stock-price-notice")).not.toBeInTheDocument();
    // iki KPI + Tutar başlığı = üç işaret
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(3);
  });

  it("gizli değil: '—' ama kilit yok", () => {
    renderPanel();
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
    expect(screen.getByTestId("section-stock-kpi-total-value")).toHaveTextContent("—");
  });
});
