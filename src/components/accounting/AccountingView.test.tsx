import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pageGrant, pagesFor } from "@/lib/auth/page-grants.testkit";
import type { ChartAccountListResponse } from "@/lib/api/hooks/useChartOfAccounts";
import { useChartOfAccounts } from "@/lib/api/hooks/useChartOfAccounts";
import type {
  JournalEntryDetailResponse,
  JournalEntryListResponse,
  JournalEntryResponse,
} from "@/lib/api/hooks/useJournalEntries";
import { useJournalEntries } from "@/lib/api/hooks/useJournalEntries";
import {
  usePostJournalEntry,
  useReverseJournalEntry,
} from "@/lib/api/hooks/useJournalEntryMutations";
import type { JournalSummaryResponse } from "@/lib/api/hooks/useJournalSummary";
import { useJournalSummary } from "@/lib/api/hooks/useJournalSummary";
import type { LedgerResponse, LedgerRow } from "@/lib/api/hooks/useLedger";
import { useLedger } from "@/lib/api/hooks/useLedger";
import type { TrialBalanceResponse } from "@/lib/api/hooks/useTrialBalance";
import { useTrialBalance } from "@/lib/api/hooks/useTrialBalance";
import type { VatReturnResponse } from "@/lib/api/hooks/useVatReturn";
import { useVatReturn } from "@/lib/api/hooks/useVatReturn";
import { errorResponse, stubExportDownload } from "@/lib/api/export-test-stub";
import { BackendError } from "@/lib/api/unwrap";

import { useJournalEntry } from "@/lib/api/hooks/useJournalEntry";
import {
  useCreateJournalEntry,
  useReplaceJournalLines,
  useUpdateJournalEntry,
} from "@/lib/api/hooks/useJournalEntryFormMutations";

import { AccountingView } from "./AccountingView";

vi.mock("@/lib/api/hooks/useJournalSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useJournalSummary")>()),
  useJournalSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useLedger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useLedger")>()),
  useLedger: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useJournalEntries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useJournalEntries")>()),
  useJournalEntries: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useChartOfAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useChartOfAccounts")>()),
  useChartOfAccounts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useJournalEntryMutations", () => ({
  usePostJournalEntry: vi.fn(),
  useReverseJournalEntry: vi.fn(),
}));
vi.mock("@/components/delete-confirm/DeleteRecordDialog", () => ({
  DeleteRecordDialog: ({ kind, recordId, onClose }: { kind: string; recordId: string; onClose: () => void }) => (
    <div data-testid="delete-dialog-stub" data-kind={kind} data-record-id={recordId}>
      <button type="button" onClick={onClose}>
        stub-kapat
      </button>
    </div>
  ),
}));
vi.mock("@/lib/api/hooks/useJournalEntry", () => ({ useJournalEntry: vi.fn() }));
vi.mock("@/lib/api/hooks/useJournalEntryFormMutations", () => ({
  useCreateJournalEntry: vi.fn(),
  useUpdateJournalEntry: vi.fn(),
  useReplaceJournalLines: vi.fn(),
}));
// 🔴 F-MUP: MP:114-139 KPI şeridi ve MP:165-209 sağ rayı İKİ YENİ UCA bağlandı.
vi.mock("@/lib/api/hooks/useTrialBalance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTrialBalance")>()),
  useTrialBalance: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useVatReturn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useVatReturn")>()),
  useVatReturn: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// 🔴 F-MUP: modül sekme şeridi (`AccountingTabs`) artık görünümün İÇİNDEDİR
// (drill-in sidebar kalktı) ve `usePathname` okur. Mock olmadan jsdom'da
// `null` döner ve şeridin aktiflik kararı çökerdi.
vi.mock("next/navigation", () => ({ usePathname: () => "/muhasebe" }));


const SUMMARY: JournalSummaryResponse = {
  year: 2026,
  month: 7,
  total_debit: "3842600.00",
  total_credit: "4120000.00",
  net_balance: "277400.00",
};

const CREDIT_ROW: LedgerRow = {
  entry_id: "entry-1",
  entry_date: "2026-07-17",
  entry_status: "posted",
  account_id: "acc-120",
  account_code: "120.01",
  account_name: "Alıcılar",
  description: "Hakediş Tahsilatı – Güneşkent",
  detail_note: "Ziraat Bank · TRF-20260717",
  debit: "0.00",
  credit: "1240000.00",
  running_balance: "4120000.00",
};

const DEBIT_ROW: LedgerRow = {
  entry_id: "entry-2",
  entry_date: "2026-07-16",
  entry_status: "reversed",
  account_id: "acc-320",
  account_code: "320.04",
  account_name: "Satıcılar",
  description: "Taşeron Ödemesi – Akın İnşaat",
  detail_note: null,
  debit: "1016800.00",
  credit: "0.00",
  running_balance: "2880000.00",
};

const LEDGER: LedgerResponse = {
  items: [CREDIT_ROW, DEBIT_ROW],
  total: 2,
  limit: 200,
  offset: 0,
  carried_balance: "0.00",
};

function entry(overrides: Partial<JournalEntryResponse> = {}): JournalEntryResponse {
  // 🔴 `entry_no` — FIS-NO kararı 1: `YEV-{yıl}-{sıra:04d}`; yıl override edilebilen
  // `entry_date`ten TÜRER (bkz. `overrides.entry_date`), hardcode değil.
  const entryDate = overrides.entry_date ?? "2026-07-18";
  return {
    id: "entry-draft",
    entry_date: entryDate,
    period_year: 2026,
    period_month: 7,
    description: "Kasa Devri",
    detail_note: null,
    status: "draft",
    total_debit: "1000.00",
    total_credit: "1000.00",
    reversal_of_id: null,
    entry_no: `YEV-${entryDate.slice(0, 4)}-0001`,
    created_by_id: "user-1",
    created_at: "2026-07-18T09:00:00Z",
    updated_at: "2026-07-18T09:00:00Z",
    ...overrides,
  };
}

const DRAFTS: JournalEntryListResponse = { items: [entry()], total: 1, limit: 200, offset: 0 };

const ACCOUNTS: ChartAccountListResponse = {
  items: [
    {
      id: "acc-120",
      code: "120.01",
      name: "Alıcılar",
      account_type: "asset",
      is_active: true,
      is_contra: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      balance: "0.00",
      class_code: "1",
      level: 3,
    },
    {
      id: "acc-320",
      code: "320.04",
      name: "Satıcılar",
      account_type: "liability",
      is_active: true,
      is_contra: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      balance: "0.00",
      class_code: "3",
      level: 3,
    },
  ],
  total: 2,
  limit: 200,
  offset: 0,
};

function queryOk<T>(data: T): UseQueryResult<T, Error> {
  return { data, isLoading: false, isError: false, error: null } as UseQueryResult<T, Error>;
}

function queryLoading<T>(): UseQueryResult<T, Error> {
  return {
    data: undefined,
    isLoading: true,
    isError: false,
    error: null,
  } as UseQueryResult<T, Error>;
}

function queryError<T>(error: Error): UseQueryResult<T, Error> {
  return { data: undefined, isLoading: false, isError: true, error } as UseQueryResult<T, Error>;
}

const mutateSpies = {
  post: vi.fn(),
  reverse: vi.fn(),
};

/** T4 diyaloğu `mutateAsync` kullanır (düzenlemede iki adımlı yazma sırası var). */
const formSpies = {
  create: vi.fn(),
  update: vi.fn(),
  replaceLines: vi.fn(),
};

function asyncMutationStub<TVariables>(
  mutateAsync: ReturnType<typeof vi.fn>,
): UseMutationResult<JournalEntryDetailResponse, Error, TVariables> {
  return { mutateAsync, isPending: false } as unknown as UseMutationResult<
    JournalEntryDetailResponse,
    Error,
    TVariables
  >;
}

/** Sunucudan gelen DENGELİ taslak fiş — düzenleme kipinin kaynağı. */
const DRAFT_DETAIL: JournalEntryDetailResponse = {
  ...entry(),
  lines: [
    {
      id: "line-1",
      sort_order: 0,
      account_id: "acc-120",
      account_code: "120.01",
      account_name: "Alıcılar",
      debit: "1000.00",
      credit: "0.00",
    },
    {
      id: "line-2",
      sort_order: 1,
      account_id: "acc-320",
      account_code: "320.04",
      account_name: "Satıcılar",
      debit: "0.00",
      credit: "1000.00",
    },
  ],
};

function mutationStub(mutate: ReturnType<typeof vi.fn>) {
  return { mutate } as unknown as UseMutationResult<JournalEntryDetailResponse, Error, string>;
}

function setSession(level: string | undefined = "full") {
  // IZN-F6a · modül düzeyi (full/view/none) → sayfa izni: görür kümesi + yevmiye yazma kapısı.
  const me =
    level === "admin"
      ? meFixture({ isSystemAdmin: true })
      : level === "full"
        ? meFixture()
        : meFixture({ pages: pagesFor(ACCOUNTING_VIEW, level === "view" ? "view" : "none") });
  vi.mocked(useSession).mockReturnValue({ me } as ReturnType<typeof useSession>);
}

/**
 * F-MUP · MP:165-209 sağ rayın fikstürü. 🔴 ÜÇÜNCÜ SATIR BİLEREK "gerçek
 * sıfır"dır (iki kapanış tarafı da `0.00`): `include_empty=false` hareketsiz
 * hesabı zaten eler, yani böyle bir satır "hareket gördü ve tam kapandı"
 * demektir ve ekranda `0` BASILMALIDIR (K-MKD3).
 */
const RAIL: TrialBalanceResponse = {
  year: 2026,
  month: 7,
  is_balanced: true,
  rows: [
    {
      account_id: "acc-102",
      account_code: "102",
      account_name: "Bankalar",
      opening_debit: "0.00",
      opening_credit: "0.00",
      period_debit: "3964700.00",
      period_credit: "0.00",
      closing_debit: "3964700.00",
      closing_credit: "0.00",
    },
    {
      account_id: "acc-320",
      account_code: "320",
      account_name: "Satıcılar",
      opening_debit: "0.00",
      opening_credit: "0.00",
      period_debit: "0.00",
      period_credit: "2184000.00",
      closing_debit: "0.00",
      closing_credit: "2184000.00",
    },
    {
      account_id: "acc-100",
      account_code: "100",
      account_name: "Kasa",
      opening_debit: "0.00",
      opening_credit: "0.00",
      period_debit: "500000.00",
      period_credit: "500000.00",
      closing_debit: "0.00",
      closing_credit: "0.00",
    },
  ],
  totals: {
    opening_debit: "0.00",
    opening_credit: "0.00",
    period_debit: "4464700.00",
    period_credit: "2684000.00",
    closing_debit: "3964700.00",
    closing_credit: "2184000.00",
  },
};

/** MP:128-131 KDV kartı — `payable` ASLA negatif olmaz (şema notu). */
/**
 * 🔴 HAZİRAN — beyan dönemi sayfa dönemi (Temmuz) DEĞİLDİR, bir ay geridir
 * (MP:104 ↔ MP:131 ölçümü: `28 Tem vadeli` HAZİRAN beyanının vadesidir).
 */
const VAT: VatReturnResponse = {
  year: 2026,
  month: 6,
  due_date: "2026-07-28",
  calculated_vat: "900000.00",
  deductible_vat: "488000.00",
  payable: "412000.00",
  carried_forward: "0.00",
  taxable_rows: [],
  exempt_base: "0.00",
  deductions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  // 17 Temmuz 2026 YEREL öğle — E8:75 "Temmuz 2026" başlığının kaynağı.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 17, 12, 0, 0));
  setSession();
  vi.mocked(useJournalSummary).mockReturnValue(queryOk(SUMMARY));
  vi.mocked(useLedger).mockReturnValue(queryOk(LEDGER));
  vi.mocked(useJournalEntries).mockReturnValue(queryOk(DRAFTS));
  vi.mocked(useChartOfAccounts).mockReturnValue(queryOk(ACCOUNTS));
  vi.mocked(useTrialBalance).mockReturnValue(queryOk(RAIL));
  vi.mocked(useVatReturn).mockReturnValue(queryOk(VAT));
  vi.mocked(usePostJournalEntry).mockReturnValue(mutationStub(mutateSpies.post));
  vi.mocked(useReverseJournalEntry).mockReturnValue(mutationStub(mutateSpies.reverse));
  formSpies.create.mockResolvedValue(undefined);
  formSpies.update.mockResolvedValue(undefined);
  formSpies.replaceLines.mockResolvedValue(undefined);
  vi.mocked(useCreateJournalEntry).mockReturnValue(asyncMutationStub(formSpies.create));
  vi.mocked(useUpdateJournalEntry).mockReturnValue(asyncMutationStub(formSpies.update));
  vi.mocked(useReplaceJournalLines).mockReturnValue(asyncMutationStub(formSpies.replaceLines));
  vi.mocked(useJournalEntry).mockReturnValue(queryOk(DRAFT_DETAIL));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AccountingView — başlık ve eylemler (E8:62-67)", () => {
  it("breadcrumb, baslik ve iki dugme basilir", () => {
    render(<AccountingView />);
    expect(screen.getByText("Mali")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Muhasebe", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("mu-export")).toBeInTheDocument();
    expect(screen.getByTestId("mu-create-entry")).toBeInTheDocument();
  });

  /** 🔴 EXPORT-XLSX: `GET /journal/export.xlsx` açıldı; düğme artık GERÇEK. */
  it("'Excel' ETKINDIR ve bekleyen-modul gerekcesi ARTIK BASILMAZ", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-export")).toBeEnabled();
    expect(screen.queryByTestId("mu-export-reason")).toBeNull();
  });

  it("'+ Yevmiye Kaydi' GERCEK diyalogu OLUSTURMA kipinde acar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("mu-create-entry"));
    expect(screen.getByRole("dialog", { name: "Yeni Yevmiye Fişi" })).toBeInTheDocument();
    // 📅 Varsayılan tarih YEREL takvimden (sistem saati 17 Temmuz 2026).
    expect(screen.getByTestId("mu-entry-date")).toHaveValue("17.07.2026");
  });

  it("yazma yetkisi yoksa '+ Yevmiye Kaydi' devre disidir ve gerekce gorunur", () => {
    setSession("view");
    render(<AccountingView />);
    expect(screen.getByTestId("mu-create-entry")).toBeDisabled();
    expect(screen.getByTestId("mu-write-notice")).toBeInTheDocument();
  });

  it("izin 'none' ise ekran ACILMAZ", () => {
    setSession("none");
    render(<AccountingView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("dönem seçici (E8:74-77)", () => {
  /** 🔴 TB5 dersi: varsayılan ay YEREL takvimden gelir, ham UTC gününden değil. */
  it("varsayilan donem YEREL takvimin ayidir", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-period-label")).toHaveTextContent("Temmuz 2026");
  });

  it("ok tuslari donemi kaydirir ve sorgulara gecirir", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);

    await user.click(screen.getByTestId("mu-period-prev"));
    expect(screen.getByTestId("mu-period-label")).toHaveTextContent("Haziran 2026");
    expect(vi.mocked(useJournalSummary)).toHaveBeenLastCalledWith(2026, 6);
    expect(vi.mocked(useLedger).mock.lastCall?.[0]).toMatchObject({ year: 2026, month: 6 });
    expect(vi.mocked(useJournalEntries).mock.lastCall?.[0]).toMatchObject({
      year: 2026,
      month: 6,
    });
    // 🔴 T5 BULGUSU BEKÇİSİ: `status` süzgeci GÖNDERİLMEZ. Gönderilseydi
    // `posted` fiş panelde hiç görünmez ve "Storno" düğmesi kullanıcı için
    // ULAŞILAMAZ olurdu (defterde eylem yoktur). Bu iddia geri dönüşü yakalar.
    expect(vi.mocked(useJournalEntries).mock.lastCall?.[0]).not.toHaveProperty("status");
  });
});

describe("KPI şeridi (E8:78-89)", () => {
  it("uc kart mockup bicimiyle basilir", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-kpi-debit")).toHaveTextContent("₺ 3.842.600");
    expect(screen.getByTestId("mu-kpi-credit")).toHaveTextContent("₺ 4.120.000");
    expect(screen.getByTestId("mu-kpi-net")).toHaveTextContent("₺ 277.400");
  });

  it("pozitif net bakiye YESIL, negatif KIRMIZI basilir", () => {
    const { unmount } = render(<AccountingView />);
    expect(screen.getByTestId("mu-kpi-net-value").className).toContain("--success");
    unmount();

    vi.mocked(useJournalSummary).mockReturnValue(
      queryOk({ ...SUMMARY, net_balance: "-277400.00" }),
    );
    render(<AccountingView />);
    expect(screen.getByTestId("mu-kpi-net-value").className).toContain("--danger");
  });

  it("ozet hatasi GORUNUR bir bantla basilir (sessiz yutma YOK)", () => {
    vi.mocked(useJournalSummary).mockReturnValue(
      queryError(new BackendError(500, { detail: "Özet hesaplanamadı." })),
    );
    render(<AccountingView />);
    expect(screen.getByTestId("mu-summary-error")).toHaveTextContent("Özet hesaplanamadı.");
  });
});

describe("yevmiye defteri (E8:93-159)", () => {
  it("alti sutun mockup sirasiyla basilir", () => {
    render(<AccountingView />);
    const headers = screen.getAllByRole("columnheader").slice(0, 6).map((el) => el.textContent);
    expect(headers).toEqual(["Tarih", "Hesap Kodu", "Açıklama", "Borç", "Alacak", "Bakiye"]);
  });

  it("aciklama IKI SATIRLIdir; detail_note null ise alt satir BASILMAZ", () => {
    render(<AccountingView />);
    expect(screen.getByText("Ziraat Bank · TRF-20260717")).toBeInTheDocument();
    expect(screen.getByText("Taşeron Ödemesi – Akın İnşaat")).toBeInTheDocument();
    // İkinci satırın notu `null` — o hücrede ikinci bir metin satırı yoktur.
    const ledgerPanel = screen.getByRole("region", { name: "Yevmiye Defteri" });
    expect(ledgerPanel.querySelectorAll(".mu-table__note")).toHaveLength(1);
  });

  it("bos taraf `—` basar; dolu taraf tutari basar", () => {
    render(<AccountingView />);
    const rows = screen.getAllByRole("row");
    // rows[0] başlık; ilk veri satırı ALACAK bacağıdır (borç boş).
    expect(rows[1].textContent).toContain("—");
    expect(rows[1].textContent).toContain("1.240.000");
  });

  /**
   * 🔴 `running_balance` OLDUĞU GİBİ basılır — istemcide yeniden hesaplanmaz.
   * Sunucunun verdiği iki değer birbirinin devamı değildir (pencere DESC
   * sıralı); istemci hesaplasaydı ikinci satır 4.120.000−1.016.800 çıkardı.
   */
  it("bakiye sunucunun running_balance'ini OLDUGU GIBI basar", () => {
    render(<AccountingView />);
    const rows = screen.getAllByRole("row");
    expect(rows[1].textContent).toContain("4.120.000");
    expect(rows[2].textContent).toContain("2.880.000");
    expect(rows[2].textContent).not.toContain("3.103.200");
  });

  /** 🔴 `reversed` fiş DEFTERDE KALIR — istemci yeniden süzmez. */
  it("reversed satir defterden ATILMAZ", () => {
    render(<AccountingView />);
    expect(screen.getByText("Taşeron Ödemesi – Akın İnşaat")).toBeInTheDocument();
  });

  it("carried_balance sifirsa devir bandi BASILMAZ", () => {
    render(<AccountingView />);
    expect(screen.queryByTestId("mu-carried-balance")).not.toBeInTheDocument();
  });

  it("carried_balance sifir DEGILSE gorunur devir bandi basilir", () => {
    vi.mocked(useLedger).mockReturnValue(queryOk({ ...LEDGER, carried_balance: "2880000.00" }));
    render(<AccountingView />);
    expect(screen.getByTestId("mu-carried-balance")).toHaveTextContent("Devir bakiyesi");
    expect(screen.getByTestId("mu-carried-balance")).toHaveTextContent("2.880.000");
  });

  it("kirpilma bandi total > items oldugunda GORUNUR", () => {
    vi.mocked(useLedger).mockReturnValue(queryOk({ ...LEDGER, total: 640 }));
    render(<AccountingView />);
    expect(screen.getByTestId("mu-ledger-truncation")).toHaveTextContent(
      "İlk 2 kayıt gösteriliyor (toplam 640) — liste eksik.",
    );
  });

  it("kirpilma yoksa bant BASILMAZ", () => {
    render(<AccountingView />);
    expect(screen.queryByTestId("mu-ledger-truncation")).not.toBeInTheDocument();
  });

  it("yukleniyor / bos / hata durumlarinin HEPSI gorunur", () => {
    vi.mocked(useLedger).mockReturnValue(queryLoading());
    const loading = render(<AccountingView />);
    expect(screen.getByTestId("mu-ledger-loading")).toBeInTheDocument();
    loading.unmount();

    vi.mocked(useLedger).mockReturnValue(queryOk({ ...LEDGER, items: [], total: 0 }));
    const empty = render(<AccountingView />);
    expect(screen.getByTestId("mu-ledger-empty")).toBeInTheDocument();
    empty.unmount();

    vi.mocked(useLedger).mockReturnValue(queryError(new BackendError(500, { detail: "Defter yüklenemedi." })));
    render(<AccountingView />);
    expect(screen.getByTestId("mu-ledger-error")).toHaveTextContent("Defter yüklenemedi.");
  });

  it("hesap suzgeci 'Tum Hesaplar' + sunucudan gelen hesaplari listeler", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);

    const select = screen.getByTestId("mu-account-filter");
    expect(select.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "Tüm Hesaplar" })).toBeInTheDocument();

    await user.selectOptions(select, "acc-120");
    expect(vi.mocked(useLedger).mock.lastCall?.[0]).toMatchObject({ accountId: "acc-120" });
  });
});

describe("Taslak Fişler paneli (onaylı sapma adayı)", () => {
  it("taslak satirinda Duzenle + Kayitlastir + Sil vardir, Storno YOKTUR", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-draft-edit-entry-draft")).toBeInTheDocument();
    expect(screen.getByTestId("mu-draft-post-entry-draft")).toBeInTheDocument();
    expect(screen.getByTestId("mu-draft-delete-entry-draft")).toBeInTheDocument();
    expect(screen.queryByTestId("mu-draft-reverse-entry-draft")).not.toBeInTheDocument();
  });

  /** 🔴 BEKÇİ (yönetim kararı 2): `posted` fişte düzenle/sil HİÇ SUNULMAZ. */
  it("posted fiste duzenle/sil YOKTUR, YALNIZ Storno vardir", () => {
    vi.mocked(useJournalEntries).mockReturnValue(
      queryOk({ ...DRAFTS, items: [entry({ id: "e-p", status: "posted" })] }),
    );
    render(<AccountingView />);
    expect(screen.queryByTestId("mu-draft-edit-e-p")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mu-draft-delete-e-p")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mu-draft-post-e-p")).not.toBeInTheDocument();
    expect(screen.getByTestId("mu-draft-reverse-e-p")).toBeInTheDocument();
  });

  it("reversed fiste HICBIR eylem sunulmaz", () => {
    vi.mocked(useJournalEntries).mockReturnValue(
      queryOk({ ...DRAFTS, items: [entry({ id: "e-r", status: "reversed" })] }),
    );
    render(<AccountingView />);
    expect(screen.queryByTestId("mu-draft-edit-e-r")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mu-draft-delete-e-r")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mu-draft-reverse-e-r")).not.toBeInTheDocument();
  });

  it("durum rozetleri Turkce etiketleri basar (ham enum DEGIL)", () => {
    vi.mocked(useJournalEntries).mockReturnValue(
      queryOk({
        ...DRAFTS,
        items: [
          entry({ id: "e-d", status: "draft" }),
          entry({ id: "e-p", status: "posted" }),
          entry({ id: "e-r", status: "reversed" }),
        ],
        total: 3,
      }),
    );
    render(<AccountingView />);
    expect(screen.getByText("Taslak")).toBeInTheDocument();
    expect(screen.getByText("Kayıtlı")).toBeInTheDocument();
    expect(screen.getByText("Ters Kayıtlı")).toBeInTheDocument();
  });

  it("'Kayitlastir' mutation'i FIS KIMLIGIYLE cagirir", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);

    await user.click(screen.getByTestId("mu-draft-post-entry-draft"));
    expect(mutateSpies.post).toHaveBeenCalledWith("entry-draft", expect.anything());
  });

  // SIL-F2.2 · taslak fiş silme ARTIK doğrudan DELETE atmaz (sunucu preview_token ister, yoksa 428):
  // satır "Sil"i ortak silme penceresini FİŞ KİMLİĞİYLE açar.
  it("'Sil' ortak silme penceresini FIS KIMLIGIYLE acar (dogrudan DELETE YOK)", async () => {
    setSession("admin"); // IZN-F6a · taslak fiş silme = need "sa" (yalnız sistem yöneticisi)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);
    expect(screen.queryByTestId("delete-dialog-stub")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("mu-draft-delete-entry-draft"));

    const dialog = screen.getByTestId("delete-dialog-stub");
    expect(dialog).toHaveAttribute("data-kind", "journal_entry");
    expect(dialog).toHaveAttribute("data-record-id", "entry-draft");

    await user.click(screen.getByRole("button", { name: "stub-kapat" }));
    expect(screen.queryByTestId("delete-dialog-stub")).not.toBeInTheDocument();
  });

  /**
   * 🔴 İstek uçarken satırın TÜM eylemleri kapanır — aksi hâlde iki kez
   * "Kayıtlaştır" tıklanabilir ve ikincisi 409 alırdı (kullanıcıya hata gibi
   * görünen bir yarış). `onSettled` gelene kadar düğmeler devre dışıdır.
   */
  it("islem surerken ayni satirin dugmeleri KAPANIR", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);

    await user.click(screen.getByTestId("mu-draft-post-entry-draft"));
    expect(screen.getByTestId("mu-draft-post-entry-draft")).toBeDisabled();
    expect(screen.getByTestId("mu-draft-delete-entry-draft")).toBeDisabled();
    expect(screen.getByTestId("mu-draft-edit-entry-draft")).toBeDisabled();
  });

  it("Duzenle diyalogu FIS KIMLIGIYLE acar ve bacaklari doldurur", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);

    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));
    expect(vi.mocked(useJournalEntry)).toHaveBeenCalledWith("entry-draft");
    expect(screen.getByRole("dialog", { name: "Yevmiye Fişi Düzenle" })).toBeInTheDocument();
    expect(screen.getAllByTestId("mu-line-row")).toHaveLength(2);
    // SIFIR taraf formda BOŞ görünür (tek-taraf kısıtı ekranda anlaşılsın).
    expect(screen.getByTestId("mu-line-debit-0")).toHaveValue(1000);
    expect(screen.getByTestId("mu-line-credit-0")).toHaveValue(null);
  });

  it("mutation hatasi GORUNUR bir bantla basilir", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    mutateSpies.post.mockImplementation(
      (_id: string, options: { onError: (e: Error) => void; onSettled: () => void }) => {
        options.onError(new BackendError(422, { detail: "Fiş dengeli değil." }));
        options.onSettled();
      },
    );
    render(<AccountingView />);

    await user.click(screen.getByTestId("mu-draft-post-entry-draft"));
    expect(screen.getByTestId("mu-action-error")).toHaveTextContent("Fiş dengeli değil.");
  });

  it("bos / yukleniyor / hata durumlarinin HEPSI gorunur", () => {
    vi.mocked(useJournalEntries).mockReturnValue(queryOk({ ...DRAFTS, items: [], total: 0 }));
    const empty = render(<AccountingView />);
    expect(screen.getByTestId("mu-drafts-empty")).toBeInTheDocument();
    empty.unmount();

    vi.mocked(useJournalEntries).mockReturnValue(queryLoading());
    const loading = render(<AccountingView />);
    expect(screen.getByTestId("mu-drafts-loading")).toBeInTheDocument();
    loading.unmount();

    vi.mocked(useJournalEntries).mockReturnValue(
      queryError(new BackendError(500, { detail: "Taslaklar yüklenemedi." })),
    );
    render(<AccountingView />);
    expect(screen.getByTestId("mu-drafts-error")).toHaveTextContent("Taslaklar yüklenemedi.");
  });
});

/**
 * Yevmiye Kaydı diyaloğu. Kanon: `projedesign/Form - Yevmiye Kaydi.dc.html`
 * (`M:` = o dosyanın satırı).
 *
 * 🔴 BAYAT SATIR DÜZELTİLDİ (F-MUF T4): burada eskiden "Form mockup'ı YOKTUR
 * (S-FRM kanonu)" yazıyordu — ARTIK VAR. Gövde YİNE de şemadan türer:
 * mockup'ın icat ettiği `Satır Açıklaması` BASILMAZ (K4). `Fiş No` ise ARTIK
 * BASILIR (BAYAT SATIR DÜZELTİLDİ — F-FISNO T3): FIS-NO dilimi `entry_no`yu
 * üretti (`YEV-{yıl}-{sıra:04d}`), F-OK'un openapi devri onu sözleşmeye
 * `required` (nullable değil) indirdi — artık şemadan türeyen bir alan.
 */
describe("Yevmiye Kaydı diyaloğu (T4)", () => {
  async function openCreate() {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-create-entry"));
    return user;
  }

  /**
   * Düzenleme/kilitli kipin ortak açılışı. `useJournalEntry` mock'u `beforeEach`te
   * `DRAFT_DETAIL` döner; başka bir fiş isteyen test bunu ÇAĞIRMADAN ÖNCE ezer.
   */
  async function openEdit() {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));
    return user;
  }

  it("hesap secicisi YALNIZ yaprak hesaplari sunar (backend §4c)", async () => {
    await openCreate();
    const options = within(screen.getByTestId("mu-line-account-0")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Hesap seçin",
      "120.01 · Alıcılar",
      "320.04 · Satıcılar",
    ]);
  });

  /** 🔴 TEK TARAF: aynı satırda hem borç hem alacak dolamaz. */
  it("bir tarafa deger girilince oteki TEMIZLENIR ve KILITLENIR", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-line-credit-0"), "500");
    expect(screen.getByTestId("mu-line-debit-0")).toBeDisabled();

    await user.clear(screen.getByTestId("mu-line-credit-0"));
    await user.type(screen.getByTestId("mu-line-debit-0"), "300");
    expect(screen.getByTestId("mu-line-credit-0")).toBeDisabled();
    expect(screen.getByTestId("mu-line-credit-0")).toHaveValue(null);
  });

  /**
   * 🔴 DENGE KAPISI — kullanıcı dengesizliği GÖNDERMEDEN ÖNCE görür.
   * Kuruş farkı da dengesizdir (tolerans YOK).
   */
  it("denge kapisi: esitken ACIK, bir kurus kayinca KAPALI", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-entry-description"), "Kasa Devri");
    await user.selectOptions(screen.getByTestId("mu-line-account-0"), "acc-120");
    await user.selectOptions(screen.getByTestId("mu-line-account-1"), "acc-320");
    await user.type(screen.getByTestId("mu-line-debit-0"), "100.00");
    await user.type(screen.getByTestId("mu-line-credit-1"), "100.01");

    expect(screen.getByTestId("mu-balance-difference")).toHaveTextContent("-0,01");
    expect(screen.getByTestId("mu-balance-state")).toHaveTextContent("Fiş dengede değil");
    expect(screen.getByTestId("mu-entry-dialog-save")).toBeDisabled();
    expect(screen.getByTestId("mu-entry-dialog-blockers")).toHaveTextContent(
      "Fiş dengede değil: borç ve alacak toplamları eşit olmalıdır",
    );

    // Tek karakter geri alınır → kapı AÇILIR.
    await user.clear(screen.getByTestId("mu-line-credit-1"));
    await user.type(screen.getByTestId("mu-line-credit-1"), "100.00");
    expect(screen.getByTestId("mu-balance-state")).toHaveTextContent("Fiş dengede");
    expect(screen.getByTestId("mu-entry-dialog-save")).toBeEnabled();
  });

  /** 🔴 AYRIŞMA NOKTASI: float aritmetiğiyle bu fiş "dengesiz" görünürdü. */
  it("0.1 + 0.2 vs 0.3 fisinde kapi ACIKTIR (kayan nokta kapiya sizmaz)", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-entry-description"), "Kuruş testi");
    await user.click(screen.getByTestId("mu-line-add"));
    await user.selectOptions(screen.getByTestId("mu-line-account-0"), "acc-120");
    await user.selectOptions(screen.getByTestId("mu-line-account-1"), "acc-120");
    await user.selectOptions(screen.getByTestId("mu-line-account-2"), "acc-320");
    await user.type(screen.getByTestId("mu-line-debit-0"), "0.1");
    await user.type(screen.getByTestId("mu-line-debit-1"), "0.2");
    await user.type(screen.getByTestId("mu-line-credit-2"), "0.3");

    expect(screen.getByTestId("mu-balance-state")).toHaveTextContent("Fiş dengede");
    expect(screen.getByTestId("mu-entry-dialog-save")).toBeEnabled();
  });

  it("tek satirli fiste kaydet KAPALIdir (sunucu en az iki satir ister)", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-entry-description"), "Tek bacak");
    await user.click(screen.getByTestId("mu-line-remove-1"));
    expect(screen.getAllByTestId("mu-line-row")).toHaveLength(1);
    expect(screen.getByTestId("mu-entry-dialog-blockers")).toHaveTextContent(
      "Fişte en az iki satır olmalıdır",
    );
    expect(screen.getByTestId("mu-entry-dialog-save")).toBeDisabled();
  });

  it("olusturma govdesi: bos taraf '0' GIDER, turev alan SIZMAZ", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-entry-description"), "Kasa Devri");
    await user.type(screen.getByTestId("mu-entry-detail-note"), "Ziraat · TRF-1");
    await user.selectOptions(screen.getByTestId("mu-line-account-0"), "acc-120");
    await user.selectOptions(screen.getByTestId("mu-line-account-1"), "acc-320");
    await user.type(screen.getByTestId("mu-line-debit-0"), "1000");
    await user.type(screen.getByTestId("mu-line-credit-1"), "1000");
    await user.click(screen.getByTestId("mu-entry-dialog-save"));

    expect(formSpies.create).toHaveBeenCalledWith({
      entry_date: "2026-07-17",
      description: "Kasa Devri",
      detail_note: "Ziraat · TRF-1",
      lines: [
        { account_id: "acc-120", debit: "1000", credit: "0" },
        { account_id: "acc-320", debit: "0", credit: "1000" },
      ],
    });
    const [body] = formSpies.create.mock.calls[0] as [Record<string, unknown>];
    for (const derived of ["status", "total_debit", "total_credit", "period_year"]) {
      expect(body).not.toHaveProperty(derived);
    }
  });

  /**
   * 🔴 T7 BULGUSU (mutasyon hayatta kalmıştı): katalog sayfalanmış ya da
   * süzülmüş gelirse düzenlenen fişin hesabı seçenek listesinde OLMAYABİLİR.
   * Seçenek basılmazsa tarayıcı `value`yu sessizce ilk seçeneğe ("Hesap seçin")
   * kaydırır — kullanıcı yalnız tarihi değiştirdiğini sanırken fişin HESABINI
   * kaybederdi. `JournalLinesEditor`ın `isKnown` dalı bunun için yazılmıştı ama
   * hiçbir test onu ölçmüyordu.
   */
  it("🔴 katalogda OLMAYAN hesap secenekten DUSMEZ; secili kalir ve kendi adiyla basilir", async () => {
    // Katalog yalnız `acc-320`yi döndürür: fişin `acc-120` bacağı sayfada YOK.
    vi.mocked(useChartOfAccounts).mockReturnValue(
      queryOk({ ...ACCOUNTS, items: [ACCOUNTS.items[1]], total: 1 }),
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));

    const select = screen.getByTestId("mu-line-account-0");
    // Değer KAYMAZ: hâlâ fişin kendi hesabı seçilidir.
    expect(select).toHaveValue("acc-120");
    // Etiket fişin KENDİ satırından okunur (katalogdan değil).
    expect(within(select).getByRole("option", { name: "120.01 · Alıcılar" })).toBeInTheDocument();

    // Ve bu tek başına bir DEĞİŞİKLİK sayılmaz: kaydet hiçbir satır isteği atmaz.
    await user.click(screen.getByTestId("mu-entry-dialog-save"));
    expect(formSpies.replaceLines).not.toHaveBeenCalled();
  });

  it("duzenlemede yalniz BASLIK oynarsa PUT …/lines HIC atilmaz", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));

    await user.clear(screen.getByTestId("mu-entry-description"));
    await user.type(screen.getByTestId("mu-entry-description"), "Düzeltilmiş açıklama");
    await user.click(screen.getByTestId("mu-entry-dialog-save"));

    expect(formSpies.update).toHaveBeenCalledWith({
      entryId: "entry-draft",
      body: { description: "Düzeltilmiş açıklama" },
    });
    expect(formSpies.replaceLines).not.toHaveBeenCalled();
  });

  it("duzenlemede hicbir sey degismediyse HICBIR istek atilmaz", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));
    await user.click(screen.getByTestId("mu-entry-dialog-save"));

    expect(formSpies.update).not.toHaveBeenCalled();
    expect(formSpies.replaceLines).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  /** 🔴 KISMİ BAŞARISIZLIK SESSİZCE YUTULMAZ. */
  it("baslik yazilip satirlar patlarsa kullaniciya IKISI de soylenir", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    formSpies.replaceLines.mockRejectedValue(
      new BackendError(422, { detail: "Fiş dengede değil: borç ve alacak toplamları eşit olmalıdır" }),
    );
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));

    await user.clear(screen.getByTestId("mu-entry-description"));
    await user.type(screen.getByTestId("mu-entry-description"), "Yeni açıklama");
    await user.clear(screen.getByTestId("mu-line-debit-0"));
    await user.type(screen.getByTestId("mu-line-debit-0"), "1500");
    await user.clear(screen.getByTestId("mu-line-credit-1"));
    await user.type(screen.getByTestId("mu-line-credit-1"), "1500");
    await user.click(screen.getByTestId("mu-entry-dialog-save"));

    const error = await screen.findByTestId("mu-entry-dialog-error");
    expect(error).toHaveTextContent("Başlık güncellendi ancak satırlar kaydedilemedi");
    expect(error).toHaveTextContent("Fiş dengede değil");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("🔴 sunucu hatasi TURKCE cumleyle basilir; ham govde EKRANA CIKMAZ", async () => {
    const user = await openCreate();
    formSpies.create.mockRejectedValue(
      new BackendError(422, { detail: [{ loc: ["body", "lines"], type: "missing" }] }),
    );
    await user.type(screen.getByTestId("mu-entry-description"), "Kasa Devri");
    await user.selectOptions(screen.getByTestId("mu-line-account-0"), "acc-120");
    await user.selectOptions(screen.getByTestId("mu-line-account-1"), "acc-320");
    await user.type(screen.getByTestId("mu-line-debit-0"), "1000");
    await user.type(screen.getByTestId("mu-line-credit-1"), "1000");
    await user.click(screen.getByTestId("mu-entry-dialog-save"));

    const error = await screen.findByTestId("mu-entry-dialog-error");
    expect(error).toHaveTextContent("Fiş oluşturulamadı.");
    expect(error.textContent).not.toContain("loc");
  });

  it("SAVUNMACI: draft OLMAYAN fisle acilirsa form KILITLIDIR", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(useJournalEntry).mockReturnValue(
      queryOk({ ...DRAFT_DETAIL, status: "posted" as const }),
    );
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));

    expect(screen.getByTestId("mu-entry-dialog-locked")).toBeInTheDocument();
    expect(screen.getByTestId("mu-entry-dialog-save")).toBeDisabled();
    expect(screen.getByTestId("mu-entry-description")).toBeDisabled();
  });

  it("detay yuklenirken ve hata verirken diyalog SESSIZ kalmaz", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(useJournalEntry).mockReturnValue(queryLoading());
    const loading = render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));
    expect(screen.getByTestId("mu-entry-dialog-loading")).toBeInTheDocument();
    loading.unmount();

    vi.mocked(useJournalEntry).mockReturnValue(
      queryError(new BackendError(404, { detail: "Fiş bulunamadı" })),
    );
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-draft-edit-entry-draft"));
    expect(screen.getByTestId("mu-entry-dialog-load-error")).toHaveTextContent("Fiş bulunamadı");
  });

  // --- M: mockup sadakati ------------------------------------------------

  /**
   * 🔴 KARAR K4 — MOCKUP'IN İCAT ETTİĞİ `Satır Açıklaması` ÇİZİLMEZ.
   *
   * `M:121` `Satır Açıklaması` şemada YOKTUR: `JournalLineInput` =
   * `account_id`·`debit`·`credit` ve `additionalProperties: false` (ölçüldü).
   * DEVRE DIŞI da basılmaz: yazılanı sessizce yutardı.
   *
   * 🔴 BU TEST BÖLÜNDÜ (F-FISNO). K4'ün ikizi olan `M:99-101` `Fiş No`
   * iddiası ARTIK GEÇERSİZDİR — `entry_no` sözleşmeye girdi ve alan basılıyor
   * (aşağıdaki FIS-NO bekçileri). İki iddia aynı `it` içindeyken `Fiş No`
   * satırları İLK SIRADAYDI: alan basılır basılmaz orada patlıyor, arkasındaki
   * HÂLÂ GEÇERLİ `Satır Açıklaması` + sütun başlığı bekçileri HİÇ KOŞMUYORDU.
   * Negatif iddia kendi testinde durur.
   */
  it("K4: mockup'ın icat ettiği `Satır Açıklaması` sütunu HİÇ basılmaz", async () => {
    await openCreate();
    expect(screen.queryByText("Satır Açıklaması")).toBeNull();

    const headers = within(screen.getByTestId("mu-lines-editor")).getAllByRole("columnheader");
    expect(headers.map((cell) => cell.textContent?.trim())).toEqual([
      "#",
      "Hesap *",
      "Borç ₺",
      "Alacak ₺",
      "Sil",
    ]);
  });

  // --- FIS-NO: `M:99-101` `Fiş No` alanı ---------------------------------

  /**
   * 🔴 K4'ÜN `Fiş No` YARISI DÜŞTÜ — GEREKÇESİ ÖLÇÜMLE ÇÜRÜDÜ.
   *
   * `entry_no` artık sözleşmede VAR: hem `JournalEntryResponse` hem
   * `JournalEntryDetailResponse` üzerinde `string`, ZORUNLU, nullable DEĞİL.
   * Yani mockup'ın kutusu artık var olmayan bir numaralandırma VAAT ETMİYOR;
   * gerçek bir alanın karşılığı. `M:99-101`: etiket `Fiş No`, DEVRE DIŞI
   * input, placeholder `Otomatik`, ipucu `Kayıtta üretilir`, monospace.
   *
   * 🔴 UYDURMA VERİ YASAĞI (F-UNIT2): numarayı SUNUCU üretir. Form onu
   * oluşturma kipinde TAHMİN ETMEZ — kutu BOŞ durur. Önden basılmış bir
   * `YEV-…` kullanıcıya sunucununkiyle çakışacak bir numara vaat ederdi.
   */
  it("FIS-NO oluşturmada `Fiş No` kutusu VARDIR, kilitlidir ve SAHTE numara basmaz", async () => {
    await openCreate();

    const fisNo = screen.getByLabelText(/^Fiş No$/);
    expect(fisNo).toBeDisabled();
    expect(fisNo).toHaveValue("");
    expect(fisNo).toHaveAttribute("placeholder", "Otomatik");
    expect(screen.getByText("Kayıtta üretilir")).toBeInTheDocument();

    // Diyalogda `YEV-…` biçiminde TEK bir metin bile yoktur.
    expect(within(screen.getByRole("dialog")).queryByText(/YEV-\d{4}-\d{4}/)).toBeNull();
  });

  /**
   * Düzenleme kipi (taslak) — numara SUNUCUDAN gelir ve OKUNUR basılır.
   *
   * 🔴 Beklenen dize ELLE yazıldı. `YEV-${entry().entry_date.slice(0, 4)}-0001`
   * gibi bir ifade kendi ifadesini kendisiyle karşılaştırır ve HİÇBİR ŞEY
   * bekçilemez — biçim bozulsa bile yeşil kalırdı.
   */
  it("FIS-NO düzenlemede SUNUCUDAN gelen gerçek numara basılır", async () => {
    await openEdit();

    const fisNo = screen.getByLabelText(/^Fiş No$/);
    expect(fisNo).toHaveValue("YEV-2026-0001");
    expect(fisNo).toBeDisabled();
  });

  /**
   * 🔴 NEGATİF İDDİA KENDİ TESTİNDE (OK-1C/F-OK dersi). Yukarıdaki
   * pozitif iddia kırılırsa bu bekçi onun arkasında SESSİZCE ATLANMASIN.
   * Numara zaten üretilmiştir; `Kayıtta üretilir` cümlesi burada YALAN olurdu.
   */
  it("FIS-NO düzenlemede `Kayıtta üretilir` ipucu BASILMAZ", async () => {
    await openEdit();
    expect(screen.queryByText("Kayıtta üretilir")).toBeNull();
  });

  /** Kilitli kip (`posted`) de bir GÖRÜNTÜLEME kipidir — numara orada da basılır. */
  it("FIS-NO kilitli (posted) fişte numara YİNE basılır", async () => {
    vi.mocked(useJournalEntry).mockReturnValue(
      queryOk({ ...DRAFT_DETAIL, status: "posted" as const }),
    );
    await openEdit();

    expect(screen.getByTestId("mu-entry-dialog-locked")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Fiş No$/)).toHaveValue("YEV-2026-0001");
  });

  /** Biçim bekçisi: `YEV-{yıl}-{sıra:04d}` — dört haneli yıl, dört haneli sıra. */
  it("FIS-NO basılan numara `YEV-{yıl}-{sıra:04d}` biçimindedir", async () => {
    await openEdit();

    const fisNo = screen.getByLabelText(/^Fiş No$/) as HTMLInputElement;
    expect(fisNo.value).toMatch(/^YEV-\d{4}-\d{4}$/);
  });

  it("M:119/130 sıra numarası sütunu satırları numaralar", async () => {
    const user = await openCreate();
    await user.click(screen.getByTestId("mu-line-add"));
    const numbers = screen.getAllByTestId(/^mu-line-no-/).map((cell) => cell.textContent);
    expect(numbers).toEqual(["1", "2", "3"]);
  });

  it("M:82-83/113-114 başlık, alt başlık ve kalem ipucu ekrandadır", async () => {
    await openCreate();
    expect(screen.getByTestId("mu-entry-dialog-subtitle")).toHaveTextContent(
      "Çift taraflı kayıt — borç ve alacak toplamları eşit olmalı",
    );
    expect(screen.getByText("Fiş Bilgileri")).toBeInTheDocument();
    expect(screen.getByText("Fiş Kalemleri")).toBeInTheDocument();
    expect(screen.getByTestId("mu-lines-hint")).toHaveTextContent(
      "Her satırda ya borç ya alacak dolar — ikisi birden dolamaz",
    );
  });

  it("M:96 açıklama ipucu ÖLÇÜLEN sınırı söyler (mockup'ın 500'ünü değil)", async () => {
    await openCreate();
    const hint = screen.getByText(/Yevmiye listesinde bu metin görünür/);
    expect(hint).toHaveTextContent("Maks 2000 karakter");
    expect(screen.getByTestId("mu-entry-description")).toHaveAttribute(
      "aria-describedby",
      hint.id,
    );
  });

  /** `M:143`/`:162` — dolu taraf VURGULU, `M:144`/`:161` kilitli taraf soluk. */
  it("M:143 dolu taraf vurgulanır, öteki taraf kilitlenir", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-line-debit-0"), "100");
    expect(screen.getByTestId("mu-line-debit-0")).toHaveClass("is-filled");
    expect(screen.getByTestId("mu-line-credit-0")).not.toHaveClass("is-filled");
    expect(screen.getByTestId("mu-line-credit-0")).toBeDisabled();

    await user.type(screen.getByTestId("mu-line-credit-1"), "100");
    expect(screen.getByTestId("mu-line-credit-1")).toHaveClass("is-filled");
    expect(screen.getByTestId("mu-line-debit-1")).toBeDisabled();
  });

  /** `M:194-217` ↔ `M:220-246`: aynı iskelet, iki ton, İKİ satırlı anlatı. */
  it("M:200/228 denge bandı iki satırlı anlatıyı ve tonu çevirir", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-entry-description"), "Kasa Devri");
    await user.selectOptions(screen.getByTestId("mu-line-account-0"), "acc-120");
    await user.selectOptions(screen.getByTestId("mu-line-account-1"), "acc-320");
    await user.type(screen.getByTestId("mu-line-debit-0"), "1000");
    await user.type(screen.getByTestId("mu-line-credit-1"), "400");

    expect(screen.getByTestId("mu-balance-strip")).toHaveClass("mu-balance--off");
    expect(screen.getByTestId("mu-balance-state")).toHaveTextContent("Fiş dengede değil");
    expect(screen.getByTestId("mu-balance-state-detail")).toHaveTextContent(
      "Borç ve alacak toplamları eşit olmadan kaydedilemez",
    );

    await user.clear(screen.getByTestId("mu-line-credit-1"));
    await user.type(screen.getByTestId("mu-line-credit-1"), "1000");
    expect(screen.getByTestId("mu-balance-strip")).toHaveClass("mu-balance--ok");
    expect(screen.getByTestId("mu-balance-state")).toHaveTextContent("Fiş dengede");
    expect(screen.getByTestId("mu-balance-state-detail")).toHaveTextContent(
      "Kaydedilmeye hazır",
    );
  });

  /** `M:57`/`:256` — fark sıfırlanmadan kaydedilemez; `M:249-251` gerekçe alt şeritte. */
  it("M:249-251 fark uyarısı YALNIZ dengesizken basılır, düğme kapalıdır", async () => {
    const user = await openCreate();
    await user.type(screen.getByTestId("mu-entry-description"), "Kasa Devri");
    await user.selectOptions(screen.getByTestId("mu-line-account-0"), "acc-120");
    await user.selectOptions(screen.getByTestId("mu-line-account-1"), "acc-320");
    await user.type(screen.getByTestId("mu-line-debit-0"), "1000");
    await user.type(screen.getByTestId("mu-line-credit-1"), "400");

    expect(screen.getByTestId("mu-entry-dialog-diff-warning")).toHaveTextContent(
      "Fark ₺600 — sıfırlanmadan fiş kaydedilemez",
    );
    expect(screen.getByTestId("mu-entry-dialog-save")).toBeDisabled();

    await user.clear(screen.getByTestId("mu-line-credit-1"));
    await user.type(screen.getByTestId("mu-line-credit-1"), "1000");
    expect(screen.queryByTestId("mu-entry-dialog-diff-warning")).toBeNull();
    expect(screen.getByTestId("mu-entry-dialog-save")).toBeEnabled();
  });

  /**
   * 🔴 `M:56`/`:255` `Taslak Kaydet` İKİNCİ DÜĞMESİ ÇİZİLMEZ — ÖLÇÜM: `POST
   * /journal-entries` fişi ZATEN `draft` üretir; `posted`a geçiren ayrı bir uç
   * vardır (`POST /journal-entries/{id}/post`) ve o düğme Taslak Fişler
   * panelindeki `Kayıtlaştır`dır. İki düğme AYNI isteği atardı.
   */
  it("M:57 kaydet düğmesi TEKtir ve 'Fişi Kaydet' der (Taslak Kaydet ikizi yok)", async () => {
    await openCreate();
    expect(screen.getByTestId("mu-entry-dialog-save")).toHaveTextContent("Fişi Kaydet");
    expect(screen.queryByRole("button", { name: "Taslak Kaydet" })).toBeNull();
  });

  it("M:105-106 detay notu ÇOK SATIRLIdır (textarea) ve şemadaki alandır", async () => {
    const user = await openCreate();
    const note = screen.getByTestId("mu-entry-detail-note");
    expect(note.tagName).toBe("TEXTAREA");
    await user.type(note, "Ziraat · TRF-1");
    expect(note).toHaveValue("Ziraat · TRF-1");
  });
});

// ---------------------------------------------------------------------------
// F-MUP · `Muhasebe - Profesyonel` (MP) düzeni — KK-10 ile Ekran 8'in YERİNE.
// ---------------------------------------------------------------------------

describe("F-MUP · MP:105-112 modül sekmeleri", () => {
  it("şerit ekrandadır ve AKTİF hap `Yevmiye`dir", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-tabs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Yevmiye" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("🔴 AYNI ANDA TEK hap aktiftir (F-SD T7 çift-aktiflik dersi)", () => {
    render(<AccountingView />);
    const active = screen
      .getAllByRole("link")
      .filter((el) => el.getAttribute("aria-current") === "page");
    expect(active).toHaveLength(1);
  });

  it("e-Fatura sekmesi SİLİNMEZ: bağlantı DEĞİL, gerekçesi EKRANDA", () => {
    render(<AccountingView />);
    expect(screen.queryByRole("link", { name: "e-Fatura" })).not.toBeInTheDocument();
    expect(screen.getByTestId("mu-tabs-reason")).toHaveTextContent(
      "e-Fatura: e-Fatura/GİB entegrasyonu ertelendi (kullanıcı kararı).",
    );
  });

  it("Banka Mutabakatı sekmesi ARTIK bir bağlantıdır (KK-10)", () => {
    render(<AccountingView />);
    expect(screen.getByRole("link", { name: "Banka Mutabakatı" })).toHaveAttribute(
      "href",
      "/muhasebe/banka-mutabakati",
    );
  });
});

describe("F-MUP · MP:114-139 BEŞ KPI kartı", () => {
  // 🔴 ONAYLI MOCKUP SAPMASI — etiketler `Toplam Gelir`/`Toplam Gider` DEĞİL.
  // Gerekçe `AccountingKpiCards` başlığındadır: alacak toplamı GELİR değildir
  // (müşteri tahsilatı 120'yi alacaklandırır ama gelir yaratmaz).
  it("borç/alacak kartları MUHASEBE adlarını taşır, gelir/gider adını DEĞİL", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-kpi-debit")).toHaveTextContent("Toplam Borç");
    expect(screen.getByTestId("mu-kpi-credit")).toHaveTextContent("Toplam Alacak");
    expect(screen.queryByText("Toplam Gelir")).not.toBeInTheDocument();
    expect(screen.queryByText("Toplam Gider")).not.toBeInTheDocument();
  });

  // 🔴 MP:104 ↔ MP:131 ölçümü: kartın dönemi sayfa döneminin BİR AY ÖNCESİ.
  it("🔴 KDV ucu ÖNCEKİ ayla çağrılır (beyanname önceki ayındır)", () => {
    render(<AccountingView />);
    // Sayfa Temmuz 2026'da; beyan Haziran 2026'nın olmalı.
    expect(vi.mocked(useVatReturn)).toHaveBeenLastCalledWith(2026, 6);
    // Yevmiye özeti ise SAYFA dönemindedir — ikisi karışmaz.
    expect(vi.mocked(useJournalSummary)).toHaveBeenLastCalledWith(2026, 7);
  });

  it("KDV kartı `/vat-return`den beslenir: tutar + VADE", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-kpi-vat")).toHaveTextContent("412.000");
    expect(screen.getByTestId("mu-kpi-vat-due")).toHaveTextContent(
      "Haziran 2026 beyanı · 28 Tem vadeli",
    );
  });

  // 🔴 "BU UÇ NEYİN KÜMESİ" dersi — e-Fatura kartına `pending_approval`
  // BAĞLANMAZ: adı "bekleyen" der ama kümesi ONAY bekleyenlerdir, GİB
  // cevabı bekleyenler değil.
  it("e-Fatura kartı SİLİNMEZ ama sayı UYDURULMAZ; gerekçesi ekrandadır", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-kpi-einvoice")).toHaveTextContent("e-Fatura Bekleyen");
    expect(screen.getByTestId("mu-kpi-einvoice")).toHaveTextContent("—");
    expect(
      screen.getByTestId("mu-kpi-einvoice-reason").textContent?.length ?? 0,
    ).toBeGreaterThan(20);
  });

  it("🔴 KDV ucu patlarsa YEVMİYE kartları YAŞAR (tek bayrak yok)", () => {
    vi.mocked(useVatReturn).mockReturnValue(
      queryError(new Error("kdv patladı")) as unknown as UseQueryResult<
        VatReturnResponse,
        Error
      >,
    );
    render(<AccountingView />);
    expect(screen.getByTestId("mu-vat-error")).toBeInTheDocument();
    expect(screen.getByTestId("mu-kpi-debit")).toHaveTextContent("3.842.600");
    expect(screen.getByTestId("mu-kpi-vat")).toHaveTextContent("—");
  });
});

describe("F-MUP · MP:165-209 sağ ray (mini mizan)", () => {
  it("mizan satırları kod + ad + kapanışla basılır", () => {
    render(<AccountingView />);
    const list = screen.getByTestId("mu-rail-list");
    expect(within(list).getByText("Bankalar")).toBeInTheDocument();
    expect(screen.getByTestId("mu-rail-amount-102")).toHaveTextContent("3.964.700");
    expect(screen.getByTestId("mu-rail-count")).toHaveTextContent("3 hesap");
  });

  // 🔴 K-MKD3 — bu turun en kritik ekran iddiası.
  it("iki tarafı da sıfır olan hesap RAYDA KALIR ve `0` basar, `—` DEĞİL", () => {
    render(<AccountingView />);
    const zero = screen.getByTestId("mu-rail-amount-100");
    expect(zero).toBeInTheDocument();
    expect(zero).toHaveTextContent("0");
    expect(zero).not.toHaveTextContent("—");
  });

  it("BOŞ mizan ile YÜKLENİYOR ayrı ayrı söylenir", () => {
    vi.mocked(useTrialBalance).mockReturnValue(queryOk({ ...RAIL, rows: [] }));
    const { unmount } = render(<AccountingView />);
    expect(screen.getByTestId("mu-rail-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("mu-rail-loading")).not.toBeInTheDocument();
    unmount();

    vi.mocked(useTrialBalance).mockReturnValue(
      queryLoading() as unknown as UseQueryResult<TrialBalanceResponse, Error>,
    );
    render(<AccountingView />);
    expect(screen.getByTestId("mu-rail-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("mu-rail-empty")).not.toBeInTheDocument();
  });

  it("e-Fatura paneli SİLİNMEZ ama SAHTE SATIR basmaz", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-einvoice-reason")).toBeInTheDocument();
    expect(screen.queryByText(/Yılmaz Elektrik/)).not.toBeInTheDocument();
    expect(screen.queryByText(/GİB Bekliyor/)).not.toBeInTheDocument();
  });
});

describe("F-MUP · MP:247-250 defter altı dönem toplamları", () => {
  it("toplamlar `journal-summary`den gelir (görünen satırlardan TOPLANMAZ)", () => {
    render(<AccountingView />);
    const foot = screen.getByTestId("mu-ledger-totals");
    expect(foot).toHaveTextContent("Dönem Borç");
    expect(foot).toHaveTextContent("3.842.600");
    expect(foot).toHaveTextContent("Dönem Alacak");
    expect(foot).toHaveTextContent("4.120.000");
  });

  it("MP:146 Excel düğmesi defter panelinin BAŞLIĞINDA ve ETKİNDİR", () => {
    render(<AccountingView />);
    const button = screen.getByTestId("mu-export");
    expect(button).toBeEnabled();
    expect(button).toHaveTextContent("Excel");
  });
});

describe("F-MUP · sağ rayın PENCERESİ sayfanınkinden farklıdır", () => {
  // 🔴 Ölçüldü (`/trial-balance` uç açıklaması): mizan penceresi BİRİKİMLİDİR
  // ("Ocak → month'un son günü"), KPI şeridi ise TEK AYIN yevmiye toplamıdır.
  // Ekran bu farkı SÖYLEMEZSE kullanıcı iki yüzeyi karşılaştırıp "tutmuyor"
  // sanır ve var olmayan bir hata arar.
  it("ray açıklaması pencereyi AÇIKÇA yazar", () => {
    render(<AccountingView />);
    expect(screen.getByTestId("mu-rail-list")).toBeInTheDocument();
    expect(screen.getByText(/yıl başından bu yana kapanış bakiyesi/i)).toBeInTheDocument();
  });

  it("ray ve KPI şeridi AYNI dönem argümanıyla çağrılır (kayma İSTEMCİDE yok)", () => {
    render(<AccountingView />);
    // Pencere farkı SUNUCUNUN sözleşmesindedir; istemci ikinci bir kaydırma
    // UYGULAMAZ (uygulasaydı iki kaynak sessizce ayrışırdı).
    expect(vi.mocked(useTrialBalance)).toHaveBeenLastCalledWith(2026, 7);
    expect(vi.mocked(useJournalSummary)).toHaveBeenLastCalledWith(2026, 7);
  });
});

/* ------------------------------------------------- EXPORT-XLSX · SIZINTI KAPISI */

/**
 * 🔴🔴 ANTI-SIZINTI BEKÇİSİ — defterin Excel'i, panelin O AN GÖSTERDİĞİ
 * pencereyi taşımak ZORUNDADIR: dönem + hesap süzgeci. "102 Bankalar"a
 * bakarken TÜM defteri indirmek, kullanıcının süzdüğünü sandığı bir sızıntıdır.
 *
 * Bekçi düğmeyi GERÇEKTEN tıklar ve GERÇEK istemciyi koşturur (`fetch`
 * sahtelenir); ekranın `useLedger` çağrısı ile indirme sorgusu YAN YANA
 * ölçülür — istemci bir süzgeci düşürürse iddia kırılır.
 */
describe("EXPORT-XLSX · Excel sorgusu = defter sorgusu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hesap süzgeci seçiliyken indirme AYNI hesabı ve dönemi taşır", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stub = stubExportDownload();
    render(<AccountingView />);
    await user.selectOptions(screen.getByTestId("mu-account-filter"), "acc-120");
    const screenFilter = vi.mocked(useLedger).mock.lastCall?.[0];
    expect(screenFilter).toMatchObject({ accountId: "acc-120" });

    // Act
    await user.click(screen.getByTestId("mu-export"));

    // Assert
    expect(stub.lastQuery()).toEqual({
      year: String(screenFilter?.year),
      month: String(screenFilter?.month),
      account_id: "acc-120",
    });
  });

  it("'Tüm Hesaplar' seçiliyken account_id GÖNDERİLMEZ", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stub = stubExportDownload();
    render(<AccountingView />);
    const screenFilter = vi.mocked(useLedger).mock.lastCall?.[0];

    // Act
    await user.click(screen.getByTestId("mu-export"));

    // Assert
    expect(stub.lastQuery()).toEqual({
      year: String(screenFilter?.year),
      month: String(screenFilter?.month),
    });
  });

  it("dönem gezgini oynayınca indirme YENİ dönemi taşır", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const stub = stubExportDownload();
    render(<AccountingView />);
    await user.click(screen.getByTestId("mu-period-prev"));
    const screenFilter = vi.mocked(useLedger).mock.lastCall?.[0];

    // Act
    await user.click(screen.getByTestId("mu-export"));

    // Assert
    expect(stub.lastQuery()).toEqual({
      year: String(screenFilter?.year),
      month: String(screenFilter?.month),
    });
  });

  it("indirme hatası YUTULMAZ — sunucunun Türkçe metni EKRANA basılır", async () => {
    // Arrange
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    stubExportDownload(errorResponse(422, { detail: "Dönem kapalı." }));
    render(<AccountingView />);

    // Act
    await user.click(screen.getByTestId("mu-export"));

    // Assert
    expect(await screen.findByTestId("mu-export-error")).toHaveTextContent("Dönem kapalı.");
  });
});

describe("IZN-F5b-A madde 4 · '+ Yevmiye Kaydı' = mali.yevmiye Düzenler (sekme başına kapı)", () => {
  function setPages(pages: Parameters<typeof meFixture>[0]) {
    vi.mocked(useSession).mockReturnValue({ me: meFixture(pages) } as ReturnType<typeof useSession>);
  }

  it("yalnız mali.yevmiye Düzenler → düğme AÇIK (accounting none olsa da)", () => {
    setPages({ pages: { "mali.yevmiye": pageGrant("edit") } });
    render(<AccountingView />);
    expect(screen.getByTestId("mu-create-entry")).toBeEnabled();
  });

  it("yalnız KARDEŞ sayfalar (hesap planı + dönem kapanışı) Düzenler, yevmiye Görür → KAPALI", () => {
    setPages({
      pages: {
        "mali.yevmiye": pageGrant("view"),
        "mali.hesap_plani": pageGrant("edit"),
        "mali.donem_kapanisi": pageGrant("edit"),
      },
    });
    render(<AccountingView />);
    expect(screen.getByTestId("mu-create-entry")).toBeDisabled();
  });
});
