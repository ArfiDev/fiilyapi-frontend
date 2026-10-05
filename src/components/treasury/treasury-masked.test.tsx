import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { BankAccountResponse } from "@/lib/api/hooks/useBankAccounts";
import type { CashFlowBucket, CashFlowResponse } from "@/lib/api/hooks/useCashFlow";
import type {
  FinancialInstrumentResponse,
  FinancialInstrumentSummaryResponse,
} from "@/lib/api/hooks/useFinancialInstruments";
import type { UpcomingPaymentsResponse } from "@/lib/api/hooks/useUpcomingPayments";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { InstrumentSummaryCards } from "../financial-instruments/InstrumentSummaryCards";
import { InstrumentsTable } from "../financial-instruments/InstrumentsTable";
import { BankAccountCards } from "./BankAccountCards";
import { buildCashFlowGeometry } from "./cash-flow-geometry";
import { CashFlowPanel } from "./CashFlowPanel";
import { bankAccountIdentityLine } from "./treasury-labels";
import { UpcomingPaymentsPanel } from "./UpcomingPaymentsPanel";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(hidden: Parameters<typeof meFixture>[0]) {
  vi.mocked(useSession).mockReturnValue({ me: meFixture(hidden), isLoading: false } as ReturnType<
    typeof useSession
  >);
}

beforeEach(() => {
  vi.clearAllMocks();
  session({ hiddenFields: ["banka_kasa"] });
});

function bucket(day: string, inflow: string | null, outflow: string | null): CashFlowBucket {
  return { day, inflow, outflow } as CashFlowBucket;
}

describe("IZN-F4b.2 · nakit akışı geometrisi (null nokta çizilmez)", () => {
  it("null kova: nokta YOK, çizgi iki parçaya bölünür, 0'a düşürülmez; eksen yalnız sayısal değerlerden", () => {
    const geometry = buildCashFlowGeometry(
      [
        bucket("2026-07-02", "100.00", "10.00"),
        bucket("2026-07-05", "400.00", "20.00"),
        bucket("2026-07-10", null, null),
        bucket("2026-07-20", "200.00", "40.00"),
        bucket("2026-07-25", "300.00", "40.00"),
      ],
      2026,
      7,
    );
    expect(geometry.inflowPoints).toHaveLength(4);
    expect(geometry.inflowSegments).toHaveLength(2);
    expect(geometry.inflowLine.match(/M/g)).toHaveLength(2);
    expect(geometry.outflowSegments).toHaveLength(2);
    // tavan = 400 (null değil): en büyük sayısal değer tavana oturur.
    expect(geometry.inflowPoints[1]?.y).toBe(20);
  });

  it("yalnız girişin null olduğu kova: giriş çizgisi kesilir, çıkış devam eder", () => {
    const geometry = buildCashFlowGeometry(
      [bucket("2026-07-02", "100.00", "10.00"), bucket("2026-07-05", null, "20.00"), bucket("2026-07-09", "50.00", "5.00")],
      2026,
      7,
    );
    expect(geometry.inflowSegments).toHaveLength(2);
    expect(geometry.outflowSegments).toHaveLength(1);
    expect(geometry.outflowPoints).toHaveLength(3);
  });

  it("tümü null: nokta/çizgi yok (ölçek 0 → taban çizgisine 'sahte' düz çizgi çizilmez)", () => {
    const geometry = buildCashFlowGeometry([bucket("2026-07-02", null, null)], 2026, 7);
    expect(geometry.inflowPoints).toEqual([]);
    expect(geometry.inflowLine).toBe("");
    expect(geometry.outflowArea).toBe("");
  });
});

describe("IZN-F4b.2 · hazine ekranları (null → —)", () => {
  it("nakit akışı paneli: tüm kovalar gizli → svg yok, not + kilit; toplamlar '—'", () => {
    const cashFlow = {
      year: 2026,
      month: 7,
      inflow_total: null,
      outflow_total: null,
      series: [bucket("2026-07-02", null, null)],
    } as unknown as CashFlowResponse;
    render(<CashFlowPanel cashFlow={cashFlow} isLoading={false} errorMessage={undefined} />);
    expect(screen.queryByTestId("hazine-cashflow-chart")).toBeNull();
    expect(screen.getByTestId("hazine-cashflow-hidden")).toBeInTheDocument();
    expect(screen.getByText(/Giriş —/)).toBeInTheDocument();
    expect(screen.getByText(/Çıkış —/)).toBeInTheDocument();
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
  });

  it("banka kartı: bakiye '—' + kilit; IBAN gizliyse 'künye eksik' iddiası YOK", () => {
    const account = {
      id: "a1",
      bank_name: "Ziraat Bank",
      account_type: "checking",
      iban: null,
      display_name: null,
      opening_balance: null,
      balance: null,
    } as unknown as BankAccountResponse;
    render(<BankAccountCards accounts={[account]} />);
    const card = screen.getByTestId("hazine-account-card");
    expect(within(card).getByTestId("hidden-mark")).toBeInTheDocument();
    expect(card).not.toHaveTextContent("girilmemiş");
    expect(bankAccountIdentityLine({ iban: null, display_name: null }, true)).toEqual({ text: "—", isMissing: false });
    expect(bankAccountIdentityLine({ iban: null, display_name: null })).toMatchObject({ isMissing: true });
  });

  it("yaklaşan ödemeler: tutar null → '—', başlıkta TEK kilit", () => {
    const upcoming = {
      days: 7,
      as_of: "2026-07-17",
      items: [
        { source_type: "invoice", source_id: "i1", counterparty: "A", document_no: "1", due_date: "2026-07-19", days_remaining: 2, amount: null },
        { source_type: "invoice", source_id: "i2", counterparty: "B", document_no: "2", due_date: "2026-07-20", days_remaining: 3, amount: null },
      ],
    } as unknown as UpcomingPaymentsResponse;
    render(<UpcomingPaymentsPanel upcoming={upcoming} isLoading={false} errorMessage={undefined} />);
    expect(screen.getAllByTestId("hazine-upcoming-row")).toHaveLength(2);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("kıymetli evrak tablosu + özet kartları: tutar null → '—'", () => {
    const rows = [
      { id: "f1", kind: "check", direction: "received", serial_no: "1", drawer_name: "X", bank_name: "Y", description: null, issue_date: "2026-01-01", due_date: "2026-08-01", amount: null, status: "in_portfolio" },
    ] as unknown as FinancialInstrumentResponse[];
    render(<InstrumentsTable rows={rows} serialColumnLabel="Çek No" isLoading={false} errorMessage={undefined} />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);

    const summary = {
      as_of: "2026-07-17",
      portfolio_received: { amount: null, count: 8 },
      issued: { amount: null, count: 5 },
      due_this_month: { amount: null, count: 3 },
      returned_cancelled: { amount: null, count: 1 },
    } as unknown as FinancialInstrumentSummaryResponse;
    render(<InstrumentSummaryCards summary={summary} />);
    expect(screen.getByTestId("fin-card-portfolio")).toHaveTextContent("—");
    expect(screen.getByTestId("fin-card-portfolio")).toHaveTextContent("8 adet");
  });
});
