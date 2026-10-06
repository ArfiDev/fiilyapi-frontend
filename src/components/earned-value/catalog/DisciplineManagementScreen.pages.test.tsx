import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { DisciplineManagementScreen } from "./DisciplineManagementScreen";
import { BETON, DUV, INC, KAB, mockGets } from "./catalog-test-utils";

// IZN-F5b madde 10 · Disiplin yazma (POST/PATCH /earned-value/disciplines) = YALNIZ
// planlama.disiplin_yonetimi Düzenler (DISCIPLINES_EDIT); birim oran kataloğu sayfası AÇMAZ.
vi.mock("@/lib/api/client", () => ({
  backendClient: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() },
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// Modül izni bilerek view: grant'sız (geri uyum) karar KAPALI olsun.
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({ level: "view", canView: true, canWrite: false, canDelete: false }),
}));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DisciplineManagementScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGets({ disciplines: [KAB, DUV, INC], catalog: [BETON] });
});

describe("DisciplineManagementScreen · yazma kapısı DISCIPLINES_EDIT (IZN-F5b)", () => {
  it("planlama.disiplin_yonetimi Düzenler → '+ Yeni disiplin' var; Sil yok (yalnız SA)", async () => {
    session(meFixture({ pages: { "planlama.disiplin_yonetimi": pageGrant("edit") } }));
    renderPage();
    expect(await screen.findByRole("button", { name: "+ Yeni disiplin" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("yalnız planlama.birim_oran_katalogu Düzenler → '+ Yeni disiplin' YOK (liste yine görünür)", async () => {
    session(meFixture({ pages: { "planlama.birim_oran_katalogu": pageGrant("edit") } }));
    renderPage();
    await screen.findByText("Kaba İnşaat");
    expect(screen.queryByRole("button", { name: "+ Yeni disiplin" })).not.toBeInTheDocument();
  });
});
