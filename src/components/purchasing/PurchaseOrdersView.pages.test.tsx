import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { PurchaseOrdersView } from "./PurchaseOrdersView";
import { usePurchaseOrders } from "@/lib/api/hooks/usePurchaseOrders";
import { usePurchasingSummary } from "@/lib/api/hooks/usePurchasingSummary";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — satınalma görüntüleme kapısı = stok.* satınalma sayfaları Görür (VEYA); grant yoksa `procurement` izni.
vi.mock("@/lib/api/hooks/usePurchaseOrders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePurchaseOrders")>()),
  usePurchaseOrders: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: () => ({ data: { items: [] }, isLoading: false, isError: false, error: null }),
}));
vi.mock("@/lib/api/hooks/usePurchasingSummary", () => ({ usePurchasingSummary: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/satinalma/siparisler",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DENIED = "Bu alana yetkiniz yok";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePurchasingSummary).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
  vi.mocked(usePurchaseOrders).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

describe("PurchaseOrdersView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("stok.siparisler Görür → açılır (modül none olsa bile)", () => {
    session(meFixture({ pages: { "stok.siparisler": pageGrant("view") } }));
    render(<PurchaseOrdersView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("satınalma sayfalarında yalnız none → AccessDenied (modül full olsa bile)", () => {
    session(meFixture({ pages: { "stok.siparisler": pageGrant("none") } }));
    render(<PurchaseOrdersView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("ikiz kapı: stok.tedarikciler Görür → açılır", () => {
    session(meFixture({ pages: { "stok.siparisler": pageGrant("none"), "stok.tedarikciler": pageGrant("view") } }));
    render(<PurchaseOrdersView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("pages boş → fail-closed: procurement full olsa bile AccessDenied (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    render(<PurchaseOrdersView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
