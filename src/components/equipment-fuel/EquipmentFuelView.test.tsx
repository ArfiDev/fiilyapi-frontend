import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";

import { EquipmentFuelView } from "./EquipmentFuelView";
import { useSession } from "@/components/shell/SessionProvider";
import { useEquipment } from "@/lib/api/hooks/useEquipment";
import type { EquipmentListResponse, EquipmentResponse } from "@/lib/api/hooks/useEquipment";
import { useEquipmentFuelSummary } from "@/lib/api/hooks/useEquipmentFuelSummary";
import type {
  FuelSummaryResponse,
  FuelSummaryRow,
} from "@/lib/api/hooks/useEquipmentFuelSummary";
import { useEquipmentFuelLogs } from "@/lib/api/hooks/useEquipmentFuelLogs";
import type { FuelLogListResponse } from "@/lib/api/hooks/useEquipmentFuelLogs";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { ALL_PAGE_KEYS, meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

// F-MK T5 · M4 (`/makine/yakit`) ekranının davranış iddiaları. Odak, spec'in
// KIRMIZI kararlarıdır: §0 (toplam sunucudan) · K3 (`null` ⇒ "—", ÖZELLİKLE
// `lt_km` normlu ekipmanda sapma) · K2 (rozet istemcide hesaplanmaz) ·
// K10 (yakıt girişi devre-dışı + gerekçe).

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/makine/yakit",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useEquipmentFuelSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipmentFuelSummary")>()),
  useEquipmentFuelSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipmentFuelLogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipmentFuelLogs")>()),
  useEquipmentFuelLogs: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEquipment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEquipment")>()),
  useEquipment: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/useUserOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useUserOptions")>()),
  useUserOptions: vi.fn(),
}));

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

function fuelRow(overrides: Partial<FuelSummaryRow> = {}): FuelSummaryRow {
  return {
    equipment_id: "eq-1",
    equipment_name: "Tower Crane TC-48",
    site_id: "site-1",
    liters: "840.00",
    amount: "33348.00",
    actual: "4.50",
    norm: "4.20",
    deviation_pct: "7.00",
    deviation_reason: null,
    consumption_status: "warning",
    ...overrides,
  };
}

/**
 * 🔴 K3'ün EN KRİTİK satırı — `lt_km` normlu ekipmanda (mockup'taki Damperli
 * Kamyon) sunucu `deviation_pct: null` + `deviation_reason: "no_distance_data"`
 * döner. Mockup ORADA "%16 yüksek" çiziyor ama bu SAHTE bir mockup sabitidir
 * (§0) — ekran hiçbir yerde "%16" basmamalıdır.
 */
function truckRow(): FuelSummaryRow {
  return fuelRow({
    equipment_id: "eq-3",
    equipment_name: "Damperli Kamyon",
    liters: "620.00",
    amount: "24614.00",
    actual: null,
    norm: "3.20",
    deviation_pct: null,
    deviation_reason: "no_distance_data",
    consumption_status: null,
  });
}

function summary(overrides: Partial<FuelSummaryResponse> = {}): FuelSummaryResponse {
  return {
    year: 2026,
    month: 7,
    total_liters: "2840.00",
    total_amount: "112800.00",
    lt_per_hour_avg: "6.60",
    avg_unit_price: "39.70",
    abnormal_count: 2,
    rows: [fuelRow(), truckRow()],
    ...overrides,
  };
}

const LOGS: FuelLogListResponse = {
  items: [
    {
      id: "log-1",
      equipment_id: "eq-1",
      fuel_date: "2026-07-17",
      site_id: "site-1",
      liters: "45.00",
      unit_price: "39.70",
      amount: "1787.00",
      entered_by_id: "user-1",
      note: null,
      created_at: "2026-07-17T16:00:00Z",
    },
  ],
  total: 1,
  limit: 200,
  offset: 0,
};

const EQUIPMENT_ITEMS = [
  { id: "eq-1", name: "Tower Crane TC-48", norm_unit: "lt_hour" },
  { id: "eq-3", name: "Damperli Kamyon", norm_unit: "lt_km" },
] as unknown as EquipmentResponse[];

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams("year=2026&month=7");
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useEquipmentFuelSummary).mockReturnValue(queryStub(summary()));
  vi.mocked(useEquipmentFuelLogs).mockReturnValue(queryStub(LOGS));
  vi.mocked(useEquipment).mockReturnValue(
    queryStub({
      items: EQUIPMENT_ITEMS,
      total: 2,
      limit: 200,
      offset: 0,
    } as EquipmentListResponse),
  );
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [{ siteId: "site-1", projectId: "p-1", label: "Güneşkent A-Blok" }],
    isLoading: false,
    isError: false,
  });
  vi.mocked(useUserOptions).mockReturnValue({
    ...queryStub([{ id: "user-1", full_name: "H. Çelik", title: null }]),
    options: [{ id: "user-1", full_name: "H. Çelik", title: null }],
    isForbidden: false,
  } as ReturnType<typeof useUserOptions>);
});

describe("EquipmentFuelView — M4 iskeleti", () => {
  it("mockup başlığı + aktif sekme basılır, kabuk YENİDEN çizilmez", () => {
    render(<EquipmentFuelView />);
    expect(screen.getByRole("heading", { name: "Yakıt Takibi", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Yakıt Takibi" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("dört blok da basılır (KPI · tüketim listesi · trend paneli · günlük tablo)", () => {
    render(<EquipmentFuelView />);
    expect(screen.getByTestId("makine-yakit-kpi")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-consumption")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-trend")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-log-table")).toBeInTheDocument();
  });

  it("her bağımsız veri kaynağı KENDİ 'yüklendi' izini bırakır", () => {
    render(<EquipmentFuelView />);
    expect(screen.getByTestId("makine-yakit-loaded-summary")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-loaded-logs")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-loaded-equipment")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-loaded-sites")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-loaded-users")).toBeInTheDocument();
  });

  it("izinsiz kullanıcı erişim reddi görür", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<EquipmentFuelView />);
    expect(
      screen.queryByRole("heading", { name: "Yakıt Takibi", level: 1 }),
    ).not.toBeInTheDocument();
  });
});

describe("resolveSiteLabel — şantiye sorgusu hataya düşerse fail-open YASAK", () => {
  it("siteOptions.isError iken atanmış bir kayıt için de YANLIŞ 'Şantiye atanmadı' BASILMAZ", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: true,
    });
    render(<EquipmentFuelView />);
    // log-1 kaydı site-1'e atanmış (LOGS fikstürü); sorgu hataya düşmüş
    // olsa bile bu ASLA "Şantiye atanmadı" olarak okunamaz — nötr metin
    // (Yükleniyor…) basılmalıdır.
    const rows = screen.getAllByTestId("makine-yakit-log-row");
    expect(rows[0]).not.toHaveTextContent("Şantiye atanmadı");
    expect(rows[0]).toHaveTextContent("Yükleniyor…");
  });
});

describe("§0 — KPI'lar SUNUCUNUN özetidir, mockup'ın sabiti değil", () => {
  it("mockup'ın sabit sayıları hiçbir yerde geçmez (yalnız YAPI birebir)", () => {
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(
      queryStub(
        summary({
          total_liters: "999.00",
          total_amount: "777777.00",
          lt_per_hour_avg: "1.10",
          avg_unit_price: "12.34",
          abnormal_count: 9,
        }),
      ),
    );
    render(<EquipmentFuelView />);
    const kpi = screen.getByTestId("makine-yakit-kpi");
    expect(kpi).toHaveTextContent("999");
    expect(kpi).toHaveTextContent("777.777");
    expect(kpi).toHaveTextContent("9 Ekipman");
    // Mockup'ın sabitleri ("2.840 Lt" · "6,6 Lt" · "2 Ekipman") basılmaz:
    const { container } = render(<EquipmentFuelView />);
    expect(container.textContent ?? "").not.toContain("2.840");
  });
});

describe("🔴 K3 — EN KRİTİK: `lt_km` normlu ekipmanda sapma '—'dir, mockup'ın %16'sı DEĞİL", () => {
  it("Damperli Kamyon satırı '—' basar + gerekçe ipucu taşır, '%16' HİÇBİR YERDE geçmez", () => {
    const { container } = render(<EquipmentFuelView />);

    const empties = screen.getAllByTestId("makine-yakit-deviation-empty");
    expect(empties.length).toBeGreaterThan(0);
    expect(empties[0]).toHaveTextContent("—");
    expect(empties[0]).toHaveAttribute(
      "title",
      expect.stringContaining("Kilometre verisi girilmediği için"),
    );

    expect(container.textContent ?? "").not.toContain("%16");
    expect(container.textContent ?? "").not.toContain("yüksek");
  });

  it("diğer iki fail-closed gerekçesi de (norm yok · saat yok) doğru Türkçe metni taşır", () => {
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(
      queryStub(
        summary({
          rows: [
            fuelRow({
              equipment_id: "eq-4",
              deviation_pct: null,
              deviation_reason: "no_norm_consumption",
            }),
            fuelRow({
              equipment_id: "eq-5",
              deviation_pct: null,
              deviation_reason: "no_work_hours",
            }),
          ],
        }),
      ),
    );
    render(<EquipmentFuelView />);
    const empties = screen.getAllByTestId("makine-yakit-deviation-empty");
    expect(empties[0]).toHaveAttribute("title", expect.stringContaining("Norm tüketim"));
    expect(empties[1]).toHaveAttribute("title", expect.stringContaining("Çalışma saati"));
  });

  it("`actual`/`norm`/`lt_per_hour_avg`/`avg_unit_price` null iken '—' basar, '0' basmaz", () => {
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(
      queryStub(
        summary({
          lt_per_hour_avg: null,
          avg_unit_price: null,
          rows: [truckRow()],
        }),
      ),
    );
    render(<EquipmentFuelView />);
    expect(screen.getByTestId("makine-yakit-kpi-lph-empty")).toHaveTextContent("—");
    expect(screen.getByTestId("makine-yakit-kpi-price-empty")).toHaveTextContent("—");

    const row = screen.getByTestId("makine-yakit-consumption-row");
    expect(row).not.toHaveTextContent("0 Lt/km");
    expect(row).not.toHaveTextContent("0,0 Lt");
  });
});

describe("K2 — rozet SUNUCUDAN gelir, istemcide eşik HESAPLANMAZ", () => {
  it("sapma yüzdesiyle TUTARSIZ bir consumption_status bile OLDUĞU GİBİ basılır", () => {
    // %2 sapma normalde "normal" sayılabilirdi ama sunucu "critical" demiş —
    // istemci kendi eşiğini uygulasaydı bu asla çıkmazdı.
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(
      queryStub(
        summary({
          rows: [
            fuelRow({
              equipment_id: "eq-6",
              deviation_pct: "2.00",
              consumption_status: "critical",
            }),
          ],
        }),
      ),
    );
    render(<EquipmentFuelView />);
    const badge = screen.getByTestId("makine-yakit-deviation-abnormal");
    expect(badge).toHaveClass("makine-yakit-consumption__deviation--danger");
    expect(badge).toHaveTextContent("%2");
  });

  it("consumption_status 'normal' iken '✓ Normal' basılır, hesaplanan bir yüzde DEĞİL", () => {
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(
      queryStub(summary({ rows: [fuelRow({ consumption_status: "normal" })] })),
    );
    render(<EquipmentFuelView />);
    expect(screen.getByTestId("makine-yakit-deviation-normal")).toHaveTextContent("Normal");
  });
});

describe("K10 — yakıt girişi formu YOK: buton devre-dışı + görünür gerekçe", () => {
  it("'+ Yakıt Girişi' silinmemiş, devre-dışı ve gerekçesi erişilebilir", () => {
    render(<EquipmentFuelView />);
    const button = screen.getByTestId("makine-yakit-add-entry");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("+ Yakıt Girişi");
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason).toHaveTextContent("Yakıt girişi formunun mockup'ı henüz yok.");
  });

  it("kayıt başına tüketim sütunu da devre-dışı: '—' + gerekçe, hesaplanan bir rozet DEĞİL", () => {
    render(<EquipmentFuelView />);
    const cell = screen.getByTestId("makine-yakit-log-consumption-empty");
    expect(cell).toHaveTextContent("—");
    expect(cell).toHaveAttribute("title", expect.stringContaining("Kayıt başına"));
  });

  it("aylık trend paneli de devre-dışı + gerekçe, silinmedi", () => {
    render(<EquipmentFuelView />);
    expect(screen.getByTestId("makine-yakit-trend-disabled")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-trend")).toHaveTextContent(
      "Aylık yakıt trendi ucu sunucuda yok",
    );
  });
});

describe("boş durum + yükleme durumu", () => {
  it("veri yokken boş-durum notları basılır", () => {
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(queryStub(summary({ rows: [] })));
    vi.mocked(useEquipmentFuelLogs).mockReturnValue(
      queryStub({ items: [], total: 0, limit: 200, offset: 0 }),
    );
    render(<EquipmentFuelView />);
    expect(screen.getByTestId("makine-yakit-consumption-empty")).toBeInTheDocument();
    expect(screen.getByTestId("makine-yakit-log-empty")).toBeInTheDocument();
  });

  it("yükleniyorken sahte sıfır DEĞİL, '—' ve 'Yükleniyor…' basılır", () => {
    vi.mocked(useEquipmentFuelSummary).mockReturnValue(
      queryStub<FuelSummaryResponse>(undefined, { isLoading: true }),
    );
    vi.mocked(useEquipmentFuelLogs).mockReturnValue(
      queryStub<FuelLogListResponse>(undefined, { isLoading: true }),
    );
    render(<EquipmentFuelView />);
    expect(screen.getAllByText("Yükleniyor…").length).toBeGreaterThan(0);
    expect(screen.getByTestId("makine-yakit-kpi")).not.toHaveTextContent("0 Lt");
    expect(screen.queryByTestId("makine-yakit-loaded-summary")).not.toBeInTheDocument();
  });
});
