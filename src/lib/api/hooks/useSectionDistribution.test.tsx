import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  SECTION_DISTRIBUTION_QUERY_KEY,
  useSaveSectionDistribution,
  useSectionDistribution,
} from "./useSectionDistribution";
import { BOQ_QUERY_KEY, boqQueryKey } from "./useBoq";
import { backendClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), PUT: vi.fn() },
}));

const SITE_ID = "site-1";
let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const RESPONSE = {
  site_id: SITE_ID,
  site_name: "A-Blok",
  project_name: "Güneşkent Konut",
  sections: [],
  groups: [],
  unallocated_item_count: 0,
  unallocated_item_codes: [],
  distributed_item_count: 0,
  total_item_count: 0,
  section_summaries: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("useSectionDistribution", () => {
  it("siteId boşken ağa çıkmaz", () => {
    renderHook(() => useSectionDistribution(""), { wrapper });
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("GET çağırır ve sabit anahtara yazar", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: RESPONSE,
      error: undefined,
      response: new Response(),
    } as never);
    const { result } = renderHook(() => useSectionDistribution(SITE_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/sites/{site_id}/boq/section-distribution", {
      params: { path: { site_id: SITE_ID } },
    });
    expect(client.getQueryData([SECTION_DISTRIBUTION_QUERY_KEY, SITE_ID])).toEqual(RESPONSE);
  });
});

describe("useSaveSectionDistribution", () => {
  it("PUT gövdeyi aynen taşır, yanıtı önbelleğe yazar, BOQ site + site+bölüm girdilerini geçersiz kılar", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: RESPONSE,
      error: undefined,
      response: new Response(),
    } as never);
    client.setQueryData(boqQueryKey(SITE_ID), { stale: true });
    client.setQueryData(boqQueryKey(SITE_ID, "sec-1"), { stale: true });
    client.setQueryData(boqQueryKey("other-site"), { stale: true });
    const body = { allocations: [{ boq_item_id: "i-1", section_id: "sec-1", quantity: null }] };

    const { result } = renderHook(() => useSaveSectionDistribution(SITE_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(backendClient.PUT).toHaveBeenCalledWith("/sites/{site_id}/boq/section-distribution", {
      params: { path: { site_id: SITE_ID } },
      body,
    });
    expect(client.getQueryData([SECTION_DISTRIBUTION_QUERY_KEY, SITE_ID])).toEqual(RESPONSE);
    expect(client.getQueryState(boqQueryKey(SITE_ID))?.isInvalidated).toBe(true);
    expect(client.getQueryState(boqQueryKey(SITE_ID, "sec-1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(boqQueryKey("other-site"))?.isInvalidated).toBe(false);
    expect(BOQ_QUERY_KEY).toBe("boq");
  });

  it("onSuccess geçersiz kılma sözünü döndürür (mutateAsync tazelenene dek bitmez)", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: RESPONSE,
      error: undefined,
      response: new Response(),
    } as never);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(client, "invalidateQueries").mockReturnValue(gate);
    let settled = false;

    const { result } = renderHook(() => useSaveSectionDistribution(SITE_ID), { wrapper });
    const pending = result.current.mutateAsync({ allocations: [] }).then(() => {
      settled = true;
    });
    await waitFor(() => expect(client.invalidateQueries).toHaveBeenCalled());
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await pending;
    expect(settled).toBe(true);
  });

  it("422'de önbellek güncellenmez", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: undefined,
      error: { detail: "hata" },
      response: new Response(null, { status: 422 }),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveSectionDistribution(SITE_ID), { wrapper });
    act(() => result.current.mutate({ allocations: [] }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData([SECTION_DISTRIBUTION_QUERY_KEY, SITE_ID])).toBeUndefined();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
