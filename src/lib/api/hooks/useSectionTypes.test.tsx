import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  SECTION_TYPES_QUERY_KEY,
  useCreateSectionType,
  useSectionTypes,
} from "./useSectionTypes";
import { backendClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), POST: vi.fn() } }));

const FOUNDATION = { id: "t-1", name: "Temel & Altyapı" };
const FINISHING = { id: "t-2", name: "İnce İşler" };
const NEW_TYPE = { id: "t-3", name: "Asansör" };

function ok(data: unknown, status = 200) {
  return { data, error: undefined, response: new Response(null, { status }) } as never;
}
function fail(status: number, error: unknown) {
  return { data: undefined, error, response: new Response(null, { status }) } as never;
}

describe("useSectionTypes / useCreateSectionType (BLF-F1.2)", () => {
  let client: QueryClient;
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("GET /section-types listesini sunucu sırasıyla döndürür", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok([FOUNDATION, FINISHING]));
    const { result } = renderHook(() => useSectionTypes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/section-types");
    expect(result.current.data).toEqual([FOUNDATION, FINISHING]);
  });

  it("liste uzun süre taze sayılır (staleTime sonsuz değil ama dakikalar)", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok([FOUNDATION]));
    const { result } = renderHook(() => useSectionTypes(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const state = client.getQueryState([SECTION_TYPES_QUERY_KEY]);
    expect(state?.dataUpdatedAt).toBeGreaterThan(0);
    expect(client.getQueryCache().find({ queryKey: [SECTION_TYPES_QUERY_KEY] })?.isStale()).toBe(false);
  });

  it("POST başarısında yeni tip SUNUCUDAN dönen haliyle listenin sonuna eklenir (yeniden GET yok)", async () => {
    client.setQueryData([SECTION_TYPES_QUERY_KEY], [FOUNDATION, FINISHING]);
    vi.mocked(backendClient.POST).mockResolvedValue(ok(NEW_TYPE, 201));

    const { result } = renderHook(() => useCreateSectionType(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({ name: "Asansör" });
    });

    expect(backendClient.POST).toHaveBeenCalledWith("/section-types", { body: { name: "Asansör" } });
    expect(outcome).toEqual({ kind: "created", sectionType: NEW_TYPE });
    expect(client.getQueryData([SECTION_TYPES_QUERY_KEY])).toEqual([FOUNDATION, FINISHING, NEW_TYPE]);
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("409: hata FIRLATMAZ; gövdedeki existing DOĞRUDAN döner (liste okunmaz, GET yok)", async () => {
    client.setQueryData([SECTION_TYPES_QUERY_KEY], [FOUNDATION, FINISHING]);
    vi.mocked(backendClient.POST).mockResolvedValue(
      fail(409, { detail: "Bu bölüm tipi zaten var: İnce İşler", existing: FINISHING }),
    );

    const { result } = renderHook(() => useCreateSectionType(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({ name: "ince işler" });
    });

    expect(outcome).toEqual({
      kind: "duplicate",
      message: "Bu bölüm tipi zaten var: İnce İşler",
      existing: FINISHING,
    });
    expect(client.getQueryData([SECTION_TYPES_QUERY_KEY])).toEqual([FOUNDATION, FINISHING]);
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("🔴 409: detail metni BAŞKA önek taşısa da existing'den seçilir (metin ayıklama yok)", async () => {
    client.setQueryData([SECTION_TYPES_QUERY_KEY], [FOUNDATION, FINISHING]);
    vi.mocked(backendClient.POST).mockResolvedValue(
      fail(409, { detail: "Tamamen farklı bir mesaj: Hayalet", existing: FINISHING }),
    );

    const { result } = renderHook(() => useCreateSectionType(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({ name: "ince işler" });
    });

    expect(outcome).toEqual({
      kind: "duplicate",
      message: "Tamamen farklı bir mesaj: Hayalet",
      existing: FINISHING,
    });
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("🔴 409: existing önbellekte yoksa önbelleğe EKLENİR (refetch yok)", async () => {
    client.setQueryData([SECTION_TYPES_QUERY_KEY], [FOUNDATION]);
    vi.mocked(backendClient.POST).mockResolvedValue(
      fail(409, { detail: "Bu bölüm tipi zaten var: İnce İşler", existing: FINISHING }),
    );

    const { result } = renderHook(() => useCreateSectionType(), { wrapper });
    let outcome: { kind: string; existing: unknown } | undefined;
    await act(async () => {
      outcome = (await result.current.mutateAsync({ name: "ince işler" })) as never;
    });

    expect(backendClient.GET).not.toHaveBeenCalled();
    expect(outcome?.existing).toEqual(FINISHING);
    expect(client.getQueryData([SECTION_TYPES_QUERY_KEY])).toEqual([FOUNDATION, FINISHING]);
  });

  it("409 ama gövdede existing YOK (beklenmez): existing null, mesaj görünür, refetch YOK", async () => {
    client.setQueryData([SECTION_TYPES_QUERY_KEY], [FOUNDATION]);
    vi.mocked(backendClient.POST).mockResolvedValue(
      fail(409, { detail: "Bu bölüm tipi zaten var: İnce İşler" }),
    );

    const { result } = renderHook(() => useCreateSectionType(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync({ name: "ince işler" });
    });
    expect(outcome).toEqual({
      kind: "duplicate",
      message: "Bu bölüm tipi zaten var: İnce İşler",
      existing: null,
    });
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("409 dışı hata (422/403) BackendError olarak yükselir", async () => {
    vi.mocked(backendClient.POST).mockResolvedValue(fail(403, { detail: "Yetkisiz işlem" }));
    const { result } = renderHook(() => useCreateSectionType(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "X" }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { status?: number }).status).toBe(403);
  });
});
