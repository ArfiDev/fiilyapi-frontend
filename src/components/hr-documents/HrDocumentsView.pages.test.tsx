import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { HrDocumentsView } from "./HrDocumentsView";

// IZN-F5-ön — HR belge ekranının GÖRÜNTÜLEME kapısı (AccessDenied) ik.* (ik.personel/ik.izin_yonetimi/ik.belge_sertifika) sayfalarından karar verir
// (backend VIEW_GATE_PAGES). Grant yoksa bugünkü modül kararı (`personnel`) aynen kalır.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DENIED = "Bu alana yetkiniz yok";
const PAGE = "ik.personel";
const MODULE = "personnel";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HrDocumentsView />
    </QueryClientProvider>,
  );
}

describe("HrDocumentsView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ağ hiç yanıtlamaz: ekran yükleniyor durumunda kalır, yalnız kapı kararı sınanır.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ik.personel Görür → ekran açılır (modül none olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view") }, permissions: { [MODULE]: "none" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("ik.personel none → AccessDenied (modül full olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") }, permissions: { [MODULE]: "full" } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: modül izni view olsa bile reddedilir (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { [MODULE]: "none" } }));
    const { unmount } = renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();

    session(meFixture({ pages: {}, permissions: { [MODULE]: "view" } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("sistem yöneticisi: grant none olsa da ekran açılır", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") }, isSystemAdmin: true, permissions: { [MODULE]: "none" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
