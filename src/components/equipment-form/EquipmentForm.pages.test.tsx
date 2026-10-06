import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { EquipmentForm } from "./EquipmentForm";

// IZN-F5-ön — Makine formunun YAZMA kapısı (Düzenler) (AccessDenied) saha.makine_ekipman sayfalarından karar verir
// (backend EDIT_GATE_PAGES). Grant yoksa bugünkü modül kararı (`personnel`) aynen kalır.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DENIED = "Bu alana yetkiniz yok";
const PAGE = "saha.makine_ekipman";
const MODULE = "equipment";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EquipmentForm mode="create" />
    </QueryClientProvider>,
  );
}

describe("EquipmentForm · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ağ hiç yanıtlamaz: ekran yükleniyor durumunda kalır, yalnız kapı kararı sınanır.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saha.makine_ekipman Düzenler → form açılır (modül none olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("edit") }, permissions: { [MODULE]: "none" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("saha.makine_ekipman yalnız Görür → AccessDenied (modül full olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view") }, permissions: { [MODULE]: "full" } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → bugünkü davranış: modül view reddedilir, full açılır", () => {
    session(meFixture({ pages: {}, permissions: { [MODULE]: "view" } }));
    const { unmount } = renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();

    session(meFixture({ pages: {}, permissions: { [MODULE]: "full" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("sistem yöneticisi: grant none olsa da form açılır", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") }, isSystemAdmin: true, permissions: { [MODULE]: "none" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("yalnız KARDEŞ sayfalar (çalışma/yakıt/kira) Düzenler, ekipman Görür → AccessDenied (IZN-F5b-A madde 11)", () => {
    session(
      meFixture({
        pages: {
          [PAGE]: pageGrant("view"),
          "saha.makine_calisma": pageGrant("edit"),
          "saha.makine_yakit": pageGrant("edit"),
          "saha.makine_kira": pageGrant("edit"),
        },
        permissions: { [MODULE]: "full" },
      }),
    );
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
