import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { ContractListItem } from "@/lib/api/hooks/useContracts";
import type { ContractDistributionResponse } from "@/lib/api/hooks/useContract";
import type { ProgressPaymentDetail, ProgressPaymentLineDetail, ProgressPaymentListItem } from "@/lib/api/hooks/useProgressPayments";
import type { SiteSubcontractorPaymentItem } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import type { SubcontractorListItem } from "@/lib/api/hooks/useSubcontractors";
import type {
  SubcontractorProgressPaymentLineRead,
  SubcontractorProgressPaymentListItem,
  SubcontractorProgressPaymentSummary,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { computeDiaryAccrual } from "../site-diary/payment-accrual";
import { buildSubcontractorDirectory } from "../subcontractors/subcontractor-aggregate";
import { PaymentCalculationCard } from "./PaymentCalculationCard";
import { PaymentGroupTable } from "./PaymentGroupTable";
import { buildPivotRows, findOrphanedAllocationCells, rowAmountTotal } from "./pivot";
import { ProgressPaymentsTotalsStrip } from "./ProgressPaymentsTotalsStrip";
import { buildPaymentCalculationRows } from "./shared/payment-calculation-rows";
import { computeGrossMargin, computeGrossProfit } from "./shared/margin";
import { computeSiteSubcontractorTotals } from "./shared/site-subcontractor-totals";
import { SubcontractorPaymentLineTable } from "./SubcontractorPaymentLineTable";
import { SubcontractorProgressPaymentsTotals } from "./SubcontractorProgressPaymentsTotals";
import { computeProgressPaymentsTotals } from "./totals";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(hidden: Parameters<typeof meFixture>[0]) {
  vi.mocked(useSession).mockReturnValue({ me: meFixture(hidden), isLoading: false } as ReturnType<
    typeof useSession
  >);
}

beforeEach(() => {
  vi.clearAllMocks();
  session({ hiddenFields: ["sozlesme_fiyat", "maliyet_kar"] });
});

function employerItem(gross: string | null, status = "approved"): ProgressPaymentListItem {
  return { id: `pp-${gross}`, gross_total: gross, net_total: gross, status } as unknown as ProgressPaymentListItem;
}

describe("IZN-F4b.2 · hakediş türevleri (toplam null ise —)", () => {
  it("işveren toplamı: bir kalem null ise null (0 sayılmaz); hepsi doluysa toplanır", () => {
    expect(computeProgressPaymentsTotals([employerItem("10.00"), employerItem(null)]).grossTotal).toBeNull();
    expect(computeProgressPaymentsTotals([employerItem("10.00"), employerItem("5.50")]).grossTotal).toBe("15.50");
  });

  it("taşeron toplamı + marj + kâr: null girdi → null", () => {
    const items = [
      { grossTotal: "10.00", subcontractorName: "A", status: "approved" },
      { grossTotal: null, subcontractorName: "B", status: "approved" },
    ] as unknown as SiteSubcontractorPaymentItem[];
    expect(computeSiteSubcontractorTotals(items).grossTotal).toBeNull();
    expect(computeGrossMargin("100.00", null, true)).toBeNull();
    expect(computeGrossMargin(null, "50.00", true)).toBeNull();
    expect(computeGrossProfit("100.00", null, true)).toBeNull();
    expect(computeGrossProfit(null, "40.00", true)).toBeNull();
    expect(computeGrossProfit("100.00", "40.00", true)).toBe("60.00");
  });

  it("ödeme hesabı satırları: null → '—' ('+ —' / '- —' değil)", () => {
    const rows = buildPaymentCalculationRows(
      { gross: null, vat: null, advance_deduction: null, retention: null, net: null },
      { vat_pct: "20.00", advance_pct: "10.00", retainage_pct: "5.00" } as never,
      { grossLabel: "Brüt", netLabel: "Net" },
    );
    expect(rows.map((row) => row.value)).toEqual(["—", "—", "—", "—", "—"]);
  });
});

describe("IZN-F4b.2 · hakediş tabloları ve kartları", () => {
  it("grup tablosu: null hücreler ve Ara Toplam '—'; sütun başlığında TEK kilit", () => {
    const groups = [
      { group_name: "A", contract_amount: null, previous_amount: null, this_amount: null, cumulative_amount: null },
    ] as unknown as ProgressPaymentDetail["groups"];
    const { container } = render(<PaymentGroupTable groups={groups} />);
    expect(container.querySelector("tfoot")?.textContent).toContain("—");
    expect(container.querySelector("tbody")?.textContent).not.toMatch(/\d/);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(4);
  });

  it("ödeme hesabı kartı: tutarlar '—', başlıkta kilit (taşeron türü maliyet_kar'a bakar)", () => {
    session({ hiddenFields: ["maliyet_kar"] });
    const detail = {
      calculation: { gross: null, vat: null, advance_deduction: null, retention: null, net: null },
      vat_pct: "20.00",
      advance_pct: "0.00",
      retainage_pct: "0.00",
    } as unknown as ProgressPaymentDetail;
    const first = render(<PaymentCalculationCard detail={detail} kind="subcontractor" />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    first.unmount();
    // aynı veri, işveren türü sozlesme_fiyat'a bakar → o kategori gizli değil → kilit YOK
    render(<PaymentCalculationCard detail={detail} kind="employer" />);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });

  it("taşeron kalem tablosu: null fiyat/tutar '—', Ara Toplam '—'", () => {
    const lines = [
      {
        id: "l1",
        sort_order: 1,
        group_name: null,
        code: "01",
        description: "Kalem",
        unit: "m²",
        quantity: "2.000",
        coefficient: "1.000",
        contract_unit_price: null,
        adjusted_unit_price: null,
        line_total: null,
      },
    ] as unknown as SubcontractorProgressPaymentLineRead[];
    const { container } = render(<SubcontractorPaymentLineTable lines={lines} />);
    expect(container.querySelector("tfoot")?.textContent).toContain("—");
    expect(container.querySelector("tfoot")?.textContent).not.toMatch(/\d/);
  });

  it("KPI şeridi: işveren toplamı null → '—' + kilit; marj kartı 'gizli' gerekçesi (eksik-veri DEĞİL)", () => {
    render(
      <ProgressPaymentsTotalsStrip
        items={[employerItem(null)]}
        subcontractor={{
          isLoading: false,
          isPartial: false,
          grossTotal: null,
          distinctSubcontractorCount: 1,
          pendingApprovalCount: 0,
          marginPct: null,
          isMasked: true,
        }}
      />,
    );
    const strip = screen.getByTestId("pp-totals-strip");
    expect(within(strip).getAllByTestId("hidden-mark").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("pp-kpi-pending")).toHaveTextContent("Bu bilgi rolünüz için gizli");
    expect(screen.getByTestId("pp-kpi-pending")).not.toHaveTextContent("eksik");
  });

  it("taşeron KPI şeridi: null → '—' (+ kilit)", () => {
    const summary = {
      total_gross: null,
      pending_gross: null,
      paid_period_gross: null,
      active_subcontractor_count: 3,
    } as unknown as SubcontractorProgressPaymentSummary;
    render(<SubcontractorProgressPaymentsTotals summary={summary} />);
    const values = screen.getAllByTestId("thk-kpi-value");
    expect(values[0]).toHaveTextContent("—");
    expect(values[3]).toHaveTextContent("3");
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(3);
  });
});

describe("IZN-F4b.2 · pivot: gizli satır tutarı kayıtlı satırı 'kayıt yok' yaptırmaz", () => {
  const distribution = {
    sites: [{ id: "s1", name: "A" }],
    groups: [
      {
        name: "G",
        items: [
          { id: "i1", code: "1", source_code: null, description: "x", unit: "m", quantity: "1", unit_price: null, allocations: [], remaining_quantity: "0" },
        ],
      },
    ],
  } as unknown as ContractDistributionResponse;
  const maskedLine = {
    contract_item_id: "i1",
    site_id: "s1",
    quantity: "5.000",
    line_total: null,
    quantity_source: "manual",
    is_price_stale: null,
  } as unknown as ProgressPaymentLineDetail;

  it("kayıtlı hücre isSaved; satır toplamı null (eksik toplam basılmaz)", () => {
    const rows = buildPivotRows(distribution, [maskedLine]);
    expect(rows[0]?.cells[0]).toMatchObject({ isSaved: true, lineTotal: null });
    expect(rowAmountTotal(rows[0]!)).toBeNull();
  });

  it("tahsisi kalkmış + tutarı gizli kayıtlı satır YİNE yetim olarak yakalanır (sessiz silme uyarısı kaybolmaz)", () => {
    const rows = buildPivotRows(distribution, [maskedLine]);
    const orphans = findOrphanedAllocationCells(rows, distribution.sites);
    expect(orphans).toHaveLength(1);
  });
});

describe("IZN-F4b.2 · taşeron listesi toplamları", () => {
  const firm = { id: "sub-1", name: "Akın", tax_number: null, phone: null, category: null, is_active: true } as unknown as SubcontractorListItem;
  const contract = {
    id: "sc-1",
    counterparty_name: "Akın",
    amount: "100.00",
    status: "active",
    is_draft: false,
  } as unknown as ContractListItem;
  function pay(id: string, status: string, net: string | null): SubcontractorProgressPaymentListItem {
    return {
      id,
      contract_id: "sc-1",
      subcontractor_name: "Akın",
      status,
      period_year: 2026,
      period_month: 8,
      net_total: net,
      gross_total: net,
    } as unknown as SubcontractorProgressPaymentListItem;
  }

  it("ödenen/bekleyen/bu ay: gizli net tutar varsa toplam null + isMasked (kırpılma gerekçesi DEĞİL)", () => {
    const directory = buildSubcontractorDirectory({
      subcontractors: [firm],
      contracts: [contract],
      payments: [pay("a", "paid", "10.00"), pay("b", "paid", null), pay("c", "pending_approval", null)],
      isPaymentTruncated: false,
      currentYear: 2026,
      currentMonth: 8,
    });
    const row = directory.rows[0]!;
    expect(row.paidTotal).toBeNull();
    expect(row.isPaidMasked).toBe(true);
    expect(row.pendingTotal).toBeNull();
    expect(row.isPendingMasked).toBe(true);
    expect(directory.summary.monthPaymentTotal).toBeNull();
    expect(directory.summary.isMonthPaymentMasked).toBe(true);
  });

  it("gizli yoksa toplam sayısal; kırpılmada gerekçe 'kırpılma' (masked=false)", () => {
    const base = {
      subcontractors: [firm],
      contracts: [contract],
      payments: [pay("a", "paid", "10.00"), pay("b", "paid", "5.00")],
      currentYear: 2026,
      currentMonth: 8,
    };
    const ok = buildSubcontractorDirectory({ ...base, isPaymentTruncated: false });
    expect(ok.rows[0]).toMatchObject({ paidTotal: 15, isPaidMasked: false });
    const truncated = buildSubcontractorDirectory({
      ...base,
      payments: [pay("a", "paid", null)],
      isPaymentTruncated: true,
    });
    expect(truncated.rows[0]).toMatchObject({ paidTotal: null, isPaidMasked: false });
  });
});

describe("IZN-F4b.2 · günlük hakediş birikimi", () => {
  it("işveren hakedişi gizliyse toplam null + 'gizli' gerekçesi; taşeron satırı toplamı null", () => {
    const accrual = computeDiaryAccrual({
      employerItems: [
        { period_year: 2026, period_month: 7, gross_total: null },
      ] as unknown as ProgressPaymentListItem[],
      isEmployerLoading: false,
      isEmployerError: false,
      subcontractorItems: [
        { subcontractorName: "A", periodYear: 2026, periodMonth: 7, grossTotal: null },
        { subcontractorName: "B", periodYear: 2026, periodMonth: 7, grossTotal: "10.00" },
      ] as unknown as SiteSubcontractorPaymentItem[],
      isSubcontractorLoading: false,
      isSubcontractorError: false,
      subcontractorTruncation: { isTruncated: false, shownCount: 2, totalCount: 2 },
      year: 2026,
      month: 7,
    });
    expect(accrual.employerTotal).toBeNull();
    expect(accrual.employerPendingReason).toBe("Bu bilgi rolünüz için gizli");
    expect(accrual.grossProfit).toBeNull();
    expect(accrual.subcontractorRows?.find((row) => row.name === "A")?.grossTotal).toBeNull();
    expect(accrual.subcontractorRows?.[0]?.name).toBe("B"); // gizli tutar sona sıralanır
  });
});
