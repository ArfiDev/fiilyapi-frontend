import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PurchaseOrdersView } from "./PurchaseOrdersView";
import { usePurchaseOrders } from "@/lib/api/hooks/usePurchaseOrders";
import { usePurchasingSummary } from "@/lib/api/hooks/usePurchasingSummary";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type {
  PurchaseOrderListResponse,
  PurchaseOrderResponse,
} from "@/lib/api/hooks/usePurchaseOrders";
import type { PurchasingSummaryResponse } from "@/lib/api/hooks/usePurchasingSummary";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/usePurchaseOrders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePurchaseOrders")>()),
  usePurchaseOrders: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePurchasingSummary", () => ({ usePurchasingSummary: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({
  useProjects: () => ({
    data: { items: [{ id: "p-1", name: "Liman Altyapı" }] },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/satinalma/siparisler",
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const ORDER: PurchaseOrderResponse = {
  id: "po-1",
  order_no: "SP-2026-042",
  request_id: "pr-1",
  request_no: "SAT-2026-0042",
  quote_id: "q-1",
  supplier_id: "sup-1",
  supplier_name: "Demirsan A.Ş.",
  project_id: "p-1",
  total_amount: "322500.00",
  expected_delivery: "2026-07-19",
  status: "in_transit",
  note: null,
  created_by_user_id: "u-1",
  created_at: "2026-07-12T08:00:00Z",
};

const SUMMARY: PurchasingSummaryResponse = {
  open_requests: 8,
  quote_wait_requests: 5,
  pending_approval_requests: 2,
  orders_this_month_total: "1240000.00",
  active_orders: 8,
  in_transit_orders: 3,
  delivered_orders: 5,
};

function list(overrides: Partial<PurchaseOrderListResponse> = {}): PurchaseOrderListResponse {
  return { items: [ORDER], total: 1, limit: 200, offset: 0, ...overrides };
}

function queryStub(
  data: unknown,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof usePurchaseOrders>;
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(usePurchaseOrders).mockReturnValue(queryStub(list()));
  vi.mocked(usePurchasingSummary).mockReturnValue(
    queryStub(SUMMARY) as unknown as ReturnType<typeof usePurchasingSummary>,
  );
});

describe("PurchaseOrdersView — SIP başlık, şerit ve KPI", () => {
  it("mockup başlığını basar (32)", () => {
    render(<PurchaseOrdersView />);
    expect(screen.getByRole("heading", { name: "Siparişler" })).toBeInTheDocument();
    expect(screen.getByTestId("sip-subtitle").textContent).toContain("8 aktif sipariş");
  });

  it("ortak sekme şeridinde YALNIZ 'Siparişler' aktiftir (25-30)", () => {
    render(<PurchaseOrdersView />);
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Siparişler");
  });

  it("DÖRT KPI kartı da sunucunun kendi alanlarından gelir (38-43)", () => {
    render(<PurchaseOrdersView />);
    expect(screen.getByTestId("sip-kpi-active").textContent).toBe("8");
    // M5_3 #232 — mockup SIP:40 `₺1,24M` boşluksuz + iki ondalık basar.
    expect(screen.getByTestId("sip-kpi-month").textContent).toBe("₺1,24M");
    expect(screen.getByTestId("sip-kpi-transit").textContent).toBe("3");
    expect(screen.getByTestId("sip-kpi-delivered").textContent).toBe("5");
  });

  it("özet gelmediğinde sahte sıfır BASMAZ", () => {
    vi.mocked(usePurchasingSummary).mockReturnValue(
      queryStub(undefined) as unknown as ReturnType<typeof usePurchasingSummary>,
    );
    render(<PurchaseOrdersView />);
    expect(screen.getByTestId("sip-kpi-active").textContent).toBe("—");
  });

  it("403 yanıtında erişim reddedilir", () => {
    vi.mocked(usePurchaseOrders).mockReturnValue(
      queryStub(undefined, { isError: true, error: new BackendError(403, {}) }),
    );
    render(<PurchaseOrdersView />);
    expect(screen.queryByRole("heading", { name: "Siparişler" })).not.toBeInTheDocument();
  });

  it("liste kırpıldığında sınır göstergesi basar", () => {
    vi.mocked(usePurchaseOrders).mockReturnValue(queryStub(list({ total: 420 })));
    render(<PurchaseOrdersView />);
    expect(screen.getByTestId("sip-truncation-notice").textContent).toContain("toplam 420");
  });
});

describe("PurchaseOrdersView — durum süzgeci (34)", () => {
  it("mockup'ın dört seçeneğini SIRASIYLA basar", () => {
    render(<PurchaseOrdersView />);
    const options = Array.from(
      screen.getByTestId("sip-status-filter").querySelectorAll("option"),
    ).map((option) => option.textContent);
    expect(options).toEqual(["Tüm Durumlar", "Yolda", "Onaylandı", "Teslim Edildi"]);
  });

  it("seçim URL'e yazılır (paylaşılabilir bağlantı)", () => {
    render(<PurchaseOrdersView />);
    fireEvent.change(screen.getByTestId("sip-status-filter"), {
      target: { value: "delivered" },
    });
    expect(replaceMock).toHaveBeenCalledWith("/satinalma/siparisler?durum=delivered", {
      scroll: false,
    });
  });

  it("'Tüm Durumlar' seçimi anahtarı URL'den DÜŞÜRÜR", () => {
    searchParams = new URLSearchParams("durum=delivered");
    render(<PurchaseOrdersView />);
    fireEvent.change(screen.getByTestId("sip-status-filter"), { target: { value: "" } });
    expect(replaceMock).toHaveBeenCalledWith("/satinalma/siparisler", { scroll: false });
  });

  it("URL'deki durum SUNUCUYA gider — istemcide süzülmez", () => {
    searchParams = new URLSearchParams("durum=in_transit");
    render(<PurchaseOrdersView />);
    expect(vi.mocked(usePurchaseOrders).mock.calls[0][0]).toMatchObject({
      status: "in_transit",
      limit: 200,
    });
  });

  it("tanınmayan durum sunucuya YOLLANMAZ (422 kapısı)", () => {
    searchParams = new URLSearchParams("durum=uydurma");
    render(<PurchaseOrdersView />);
    expect(vi.mocked(usePurchaseOrders).mock.calls[0][0]).not.toHaveProperty("status");
  });
});

describe("PurchaseOrdersView — çizilmemiş yüzeyler (spec K4)", () => {
  it("'+ Sipariş Oluştur' devre dışıdır ve gerekçesi görünür (35)", () => {
    render(<PurchaseOrdersView />);
    const button = screen.getByTestId("sip-create-order");
    expect(button).toBeDisabled();
    expect(button.title).toBe("Doğrudan sipariş formu henüz çizilmedi");
  });

  it("kaynağı olmayan sütunlar tek bantta ADIYLA sayılır", () => {
    render(<PurchaseOrdersView />);
    const notice = screen.getByTestId("sip-pending-notice").textContent ?? "";
    expect(notice).toContain("Malzeme");
    expect(notice).toContain("Miktar");
    expect(notice).toContain("Detay");
  });
});
