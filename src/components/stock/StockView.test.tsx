import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { StockView } from "./StockView";
import { useStockSummary } from "@/lib/api/hooks/useStockSummary";
import { useSession } from "@/components/shell/SessionProvider";
import type { StockSummaryResponse, StockSummaryRow } from "@/lib/api/hooks/useStockSummary";
import { ALL_PAGE_KEYS, meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useStockSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useStockSummary")>()),
  useStockSummary: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// Diyaloglar bu dosyada yalnız AÇILIŞLARIYLA sınanır — ağ katmanı susturulur.
vi.mock("@/lib/api/hooks/useStockMutations", () => ({
  useCreateStockItem: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateWarehouse: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/hooks/useProjects", () => ({
  useProjects: () => ({ data: { items: [] }, isLoading: false, isError: false, error: null }),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSites: () => ({ data: { items: [] }, isLoading: false, isError: false, error: null }),
}));
// Depo diyaloğunun şantiye seçenekleri sınırlı-eşzamanlı fan-out'tan gelir.
vi.mock("@/lib/api/hooks/useSiteFanOutOptions", () => ({
  useSiteFanOutOptions: () => ({
    options: [],
    isLoading: false,
    isError: false,
    failedProjectNames: [],
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
    isPartial: false,
  }),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/stok",
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const ROWS: StockSummaryRow[] = [
  {
    id: "it-1",
    code: "SNK-0421",
    name: "Nervürlü Demir Ø12",
    category: "steel",
    unit: "Ton",
    min_stock: "10.000",
    balance: "2.400",
    status: "critical",
    last_unit_price: "32000.00",
    warehouses: [
      { warehouse_id: "wh-1", warehouse_name: "D-1 Ambar", site_id: "s-1", balance: "2.400" },
    ],
  },
];

function summary(overrides: Partial<StockSummaryResponse> = {}): StockSummaryResponse {
  return {
    items: ROWS,
    total: ROWS.length,
    limit: 200,
    offset: 0,
    kpis: {
      total_value: "3240000.00",
      critical_count: 8,
      low_count: 3,
      total_items: 247,
      items_without_price: 0,
      pending_orders: { available: false, value: null, pending_module: "procurement" },
    },
    ...overrides,
  };
}

/** React Query sonucunun 20+ alanını fikstürde yeniden üretmemek için (E12 deseni). */
function queryStub(data: unknown, extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {}) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof useStockSummary>;
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useStockSummary).mockReturnValue(queryStub(summary()));
});

describe("StockView — E3 başlık ve KPI şeridi", () => {
  it("mockup başlığı + üst etiketi basılır, kabuk YENİDEN çizilmez", () => {
    render(<StockView />);
    expect(screen.getByRole("heading", { name: "Stok & Depo" })).toBeInTheDocument();
    expect(screen.getByText("Stok & Satınalma")).toBeInTheDocument();
    // Mockup'ın kendi sol menüsü/üst barı (20-59) BASILMAZ.
    expect(screen.queryByText("Gösterge Paneli")).not.toBeInTheDocument();
  });

  it("KPI'lar sunucunun kpis zarfından gelir (72-89)", () => {
    render(<StockView />);
    const strip = screen.getByTestId("stok-kpi-strip");
    expect(strip).toHaveTextContent("₺ 3,2M");
    expect(strip).toHaveTextContent("8 Kalem");
    expect(strip).toHaveTextContent("247 Kalem");
  });

  it("'Bekleyen Sipariş' SA'ya pending: '—' + GÖRÜNÜR gerekçe (S5)", () => {
    render(<StockView />);
    const pendingValue = screen.getByTestId("stok-kpi-pending-orders");
    expect(pendingValue).toHaveTextContent("—");
    expect(pendingValue).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");
    expect(
      screen.getByTestId("stok-kpi-strip"),
    ).toHaveTextContent("Satınalma verisi bu yüzeye henüz bağlanmadı");
    // Mockup'ın örnek "12 Sipariş" değeri UYDURULMAZ.
    expect(screen.queryByText("12 Sipariş")).not.toBeInTheDocument();
  });

  it("zarf available=true dönerse sunucunun değeri OLDUĞU GİBİ basılır", () => {
    vi.mocked(useStockSummary).mockReturnValue(
      queryStub(
        summary({
          kpis: {
            ...summary().kpis,
            pending_orders: { available: true, value: "12 Sipariş", pending_module: null },
          },
        }),
      ),
    );
    render(<StockView />);
    expect(screen.getByText("12 Sipariş")).toBeInTheDocument();
    expect(screen.queryByTestId("stok-kpi-pending-orders")).not.toBeInTheDocument();
  });

  it("fiyatsız kalem varsa toplam değerin eksikliği GÖRÜNÜR yazılır", () => {
    vi.mocked(useStockSummary).mockReturnValue(
      queryStub(summary({ kpis: { ...summary().kpis, items_without_price: 2 } })),
    );
    render(<StockView />);
    expect(screen.getByTestId("stok-price-notice")).toHaveTextContent("2 kalemin birim fiyatı yok");
  });

  it("liste kırpılırsa görünür uyarı basılır (limit tavanı korkuluğu)", () => {
    vi.mocked(useStockSummary).mockReturnValue(queryStub(summary({ total: 900 })));
    render(<StockView />);
    expect(screen.getByTestId("stok-truncation-notice")).toHaveTextContent("liste eksik");
  });
});

describe("StockView — aksiyonlar", () => {
  it("'Stok Hareketi' DEVRE DIŞIdır ve gerekçesi hem title'da hem metinde durur (S2)", () => {
    render(<StockView />);
    const button = screen.getByRole("button", { name: "Stok Hareketi" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("henüz tasarlanmadı"));
    expect(screen.getByTestId("stok-movements-notice")).toBeInTheDocument();
  });

  it("'+ Malzeme Ekle' türetilmiş diyaloğu açar (S1)", () => {
    render(<StockView />);
    fireEvent.click(screen.getByRole("button", { name: "+ Malzeme Ekle" }));
    expect(screen.getByRole("dialog", { name: "Yeni Malzeme Kartı" })).toBeInTheDocument();
  });

  it("'+ Depo Ekle' mockup diyaloğunu açar (F-BLG T2c · DP 72)", () => {
    render(<StockView />);
    fireEvent.click(screen.getByRole("button", { name: "+ Depo Ekle" }));
    expect(screen.getByRole("dialog", { name: "Yeni Depo Ekle" })).toBeInTheDocument();
  });

  it("yazma izni yoksa iki tetikleyici de BASILMAZ (devre dışı düğme kalır)", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "view") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<StockView />);
    expect(screen.queryByRole("button", { name: "+ Malzeme Ekle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Depo Ekle" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stok Hareketi" })).toBeDisabled();
  });

  it("izinsiz kullanıcı erişim reddi görür", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<StockView />);
    expect(screen.queryByRole("heading", { name: "Stok & Depo" })).not.toBeInTheDocument();
  });
});

describe("StockView — süzgeçler SUNUCUYA gider", () => {
  it("liste her zaman AÇIK limit tavanıyla istenir", () => {
    render(<StockView />);
    expect(vi.mocked(useStockSummary).mock.calls[0][0]).toEqual({ limit: 200 });
  });

  it("durum segmenti URL'e yazılır ve sorguya taşınır", () => {
    render(<StockView />);
    fireEvent.click(screen.getByRole("button", { name: "Kritik" }));
    expect(replaceMock).toHaveBeenCalledWith("/stok?durum=critical", { scroll: false });

    replaceMock.mockClear();
    searchParams = new URLSearchParams({ durum: "critical" });
    render(<StockView />);
    const lastCall = vi.mocked(useStockSummary).mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ limit: 200, status: "critical" });
  });

  it("'Tümü' süzgeci URL'den DÜŞÜRÜR", () => {
    searchParams = new URLSearchParams({ durum: "critical" });
    render(<StockView />);
    fireEvent.click(screen.getByRole("button", { name: "Tümü" }));
    expect(replaceMock).toHaveBeenCalledWith("/stok", { scroll: false });
  });

  it("kategori seçimi sorguya taşınır (şema enum'u)", () => {
    searchParams = new URLSearchParams({ kategori: "steel" });
    render(<StockView />);
    expect(vi.mocked(useStockSummary).mock.calls[0][0]).toEqual({ limit: 200, category: "steel" });
  });

  it("arama metni ?q= olarak SUNUCUYA gider (istemci süzmesi YOK)", () => {
    render(<StockView />);
    fireEvent.change(screen.getByLabelText("Malzeme ara"), { target: { value: "demir" } });
    expect(replaceMock).toHaveBeenCalledWith("/stok?q=demir", { scroll: false });

    searchParams = new URLSearchParams({ q: "demir" });
    render(<StockView />);
    expect(vi.mocked(useStockSummary).mock.calls.at(-1)?.[0]).toEqual({ limit: 200, q: "demir" });
  });

  it("URL'deki tanınmayan süzgeç değerleri sorguya SIZMAZ", () => {
    searchParams = new URLSearchParams({ durum: "low", kategori: "boya" });
    render(<StockView />);
    expect(vi.mocked(useStockSummary).mock.calls[0][0]).toEqual({ limit: 200 });
  });
});
