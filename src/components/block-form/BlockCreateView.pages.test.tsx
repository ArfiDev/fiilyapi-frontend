import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { BlockCreateView } from "./BlockCreateView";

// IZN-F5-ön — Blok oluşturma ekranının YAZMA kapısı (Düzenler) (AccessDenied) mali.satis_blok sayfalarından karar verir
// (backend EDIT_GATE_PAGES). Grant yoksa bugünkü modül kararı (`personnel`) aynen kalır.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DENIED = "Bu alana yetkiniz yok";
const PAGE = "mali.satis_blok";
const MODULE = "projects";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BlockCreateView />
    </QueryClientProvider>,
  );
}

describe("BlockCreateView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ağ hiç yanıtlamaz: ekran yükleniyor durumunda kalır, yalnız kapı kararı sınanır.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("mali.satis_blok Düzenler → form açılır (modül none olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("edit") }, permissions: { [MODULE]: "none" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("mali.satis_blok yalnız Görür → AccessDenied (modül full olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view") }, permissions: { [MODULE]: "full" } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: modül full olsa bile AccessDenied (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { [MODULE]: "full" } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("sistem yöneticisi: grant none olsa da form açılır", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") }, isSystemAdmin: true, permissions: { [MODULE]: "none" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
