import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { ConvertScreen } from "./ConvertScreen";

// IZN-F5-ön — Teklif → Proje Dönüştür ekranının kapısı (AccessDenied, Onaylar) teklif.teklif_hazirlama sayfalarından karar verir
// (backend APPROVE_ROUTE_PAGES). Grant yoksa bugünkü modül kararı (`projects ≥ admin` ∧ `contracts ≥ full`) aynen kalır.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useParams: () => ({}),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DENIED = "Bu alana yetkiniz yok";
const PAGE = "teklif.teklif_hazirlama";
const ADMIN = { projects: "admin", contracts: "full" };
const NONE = { projects: "none", contracts: "none" };

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConvertScreen offerId="o-1" />
    </QueryClientProvider>,
  );
}

describe("ConvertScreen · sayfa izni Onaylar kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ağ hiç yanıtlamaz: ekran yükleniyor durumunda kalır, yalnız kapı kararı sınanır.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("teklif.teklif_hazirlama Onaylar → ekran açılır (modül izinleri none olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view", true) }, permissions: NONE }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("teklif.teklif_hazirlama Düzenler (Onaylar YOK) → AccessDenied (modüller admin/full olsa da)", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("edit") }, permissions: ADMIN }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → bugünkü davranış: projects:admin ∧ contracts:full açılır, eksikse reddedilir", () => {
    session(meFixture({ pages: {}, permissions: { projects: "full", contracts: "full" } }));
    const { unmount } = renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();

    session(meFixture({ pages: {}, permissions: ADMIN }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("sistem yöneticisi: Onaylar yokken de ekran açılır", () => {
    session(meFixture({ pages: { [PAGE]: pageGrant("view") }, isSystemAdmin: true, permissions: NONE }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
