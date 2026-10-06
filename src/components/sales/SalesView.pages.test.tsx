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
    session(meFixture({ pages: { "mali.satis": pageGrant("view") } }));
    render(<SalesView />);
    expect(screen.getByRole("heading", TITLE)).toBeInTheDocument();
  });

  it("mali.satis none → AccessDenied (sales full olsa bile)", () => {
    session(meFixture({ pages: { "mali.satis": pageGrant("none") } }));
    render(<SalesView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByRole("heading", TITLE)).toBeNull();
  });

  it("pages boş → fail-closed: sales full olsa bile AccessDenied (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    render(<SalesView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});

describe("SalesView · Blok/Ünite Ekle düğmeleri sekme başına yazma kapısı (IZN-F5b-A madde 2)", () => {
  const BLOCK = { name: "+ Blok Ekle" };
  const UNIT = { name: "+ Ünite Ekle" };
  const VIEW = { "mali.satis": pageGrant("view") };

  it("yalnız mali.satis_blok Düzenler → yalnız Blok Ekle", () => {
    session(meFixture({ pages: { ...VIEW, "mali.satis_blok": pageGrant("edit") } }));
    render(<SalesView />);
    expect(screen.getByRole("link", BLOCK)).toBeInTheDocument();
    expect(screen.queryByRole("link", UNIT)).toBeNull();
  });

  it("yalnız mali.satis_unite Düzenler → yalnız Ünite Ekle", () => {
    session(meFixture({ pages: { ...VIEW, "mali.satis_unite": pageGrant("edit") } }));
    render(<SalesView />);
    expect(screen.getByRole("link", UNIT)).toBeInTheDocument();
    expect(screen.queryByRole("link", BLOCK)).toBeNull();
  });

  it("blok/ünite Görür, kardeş sekmeler (toplu üretim/excel/paylaşım) Düzenler → ikisi de YOK", () => {
    session(
      meFixture({
        pages: {
          ...VIEW,
          "mali.satis_blok": pageGrant("view"),
          "mali.satis_unite": pageGrant("view"),
          "mali.satis_toplu_uretim": pageGrant("edit"),
          "mali.satis_excel": pageGrant("edit"),
          "mali.satis_paylasim": pageGrant("edit"),
        },
      }),
    );
    render(<SalesView />);
    expect(screen.queryByRole("link", BLOCK)).toBeNull();
    expect(screen.queryByRole("link", UNIT)).toBeNull();
  });
});
