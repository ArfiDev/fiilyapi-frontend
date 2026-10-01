import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  EV_DISCIPLINES_QUERY_KEY,
  useCreateEvDiscipline,
  useDeleteEvDiscipline,
  useEvDisciplines,
  useUpdateEvDiscipline,
} from "./useEvDisciplines";
import { EV_CATALOG_QUERY_KEY } from "./useEvCatalog";
import { CATALOG_ITEMS_QUERY_KEY } from "./useCatalogItems";
import { backendClient } from "@/lib/api/client";
import { BackendError } from "@/lib/api/unwrap";
import type { EvDisciplineRead } from "@/lib/api/models";

vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));

const KAB: EvDisciplineRead = {
  id: "d-kab",
  code: "KAB",
  name: "Kaba İnşaat",
  color: "#2563eb",
  default_contractor_type: "own",
  sort_order: 1,
  used_by_item_count: 6,
  used_by_site_count: 4,
  user_count: 0,
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

describe("useEvDisciplines", () => {
  it("şirket disiplin listesini GET /earned-value/disciplines ile okur", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok([KAB]));

    const { result } = renderHook(() => useEvDisciplines(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual([KAB]));
    expect(backendClient.GET).toHaveBeenCalledWith("/earned-value/disciplines", {});
  });

  it("backend hatası BackendError olarak yüzeye çıkar", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(fail(500, "patladı"));

    const { result } = renderHook(() => useEvDisciplines(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(BackendError);
  });
});

describe("disiplin mutasyonları", () => {
  it("ekleme gövdeyi aynen POST eder; disiplin ve katalog anahtarlarını tazeler", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.POST).mockResolvedValue(ok(KAB, 201));
    const body = {
      code: "KAB",
      name: "Kaba İnşaat",
      color: "#2563eb",
      default_contractor_type: "own" as const,
      sort_order: 1,
    };

    const { result } = renderHook(() => useCreateEvDiscipline(), { wrapper });
    act(() => result.current.mutate(body));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.POST).toHaveBeenCalledWith("/earned-value/disciplines", { body });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [EV_DISCIPLINES_QUERY_KEY] });
    // Katalog satırları disiplin adını/rengini GÖMER — ad/renk değişince bayat kalmasın.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [EV_CATALOG_QUERY_KEY] });
  });

  it("güncelleme yalnız verilen alanları PATCH eder (kısmi)", async () => {
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...KAB, code: "KBA" }));

    const { result } = renderHook(() => useUpdateEvDiscipline(), { wrapper });
    act(() => result.current.mutate({ id: "d-kab", body: { code: "KBA" } }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.PATCH).toHaveBeenCalledWith("/earned-value/disciplines/{discipline_id}", {
      params: { path: { discipline_id: "d-kab" } },
      body: { code: "KBA" },
    });
  });

  it("silme DELETE çağırır; 409 (kullanımda) hata olarak döner, önbellek tazelenmez", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.DELETE).mockResolvedValue(fail(409, "Disiplin kullanımda"));

    const { result } = renderHook(() => useDeleteEvDiscipline(), { wrapper });
    act(() => result.current.mutate("d-kab"));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(backendClient.DELETE).toHaveBeenCalledWith("/earned-value/disciplines/{discipline_id}", {
      params: { path: { discipline_id: "d-kab" } },
    });
    expect((result.current.error as BackendError).status).toBe(409);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("başarılı silme disiplin listesini tazeler", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));

    const { result } = renderHook(() => useDeleteEvDiscipline(), { wrapper });
    act(() => result.current.mutate("d-kab"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [EV_DISCIPLINES_QUERY_KEY] });
  });
});

// TKL-F1.2 · T22: disiplin KODU değişince o disiplinin tüm poz no'ları yeniden yazılır →
// çekirdek katalog (`catalog-items`) önbelleği de tazelenmeli (aksi halde eski numara kalır).
describe("disiplin mutasyonları çekirdek katalog önbelleğini tazeler", () => {
  it("kod güncellemesi catalog-items'ı geçersizler", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.PATCH).mockResolvedValue(ok({ ...KAB, code: "KBA" }));
    const { result } = renderHook(() => useUpdateEvDiscipline(), { wrapper });
    act(() => result.current.mutate({ id: "d-kab", body: { code: "KBA" } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
  });

  it("ekleme ve silme de aynı görünümleri tazeler", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    vi.mocked(backendClient.POST).mockResolvedValue(ok(KAB, 201));
    vi.mocked(backendClient.DELETE).mockResolvedValue(ok(undefined, 204));
    const created = renderHook(() => useCreateEvDiscipline(), { wrapper });
    act(() =>
      created.result.current.mutate({
        code: "YNI",
        name: "Yeni",
        color: "#112233",
        default_contractor_type: "own",
        sort_order: 9,
      }),
    );
    await waitFor(() => expect(created.result.current.isSuccess).toBe(true));
    const deleted = renderHook(() => useDeleteEvDiscipline(), { wrapper });
    act(() => deleted.result.current.mutate("d-kab"));
    await waitFor(() => expect(deleted.result.current.isSuccess).toBe(true));
    const hits = invalidate.mock.calls.filter(
      (call) => (call[0] as { queryKey: string[] }).queryKey[0] === CATALOG_ITEMS_QUERY_KEY,
    );
    expect(hits).toHaveLength(2);
  });
});
