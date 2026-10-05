import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { BalanceSheetResponse } from "@/lib/api/hooks/useBalanceSheet";
import type {
  CashFlowStatementResponse,
  MonthlyCashPoint,
} from "@/lib/api/hooks/useCashFlowStatement";
import type { IncomeStatementResponse } from "@/lib/api/hooks/useIncomeStatement";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { balanceSheetImbalance } from "./balance-sheet";
import { BalanceSheetBanner } from "./BalanceSheetBanner";
import { BalanceSheetSideCard } from "./BalanceSheetSideCard";
import { buildMonthlyCashGeometry, formatSignedAmount } from "./cash-flow-statement";
import { CashFlowKpiStrip } from "./CashFlowKpiStrip";
import { CashFlowTable } from "./CashFlowTable";
import { IncomeStatementBanner } from "./IncomeStatementBanner";
import { IncomeStatementTable } from "./IncomeStatementTable";
import {
  incomeStatementDifference,
  isIncomeStatementReconciled,
  revenueSharePercent,
} from "./income-statement";
import { MonthlyCashChart } from "./MonthlyCashChart";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ hiddenFields: ["maliyet_kar"] }),
    isLoading: false,
  } as ReturnType<typeof useSession>);
});

const MASKED_INCOME = {
  year: 2026,
  month: 7,
  sections: [
    {
      key: "revenue",
      title: "GELİRLER",
      subtotal_label: "Toplam Gelir",
      subtotal: null,
      lines: [{ key: "construction_revenue", label: "İş Hasılatı", amount: null, account_codes: ["600"] }],
    },
    {
      key: "expenses",
      title: "GİDERLER",
      subtotal_label: "Toplam Gider",
      subtotal: null,
      lines: [{ key: "material_costs", label: "Malzeme", amount: null, account_codes: ["150"] }],
    },
  ],
  total_revenue: null,
  total_expense: null,
  profit_label: "DÖNEM KARI",
  period_profit: null,
} as unknown as IncomeStatementResponse;

describe("IZN-F4b.2 · gelir tablosu", () => {
  it("türevler: girdi null ise fark/mutabakat/oran null (0 sayılmaz)", () => {
    expect(incomeStatementDifference(null, "5.00", "1.00")).toBeNull();
    expect(incomeStatementDifference("10.00", "5.00", null)).toBeNull();
    expect(isIncomeStatementReconciled(null, null, null)).toBeNull();
    expect(isIncomeStatementReconciled("10.00", "5.00", "5.00")).toBe(true);
    expect(isIncomeStatementReconciled("10.00", "5.00", "4.00")).toBe(false);
    expect(revenueSharePercent(null, "100.00")).toBeNull();
    expect(revenueSharePercent("10.00", null)).toBeNull();
    expect(revenueSharePercent("10.00", "100.00")).toBe(10);
  });

  it("tablo: null tutarlar '—', ₺/0 basılmaz, TEK kilit notu", () => {
    render(<IncomeStatementTable data={MASKED_INCOME} />);
    expect(screen.getByTestId("mt-is-profit")).toHaveTextContent("—");
    expect(screen.getByTestId("mt-is-section-revenue-subtotal")).toHaveTextContent("—");
    expect(screen.getByTestId("mt-is-table").textContent).not.toMatch(/\d/);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
  });

  it("şerit: null varken 'eşit değil' uyarısı ÇIKMAZ, sahte 'Mutabık' da çıkmaz; doğrulanamıyor + kilit", () => {
    render(<IncomeStatementBanner data={MASKED_INCOME} />);
    expect(screen.queryByTestId("mt-is-banner")).toBeNull();
    expect(screen.getByTestId("mt-is-banner-unverifiable")).toHaveTextContent("doğrulanamıyor");
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
  });
});

const MASKED_BALANCE = {
  as_of: "2026-07-31",
  is_balanced: false,
  assets: {
    key: "assets",
    title: "AKTİF",
    total_label: "AKTİF TOPLAM",
    total: null,
    sections: [
      {
        key: "current",
        title: "I. DÖNEN",
        subtotal_label: "Dönen Toplamı",
        subtotal: null,
        lines: [{ key: "cash", label: "Kasa", amount: null, account_codes: ["100"], group_codes: [] }],
      },
    ],
  },
  liabilities: { key: "liabilities", title: "PASİF", total_label: "PASİF TOPLAM", total: null, sections: [] },
} as unknown as BalanceSheetResponse;

describe("IZN-F4b.2 · bilanço", () => {
  it("fark null; 'Dengede Değil' çıkmaz (is_balanced=false olsa bile)", () => {
    expect(balanceSheetImbalance(MASKED_BALANCE)).toBeNull();
    render(<BalanceSheetBanner data={MASKED_BALANCE} />);
    expect(screen.queryByText(/Dengede Değil/)).toBeNull();
    expect(screen.getByTestId("bl-banner-unverifiable")).toBeInTheDocument();
  });

  it("taraf kartı: tutarlar '—', başlıkta TEK kilit", () => {
    render(<BalanceSheetSideCard side={MASKED_BALANCE.assets} tone="assets" testId="bl-assets" />);
    expect(screen.getByTestId("bl-assets-total")).toHaveTextContent("—");
    expect(screen.getByTestId("bl-assets-current-cash")).toHaveTextContent("—");
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
  });
});

const MASKED_CASH = {
  year: 2026,
  month: 7,
  opening_cash: null,
  net_change: null,
  closing_cash: null,
  sections: [
    {
      key: "operating",
      code: "A",
      title: "A. İŞLETME",
      subtotal_label: "A Toplam",
      subtotal: null,
      lines: [{ key: "collections", label: "Tahsilat", amount: null, account_codes: [] }],
    },
  ],
  monthly_cash: [],
} as unknown as CashFlowStatementResponse;

function cashPoint(month: number, value: string | null): MonthlyCashPoint {
  return { year: 2026, month, closing_cash: value } as MonthlyCashPoint;
}

describe("IZN-F4b.2 · nakit akış tablosu + grafik", () => {
  it("işaretli tutar: null → '—' ('+ 0' / '- 0' değil)", () => {
    expect(formatSignedAmount(null)).toBe("—");
  });

  it("KPI kartları ve tablo: null → '—'", () => {
    render(<CashFlowKpiStrip data={MASKED_CASH} />);
    expect(screen.getByTestId("na-kpi-operating")).toHaveTextContent("—");
    expect(screen.getByTestId("na-kpi-net")).toHaveTextContent("—");
    render(<CashFlowTable data={MASKED_CASH} />);
    expect(within(screen.getByTestId("na-net-change")).getByText("—")).toBeInTheDocument();
    expect(within(screen.getByTestId("na-closing")).getByText("—")).toBeInTheDocument();
    expect(screen.getByTestId("fs-masked-note")).toBeInTheDocument();
  });

  it("geometri: null ay için NOKTA YOK, çizgide BOŞLUK (iki ayrı parça), eksen yalnız sayısal değerlerden", () => {
    const geometry = buildMonthlyCashGeometry([
      cashPoint(1, "100.00"),
      cashPoint(2, "300.00"),
      cashPoint(3, null),
      cashPoint(4, "200.00"),
      cashPoint(5, "300.00"),
    ]);
    expect(geometry.points).toHaveLength(4);
    expect(geometry.segments).toHaveLength(2);
    expect(geometry.segments[0]).toHaveLength(2);
    expect(geometry.segments[1]).toHaveLength(2);
    // "M" iki kez: kesintisiz çizgi YOK (null ay 0'a düşürülmedi).
    expect(geometry.linePath.match(/M/g)).toHaveLength(2);
    // Etiketler tüm aylar için (zaman ekseni bozulmaz).
    expect(geometry.labels).toHaveLength(5);
    // min=100 tabana, max=300 tavana: null'ın 0'a düşmesi ölçeği ezerdi.
    const ys = geometry.points.map((point) => point.y);
    expect(new Set(ys).size).toBeGreaterThan(1);
    expect(geometry.endDot).toEqual(geometry.points[3]);
  });

  it("geometri: tümü null → nokta/çizgi yok, etiketler duruyor", () => {
    const geometry = buildMonthlyCashGeometry([cashPoint(1, null), cashPoint(2, null)]);
    expect(geometry.points).toEqual([]);
    expect(geometry.linePath).toBe("");
    expect(geometry.endDot).toBeNull();
    expect(geometry.labels).toHaveLength(2);
  });

  it("grafik bileşeni: tümü null → eğri ÇİZİLMEZ, bilgi notu + kilit", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ hiddenFields: ["banka_kasa"] }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    const { container } = render(<MonthlyCashChart series={[cashPoint(1, null), cashPoint(2, null)]} />);
    expect(container.querySelector("svg.fs-cf-chart")).toBeNull();
    expect(screen.getByTestId("na-chart-hidden")).toBeInTheDocument();
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
  });

  it("grafik bileşeni: kısmi null → svg var, null ay için ikinci 'M' parçası", () => {
    const { container } = render(
      <MonthlyCashChart series={[cashPoint(1, "10.00"), cashPoint(2, null), cashPoint(3, "30.00")]} />,
    );
    const line = container.querySelector("path.fs-cf-chart__line");
    expect(line?.getAttribute("d")?.match(/M/g)).toHaveLength(2);
  });
});
