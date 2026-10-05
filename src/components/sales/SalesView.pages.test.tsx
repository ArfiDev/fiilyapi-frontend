import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SalesView } from "./SalesView";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useProjectUnits } from "@/lib/api/hooks/useProjectUnits";
import { useSales } from "@/lib/api/hooks/useSales";
import { useSalesSummary } from "@/lib/api/hooks/useSalesSummary";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — Satış Yönetimi görüntüleme kapısı = mali.satis Görür; grant yoksa `sales` izni.
vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjectUnits", () => ({ useProjectUnits: vi.fn() }));
vi.mock("@/lib/api/hooks/useSales", () => ({ useSales: vi.fn() }));
vi.mock("@/lib/api/hooks/useSalesSummary", () => ({ useSalesSummary: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/satis",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function queryStub(data: unknown) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DENIED = "Bu alana yetkiniz yok";
const TITLE = { name: "Satış Yönetimi", level: 1 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProjects).mockReturnValue(queryStub({ items: [{ id: "p-1", name: "Yeşilvadi Rezidans" }] }));
  vi.mocked(useSales).mockReturnValue(queryStub({ items: [], totals: undefined }));
  vi.mocked(useSalesSummary).mockReturnValue(queryStub(undefined));
  vi.mocked(useProjectUnits).mockReturnValue(queryStub({ blocks: [] }));
});

describe("SalesView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("mali.satis Görür → ekran açılır (sales none olsa bile)", () => {
    session(meFixture({ pages: { "mali.satis": pageGrant("view") }, permissions: { sales: "none" } }));
    render(<SalesView />);
    expect(screen.getByRole("heading", TITLE)).toBeInTheDocument();
  });

  it("mali.satis none → AccessDenied (sales full olsa bile)", () => {
    session(meFixture({ pages: { "mali.satis": pageGrant("none") }, permissions: { sales: "full" } }));
    render(<SalesView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByRole("heading", TITLE)).toBeNull();
  });

  it("pages boş → eski davranış (sales none → AccessDenied, view → açık)", () => {
    session(meFixture({ pages: {}, permissions: { sales: "none" } }));
    const { unmount } = render(<SalesView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { sales: "view" } }));
    render(<SalesView />);
    expect(screen.getByRole("heading", TITLE)).toBeInTheDocument();
  });
});
