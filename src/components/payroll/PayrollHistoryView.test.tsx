import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { CompanyRead } from "@/lib/api/models";
import { useCompany } from "@/lib/api/hooks/useCompany";
import type {
  PayrollPeriodListResponse,
  PayrollPeriodListRow,
} from "@/lib/api/hooks/usePayroll";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import { errorResponse, stubExportDownload } from "@/lib/api/export-test-stub";
import { BackendError } from "@/lib/api/unwrap";

import { PayrollHistoryView } from "./PayrollHistoryView";
import { PAYROLL_VIEW_PAGES } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("next/navigation", () => ({ usePathname: () => "/bordro/gecmis" }));
vi.mock("@/lib/api/hooks/usePayroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayroll")>()),
  usePayrollPeriods: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

/* ------------------------------------------------------------- fikstürler */

/**
 * 🔴 K4 — MOCKUP ARİTMETİĞİ BOZUK, fikstür KOPYALAMAZ: BG:108 tfoot'u
 * "2026 Toplam (7 Ay)" derken tbody'de BEŞ satır vardır (BG:50-104) ve tutar
 * toplamları da satırlarla tutmaz. Buradaki fikstür kendi içinde tutarlıdır ve
 * toplamlar SATIRLARDAN türetilir.
 */
function row(overrides: Partial<PayrollPeriodListRow> = {}): PayrollPeriodListRow {
  return {
    id: "period-7",
    year: 2026,
    month: 7, // BG:51 "Temmuz 2026"
    status: "pending_approval", // BG:58 "Bekliyor"
    payment_due_date: "2026-07-20", // BG:57
    paid_at: null,
    personnel_count: 48, // BG:52
    gross_total: "743200.00", // BG:53
    sgk_employer_total: "148800.00", // BG:54
    net_total: "549148.00", // BG:55
    total_cost: "892000.00", // BG:56
    ...overrides,
  };
}

const JULY = row();
const JUNE = row({
  id: "period-6",
  month: 6, // BG:62 "Haziran 2026"
  status: "paid", // BG:69 "Ödendi"
  paid_at: "2026-06-20",
  payment_due_date: "2026-06-20",
  personnel_count: 46,
  gross_total: "712400.00",
  sgk_employer_total: "142480.00",
  net_total: "526380.00",
  total_cost: "854880.00",
});
const LAST_YEAR = row({
  id: "period-2025-12",
  year: 2025,
  month: 12,
  status: "paid",
  paid_at: "2025-12-20",
  personnel_count: 40,
});

function periodList(
  rows: PayrollPeriodListRow[],
  total = rows.length,
): PayrollPeriodListResponse {
  return { items: rows, total, limit: 240, offset: 0 };
}

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
  // IZN-F6a.3 · eski bordro seviyesi niyeti sayfa izni olarak kurulur (full = Düzenler + Onaylar).
  const pages = levelPages(PAYROLL_VIEW_PAGES, level === "full" ? "approve" : level);
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ pages }),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

function setPeriods(result: Record<string, unknown>) {
  vi.mocked(usePayrollPeriods).mockReturnValue(queryResult<PayrollPeriodListResponse>(result));
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession("full");
  setPeriods({ data: periodList([JUNE, JULY, LAST_YEAR]) });
  vi.mocked(useCompany).mockReturnValue(
    queryResult<CompanyRead>({ data: { name: "FİİL Yapı Ltd. Şti." } as CompanyRead }),
  );
});

/* -------------------------------------------------------------------- kapı */

describe("Bordro Geçmişi — yetki ve yükleme kapıları", () => {
  it("izin `none` ise AccessDenied basılır", () => {
    setSession("none");
    render(<PayrollHistoryView />);
    expect(screen.queryByTestId("bordro-gecmis-table")).not.toBeInTheDocument();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("403 yanıtı AccessDenied'a düşer", () => {
    setPeriods({ isError: true, error: new BackendError(403, "forbidden") });
    render(<PayrollHistoryView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("veri gelmeden yükleniyor satırı basılır, nöbetçi BASILMAZ", () => {
    setPeriods({ isLoading: true });
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("bordro-gecmis-loaded")).not.toBeInTheDocument();
  });

  it("🔴 nöbetçi ŞİRKET sorgusu da oturmadan basılmaz (erken kare yasağı)", () => {
    vi.mocked(useCompany).mockReturnValue(queryResult<CompanyRead>({ isLoading: true }));
    render(<PayrollHistoryView />);
    expect(screen.queryByTestId("bordro-gecmis-loaded")).not.toBeInTheDocument();
  });

  it("iki kaynak da oturunca nöbetçi basılır", () => {
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-loaded")).toBeInTheDocument();
  });

  it("liste hatası görünür mesaja döner", () => {
    setPeriods({ isError: true, error: new BackendError(500, "patladı") });
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-error")).toBeInTheDocument();
  });
});

/* ----------------------------------------------------------------- başlık */

describe("Bordro Geçmişi — başlık ve sekme şeridi", () => {
  it("BG:27-31 şeridi basılır ve bu ekranın sekmesi aktiftir", () => {
    render(<PayrollHistoryView />);
    expect(screen.getByRole("tab", { name: "Bordro Geçmişi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("BG:33 başlığı ve alt başlığı (şirket · yıl) basılır", () => {
    render(<PayrollHistoryView />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bordro Geçmişi");
    expect(screen.getByTestId("bordro-gecmis-subtitle")).toHaveTextContent(
      "FİİL Yapı Ltd. Şti. · 2026",
    );
  });

  it("şirket adı yüklenemezse alt başlık YALNIZ yılı yazar (zarif düşüş, ekran hataya düşmez)", () => {
    vi.mocked(useCompany).mockReturnValue(
      queryResult<CompanyRead>({ isError: true, error: new BackendError(500, "yok") }),
    );
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-subtitle")).toHaveTextContent("2026");
    expect(screen.getByTestId("bordro-gecmis-table")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------- yıl süzgeci */

describe("🔴 K6 — yıl süzgeci istemcide çalışır", () => {
  it("seçenekler GELEN VERİDEN türer (sabit liste yok)", () => {
    render(<PayrollHistoryView />);
    const select = screen.getByTestId("bordro-gecmis-year");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "2026",
      "2025",
    ]);
  });

  it("varsayılan olarak EN YENİ yılın satırları listelenir", () => {
    render(<PayrollHistoryView />);
    expect(screen.getByTestId(`bordro-gecmis-row-${JULY.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`bordro-gecmis-row-${LAST_YEAR.id}`)).not.toBeInTheDocument();
  });

  it("yıl değiştirilince tablo O yılın satırlarına düşer", async () => {
    render(<PayrollHistoryView />);
    await userEvent.selectOptions(screen.getByTestId("bordro-gecmis-year"), "2025");
    expect(screen.getByTestId(`bordro-gecmis-row-${LAST_YEAR.id}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`bordro-gecmis-row-${JULY.id}`)).not.toBeInTheDocument();
  });

  it("🔴 sunucuya uydurma `year` parametresi gönderilmez — hook parametresiz çağrılır", () => {
    render(<PayrollHistoryView />);
    expect(vi.mocked(usePayrollPeriods).mock.calls.every((call) => call.length === 0)).toBe(true);
  });
});

/* ------------------------------------------------------- kırpılma korkuluğu */

describe("🔴 K6 — kırpılma korkuluğu", () => {
  it("`total` elde olandan büyükse liste EKSİK olduğu söylenir", () => {
    setPeriods({ data: periodList([JUNE, JULY, LAST_YEAR], 500) });
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-truncation")).toHaveTextContent(
      "İlk 3 kayıt gösteriliyor (toplam 500) — liste eksik.",
    );
  });

  it("liste tamsa uyarı BASILMAZ", () => {
    render(<PayrollHistoryView />);
    expect(screen.queryByTestId("bordro-gecmis-truncation")).not.toBeInTheDocument();
  });
});

/* ----------------------------------------------------------------- tablo */

describe("Bordro Geçmişi — tablo (BG:38-104)", () => {
  it("BG:39-47 sütun başlıkları basılır", () => {
    render(<PayrollHistoryView />);
    const head = within(screen.getByTestId("bordro-gecmis-table")).getAllByRole(
      "columnheader",
    );
    expect(head.map((cell) => cell.textContent)).toEqual([
      "Dönem",
      "Çalışan",
      "Brüt Maaş",
      "SGK İşveren",
      "Net Ödenen",
      "Toplam Maliyet",
      "Ödeme Tarihi",
      "Durum",
      "Detay bağlantısı",
    ]);
  });

  it("satırlar YENİDEN ESKİYE sıralanır ve tutarlar tr-TR biçiminde basılır", () => {
    render(<PayrollHistoryView />);
    const rows = screen.getAllByTestId(/^bordro-gecmis-row-/);
    expect(rows.map((r) => r.dataset.testid)).toEqual([
      `bordro-gecmis-row-${JULY.id}`,
      `bordro-gecmis-row-${JUNE.id}`,
    ]);
    expect(rows[0]).toHaveTextContent("Temmuz 2026");
    expect(rows[0]).toHaveTextContent("743.200");
  });

  it("BG:51 'Ödeme bekliyor' satırı DURUMDAN türer, ilk satıra sabitlenmez", () => {
    render(<PayrollHistoryView />);
    expect(screen.getByTestId(`bordro-gecmis-row-${JULY.id}`)).toHaveTextContent(
      "Ödeme bekliyor",
    );
    expect(screen.getByTestId(`bordro-gecmis-row-${JUNE.id}`)).not.toHaveTextContent(
      "Ödeme bekliyor",
    );
  });

  it("ödeme tarihi: ödendiyse damga günü, aksi hâlde vade; ikisi de yoksa —", () => {
    setPeriods({
      data: periodList([
        JUNE,
        JULY,
        row({ id: "period-bos", month: 5, payment_due_date: null, paid_at: null }),
      ]),
    });
    render(<PayrollHistoryView />);
    expect(screen.getByTestId(`bordro-gecmis-date-${JULY.id}`)).toHaveTextContent("20.07.2026");
    expect(screen.getByTestId(`bordro-gecmis-date-${JUNE.id}`)).toHaveTextContent("20.06.2026");
    expect(screen.getByTestId("bordro-gecmis-date-period-bos")).toHaveTextContent("—");
  });

  it("🔴 K3 — DÖRT dönem durumunun HEPSİ etiketlenir (ham enum ekrana sızmaz)", () => {
    setPeriods({
      data: periodList([
        row({ id: "d", month: 1, status: "draft" }),
        row({ id: "p", month: 2, status: "pending_approval" }),
        row({ id: "a", month: 3, status: "approved" }),
        row({ id: "o", month: 4, status: "paid", paid_at: "2026-04-20" }),
      ]),
    });
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-status-d")).toHaveTextContent("Taslak");
    expect(screen.getByTestId("bordro-gecmis-status-p")).toHaveTextContent("Onay Bekliyor");
    expect(screen.getByTestId("bordro-gecmis-status-a")).toHaveTextContent("Onaylandı");
    expect(screen.getByTestId("bordro-gecmis-status-o")).toHaveTextContent("Ödendi");
  });

  it("BG:59 'Detay' bağlantısı Aylık Bordro ekranına gider", () => {
    render(<PayrollHistoryView />);
    const row = screen.getByTestId(`bordro-gecmis-row-${JULY.id}`);
    expect(within(row).getByRole("link", { name: "Detay" })).toHaveAttribute("href", "/bordro");
  });
});

/* ------------------------------------------------------------------ tfoot */

describe("🔴 K4 — tfoot satırlardan türer", () => {
  it("etiketteki ay sayısı SATIR SAYISINI izler (mockup'ın '7 Ay' sabiti değil)", () => {
    const { rerender } = render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-total-label")).toHaveTextContent(
      "2026 Toplam (2 Ay)",
    );

    setPeriods({ data: periodList([JUNE, JULY, row({ id: "period-5", month: 5 })]) });
    rerender(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-total-label")).toHaveTextContent(
      "2026 Toplam (3 Ay)",
    );
  });

  it("toplamlar seçili yılın satırlarından TAM toplanır", () => {
    render(<PayrollHistoryView />);
    // 743.200 + 712.400 · 148.800 + 142.480 · 549.148 + 526.380 · 892.000 + 854.880
    expect(screen.getByTestId("bordro-gecmis-total-gross")).toHaveTextContent("1.455.600");
    expect(screen.getByTestId("bordro-gecmis-total-sgk")).toHaveTextContent("291.280");
    expect(screen.getByTestId("bordro-gecmis-total-net")).toHaveTextContent("1.075.528");
    expect(screen.getByTestId("bordro-gecmis-total-cost")).toHaveTextContent("1.746.880");
    expect(screen.getByTestId("bordro-gecmis-total-avg")).toHaveTextContent("Ort. 47");
  });

  it("okunamayan tutar toplama girmez ve GÖRÜNÜR bir bant yakar", () => {
    setPeriods({ data: periodList([row({ id: "bozuk", net_total: "bilinmiyor" })]) });
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-unparsed-band")).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------- boş hâller */

describe("🔴 K3 — dürüst boş hâller", () => {
  it("hiç dönem yoksa açıklayıcı boş durum basılır ve DÖNEM AÇMA düğmesi ÇİZİLMEZ", () => {
    setPeriods({ data: periodList([]) });
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("bordro-gecmis-table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dönem aç/i })).not.toBeInTheDocument();
    // Yıl seçicisi de basılmaz: seçenek üretecek veri yoktur.
    expect(screen.queryByTestId("bordro-gecmis-year")).not.toBeInTheDocument();
  });

  it("dönem var ama SEÇİLİ yılda yoksa süzgecin kendi boş hâli basılır", async () => {
    setPeriods({ data: periodList([JULY, LAST_YEAR]) });
    const { rerender } = render(<PayrollHistoryView />);
    await userEvent.selectOptions(screen.getByTestId("bordro-gecmis-year"), "2025");
    expect(screen.getByTestId("bordro-gecmis-table")).toBeInTheDocument();

    // Seçim dururken veri tazelenir ve 2025 dönemi listeden düşer: kullanıcı
    // BOŞ bir tabloyla değil, açıklamayla karşılaşır.
    setPeriods({ data: periodList([JULY]) });
    rerender(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-empty-year")).toHaveTextContent("2025");
    expect(screen.queryByTestId("bordro-gecmis-table")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------------------ K11 uçsuz öğe */

/**
 * 🔴 EXPORT-XLSX — K11 KAPANDI: dönem-üstü uç açıldı
 * (`GET /payroll/periods/export.xlsx`) ve düğme ETKİN.
 *
 * 🔴🔴 KAPSAM SESSİZ GEÇİLMEZ: uç süzgeç ALMAZ (liste ucu da `year` almaz, yıl
 * seçici K6 gereği İSTEMCİDE süzer) ⇒ dosya ekranda görünen yıldan GENİŞtir.
 * Bunu söylemeyen bir düğme kullanıcının "2026'yı indirdim" sanmasına yol
 * açardı; kapsam notu düğmenin ALTINDA durur.
 */
describe("EXPORT-XLSX — 'Excel İndir' GERÇEK, kapsam notu GÖRÜNÜR", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("düğme ETKİNDİR ve kapsam notu ekranda durur", () => {
    render(<PayrollHistoryView />);
    expect(screen.getByTestId("bordro-gecmis-export")).toBeEnabled();
    expect(screen.getByTestId("bordro-gecmis-export-reason")).toHaveTextContent(
      "Excel TÜM dönemleri içerir",
    );
  });

  it("indirme SORGU DİZESİ TAŞIMAZ (uç süzgeç almaz)", async () => {
    // Arrange
    const user = userEvent.setup();
    const stub = stubExportDownload();
    render(<PayrollHistoryView />);

    // Act
    await user.click(screen.getByTestId("bordro-gecmis-export"));

    // Assert
    await waitFor(() => {
      expect(stub.lastUrl()).toBe("/api/backend/payroll/periods/export.xlsx");
    });
  });

  it("indirme hatası YUTULMAZ — sunucunun Türkçe metni EKRANA basılır", async () => {
    // Arrange
    const user = userEvent.setup();
    stubExportDownload(errorResponse(403, { detail: "Bordro yetkiniz yok." }));
    render(<PayrollHistoryView />);

    // Act
    await user.click(screen.getByTestId("bordro-gecmis-export"));

    // Assert
    expect(await screen.findByTestId("bordro-gecmis-export-error")).toHaveTextContent(
      "Bordro yetkiniz yok.",
    );
  });
});
