import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useDisciplineScope } from "./useDisciplineScope";
import { useSession } from "@/components/shell/SessionProvider";
import { backendClient } from "@/lib/api/client";
import type { MeResponse } from "@/lib/auth/types";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));
const params = vi.hoisted(() => ({ value: {} as Record<string, string> }));
vi.mock("next/navigation", () => ({ useParams: () => params.value }));

const PROJECT_A = "11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_B = "22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CATALOG = [
  { id: "d-elk", code: "ELK", name: "Elektrik", color: "#cbd5e1" },
  { id: "d-mek", code: "MEK", name: "Mekanik", color: "#64748b" },
  { id: "d-bos", code: "BOS", name: "  ", color: "#000000" },
];
const ME = {
  all_projects: false,
  projects: [
    { project_id: PROJECT_A, role_key: "site_chief", discipline_ids: ["d-elk"] },
    { project_id: PROJECT_B, role_key: "site_chief", discipline_ids: ["d-mek"] },
  ],
};

function mockMe(extra: Record<string, unknown> | null) {
  const me = extra === null ? null : ({ id: "u1", ...extra } as unknown as MeResponse);
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
}

function setup(catalog: unknown = CATALOG) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(backendClient.GET).mockResolvedValue(
    catalog === "403"
      ? ({ data: undefined, error: { detail: "Yetkisiz işlem" }, response: new Response(null, { status: 403 }) } as never)
      : ({ data: catalog, error: undefined, response: new Response() } as never),
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("useDisciplineScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    params.value = {};
  });

  it("proje atamasız kullanıcı kısıtsızdır ve katalog İSTENMEZ", () => {
    mockMe({ all_projects: false, projects: [{ project_id: PROJECT_A, role_key: "r", discipline_ids: [] }] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDisciplineScope(), { wrapper });
    expect(result.current).toEqual({ isRestricted: false, names: [], disciplines: [] });
    expect(backendClient.GET).not.toHaveBeenCalled();
  });

  it("oturum yokken ya da alan yokken kısıtsız sayılır", () => {
    const { wrapper } = setup();
    mockMe(null);
    expect(renderHook(() => useDisciplineScope(), { wrapper }).result.current.isRestricted).toBe(false);
    mockMe({});
    expect(renderHook(() => useDisciplineScope(), { wrapper }).result.current.isRestricted).toBe(false);
  });

  it("bağlamsız: birleşim kısıtlı; adlar katalogdan çözülür", async () => {
    mockMe(ME);
    const { wrapper } = setup();
    const { result } = renderHook(() => useDisciplineScope(), { wrapper });
    expect(result.current.isRestricted).toBe(true);
    expect(result.current.names).toEqual([]); // katalog gelene dek adsız (fail-quiet)
    await waitFor(() => expect(result.current.names).toEqual(["Elektrik", "Mekanik"]));
    expect(backendClient.GET).toHaveBeenCalledWith("/earned-value/disciplines", {});
  });

  it("adres param'ı projectId varsa PROJE bağlamı: yalnız o projenin disiplini", async () => {
    mockMe(ME);
    params.value = { projectId: PROJECT_B };
    const { wrapper } = setup();
    const { result } = renderHook(() => useDisciplineScope(), { wrapper });
    await waitFor(() => expect(result.current.names).toEqual(["Mekanik"]));
  });

  it("açık projectKey adres param'ını ezer; null bilerek bağlamsızdır", async () => {
    mockMe(ME);
    params.value = { projectId: PROJECT_B };
    const { wrapper } = setup();
    const explicit = renderHook(() => useDisciplineScope(PROJECT_A), { wrapper });
    await waitFor(() => expect(explicit.result.current.names).toEqual(["Elektrik"]));
    const unscoped = renderHook(() => useDisciplineScope(null), { wrapper });
    await waitFor(() => expect(unscoped.result.current.names).toEqual(["Elektrik", "Mekanik"]));
  });

  it("ekip dışı proje bağlamında kısıtsız", () => {
    mockMe(ME);
    const { wrapper } = setup();
    const { result } = renderHook(() => useDisciplineScope("99999999-9999-4999-8999-999999999999"), { wrapper });
    expect(result.current.isRestricted).toBe(false);
  });

  it("all_projects kısıtsız", () => {
    mockMe({ ...ME, all_projects: true });
    const { wrapper } = setup();
    expect(renderHook(() => useDisciplineScope(), { wrapper }).result.current.isRestricted).toBe(false);
  });

  it("katalog 403 → kısıtlı kalır, adlar boş, hata fırlatmaz (fail-quiet)", async () => {
    mockMe(ME);
    const { wrapper } = setup("403");
    const { result } = renderHook(() => useDisciplineScope(), { wrapper });
    await waitFor(() => expect(backendClient.GET).toHaveBeenCalled());
    expect(result.current).toMatchObject({ isRestricted: true, names: [] });
  });

  it("boşluk-only ad atılır; QueryClientProvider yokken de çökmez", async () => {
    mockMe({ all_projects: false, projects: [{ project_id: PROJECT_A, role_key: "r", discipline_ids: ["d-bos"] }] });
    const { wrapper } = setup();
    const { result } = renderHook(() => useDisciplineScope(), { wrapper });
    await waitFor(() => expect(backendClient.GET).toHaveBeenCalled());
    expect(result.current).toMatchObject({ isRestricted: true, names: [] });

    mockMe(ME);
    expect(renderHook(() => useDisciplineScope()).result.current).toMatchObject({ isRestricted: true, names: [] });
  });
});
