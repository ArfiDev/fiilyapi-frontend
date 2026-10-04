import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useProjects, useProject, PROJECT_LIST_MAX_LIMIT } from "./useProjects";
import { backendClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({ backendClient: { GET: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const RESPONSE = {
  counts: { all: 4, taahhut: 2, kendi_yatirim: 1, kat_karsiligi: 1, completed: 1 },
  items: [],
};

describe("useProjects", () => {
  beforeEach(() => vi.clearAllMocks());

  // 🔴 KAYIT 139: `limit` VERİLMEZSE istek de limitsiz GİTMEZ — sunucu
  // varsayılanı (50) 24 çağıran ekranda projeleri SESSİZCE kırpıyordu.
  // Varsayılan artık `PROJECT_LIST_MAX_LIMIT` (200) olarak AÇIKÇA gönderilir.
  it("filtresiz istekte varsayılan limit (PROJECT_LIST_MAX_LIMIT) AÇIKÇA gider", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: RESPONSE, error: undefined, response: new Response(),
    } as never);

    const { result } = renderHook(() => useProjects(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.counts.all).toBe(4);
    expect(backendClient.GET).toHaveBeenCalledWith("/projects", {
      params: { query: { limit: PROJECT_LIST_MAX_LIMIT } },
    });
  });

  it("tip ve durum filtrelerini query parametresine cevirir", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: RESPONSE, error: undefined, response: new Response(),
    } as never);

    const { result } = renderHook(() => useProjects({ type: "taahhut" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/projects", {
      params: { query: { type: "taahhut" } },
    });
  });

  // F-PRJPAGE — sessiz kırpma korkuluğu: `limit`/`offset` istek parametresinde
  // FİİLEN gitmeli (kod okuması değil, istek iddiası).
  it("limit ve offset acikca istek parametresine gider", async () => {
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: RESPONSE, error: undefined, response: new Response(),
    } as never);

    const { result } = renderHook(
      () => useProjects({ limit: PROJECT_LIST_MAX_LIMIT, offset: 0 }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(backendClient.GET).toHaveBeenCalledWith("/projects", {
      params: { query: { limit: 200, offset: 0 } },
    });
  });
});

describe("useProject", () => {
  beforeEach(() => vi.clearAllMocks());

  it("proje_id ile tekil proje ceker", async () => {
    const detail = { id: "p-1", name: "Güneşkent Konut", site_count: 2 };
    vi.mocked(backendClient.GET).mockResolvedValue({
      data: detail, error: undefined, response: new Response(),
    } as never);

    const { result } = renderHook(() => useProject("p-1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.name).toBe("Güneşkent Konut");
    expect(backendClient.GET).toHaveBeenCalledWith("/projects/{project_id}", {
      params: { path: { project_id: "p-1" } },
    });
  });

  // 🔴 KAYIT 456: boş id ile ağa ÇIKILMAZ — `useSites.ts` emsaliyle AYNI
  // desen. Rota parametresi boşken (ör. henüz çözülmemiş) 422 sınıfı kusura
  // açılmasın diye sorgu kapalı kalmalı.
  it("boş projectId ile ağa çıkmaz (enabled=false)", async () => {
    const { result } = renderHook(() => useProject(""), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(backendClient.GET).not.toHaveBeenCalled();
  });
});
