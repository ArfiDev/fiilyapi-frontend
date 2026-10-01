import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  CATALOG_DISCIPLINES_QUERY_KEY,
  CATALOG_ITEMS_QUERY_KEY,
  useCatalogDisciplines,
  useCatalogItems,
  useCreateCatalogItem,
  useUpdateCatalogItem,
} from "./useCatalogItems";
import { EV_CATALOG_QUERY_KEY } from "./useEvCatalog";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";
import type { WorkDisciplineRead, WorkItemCreate, WorkItemRead } from "@/lib/api/models";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
}));

const ITEM: WorkItemRead = {
  id: "i-bet",
  poz_no: "KAB-0001",
  discipline: { id: "d-kab", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" },
  name: "Beton döküm",
  uom: "m³",
  description: null,
  standard_unit_mhr: "1.8000",
  default_contractor_type: "own",
  ref_price: "1250.50",
  price_updated_at: "2026-09-01T09:00:00Z",
  standard_updated_at: "2026-03-14T09:00:00Z",
  created_at: "2026-03-14T09:00:00Z",
  updated_at: "2026-09-01T09:00:00Z",
};

const DISCIPLINE: WorkDisciplineRead = {
  id: "d-kab",
  code: "KAB",
  name: "Kaba İnşaat",
  color: "#2563eb",
  default_contractor_type: "own",
  sort_order: 1,
};

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}

function fail(status: number, detail: string) {
  return { data: undefined, error: { detail }, response: new Response(null, { status }) } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("anahtar sabitleri", () => {
  it("KAT anahtarı ve yeni anahtarlar ayrıdır", () => {
    expect(CATALOG_ITEMS_QUERY_KEY).toBe("catalog-items");
    expect(CATALOG_DISCIPLINES_QUERY_KEY).toBe("catalog-disciplines");
    expect(CATALOG_ITEMS_QUERY_KEY).not.toBe(EV_CATALOG_QUERY_KEY);
  });
});

describe("useCatalogItems", () => {
  it("GET /catalog/items okur, kalem listesini items zarfından açar ve [\"catalog-items\"] anahtarına yazar", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ items: [ITEM] }));

    const { result } = renderHook(() => useCatalogItems(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([ITEM]));
    expect(backendClient.GET).toHaveBeenCalledWith("/catalog/items", {});
    expect(client.getQueryData(["catalog-items"])).toEqual([ITEM]);
  });

  it("403 → BackendError (ekran AccessDenied dalı için status korunur)", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(fail(403, "Yetkisiz işlem"));

    const { result } = renderHook(() => useCatalogItems(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BackendError);
    expect((result.current.error as BackendError).status).toBe(403);
  });
});

describe("useCatalogDisciplines", () => {
  it("GET /catalog/disciplines okur (useEv* DEĞİL), items zarfını açar", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok({ items: [DISCIPLINE] }));

    const { result } = renderHook(() => useCatalogDisciplines(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([DISCIPLINE]));
    expect(backendClient.GET).toHaveBeenCalledWith("/catalog/disciplines", {});
    expect(client.getQueryData(["catalog-disciplines"])).toEqual([DISCIPLINE]);
  });
});

describe("useCreateCatalogItem", () => {
  const BODY: WorkItemCreate = {
    discipline_id: "d-kab",
    name: "Beton döküm",
    uom: "m³",
    standard_unit_mhr: "1.8",
    default_contractor_type: "own",
    ref_price: "1250.50",
  };

  it("POST /catalog/items; gövde AYNEN gider ve poz_no ASLA içermez", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok(ITEM, 201));

    const { result } = renderHook(() => useCreateCatalogItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(BODY);
    });

    expect(backendClient.POST).toHaveBeenCalledWith("/catalog/items", { body: BODY });
    const sent = vi.mocked(backendClient.POST).mock.calls[0][1] as unknown as { body: object };
    expect(Object.keys(sent.body)).not.toContain("poz_no");
  });

  it("başarıda HEM catalog-items HEM ev-catalog (KAT) geçersizlenir", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(ok(ITEM, 201));
    const spy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateCatalogItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(BODY);
    });

    const keys = spy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["catalog-items"]);
    expect(keys).toContainEqual([EV_CATALOG_QUERY_KEY]);
  });

  it("409 hatasında hiçbir anahtar geçersizlenmez ve mesaj korunur", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(fail(409, "Ad: bu disiplinde aynı ad…"));
    const spy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateCatalogItem(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(BODY)).rejects.toMatchObject({ status: 409 });
    });

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useUpdateCatalogItem", () => {
  it("PATCH /catalog/items/{item_id}; gövdeyi olduğu gibi gönderir (poz_no yok)", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(ITEM));

    const { result } = renderHook(() => useUpdateCatalogItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "i-bet", body: { ref_price: "1300" } });
    });

    expect(backendClient.PATCH).toHaveBeenCalledWith("/catalog/items/{item_id}", {
      params: { path: { item_id: "i-bet" } },
      body: { ref_price: "1300" },
    });
    const sent = vi.mocked(backendClient.PATCH).mock.calls[0][1] as unknown as { body: object };
    expect(Object.keys(sent.body)).not.toContain("poz_no");
  });

  it("başarıda HEM catalog-items HEM ev-catalog geçersizlenir", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok(ITEM));
    const spy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateCatalogItem(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: "i-bet", body: { name: "Yeni ad" } });
    });

    const keys = spy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(["catalog-items"]);
    expect(keys).toContainEqual([EV_CATALOG_QUERY_KEY]);
  });
});
