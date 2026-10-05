import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { backendClient } from "@/lib/api/client";
import type { JournalEntryDetailResponse } from "@/lib/api/hooks/useJournalEntries";
import type { TrialBalanceRow, TrialBalanceTotals } from "@/lib/api/hooks/useTrialBalance";
import type { VatReturnResponse } from "@/lib/api/hooks/useVatReturn";
import { meFixture } from "@/lib/auth/page-grants.testkit";

import { accountBalanceRailRows } from "./accounting-pro";
import { draftsFromEntry, journalFormBlockers, journalTotals } from "./journal-entry-form";
import { JournalEntryFormModal } from "./JournalEntryFormModal";
import { TrialBalanceBanner } from "./TrialBalanceBanner";
import { TrialBalanceTable } from "./TrialBalanceTable";
import { trialBalanceImbalance } from "./trial-balance";
import { buildVatTaxableRows, vatOutcome, vatTaxableBaseTotal } from "./vat-return";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

function session(hiddenFields: Parameters<typeof meFixture>[0] = {}) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(hiddenFields),
    isLoading: false,
  } as ReturnType<typeof useSession>);
}

const MASKED_TOTALS: TrialBalanceTotals = {
  opening_debit: null,
  opening_credit: null,
  period_debit: null,
  period_credit: null,
  closing_debit: null,
  closing_credit: null,
} as unknown as TrialBalanceTotals;

function maskedRow(): TrialBalanceRow {
  return {
    account_id: "a1",
    account_code: "100",
    account_name: "Kasa",
    opening_debit: null,
    opening_credit: null,
    period_debit: null,
    period_credit: null,
    closing_debit: null,
    closing_credit: null,
  } as unknown as TrialBalanceRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  session({ hiddenFields: ["banka_kasa"] });
});

describe("IZN-F4b.2 · mizan (null → — / toplam null ise —)", () => {
  it("fark: kapanış toplamlarından biri null ise null (0 DEĞİL)", () => {
    expect(trialBalanceImbalance({ ...MASKED_TOTALS, closing_debit: "10.00" })).toBeNull();
    expect(trialBalanceImbalance(MASKED_TOTALS)).toBeNull();
    expect(trialBalanceImbalance({ ...MASKED_TOTALS, closing_debit: "10.00", closing_credit: "7.50" })).toBe("2.50");
  });

  it("tablo: null hücreler '—', toplam satırı '—', gizli sütun başlığında kilit (satırlarda değil)", () => {
    render(<TrialBalanceTable rows={[maskedRow()]} totals={MASKED_TOTALS} isLoading={false} />);
    const row = screen.getByTestId("mz-row-100");
    expect(within(row).queryByTestId("hidden-mark")).toBeNull();
    expect(within(row).getAllByText("—")).toHaveLength(6);
    const totals = screen.getByTestId("mz-totals");
    expect(within(totals).getAllByText("—")).toHaveLength(6);
    expect(screen.getAllByTestId("hidden-mark")).toHaveLength(3);
    expect(screen.queryByText(/₺/)).toBeNull();
  });

  it("kategori gizli DEĞİLKEN null → '—' ama kilit yok (veri yok)", () => {
    session({ hiddenFields: [] });
    render(<TrialBalanceTable rows={[maskedRow()]} totals={MASKED_TOTALS} isLoading={false} />);
    expect(screen.queryByTestId("hidden-mark")).toBeNull();
  });

  it("banner: null toplam varken 'Dengede Değil' UYARISI ÇIKMAZ; doğrulanamıyor notu + kilit", () => {
    render(<TrialBalanceBanner isBalanced={false} totals={MASKED_TOTALS} />);
    expect(screen.queryByText(/Dengede Değil/)).toBeNull();
    expect(screen.getByTestId("mz-banner-unverifiable")).toHaveTextContent("doğrulanamıyor");
    expect(screen.getByTestId("hidden-mark")).toBeInTheDocument();
  });

  it("banner: dolu toplam + dengesiz → eski uyarı korunur", () => {
    render(
      <TrialBalanceBanner
        isBalanced={false}
        totals={{ ...MASKED_TOTALS, closing_debit: "10.00", closing_credit: "7.50" }}
      />,
    );
    expect(screen.getByTestId("mz-banner")).toHaveTextContent("Dengede Değil");
  });

  it("sağ ray: iki kapanış tarafı null → 'hidden' (flat/gerçek sıfır DEĞİL), amount null", () => {
    const [row] = accountBalanceRailRows([maskedRow()]);
    expect(row?.side).toBe("hidden");
    expect(row?.amount).toBeNull();
  });
});

function vat(partial: Partial<VatReturnResponse> = {}): VatReturnResponse {
  return {
    year: 2026,
    month: 6,
    due_date: "2026-07-28",
    calculated_vat: null,
    deductible_vat: null,
    payable: null,
    carried_forward: null,
    taxable_rows: [{ rate: "20.00", base: null, vat: null }],
    exempt_base: null,
    deductions: [],
    ...partial,
  } as unknown as VatReturnResponse;
}

describe("IZN-F4b.2 · KDV beyanı", () => {
  it("satırlar null; istisna satırında sahte '0' vergi basılmaz; matrah toplamı null", () => {
    const rows = buildVatTaxableRows(vat());
    expect(rows.every((row) => row.base === null && row.vat === null)).toBe(true);
    expect(vatTaxableBaseTotal(rows)).toBeNull();
  });

  it("toplam: bir matrah null ise toplam null (diğerini 'toplam' diye basmaz)", () => {
    const rows = buildVatTaxableRows(vat({ taxable_rows: [{ rate: "20.00", base: "100.00", vat: "20.00" }] as never }));
    expect(vatTaxableBaseTotal(rows)).toBeNull(); // istisna matrahı null
  });

  it("sonuç dalı: devreden/ödenecek gizliyse 'unknown' — 'Ödenecek ₺0' BASILMAZ", () => {
    const outcome = vatOutcome(vat());
    expect(outcome.kind).toBe("unknown");
    expect(outcome.amount).toBeNull();
    expect(outcome.cardTitle).not.toContain("Ödenecek");
  });

  it("dolu veride eski dallar korunur", () => {
    const full = vat({ calculated_vat: "10.00", deductible_vat: "4.00", payable: "6.00", carried_forward: "0.00" });
    expect(vatOutcome(full).kind).toBe("payable");
    expect(vatOutcome(vat({ ...full, payable: "0.00", carried_forward: "3.00" })).kind).toBe("carried");
  });
});

describe("IZN-F4b.2 · fiş satırı (gizli bacak)", () => {
  const entry = {
    id: "e1",
    entry_no: "YEV-2026-0001",
    entry_date: "2026-06-10",
    description: "Kira",
    detail_note: null,
    status: "draft",
    total_debit: null,
    total_credit: null,
    lines: [
      { id: "l1", account_id: "acc-1", account_code: "100", account_name: "Kasa", debit: null, credit: null },
      { id: "l2", account_id: "acc-2", account_code: "320", account_name: "Satıcılar", debit: null, credit: null },
    ],
  } as unknown as JournalEntryDetailResponse;

  it("draftsFromEntry: null bacak 'null' metnine dönmez, isMasked taşır", () => {
    const [line] = draftsFromEntry(entry);
    expect(line).toMatchObject({ debit: "", credit: "", isMasked: true });
  });

  it("journalTotals: gizli bacak varsa toplam null + doğrulanamaz; 'dengesiz' engeli ÜRETİLMEZ", () => {
    const lines = draftsFromEntry(entry);
    const totals = journalTotals(lines);
    expect(totals).toMatchObject({ totalDebit: null, totalCredit: null, difference: null, isVerifiable: false });
    const blockers = journalFormBlockers({ entryDate: "2026-06-10", description: "Kira", detailNote: "", lines });
    expect(blockers).toEqual([]);
  });
});

describe("IZN-F4b.2 · fiş düzenleme formu (gizli bacak: gövdede YOK)", () => {
  it("yalnız başlık değişince PATCH gider, PUT …/lines HİÇ atılmaz; tutar kutuları kilitli '—'", async () => {
    const entry = {
      id: "e1",
      entry_no: "YEV-2026-0001",
      entry_date: "2026-06-10",
      description: "Kira",
      detail_note: null,
      status: "draft",
      total_debit: null,
      total_credit: null,
      lines: [
        { id: "l1", account_id: "acc-1", account_code: "100", account_name: "Kasa", debit: null, credit: null },
        { id: "l2", account_id: "acc-2", account_code: "320", account_name: "Satıcılar", debit: null, credit: null },
      ],
    };
    vi.mocked(backendClient.GET).mockImplementation((async (path: string) => {
      if (path === "/journal-entries/{entry_id}") return { data: entry, error: undefined, response: new Response() };
      return { data: { items: [], total: 0, limit: 200, offset: 0 }, error: undefined, response: new Response() };
    }) as never);
    vi.mocked(backendClient.PATCH).mockResolvedValue({ data: entry, error: undefined, response: new Response() } as never);
    const userEvent = (await import("@testing-library/user-event")).default;
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <JournalEntryFormModal entryId="e1" onClose={vi.fn()} />
      </QueryClientProvider>,
    );
    const debit = await screen.findByTestId("mu-line-debit-0");
    expect(debit).toBeDisabled();
    expect(debit).toHaveAttribute("placeholder", "—");
    expect(screen.getByTestId("mu-entry-lines-masked")).toBeInTheDocument();
    expect(screen.queryByTestId("mu-entry-dialog-diff-warning")).toBeNull();

    await user.type(screen.getByTestId("mu-entry-description"), " Temmuz");
    await waitFor(() => expect(screen.getByTestId("mu-entry-dialog-save")).toBeEnabled());
    await user.click(screen.getByTestId("mu-entry-dialog-save"));

    await waitFor(() => expect(backendClient.PATCH).toHaveBeenCalled());
    expect(backendClient.PUT).not.toHaveBeenCalled();
    const body = vi.mocked(backendClient.PATCH).mock.calls[0]?.[1] as { body: Record<string, unknown> };
    expect(body.body).toEqual({ description: "Kira Temmuz" });
    expect(JSON.stringify(body)).not.toContain("debit");
  });
});
