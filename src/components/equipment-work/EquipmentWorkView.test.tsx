import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { EquipmentWorkView } from "./EquipmentWorkView";
import { useSession } from "@/components/shell/SessionProvider";
import { useEquipment } from "@/lib/api/hooks/useEquipment";
import type { EquipmentListResponse, EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import { useEquipmentFuelSummary } from "@/lib/api/hooks/useEquipmentFuelSummary";
import type { FuelSummaryResponse } from "@/lib/api/hooks/useEquipmentFuelSummary";
import { useEquipmentWorkLogs } from "@/lib/api/hooks/useEquipmentWorkLogs";
import type { WorkLogListResponse } from "@/lib/api/hooks/useEquipmentWorkLogs";
import { useEquipmentWorkSummary } from "@/lib/api/hooks/useEquipmentWorkSummary";
import type {
  WorkSummaryResponse,
  WorkSummaryRow,
} from "@/lib/api/hooks/useEquipmentWorkSummary";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import type { PersonnelListItem } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { errorResponse, stubExportDownload } from "@/lib/api/export-test-stub";
import { BackendError } from "@/lib/api/unwrap";
import { ALL_PAGE_KEYS, meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

// F-MK T4 · M3 (`/makine/calisma`) ekranının davranış iddiaları. Odak, spec'in
// KIRMIZI kararlarıdır: §0 (toplam sunucudan) · K3 (`null` ⇒ "—") · K2 (yüzde
// istemcide hesaplanmaz) · K10 (kayıt ekleme devre-dışı + gerekçe).

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/makine/calisma",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentWorkSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipmentWorkSummary")>()),
  useEquipmentWorkSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipmentWorkLogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipmentWorkLogs")>()),
  useEquipmentWorkLogs: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipmentFuelSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipmentFuelSummary")>()),
  useEquipmentFuelSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipment")>()),
  useEquipment: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));

/** React Query sonucunun 20+ alanını fikstürde üretmemek için (E12 deseni). */
function queryStub<T>(
  data: T | undefined,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as UseQueryResult<T, Error>;
}

function row(overrides: Partial<WorkSummaryRow> = {}): WorkSummaryRow {
  return {
    equipment_id: "eq-1",
    equipment_name: "Tower Crane TC-48",
    site_id: "site-1",
    hours: "186.00",
    usage_pct: "93.00",
    usage_reason: null,
    breakdown_hours: "0.00",
    // M5_3 #103 — kuruşlu değer BİLEREK: `formatCurrency` (kuruşsuz) ile
    // `formatCurrencyPrecise` (2 ondalık) burada GERÇEKTEN ayrışır.
    cost: "59520.40",
    ...overrides,
  };
}

/**
 * 🔴 §0 KANITI — `totals` BİLEREK satırların toplamı DEĞİLDİR:
 * satırlar 186+42 = 228 saat / ₺59.520 + ₺9.240 = ₺68.760 eder; sunucu
 * 999 saat / ₺777.777 diyor. Ekran SUNUCUNUNKİNİ basmalıdır.
 */
function summary(overrides: Partial<WorkSummaryResponse> = {}): WorkSummaryResponse {
  return {
    year: 2026,
    month: 7,
    rows: [
      row(),
      row({
        equipment_id: "eq-2",
        equipment_name: "Beton Pompası BP-36",
        hours: "42.00",
        usage_pct: "21.00",
        breakdown_hours: "38.00",
        cost: "9240.00",
      }),
    ],
    totals: {
      hours: "999.00",
      breakdown_hours: "38.00",
      cost: "777777.30",
      usage_pct_avg: "57.70",
    },
    weeks: [
      {
        index: 1,
        start_date: "2026-07-01",
        end_date: "2026-07-05",
        hours: "84.00",
        dominant_record_type: "worked",
      },
      {
        index: 2,
        start_date: "2026-07-06",
        end_date: "2026-07-12",
        hours: "54.00",
        dominant_record_type: "breakdown",
      },
    ],
    ...overrides,
  };
}

const LOGS: WorkLogListResponse = {
  items: [
    {
      id: "log-1",
      equipment_id: "eq-1",
      work_date: "2026-07-17",
      site_id: "site-1",
      operator_id: "op-1",
      record_type: "worked",
      start_time: "06:00:00",
      end_time: "15:00:00",
      hours: "9.00",
      note: null,
      created_by_id: null,
      created_at: "2026-07-17T16:00:00Z",
    },
    {
      id: "log-2",
      equipment_id: "eq-2",
      work_date: "2026-07-16",
      site_id: "site-1",
      operator_id: null,
      record_type: "breakdown",
      start_time: null,
      end_time: null,
      hours: "8.00",
      note: "Pompa arızası",
      created_by_id: null,
      created_at: "2026-07-16T16:00:00Z",
    },
  ],
  total: 2,
  limit: 8,
  offset: 0,
};

const FUEL: FuelSummaryResponse = {
  year: 2026,
  month: 7,
  total_liters: "2840.00",
  total_amount: "112800.00",
  lt_per_hour_avg: null,
  avg_unit_price: null,
  abnormal_count: 0,
  rows: [],
};

const EQUIPMENT = {
  id: "eq-1",
  name: "Tower Crane TC-48",
} as unknown as EquipmentResponse;

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams("year=2026&month=7");
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useEquipmentWorkSummary).mockReturnValue(queryStub(summary()));
  vi.mocked(useEquipmentWorkLogs).mockReturnValue(queryStub(LOGS));
  vi.mocked(useEquipmentFuelSummary).mockReturnValue(queryStub(FUEL));
  vi.mocked(useEquipment).mockReturnValue(
    queryStub({
      items: [
        EQUIPMENT,
        { ...EQUIPMENT, id: "eq-2", name: "Beton Pompası BP-36" } as EquipmentResponse,
      ],
      total: 2,
      limit: 200,
      offset: 0,
    } as EquipmentListResponse),
  );
  vi.mocked(usePersonnel).mockReturnValue(
    queryStub({
      items: [{ id: "op-1", full_name: "H. Çelik" }] as unknown as PersonnelListItem[],
      total: 1,
      limit: 200,
      offset: 0,
    }),
  );
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [{ siteId: "site-1", projectId: "p-1", label: "Güneşkent A-Blok" }],
    isLoading: false,
    isError: false,
  });
});

describe("EquipmentWorkView — M3 iskeleti", () => {
  it("mockup başlığı + aktif sekme basılır, kabuk YENİDEN çizilmez", () => {
    render(<EquipmentWorkView />);
    expect(screen.getByRole("heading", { name: "Çalışma Kaydı", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Çalışma Kaydı" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("üç blok da basılır (özet tablo · haftalık grafik · son kayıtlar)", () => {
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-summary-table")).toBeInTheDocument();
    expect(screen.getByTestId("makine-cal-weekly")).toBeInTheDocument();
    expect(screen.getByTestId("makine-cal-recent")).toBeInTheDocument();
  });

  it("her bağımsız veri kaynağı KENDİ 'yüklendi' izini bırakır", () => {
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-loaded-summary")).toBeInTheDocument();
    expect(screen.getByTestId("makine-cal-loaded-logs")).toBeInTheDocument();
    expect(screen.getByTestId("makine-cal-loaded-fuel")).toBeInTheDocument();
    expect(screen.getByTestId("makine-cal-loaded-sites")).toBeInTheDocument();
  });

  it("son kayıtlar satırı ÜÇ ayrı kaynağı birleştirir (ekipman · şantiye · operatör)", () => {
    render(<EquipmentWorkView />);
    const recent = screen.getByTestId("makine-cal-recent");
    expect(recent).toHaveTextContent("Tower Crane TC-48"); // useEquipment
    expect(recent).toHaveTextContent("Güneşkent A-Blok"); // useSiteOptions
    expect(recent).toHaveTextContent("H. Çelik"); // usePersonnel
    expect(recent).toHaveTextContent("Arıza — 8 Saat"); // record_type
  });

  it("resolveSiteLabel — siteOptions.isError iken atanmış kayıt için YANLIŞ 'Şantiye atanmadı' BASILMAZ", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: true,
    });
    render(<EquipmentWorkView />);
    const recent = screen.getByTestId("makine-cal-recent");
    expect(recent).not.toHaveTextContent("Şantiye atanmadı");
    expect(recent).toHaveTextContent("Yükleniyor…");
  });

  /**
   * M5_3 #107 — eskiden `summaryQuery`/`logsQuery` dışındaki dört kaynak
   * (`fuelQuery` · `equipmentQuery` · `personnelQuery` · `siteOptions`)
   * hataya düşünce HİÇBİR görünür uyarı basılmıyordu; adlar/kartlar
   * gerekçesiz "—"ye düşüyordu.
   */
  it("siteOptions.isError iken GÖRÜNÜR bir uyarı basılır (sessiz '—' düşüşü YOK)", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: true,
    });
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-auxiliary-error")).toHaveTextContent(
      "yüklenemedi",
    );
  });

  it("fuelQuery/equipmentQuery/personnelQuery hatasız iken uyarı BASILMAZ", () => {
    render(<EquipmentWorkView />);
    expect(screen.queryByTestId("makine-cal-auxiliary-error")).not.toBeInTheDocument();
  });

  it("siteOptions.isError iken YÜKLENDİ izi BASILMAZ — görsel kapı yanlış olguyu yeşil geçirmez", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: true,
    });
    render(<EquipmentWorkView />);
    expect(screen.queryByTestId("makine-cal-loaded-sites")).not.toBeInTheDocument();
  });

  it("Yakıt Tüketimi kartı ŞANTİYE süzgeci açıkken 'tüm şantiyeler' gerekçesi basar (uç süzgeci almıyor)", () => {
    searchParams = new URLSearchParams("year=2026&month=7&site=site-1");
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-kpi-fuel-unfiltered")).toBeInTheDocument();
  });

  it("izinsiz kullanıcı erişim reddi görür", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<EquipmentWorkView />);
    expect(screen.queryByRole("heading", { name: "Çalışma Kaydı", level: 1 })).not.toBeInTheDocument();
  });

  // kalan-3 #413 — izin kapısının İKİNCİ bacağı: modül izni VAR ama backend
  // 403 dönerse (`isForbidden(summaryQuery.error)`) de AccessDenied basılmalı.
  // Önceki test yalnız `permissions.equipment === "none"` bacağını ölçüyordu.
  it("modul izni VARKEN ozet ucu 403 donerse yine erisim reddi (AccessDenied) gorunur", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub<WorkSummaryResponse>(undefined, {
        isLoading: false,
        isError: true,
        error: new BackendError(403, { detail: "Bu şantiyeye erişiminiz kısıtlandı." }),
      }),
    );
    render(<EquipmentWorkView />);
    expect(screen.queryByRole("heading", { name: "Çalışma Kaydı", level: 1 })).not.toBeInTheDocument();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("§0 — tfoot SUNUCUNUN toplamıdır, mockup'ın sabiti değil", () => {
  it("satırların toplamıyla ÇELİŞEN sunucu toplamı basılır", () => {
    render(<EquipmentWorkView />);
    const totals = screen.getByTestId("makine-cal-summary-totals");
    // Sunucunun dediği (satırlar 228 saat / ₺68.760 ederdi):
    expect(totals).toHaveTextContent("999");
    expect(totals).toHaveTextContent("777.777");
    expect(totals).toHaveTextContent("%57,7 ort.");
    // İstemci satırları TOPLAMIYOR:
    expect(totals).not.toHaveTextContent("228");
    expect(totals).not.toHaveTextContent("68.760");
  });

  it("mockup'ın sabit tfoot/KPI sayıları ekranın HİÇBİR yerinde geçmez", () => {
    const { container } = render(<EquipmentWorkView />);
    const text = container.textContent ?? "";
    for (const constant of ["428", "124.800", "%69", "692", "144.200"]) {
      expect(text).not.toContain(constant);
    }
  });

  it("KPI şeridi de sunucunun toplamını basar", () => {
    render(<EquipmentWorkView />);
    const kpi = screen.getByTestId("makine-cal-kpi");
    expect(kpi).toHaveTextContent("999 Saat");
    expect(kpi).toHaveTextContent("₺ 777.777");
  });

  /**
   * M5_3 #103 — KPI şeridi `formatCurrency` (0 ondalık) kullanırken tablo
   * `formatCurrencyPrecise` (2 ondalık) kullanıyordu, aynı `totals.cost`
   * iki farklı yuvarlamayla basılıyordu (M3:209 mockup'ı da 0 ondalıktır:
   * `₺ 124.800`). İkisi artık AYNI biçimlendirici.
   */
  it("tfoot toplamı KPI ile AYNI biçimdedir — kuruş EKLEMEZ (sunucu .30 gönderir)", () => {
    render(<EquipmentWorkView />);
    const totals = screen.getByTestId("makine-cal-summary-totals");
    expect(totals).toHaveTextContent("₺ 777.777");
    // `formatCurrencyPrecise` bu tutarı "777.777,3" olarak basardı.
    expect(totals).not.toHaveTextContent("777.777,3");
  });

  it("satır maliyeti de kuruşsuz basılır (mockup M3:135 — sunucu .40 gönderir)", () => {
    render(<EquipmentWorkView />);
    const rows = screen.getAllByTestId("makine-cal-summary-row");
    expect(rows[0]).toHaveTextContent("₺ 59.520");
    // `formatCurrencyPrecise` bu tutarı "59.520,4" olarak basardı.
    expect(rows[0]).not.toHaveTextContent("59.520,4");
  });
});

describe("K3 — `null` türev alan '—' basar, 0 BASMAZ", () => {
  it("`usage_pct` ve `cost` null iken '—' + Türkçe gerekçe ipucu görünür", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub(
        summary({
          rows: [
            row({
              usage_pct: null,
              usage_reason: "no_capacity_hours",
              cost: null,
              hours: "0.00",
              breakdown_hours: "0.00",
            }),
          ],
        }),
      ),
    );
    render(<EquipmentWorkView />);

    const usageCell = screen.getByTestId("makine-cal-usage-empty");
    expect(usageCell).toHaveTextContent("—");
    expect(usageCell).toHaveAttribute("title", expect.stringContaining("kapasite saati"));

    const costCell = screen.getByTestId("makine-cal-cost-empty");
    expect(costCell).toHaveTextContent("—");
    expect(costCell).toHaveAttribute("title", expect.stringContaining("bedeli tanımlı değil"));

    // Uydurma bir "%0" ya da "₺ 0" satıra KAÇMAZ.
    const rowNode = screen.getByTestId("makine-cal-summary-row");
    expect(rowNode).not.toHaveTextContent("%0");
    expect(rowNode).not.toHaveTextContent("₺ 0");
  });

  it("`usage_pct_avg` null iken tfoot ve KPI kartı '—' basar", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub(
        summary({
          totals: {
            hours: "12.00",
            breakdown_hours: "0.00",
            cost: "0.00",
            usage_pct_avg: null,
          },
        }),
      ),
    );
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-totals-usage-empty")).toHaveTextContent("—");
    expect(screen.getByTestId("makine-cal-kpi-usage-empty")).toHaveTextContent("—");
  });
});

describe("K2 — yüzde SUNUCUDAN gelir, istemcide hesaplanmaz", () => {
  it("saatle tutarsız bir `usage_pct` bile OLDUĞU GİBİ basılır", () => {
    // 4 saat çalışmış bir makineye sunucu %88 demiş: istemci `hours/kapasite`
    // hesaplasaydı bu sayı asla çıkmazdı.
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub(summary({ rows: [row({ hours: "4.00", usage_pct: "88.00" })] })),
    );
    render(<EquipmentWorkView />);
    const rowNode = screen.getByTestId("makine-cal-summary-row");
    expect(within(rowNode).getByText("%88")).toBeInTheDocument();
    expect(rowNode).toHaveTextContent("4");
  });

  it("haftalık grafik çubuğunun tonu sunucunun `dominant_record_type` damgasıdır", () => {
    render(<EquipmentWorkView />);
    const weeks = screen.getAllByTestId("makine-cal-week");
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.querySelector(".makine-cal-chart__bar--worked")).not.toBeNull();
    expect(weeks[1]?.querySelector(".makine-cal-chart__bar--breakdown")).not.toBeNull();
  });
});

describe("K10 — kayıt ekleme formu YOK: buton devre-dışı + görünür gerekçe", () => {
  it("'+ Kayıt Ekle' silinmemiş, devre-dışı ve gerekçesi erişilebilir", () => {
    render(<EquipmentWorkView />);
    const button = screen.getByTestId("makine-cal-add-record");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("+ Kayıt Ekle");
    const reason = document.getElementById(
      button.getAttribute("aria-describedby") ?? "",
    );
    expect(reason).toHaveTextContent("Çalışma kaydı giriş formunun mockup'ı henüz yok.");
  });

  /**
   * 🔴 EXPORT-XLSX: "Excel İndir" ucu AÇILDI ve düğme ETKİN. Geri kalan uçsuz
   * öğeler (haftalık/günlük görünüm, ekipman süzgeci) HÂLÂ silinmez —
   * devre dışı + görünür gerekçe.
   */
  it("Excel İndir ETKİN; görünüm/ekipman süzgeci hâlâ devre dışı + gerekçeli", () => {
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-export")).toBeEnabled();
    expect(screen.getByTestId("makine-cal-equipment-filter")).toBeDisabled();
    expect(screen.getByTestId("makine-cal-view-weekly")).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("makine-cal-filter-reasons")).toHaveTextContent(
      "yalnız aylık dönem",
    );
  });
});

describe("boş durum + yükleme durumu", () => {
  it("veri yokken boş-durum notları basılır, tablo/tfoot basılmaz", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub(summary({ rows: [], weeks: [] })),
    );
    vi.mocked(useEquipmentWorkLogs).mockReturnValue(
      queryStub({ items: [], total: 0, limit: 8, offset: 0 }),
    );
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-summary-empty")).toBeInTheDocument();
    expect(screen.getByTestId("makine-cal-recent-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("makine-cal-summary-totals")).not.toBeInTheDocument();
  });

  it("yükleniyorken sahte sıfır DEĞİL, '—' ve 'Yükleniyor…' basılır", () => {
    vi.mocked(useEquipmentWorkSummary).mockReturnValue(
      queryStub<WorkSummaryResponse>(undefined, { isLoading: true }),
    );
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(
      queryStub<FuelSummaryResponse>(undefined, { isLoading: true }),
    );
    render(<EquipmentWorkView />);
    expect(screen.getAllByText("Yükleniyor…").length).toBeGreaterThan(0);
    expect(screen.getByTestId("makine-cal-kpi")).not.toHaveTextContent("0 Saat");
    expect(screen.getByTestId("makine-cal-kpi-fuel")).toHaveTextContent("—");
    expect(screen.queryByTestId("makine-cal-loaded-summary")).not.toBeInTheDocument();
  });
});

/* ------------------------------------------------- EXPORT-XLSX · SIZINTI KAPISI */

/**
 * 🔴🔴 ANTI-SIZINTI BEKÇİSİ — Excel, EKRANIN O AN GÖSTERDİĞİ dönem + şantiye
 * penceresini taşımak ZORUNDADIR. Bir şantiyeye bakarken TÜM şantiyelerin
 * dosyasını indirmek kullanıcının süzdüğünü sandığı bir sızıntıdır.
 *
 * Bekçi düğmeyi GERÇEKTEN tıklar ve GERÇEK istemciyi koşturur (`fetch`
 * sahtelenir); ekranın `useEquipmentWorkSummary` çağrısı ile indirme sorgusu
 * YAN YANA ölçülür.
 */
describe("EXPORT-XLSX · Excel sorgusu = ekran sorgusu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("şantiye süzgeci açıkken indirme AYNI şantiyeyi ve dönemi taşır", async () => {
    // Arrange
    searchParams = new URLSearchParams("year=2026&month=7&site=s-2");
    const stub = stubExportDownload();
    render(<EquipmentWorkView />);
    const screenFilter = vi.mocked(useEquipmentWorkSummary).mock.lastCall?.[0];
    expect(screenFilter).toEqual({ year: 2026, month: 7, siteId: "s-2" });

    // Act
    fireEvent.click(screen.getByTestId("makine-cal-export"));

    // Assert
    await waitFor(() => {
      expect(stub.lastQuery()).toEqual({ year: "2026", month: "7", site_id: "s-2" });
    });
  });

  it("'Tüm Projeler' seçiliyken site_id GÖNDERİLMEZ", async () => {
    // Arrange
    const stub = stubExportDownload();
    render(<EquipmentWorkView />);

    // Act
    fireEvent.click(screen.getByTestId("makine-cal-export"));

    // Assert
    await waitFor(() => {
      expect(stub.lastQuery()).toEqual({ year: "2026", month: "7" });
    });
  });

  it("indirme hatası YUTULMAZ — sunucunun Türkçe metni EKRANA basılır", async () => {
    // Arrange
    stubExportDownload(errorResponse(403, { detail: "Makine yetkiniz yok." }));
    render(<EquipmentWorkView />);

    // Act
    fireEvent.click(screen.getByTestId("makine-cal-export"));

    // Assert
    expect(await screen.findByTestId("makine-cal-export-error")).toHaveTextContent(
      "Makine yetkiniz yok.",
    );
  });
});

describe("kalan-3 #196 — equipmentQuery hatasinda ekipman adi kalici 'Yükleniyor…' basmaz", () => {
  it("equipmentQuery hata verince ekipman adi yerine bir hata/bos metni gorunur", () => {
    vi.mocked(useEquipment).mockReturnValue(
      queryStub<EquipmentListResponse>(undefined, { isLoading: false, isError: true, error: new Error("network") }),
    );
    render(<EquipmentWorkView />);
    const recent = screen.getByTestId("makine-cal-recent");
    expect(recent).not.toHaveTextContent("Yükleniyor…");
  });
});

describe("kalan-3 #197 — bulunamayan operator 'Operatör' bolumunu gizlemez", () => {
  it("personnelNameById'de olmayan operator_id icin 'Operatör' bolumu YINE gorunur", () => {
    // op-1, LOGS.items[0].operator_id, personel listesinde YOK.
    vi.mocked(usePersonnel).mockReturnValue(
      queryStub({ items: [], total: 0, limit: 200, offset: 0 }),
    );
    render(<EquipmentWorkView />);
    const recent = screen.getByTestId("makine-cal-recent");
    expect(recent).toHaveTextContent("Operatör");
  });
});

describe("kalan-3 #198 — logsQuery hatasinda 'Son Kayıtlar' paneli sessizce bos kalmaz", () => {
  it("logsQuery hata verince panelde gorunur bir hata notu vardir", () => {
    vi.mocked(useEquipmentWorkLogs).mockReturnValue(
      queryStub<WorkLogListResponse>(undefined, { isLoading: false, isError: true, error: new Error("network") }),
    );
    render(<EquipmentWorkView />);
    expect(screen.getByTestId("makine-cal-recent-error")).toBeInTheDocument();
  });
});
