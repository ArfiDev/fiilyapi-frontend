import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import {
  usePayrollRates,
  usePayrollTaxBrackets,
  useReplacePayrollTaxBrackets,
  useUpsertPayrollRate,
} from "@/lib/api/hooks/usePayrollRates";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { PayrollRatesScreen } from "./PayrollRatesScreen";

// IZN-F5a (KOD kazanır) — SGK/damga oranı (`PUT /payroll/rates/{year}/{source}`) ve vergi dilimi = ayarlar.bordro_oranlari
// Düzenler; mali.bordro / mali.sgk_bildirimi Düzenler bu uca artık 403.
vi.mock("@/lib/api/hooks/usePayrollRates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayrollRates")>()),
  usePayrollRates: vi.fn(),
  usePayrollTaxBrackets: vi.fn(),
  useUpsertPayrollRate: vi.fn(),
  useReplacePayrollTaxBrackets: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePayroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayroll")>()),
  usePayrollPeriods: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const upsertRate = vi.fn();
const replaceBrackets = vi.fn();

/** Ekran `new Date().getFullYear()` okur — testin sabiti onunla AYNI olmalı. */
const NOW_YEAR = new Date().getFullYear();
const DATA_YEAR = NOW_YEAR;

function q(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, error: null, isError: false, isLoading: false, ...extra } as never;
}

function rate(source: string, over: Record<string, unknown> = {}) {
  return {
    id: `r-${source}`,
    year: DATA_YEAR,
    personnel_source: source,
    sgk_employee_pct: "14.000",
    unemployment_employee_pct: "1.000",
    income_tax_pct: null,
    stamp_tax_pct: "0.759",
    sgk_employer_pct: "20.500",
    unemployment_employer_pct: "2.000",
    short_work_pct: "0.000",
    is_active: true,
    ...over,
  };
}

const BRACKETS = [
  { id: "b1", year: DATA_YEAR, income_kind: "wage", ordinal: 1, upper_bound: "190000.00", rate_pct: "15.000", is_active: true },
  { id: "b2", year: DATA_YEAR, income_kind: "wage", ordinal: 2, upper_bound: "400000.00", rate_pct: "20.000", is_active: true },
  { id: "b3", year: DATA_YEAR, income_kind: "wage", ordinal: 3, upper_bound: null, rate_pct: "40.000", is_active: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePayrollRates).mockReturnValue(
    q({ items: [rate("company"), rate("subcontractor")], total: 2 }),
  );
  vi.mocked(usePayrollTaxBrackets).mockReturnValue(q({ items: BRACKETS, total: BRACKETS.length }));
  vi.mocked(usePayrollPeriods).mockReturnValue(q({ items: [], total: 0, limit: 200, offset: 0 }));
  vi.mocked(useUpsertPayrollRate).mockReturnValue({ mutate: upsertRate, isPending: false } as never);
  vi.mocked(useReplacePayrollTaxBrackets).mockReturnValue({
    mutate: replaceBrackets,
    isPending: false,
  } as never);
});


function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as never);
}

const SAVE_RATES = "bro-save-rates";
const SAVE_BRACKETS = "Tarifeyi Kaydet";

describe("PayrollRatesScreen · sayfa izni kapıları (IZN-F2.x / IZN-F5a)", () => {
  it("ayarlar.bordro_oranlari Düzenler → oran Kaydet VAR, tarife Kaydet VAR", () => {
    session(meFixture({ pages: { "ayarlar.bordro_oranlari": pageGrant("edit") }, permissions: { payroll: "view" } }));
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId(SAVE_RATES)).toBeInTheDocument();
    expect(screen.queryByTestId("bro-no-permission")).toBeNull();
    expect(screen.getByRole("button", { name: SAVE_BRACKETS })).toBeInTheDocument();
  });

  it("mali.bordro Düzenler ama bordro_oranlari Görür → oran Kaydet YOK, tarife Kaydet YOK", () => {
    session(meFixture({ pages: { "mali.bordro": pageGrant("edit"), "ayarlar.bordro_oranlari": pageGrant("view") } }));
    render(<PayrollRatesScreen />);
    expect(screen.queryByTestId(SAVE_RATES)).toBeNull();
    expect(screen.queryByRole("button", { name: SAVE_BRACKETS })).toBeNull();
  });

  it("mali.sgk_bildirimi Düzenler tek başına → oran Kaydet YOK (PUT /payroll/rates artık bordro_oranlari ister)", () => {
    session(meFixture({ pages: { "mali.sgk_bildirimi": pageGrant("edit") }, permissions: { payroll: "view" } }));
    render(<PayrollRatesScreen />);
    expect(screen.queryByTestId(SAVE_RATES)).toBeNull();
  });

  it("Onaylar bayrağı yazma kapısını AÇMAZ", () => {
    session(meFixture({ pages: { "mali.bordro": pageGrant("view", true) }, permissions: { payroll: "view" } }));
    render(<PayrollRatesScreen />);
    expect(screen.queryByTestId(SAVE_RATES)).toBeNull();
  });

  it("pages boş → eski davranış: payroll full oranı yazar, tarife için admin ister", () => {
    session(meFixture({ pages: {}, permissions: { payroll: "full" } }));
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId(SAVE_RATES)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_BRACKETS })).toBeNull();
  });

  it("sistem yöneticisi → ikisi de var", () => {
    session(meFixture({ pages: { "mali.bordro": pageGrant("none") }, isSystemAdmin: true }));
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId(SAVE_RATES)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE_BRACKETS })).toBeInTheDocument();
  });
});
