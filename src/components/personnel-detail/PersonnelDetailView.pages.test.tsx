import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { PersonnelDetailView } from "./PersonnelDetailView";
import { usePersonnelDetail } from "@/lib/api/hooks/usePersonnelDetail";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { usePersonnelDocuments } from "@/lib/api/hooks/useHrDocuments";
import { useSession } from "@/components/shell/SessionProvider";
import { EMPTY_PERSONNEL_HR_FIELDS } from "@/lib/api/hooks/personnel-fixtures";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — personel detayı görüntüleme kapısı = ik.* sayfaları Görür (VEYA); grant yoksa modül izni.
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "per-9" }) }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnelDetail", () => ({ usePersonnelDetail: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useHrDocuments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useHrDocuments")>()),
  usePersonnelDocuments: vi.fn(),
}));

const PERSON = {
  ...EMPTY_PERSONNEL_HR_FIELDS,
  id: "per-9",
  full_name: "Mehmet Yılmaz",
  trade: "Kalıpçı Usta",
  source: "company" as const,
  subcontractor_id: null,
  user_id: null,
  is_active: true,
  assigned_project_id: null,
};

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DENIED = "Bu alana yetkiniz yok";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePersonnelDetail).mockReturnValue({ data: PERSON, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useProjects).mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, error: null } as never);
  vi.mocked(usePersonnelDocuments).mockReturnValue({ data: [], isLoading: false, isError: false, error: null } as never);
});

describe("PersonnelDetailView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("ik.personel Görür → kart açılır (modül none olsa bile)", () => {
    session(meFixture({ pages: { "ik.personel": pageGrant("view") }, permissions: { personnel: "none" } }));
    render(<PersonnelDetailView />);
    expect(screen.getByTestId("personnel-header-card")).toBeInTheDocument();
  });

  it("ik.* sayfalarında yalnız none → AccessDenied (modül full olsa bile)", () => {
    session(meFixture({ pages: { "ik.personel": pageGrant("none") }, permissions: { personnel: "full" } }));
    render(<PersonnelDetailView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    expect(screen.queryByTestId("personnel-header-card")).toBeNull();
  });

  it("pages boş → fail-closed: modül izni view olsa bile reddedilir (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { personnel: "none" } }));
    const { unmount } = render(<PersonnelDetailView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { personnel: "view" } }));
    render(<PersonnelDetailView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
