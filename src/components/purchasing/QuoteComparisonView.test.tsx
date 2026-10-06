import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

import { QuoteComparisonView } from "./QuoteComparisonView";
import { usePurchaseRequest } from "@/lib/api/hooks/usePurchaseRequests";
import { useQuotes } from "@/lib/api/hooks/useQuotes";
import { useSelectQuoteAndOrder } from "@/lib/api/hooks/useQuoteMutations";
import { downloadQuoteComparisonExport } from "@/lib/api/purchase-quote-client";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { PurchaseRequestResponse } from "@/lib/api/hooks/usePurchaseRequests";
import type { PurchaseQuoteCard, PurchaseQuoteListResponse } from "@/lib/api/hooks/useQuotes";
import { ALL_PAGE_KEYS, meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/usePurchaseRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePurchaseRequests")>()),
  usePurchaseRequest: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useQuotes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useQuotes")>()),
  useQuotes: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useQuoteMutations", () => ({
  useSelectQuoteAndOrder: vi.fn(),
  useCreateQuote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/purchase-quote-client", () => ({
  downloadQuoteComparisonExport: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({
  useProjects: () => ({
    data: { items: [{ id: "p-1", name: "Liman Altyapı" }] },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));
vi.mock("@/lib/api/hooks/useSuppliers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSuppliers")>()),
  useSuppliers: () => ({ data: { items: [] }, isLoading: false, isError: false, error: null }),
}));

const REQUEST_ID = "pr-1";

function card(overrides: Partial<PurchaseQuoteCard> = {}): PurchaseQuoteCard {
  return {
    id: "q-1",
    request_id: REQUEST_ID,
    supplier_id: "sup-1",
    supplier_name: "Demirsan A.Ş.",
    unit_price: "21500.00",
    delivery_time: "3 iş günü",
    warranty_note: "TS 708 standart",
    payment_terms: "days_30",
    shipping_included: true,
    shipping_cost: null,
    is_selected: false,
    created_at: "2026-08-11T10:00:00Z",
    total_cost: "322500.00",
    is_best_price: true,
    ...overrides,
  };
}

const CARDS: PurchaseQuoteCard[] = [
  card(),
  card({
    id: "q-2",
    supplier_id: "sup-2",
    supplier_name: "Çelik Metalurji Ltd.",
    unit_price: "22900.00",
    total_cost: "343500.00",
    is_best_price: false,
    shipping_included: false,
    shipping_cost: "8000.00",
    payment_terms: "cash",
    delivery_time: "5 iş günü",
  }),
  card({
    id: "q-3",
    supplier_id: "sup-3",
    supplier_name: "Anadolu Demir Çelik",
    unit_price: "23500.00",
    total_cost: "352500.00",
    is_best_price: false,
    delivery_time: "Yarın sabah",
    payment_terms: "days_15",
  }),
];

const REQUEST: PurchaseRequestResponse = {
  id: REQUEST_ID,
  request_no: "SAT-2026-0042",
  request_date: "2026-07-14",
  priority: "urgent",
  project_id: "p-1",
  site_id: null,
  section_id: null,
  needed_by: "2026-07-19",
  justification: "Stok kritik",
  status: "quote_wait",
  quote_deadline: null,
  approved_by_user_id: null,
  approved_at: null,
  rejected_at: null,
  rejection_reason: null,
  created_by_user_id: "u-1",
  created_at: "2026-07-14T09:00:00Z",
  estimated_total: "328500.00",
  can_delete: false,
  lines: [
    {
      id: "prl-1",
      sort_order: 0,
      stock_item_id: "it-1",
      stock_item_code: "DMR-12",
      free_text_name: null,
      free_text_unit: null,
      name: "Nervürlü Demir Ø12",
      unit: "Ton",
      quantity: "15.000",
      estimated_unit_price: "21900.00",
      line_total: "328500.00",
      current_stock: "2.000",
    },
  ],
};

function quotesList(
  overrides: Partial<PurchaseQuoteListResponse> = {},
): PurchaseQuoteListResponse {
  return { items: CARDS, total: CARDS.length, request_quantity_total: "15.000", ...overrides };
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
  } as unknown as ReturnType<typeof useQuotes>;
}

const mutateMock = vi.fn();

/**
 * Onay düğmesi DİYALOĞUN İÇİNDEDİR — sayfada aynı adı taşıyan başka düğmeler
 * de vardır (başlıktaki 39 ve vurgulu kartın 72'si). Kapsam daraltılmazsa
 * eşleşme çok anlamlı olur.
 */
function confirmButton(): HTMLElement {
  return within(screen.getByRole("dialog")).getByRole("button", { name: "Sipariş Ver" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(usePurchaseRequest).mockReturnValue(
    queryStub(REQUEST) as unknown as ReturnType<typeof usePurchaseRequest>,
  );
  vi.mocked(useQuotes).mockReturnValue(queryStub(quotesList()));
  vi.mocked(useSelectQuoteAndOrder).mockReturnValue({
    mutate: mutateMock,
    isPending: false,
  } as unknown as ReturnType<typeof useSelectQuoteAndOrder>);
});

describe("QuoteComparisonView — TEK başlık ve talep özeti (34-50)", () => {
  it("başlığı ve breadcrumb'ı mockup'a göre basar", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByRole("heading", { name: "Teklif Karşılaştırması" })).toBeInTheDocument();
    expect(screen.getByText("← Satınalma & Teklif")).toBeInTheDocument();
    expect(screen.getByText(/Nervürlü Demir Ø12 – SAT-2026-0042/)).toBeInTheDocument();
  });

  it("özet şeridi talep DETAYINDAN gelir; uydurma alan yoktur (44-50)", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    const strip = screen.getByTestId("tek-request-strip");
    expect(strip.textContent).toContain("Nervürlü Demir Ø12");
    expect(screen.getByTestId("tek-strip-quantity").textContent).toBe("15 Ton");
    expect(strip.textContent).toContain("Liman Altyapı");
    expect(strip.textContent).toContain("14.07.2026");
    expect(screen.getByTestId("tek-priority").textContent).toBe("Acil");
  });

  it("kalemler karışık birimdeyse miktara birim YAZMAZ", () => {
    vi.mocked(usePurchaseRequest).mockReturnValue(
      queryStub({
        ...REQUEST,
        lines: [
          REQUEST.lines[0],
          { ...REQUEST.lines[0], id: "prl-2", unit: "m", name: "NYY Kablo" },
        ],
      }) as unknown as ReturnType<typeof usePurchaseRequest>,
    );
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-strip-quantity").textContent).toBe("15");
    // Çok kalemli talepte "ana malzeme" seçilmez.
    expect(screen.getByTestId("tek-request-strip").textContent).toContain("2 kalem");
  });

  it("403 yanıtında erişim reddedilir", () => {
    vi.mocked(useQuotes).mockReturnValue(
      queryStub(undefined, { isError: true, error: new BackendError(403, {}) }),
    );
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(
      screen.queryByRole("heading", { name: "Teklif Karşılaştırması" }),
    ).not.toBeInTheDocument();
  });
});

describe("QuoteComparisonView — kartlar (53-116)", () => {
  it("'EN İYİ FİYAT' rozeti YALNIZ sunucunun damgaladığı kartta basılır", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-best-q-1")).toBeInTheDocument();
    expect(screen.queryByTestId("tek-best-q-2")).not.toBeInTheDocument();
    expect(screen.queryByTestId("tek-best-q-3")).not.toBeInTheDocument();
  });

  it("damga BAŞKA karta taşınırsa rozet de taşınır (istemci yeniden hesaplamaz)", () => {
    vi.mocked(useQuotes).mockReturnValue(
      queryStub(
        quotesList({
          items: [
            // Birim fiyatı EN DÜŞÜK olan kart; sunucu onu damgalamadı.
            card({ id: "q-1", unit_price: "1.00", total_cost: "999999.00", is_best_price: false }),
            card({ id: "q-2", supplier_name: "Çelik", is_best_price: true }),
          ],
        }),
      ),
    );
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.queryByTestId("tek-best-q-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("tek-best-q-2")).toBeInTheDocument();
  });

  it("'EN HIZLI' rozeti HER kartta devre dışı + gerekçelidir (100)", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    const badge = screen.getByTestId("tek-fastest-q-3");
    expect(badge.getAttribute("aria-disabled")).toBe("true");
    expect(badge.title).toBe("Teslim süresi sıralaması henüz yok (serbest metin)");
  });

  it("kart alanlarını sunucudan birebir basar (63-70)", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-unit-price-q-1").textContent).toBe("₺ 21.500");
    expect(screen.getByTestId("tek-total-q-1").textContent).toBe("₺ 322.500");
    expect(screen.getByTestId("tek-delivery-q-3").textContent).toBe("Yarın sabah");
    expect(screen.getByTestId("tek-shipping-q-1").textContent).toBe("Dahil");
    expect(screen.getByTestId("tek-shipping-q-2").textContent).toBe("Hariç (+₺ 8.000)");
  });

  it("teklif yoksa mockup'ın örnek kartlarını BASMAZ", () => {
    vi.mocked(useQuotes).mockReturnValue(queryStub(quotesList({ items: [], total: 0 })));
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.queryByText("Demirsan A.Ş.")).not.toBeInTheDocument();
    expect(screen.getByTestId("tek-empty")).toBeInTheDocument();
  });
});

describe("QuoteComparisonView — karşılaştırma özeti (119-127)", () => {
  it("dört kutuyu ELDEKİ verilerden türetir", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-summary-lowest").textContent).toBe("₺ 322.500");
    expect(screen.getByTestId("tek-summary-highest").textContent).toBe("₺ 352.500");
    expect(screen.getByTestId("tek-summary-budget").textContent).toBe("₺ 328.500");
    expect(screen.getByTestId("tek-summary-difference").textContent).toBe("-₺ 6.000");
    expect(screen.getByText("Bütçenin altında")).toBeInTheDocument();
  });

  it("`total_cost`un çarpanı (talep miktarı) görünür kalır", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-summary-quantity").textContent).toBe("15 Ton");
  });
});

describe("QuoteComparisonView — 'Sipariş Ver' (select-and-order)", () => {
  it("onay diyalogu OLMADAN sipariş atmaz", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    fireEvent.click(screen.getByTestId("tek-select-q-2"));
    expect(mutateMock).not.toHaveBeenCalled();
    expect(screen.getByText("Siparişi onaylıyor musunuz?")).toBeInTheDocument();
  });

  it("onaydan sonra sunucuya TEKLİF kimliği gider", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    fireEvent.click(screen.getByTestId("tek-select-q-2"));
    fireEvent.click(confirmButton());
    expect(mutateMock).toHaveBeenCalledWith("q-2", expect.anything());
  });

  it("başarıda doğan siparişin NUMARASI görünür uyarıda basılır", async () => {
    mutateMock.mockImplementation((_id: string, options: { onSuccess: (o: unknown) => void }) => {
      options.onSuccess({ order_no: "SP-2026-0101" });
    });
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    fireEvent.click(screen.getByTestId("tek-select-q-1"));
    fireEvent.click(confirmButton());
    await waitFor(() =>
      expect(screen.getByTestId("tek-order-result").textContent).toContain("SP-2026-0101"),
    );
  });

  it("başlıktaki 'Sipariş Ver' sunucunun damgaladığı teklifi hedefler", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    fireEvent.click(screen.getByTestId("tek-order-best"));
    fireEvent.click(confirmButton());
    expect(mutateMock).toHaveBeenCalledWith("q-1", expect.anything());
  });

  it("beraberlikte başlık düğmesi keyfi teklif SEÇMEZ", () => {
    vi.mocked(useQuotes).mockReturnValue(
      queryStub(
        quotesList({
          items: [card({ id: "q-1" }), card({ id: "q-2", supplier_name: "Çelik" })],
        }),
      ),
    );
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    const button = screen.getByTestId("tek-order-best");
    expect(button).toBeDisabled();
    expect(button.title).toContain("Birden çok teklif aynı toplamda");
  });

  it("talep zaten sipariş edilmişse ikinci seçim engellenir", () => {
    vi.mocked(usePurchaseRequest).mockReturnValue(
      queryStub({ ...REQUEST, status: "ordered" }) as unknown as ReturnType<
        typeof usePurchaseRequest
      >,
    );
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-select-q-2")).toBeDisabled();
    expect(screen.getByTestId("tek-order-best")).toBeDisabled();
    expect(screen.getByTestId("tek-select-q-2").title).toBe(
      "Bu talep için sipariş zaten oluşturulmuş.",
    );
  });

  it("seçilmiş teklif ayrı gösterilir ve yeniden seçilemez", () => {
    vi.mocked(useQuotes).mockReturnValue(
      queryStub(quotesList({ items: [card({ is_selected: true })] })),
    );
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-selected-q-1")).toBeInTheDocument();
    expect(screen.queryByTestId("tek-select-q-1")).not.toBeInTheDocument();
  });

  it("yazma yetkisi yoksa seçim ve teklif girişi kapalıdır", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "view") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    expect(screen.getByTestId("tek-select-q-2")).toBeDisabled();
    expect(screen.queryByTestId("tek-add-quote")).not.toBeInTheDocument();
  });
});

describe("QuoteComparisonView — Excel ve teklif girişi", () => {
  it("Excel düğmesi ikili indirme istemcisini çağırır (38)", async () => {
    vi.mocked(downloadQuoteComparisonExport).mockResolvedValue(undefined);
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    fireEvent.click(screen.getByTestId("tek-export"));
    await waitFor(() =>
      expect(downloadQuoteComparisonExport).toHaveBeenCalledWith(REQUEST_ID),
    );
  });

  it("indirme hatası SESSİZ değildir — sunucunun cümlesi basılır", async () => {
    vi.mocked(downloadQuoteComparisonExport).mockRejectedValue(
      new BackendError(403, { detail: "Bu talebe erişim yetkiniz yok." }),
    );
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    fireEvent.click(screen.getByTestId("tek-export"));
    await waitFor(() =>
      expect(screen.getByTestId("tek-action-error").textContent).toContain(
        "Bu talebe erişim yetkiniz yok.",
      ),
    );
  });

  it("'+ Teklif Ekle' türetilmiş diyaloğu açar (spec K5)", () => {
    render(<QuoteComparisonView requestId={REQUEST_ID} />);
    fireEvent.click(screen.getByTestId("tek-add-quote"));
    expect(screen.getByText("Yeni Teklif")).toBeInTheDocument();
  });
});
