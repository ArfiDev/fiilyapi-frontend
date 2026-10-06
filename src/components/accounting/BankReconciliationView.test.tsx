import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";
import type {
  ChartAccountListResponse,
  ChartAccountResponse,
} from "@/lib/api/hooks/useChartOfAccounts";
import { useChartOfAccounts } from "@/lib/api/hooks/useChartOfAccounts";
import type { LedgerResponse, LedgerRow } from "@/lib/api/hooks/useLedger";
import { useLedger } from "@/lib/api/hooks/useLedger";
import type { TrialBalanceResponse } from "@/lib/api/hooks/useTrialBalance";
import { useTrialBalance } from "@/lib/api/hooks/useTrialBalance";

import { BankReconciliationView } from "./BankReconciliationView";

vi.mock("@/lib/api/hooks/useChartOfAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useChartOfAccounts")>()),
  useChartOfAccounts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTrialBalance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTrialBalance")>()),
  useTrialBalance: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useLedger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useLedger")>()),
  useLedger: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/muhasebe/banka-mutabakati" }));

function account(code: string, name: string): ChartAccountResponse {
  return {
    id: `id-${code}`,
    code,
    name,
    account_type: "asset",
    is_active: true,
    is_contra: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    balance: "0.00",
    class_code: code.slice(0, 1),
    level: code.includes(".") ? 2 : 1,
  };
}

const ACCOUNTS: ChartAccountListResponse = {
  items: [account("100", "Kasa"), account("102", "Bankalar"), account("320", "Satıcılar")],
  total: 3,
  limit: 200,
  offset: 0,
} as ChartAccountListResponse;

const TRIAL: TrialBalanceResponse = {
  year: 2026,
  month: 7,
  is_balanced: true,
  rows: [
    {
      account_id: "id-102",
      account_code: "102",
      account_name: "Bankalar",
      opening_debit: "0.00",
      opening_credit: "0.00",
      period_debit: "2840500.00",
      period_credit: "0.00",
      closing_debit: "2840500.00",
      closing_credit: "0.00",
    },
  ],
  totals: {
    opening_debit: "0.00",
    opening_credit: "0.00",
    period_debit: "2840500.00",
    period_credit: "0.00",
    closing_debit: "2840500.00",
    closing_credit: "0.00",
  },
};

const LEDGER_ROW: LedgerRow = {
  entry_id: "e1",
  entry_date: "2026-07-17",
  entry_status: "posted",
  account_id: "id-102",
  account_code: "102",
  account_name: "Bankalar",
  description: "Hakediş Tahsilatı",
  detail_note: null,
  debit: "1240000.00",
  credit: "0.00",
  running_balance: "1240000.00",
};

const LEDGER: LedgerResponse = {
  items: [LEDGER_ROW],
  total: 1,
  limit: 200,
  offset: 0,
  carried_balance: "0.00",
};

function queryResult<T>(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<T, Error>;
}

function setSession(level: string | undefined) {
  // IZN-F6a · modül düzeyi → sayfa izni (ACCOUNTING_VIEW kümesi); izin hiç yoksa kapı KAPALI (fail-closed).
  const pages = level === undefined ? {} : pagesFor(ACCOUNTING_VIEW, level === "none" ? "none" : level === "view" ? "view" : "edit");
  vi.mocked(useSession).mockReturnValue({ me: meFixture({ pages }) } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 17, 12, 0, 0));
  setSession("full");
  vi.mocked(useChartOfAccounts).mockReturnValue(
    queryResult<ChartAccountListResponse>({ data: ACCOUNTS }),
  );
  vi.mocked(useTrialBalance).mockReturnValue(
    queryResult<TrialBalanceResponse>({ data: TRIAL }),
  );
  vi.mocked(useLedger).mockReturnValue(queryResult<LedgerResponse>({ data: LEDGER }));
});

describe("Banka Mutabakatı — başlık ve sekmeler", () => {
  it("BM:68/71 geri bağlantısı ve başlık basılır", () => {
    render(<BankReconciliationView />);
    expect(screen.getByTestId("bm-back")).toHaveAttribute("href", "/muhasebe");
    expect(screen.getByRole("heading", { name: "Banka Mutabakatı" })).toBeInTheDocument();
  });

  it("modül şeridinde AKTİF hap Banka Mutabakatı'dır", () => {
    render(<BankReconciliationView />);
    const active = screen.getByRole("link", { name: "Banka Mutabakatı" });
    expect(active).toHaveAttribute("aria-current", "page");
  });
});

describe("🔴 seçicinin KÜMESİ — hesap planı, banka kartı DEĞİL", () => {
  it("yalnız 102 ile başlayan hesaplar seçenek olur", () => {
    render(<BankReconciliationView />);
    const options = screen.getByTestId("bm-account").querySelectorAll("option");
    // "Hesap seçin" + yalnız 102. `100 Kasa` ve `320 Satıcılar` DIŞARIDA.
    expect([...options].map((o) => o.textContent)).toEqual(["Hesap seçin", "102 · Bankalar"]);
  });

  it("hesap planında 102 yoksa boş küme GEREKÇESİYLE söylenir", () => {
    vi.mocked(useChartOfAccounts).mockReturnValue(
      queryResult<ChartAccountListResponse>({
        data: { items: [account("100", "Kasa")], total: 1, limit: 200, offset: 0 },
      }),
    );
    render(<BankReconciliationView />);
    expect(screen.getByTestId("bm-no-bank-accounts")).toBeInTheDocument();
  });

  // 🔴 K-MKD3 — "hesap yok" ile "henüz yüklenmedi" AYRI hâllerdir.
  it("hesaplar HENÜZ GELMEDİYSE 'banka hesabı yok' DENMEZ", () => {
    vi.mocked(useChartOfAccounts).mockReturnValue(
      queryResult<ChartAccountListResponse>({ isLoading: true }),
    );
    render(<BankReconciliationView />);
    expect(screen.queryByTestId("bm-no-bank-accounts")).not.toBeInTheDocument();
  });
});

describe("🔴 ÖLÜ YARI — uç YOK, ama SAHTE VERİ de yok", () => {
  it.each([
    ["bm-run", "Mutabakat Yap"],
    ["bm-import", "İçe Aktar"],
  ])("`%s` düğmesi SİLİNMEZ ama DEVRE DIŞIdır", (testId) => {
    render(<BankReconciliationView />);
    expect(screen.getByTestId(testId)).toBeDisabled();
  });

  it.each(["bm-run-reason", "bm-statement-reason", "bm-card-statement-reason", "bm-card-diff-reason"])(
    "`%s` gerekçesi EKRANDA görünür (title'da saklanmaz)",
    (testId) => {
      render(<BankReconciliationView />);
      expect(screen.getByTestId(testId).textContent?.length ?? 0).toBeGreaterThan(20);
    },
  );

  it("mockup'ın ekstre satırları ve `✓ Mutabık` damgası HİÇ basılmaz", () => {
    render(<BankReconciliationView />);
    // Bu beş satır ve damga ekrana çıkarsa kullanıcı mutabakatın YAPILDIĞINI
    // sanar — bu ekranın verebileceği en pahalı yalan.
    expect(screen.queryByText(/Güneşkent/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mutabık/)).not.toBeInTheDocument();
    expect(screen.getByTestId("bm-card-statement")).toHaveTextContent("—");
    expect(screen.getByTestId("bm-card-diff")).toHaveTextContent("—");
  });
});

describe("CANLI YARI — defter + kapanış bakiyesi", () => {
  it("hesap SEÇİLMEDEN defter tablosu basılmaz, yönlendirme metni basılır", () => {
    render(<BankReconciliationView />);
    expect(screen.getByTestId("bm-ledger-idle")).toBeInTheDocument();
    expect(screen.queryByText("Hakediş Tahsilatı")).not.toBeInTheDocument();
  });

  // 🔴 GERÇEK KUSUR — yerel kadrajda ölçüldü ve burada dondurulur.
  it("hesap seçilmeden defter sorgusu KURULMAZ ve kırpma uyarısı BASILMAZ", () => {
    // `total: 1` sunucudan gelse bile ekran "İlk 0 kayıt gösteriliyor
    // (toplam 1) — liste eksik" diye YANLIŞ bir cümle basmamalı: kullanıcı
    // henüz hiçbir şey İSTEMEDİ.
    render(<BankReconciliationView />);
    expect(screen.queryByTestId("bm-ledger-truncation")).not.toBeInTheDocument();
    expect(vi.mocked(useLedger)).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("hesap seçilince defter sorgusu AÇILIR ve hesapla süzülür", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BankReconciliationView />);
    await user.selectOptions(screen.getByTestId("bm-account"), "id-102");
    expect(vi.mocked(useLedger)).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, accountId: "id-102" }),
    );
  });

  it("hesap seçilince panel başlığı `kod – ad` olur ve defter satırı iner", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BankReconciliationView />);
    await user.selectOptions(screen.getByTestId("bm-account"), "id-102");
    expect(screen.getByTestId("bm-ledger-title")).toHaveTextContent("102 – Bankalar");
    expect(screen.getByText("Hakediş Tahsilatı")).toBeInTheDocument();
  });

  it("🔴 kapanış bakiyesi MİZANDAN gelir, defter satırlarından toplanmaz", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BankReconciliationView />);
    await user.selectOptions(screen.getByTestId("bm-account"), "id-102");
    // Defterin TEK satırı 1.240.000; mizanın kapanışı 2.840.500. Ekran
    // mizanınkini basmalı — defter SAYFALANMIŞTIR ve görünen satırların
    // toplamı dönemin kapanışı DEĞİLDİR.
    expect(screen.getByTestId("bm-closing")).toHaveTextContent("2.840.500");
    expect(screen.getByTestId("bm-card-book-value")).toHaveTextContent("2.840.500");
  });

  it("hesap mizanda YOKSA 'hiç hareket görmedi' denir, `0` BASILMAZ", async () => {
    vi.mocked(useTrialBalance).mockReturnValue(
      queryResult<TrialBalanceResponse>({ data: { ...TRIAL, rows: [] } }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BankReconciliationView />);
    await user.selectOptions(screen.getByTestId("bm-account"), "id-102");
    expect(screen.getByTestId("bm-card-book")).toHaveTextContent("hiç hareket görmedi");
    expect(screen.getByTestId("bm-card-book-value")).toHaveTextContent("—");
  });
});

describe("yetki ve hata", () => {
  it("izinsiz kullanıcı ekranı GÖREMEZ", () => {
    setSession("none");
    render(<BankReconciliationView />);
    expect(screen.queryByRole("heading", { name: "Banka Mutabakatı" })).not.toBeInTheDocument();
  });

  it("mizan patlarsa hata YUTULMAZ, defter yaşamaya devam eder", () => {
    vi.mocked(useTrialBalance).mockReturnValue(
      queryResult<TrialBalanceResponse>({ isError: true, error: new Error("boom") }),
    );
    render(<BankReconciliationView />);
    expect(screen.getByTestId("bm-trial-error")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Banka Mutabakatı" })).toBeInTheDocument();
  });
});
