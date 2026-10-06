import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type {
  PayrollLineResponse,
  PayrollPeriodDetailResponse,
  PayrollPeriodListResponse,
  PayrollPeriodListRow,
  PayrollSectionResponse,
  PayrollSummaryResponse,
  WorkerSource,
} from "@/lib/api/hooks/usePayroll";
import { usePayrollPeriod, usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import {
  useApprovePayrollPeriod,
  useComputePayrollPeriod,
  useCreatePayrollPeriod,
  usePayPayrollPeriod,
  useUpdatePayrollLineSplit,
} from "@/lib/api/hooks/usePayrollMutations";
import { downloadPayrollExport } from "@/lib/api/payroll-client";
import { BackendError } from "@/lib/api/unwrap";

import { PayrollMonthlyView } from "./PayrollMonthlyView";
import { PAYROLL_VIEW_PAGES } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/usePayroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayroll")>()),
  usePayrollPeriods: vi.fn(),
  usePayrollPeriod: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePayrollMutations", () => ({
  useUpdatePayrollLineSplit: vi.fn(),
  useApprovePayrollPeriod: vi.fn(),
  usePayPayrollPeriod: vi.fn(),
  // F-BORDRO T2/T3 — iki yeni yazma ucu. 🔴 Bu fabrika `importOriginal`
  // KULLANMAZ (üstteki `usePayroll` mock'unun aksine): eksik bir isim burada
  // sessiz `undefined` değil, açık bir "No X export is defined" hatasıdır.
  useCreatePayrollPeriod: vi.fn(),
  useComputePayrollPeriod: vi.fn(),
}));
vi.mock("@/lib/api/payroll-client", () => ({ downloadPayrollExport: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

/* ------------------------------------------------------------- fikstürler */

/**
 * 🔴 K4 — MOCKUP ARİTMETİĞİ BOZUK, fikstür KOPYALAMAZ. Ölçülen kusurlar:
 * BY:207-209 Ali Kaya 22.000 − 5.720 = 16.280 yazması gerekirken 16.080 ·
 * BY:227-229 Hasan Çelik 24.150 − 6.279 = 17.871 yerine 17.671. Buradaki
 * fikstür KENDİ İÇİNDE tutarlıdır: her satırda `brüt − kesinti = net` ve
 * `banka + elden = net`. Aşağıdaki "tutarlılık bekçisi" testi bunu iddia eder.
 */
function line(overrides: Partial<PayrollLineResponse> = {}): PayrollLineResponse {
  return {
    id: "line-company-1",
    personnel_id: "p-1",
    personnel_name: "Ayşe Demir", // BY:134
    personnel_source: "company",
    days: "21", // BY:138
    gross_amount: "37800.00", // BY:139
    deduction_amount: "11262.00", // BY:140
    net_amount: "26538.00", // BY:141 — 37.800 − 11.262 ✓
    bank_amount: "26538.00", // BY:143
    cash_amount: "0.00", // BY:146
    status: "pending", // BY:148
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

const COMPANY_LINE = line();

/** 🔴 Taşeron satırı: `excluded` — ödemeye GİRMEZ (K2/K3). */
const SUBCONTRACTOR_LINE = line({
  id: "line-sub-1",
  personnel_id: "p-2",
  personnel_name: "Mehmet Yılmaz", // BY:182
  personnel_source: "subcontractor",
  days: "22",
  gross_amount: "26400.00", // BY:187
  deduction_amount: "7064.00", // BY:188
  net_amount: "19336.00", // BY:189 — 26.400 − 7.064 ✓
  bank_amount: "10000.00", // BY:191
  cash_amount: "9336.00", // BY:194 — 10.000 + 9.336 = 19.336 ✓
  status: "excluded",
  excluded_reason: "Taşeron hakedişinden ödenir",
});

const UNCOMPUTED_LINE = line({
  id: "line-uncomputed",
  personnel_id: "p-3",
  personnel_name: "Ücretsiz Personel",
  personnel_source: "intern",
  days: null,
  gross_amount: null,
  deduction_amount: null,
  net_amount: null,
  bank_amount: null,
  cash_amount: null,
  status: "uncomputed",
});

function section(
  source: WorkerSource,
  lines: PayrollLineResponse[],
): PayrollSectionResponse {
  return { personnel_source: source, line_count: lines.length, lines };
}

function summary(overrides: Partial<PayrollSummaryResponse> = {}): PayrollSummaryResponse {
  return {
    line_count: 3,
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

function detail(
  overrides: Partial<PayrollPeriodDetailResponse> = {},
): PayrollPeriodDetailResponse {
  return {
    id: "period-7",
    year: 2026,
    month: 7, // BY:52 "Temmuz 2026"
    status: "pending_approval", // BY:63 "onay bekliyor"
    payment_due_date: "2026-07-20", // BY:63
    approved_at: null,
    paid_at: null,
    sgk_submitted_at: null,
    summary: summary(),
    sections: [
      section("company", [COMPANY_LINE]),
      section("subcontractor", [SUBCONTRACTOR_LINE]),
      section("intern", [UNCOMPUTED_LINE]),
    ],
    ...overrides,
  };
}

function periodRow(id: string, year: number, month: number): PayrollPeriodListRow {
  return {
    id,
    year,
    month,
    status: "draft",
    payment_due_date: null,
    paid_at: null,
    personnel_count: 3,
    gross_total: "0",
    sgk_employer_total: "0",
    net_total: "0",
    total_cost: "0",
  };
}

function periodList(
  rows: PayrollPeriodListRow[],
  total = rows.length,
): PayrollPeriodListResponse {
  return { items: rows, total, limit: 240, offset: 0 };
}

/* ------------------------------------------------------------------ araçlar */

function queryResult<T>(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<T, Error>;
}

function mutationResult<TData, TVars>(partial: Record<string, unknown> = {}) {
  return {
    isPending: false,
    mutateAsync: vi.fn(),
    ...partial,
  } as unknown as UseMutationResult<TData, Error, TVars>;
}

function setSession(level: string | undefined) {
  // IZN-F6a.3 · eski bordro seviyesi niyeti sayfa izni olarak kurulur (full = Düzenler + Onaylar).
  const pages = levelPages(PAYROLL_VIEW_PAGES, level === "full" ? "approve" : level);
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ pages }),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

const PERIODS = [periodRow("period-6", 2026, 6), periodRow("period-7", 2026, 7)];

beforeEach(() => {
  vi.clearAllMocks();
  setSession("full");
  vi.mocked(usePayrollPeriods).mockReturnValue(
    queryResult<PayrollPeriodListResponse>({ data: periodList(PERIODS) }),
  );
  vi.mocked(usePayrollPeriod).mockReturnValue(
    queryResult<PayrollPeriodDetailResponse>({ data: detail() }),
  );
  vi.mocked(useUpdatePayrollLineSplit).mockReturnValue(mutationResult());
  vi.mocked(useApprovePayrollPeriod).mockReturnValue(mutationResult());
  vi.mocked(usePayPayrollPeriod).mockReturnValue(mutationResult());
  vi.mocked(useCreatePayrollPeriod).mockReturnValue(mutationResult());
  vi.mocked(useComputePayrollPeriod).mockReturnValue(mutationResult());
});

/* -------------------------------------------------------------- fikstür bekçisi */

describe("🔴 K4 — fikstür tutarlılık bekçisi", () => {
  it("her satırda brüt − kesinti = net ve banka + elden = net", () => {
    // Kuruş hassasiyetiyle çalışmak için `Number` yerine TAM SAYI kuruş
    // kullanılır; bu YALNIZ testin iddiasıdır, ürün kodu para aritmetiği
    // YAPMAZ (tutarlar sunucudan string gelir ve öyle basılır).
    const kurus = (value: string) => Math.round(Number(value) * 100);
    for (const row of [COMPANY_LINE, SUBCONTRACTOR_LINE]) {
      expect(kurus(row.gross_amount ?? "0") - kurus(row.deduction_amount ?? "0")).toBe(
        kurus(row.net_amount ?? "0"),
      );
      expect(kurus(row.bank_amount ?? "0") + kurus(row.cash_amount ?? "0")).toBe(
        kurus(row.net_amount ?? "0"),
      );
    }
  });
});

/* ------------------------------------------------------------------- başlık */

describe("Aylık Bordro — başlık şeridi", () => {
  it("BY:46 breadcrumb ve BY:48 başlığı basılır", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByText("Mali · Bordro")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Bordro Yönetimi", level: 1 }),
    ).toBeInTheDocument();
  });

  it("BY:50-54 ay gezgini varsayılan olarak EN YENİ dönemi gösterir", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-period-label")).toHaveTextContent("Temmuz 2026");
    expect(vi.mocked(usePayrollPeriod)).toHaveBeenCalledWith("period-7");
  });

  it("`‹` bir önceki döneme geçer ve detay O kimlikle çekilir", async () => {
    const user = userEvent.setup();
    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-prev"));
    expect(vi.mocked(usePayrollPeriod)).toHaveBeenLastCalledWith("period-6");
  });

  it("en yeni dönemdeyken `›` devre dışıdır", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-next")).toBeDisabled();
    expect(screen.getByTestId("bordro-prev")).toBeEnabled();
  });

  it("🔴 BY:55 `Excel` GERÇEK uçtur — tıklanınca indirme çağrılır", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadPayrollExport).mockResolvedValue(undefined);
    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-export"));
    expect(vi.mocked(downloadPayrollExport)).toHaveBeenCalledWith("period-7");
  });

  it("indirme hatası ekranda görünür (yutulmaz)", async () => {
    const user = userEvent.setup();
    vi.mocked(downloadPayrollExport).mockRejectedValue(
      new BackendError(404, { detail: "Dönem bulunamadı" }),
    );
    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-export"));
    await waitFor(() =>
      expect(screen.getByTestId("bordro-export-error")).toHaveTextContent("Dönem bulunamadı"),
    );
  });
});

/* --------------------------------------------------------------- KPI + bant */

describe("BY:61-93 — bant ve KPI kartları", () => {
  it("dönem durumu ve son ödeme tarihi basılır (BY:63)", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-status")).toHaveTextContent("Onay Bekliyor");
    expect(screen.getByTestId("bordro-banner")).toHaveTextContent("20 Temmuz 2026");
  });

  it("ödeme tarihi yoksa eksiklik SÖYLENİR (uydurma tarih yok)", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ payment_due_date: null }) }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-banner")).toHaveTextContent("girilmemiş");
  });

  it("dört kart sunucunun kendi alanlarını basar", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-kpi-net-value")).toHaveTextContent("26.538");
    expect(screen.getByTestId("bordro-kpi-bank")).toHaveTextContent("100");
    expect(screen.getByTestId("bordro-kpi-cost-value")).toHaveTextContent("76.200");
  });

  it("yüzde `null` iken yüzde HİÇ basılmaz (istemci bölme yapmaz)", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({ summary: summary({ bank_pct: null }) }),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-kpi-bank")).not.toHaveTextContent("%");
  });
});

/* ------------------------------------------------------ dürüst boş/eksik hâller */

describe("🔴 K3 — dürüst hâller", () => {
  /**
   * 🔴 KARAR TERSİNE ÇEVRİLDİ (F-BORDRO T2). Bu test eskiden dönem açma
   * düğmesinin BULUNMADIĞINI iddia ediyordu ve o iddia canlıdaki kusuru
   * KORUYORDU: satır basan bir migration olmadığı için tablo boştu, boş
   * ekranda da çıkış yolu yoktu ⇒ modül kullanılamıyordu. Test SİLİNMEDİ,
   * TERSİNE ÇEVRİLDİ — boş durumun artık bir ÇIKIŞ YOLU sunması bekçilenir.
   */
  it("hiç dönem yoksa boş durum basılır ve DÖNEM AÇMA düğmesi SUNULUR", () => {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      queryResult<PayrollPeriodListResponse>({ data: periodList([]) }),
    );
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({}),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("bordro-table")).not.toBeInTheDocument();

    // Çıkış yolu: düğme VAR ve ETKİN (dönem yokluğu onu kapatmaz — kapatsaydı
    // ilk dönem hiçbir zaman açılamazdı).
    const openButton = screen.getByTestId("bordro-open-period");
    expect(openButton).toBeInTheDocument();
    expect(openButton).toBeEnabled();
    // Boş durum metni de kullanıcıyı O düğmeye yönlendirir.
    expect(screen.getByTestId("bordro-empty")).toHaveTextContent("Dönem Aç");
  });

  it("yazma izni yoksa dönem açma düğmesi DEVRE DIŞIDIR (silinmez)", () => {
    setSession("view");
    vi.mocked(usePayrollPeriods).mockReturnValue(
      queryResult<PayrollPeriodListResponse>({ data: periodList([]) }),
    );
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({}),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-open-period")).toBeDisabled();
  });

  it("`uncomputed_count` > 0 ise uyarı bandı yanar", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({ summary: summary({ uncomputed_count: 2 }) }),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-uncomputed-band")).toHaveTextContent("2 satırın");
  });

  it("🔴 bandın anahtarı `unknown_cost_count`tur (`unknown_rate_count` DEĞİL)", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({ summary: summary({ unknown_cost_count: 3 }) }),
      }),
    );
    render(<PayrollMonthlyView />);
    // F-BOR T7 · metin "N personelin ücret verisi…"den "N satırın işveren
    // maliyeti…"ye döndü: eski cümle `uncomputed_count` bandının söylediğinin
    // aynısıydı ve iki bandı tek sebebe indirgiyordu (gerekçe bileşende).
    expect(screen.getByTestId("bordro-unknown-cost-band")).toHaveTextContent("3 satırın");
  });

  it("sayaçlar sıfırken hiçbir bant yanmaz", () => {
    render(<PayrollMonthlyView />);
    expect(screen.queryByTestId("bordro-uncomputed-band")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bordro-unknown-cost-band")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bordro-excluded-band")).not.toBeInTheDocument();
  });

  it("`excluded_count` yüzeye çıkar", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({ summary: summary({ excluded_count: 29 }) }),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-excluded-band")).toHaveTextContent("29 satır");
  });

  it("liste kırpılırsa görünür sınır uyarısı basılır", () => {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      queryResult<PayrollPeriodListResponse>({ data: periodList(PERIODS, 500) }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-truncation")).toHaveTextContent("liste eksik");
  });

  it("izin yoksa erişim reddi basılır", () => {
    setSession("none");
    render(<PayrollMonthlyView />);
    expect(screen.queryByTestId("bordro-table")).not.toBeInTheDocument();
  });

  it("403 hatası da erişim reddine düşer", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        isError: true,
        error: new BackendError(403, null),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.queryByTestId("bordro-table")).not.toBeInTheDocument();
  });

  it("yükleme ve `bordro-loaded` nöbetçisi: veri gelmeden nöbetçi BASILMAZ", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({}),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("bordro-loaded")).not.toBeInTheDocument();
  });

  it("iki kaynak da çözülünce nöbetçi basılır", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-loaded")).toBeInTheDocument();
  });

  it("dönem listesi HATAYLA çözülünce de nöbetçi basılır (sonsuz yükleniyor kalmaz)", () => {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      queryResult<PayrollPeriodListResponse>({
        isError: true,
        error: new BackendError(500, null),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-loaded")).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------- tablo */

describe("BY:106-307 — gruplu tablo", () => {
  it("bölüm bantları mockup sırasında ve sunucunun sayısıyla basılır", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-section-company-band")).toHaveTextContent("ŞİRKET KADROSU");
    expect(screen.getByTestId("bordro-section-subcontractor-band")).toHaveTextContent(
      "TAŞERON İŞÇİSİ",
    );
  });

  it("🔴 `excluded` satır ayrı etiketle basılır ve `Beklemede` DEMEZ", () => {
    render(<PayrollMonthlyView />);
    const row = screen.getByTestId(`bordro-line-${SUBCONTRACTOR_LINE.id}`);
    expect(within(row).getByTestId(`bordro-line-${SUBCONTRACTOR_LINE.id}-status`)).toHaveTextContent(
      "Ödemeye Girmez",
    );
  });

  it("🔴 `excluded` satırın tutar girdileri kapalıdır ve gerekçe SATIRDAN gelir", () => {
    render(<PayrollMonthlyView />);
    const id = SUBCONTRACTOR_LINE.id;
    expect(screen.getByTestId(`bordro-line-${id}-bank`)).toBeDisabled();
    expect(screen.getByTestId(`bordro-line-${id}-cash`)).toBeDisabled();
    expect(screen.getByTestId(`bordro-line-${id}-reason`)).toHaveTextContent(
      "Taşeron hakedişinden ödenir",
    );
  });

  it("`uncomputed` satırda para hücreleri `—` basar (0 DEĞİL)", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId(`bordro-line-${UNCOMPUTED_LINE.id}-net`)).toHaveTextContent("—");
  });

  it("tfoot toplamları SUNUCUNUN özetinden gelir (satırlar yeniden toplanmaz)", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-total-net")).toHaveTextContent("26.538");
    expect(screen.getByTestId("bordro-total-bank")).toHaveTextContent("26.538");
  });

  it("tip sekmesi tabloyu süzer, TOPLAM satırı özetten gelmeye devam eder", async () => {
    const user = userEvent.setup();
    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-tab-company"));
    expect(screen.queryByTestId("bordro-section-subcontractor-band")).not.toBeInTheDocument();
    expect(screen.getByTestId("bordro-total-net")).toHaveTextContent("26.538");
  });

  it("🔴 enum tamlığı — sunucu `general` bölümü dönerse sekme ve bant görünür", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({
          sections: [
            section("company", [COMPANY_LINE]),
            section("general", [line({ id: "line-general", personnel_source: "general" })]),
          ],
        }),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-tab-general")).toHaveTextContent("Genel İşçi");
    expect(screen.getByTestId("bordro-section-general-band")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ BOR-GUN · gün */

/**
 * 🔴 BOR-GUN (2026-08-30) — BY:138 Gün sütununun BİÇİMİ.
 *
 * Kusur canlıydı: PUAN-SAAT-3 `days`i `int` → `Decimal` yapmıştı, JSON'da
 * Decimal STRING gelir ve hücre HAM basıyordu → ekranda `23.00`. Mockup
 * BY:138/155 düz `21`/`23` çizer, BY:254 ise `—`. Dört kapı da yeşil geçti
 * çünkü tip iki tarafta da `string | null`tır.
 *
 * Bu bekçi üç ayrı iddiayı ayrı ayrı tutar; hiçbiri ötekinin yerine geçmez.
 */
function daysCellText(lineId: string): string | null {
  return screen.getByTestId(`bordro-line-${lineId}-days`).textContent;
}

function detailWithDays(days: string | null): PayrollPeriodDetailResponse {
  return detail({
    sections: [section("company", [line({ id: "line-days", days })])],
  });
}

function renderWithDays(days: string | null) {
  vi.mocked(usePayrollPeriod).mockReturnValue(
    queryResult<PayrollPeriodDetailResponse>({ data: detailWithDays(days) }),
  );
  render(<PayrollMonthlyView />);
}

describe("🔴 BOR-GUN — BY:138 Gün sütunu", () => {
  it("D1 · TAM SAYI gün ONDALIKSIZ basılır (`\"23.00\"` → `23`)", () => {
    renderWithDays("23.00");
    // 🔴 `toHaveTextContent` DÜĞÜMÜN TAMAMINA bakar ve `"23"` iddiası
    // `"23.00"` içinde de geçerdi — mutasyon (biçimlendiriciyi kaldır) SAĞ
    // KALIRDI. Bu yüzden hücrenin TAM metni karşılaştırılır.
    expect(daysCellText("line-days")).toBe("23");
  });

  it("D1 pozitif kontrol · `null` gün hâlâ `—` basar (0 DEĞİL)", () => {
    // `null` = "hesaplanamadı" (BY:254 serbest/taşeron satırı). Biçimlendirici
    // `null`ı SAYIYA çevirseydi burada `0` görünürdü.
    renderWithDays(null);
    expect(daysCellText("line-days")).toBe("—");
  });

  it("D2 · YARIM gün KORUNUR (`\"22.50\"` → `22,5`)", () => {
    // Adam-gün artık `saat ÷ 9` türevidir (PUAN-SAAT-1); yarım gün GERÇEK bir
    // değerdir. `Math.round`a çevirmek bu iddiayı kırar.
    renderWithDays("22.50");
    expect(daysCellText("line-days")).toBe("22,5");
  });

  it("D2 pozitif kontrol · tam sayıda ondalık BASILMAZ", () => {
    renderWithDays("21");
    expect(daysCellText("line-days")).toBe("21");
  });

  it("D3 · ondalık ayracı mockup'la AYNI (virgül; nokta DEĞİL)", () => {
    // `Ayarlar - Bordro Oranları.dc.html` `34,50` yazar — ürünün ayracı tr-TR
    // virgülüdür. Ayracı (ya da `format.ts`teki LOCALE'i) oynatan mutasyon
    // burada kırmızı verir.
    renderWithDays("22.50");
    const text = daysCellText("line-days") ?? "";
    expect(text).toContain(",");
    expect(text).not.toContain(".");
  });
});

/* ------------------------------------------------------------- mutasyonlar */

describe("🔴 K7 — mutasyonlar, tek uçuş ve atlama sayaçları", () => {
  it("satır düzenlemesi BANKA ve ELDEN alanlarını BİRLİKTE gönderir", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue(COMPANY_LINE);
    vi.mocked(useUpdatePayrollLineSplit).mockReturnValue(mutationResult({ mutateAsync }));
    render(<PayrollMonthlyView />);

    const bank = screen.getByTestId(`bordro-line-${COMPANY_LINE.id}-bank`);
    await user.clear(bank);
    await user.type(bank, "20000");
    await user.tab();
    await user.tab(); // odak satırdan çıkar → kayıt

    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith({
        lineId: COMPANY_LINE.id,
        bankAmount: "20000",
        cashAmount: "0.00",
      }),
    );
  });

  it("mutasyon beklerken satırın İKİ girdisi de kapalıdır (çift gönderim yok)", () => {
    vi.mocked(useUpdatePayrollLineSplit).mockReturnValue(mutationResult({ isPending: true }));
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId(`bordro-line-${COMPANY_LINE.id}-bank`)).toBeDisabled();
    expect(screen.getByTestId(`bordro-line-${COMPANY_LINE.id}-cash`)).toBeDisabled();
  });

  it("BY:303 `Tümünü Onayla` → `/approve`; ÜÇ atlama sayacı kullanıcıya gösterilir", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      period_status: "approved",
      approved: 12,
      skipped_uncomputed: 2,
      skipped_excluded: 29,
      skipped_already_approved: 0,
    });
    vi.mocked(useApprovePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));
    render(<PayrollMonthlyView />);

    await user.click(screen.getByTestId("bordro-approve-all"));
    expect(mutateAsync).toHaveBeenCalledWith("period-7");
    await waitFor(() => {
      const result = screen.getByTestId("bordro-action-result");
      expect(result).toHaveTextContent("12");
      expect(result).toHaveTextContent("2 hesaplanamadığı için atlanan");
      expect(result).toHaveTextContent("29 taşeron olduğu için atlanan");
    });
  });

  it("onay hatası ekranda görünür", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new BackendError(409, { detail: "Dönem zaten onaylı" }));
    vi.mocked(useApprovePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));
    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-approve-all"));
    await waitFor(() =>
      expect(screen.getByTestId("bordro-action-error")).toHaveTextContent("Dönem zaten onaylı"),
    );
  });

  it("🔴 BY:56 `Ödemeyi Onayla` yalnız `approved` dönemde AÇIKTIR ve `/pay` çağırır", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      period_status: "paid",
      paid_at: "2026-07-20T10:00:00Z",
      paid: 12,
      paid_net_total: "26538.00",
      skipped_unapproved: 1,
      skipped_uncomputed: 0,
      skipped_excluded: 29,
    });
    vi.mocked(usePayPayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ status: "approved" }) }),
    );
    render(<PayrollMonthlyView />);

    expect(screen.getByTestId("bordro-pay")).toBeEnabled();
    await user.click(screen.getByTestId("bordro-pay"));
    expect(mutateAsync).toHaveBeenCalledWith("period-7");
    await waitFor(() =>
      expect(screen.getByTestId("bordro-action-result")).toHaveTextContent(
        "1 onaylanmadığı için ödenmeyen",
      ),
    );
  });

  it("dönem `pending_approval` iken ödeme düğmesi kapalıdır (uç 409 verirdi)", () => {
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-pay")).toBeDisabled();
  });

  it("dönem onaylıyken `Tümünü Onayla` kapanır ve gerekçe GÖRÜNÜR", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ status: "approved" }) }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-approve-all")).toBeDisabled();
    expect(screen.getByTestId("bordro-approve-all-reason")).toHaveTextContent("zaten onaylı");
  });

  /**
   * 🔴 KRIT-BORDRO — ödenecek satırı olmayan dönemde `Tümünü Onayla` KAPALIDIR.
   *
   * Ölçülen canlı kusur: puantaj girilmemiş dönemde düğme AÇIKTI; iki tık
   * dönemi `approved` yapıyor, `compute` (409) ve satır `PATCH` (409) kapanıyor,
   * `DELETE` ucu olmadığı ve UQ `(year, month)` aynı ayı ikinci kez açtırmadığı
   * için o ayın bordrosu elle SQL dışında kurtarılamaz hâle geliyordu.
   *
   * 🔴 Düğme SİLİNMEZ, devre dışı basılır ve gerekçe GÖRÜNÜR (K11): sebebi
   * söylenmeyen bir pasif düğme kullanıcıya yapması gereken işi anlatmaz.
   */
  it("🔴 ödenecek satırı olmayan dönemde `Tümünü Onayla` KAPALI ve gerekçe GÖRÜNÜR", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({
          status: "draft",
          sections: [
            section("subcontractor", [SUBCONTRACTOR_LINE]),
            section("intern", [UNCOMPUTED_LINE]),
          ],
        }),
      }),
    );
    render(<PayrollMonthlyView />);

    expect(screen.getByTestId("bordro-approve-all")).toBeDisabled();
    expect(screen.getByTestId("bordro-approve-all-reason")).toHaveTextContent(
      "Dönemde ödenecek satır yok",
    );
  });

  it("🔴 hiç satırı olmayan (hesaplanmamış) dönemde de `Tümünü Onayla` KAPALI", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({ status: "draft", sections: [] }),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-approve-all")).toBeDisabled();
  });

  /**
   * 🔴 KARŞIT KANIT (K-IKIZ1). Bu olmadan `approveDisabledReason`ı her zaman
   * bir metin döndürecek şekilde bozmak da testleri yeşil geçirirdi: düğmenin
   * KAPANDIĞINI gösteren testler, AÇILDIĞINI göstermez.
   */
  it("🔴 POZİTİF KONTROL — ödenebilir satırı OLAN dönemde `Tümünü Onayla` AÇIK", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({
          status: "draft",
          sections: [
            section("company", [COMPANY_LINE]),
            section("subcontractor", [SUBCONTRACTOR_LINE]),
            section("intern", [UNCOMPUTED_LINE]),
          ],
        }),
      }),
    );
    render(<PayrollMonthlyView />);

    expect(screen.getByTestId("bordro-approve-all")).toBeEnabled();
    expect(screen.queryByTestId("bordro-approve-all-reason")).toBeNull();
  });

  it("mutasyon beklerken onay düğmesi kilitlidir", () => {
    vi.mocked(useApprovePayrollPeriod).mockReturnValue(mutationResult({ isPending: true }));
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-approve-all")).toBeDisabled();
  });

  it("salt-okur kullanıcı hiçbir yazma yüzeyine erişemez", () => {
    setSession("view");
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId(`bordro-line-${COMPANY_LINE.id}-bank`)).toBeDisabled();
    expect(screen.getByTestId("bordro-approve-all")).toBeDisabled();
    expect(screen.getByTestId("bordro-pay")).toBeDisabled();
  });
});

/* ------------------------------------------------------- ödeme özet kutuları */

describe("🔴 K11 — BY:311-330 uçsuz düğmeler", () => {
  it("iki düğme de devre dışıdır ve gerekçe ÖĞEDEN türer", () => {
    render(<PayrollMonthlyView />);
    const bankBox = screen.getByTestId("bordro-paybox-bank");
    const cashBox = screen.getByTestId("bordro-paybox-cash");
    expect(within(bankBox).getByRole("button", { name: "EFT Talimatı Gönder" })).toBeDisabled();
    expect(within(cashBox).getByRole("button", { name: "Makbuz Oluştur" })).toBeDisabled();
    expect(screen.getByTestId("bordro-paybox-bank-reason")).toHaveTextContent(
      "Banka entegrasyonu yok",
    );
    expect(screen.getByTestId("bordro-paybox-cash-reason")).toHaveTextContent(
      "Makbuz üretme ucu yok",
    );
  });
});

/* ══ F-BORDRO T3 · Hesapla ══════════════════════════════════════════════════ */

describe("🔴 F-BORDRO T3 — Hesapla", () => {
  it("draft ve pending_approval dönemde ETKİNDİR", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ status: "draft" }) }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-compute")).toBeEnabled();
  });

  it("approved/paid dönemde DEVRE DIŞIDIR ve gerekçe OKUNUR (K11)", () => {
    // 🔴 Kapı `service.py` LOCKED_PERIOD_STATUSES'ten ölçüldü: uç 409 döner.
    // Düğme SİLİNMEZ — silinseydi kullanıcı neden hesaplayamadığını bilemezdi.
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ status: "paid" }) }),
    );
    render(<PayrollMonthlyView />);
    const button = screen.getByTestId("bordro-compute");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("ödendi"));
    // K11: gerekçe yalnız `title`da SAKLANMAZ, GÖRÜNÜR de basılır.
    expect(screen.getByTestId("bordro-compute-reason")).toHaveTextContent("ödendi");
  });

  it("başarılı hesap sayaçları GÖSTERİR (sessiz atlama yok)", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      created: 7,
      updated: 0,
      skipped_overridden: 2,
      skipped_approved: 1,
      missing_prior_period_count: 0,
    });
    vi.mocked(useComputePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));

    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-compute"));

    const result = await screen.findByTestId("bordro-action-result");
    expect(result).toHaveTextContent("7");
    // Korunan satırlar AYRI AYRI görünür.
    expect(result).toHaveTextContent("2 elle düzeltildiği için korunan");
    expect(result).toHaveTextContent("1 onaylı/ödenmiş olduğu için korunan");
  });

  it("🔴 K4 — eksik önceki dönem sayacı BANT yakar", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      created: 3,
      updated: 0,
      skipped_overridden: 0,
      skipped_approved: 0,
      missing_prior_period_count: 2,
    });
    vi.mocked(useComputePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));

    render(<PayrollMonthlyView />);
    expect(screen.queryByTestId("bordro-missing-prior-band")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("bordro-compute"));

    // Sayaç sıfırdan büyük ⇒ kümülatif matrah EKSİK olabilir; kullanıcı
    // sayıları "doğru" sanmamalıdır.
    const band = await screen.findByTestId("bordro-missing-prior-band");
    expect(band).toHaveTextContent("2 dönem");
  });

  it("dönem değişince K4 bandı ESKİ döneme YAPIŞMAZ", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      created: 3,
      updated: 0,
      skipped_overridden: 0,
      skipped_approved: 0,
      missing_prior_period_count: 2,
    });
    vi.mocked(useComputePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));

    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-compute"));
    expect(await screen.findByTestId("bordro-missing-prior-band")).toBeInTheDocument();

    await user.click(screen.getByTestId("bordro-prev"));
    expect(screen.queryByTestId("bordro-missing-prior-band")).not.toBeInTheDocument();
  });

  it("sayaç 0 iken K4 bandı BASILMAZ (gürültü yok)", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      created: 3,
      updated: 0,
      skipped_overridden: 0,
      skipped_approved: 0,
      missing_prior_period_count: 0,
    });
    vi.mocked(useComputePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));

    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-compute"));

    await screen.findByTestId("bordro-action-result");
    expect(screen.queryByTestId("bordro-missing-prior-band")).not.toBeInTheDocument();
  });

  it("🔴 409 SESSİZCE YUTULMAZ — sunucunun gerekçesi basılır", async () => {
    const user = userEvent.setup();
    // Yarış: dönem bu arada başka bir kullanıcı tarafından onaylanmış olabilir.
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new Error("Onaylanmış veya ödenmiş dönem yeniden hesaplanamaz."));
    vi.mocked(useComputePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));

    render(<PayrollMonthlyView />);
    await user.click(screen.getByTestId("bordro-compute"));

    expect(await screen.findByTestId("bordro-action-error")).toBeInTheDocument();
    expect(screen.queryByTestId("bordro-action-result")).not.toBeInTheDocument();
  });
});

/* ══ F-BORDRO T2 · dönem açma diyaloğunun bağlanması ════════════════════════ */

describe("🔴 F-BORDRO T2 — Dönem Aç bağlantısı", () => {
  it("düğme diyaloğu açar", async () => {
    const user = userEvent.setup();
    render(<PayrollMonthlyView />);
    expect(screen.queryByTestId("bordro-open-submit")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("bordro-open-period"));

    expect(await screen.findByTestId("bordro-open-submit")).toBeInTheDocument();
  });

  it("açılan dönem SEÇİLİ hâle gelir (kullanıcı açtığı ayı görür)", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({ id: "period-6" });
    vi.mocked(useCreatePayrollPeriod).mockReturnValue(mutationResult({ mutateAsync }));

    render(<PayrollMonthlyView />);
    // Varsayılan seçim EN YENİ dönemdir (period-7 · Temmuz).
    expect(screen.getByTestId("bordro-period-label")).toHaveTextContent("Temmuz 2026");

    await user.click(screen.getByTestId("bordro-open-period"));
    await user.click(await screen.findByTestId("bordro-open-submit"));

    // Açılan dönem seçildi ⇒ gezgin oraya atladı.
    await waitFor(() =>
      expect(screen.getByTestId("bordro-period-label")).toHaveTextContent("Haziran 2026"),
    );
  });
});

/* ══ F-BORDONEM · başlık düğme yerleşimi (FDA:102-156) ══════════════════════ */

describe("🔴 F-BORDONEM — başlıktaki düğme şeridi", () => {
  /**
   * 🔴 SIRA BİR TASARIM KARARIDIR VE YAPIYA ÇAKILIR.
   *
   * FDA:104 sırayı yazıyor: *"Dönem seçicinin sağında, Ödeme Yap'ın solunda —
   * sıra: aç → hesapla → öde"*; `Excel`in kanonik yeri ise BY:55, yani ay
   * gezgininin hemen sağı. Eski hâlde `Excel` üçlünün ORTASINA giriyordu.
   *
   * İddia METNE değil DOM SIRASINA bağlanır: etiketler değişse bile yerleşim
   * bekçisi ayakta kalır (etiket-tabanlı negatif iddia kanonu).
   */
  it("şeridin sırası: gezgin → Excel → Dönem Aç → Hesapla → Ödemeyi Onayla", () => {
    render(<PayrollMonthlyView />);
    const strip = screen.getByTestId("bordro-stepper").parentElement!;
    const order = Array.from(strip.children).map((node) =>
      node.getAttribute("data-testid"),
    );
    expect(order).toEqual([
      "bordro-stepper",
      "bordro-export",
      "bordro-open-period",
      "bordro-compute",
      "bordro-pay",
    ]);
  });

  it("FDA:117 · satırı OLMAYAN dönemde etiket `Hesapla` ve düğme BİRİNCİLDİR", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({ status: "draft", sections: [] }),
      }),
    );
    render(<PayrollMonthlyView />);
    const button = screen.getByTestId("bordro-compute");
    expect(button).toHaveTextContent("Hesapla");
    expect(button).not.toHaveTextContent("Yeniden Hesapla");
    expect(button.className).toContain("btn--primary");
  });

  it("FDA:134 · satırı OLAN dönemde etiket `Yeniden Hesapla` ve düğme İKİNCİLDİR", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ status: "draft" }) }),
    );
    render(<PayrollMonthlyView />);
    const button = screen.getByTestId("bordro-compute");
    expect(button).toHaveTextContent("Yeniden Hesapla");
    expect(button.className).toContain("btn--secondary");
  });

  /**
   * 🔴 Etiket DURUMDAN değil SATIRIN VARLIĞINDAN türer. `pending_approval`
   * ama satırsız bir dönem (uç `compute` çağrılmadan durumu ilerletebilir)
   * ayrışma noktasıdır: durumdan türetilseydi burada "Yeniden Hesapla" yazar
   * ve kullanıcıya hiç var olmamış satırları YENİDEN hesaplattığını söylerdi.
   */
  it("🔴 AYRIŞMA NOKTASI · `pending_approval` ama SATIRSIZ dönemde etiket `Hesapla` kalır", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({
        data: detail({ status: "pending_approval", sections: [] }),
      }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-compute")).not.toHaveTextContent("Yeniden Hesapla");
  });

  it("FDA:152 · kilitli dönemde düğme pasif + KİLİT ikonu taşır (emoji DEĞİL)", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ status: "approved" }) }),
    );
    render(<PayrollMonthlyView />);
    const button = screen.getByTestId("bordro-compute");
    expect(button).toBeDisabled();
    // Yapısal iddia: ikon bir SVG'dir. `🔒` basılsaydı `fonts.css`in hiçbir
    // `unicode-range`i onu kapsamadığı için kare turdan tura oynardı.
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  /**
   * 🔴 Kilit ikonu PASİFLİKTEN türetilmez: `computeReason` "dönem seçilmemiş"
   * yüzünden de dolar. Boş ekranda kilit basılsaydı sebep YANLIŞ olurdu.
   */
  it("🔴 dönem HİÇ YOKKEN düğme pasiftir ama kilit ikonu YOKTUR", () => {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      queryResult<PayrollPeriodListResponse>({ data: periodList([]) }),
    );
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: undefined }),
    );
    render(<PayrollMonthlyView />);
    const button = screen.getByTestId("bordro-compute");
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toBeNull();
  });

  it("açık dönemde kilit ikonu YOKTUR", () => {
    vi.mocked(usePayrollPeriod).mockReturnValue(
      queryResult<PayrollPeriodDetailResponse>({ data: detail({ status: "draft" }) }),
    );
    render(<PayrollMonthlyView />);
    expect(screen.getByTestId("bordro-compute").querySelector("svg")).toBeNull();
  });
});
