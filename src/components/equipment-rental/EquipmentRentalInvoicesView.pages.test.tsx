import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { EquipmentRentalInvoicesView } from "./EquipmentRentalInvoicesView";

// IZN-F5-ön — Makine kira listesinin GÖRÜNTÜLEME kapısı (salt-okunur işareti `makine-kira-readonly`) saha.makine_* sayfalarından karar verir
// (backend VIEW_GATE_PAGES).
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const MARKER = "makine-kira-readonly";
const PAGE = "saha.makine_kira";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EquipmentRentalInvoicesView />
    </QueryClientProvider>,
  );
}

describe("EquipmentRentalInvoicesView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ağ hiç yanıtlamaz: ekran yükleniyor durumunda kalır, yalnız kapı kararı sınanır.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saha.makine_kira Görür → işaret yok", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view") } }));
    renderView();
    expect(screen.queryByTestId(MARKER)).toBeNull();
  });

  it("saha.makine_kira none → işaret var", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") } }));
    renderView();
    expect(screen.getByTestId(MARKER)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: işaret var (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    renderView();
    expect(screen.getByTestId(MARKER)).toBeInTheDocument();
  });

  it("sistem yöneticisi: grant none olsa da işaret yok", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("none") }, isSystemAdmin: true }));
    renderView();
    expect(screen.queryByTestId(MARKER)).toBeNull();
  });
});

describe("EquipmentRentalInvoicesView · '+ Yeni Kira Hakedişi' = saha.makine_kira Düzenler (IZN-F5b-A madde 11)", () => {
  const CREATE = "makine-kira-create";
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("yalnız saha.makine_kira Düzenler → düğme var", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("edit") } }));
    renderView();
    expect(screen.getByTestId(CREATE)).toBeInTheDocument();
  });

  it("yalnız KARDEŞ sayfalar (ekipman/çalışma/yakıt) Düzenler, kira Görür → düğme YOK", () => {
    session(
      meFixture({
        pages: {
          [PAGE]: pageGrant("view"),
          "saha.makine_ekipman": pageGrant("edit"),
          "saha.makine_calisma": pageGrant("edit"),
          "saha.makine_yakit": pageGrant("edit"),
        },
      }),
    );
    renderView();
    expect(screen.queryByTestId(CREATE)).toBeNull();
  });
});
