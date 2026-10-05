import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { InvoiceDetailResponse } from "@/lib/api/hooks/useInvoiceDetail";
import type { InvoiceResponse, InvoiceSummaryResponse } from "@/lib/api/hooks/useInvoices";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { IncomingInvoicesTable } from "./IncomingInvoicesTable";
import { InvoiceKpiStrip } from "./InvoiceKpiStrip";
import { InvoiceLinesTable } from "./InvoiceLinesTable";
import { OutgoingInvoicesTable } from "./OutgoingInvoicesTable";
import { vatDifferenceHint } from "./invoice-labels";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(hidden: Parameters<typeof meFixture>[0]) {
  vi.mocked(useSession).mockReturnValue({ me: meFixture(hidden), isLoading: false } as ReturnType<
    typeof useSession
  >);
}

beforeEach(() => {
  vi.clearAllMocks();
  session({ hiddenFields: ["tum_tutarlar", "satis_alici"] });
});

function maskedInvoice(): InvoiceResponse {
  return {
    id: "inv-1",
    invoice_no: "FAT-1",
    direction: "outgoing",
    party_name: null,
    party_tax_number: null,
    issue_date: "2026-07-01",
    due_date: null,
    status: "draft",
    advance_amount: null,
    retention_amount: null,
    subtotal: null,
    tax_base: null,
    total: null,
    vat_amount: null,
    withholding_amount: null,
  } as unknown as InvoiceResponse;
}

describe("IZN-F4b.2 · fatura listeleri", () => {
  it("giden: tutarlar ve taraf adı null → '—'; para sütun başlığında TEK kilit (satırda değil)", () => {
    render(<OutgoingInvoicesTable rows={[maskedInvoice()]} isLoading={false} errorMessage={undefined} />);
    const row = screen.getByTestId("fat-outgoing-row");
    expect(within(row).queryByText(/₺/)).toBeNull();
    expect(row.textContent).not.toMatch(/\d,\d\d|\d{3}\.\d{3}/);
    expect(within(row).getAllByTestId("hidden-mark")).toHaveLength(1); // yalnız taraf adı (satis_alici)
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(4); // + Matrah/KDV/Toplam başlıkları
  });

  it("gelen: taraf adı null → '—' (+ kilit), toplam null → '—'", () => {
    render(
      <IncomingInvoicesTable
        rows={[{ ...maskedInvoice(), direction: "incoming" } as InvoiceResponse]}
        isLoading={false}
        errorMessage={undefined}
        onApprove={vi.fn()}
        approvingId={null}
        canWrite
        writeDisabledReason=""
        tab="gelen"
      />,
    );
    const row = screen.getByTestId("fat-incoming-row");
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });

  it("kategori gizli DEĞİLKEN null → '—' ama kilit YOK", () => {
    session({ hiddenFields: [] });
    render(<OutgoingInvoicesTable rows={[maskedInvoice()]} isLoading={false} errorMessage={undefined} />);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });
});

function maskedDetail(over: Partial<InvoiceDetailResponse> = {}): InvoiceDetailResponse {
  return {
    ...maskedInvoice(),
    advance_rate: "20.00",
    retention_rate: null,
    withholding_rate: null,
    lines: [
      {
        id: "l1",
        description: "Beton",
        detail_note: null,
        line_total: null,
        quantity: "10.000",
        sort_order: 1,
        unit: "m³",
        unit_price: null,
        vat_rate: "20.00",
      },
    ],
    ...over,
  } as unknown as InvoiceDetailResponse;
}

describe("IZN-F4b.2 · fatura kalemleri (toplam null ise —)", () => {
  it("kalem tutarları ve tfoot toplamları '—'; avans kesintisi satırı oranı sıfır değilse GÖSTERİLİR ('– —' değil '—')", () => {
    render(<InvoiceLinesTable invoice={maskedDetail()} />);
    const line = screen.getByTestId("fat-detail-line");
    expect(within(line).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    const total = screen.getByTestId("fat-detail-total-row");
    expect(total).toHaveTextContent("—");
    // avans: tutar gizli ama oran %20 → satır var, tutar düz "—"
    expect(screen.getByText(/Avans Kesintisi/)).toBeInTheDocument();
    expect(screen.queryByText("– —")).toBeNull();
  });

  it("kesinti tutarı VE oranı yoksa satır basılmaz (gizli tutar 0 sanılıp 'yok' denmez, oran da yoksa gizlenir)", () => {
    render(<InvoiceLinesTable invoice={maskedDetail({ advance_rate: null } as never)} />);
    expect(screen.queryByText(/Avans Kesintisi/)).toBeNull();
  });
});

describe("IZN-F4b.2 · KPI şeridi", () => {
  const masked = {
    issued_this_month: { amount: null, count: 3 },
    received_this_month: { amount: null, count: 1 },
    receivable: { amount: null, count: 2 },
    vat_difference: null,
    pending_approval: 4,
  } as unknown as InvoiceSummaryResponse;

  it("tutarlar '—'; KDV farkı ipucu yön UYDURMAZ ('Ödenecek KDV' değil)", () => {
    expect(vatDifferenceHint(null)).toBe("KDV farkı");
    render(<InvoiceKpiStrip summary={masked} />);
    expect(screen.getByTestId("fat-kpi-vat")).toHaveTextContent("—");
    expect(screen.getByTestId("fat-kpi-vat")).not.toHaveTextContent("Ödenecek KDV");
    expect(screen.getByTestId("fat-kpi-issued")).toHaveTextContent("3 fatura");
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(4);
  });
});
