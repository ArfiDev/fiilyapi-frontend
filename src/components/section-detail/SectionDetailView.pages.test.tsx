import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SectionDetailView } from "./SectionDetailView";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useSession } from "@/components/shell/SessionProvider";
import { useTimesheetData } from "@/components/timesheet/useTimesheetData";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import type { SiteDetail } from "@/lib/api/hooks/useSites";

// IZN-F5-ön — bölüm detayı görüntüleme kapısı = santiye.bolumler / bolum.detay Görür (VEYA); grant yoksa `sites` izni.
vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/components/timesheet/useTimesheetData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/timesheet/useTimesheetData")>()),
  useTimesheetData: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";
const SECTION_ID = "55555555-5555-5555-5555-555555555555";

vi.mock("next/navigation", async () =>
  (await import("./section-nav.testkit")).sectionNavModule(() => ({
    projectId: PROJECT_ID,
    siteId: SITE_ID,
    sectionId: SECTION_ID,
  })),
);

const SITE = { id: SITE_ID, name: "A-Blok Şantiyesi", project: { id: PROJECT_ID } } as unknown as SiteDetail;
const DENIED = "Bu alana yetkiniz yok";
const LOADING = "Yükleniyor…";

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SectionDetailView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSection).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
  vi.mocked(useSite).mockReturnValue({ data: SITE, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useBoq).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
  vi.mocked(useTimesheetData).mockReturnValue({
    view: undefined,
    isLoading: true,
    isError: false,
    isForbidden: false,
    isPersonnelUnavailable: false,
    personnelTruncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
  } as never);
});

describe("SectionDetailView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("bolum.detay Görür → ekran açılır (sites none olsa bile)", () => {
    session(meFixture({ pages: { "bolum.detay": pageGrant("view") } }));
    renderView();
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("santiye.bolumler / bolum.detay none → AccessDenied (sites full olsa bile)", () => {
    session(
      meFixture({
        pages: { "santiye.bolumler": pageGrant("none"), "bolum.detay": pageGrant("none") },
      }),
    );
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("proje rolü: ekip rolünün bolum.detay none'ı o projede ana rolü ezer", () => {
    session(
      meFixture({
        pages: { "bolum.detay": pageGrant("edit") },
        projects: [{ project_id: PROJECT_ID, role_key: "viewer" }],
        rolePages: { viewer: { "bolum.detay": pageGrant("none") } },
      }),
    );
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: sites full olsa bile AccessDenied (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
