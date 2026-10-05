import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { backendClient } from "@/lib/api/client";
import { useSetUserAccess, useUserAccess, USER_ACCESS_QUERY_KEY } from "./useUserAccess";
import { USERS_QUERY_KEY } from "./useUsers";
import { ROLES_QUERY_KEY } from "./useRoles";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), PUT: vi.fn() } }));

const ACCESS = { role_id: "r-1", all_projects: false, projects: [] };
const ok = (data: unknown) => ({ data, error: undefined, response: new Response() }) as never;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useUserAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET /users/{id}/access çağırır", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(ok(ACCESS));
    const { wrapper } = setup();
    const { result } = renderHook(() => useUserAccess("u-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/users/{user_id}/access", { params: { path: { user_id: "u-1" } } });
  });

  it("boş id ile ağa çıkmaz", () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useUserAccess(""), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(backendClient.GET).not.toHaveBeenCalled();
  });
});

describe("useSetUserAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUT gövdesini aynen gönderir; başarıda erişim önbelleğine yazar, kullanıcı + rol listelerini tazeler", async () => {
    vi.mocked(backendClient.PUT).mockResolvedValue(ok(ACCESS));
    const { client, wrapper } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSetUserAccess(), { wrapper });
    const body = { role_id: "r-1", all_projects: false, projects: [] };

    await act(async () => {
      await result.current.mutateAsync({ id: "u-1", body });
    });

    expect(backendClient.PUT).toHaveBeenCalledWith("/users/{user_id}/access", { params: { path: { user_id: "u-1" } }, body });
    expect(client.getQueryData([USER_ACCESS_QUERY_KEY, "u-1"])).toEqual(ACCESS);
    const keys = invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining([USERS_QUERY_KEY, ROLES_QUERY_KEY]));
  });
});
