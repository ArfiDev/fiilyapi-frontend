import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  EV_CATALOG_QUERY_KEY,
  useAdoptEvCatalogActual,
  useCreateEvCatalogItem,
  useEvCatalog,
  useUpdateEvCatalogItem,
} from "./useEvCatalog";
import { CATALOG_ITEMS_QUERY_KEY } from "./useCatalogItems";
import { EV_DISCIPLINES_QUERY_KEY } from "./catalog-query-keys";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";
import type { EvCatalogItemRead } from "@/lib/api/models";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
}));

const ITEM: EvCatalogItemRead = {
  id: "i-bet",
  poz_no: "KAB-0001",
  discipline: { id: "d-kab", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" },
  name: "Beton döküm",
  uom: "m³",
  standard_unit_mhr: "1.8000",
  default_contractor_type: "own",
  description: null,
  standard_updated_at: "2026-03-14T09:00:00Z",
  used_by_site_count: 0,
  actual: { avg: null, min: null, max: null, site_count: 0, sites: [] },
  diff_pct: null,
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("useEvCatalog", () => {
  it("süzgeçsiz çağrı sorgu parametresi GÖNDERMEZ", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok([ITEM]));

    const { result } = renderHook(() => useEvCatalog(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([ITEM]));
    expect(backendClient.GET).toHaveBeenCalledWith("/earned-value/catalog", {
      params: { query: {} },
    });
  });

  it("disiplin ve arama süzgeci backend'e discipline_id + q olarak gider; boş arama atlanır", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok([ITEM]));

    const { result, rerender } = renderHook(
      (props: { q: string }) => useEvCatalog({ disciplineId: "d-kab", q: props.q }),
      { wrapper, initialProps: { q: "beton" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenLastCalledWith("/earned-value/catalog", {
      params: { query: { discipline_id: "d-kab", q: "beton" } },
    });

    rerender({ q: "   " });
    await waitFor(() =>
      expect(backendClient.GET).toHaveBeenLastCalledWith("/earned-value/catalog", {
        params: { query: { discipline_id: "d-kab" } },
      }),
    );
  });
});

describe("katalog mutasyonları", () => {
  it("ekleme POST eder ve katalog önbelleğini tazeler", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.POST).mockResolvedValue(ok(ITEM, 201));
    const body = {
      discipline_id: "d-kab",
      name: "Beton döküm",
      uom: "m³",
      standard_unit_mhr: "1.8",
      default_contractor_type: "own" as const,
      description: null,
    };

    const { result } = renderHook(() => useCreateEvCatalogItem(), { wrapper });
    act(() => result.current.mutate(body));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/earned-value/catalog", { body });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [EV_CATALOG_QUERY_KEY] });
  });

  it("güncelleme item_id yoluna kısmi gövdeyi PATCH eder", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(ITEM));

    const { result } = renderHook(() => useUpdateEvCatalogItem(), { wrapper });
    act(() => result.current.mutate({ id: "i-bet", body: { standard_unit_mhr: "2.05" } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/earned-value/catalog/{item_id}", {
      params: { path: { item_id: "i-bet" } },
      body: { standard_unit_mhr: "2.05" },
    });
  });

  it("gerçekleşeni standart yap: B1'de 409 döner, hata BackendError olarak taşınır", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: "Bu iş tipi için tamamlanmış şantiye gerçekleşeni yok" },
      response: new Response(null, { status: 409 }),
    } as never);

    const { result } = renderHook(() => useAdoptEvCatalogActual(), { wrapper });
    act(() => result.current.mutate("i-bet"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/earned-value/catalog/{item_id}/adopt-actual", {
      params: { path: { item_id: "i-bet" } },
    });
    expect((result.current.error as BackendError).status).toBe(409);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

// TKL-F1.2 · ters yön: KAT yazması (disiplin değişimi yeni poz no üretir, T22) çekirdek
// katalog önbelleğini de bayatlatır → `catalog-items` tazelenir.
describe("KAT yazması çekirdek katalog önbelleğini tazeler", () => {
  it("ekleme", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.POST).mockResolvedValue(ok(ITEM, 201));
    const { result } = renderHook(() => useCreateEvCatalogItem(), { wrapper });
    act(() =>
      result.current.mutate({
        discipline_id: "d-kab",
        name: "X",
        uom: "m",
        standard_unit_mhr: "1",
        default_contractor_type: "own",
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
  });

  it("güncelleme (disiplin değişimi dahil)", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(ITEM));
    const { result } = renderHook(() => useUpdateEvCatalogItem(), { wrapper });
    act(() => result.current.mutate({ id: "i-bet", body: { discipline_id: "d-duv" } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [EV_CATALOG_QUERY_KEY] });
  });

  it("gerçekleşeni standart yap", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.POST).mockResolvedValue(ok(ITEM));
    const { result } = renderHook(() => useAdoptEvCatalogActual(), { wrapper });
    act(() => result.current.mutate("i-bet"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
  });
});

// TKL-F1.3.1-6 · disiplin listesi `used_by_item_count` taşır (ÜS-13b kod uyarısı): kalem
// yazması `["ev-disciplines"]`i tazelemezse uyarı bayat kalem sayısına bakar.
describe("KAT kalem yazmaları disiplin listesini (ev-disciplines) tazeler", () => {
  it("ekleme, güncelleme ve standart yap", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.POST).mockResolvedValue(ok(ITEM, 201));
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(ITEM));
    const create = renderHook(() => useCreateEvCatalogItem(), { wrapper });
    const update = renderHook(() => useUpdateEvCatalogItem(), { wrapper });
    const adopt = renderHook(() => useAdoptEvCatalogActual(), { wrapper });
    act(() =>
      create.result.current.mutate({
        discipline_id: "d-kab",
        name: "X",
        uom: "m",
        standard_unit_mhr: "1",
        default_contractor_type: "own",
      }),
    );
    act(() => update.result.current.mutate({ id: "i-bet", body: { name: "Y" } }));
    act(() => adopt.result.current.mutate("i-bet"));
    await waitFor(() => {
      expect(create.result.current.isSuccess).toBe(true);
      expect(update.result.current.isSuccess).toBe(true);
      expect(adopt.result.current.isSuccess).toBe(true);
    });
    const calls = invalidate.mock.calls.filter(
      ([filters]) => JSON.stringify(filters) === JSON.stringify({ queryKey: [EV_DISCIPLINES_QUERY_KEY] }),
    );
    expect(calls).toHaveLength(3);
    expect(EV_DISCIPLINES_QUERY_KEY).toBe("ev-disciplines");
  });
});
