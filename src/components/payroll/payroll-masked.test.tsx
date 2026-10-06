import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { useCompany } from "@/lib/api/hooks/useCompany";
import type {
  PayrollLineResponse,
  PayrollPeriodListResponse,
  PayrollPeriodListRow,
  PayrollSectionResponse,
  PayrollSummaryResponse,
} from "@/lib/api/hooks/usePayroll";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import { useUpdatePayrollLineSplit } from "@/lib/api/hooks/usePayrollMutations";
import type {
  PayrollSgkSubmitResult,
  PayrollSgkSummaryResponse,
} from "@/lib/api/hooks/usePayrollSgk";
import { usePayrollSgkSummary, useSubmitPayrollSgk } from "@/lib/api/hooks/usePayrollSgk";
import { meFixture } from "@/lib/auth/page-grants.testkit";
import type { CompanyRead } from "@/lib/api/models";

import { historyTotals } from "./payroll-history-derive";
import { sgkEmployeeRows, sgkEmployerRows } from "./payroll-sgk-derive";
import { PayrollHistoryView } from "./PayrollHistoryView";
import { PayrollKpiStrip } from "./PayrollKpiStrip";
import { PayrollLineRow } from "./PayrollLineRow";
import { PayrollPaymentSummary } from "./PayrollPaymentSummary";
import { PayrollSgkPremiumTable } from "./PayrollSgkPremiumTable";
import { PayrollSgkView } from "./PayrollSgkView";
import { PayrollTable } from "./PayrollTable";

vi.mock("next/navigation", () => ({ usePathname: () => "/bordro/gecmis" }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/usePayroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayroll")>()),
  usePayrollPeriods: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/lib/api/hooks/usePayrollSgk", () => ({
  usePayrollSgkSummary: vi.fn(),
  useSubmitPayrollSgk: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePayrollMutations", () => ({ useUpdatePayrollLineSplit: vi.fn() }));

/* ------------------------------------------------------------- fikstürler */

const HINT = "Bu bilgi rolünüz için gizli";

function setHidden(hidden: readonly ("maas_kisisel" | "tum_tutarlar" | "banka_kasa")[]) {
  vi.mocked(useSession).mockReturnValue({
    me: { ...meFixture({ hiddenFields: hidden }), permissions: { payroll: "full" } },
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

function row(overrides: Partial<PayrollPeriodListRow> = {}): PayrollPeriodListRow {
  return {
    id: "period-7",
    year: 2026,
    month: 7,
    status: "pending_approval",
    payment_due_date: "2026-07-20",
    paid_at: null,
    personnel_count: 48,
    gross_total: "743200.00",
    sgk_employer_total: "148800.00",
    net_total: "549148.00",
    total_cost: "892000.00",
    ...overrides,
  };
}

const MASKED_ROW = row({ gross_total: null, sgk_employer_total: null, net_total: null, total_cost: null });

function sgkSummary(overrides: Partial<PayrollSgkSummaryResponse> = {}): PayrollSgkSummaryResponse {
  return {
    period_id: "period-7",
    year: 2026,
    month: 7,
    sgk_submitted_at: null,
    declared_personnel_count: 48,
    sgk_base_total: "743200.00",
    sgk_premium_total: "256404.00",
    unemployment_total: "22296.00",
    sgk_employee_total: "104048.00",
    unemployment_employee_total: "7432.00",
    income_tax_total: "74320.00",
    stamp_tax_total: "5641.00",
    employee_deduction_total: "191441.00",
    sgk_employer_total: "152356.00",
    unemployment_employer_total: "14864.00",
    short_work_total: "7432.00",
    employer_burden_total: "174652.00",
    sgk_payable_total: "278700.00",
    uncomputed_count: 0,
    unknown_rate_count: 0,
    unknown_tax_count: 0,
    ...overrides,
  };
}

const MASKED_SGK = sgkSummary({
  sgk_base_total: null,
  sgk_premium_total: null,
  unemployment_total: null,
  sgk_employee_total: null,
  unemployment_employee_total: null,
  income_tax_total: null,
  stamp_tax_total: null,
  employee_deduction_total: null,
  sgk_employer_total: null,
  unemployment_employer_total: null,
  short_work_total: null,
  employer_burden_total: null,
  sgk_payable_total: null,
});

function summary(overrides: Partial<PayrollSummaryResponse> = {}): PayrollSummaryResponse {
  return {
    line_count: 1,
    net_total: "26538.00",
    net_personnel_count: 1,
    bank_total: "26538.00",
    bank_personnel_count: 1,
    bank_pct: "100.0",
    cash_total: "0.00",
    cash_personnel_count: 0,
    cash_pct: "0.0",
    gross_total: "64200.00",
    sgk_employer_total: "12000.00",
    total_employer_cost: "76200.00",
    uncomputed_count: 0,
    excluded_count: 0,
    unknown_cost_count: 0,
    ...overrides,
  };
}

const MASKED_SUMMARY = summary({
  net_total: null,
  bank_total: null,
  cash_total: null,
  gross_total: null,
  sgk_employer_total: null,
  total_employer_cost: null,
});

function line(overrides: Partial<PayrollLineResponse> = {}): PayrollLineResponse {
  return {
    id: "line-1",
    personnel_id: "p-1",
    personnel_name: "Ayşe Demir",
    personnel_source: "company",
    days: "21",
    gross_amount: "37800.00",
    deduction_amount: "11262.00",
    net_amount: "26538.00",
    bank_amount: "26538.00",
    cash_amount: "0.00",
    status: "pending",
    excluded_reason: null,
    is_overridden: false,
    overridden_at: null,
    previous_gross_amount: null,
    tax_base_amount: null,
    cumulative_tax_base: null,
    income_tax_amount: null,
    ...overrides,
  };
}

const MASKED_LINE = line({
  gross_amount: null,
  deduction_amount: null,
  net_amount: null,
  bank_amount: null,
  cash_amount: null,
});

function section(lines: PayrollLineResponse[]): PayrollSectionResponse {
  return { personnel_source: "company", line_count: lines.length, lines };
}

function queryResult<T>(partial: Record<string, unknown>) {
  return { data: undefined, error: null, isLoading: false, isError: false, ...partial } as unknown as UseQueryResult<T, Error>;
}

beforeEach(() => {
  vi.clearAllMocks();
  setHidden(["maas_kisisel"]);
  vi.mocked(useCompany).mockReturnValue(queryResult<CompanyRead>({ data: { name: "FİİL Yapı" } as CompanyRead }));
  vi.mocked(useUpdatePayrollLineSplit).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useUpdatePayrollLineSplit
  >);
  vi.mocked(useSubmitPayrollSgk).mockReturnValue({ isPending: false, mutateAsync: vi.fn() } as unknown as UseMutationResult<
    PayrollSgkSubmitResult,
    Error,
    string
  >);
});

/* ------------------------------------------------------------ türevler */

describe("IZN-F4c.2 · bordro türevleri null'ı 0 SAYMAZ", () => {
  it("geçmiş toplamı: sütunda tek null varsa toplam null (eksik toplam basılmaz)", () => {
    const totals = historyTotals([row({ id: "a" }), row({ id: "b", gross_total: null })]);
    expect(totals.grossTotal).toBeNull();
    expect(totals.netTotal).toBe("1098296.00"); // dolu sütun etkilenmez
  });

  it("geçmiş toplamı: tüm satırlar maskeliyse dört toplam da null", () => {
    const totals = historyTotals([MASKED_ROW, { ...MASKED_ROW, id: "b" }]);
    expect([totals.grossTotal, totals.sgkEmployerTotal, totals.netTotal, totals.costTotal]).toEqual([null, null, null, null]);
    expect(totals.unparsedCount).toBe(0);
    expect(totals.periodCount).toBe(2);
  });

  it("boş liste gerçek sıfırdır (maske değil)", () => {
    expect(historyTotals([]).grossTotal).toBe("0.00");
  });

  it("SGK satırları null tutarı OLDUĞU GİBİ taşır (0'a çevirmez)", () => {
    expect(sgkEmployeeRows(MASKED_SGK).every((r) => r.amount === null)).toBe(true);
    expect(sgkEmployerRows(MASKED_SGK).every((r) => r.amount === null)).toBe(true);
  });
});

/* ------------------------------------------------------------ geçmiş */

describe("IZN-F4c.2 · Bordro Geçmişi", () => {
  function renderHistory(rows: PayrollPeriodListRow[]) {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      queryResult<PayrollPeriodListResponse>({ data: { items: rows, total: rows.length, limit: 240, offset: 0 } }),
    );
    render(<PayrollHistoryView />);
  }

  it("maskeli satır: tutarlar ve tfoot '—'; her para sütun başlığında TEK kilit", () => {
    renderHistory([MASKED_ROW]);
    const table = screen.getByTestId("bordro-gecmis-table");
    expect(within(table).queryByText(/₺|\d{3}\.\d{3}/)).toBeNull();
    expect(screen.getByTestId("bordro-gecmis-total-gross")).toHaveTextContent("—");
    expect(screen.getByTestId("bordro-gecmis-total-net")).toHaveTextContent("—");
    expect(within(table).getAllByTestId("hidden-mark")).toHaveLength(4);
  });

  it("kategori gizli DEĞİLSE null yine '—' ama kilit YOK", () => {
    setHidden([]);
    renderHistory([MASKED_ROW]);
    expect(screen.getByTestId("bordro-gecmis-total-gross")).toHaveTextContent("—");
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });

  it("dolu veride kilit YOK ve toplam basılır", () => {
    renderHistory([row()]);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByTestId("bordro-gecmis-total-gross")).toHaveTextContent("743.200");
  });
});

/* ------------------------------------------------------------ SGK */

describe("IZN-F4c.2 · SGK Bildirimi", () => {
  function renderSgk(data: PayrollSgkSummaryResponse) {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      queryResult<PayrollPeriodListResponse>({ data: { items: [row()], total: 1, limit: 240, offset: 0 } }),
    );
    vi.mocked(usePayrollSgkSummary).mockReturnValue(queryResult<PayrollSgkSummaryResponse>({ data }));
    render(<PayrollSgkView />);
  }

  it("SGK toplamı null: KPI, prim kartı ve ödenecek prim '—' + kilit; ₺ rakam YOK", () => {
    renderSgk(MASKED_SGK);
    for (const id of ["bordro-sgk-kpi-base", "bordro-sgk-kpi-premium", "bordro-sgk-kpi-unemployment"]) {
      expect(screen.getByTestId(`${id}-value`)).toHaveTextContent("—");
      expect(within(screen.getByTestId(id)).getByTestId("hidden-mark")).toBeInTheDocument();
    }
    expect(screen.getByTestId("bordro-sgk-employee-total")).toHaveTextContent("—");
    expect(screen.getByTestId("bordro-sgk-employer-total")).toHaveTextContent("—");
    expect(screen.getByTestId("bordro-sgk-payable-value")).toHaveTextContent("—");
    expect(screen.getByTestId("bordro-sgk-payable-value")).not.toHaveTextContent("₺ 0");
    expect(screen.getByTestId("bordro-sgk-kpi-premium-value").textContent).not.toMatch(/\d/);
    // sütun başlığında TEK kilit (satırlarda değil)
    expect(within(screen.getByTestId("bordro-sgk-employee")).getAllByTestId("hidden-mark")).toHaveLength(1);
  });

  it("kategori gizli değilse ve değerler doluysa kilit YOK", () => {
    setHidden([]);
    renderSgk(sgkSummary());
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });

  it("PayrollSgkPremiumTable doğrudan: null toplam 0 basılmaz", () => {
    render(<PayrollSgkPremiumTable summary={MASKED_SGK} periodLabel="Temmuz 2026" />);
    expect(screen.getByTestId("bordro-sgk-employee-sgk-employee")).toHaveTextContent("—");
  });
});

/* ------------------------------------------------------------ aylık bordro */

describe("IZN-F4c.2 · Aylık bordro", () => {
  it("KPI kartları null → '—' + kilit; maaş ödeme kutuları da", () => {
    render(
      <>
        <PayrollKpiStrip summary={MASKED_SUMMARY} />
        <PayrollPaymentSummary summary={MASKED_SUMMARY} />
      </>,
    );
    for (const id of ["bordro-kpi-net", "bordro-kpi-bank", "bordro-kpi-cash", "bordro-kpi-cost"]) {
      expect(screen.getByTestId(`${id}-value`)).toHaveTextContent("—");
      expect(within(screen.getByTestId(id)).getByTestId("hidden-mark")).toBeInTheDocument();
    }
    expect(within(screen.getByTestId("bordro-paybox-bank")).getByTestId("hidden-mark")).toBeInTheDocument();
    // sayaçlar maskelenmez
    expect(screen.getByTestId("bordro-kpi-net")).toHaveTextContent("1 çalışan");
  });

  it("tablo: maskeli satırda tutarlar '—', tfoot '—', beş para sütun başlığında TEK kilit", () => {
    render(
      <PayrollTable
        sections={[section([MASKED_LINE])]}
        summary={MASKED_SUMMARY}
        canWrite
        onApproveAll={vi.fn()}
        isApprovePending={false}
        isApproveDisabled={false}
        approveDisabledReason={undefined}
      />,
    );
    expect(screen.getByTestId("bordro-total-net")).toHaveTextContent("—");
    expect(screen.getByTestId("bordro-total-bank")).toHaveTextContent("—");
    expect(screen.getByTestId("bordro-total-cash")).toHaveTextContent("—");
    const head = screen.getAllByRole("columnheader");
    expect(head.flatMap((th) => within(th).queryAllByTestId("hidden-mark"))).toHaveLength(5);
  });

  it("dolu tabloda kilit YOK", () => {
    render(
      <PayrollTable
        sections={[section([line()])]}
        summary={summary()}
        canWrite
        onApproveAll={vi.fn()}
        isApprovePending={false}
        isApproveDisabled={false}
        approveDisabledReason={undefined}
      />,
    );
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });
});

/* ------------------------------------------------------------ satır formu */

describe("IZN-F4c.2 · bordro satırı bölüşüm formu", () => {
  it("maskeli satır salt okunur: PATCH ATILMAZ, banka/elden gövdeye konmaz", async () => {
    const mutateAsync = vi.fn(async () => undefined);
    vi.mocked(useUpdatePayrollLineSplit).mockReturnValue({ mutateAsync, isPending: false } as unknown as ReturnType<
      typeof useUpdatePayrollLineSplit
    >);
    render(
      <table>
        <tbody>
          <PayrollLineRow line={MASKED_LINE} canWrite />
        </tbody>
      </table>,
    );
    const bank = screen.getByTestId("bordro-line-line-1-bank");
    const cash = screen.getByTestId("bordro-line-line-1-cash");
    expect(bank).toBeDisabled();
    expect(cash).toBeDisabled();
    expect(bank).toHaveValue("");
    expect(screen.getByTestId("hidden-mark")).toHaveAttribute("title", HINT);
    expect(screen.queryByText("Bu satırın net tutarı hesaplanmadı.")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("bordro-line-line-1-net"));
    await user.tab();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("kategori gizli değilse aynı null satır (hesaplanmamış) eski gerekçeyi basar, kilit YOK", () => {
    setHidden([]);
    vi.mocked(useUpdatePayrollLineSplit).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
      typeof useUpdatePayrollLineSplit
    >);
    render(
      <table>
        <tbody>
          <PayrollLineRow line={{ ...MASKED_LINE, status: "uncomputed" }} canWrite />
        </tbody>
      </table>,
    );
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
    expect(screen.getByTestId("bordro-line-line-1-reason")).toBeInTheDocument();
  });

  it("dolu satır düzenlenebilir kalır", () => {
    vi.mocked(useUpdatePayrollLineSplit).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
      typeof useUpdatePayrollLineSplit
    >);
    render(
      <table>
        <tbody>
          <PayrollLineRow line={line()} canWrite />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId("bordro-line-line-1-bank")).not.toBeDisabled();
  });
});
