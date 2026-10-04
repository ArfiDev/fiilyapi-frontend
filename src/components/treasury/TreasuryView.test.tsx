import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";
import type {
  BankAccountListResponse,
  BankAccountResponse,
} from "@/lib/api/hooks/useBankAccounts";
import { useBankAccounts } from "@/lib/api/hooks/useBankAccounts";
import type { CashFlowResponse } from "@/lib/api/hooks/useCashFlow";
import { useCashFlow } from "@/lib/api/hooks/useCashFlow";
import type { UpcomingPaymentsResponse } from "@/lib/api/hooks/useUpcomingPayments";
import { useUpcomingPayments } from "@/lib/api/hooks/useUpcomingPayments";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";

import { TreasuryView } from "./TreasuryView";

vi.mock("@/lib/api/hooks/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBankAccounts")>()),
  useBankAccounts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useCashFlow", () => ({ useCashFlow: vi.fn() }));
vi.mock("@/lib/api/hooks/useUpcomingPayments", () => ({ useUpcomingPayments: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const ACCOUNT: BankAccountResponse = {
  id: "acc-1",
  bank_name: "Ziraat Bank",
  account_type: "checking",
  iban: "TR12 0001 0093 0012 3456 7890",
  display_name: null,
  opening_balance: "1000000.00",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  balance: "2840500.00",
};

const ACCOUNTS: BankAccountListResponse = {
  items: [ACCOUNT],
  total: 1,
  limit: 200,
  offset: 0,
};

const CASH_FLOW: CashFlowResponse = {
  year: 2026,
  month: 7,
  series: [{ day: "2026-07-01", inflow: "100000.00", outflow: "40000.00" }],
  inflow_total: "4120000.00",
  outflow_total: "3840000.00",
};

const UPCOMING: UpcomingPaymentsResponse = {
  days: 7,
  as_of: "2026-07-17",
  items: [
    {
      source_type: "invoice",
      source_id: "inv-1",
      counterparty: "Yılmaz Elektrik",
      document_no: "FT-118",
      due_date: "2026-07-24",
      days_remaining: 7,
      amount: "475600.00",
    },
  ],
};

function query<T>(overrides: Partial<UseQueryResult<T, Error>>): UseQueryResult<T, Error> {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  } as UseQueryResult<T, Error>;
}

function setSession(level: string | undefined = "full") {
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: level === undefined ? {} : { treasury: level } } as unknown as MeResponse,
  } as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession();
  vi.mocked(useBankAccounts).mockReturnValue(query({ data: ACCOUNTS }));
  vi.mocked(useCashFlow).mockReturnValue(query({ data: CASH_FLOW }));
  vi.mocked(useUpcomingPayments).mockReturnValue(query({ data: UPCOMING }));
});

describe("TreasuryView — E9 başlık şeridi", () => {
  it("E9:62/64 üstyazı ve başlığı basar", () => {
    render(<TreasuryView />);
    expect(screen.getByText("Mali")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Hazine" })).toBeInTheDocument();
  });

  it("E9:65 '+ Ödeme Planla' SİLİNMEZ — devre dışı + görünür gerekçeyle basılır", () => {
    render(<TreasuryView />);
    const button = screen.getByTestId("hazine-plan-payment");
    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toBe("Ödeme planlama ucu henüz açılmadı.");
    expect(screen.getByTestId("hazine-plan-payment-reason")).toBeInTheDocument();
  });
});

describe("TreasuryView — üç bağımsız kaynak", () => {
  it("her kaynak için ayrı 'yüklendi' işareti basar", () => {
    render(<TreasuryView />);
    expect(screen.getByTestId("hazine-loaded-accounts")).toBeInTheDocument();
    expect(screen.getByTestId("hazine-loaded-cashflow")).toBeInTheDocument();
    expect(screen.getByTestId("hazine-loaded-upcoming")).toBeInTheDocument();
  });

  it("veri gelmeyen kaynağın işareti BASILMAZ (pending hâli gizlenmez)", () => {
    vi.mocked(useCashFlow).mockReturnValue(query({ isLoading: true }));
    render(<TreasuryView />);
    expect(screen.getByTestId("hazine-loaded-accounts")).toBeInTheDocument();
    expect(screen.queryByTestId("hazine-loaded-cashflow")).not.toBeInTheDocument();
    expect(screen.getByTestId("hazine-loaded-upcoming")).toBeInTheDocument();
  });

  it("bir sorgu patlayınca DİĞER İKİSİ yaşamaya devam eder", () => {
    vi.mocked(useCashFlow).mockReturnValue(
      query({ isError: true, error: new BackendError(500, { detail: "Sunucu hatası" }) }),
    );
    render(<TreasuryView />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sunucu hatası");
    expect(screen.getByTestId("hazine-account-card")).toBeInTheDocument();
    expect(screen.getByTestId("hazine-upcoming-row")).toBeInTheDocument();
  });
});

describe("TreasuryView — hesap sorgusu", () => {
  it("YALNIZ aktif hesapları ister ve `limit`i AÇIKÇA gönderir", () => {
    render(<TreasuryView />);
    expect(useBankAccounts).toHaveBeenCalledWith({ isActive: true, limit: 200 });
  });

  it("kırpılma sessiz kalmaz", () => {
    vi.mocked(useBankAccounts).mockReturnValue(
      query({ data: { ...ACCOUNTS, total: 260 } }),
    );
    render(<TreasuryView />);
    expect(screen.getByTestId("hazine-truncation-notice")).toBeInTheDocument();
  });

  it("hesap yoksa zarif boş durum basar", () => {
    vi.mocked(useBankAccounts).mockReturnValue(
      query({ data: { ...ACCOUNTS, items: [], total: 0 } }),
    );
    render(<TreasuryView />);
    expect(screen.getByText("Kayıtlı aktif banka/kasa hesabı yok.")).toBeInTheDocument();
    expect(screen.queryByTestId("hazine-account-card")).not.toBeInTheDocument();
  });
});

describe("TreasuryView — izin kapısı", () => {
  it("`treasury` izni 'none' ise ekran açılmaz", () => {
    setSession("none");
    render(<TreasuryView />);
    expect(screen.queryByRole("heading", { level: 1, name: "Hazine" })).not.toBeInTheDocument();
  });

  it("403 dönen hesap sorgusu ekranı kapatır", () => {
    vi.mocked(useBankAccounts).mockReturnValue(
      query({ isError: true, error: new BackendError(403, {}) }),
    );
    render(<TreasuryView />);
    expect(screen.queryByRole("heading", { level: 1, name: "Hazine" })).not.toBeInTheDocument();
  });
});
