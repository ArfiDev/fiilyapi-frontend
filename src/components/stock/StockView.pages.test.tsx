import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { StockView } from "./StockView";
import { useStockSummary } from "@/lib/api/hooks/useStockSummary";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — Stok görüntüleme kapısı = stok.stok_depo / santiye.stok / bolum.malzeme Görür (VEYA);
// yazma = stok.stok_depo / santiye.stok Düzenler. Grant yoksa `inventory` izni.
vi.mock("@/lib/api/hooks/useStockSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useStockSummary")>()),
  useStockSummary: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useStockMutations", () => ({
  useCreateStockItem: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateWarehouse: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/hooks/useProjects", () => ({
  useProjects: () => ({ data: { items: [] }, isLoading: false, isError: false, error: null }),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSites: () => ({ data: { items: [] }, isLoading: false, isError: false, error: null }),
}));
vi.mock("@/lib/api/hooks/useSiteFanOutOptions", () => ({
  useSiteFanOutOptions: () => ({
    options: [],
    isLoading: false,
    isError: false,
    failedProjectNames: [],
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
    isPartial: false,
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/stok",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DENIED = "Bu alana yetkiniz yok";
const TITLE_RE = /Stok/;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useStockSummary).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

describe("StockView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("stok.stok_depo Görür → açılır (inventory none olsa bile)", () => {
    session(meFixture({ pages: { "stok.stok_depo": pageGrant("view") }, permissions: { inventory: "none" } }));
    render(<StockView />);
    expect(screen.queryByText(DENIED)).toBeNull();
    expect(screen.getAllByText(TITLE_RE).length).toBeGreaterThan(0);
  });

  it("bolum.malzeme Görür → açılır (ikiz görüntüleme sayfası)", () => {
    session(meFixture({ pages: { "stok.stok_depo": pageGrant("none"), "bolum.malzeme": pageGrant("view") } }));
    render(<StockView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("stok sayfalarında yalnız none → AccessDenied (inventory full olsa bile)", () => {
    session(meFixture({ pages: { "stok.stok_depo": pageGrant("none") }, permissions: { inventory: "full" } }));
    render(<StockView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → eski davranış (inventory none → AccessDenied, view → açık)", () => {
    session(meFixture({ pages: {}, permissions: { inventory: "none" } }));
    const { unmount } = render(<StockView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { inventory: "view" } }));
    render(<StockView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
