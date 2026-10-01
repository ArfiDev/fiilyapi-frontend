import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { siteDiarySkeletonQueryKey, useSiteDiarySkeleton, type SiteDiarySkeleton } from "./useSiteDiarySkeleton";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";

// GKS-F1.2a · kayıtsız günün iskelet önizlemesi (`GET /sites/{id}/diary/skeleton`).
// Hook'un ÇAĞRI SÖZLEŞMESİ: yol + query parametreleri, boş `section_id`nin
// gönderilmemesi ve `enabled=false`ta ağa ÇIKMAMA.
vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function skeleton(sectionId: string | null): SiteDiarySkeleton {
  return {
    entry_date: "2026-07-15",
    section_id: sectionId,
    section_name: null,
    existing_entry_id: null,
    locked: false,
    lock_report_date: null,
    lines: [],
    lines_total: "0.00",
  } satisfies SiteDiarySkeleton;
}

function okResponse(data: unknown) {
  return { data, error: undefined, response: new Response() } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("useSiteDiarySkeleton", () => {
  it("entry_date + section_id'yi query parametresi olarak gönderir", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(okResponse(skeleton("sec-1")));

    const { result } = renderHook(() => useSiteDiarySkeleton("s-1", "2026-07-15", "sec-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/sites/{site_id}/diary/skeleton", {
      params: { path: { site_id: "s-1" }, query: { entry_date: "2026-07-15", section_id: "sec-1" } },
    });
    expect(result.current.data?.section_id).toBe("sec-1");
  });

  it("bölüm boşken `section_id` parametresi HİÇ gönderilmez", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(okResponse(skeleton(null)));

    const { result } = renderHook(() => useSiteDiarySkeleton("s-1", "2026-07-15", ""), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/sites/{site_id}/diary/skeleton", {
      params: { path: { site_id: "s-1" }, query: { entry_date: "2026-07-15" } },
    });
  });

  it("enabled=false iken ağa ÇIKMAZ", async () => {
    const { result } = renderHook(() => useSiteDiarySkeleton("s-1", "2026-07-15", "", { enabled: false }), {
      wrapper,
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("boş şantiye ya da tarihle ağa ÇIKMAZ", () => {
    renderHook(() => useSiteDiarySkeleton("", "2026-07-15", ""), { wrapper });
    renderHook(() => useSiteDiarySkeleton("s-1", "", ""), { wrapper });
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("sorgu anahtarı şantiye + tarih + bölümü ayırır", () => {
    const base = siteDiarySkeletonQueryKey("s-1", "2026-07-15", "");
    expect(siteDiarySkeletonQueryKey("s-2", "2026-07-15", "")).not.toEqual(base);
    expect(siteDiarySkeletonQueryKey("s-1", "2026-07-16", "")).not.toEqual(base);
    expect(siteDiarySkeletonQueryKey("s-1", "2026-07-15", "sec-1")).not.toEqual(base);
  });

  it("422 (SECTION_MISMATCH) BackendError olarak yüzeye çıkar", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: undefined,
      error: { detail: "Seçilen bölüm bu şantiyeye ait değil" },
      response: new Response(null, { status: 422 }),
    } as never);

    const { result } = renderHook(() => useSiteDiarySkeleton("s-1", "2026-07-15", "sec-x"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BackendError);
    expect((result.current.error as BackendError).status).toBe(422);
  });
});
