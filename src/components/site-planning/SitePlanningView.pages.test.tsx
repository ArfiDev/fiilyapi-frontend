import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SitePlanningView } from "./SitePlanningView";
import { useSitePlan } from "@/lib/api/hooks/useSitePlan";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import {
  useSaveSitePlanCells,
  useSaveSitePlanGoals,
  useSaveSitePlanRows,
  useSaveSitePlanSprint,
} from "@/lib/api/hooks/useSitePlanMutations";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — Haftalık planlama görüntüleme kapısı = günlük kayıt sayfaları Görür (VEYA); grant yoksa
// `site_diary` izni. Proje bağlamı: URL'deki proje (`p-1`) ekip rolünün sayfa izinlerini seçer.
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("week=2026-08-03"),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSitePlan", () => ({ useSitePlan: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSections", () => ({ useSiteSections: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSite: vi.fn(() => ({ data: { id: "s-1", project: { id: "p-1" } } })),
}));
vi.mock("@/lib/api/hooks/useSitePlanMutations", () => ({
  useSaveSitePlanRows: vi.fn(),
  useSaveSitePlanCells: vi.fn(),
  useSaveSitePlanGoals: vi.fn(),
  useSaveSitePlanSprint: vi.fn(),
}));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DENIED = "Bu alana yetkiniz yok";

beforeEach(() => {
  vi.clearAllMocks();
  const mutation = { mutateAsync: vi.fn() } as never;
  vi.mocked(useSaveSitePlanRows).mockReturnValue(mutation);
  vi.mocked(useSaveSitePlanCells).mockReturnValue(mutation);
  vi.mocked(useSaveSitePlanGoals).mockReturnValue(mutation);
  vi.mocked(useSaveSitePlanSprint).mockReturnValue(mutation);
  vi.mocked(useSitePlan).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
  vi.mocked(useSiteSections).mockReturnValue({ data: undefined, isLoading: true, isError: false } as never);
});

describe("SitePlanningView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("santiye.gunluk_planlama Görür → açılır (site_diary none olsa bile)", () => {
    session(meFixture({ pages: { "santiye.gunluk_planlama": pageGrant("view") }, permissions: { site_diary: "none" } }));
    render(<SitePlanningView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("günlük kayıt sayfalarında yalnız none → AccessDenied (site_diary full olsa bile)", () => {
    session(meFixture({ pages: { "santiye.gunluk_planlama": pageGrant("none") }, permissions: { site_diary: "full" } }));
    render(<SitePlanningView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("proje rolü: o projedeki ekip rolü none ise ana rolün Düzenler'ini ezer", () => {
    session(
      meFixture({
        pages: { "santiye.gunluk_planlama": pageGrant("edit") },
        projects: [{ project_id: "p-1", role_key: "viewer" }],
        rolePages: { viewer: { "santiye.gunluk_planlama": pageGrant("none") } },
      }),
    );
    render(<SitePlanningView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → eski davranış (site_diary none → AccessDenied, view → açık)", () => {
    session(meFixture({ pages: {}, permissions: { site_diary: "none" } }));
    const { unmount } = render(<SitePlanningView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { site_diary: "view" } }));
    render(<SitePlanningView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
