import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  useBulkCreateEmployerContractItems,
  useCreateEmployerContractGroup,
  useCreateEmployerContractItem,
  useSaveContractDistribution,
  useUpdateEmployerContractItem,
} from "./useContractMutations";
import {
  CONTRACT_DISTRIBUTION_QUERY_KEY,
  EMPLOYER_CONTRACT_QUERY_KEY,
  EMPLOYER_CONTRACT_ITEMS_QUERY_KEY,
} from "./useContract";
import { buildDistributionSaveBody } from "@/lib/contract-distribution-save";
import { backendClient } from "@/lib/api/client";
import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";

vi.mock("@/lib/api/client", () => ({
  backendClient: { PUT: vi.fn(), POST: vi.fn(), PATCH: vi.fn() },
}));

const PROJECT_ID = "p-1";

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const SAVED_DISTRIBUTION = {
  sites: [{ id: "s-1", name: "A-Blok" }],
  groups: [],
  undistributed_item_count: 0,
  undistributed_item_names: [],
  site_summaries: [],
  distributed_item_count: 0,
  total_item_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

describe("useSaveContractDistribution", () => {
  it("gövdeyi PUT ile aynen gönderir (dönüştürme YAPMAZ — kural saf üreticide)", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: SAVED_DISTRIBUTION,
      error: undefined,
      response: new Response(),
    } as never);

    // BİRLEŞTİRME gövdesi saf üreticiden gelir; hook onu bozmadan taşır.
    const { body } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "120" },
      { contractItemId: "ci-2", siteId: "s-1", value: "" },
    ]);

    const { result } = renderHook(() => useSaveContractDistribution(PROJECT_ID), { wrapper });
    act(() => result.current.mutate(body));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PUT).toHaveBeenCalledWith(
      "/projects/{project_id}/contract/distribution",
      {
        params: { path: { project_id: PROJECT_ID } },
        body: {
          allocations: [
            { contract_item_id: "ci-1", site_id: "s-1", quantity: "120" },
            { contract_item_id: "ci-2", site_id: "s-1", quantity: null },
          ],
        },
      },
    );
  });

  it("başarıda yanıtı dağılım önbelleğine yazar ve türev okumaları geçersiz kılar", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: SAVED_DISTRIBUTION,
      error: undefined,
      response: new Response(),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSaveContractDistribution(PROJECT_ID), { wrapper });
    act(() => result.current.mutate({ allocations: [] }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData([CONTRACT_DISTRIBUTION_QUERY_KEY, PROJECT_ID])).toEqual(
      SAVED_DISTRIBUTION,
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, PROJECT_ID],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: [EMPLOYER_CONTRACT_QUERY_KEY, PROJECT_ID],
    });
  });

  it("backend 422'sinde hiçbir önbellek güncellenmez", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: undefined,
      error: { detail: "Dağıtılan miktar sözleşme miktarını aşamaz." },
      response: new Response(null, { status: 422 }),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useSaveContractDistribution(PROJECT_ID), { wrapper });
    act(() => result.current.mutate({ allocations: [] }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData([CONTRACT_DISTRIBUTION_QUERY_KEY, PROJECT_ID])).toBeUndefined();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

const CREATED_ITEM = {
  id: "iiiiiiii-0000-0000-0000-000000000009",
  group_id: "gggggggg-0000-0000-0000-000000000001",
  code: "03.012",
  description: "Perde betonu C30/37",
  unit: "m³",
  quantity: "1240.500",
  unit_price: "2850.75",
  sort_order: 11,
  distributed_quantity: "0.000",
  remaining_quantity: "1240.500",
};

const CREATE_BODY = {
  group_id: CREATED_ITEM.group_id,
  code: CREATED_ITEM.code,
  description: CREATED_ITEM.description,
  unit: CREATED_ITEM.unit,
  quantity: "1240.5",
  unit_price: "2850.75",
  sort_order: 11,
};

describe("useCreateEmployerContractItem", () => {
  it("gövdeyi proje kimliğiyle POST eder (decimal string BOZULMAZ)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: CREATED_ITEM,
      error: undefined,
      response: new Response(),
    } as never);

    const { result } = renderHook(() => useCreateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate(CREATE_BODY));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/projects/{project_id}/contract/items", {
      params: { path: { project_id: PROJECT_ID } },
      body: CREATE_BODY,
    });
  });

  it("başarıda kalem/dağıtım/sözleşme okumalarını geçersiz kılar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: CREATED_ITEM,
      error: undefined,
      response: new Response(),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate(CREATE_BODY));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const key of [
      EMPLOYER_CONTRACT_ITEMS_QUERY_KEY,
      CONTRACT_DISTRIBUTION_QUERY_KEY,
      EMPLOYER_CONTRACT_QUERY_KEY,
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [key, PROJECT_ID] });
    }
  });

  it("backend hatasında hiçbir önbellek tazelenmez", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: "Bu poz numarası zaten var." },
      response: new Response(null, { status: 409 }),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useCreateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate(CREATE_BODY));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useCreateEmployerContractGroup — no 47 (yarış durumu)", () => {
  it("mutateAsync, grup listesini tazeleyen invalidateQueries SETTLE olmadan RESOLVE OLMAZ", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: { id: "g-new", name: "Yeni Grup", sort_order: 5 },
      error: undefined,
      response: new Response(),
    } as never);
    let resolveInvalidate: () => void = () => {};
    const invalidatePromise = new Promise<void>((resolve) => {
      resolveInvalidate = resolve;
    });
    const invalidateSpy = vi
      .spyOn(client, "invalidateQueries")
      .mockReturnValue(invalidatePromise);

    const { result } = renderHook(() => useCreateEmployerContractGroup(PROJECT_ID), { wrapper });

    let settled = false;
    const mutatePromise = result.current
      .mutateAsync({ name: "Yeni Grup", sort_order: 5 })
      .then(() => {
        settled = true;
      });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    // `invalidateQueries` HENÜZ tamamlanmadı — `mutateAsync` da BEKLEMELİ,
    // aksi hâlde çağıran (`EmployerItemFormModal`) İKİNCİ bir grup için
    // `nextSortOrder`ı hâlâ ESKİ `groups` listesinden hesaplar.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    resolveInvalidate();
    await mutatePromise;
    expect(settled).toBe(true);
  });
});

describe("useUpdateEmployerContractItem · F-ISVPOZ satır-içi düzenleme", () => {
  const PATCHED = { ...CREATED_ITEM, quantity: "1500.000" };

  it("KISMİ gövdeyi kalem kimliğiyle PATCH eder (proje segmenti YOKTUR)", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue({
      data: PATCHED,
      error: undefined,
      response: new Response(),
    } as never);

    const { result } = renderHook(() => useUpdateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate({ itemId: "ci-1", body: { quantity: "1500" } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/contracts/employer/items/{item_id}", {
      params: { path: { item_id: "ci-1" } },
      body: { quantity: "1500" },
    });
  });

  it("başarıda kalem/dağıtım/sözleşme okumalarını geçersiz kılar (metrikler birim fiyattan türer)", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue({
      data: PATCHED,
      error: undefined,
      response: new Response(),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate({ itemId: "ci-1", body: { unit_price: "3000" } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const key of [
      EMPLOYER_CONTRACT_ITEMS_QUERY_KEY,
      CONTRACT_DISTRIBUTION_QUERY_KEY,
      EMPLOYER_CONTRACT_QUERY_KEY,
    ]) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [key, PROJECT_ID] });
    }
  });

  it("mutasyon, tazeleme (invalidate) BİTENE dek çözülmez — hücre kilidi bayat değerle açılmasın", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue({
      data: PATCHED,
      error: undefined,
      response: new Response(),
    } as never);
    const finishers: Array<() => void> = [];
    vi.spyOn(client, "invalidateQueries").mockImplementation(
      () => new Promise<void>((resolve) => { finishers.push(resolve); }),
    );

    const { result } = renderHook(() => useUpdateEmployerContractItem(PROJECT_ID), { wrapper });
    let settled = false;
    await act(async () => {
      void result.current
        .mutateAsync({ itemId: "ci-1", body: { quantity: "1500" } })
        .then(() => { settled = true; });
      await Promise.resolve();
    });
    await waitFor(() => expect(backendClient.PATCH).toHaveBeenCalled());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(settled).toBe(false);

    await act(async () => finishers.forEach((finish) => finish()));
    await waitFor(() => expect(settled).toBe(true));
  });

  it("backend hatasında hiçbir önbellek tazelenmez", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue({
      data: undefined,
      error: { detail: "Miktar sıfırdan büyük olmalıdır." },
      response: new Response(null, { status: 422 }),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useUpdateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate({ itemId: "ci-1", body: { quantity: "0" } }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});

describe("useBulkCreateEmployerContractItems · TKL-F2.2 katalogdan toplu ekleme", () => {
  const BULK_BODY = {
    items: [
      { ...CREATE_BODY, catalog_item_id: "cccccccc-0000-0000-0000-000000000001" },
      {
        ...CREATE_BODY,
        code: "03.013",
        quantity: "10",
        unit_price: "0.10",
        catalog_item_id: "cccccccc-0000-0000-0000-000000000002",
      },
    ],
  };
  const BULK_RESPONSE = {
    items: [
      { ...CREATED_ITEM, catalog_item_id: "cccccccc-0000-0000-0000-000000000001" },
      { ...CREATED_ITEM, code: "03.013", catalog_item_id: "cccccccc-0000-0000-0000-000000000002" },
    ],
  };

  it("gövdeyi `/contract/items/bulk`e proje kimliğiyle AYNEN POST eder (decimal string BOZULMAZ)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: BULK_RESPONSE,
      error: undefined,
      response: new Response(),
    } as never);

    const { result } = renderHook(() => useBulkCreateEmployerContractItems(PROJECT_ID), { wrapper });
    act(() => result.current.mutate(BULK_BODY));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledTimes(1);
    expect(backendClient.POST).toHaveBeenCalledWith(
      "/projects/{project_id}/contract/items/bulk",
      { params: { path: { project_id: PROJECT_ID } }, body: BULK_BODY },
    );
    expect(result.current.data).toEqual(BULK_RESPONSE);
  });

  it("başarıda kalem/dağıtım/sözleşme okumalarını VE katalog listesini (son fiyat) geçersiz kılar", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: BULK_RESPONSE,
      error: undefined,
      response: new Response(),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useBulkCreateEmployerContractItems(PROJECT_ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(BULK_BODY);
    });

    const keys = invalidateSpy.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        [EMPLOYER_CONTRACT_ITEMS_QUERY_KEY, PROJECT_ID],
        [CONTRACT_DISTRIBUTION_QUERY_KEY, PROJECT_ID],
        [EMPLOYER_CONTRACT_QUERY_KEY, PROJECT_ID],
        [CATALOG_ITEMS_QUERY_KEY],
      ]),
    );
    expect(keys).toHaveLength(4);
  });

  it("mutasyon, tazeleme (invalidate) BİTENE dek çözülmez", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: BULK_RESPONSE,
      error: undefined,
      response: new Response(),
    } as never);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(client, "invalidateQueries").mockImplementation(() => gate);

    const { result } = renderHook(() => useBulkCreateEmployerContractItems(PROJECT_ID), { wrapper });
    let settled = false;
    act(() => {
      void result.current.mutateAsync(BULK_BODY).then(() => {
        settled = true;
      });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release();
    await waitFor(() => expect(settled).toBe(true));
  });

  it("backend hatasında (409 hep-ya-hiç) hiçbir önbellek tazelenmez", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: undefined,
      error: { detail: "Bu poz numarası bu sözleşmede zaten kullanılıyor: 03.012" },
      response: new Response(null, { status: 409 }),
    } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(() => useBulkCreateEmployerContractItems(PROJECT_ID), { wrapper });
    act(() => result.current.mutate(BULK_BODY));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("🔴 tekli ekleme gövdesi `catalog_item_id` TAŞIMAZ (bağ yalnız katalog seçiciden toplu eklemede)", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue({
      data: CREATED_ITEM,
      error: undefined,
      response: new Response(),
    } as never);

    const { result } = renderHook(() => useCreateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate(CREATE_BODY));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const sentBody = vi.mocked(backendClient.POST).mock.calls[0][1] as unknown as { body: object };
    expect(Object.keys(sentBody.body)).not.toContain("catalog_item_id");
  });
});

// KAT-F1.2 O3 · `catalog-items` staleTime 5 dk: son fiyatı (SZL) değiştiren yazım listeyi BEKLEMEDEN tazelemeli.
describe("useUpdateEmployerContractItem · son fiyat (SZL) kaynağı katalog önbelleğini tazeler", () => {
  it("🔴 kalem PATCH sonrası [catalog-items] geçersiz kılınır", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue({ data: CREATED_ITEM, error: undefined, response: new Response() } as never);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateEmployerContractItem(PROJECT_ID), { wrapper });
    act(() => result.current.mutate({ itemId: "ci-1", body: { unit_price: "3000" } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
  });
});
