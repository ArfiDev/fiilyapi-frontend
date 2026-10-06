import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { EquipmentDetailView } from "./EquipmentDetailView";

// IZN-F5-ön — Makine detay ekranının GÖRÜNTÜLEME kapısı (AccessDenied) saha.makine_* sayfalarından karar verir
// (backend VIEW_GATE_PAGES).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DENIED = "Bu alana yetkiniz yok";
const PAGE = "saha.makine_ekipman";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EquipmentDetailView equipmentId="eq-1" />
    </QueryClientProvider>,
  );
}

describe("EquipmentDetailView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ağ hiç yanıtlamaz: ekran yükleniyor durumunda kalır, yalnız kapı kararı sınanır.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saha.makine_ekipman Görür → ekran açılır", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view") } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("saha.makine_ekipman none → AccessDenied", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: AccessDenied (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("sistem yöneticisi: grant none olsa da ekran açılır", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") }, isSystemAdmin: true }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
