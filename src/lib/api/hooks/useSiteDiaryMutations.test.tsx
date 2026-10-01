import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  useCreateSiteDiaryEntry,
  useReopenSiteDiaryEntry,
  useSaveSiteDiaryLines,
  useSubmitSiteDiaryEntry,
  useUpdateCreatedSiteDiaryEntry,
  useUpdateSiteDiaryEntry,
} from "./useSiteDiaryMutations";
import {
  SITE_DIARY_ENTRIES_QUERY_KEY,
  SITE_DIARY_ENTRY_QUERY_KEY,
  SITE_DIARY_SUMMARY_QUERY_KEY,
  type SiteDiaryEntryDetail,
} from "./useSiteDiary";
import { backendClient } from "@/lib/api/client";
import { submitBlockedReasons } from "@/lib/api/error-message";
import { BackendError } from "@/lib/api/unwrap";

// F-SD T6 · T1'in yazma/durum hook'ları. `useProgressPaymentMutations.test.tsx`
// deseni: çağrı sözleşmesi + geçersiz kılma + hata dalı (özellikle 409).
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const SITE_ID = "s-1";
const ENTRY_ID = "d-1";
/** Yazma uçlarının yanıtı TAM detaydır (hook yalnız `id` + `site_id` okur). */
const DETAIL = {
  id: ENTRY_ID,
  site_id: SITE_ID,
  project_id: "p-1",
  entry_date: "2026-07-15",
  section_id: null,
  weather: "sunny",
  work_done: null,
  chief_note: null,
  safety_meeting_held: false,
  ppe_checked: false,
  has_incident: false,
  incident_note: null,
  status: "draft",
  submitted_at: null,
  created_by: "u-2",
  created_at: "2026-07-15T08:00:00Z",
  updated_at: "2026-07-15T09:00:00Z",
  lines: [],
  worker_counts: [],
  lines_total: "0.00",
  worker_total: 0,
  // DET-1.B salt-okunur detay alanları — başlıksız taslak: gönderen yok, kilit yok.
  site_name: "A-Blok Şantiyesi",
  project_name: "Güneşkent",
  section_name: null,
  created_by_name: "Mehmet Demir",
  submitted_by: null,
  submitted_by_name: null,
  locked: false,
  lock_report_date: null,
  prev_id: null,
  next_id: null,
  prev_entry_date: null,
  next_entry_date: null,
} satisfies SiteDiaryEntryDetail;

function spyOnInvalidate(queryClient: QueryClient) {
  return vi.spyOn(queryClient, "invalidateQueries");
}

let client: QueryClient;
let invalidateSpy: ReturnType<typeof spyOnInvalidate>;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function okResponse(data: unknown) {
  return { data, error: undefined, response: new Response() } as never;
}

function errorResponse(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

function expectStandardInvalidation() {
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [SITE_DIARY_ENTRIES_QUERY_KEY, SITE_ID] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [SITE_DIARY_SUMMARY_QUERY_KEY, SITE_ID] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [SITE_DIARY_ENTRY_QUERY_KEY, ENTRY_ID] });
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  invalidateSpy = spyOnInvalidate(client);
});

describe("useCreateSiteDiaryEntry", () => {
  it("POST /sites/{id}/diary çağırır ve liste+özet+detayı geçersiz kılar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useCreateSiteDiaryEntry(SITE_ID), { wrapper });
    act(() => result.current.mutate({ entry_date: "2026-08-03" } as never));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/sites/{site_id}/diary", {
      params: { path: { site_id: SITE_ID } },
      body: { entry_date: "2026-08-03" },
    });
    expectStandardInvalidation();
  });

  it("aynı güne ikinci kayıtta 409 BackendError döner ve HİÇBİR sorgu geçersiz kılınmaz", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(
      errorResponse(409, "Bu güne ait günlük kayıt zaten var."),
    );

    const { result } = renderHook(() => useCreateSiteDiaryEntry(SITE_ID), { wrapper });
    act(() => result.current.mutate({ entry_date: "2026-07-15" } as never));

    await waitFor(() => expect(result.current.isError).toBe(true));
    const error = result.current.error as BackendError;
    expect(error).toBeInstanceOf(BackendError);
    expect(error.status).toBe(409);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdateSiteDiaryEntry", () => {
  it("PATCH /diary/{id} çağırır; geçersiz kılınacak şantiye YANITTAN türetilir", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useUpdateSiteDiaryEntry(ENTRY_ID), { wrapper });
    act(() => result.current.mutate({ weather: "rainy" } as never));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/diary/{entry_id}", {
      params: { path: { entry_id: ENTRY_ID } },
      body: { weather: "rainy" },
    });
    expectStandardInvalidation();
  });

  it("gönderilmiş kayıtta 409 döner (backend yalnız taslakta kabul eder)", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(
      errorResponse(409, "Gönderilmiş kayıt düzenlenemez."),
    );

    const { result } = renderHook(() => useUpdateSiteDiaryEntry(ENTRY_ID), { wrapper });
    act(() => result.current.mutate({ weather: "rainy" } as never));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as BackendError).status).toBe(409);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useUpdateCreatedSiteDiaryEntry (GKS-F1.5)", () => {
  it("kimliği çağrı ANINDA alır: az önce açılan kayda PATCH /diary/{id} atar ve standart geçersiz kılmayı yapar", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useUpdateCreatedSiteDiaryEntry(), { wrapper });
    act(() => result.current.mutate({ entryId: "d-yeni", body: { worker_counts: [] } as never }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/diary/{entry_id}", {
      params: { path: { entry_id: "d-yeni" } },
      body: { worker_counts: [] },
    });
    expectStandardInvalidation();
  });
});

describe("useSaveSiteDiaryLines", () => {
  it("PUT /diary/{id}/lines çağırır (DEĞİŞTİRME semantiği) ve geçersiz kılar", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useSaveSiteDiaryLines(ENTRY_ID), { wrapper });
    act(() => result.current.mutate({ lines: [{ boq_item_id: "bi-1", quantity: 12 }] } as never));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PUT).toHaveBeenCalledWith("/diary/{entry_id}/lines", {
      params: { path: { entry_id: ENTRY_ID } },
      body: { lines: [{ boq_item_id: "bi-1", quantity: 12 }] },
    });
    expectStandardInvalidation();
  });

  it("boş satır listesi de gönderilebilir (tüm satırları sıfırlar)", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useSaveSiteDiaryLines(ENTRY_ID), { wrapper });
    act(() => result.current.mutate({ lines: [] } as never));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PUT).toHaveBeenCalledWith("/diary/{entry_id}/lines", {
      params: { path: { entry_id: ENTRY_ID } },
      body: { lines: [] },
    });
  });
});

describe.each([
  ["useSubmitSiteDiaryEntry", useSubmitSiteDiaryEntry, "submit"],
  ["useReopenSiteDiaryEntry", useReopenSiteDiaryEntry, "reopen"],
] as const)("%s", (_name, useHook, action) => {
  it(`GÖVDESİZ POST /diary/{id}/${action} çağırır ve liste+özet+detayı geçersiz kılar`, async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(okResponse(DETAIL));

    const { result } = renderHook(() => useHook(ENTRY_ID), { wrapper });
    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith(`/diary/{entry_id}/${action}`, {
      params: { path: { entry_id: ENTRY_ID } },
    });
    expectStandardInvalidation();
  });

  it("durum uygun değilse 409 döner ve geçersiz kılma YAPILMAZ", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(errorResponse(409, "durum uygun değil"));

    const { result } = renderHook(() => useHook(ENTRY_ID), { wrapper });
    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as BackendError).status).toBe(409);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

// PLN-F2.1 · EV'li şantiyede Gönder ön-koşulu 422 `{detail, reasons[]}` döner;
// hook gövdeyi BackendError içinde AYNEN taşımalı ki ekran gerekçe listesini
// `submitBlockedReasons` ile basabilsin.
describe("useSubmitSiteDiaryEntry · Gönder engeli (422 reasons)", () => {
  it("422 gövdesi hatada korunur, gerekçeler ayrıştırılır, hiçbir şey tazelenmez", async () => {
    const reasons = ["Hava bilgisi eksik (durum, min/max sıcaklık, rüzgâr)", "3 a-s dağıtılmamış; gerekçe gerekli"];
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: reasons.join("; "), reasons },
      response: new Response(null, { status: 422 }),
    } as never);

    const { result } = renderHook(() => useSubmitSiteDiaryEntry(ENTRY_ID), { wrapper });
    act(() => result.current.mutate());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BackendError);
    expect(submitBlockedReasons(result.current.error)).toEqual(reasons);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
