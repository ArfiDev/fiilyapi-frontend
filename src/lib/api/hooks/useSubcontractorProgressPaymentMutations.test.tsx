import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  useCreateSubcontractorProgressPayment,
  useUpdateSubcontractorProgressPayment,
  useReplaceSubcontractorProgressPaymentLines,
  useSubmitSubcontractorProgressPayment,
  useApproveSubcontractorProgressPayment,
  useRejectSubcontractorProgressPayment,
  useMarkSubcontractorProgressPaymentPaid,
  useUnapproveSubcontractorProgressPayment,
  useRefreshSubcontractorProgressPaymentPrices,
} from "./useSubcontractorProgressPaymentMutations";
import {
  SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY,
  SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY,
  SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY,
} from "./useSubcontractorProgressPayments";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const PAYMENT_ID = "scpp-1";
const CONTRACT_ID = "sc-1";

let client: QueryClient;
let invalidateSpy: ReturnType<typeof spyOnInvalidate>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function spyOnInvalidate(queryClient: QueryClient) {
  return vi.spyOn(queryClient, "invalidateQueries");
}

function okResponse(data: unknown) {
  return { data, error: undefined, response: new Response() } as never;
}

function errorResponse(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

const DETAIL = { id: PAYMENT_ID, contract_id: CONTRACT_ID, status: "draft" };

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  invalidateSpy = spyOnInvalidate(client);
});

function expectStandardInvalidation() {
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY] });
  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY, PAYMENT_ID],
  });
  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY],
  });
}

describe("useCreateSubcontractorProgressPayment", () => {
  it("başarıda liste + detay + özet sorgularını geçersiz kılar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useCreateSubcontractorProgressPayment(), { wrapper });
    act(() =>
      result.current.mutate({
        contractId: CONTRACT_ID,
        body: { period_year: 2026, period_month: 7 },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith(
      "/subcontractor-contracts/{contract_id}/progress-payments",
      {
        params: { path: { contract_id: CONTRACT_ID } },
        body: { period_year: 2026, period_month: 7 },
      },
    );
    expectStandardInvalidation();
  });

  it("hata durumunda hiçbir sorgu geçersiz kılınmaz, hata BackendError olur", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(422, "geçersiz dönem"));

    const { result } = renderHook(() => useCreateSubcontractorProgressPayment(), { wrapper });
    act(() => result.current.mutate({ contractId: CONTRACT_ID, body: {} }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BackendError);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdateSubcontractorProgressPayment", () => {
  it("başarıda liste + detay + özet sorgularını geçersiz kılar", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useUpdateSubcontractorProgressPayment(), { wrapper });
    act(() =>
      result.current.mutate({ paymentId: PAYMENT_ID, body: { description: "Ağustos hakedişi" } }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/subcontractor-progress-payments/{payment_id}", {
      params: { path: { payment_id: PAYMENT_ID } },
      body: { description: "Ağustos hakedişi" },
    });
    expectStandardInvalidation();
  });
});

describe("useReplaceSubcontractorProgressPaymentLines", () => {
  it("başarıda liste + detay + özet sorgularını geçersiz kılar (DEĞİŞTİRME semantiği)", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useReplaceSubcontractorProgressPaymentLines(), { wrapper });
    act(() =>
      result.current.mutate({
        paymentId: PAYMENT_ID,
        body: { lines: [{ contract_item_id: "sci-1", quantity: "10.000" }] },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PUT).toHaveBeenCalledWith("/subcontractor-progress-payments/{payment_id}/lines", {
      params: { path: { payment_id: PAYMENT_ID } },
      body: { lines: [{ contract_item_id: "sci-1", quantity: "10.000" }] },
    });
    expectStandardInvalidation();
  });
});

describe.each([
  ["useSubmitSubcontractorProgressPayment", useSubmitSubcontractorProgressPayment, "submit"],
  ["useApproveSubcontractorProgressPayment", useApproveSubcontractorProgressPayment, "approve"],
  ["useMarkSubcontractorProgressPaymentPaid", useMarkSubcontractorProgressPaymentPaid, "mark-paid"],
  ["useUnapproveSubcontractorProgressPayment", useUnapproveSubcontractorProgressPayment, "unapprove"],
] as const)("%s", (_name, useHook, action) => {
  it(`POST .../${action} çağırır ve başarıda liste+detay+özet geçersiz kılınır`, async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useHook(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith(
      `/subcontractor-progress-payments/{payment_id}/${action}`,
      { params: { path: { payment_id: PAYMENT_ID } } },
    );
    expectStandardInvalidation();
  });

  it("hata durumunda hiçbir sorgu geçersiz kılınmaz", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(409, "durum uygun değil"));

    const { result } = renderHook(() => useHook(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useRejectSubcontractorProgressPayment", () => {
  it("zorunlu reason gövdesiyle .../reject çağırır ve geçersiz kılar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useRejectSubcontractorProgressPayment(), { wrapper });
    act(() => result.current.mutate({ paymentId: PAYMENT_ID, body: { reason: "eksik metraj" } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/subcontractor-progress-payments/{payment_id}/reject", {
      params: { path: { payment_id: PAYMENT_ID } },
      body: { reason: "eksik metraj" },
    });
    expectStandardInvalidation();
  });
});

describe("useRefreshSubcontractorProgressPaymentPrices", () => {
  it("başarıda refreshed_count döner ve liste+detay+özet geçersiz kılınır", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse({ refreshed_count: 3 }));

    const { result } = renderHook(() => useRefreshSubcontractorProgressPaymentPrices(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith(
      "/subcontractor-progress-payments/{payment_id}/refresh-prices",
      { params: { path: { payment_id: PAYMENT_ID } } },
    );
    expect(result.current.data?.refreshed_count).toBe(3);
    expectStandardInvalidation();
  });

  it("hata durumunda hiçbir sorgu geçersiz kılınmaz", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(409, "yalnız taslakta"));

    const { result } = renderHook(() => useRefreshSubcontractorProgressPaymentPrices(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
