import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  useCreateProgressPayment,
  useUpdateProgressPayment,
  useReplaceProgressPaymentLines,
  useDeleteProgressPayment,
  useSubmitProgressPayment,
  useApproveProgressPayment,
  useRejectProgressPayment,
  useMarkProgressPaymentPaid,
  useUnapproveProgressPayment,
  useRefreshProgressPaymentPrices,
} from "./useProgressPaymentMutations";
import {
  PROGRESS_PAYMENTS_QUERY_KEY,
  PROGRESS_PAYMENT_QUERY_KEY,
  PROGRESS_PAYMENT_SUMMARY_QUERY_KEY,
} from "./useProgressPayments";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";
import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const PAYMENT_ID = "pp-1";
const PROJECT_ID = "proj-1";

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

const DETAIL = { id: PAYMENT_ID, project_id: PROJECT_ID, status: "draft" };

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  invalidateSpy = spyOnInvalidate(client);
});

function expectStandardInvalidation() {
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENTS_QUERY_KEY] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENT_QUERY_KEY, PAYMENT_ID] });
  expect(invalidateSpy).toHaveBeenCalledWith({
    queryKey: [PROGRESS_PAYMENT_SUMMARY_QUERY_KEY, PROJECT_ID],
  });
}

describe("useCreateProgressPayment", () => {
  it("başarıda liste + özet sorgularını geçersiz kılar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useCreateProgressPayment(), { wrapper });
    act(() =>
      result.current.mutate({
        projectId: PROJECT_ID,
        body: { period_year: 2026, period_month: 7, lines: [] },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/projects/{project_id}/progress-payments", {
      params: { path: { project_id: PROJECT_ID } },
      body: { period_year: 2026, period_month: 7, lines: [] },
    });
    expectStandardInvalidation();
  });

  it("hata durumunda hiçbir sorgu geçersiz kılınmaz, hata BackendError olur", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(422, "geçersiz dönem"));

    const { result } = renderHook(() => useCreateProgressPayment(), { wrapper });
    act(() => result.current.mutate({ projectId: PROJECT_ID, body: { lines: [] } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BackendError);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdateProgressPayment", () => {
  it("başarıda liste + detay + özet sorgularını geçersiz kılar", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useUpdateProgressPayment(), { wrapper });
    act(() =>
      result.current.mutate({ paymentId: PAYMENT_ID, body: { description: "Ağustos hakedişi" } }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/progress-payments/{payment_id}", {
      params: { path: { payment_id: PAYMENT_ID } },
      body: { description: "Ağustos hakedişi" },
    });
    expectStandardInvalidation();
  });
});

describe("useReplaceProgressPaymentLines", () => {
  it("başarıda liste + detay + özet sorgularını geçersiz kılar (DEĞİŞTİRME semantiği)", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useReplaceProgressPaymentLines(), { wrapper });
    act(() =>
      result.current.mutate({
        paymentId: PAYMENT_ID,
        body: { lines: [{ contract_item_id: "ci-1", site_id: "site-1", quantity: "10.000" }] },
      }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PUT).toHaveBeenCalledWith("/progress-payments/{payment_id}/lines", {
      params: { path: { payment_id: PAYMENT_ID } },
      body: { lines: [{ contract_item_id: "ci-1", site_id: "site-1", quantity: "10.000" }] },
    });
    expectStandardInvalidation();
  });
});

describe("useDeleteProgressPayment", () => {
  function noContentResponse() {
    return { data: undefined, error: undefined, response: new Response(null, { status: 204 }) } as never;
  }

  it("başarıda liste + detay sorgularını geçersiz kılar (özet — project_id yok)", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(noContentResponse());

    const { result } = renderHook(() => useDeleteProgressPayment(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.DELETE).toHaveBeenCalledWith("/progress-payments/{payment_id}", {
      params: { path: { payment_id: PAYMENT_ID } },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENTS_QUERY_KEY] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENT_QUERY_KEY, PAYMENT_ID] });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it("404'te hiçbir sorgu geçersiz kılınmaz", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue(errorResponse(404, "kayıt bulunamadı"));

    const { result } = renderHook(() => useDeleteProgressPayment(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe.each([
  ["useSubmitProgressPayment", useSubmitProgressPayment, "submit"],
  ["useApproveProgressPayment", useApproveProgressPayment, "approve"],
  ["useMarkProgressPaymentPaid", useMarkProgressPaymentPaid, "mark-paid"],
  ["useUnapproveProgressPayment", useUnapproveProgressPayment, "unapprove"],
] as const)("%s", (_name, useHook, action) => {
  it(`POST .../${action} çağırır ve başarıda liste+detay+özet geçersiz kılınır`, async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useHook(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith(`/progress-payments/{payment_id}/${action}`, {
      params: { path: { payment_id: PAYMENT_ID } },
    });
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

describe("useRejectProgressPayment", () => {
  it("reason gövdesiyle .../reject çağırır ve geçersiz kılar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useRejectProgressPayment(), { wrapper });
    act(() => result.current.mutate({ paymentId: PAYMENT_ID, body: { reason: "eksik metraj" } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/progress-payments/{payment_id}/reject", {
      params: { path: { payment_id: PAYMENT_ID } },
      body: { reason: "eksik metraj" },
    });
    expectStandardInvalidation();
  });

  // 🔴 Bu test eskiden TAM TERSİNİ ("gövde verilmezse null gönderir")
  // bekçiliyordu. Backend `d888591` (OK-1A K2) gövdeyi ve `reason`ı ZORUNLU
  // yaptı: `null` gövde artık 422'dir. Yeni bekçi, gövdenin `null`/`undefined`
  // olarak ASLA sarmalanmadığını — çağıranın verdiği nesnenin AYNEN gittiğini —
  // ölçer; `body ?? null` gibi bir sarmalama geri gelirse kırmızı döner.
  it("gövdeyi olduğu gibi geçirir — null/undefined'a düşürmez (K2: gövde zorunlu)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useRejectProgressPayment(), { wrapper });
    act(() => result.current.mutate({ paymentId: PAYMENT_ID, body: { reason: "   " } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [, options] = vi.mocked(backendClient.POST).mock.calls[0] as [string, { body: unknown }];
    // Kırpma EKRANIN işidir (hook taşıyıcıdır): burada ölçülen, hook'un gövdeyi
    // sessizce `null`a çevirmemesidir.
    expect(options.body).toEqual({ reason: "   " });
    expect(options.body).not.toBeNull();
  });
});

describe("useRefreshProgressPaymentPrices", () => {
  it("başarıda refreshed_count döner ve liste+detay geçersiz kılınır (özet — govde project_id tasimaz)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse({ refreshed_count: 3 }));

    const { result } = renderHook(() => useRefreshProgressPaymentPrices(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/progress-payments/{payment_id}/refresh-prices", {
      params: { path: { payment_id: PAYMENT_ID } },
    });
    expect(result.current.data?.refreshed_count).toBe(3);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENTS_QUERY_KEY] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [PROGRESS_PAYMENT_QUERY_KEY, PAYMENT_ID] });
    expect(invalidateSpy).toHaveBeenCalledTimes(3);
  });

  it("hata durumunda hiçbir sorgu geçersiz kılınmaz", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(409, "yalnız taslakta"));

    const { result } = renderHook(() => useRefreshProgressPaymentPrices(), { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// KAT-F1.2 O3 · `catalog-items` staleTime 5 dk. Son fiyat kaynağı HK = YALNIZ onaylı/ödenmiş hakediş satırı
// (backend `progress_payments/last_price_provider.py`): onay durumunu ve satır fiyatını değiştiren yazımlar listeyi tazeler.
describe("hakediş yazımları · son fiyat (HK) kaynağı katalog önbelleğini tazeler", () => {
  const CATALOG = { queryKey: [CATALOG_ITEMS_QUERY_KEY] };
  const cases: [string, () => unknown, "POST", unknown][] = [
    ["onayla", () => useApproveProgressPayment(), "POST", PAYMENT_ID],
    ["onayı geri al", () => useUnapproveProgressPayment(), "POST", PAYMENT_ID],
    ["fiyatları tazele", () => useRefreshProgressPaymentPrices(), "POST", PAYMENT_ID],
    ["sil", () => useDeleteProgressPayment(), "POST", PAYMENT_ID],
  ];

  it.each(cases)("🔴 %s sonrası [catalog-items] geçersiz kılınır", async (_ad, useHook) => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse({ ...DETAIL, updated_count: 0 }));
    vi.mocked(backendClient.DELETE).mockResolvedValue(okResponse(undefined));
    const { result } = renderHook(() => useHook() as ReturnType<typeof useApproveProgressPayment>, { wrapper });
    act(() => result.current.mutate(PAYMENT_ID));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(CATALOG);
  });

  it.each([
    ["ödendi işaretle (onaylı → ödenmiş: kaynak kümesi değişmez)", () => useMarkProgressPaymentPaid()],
    ["taslak satır değiştir", () => useReplaceProgressPaymentLines()],
  ] as const)("%s: 1,5 MB listeyi boşuna bayatlatmaz", async (_ad, useHook) => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));
    vi.mocked(backendClient.PUT).mockResolvedValue(okResponse(DETAIL));
    const { result } = renderHook(() => useHook() as unknown as ReturnType<typeof useMarkProgressPaymentPaid>, { wrapper });
    act(() => (result.current.mutate as (v: unknown) => void)(_ad.startsWith("taslak") ? { paymentId: PAYMENT_ID, body: { lines: [] } } : PAYMENT_ID));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalledWith(CATALOG);
  });
});
