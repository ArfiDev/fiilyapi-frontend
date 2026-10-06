import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { LeavesView } from "./LeavesView";

// IZN-F5-ön — İzin ekranının GÖRÜNTÜLEME kapısı (AccessDenied) ik.* (ik.personel/ik.izin_yonetimi/ik.belge_sertifika) sayfalarından karar verir
// (backend VIEW_GATE_PAGES).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DENIED = "Bu alana yetkiniz yok";
const PAGE = "ik.izin_yonetimi";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LeavesView currentYear={2026} />
    </QueryClientProvider>,
  );
}

describe("LeavesView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ağ hiç yanıtlamaz: ekran yükleniyor durumunda kalır, yalnız kapı kararı sınanır.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ik.izin_yonetimi Görür → ekran açılır", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view") } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("ik.izin_yonetimi none → AccessDenied", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: reddedilir (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    const { unmount } = renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();

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
