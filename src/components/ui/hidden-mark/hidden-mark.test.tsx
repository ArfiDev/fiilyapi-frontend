import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardEmptyState } from "@/components/dashboard/CardEmptyState";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { SiteTotalsStrip } from "@/components/project-detail/SiteTotalsStrip";
import { BoqPctCell } from "@/components/boq/BoqPctCell";
import { StockKpiStrip } from "@/components/stock/StockKpiStrip";
import type { SiteListResponse } from "@/lib/api/hooks/useSites";
import type { StockSummaryKpis } from "@/lib/api/hooks/useStockSummary";

import { HiddenMark } from "./HiddenMark";

/**
 * IZN-F4.2 GECE KARARI — MetricPlaceholder `available:false` + `pending_module:null` (rolün izni yok):
 * kart değeri "—" + küçük kilit + "Bu bilgi rolünüz için gizli". Dolu `pending_module` olan "modül bekleniyor"
 * görünümü AYNEN kalır (kilit YOK).
 */
const HINT = "Bu bilgi rolünüz için gizli";
const RESTRICTED = { available: false, value: null, pending_module: null } as const;
const PENDING = { available: false, value: null, pending_module: "invoicing" } as const;

describe("HiddenMark", () => {
  it("kilit + erişilebilir ipucu; metin görünür modda da aynı", () => {
    const { rerender } = render(<HiddenMark />);
    expect(screen.getByTestId("hidden-mark")).toHaveAttribute("title", HINT);
    expect(screen.getByText(HINT)).toHaveClass("sr-only");
    rerender(<HiddenMark withText />);
    expect(screen.getByText(HINT)).not.toHaveClass("sr-only");
  });
});

describe("dashboard KpiCard / PortfolioCard / CardEmptyState", () => {
  it("KpiCard: 3. hâl → '—' + kilit + ipucu; modül gerekçesi YOK", () => {
    render(<KpiCard label="Tahsil Edilecek" emptyTitle="Henüz fatura verisi yok" metric={RESTRICTED} />);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.getAllByText(HINT).length).toBeGreaterThan(0);
    expect(screen.queryByText("Henüz fatura verisi yok")).not.toBeInTheDocument();
    expect(screen.queryByText("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
  });

  it("KpiCard: 2. hâl (modül bekleniyor) AYNEN — kilit YOK", () => {
    render(<KpiCard label="Tahsil Edilecek" emptyTitle="Henüz fatura verisi yok" metric={PENDING} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
    expect(screen.getByText("Henüz fatura verisi yok")).toBeInTheDocument();
  });

  it("PortfolioCard: 3. hâl kilit basar", () => {
    render(<PortfolioCard metric={RESTRICTED} />);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
  });

  it("CardEmptyState isHidden: pendingModule verilse de gizli hâl önceliklidir", () => {
    render(<CardEmptyState title="X" pendingModule="boq" isHidden />);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.queryByText("X")).not.toBeInTheDocument();
  });
});

describe("şerit/hücre tüketicileri", () => {
  const TOTALS: SiteListResponse["totals"] = {
    total_progress_payment: RESTRICTED,
    subcontractor_count: { available: false, count: null, pending_module: null } as unknown as SiteListResponse["totals"]["subcontractor_count"],
    active_worker_count: { available: false, count: null, pending_module: "timesheet" },
    average_margin: { available: true, value: "14.5" },
  };

  it("SiteTotalsStrip: metric + count 3. hâl kilit; 2. hâl ve dolu kartta kilit YOK", () => {
    render(<SiteTotalsStrip totals={TOTALS} />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(2);
    const worker = screen.getByText("Aktif İşçi").closest(".site-totals__card") as HTMLElement;
    expect(within(worker).queryByTestId("hidden-mark")).not.toBeInTheDocument();
    const margin = screen.getByText("Ortalama Marj").closest(".site-totals__card") as HTMLElement;
    expect(within(margin).queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });

  it("BoqPctCell: 3. hâl kilit; sr-only metin ÇİFT basılmaz", () => {
    render(
      <table>
        <tbody>
          <tr>
            <BoqPctCell progress={RESTRICTED} className="" data-testid="pct" />
          </tr>
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.getAllByText(HINT)).toHaveLength(1);
  });

  it("StockKpiStrip Bekleyen Sipariş: 3. hâl kilit + gizli ipucu; 2. hâl modül gerekçesi", () => {
    const base = { total_value: "1", critical_count: 0, total_items: 1 } as unknown as StockSummaryKpis;
    const { rerender } = render(<StockKpiStrip kpis={{ ...base, pending_orders: RESTRICTED } as StockSummaryKpis} />);
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.getAllByText(HINT).length).toBeGreaterThan(0);
    rerender(<StockKpiStrip kpis={{ ...base, pending_orders: { available: false, value: null, pending_module: "purchasing" } } as StockSummaryKpis} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});
