import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { PurchaseOrderResponse } from "@/lib/api/hooks/usePurchaseOrders";
import type { PurchaseRequestListRow } from "@/lib/api/hooks/usePurchaseRequests";
import type { PurchasingSummaryResponse } from "@/lib/api/hooks/usePurchasingSummary";
import type { PurchaseQuoteCard } from "@/lib/api/hooks/useQuotes";
import type { HiddenCategory } from "@/lib/api/models";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { PurchaseOrdersKpiStrip } from "./PurchaseOrdersKpiStrip";
import { PurchaseOrdersTable } from "./PurchaseOrdersTable";
import { PurchaseRequestApprovalBox } from "./PurchaseRequestApprovalBox";
import { PurchaseRequestFormLinesCard } from "./PurchaseRequestFormLinesCard";
import { PurchaseRequestsTable } from "./PurchaseRequestsTable";
import { PurchasingKpiStrip } from "./PurchasingKpiStrip";
import { QuoteComparisonCard } from "./QuoteComparisonCard";
import { QuoteComparisonSummary } from "./QuoteComparisonSummary";
import { buildPurchaseRequestUpdateBody } from "./purchase-request-body";
import {
  createPurchaseRequestLine,
  emptyPurchaseRequestFormValues,
  type PurchaseRequestFormValues,
} from "./purchase-request-form-state";
import { buildQuoteComparison } from "./quote-comparison";

/**
 * IZN-F4d.2 — satınalma fiyatları (sözleşme `IZN-B4d-SOZLESME.md` §1/§3/§5): kategori gizliyken fiyat/tutar `null`
 * → "—"; "EN İYİ FİYAT" rozeti (`is_best_price`, sunucu damgası) GÖRÜNÜR kalır; toplam 0 SAYILMAZ; kategori gizli
 * değilse kilit YOK; kayıtlı talebin PATCH gövdesinde maskeli fiyat YOK.
 */
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api/hooks/useApprovals", () => ({
  useApprovalSettings: () => ({ data: { approval_threshold_try: "500000.00" } }),
}));

function setHidden(hidden: readonly HiddenCategory[]) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ hiddenFields: hidden }),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => setHidden([]));

function card(overrides: Partial<PurchaseQuoteCard> = {}): PurchaseQuoteCard {
  return {
    id: "q-1",
    request_id: "pr-1",
    supplier_id: "s-1",
    supplier_name: "Demirsan A.Ş.",
    unit_price: null,
    delivery_time: "3 iş günü",
    warranty_note: null,
    payment_terms: "days_30",
    shipping_included: false,
    shipping_cost: null,
    is_selected: false,
    created_at: "2026-08-11T10:00:00Z",
    total_cost: null,
    is_best_price: true,
    ...overrides,
  } as PurchaseQuoteCard;
}

describe("teklif karşılaştırması — en iyi fiyat rozeti maskeli rolde GÖRÜNÜR", () => {
  it("kart: fiyat/toplam '—', rozet ve 'Sipariş Ver' (sunucu damgası) durur", () => {
    setHidden(["maliyet_kar"]);
    render(
      <QuoteComparisonCard quote={card()} quantityUnit="Ton" canSelect isPending={false} onSelect={vi.fn()} />,
    );
    expect(screen.getByTestId("tek-best-q-1")).toHaveTextContent("EN İYİ FİYAT");
    expect(screen.getByTestId("tek-unit-price-q-1")).toHaveTextContent("—");
    expect(screen.getByTestId("tek-total-q-1")).toHaveTextContent("—");
    expect(screen.getByTestId("tek-select-q-1")).toHaveTextContent("Sipariş Ver");
    expect(screen.getByTestId("tek-shipping-q-1")).toHaveTextContent("Hariç");
  });

  it("buildQuoteComparison: toplamlar null → en yüksek/fark BELİRLENMEZ (sahte 0 yok); en düşük = sunucu rozeti", () => {
    const items = [card({ id: "a", is_best_price: true }), card({ id: "b", is_best_price: false })];
    const comparison = buildQuoteComparison(items, "328500.00");
    expect(comparison.isTotalMasked).toBe(true);
    expect(comparison.highest).toBeNull();
    expect(comparison.differenceToBudget).toBeNull();
    expect(comparison.lowest?.id).toBe("a");
  });

  it("özet: değerler '—', en düşük teklifte tedarikçi adı görünür, 'henüz teklif yok' YALAN basılmaz; başlıklarda kilit", () => {
    setHidden(["maliyet_kar"]);
    render(
      <QuoteComparisonSummary
        items={[card({ id: "a" }), card({ id: "b", supplier_name: "Çelik", is_best_price: false })]}
        estimatedTotal={null}
        quantityTotal="15.000"
        quantityUnit="Ton"
      />,
    );
    expect(screen.getByTestId("tek-summary-lowest")).toHaveTextContent("—");
    expect(screen.getByTestId("tek-summary-highest")).toHaveTextContent("—");
    expect(screen.getByTestId("tek-summary-difference")).toHaveTextContent("—");
    expect(screen.getByText("Demirsan A.Ş.")).toBeInTheDocument();
    expect(screen.queryByText("Henüz teklif yok")).not.toBeInTheDocument();
    expect(screen.queryByText("Teklif ya da bütçe yok")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(4);
  });

  it("özet: kategori gizli değilse kilit yok", () => {
    render(<QuoteComparisonSummary items={[card()]} estimatedTotal={null} quantityTotal={null} quantityUnit={null} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });
});

describe("liste / KPI — tutarlar", () => {
  const request = { id: "r", request_no: "SAT-1", request_date: "2026-08-01", priority: "normal", project_id: "p", status: "draft", estimated_total: null, line_count: 2, justification: null, can_delete: false } as unknown as PurchaseRequestListRow;
  const order = { id: "o", order_no: "SP-1", request_id: "r", request_no: "SAT-1", quote_id: "q", supplier_id: "s", supplier_name: "Demirsan", project_id: "p", total_amount: null, expected_delivery: null, status: "in_transit", note: null } as unknown as PurchaseOrderResponse;
  const summary = { active_orders: 2, orders_this_month_total: null, in_transit_orders: 1, delivered_orders: 0, open_requests: 1, quote_wait_requests: 1, pending_approval_requests: 0 } as unknown as PurchasingSummaryResponse;

  it("talep tablosu: tutar '—', başlıkta TEK kilit; gizli değil → kilit yok", () => {
    setHidden(["maliyet_kar"]);
    const { unmount } = render(
      <PurchaseRequestsTable rows={[request]} projectNames={new Map()} isLoading={false} isError={false} hasFilter={false} />,
    );
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.getByTestId("sat-row-SAT-1")).toHaveTextContent("—");
    unmount();
    setHidden([]);
    render(<PurchaseRequestsTable rows={[request]} projectNames={new Map()} isLoading={false} isError={false} hasFilter={false} />);
    expect(screen.queryByTestId("hidden-mark")).not.toBeInTheDocument();
  });

  it("sipariş tablosu: toplam '—' + başlıkta TEK kilit", () => {
    setHidden(["tum_tutarlar"]);
    render(<PurchaseOrdersTable rows={[order]} projectNames={new Map()} today={new Date(2026, 7, 1)} isLoading={false} isError={false} hasFilter={false} />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
    expect(screen.getByTestId("sip-quantity-SP-1").closest("tr")).toHaveTextContent("—");
  });

  it("iki KPI şeridi: 'Bu Ay' kartı '—' + kilit; sayaçlar açık", () => {
    setHidden(["maliyet_kar"]);
    const { unmount } = render(<PurchaseOrdersKpiStrip summary={summary} />);
    expect(within(screen.getByTestId("sip-kpi-month")).getByTestId("hidden-mark")).toBeInTheDocument();
    expect(screen.getByTestId("sip-kpi-active")).toHaveTextContent("2");
    unmount();
    render(<PurchasingKpiStrip summary={summary} />);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
  });
});

describe("talep formu — maskeli fiyat PATCH gövdesinde YOK", () => {
  const values: PurchaseRequestFormValues = {
    ...emptyPurchaseRequestFormValues("2026-08-13"),
    projectId: "p-1",
    lines: [{ ...createPurchaseRequestLine(0), stockItemId: "s-1", quantity: "15", unitPrice: "21500" }],
  };

  it("omitPrices: estimated_unit_price anahtarı HİÇ yok; varsayılan hâlde gider", () => {
    expect(buildPurchaseRequestUpdateBody(values, { omitPrices: true }).lines?.[0]).not.toHaveProperty("estimated_unit_price");
    expect(buildPurchaseRequestUpdateBody(values).lines?.[0]).toHaveProperty("estimated_unit_price", "21500");
  });

  it("satır kartı (isPriceMasked): fiyat girişi YOK ('—' + kilit), tutar/toplam '—', eksiklik notu yok", () => {
    render(
      <PurchaseRequestFormLinesCard
        values={values}
        isPriceMasked
        errors={{ lineErrors: {} } as never}
        stockRows={[]}
        stockIsLoading={false}
        stockIsError={false}
        onAddLine={vi.fn()}
        onRemoveLine={vi.fn()}
        onChangeLine={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("talep-fiyat-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("talep-fiyat-gizli-0")).toHaveTextContent("—");
    expect(screen.getByTestId("talep-tutar-0")).toHaveTextContent("—");
    expect(screen.getByTestId("talep-toplam")).toHaveTextContent("—");
    expect(screen.queryByTestId("talep-toplam-eksik")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(1);
  });

  it("onay kutusu (isPriceMasked): '₺0' hüküm cümlesi basılmaz; zincir görünür", () => {
    render(<PurchaseRequestApprovalBox lines={values.lines} isPriceMasked />);
    expect(screen.queryByTestId("talep-onay-sonuc")).not.toBeInTheDocument();
    expect(screen.getByTestId("talep-patron-adimi")).toBeInTheDocument();
  });
});
