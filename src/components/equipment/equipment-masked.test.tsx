import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { EquipmentWorkSummaryTable } from "@/components/equipment-work/EquipmentWorkSummaryTable";
import { EquipmentFuelKpiStrip } from "@/components/equipment-fuel/EquipmentFuelKpiStrip";
import { EquipmentRentalCard } from "@/components/equipment-detail/EquipmentRentalCard";
import { RentalLinesTable } from "@/components/equipment-rental/RentalLinesTable";
import { RentalSiteDistributionCard } from "@/components/equipment-rental/RentalSiteDistributionCard";
import { rentalPayableUnavailable, rentalUnknownWarning } from "@/components/equipment-rental/rental-derive";
import { FinanceCard } from "@/components/equipment-form/FinanceCard";
import { buildEquipmentUpdateBody, submittableEquipmentValues } from "@/components/equipment-form/build-body";
import { emptyEquipmentFormValues } from "@/components/equipment-form/form-state";
import { maskedEquipmentMoneyFields } from "@/components/equipment-form/omit-fields";
import type { EquipmentEditResponse } from "@/lib/api/hooks/useEquipmentDetail";
import type { EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import type { EquipmentRentalTotals } from "@/lib/api/hooks/useEquipmentDetailScreen";
import type {
  RentalInvoiceDetailResponse,
  RentalInvoiceLineResponse,
  RentalInvoiceTotals,
  RentalSiteDistributionEntry,
} from "@/lib/api/hooks/useEquipmentRentalInvoices";
import type { FuelSummaryResponse } from "@/lib/api/hooks/useEquipmentFuelSummary";
import type { WorkSummaryRow, WorkSummaryTotals } from "@/lib/api/hooks/useEquipmentWorkSummary";
import type { HiddenCategory } from "@/lib/api/models";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { EquipmentKpiStrip } from "./EquipmentKpiStrip";
import { EquipmentView } from "./EquipmentView";

/**
 * IZN-F4d.2 — makine tutarları (sözleşme `IZN-B4d-SOZLESME.md` §1/§3/§5): kategori gizliyken tutarlar `null`;
 * "—" + başlıkta TEK kilit; toplam 0 SAYILMAZ; kategori gizli değilse kilit YOK; maskeli alan PATCH gövdesinde YOK.
 */
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/makine", useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

const HINT = "Bu bilgi rolünüz için gizli";

function setHidden(hidden: readonly HiddenCategory[]) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ hiddenFields: hidden }),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => setHidden([]));

describe("EquipmentKpiStrip — aylık maliyet", () => {
  const masked = { working: 3, broken: 1, maintenance: 0, idle: 2, monthly_cost: null, monthly_cost_unknown_count: 2 } as never;

  it("gizli: '—' + kilit; 'tanımlı değil' notu YOK", () => {
    setHidden(["maliyet_kar"]);
    render(<EquipmentKpiStrip summary={masked} />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.queryByTestId("makine-kpi-cost-unknown-hint")).not.toBeInTheDocument();
  });

  it("gizli DEĞİL (null = veri yok): '—' ama kilit yok", () => {
    render(<EquipmentKpiStrip summary={masked} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
    expect(screen.getByText("Aylık Maliyet").previousElementSibling).toHaveTextContent("—");
  });

  it("tutar dolu + bedeli bilinmeyen makine → eski 'tanımlı değil' notu aynen", () => {
    render(<EquipmentKpiStrip summary={{ ...(masked as object), monthly_cost: "0.00" } as never} />);
    expect(screen.getByTestId("makine-kpi-cost-unknown-hint")).toBeInTheDocument();
  });

  it("dolu tutar: kilit yok", () => {
    setHidden(["maliyet_kar"]);
    render(<EquipmentKpiStrip summary={{ ...(masked as object), monthly_cost: "124800.00" } as never} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});

describe("EquipmentWorkSummaryTable — maliyet", () => {
  const row = { equipment_id: "e1", equipment_name: "Vinç", site_id: null, hours: "10.00", usage_pct: "50", usage_reason: null, breakdown_hours: "0.00", cost: null } as unknown as WorkSummaryRow;
  const totals = { hours: "10.00", usage_pct_avg: "50", breakdown_hours: "0.00", cost: null } as unknown as WorkSummaryTotals;
  const renderTable = () =>
    render(<EquipmentWorkSummaryTable year={2026} month={7} rows={[row]} totals={totals} resolveSiteLabel={() => null} isLoading={false} />);

  it("gizli: hücre ve toplam '—' (₺ 0 değil), ipucu 'rolünüz için gizli', başlıkta TEK kilit", () => {
    setHidden(["maliyet_kar"]);
    renderTable();
    expect(screen.getByTestId("makine-cal-cost-empty")).toHaveAttribute("title", HINT);
    const foot = screen.getByTestId("makine-cal-summary-totals");
    expect(within(foot).getAllByText("—").length).toBeGreaterThan(0);
    expect(foot).not.toHaveTextContent("₺");
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
  });

  it("gizli değil: eski 'tanımlı değil' ipucu, kilit yok", () => {
    renderTable();
    expect(screen.getByTestId("makine-cal-cost-empty").getAttribute("title")).toMatch(/tanımlı değil/);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});

describe("EquipmentFuelKpiStrip — yakıt maliyeti", () => {
  const summary = { total_liters: "100.00", total_amount: null, lt_per_hour_avg: null, avg_unit_price: null, abnormal_count: 0, rows: [] } as unknown as FuelSummaryResponse;

  it("gizli: toplam '—' + kilit; litre fiyatı ipucu gizli metni", () => {
    setHidden(["maliyet_kar"]);
    render(<EquipmentFuelKpiStrip summary={summary} />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.getByTestId("makine-yakit-kpi-price-empty")).toHaveAttribute("title", HINT);
  });

  it("gizli değil: kilit yok", () => {
    render(<EquipmentFuelKpiStrip summary={summary} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});

describe("kira hakedişi", () => {
  const totals = {
    our_total: null,
    our_total_unknown_count: 3,
    owned_total: null,
    owned_total_unknown_count: 1,
    excluded_breakdown_amount: null,
    excluded_breakdown_unknown_count: 1,
    invoice_amount: null,
    vat_amount: null,
    vat_rate: "20.00",
    payable_total: null,
  } as unknown as RentalInvoiceTotals;
  const line = { id: "l1", line_kind: "rented", equipment_id: "e1", equipment_name: "Vinç", equipment_brand: null, equipment_plate_no: null, site_id: null, site_name: null, worked_hours: "10.00", breakdown_hours: "0.00", rate_amount: null, effective_rate_amount: null, our_amount: null, breakdown_amount: null, invoiced_hours: null, hours_variance: null, variance_status: "unknown" } as unknown as RentalInvoiceLineResponse;
  const detail = { id: "i1", period_year: 2026, period_month: 7, lines: [line], totals } as unknown as RentalInvoiceDetailResponse;

  it("maskeli toplamın 'hesaplanamadı' sayacı basılmaz (yalan olurdu)", () => {
    expect(rentalUnknownWarning(totals)).toBeNull();
    expect(rentalUnknownWarning({ ...totals, our_total: "100.00" })).toMatch(/^3 /);
  });

  it("gizliyken 'fatura tutarı girilmedi' gerekçesi basılmaz; gizli değilse basılır", () => {
    expect(rentalPayableUnavailable(totals, true)).toBeNull();
    expect(rentalPayableUnavailable(totals)).not.toBeNull();
  });

  it("tablo: gizli → toplamlar '—', B.F. kutusu YOK (salt okunur), uyarılar yok, başlık kilitleri; PATCH'e kapı", () => {
    setHidden(["maliyet_kar"]);
    render(<RentalLinesTable detail={detail} isEditable isSaving={false} onSaveLine={vi.fn()} />);
    expect(screen.getByTestId("makine-kira-our-total")).toHaveTextContent("—");
    expect(screen.getByTestId("makine-kira-our-total")).not.toHaveTextContent("₺");
    expect(screen.queryByTestId("makine-kira-rate_amount")).not.toBeInTheDocument();
    expect(screen.getByTestId("makine-kira-invoiced_hours")).toBeInTheDocument();
    expect(screen.queryByTestId("makine-kira-unknown-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("makine-kira-payable-warning")).not.toBeInTheDocument();
    expect(screen.getByTestId("makine-kira-payable")).toHaveTextContent("—");
    expect(screen.getAllByTestId("hidden-mark").length).toBeGreaterThanOrEqual(2);
  });

  it("tablo: gizli değil → B.F. kutusu var, kilit yok", () => {
    render(<RentalLinesTable detail={detail} isEditable isSaving={false} onSaveLine={vi.fn()} />);
    expect(screen.getByTestId("makine-kira-rate_amount")).toBeInTheDocument();
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });

  it("proje dağılımı: amount null → '—', uyarı yok, başlıkta TEK kilit", () => {
    setHidden(["maliyet_kar"]);
    const entry = { site_id: "s", site_name: "Site", hours: "10", amount: null, unknown_count: 2, equipments: [] } as unknown as RentalSiteDistributionEntry;
    render(<RentalSiteDistributionCard entries={[entry]} />);
    expect(screen.queryByTestId("makine-kira-dist-warning")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.getByTestId("makine-kira-distribution")).not.toHaveTextContent("₺");
  });
});

describe("EquipmentRentalCard — kümülatif ödenen", () => {
  const equipment = { ownership: "rented", rate_amount: null, rate_period: "hourly", rental_contract_no: null, rental_start_date: null, rental_end_date: null, rental_min_monthly_hours: null, rental_payment_terms: null } as unknown as EquipmentResponse;
  const rental = { cumulative_paid: null, cumulative_paid_unknown_count: 2, paid_invoice_count: 1 } as unknown as EquipmentRentalTotals;

  it("banka_kasa gizli: '—' + kilit, 'hesaplanamadı' bandı yok", () => {
    setHidden(["banka_kasa"]);
    render(<EquipmentRentalCard equipment={equipment} rental={rental} supplierName={null} />);
    expect(screen.getByTestId("makine-det-cumulative-paid")).toHaveTextContent("—");
    expect(within(screen.getByTestId("makine-det-cumulative-paid")).getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.queryByTestId("makine-det-rental-unknown")).not.toBeInTheDocument();
  });

  it("gizli değil: kilit yok", () => {
    render(<EquipmentRentalCard equipment={equipment} rental={rental} supplierName={null} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});

describe("makine formu — maskeli para alanları", () => {
  const detail = { purchase_amount: null, market_value: "3000000.00", rate_amount: null } as unknown as EquipmentEditResponse;

  it("maskedEquipmentMoneyFields: kategori gizli VE değer null olanlar; dolu / gizli değil → boş", () => {
    expect(maskedEquipmentMoneyFields(detail, true)).toEqual(["purchase_amount", "rate_amount"]);
    expect(maskedEquipmentMoneyFields(detail, false)).toEqual([]);
    expect(maskedEquipmentMoneyFields(undefined, true)).toEqual([]);
  });

  it("PATCH gövdesinde maskeli alanlar YOK (null da gönderilmez); dolu olan gider", () => {
    const submittable = submittableEquipmentValues({ ...emptyEquipmentFormValues(), category: "crane", name: "Vinç", marketValue: "3000000.00" });
    if (!submittable) throw new Error("kategori seçili olmalı");
    const body = buildEquipmentUpdateBody(submittable, { maskedMoneyFields: ["purchase_amount", "rate_amount"] });
    expect(body).not.toHaveProperty("purchase_amount");
    expect(body).not.toHaveProperty("rate_amount");
    expect(body).toHaveProperty("market_value", "3000000.00");
    expect(buildEquipmentUpdateBody(submittable)).toHaveProperty("purchase_amount");
  });

  it("FinanceCard: maskeli alan salt okunur '—' + kilit; diğerleri düzenlenebilir", () => {
    render(
      <FinanceCard
        values={emptyEquipmentFormValues()}
        onChange={vi.fn()}
        suppliers={{ items: [], isLoading: false, isError: false }}
        maskedMoney={["purchase_amount"]}
      />,
    );
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.queryByPlaceholderText("3800000")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("3200000")).toBeInTheDocument();
  });
});

describe("EquipmentView import", () => {
  it("modül yüklenir (liste maske notu aynı dosyada)", () => {
    expect(EquipmentView).toBeTypeOf("function");
  });
});
