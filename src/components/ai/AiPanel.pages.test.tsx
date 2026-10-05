import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { AiPanel } from "./AiPanel";

// IZN-F5-ön — FİİL AI görüntüleme kapısı (genel.fiil_ai) ve `GET /projects` açma kapısı (proje sayfaları)
// sayfa izninden karar verir. Grant yoksa bugünkü modül kararı aynen kalır.
const mockSession = vi.hoisted(() => ({ me: undefined as unknown }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: mockSession.me, isLoading: false }),
}));

const DENIED = "Bu alana yetkiniz yok";
const INPUT = "FİİL AI'ya sorun";

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

function ciz() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AiPanel />
    </QueryClientProvider>,
  );
}

function projectCalls() {
  return (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
    String(c[0]).includes("/projects"),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AiPanel · sayfa izni kapıları (IZN-F5-ön)", () => {
  it("genel.fiil_ai Görür → panel açılır (modül ai:none olsa da)", () => {
    stubFetch();
    mockSession.me = meFixture({ pages: { "genel.fiil_ai": pageGrant("view") }, permissions: { ai: "none" } });
    ciz();
    expect(screen.getByLabelText(INPUT)).toBeInTheDocument();
  });

  it("genel.fiil_ai none → AccessDenied (modül ai:view olsa da)", () => {
    stubFetch();
    mockSession.me = meFixture({ pages: { "genel.fiil_ai": pageGrant("none") }, permissions: { ai: "view" } });
    ciz();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → bugünkü davranış: ai:none reddedilir", () => {
    stubFetch();
    mockSession.me = meFixture({ pages: {}, permissions: { ai: "none" } });
    ciz();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("proje sayfaları none → GET /projects ağa çıkmaz (modül projects:view olsa da)", async () => {
    stubFetch();
    mockSession.me = meFixture({
      pages: { "genel.fiil_ai": pageGrant("view"), "genel.projeler": pageGrant("none") },
      permissions: { ai: "view", projects: "view" },
    });
    ciz();
    await screen.findByLabelText(INPUT);
    expect(projectCalls()).toHaveLength(0);
  });

  it("genel.projeler Görür → GET /projects çıkar (modül projects:none olsa da)", async () => {
    stubFetch();
    mockSession.me = meFixture({
      pages: { "genel.fiil_ai": pageGrant("view"), "genel.projeler": pageGrant("view") },
      permissions: { ai: "view", projects: "none" },
    });
    ciz();
    await waitFor(() => expect(projectCalls().length).toBeGreaterThan(0));
  });
});
