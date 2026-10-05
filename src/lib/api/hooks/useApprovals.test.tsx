import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import {
  useApprovalHistory,
  useUpdateApprovalSettings,
  APPROVALS_QUERY_KEY,
  APPROVAL_SETTINGS_QUERY_KEY,
} from "./useApprovals";
import { backendClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({ backendClient: { PUT: vi.fn(), GET: vi.fn() } }));

const SETTINGS_RESPONSE = { approval_threshold_try: "1000.00" };

function spyOnInvalidate(queryClient: QueryClient) {
  return vi.spyOn(queryClient, "invalidateQueries");
}

describe("useUpdateApprovalSettings", () => {
  let client: QueryClient;
  let invalidateSpy: ReturnType<typeof spyOnInvalidate>;

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    invalidateSpy = spyOnInvalidate(client);
    vi.mocked(backendClient.PUT).mockResolvedValue({
      data: SETTINGS_RESPONSE,
      error: undefined,
      response: new Response(),
    } as never);
  });

  // KAYIT 446: eşik değiştikten sonra onay kutusu (APPROVALS_QUERY_KEY) eski
  // eşikle karar vermeye devam etmemeli — kardeş mutasyon (eski rol ataması)
  // ile AYNI kapsamı geçersiz kılmalı.
  it("eşik güncellenince hem approval-settings hem approvals geçersiz kılınır", async () => {
    const { result } = renderHook(() => useUpdateApprovalSettings(), { wrapper });

    act(() => result.current.mutate("1000.00"));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [APPROVAL_SETTINGS_QUERY_KEY] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [APPROVALS_QUERY_KEY] });
  });
});

describe("useApprovalHistory", () => {
  let client: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: { items: [], total: 0, limit: 200, offset: 0 },
      error: undefined,
      response: new Response(),
    } as never);
  });

  it("decision ve limit'i GET /approvals/history'ye AYNEN iletir", async () => {
    const { result } = renderHook(() => useApprovalHistory({ decision: "rejected", limit: 200 }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(backendClient.GET).toHaveBeenCalledWith("/approvals/history", {
      params: { query: { decision: "rejected", limit: 200 } },
    });
  });

  it("sorgu anahtarı ['approvals','history',decision,...] — kök önek mutasyon invalidation'ını kapsar", async () => {
    const { result } = renderHook(() => useApprovalHistory({ decision: "approved", limit: 200 }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryCache().find({ queryKey: [APPROVALS_QUERY_KEY, "history", "approved", 200, null] })).toBeDefined();

    await client.invalidateQueries({ queryKey: [APPROVALS_QUERY_KEY] });
    expect(backendClient.GET).toHaveBeenCalledTimes(2);
  });

  it("enabled=false iken İSTEK ATMAZ", async () => {
    renderHook(() => useApprovalHistory({ decision: "all", limit: 200 }, { enabled: false }), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(backendClient.GET).not.toHaveBeenCalled();
  });
});
