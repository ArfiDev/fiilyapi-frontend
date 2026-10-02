import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  useCreateEvDraft,
  useDeleteEvDraft,
  useFillBudgetFromContract,
  useFillEvFromCatalog,
  useFreezeEvBudget,
  usePatchEvItem,
  usePatchEvLeaves,
  usePutEvDistributions,
  usePutEvGroupDisciplines,
  usePutEvWindows,
} from "./useEvBudgetMutations";
import {
  EV_BUDGET_KEY,
  EV_BUDGET_PREVIEW_KEY,
  EV_BUDGET_REVISIONS_KEY,
  EV_BUDGET_SCHEDULE_KEY,
} from "./useEvBudget";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";

// PLN-F1.6 · Bütçe yazma hook'ları: gövde BİREBİR, önbellek tazelenir.
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const SITE = "site-1";
const VIEW = { revision: { id: "rev-0" }, editable: true };

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown) {
  return { data, error: undefined, response: new Response() } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("usePatchEvLeaves", () => {
  it("PATCH /budget/leaves gövdesi aynen; yanıt varsayılan + taslak anahtarına yazılır", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(VIEW));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => usePatchEvLeaves(SITE), { wrapper });
    const leaves = [{ boq_item_id: "i1", section_id: null, unit_mhr: "1.8", rate_source: "manual" as const }];
    await act(() => result.current.mutateAsync(leaves));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/leaves", {
      params: { path: { site_id: SITE } },
      body: { leaves },
    });
    expect(client.getQueryData([EV_BUDGET_KEY, SITE, null])).toEqual(VIEW);
    expect(client.getQueryData([EV_BUDGET_KEY, SITE, "rev-0"])).toEqual(VIEW);
    // İlk yazma Rev 0'ı doğurur (B1-5) → revizyon listesi, Gantt, önizleme tazelenir.
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        [EV_BUDGET_REVISIONS_KEY, SITE],
        [EV_BUDGET_SCHEDULE_KEY, SITE],
        [EV_BUDGET_PREVIEW_KEY, SITE],
      ]),
    );
  });

  it("hata BackendError olarak fırlar", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue({
      data: undefined,
      error: { detail: "Taslak yok" },
      response: new Response(null, { status: 409 }),
    } as never);
    const { result } = renderHook(() => usePatchEvLeaves(SITE), { wrapper });
    await expect(result.current.mutateAsync([])).rejects.toBeInstanceOf(BackendError);
  });
});

describe("usePatchEvItem", () => {
  it("PATCH /budget/items/{id}: yalnız verilen alan gider", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(VIEW));
    const { result } = renderHook(() => usePatchEvItem(SITE), { wrapper });
    await act(() => result.current.mutateAsync({ itemId: "i1", patch: { contractor_type: null } }));
    expect(backendClient.PATCH).toHaveBeenCalledWith(
      "/sites/{site_id}/earned-value/budget/items/{boq_item_id}",
      { params: { path: { site_id: SITE, boq_item_id: "i1" } }, body: { contractor_type: null } },
    );
  });
});

describe("usePutEvGroupDisciplines", () => {
  it("PUT /budget/group-disciplines kısmi eşleme", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(ok(VIEW));
    const { result } = renderHook(() => usePutEvGroupDisciplines(SITE), { wrapper });
    const items = [{ boq_group_id: "g1", discipline_id: "d1" }];
    await act(() => result.current.mutateAsync(items));
    expect(backendClient.PUT).toHaveBeenCalledWith(
      "/sites/{site_id}/earned-value/budget/group-disciplines",
      { params: { path: { site_id: SITE } }, body: { items } },
    );
  });
});

describe("usePutEvDistributions / usePutEvWindows", () => {
  it("PUT /distributions", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(ok(VIEW));
    const { result } = renderHook(() => usePutEvDistributions(SITE), { wrapper });
    const items = [{ discipline_id: "d1", distribution: "bell" as const }];
    await act(() => result.current.mutateAsync(items));
    expect(backendClient.PUT).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/distributions", {
      params: { path: { site_id: SITE } },
      body: { items },
    });
  });

  it("PUT /windows TAM değiştirme gövdesi", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(ok(VIEW));
    const { result } = renderHook(() => usePutEvWindows(SITE), { wrapper });
    const windows = [
      { discipline_id: "d1", section_id: "s1", start_date: "2026-08-10", end_date: "2026-11-15" },
    ];
    await act(() => result.current.mutateAsync(windows));
    expect(backendClient.PUT).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/windows", {
      params: { path: { site_id: SITE } },
      body: { windows },
    });
  });
});

describe("useFillEvFromCatalog", () => {
  it("POST /fill-from-catalog → FillOut döner; bütçe tazelenir", async () => {
    const fill = { filled_leaf_count: 3, filled_item_count: 1, ambiguous_count: 0, unmatched_count: 0, ambiguous: [] };
    vi.mocked(backendClient.POST).mockResolvedValue(ok(fill));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useFillEvFromCatalog(SITE), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync();
    });
    expect(out).toEqual(fill);
    expect(backendClient.POST).toHaveBeenCalledWith(
      "/sites/{site_id}/earned-value/budget/fill-from-catalog",
      { params: { path: { site_id: SITE } } },
    );
    expect(invalidate.mock.calls.map((c) => c[0]?.queryKey)).toContainEqual([EV_BUDGET_KEY, SITE]);
  });
});

describe("useFillBudgetFromContract", () => {
  const OUT = {
    filled_item_count: 2,
    filled_leaf_count: 5,
    linked_item_count: 0,
    mapped_group_count: 1,
    unrated_item_count: 0,
    warnings: [],
  };

  async function run(hook: () => { result: { current: { mutateAsync: () => Promise<unknown> } } }) {
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = hook();
    await act(async () => {
      await result.current.mutateAsync();
    });
    return spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey)).sort();
  }

  it("POST /fill-from-contract → FillFromContractOut döner, gövde YOK", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok(OUT));
    const { result } = renderHook(() => useFillBudgetFromContract(SITE), { wrapper });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync();
    });
    expect(out).toEqual(OUT);
    expect(backendClient.POST).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/fill-from-contract", {
      params: { path: { site_id: SITE } },
    });
  });

  it("geçersizleme kümesi `fill-from-catalog` kardeşiyle AYNI (bütçe ağacı + dört türev) ve boş değil", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok(OUT));
    const fromContract = await run(() => renderHook(() => useFillBudgetFromContract(SITE), { wrapper }));
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(backendClient.POST).mockResolvedValue(ok(OUT));
    const fromCatalog = await run(() => renderHook(() => useFillEvFromCatalog(SITE), { wrapper }));
    expect(fromContract).toEqual(fromCatalog);
    expect(fromContract).toHaveLength(5);
  });

  it("409 'Açık taslak revizyon yok' olduğu gibi fırlar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: "Açık taslak revizyon yok" },
      response: new Response(null, { status: 409 }),
    } as never);
    const { result } = renderHook(() => useFillBudgetFromContract(SITE), { wrapper });
    let caught: unknown;
    await act(async () => {
      caught = await result.current.mutateAsync().catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(BackendError);
    expect((caught as BackendError).body).toEqual({ detail: "Açık taslak revizyon yok" });
  });
});

describe("revizyon eylemleri", () => {
  it("taslak aç: POST /revisions", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "rev-2" }));
    const { result } = renderHook(() => useCreateEvDraft(SITE), { wrapper });
    await act(() => result.current.mutateAsync());
    expect(backendClient.POST).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/revisions", {
      params: { path: { site_id: SITE } },
    });
  });

  it("taslak sil: DELETE /revisions/{id}", async () => {
    vi.mocked(backendClient.DELETE).mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 204 }),
    } as never);
    const { result } = renderHook(() => useDeleteEvDraft(SITE), { wrapper });
    await act(() => result.current.mutateAsync("rev-2"));
    expect(backendClient.DELETE).toHaveBeenCalledWith(
      "/sites/{site_id}/earned-value/budget/revisions/{revision_id}",
      { params: { path: { site_id: SITE, revision_id: "rev-2" } } },
    );
  });

  it("dondur: POST /freeze ad + açıklama", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok({ id: "rev-2", status: "active" }));
    const { result } = renderHook(() => useFreezeEvBudget(SITE), { wrapper });
    await act(() => result.current.mutateAsync({ name: "Rev 2", description: null }));
    expect(backendClient.POST).toHaveBeenCalledWith("/sites/{site_id}/earned-value/budget/freeze", {
      params: { path: { site_id: SITE } },
      body: { name: "Rev 2", description: null },
    });
  });
});
