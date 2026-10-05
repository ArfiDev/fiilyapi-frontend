import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  usePostJournalEntry,
  useReverseJournalEntry,
} from "./useJournalEntryMutations";
import { JOURNAL_ENTRIES_QUERY_KEY } from "./useJournalEntries";
import { JOURNAL_SUMMARY_QUERY_KEY } from "./useJournalSummary";
import { LEDGER_QUERY_KEY } from "./useLedger";
import { CHART_OF_ACCOUNTS_QUERY_KEY } from "./useChartOfAccounts";
import { ACCOUNTING_PERIODS_QUERY_KEY } from "./useAccountingPeriods";
import { TRIAL_BALANCE_QUERY_KEY } from "./useTrialBalance";
import { VAT_RETURN_QUERY_KEY } from "./useVatReturn";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const DETAIL = {
  id: "entry-1",
  entry_date: "2026-07-17",
  period_year: 2026,
  period_month: 7,
  description: "Hakediş Tahsilatı",
  detail_note: null,
  status: "posted",
  total_debit: "1240000.00",
  total_credit: "1240000.00",
  reversal_of_id: null,
  created_by_id: "user-1",
  created_at: "2026-07-17T09:00:00Z",
  updated_at: "2026-07-17T09:00:00Z",
  lines: [],
};

let client: QueryClient;
let invalidated: unknown[][];

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function okResponse(data: unknown) {
  return { data, error: undefined, response: new Response() } as never;
}

function errorResponse(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidated = [];
  vi.spyOn(client, "invalidateQueries").mockImplementation((filters) => {
    invalidated.push((filters as { queryKey: unknown[] }).queryKey);
    return Promise.resolve();
  });
});

/**
 * 🔴 BEKÇİ: bir fişin DURUMUNU oynatan her yazma YEDİ okumayı bayatlatır —
 * fiş listesi · defter · KPI şeridi · hesap planı (`balance` TÜREVDİR) · mizan
 * · KDV beyanı · dönem listesi. Biri unutulursa ekran, kaydettiği fişin
 * etkisini göremez.
 *
 * 🔴 KAYIT 15 (2026-09-23): son üç anahtar (`accounting-periods`/
 * `trial-balance`/`vat-return`) BU KAPSAMDA EKSİKTİ — yalnız dönem kapatma/
 * açma mutasyonlarında geçersiz kılınıyordu, fiş kaydından SONRA değil.
 * `invalidateAccountingScope`e eklendi (`accounting-invalidate.ts`).
 */
const EXPECTED_SCOPE = [
  [JOURNAL_ENTRIES_QUERY_KEY],
  [LEDGER_QUERY_KEY],
  [JOURNAL_SUMMARY_QUERY_KEY],
  [CHART_OF_ACCOUNTS_QUERY_KEY],
  [ACCOUNTING_PERIODS_QUERY_KEY],
  [TRIAL_BALANCE_QUERY_KEY],
  [VAT_RETURN_QUERY_KEY],
];

describe("usePostJournalEntry", () => {
  it("POST /journal-entries/{id}/post cagirir ve YEDI okumayi tazeler", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => usePostJournalEntry(), { wrapper });
    result.current.mutate("entry-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/journal-entries/{entry_id}/post", {
      params: { path: { entry_id: "entry-1" } },
    });
    expect(invalidated).toEqual(EXPECTED_SCOPE);
  });

  /**
   * K1 kapısı (Σ borç = Σ alacak · en az iki satır · yalnız yaprak hesap)
   * sunucudadır ve 422 döner. Hata YUTULMAZ; ekran Türkçe `detail` metnini
   * basabilsin diye `BackendError` çağırana ulaşır.
   */
  it("422'de BackendError firlatir ve HICBIR sorgu tazelenmez", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(422, "Fiş dengeli değil."));

    const { result } = renderHook(() => usePostJournalEntry(), { wrapper });
    result.current.mutate("entry-1");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as BackendError).status).toBe(422);
    expect(invalidated).toEqual([]);
  });
});

describe("useReverseJournalEntry", () => {
  it("POST /journal-entries/{id}/reverse cagirir ve YEDI okumayi tazeler", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useReverseJournalEntry(), { wrapper });
    result.current.mutate("entry-9");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/journal-entries/{entry_id}/reverse", {
      params: { path: { entry_id: "entry-9" } },
    });
    expect(invalidated).toEqual(EXPECTED_SCOPE);
  });

  it("409'da (matris disi gecis) BackendError firlatir", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(409, "Fiş kayıtlı değil."));

    const { result } = renderHook(() => useReverseJournalEntry(), { wrapper });
    result.current.mutate("entry-9");

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as BackendError).status).toBe(409);
  });
});
