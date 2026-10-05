import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteDiaryDetailView } from "./SiteDiaryDetailView";
import { useSiteDiaryEntry } from "@/lib/api/hooks/useSiteDiary";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — Günlük kayıt detayı görüntüleme kapısı = günlük kayıt sayfaları Görür (VEYA); grant yoksa
// `site_diary` izni. Proje bağlamı: URL'deki proje anahtarı ekip rolünün sayfa izinlerini seçer.
const PROJECT_KEY = "guneskent";

vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "guneskent", siteId: "a-blok", sectionId: "kat-6-10", entryId: "e-24" }),
}));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const FORBIDDEN = "Günlük kayıtları görme yetkiniz yok";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSite).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
  vi.mocked(useSection).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
  vi.mocked(useSiteDiaryEntry).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
});

describe("SiteDiaryDetailView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("bolum.gunluk_kayit_detay Görür → açılır (site_diary none olsa bile)", () => {
    session(
      meFixture({ pages: { "bolum.gunluk_kayit_detay": pageGrant("view") }, permissions: { site_diary: "none" } }),
    );
    render(<SiteDiaryDetailView />);
    expect(screen.queryByText(FORBIDDEN)).toBeNull();
  });

  it("günlük kayıt sayfalarında yalnız none → yetki yok (site_diary full olsa bile)", () => {
    session(
      meFixture({ pages: { "bolum.gunluk_kayit_detay": pageGrant("none") }, permissions: { site_diary: "full" } }),
    );
    render(<SiteDiaryDetailView />);
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument();
  });

  it("proje rolü: ekip rolü none ise ana rolün Görür'ünü ezer", () => {
    session(
      meFixture({
        pages: { "bolum.gunluk_kayit_detay": pageGrant("view") },
        projects: [{ project_id: PROJECT_KEY, role_key: "viewer" }],
        rolePages: { viewer: { "bolum.gunluk_kayit_detay": pageGrant("none") } },
      }),
    );
    render(<SiteDiaryDetailView />);
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument();
  });

  it("pages boş → eski davranış (site_diary none → yetki yok, view → açık)", () => {
    session(meFixture({ pages: {}, permissions: { site_diary: "none" } }));
    const { unmount } = render(<SiteDiaryDetailView />);
    expect(screen.getByText(FORBIDDEN)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { site_diary: "view" } }));
    render(<SiteDiaryDetailView />);
    expect(screen.queryByText(FORBIDDEN)).toBeNull();
  });
});
