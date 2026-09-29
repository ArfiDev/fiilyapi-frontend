import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useSetUserDisciplines, useUserDisciplines } from "./useUserDisciplines";
import { backendClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn(), PUT: vi.fn() } }));

const reply = (data: unknown) => ({ data, error: undefined, response: new Response() });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useSetUserDisciplines", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUT sonrası kullanıcının sorgusu yanıttan yazılır (ek GET yok)", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue(reply({ discipline_ids: ["old"] }) as never);
    vi.mocked(backendClient.PUT).mockResolvedValue(reply({ discipline_ids: ["new"] }) as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ read: useUserDisciplines("u1"), write: useSetUserDisciplines("u1") }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.read.data?.discipline_ids).toEqual(["old"]));
    const getCalls = vi.mocked(backendClient.GET).mock.calls.length;

    await act(() => result.current.write.mutateAsync({ discipline_ids: ["new"] }));

    await waitFor(() => expect(result.current.read.data?.discipline_ids).toEqual(["new"]));
    expect(vi.mocked(backendClient.GET).mock.calls.length).toBe(getCalls);
  });

  it("uçuştaki bayat GET, PUT'tan SONRA dönse bile yeni atamayı EZMEZ (cancelQueries)", async () => {
    let releaseStale: (value: unknown) => void = () => {};
    vi.mocked(backendClient.GET).mockImplementation(
      (() => new Promise((resolve) => (releaseStale = resolve))) as never,
    );
    vi.mocked(backendClient.PUT).mockResolvedValue(reply({ discipline_ids: ["new"] }) as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => ({ read: useUserDisciplines("u1"), write: useSetUserDisciplines("u1") }), {
      wrapper,
    });
    await waitFor(() => expect(backendClient.GET).toHaveBeenCalled());

    await act(() => result.current.write.mutateAsync({ discipline_ids: ["new"] }));
    await act(async () => {
      releaseStale(reply({ discipline_ids: ["stale"] }));
    });

    await waitFor(() => expect(result.current.read.data?.discipline_ids).toEqual(["new"]));
    // Bayat yanıt sonradan işlense de kalıcı olarak "new" kalır.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.read.data?.discipline_ids).toEqual(["new"]);
  });
});
