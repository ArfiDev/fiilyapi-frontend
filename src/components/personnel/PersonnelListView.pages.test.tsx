import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { PersonnelListView } from "./PersonnelListView";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useHrDocumentsSummary } from "@/lib/api/hooks/useHrDocuments";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — Personel listesi görüntüleme kapısı = ik.* sayfaları Görür (VEYA); grant yoksa `personnel` izni.
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useHrDocuments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useHrDocuments")>()),
  useHrDocumentsSummary: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/personel",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function stub(data: unknown) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

const DENIED = "Bu alana yetkiniz yok";
const TITLE = { name: "İnsan Kaynakları" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePersonnel).mockReturnValue(stub({ items: [], total: 0, limit: 200, offset: 0 }));
  vi.mocked(useProjects).mockReturnValue(stub({ items: [] }));
  vi.mocked(useHrDocumentsSummary).mockReturnValue(stub(undefined));
});

describe("PersonnelListView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("ik.personel Görür → açılır (personnel none olsa bile)", () => {
    session(meFixture({ pages: { "ik.personel": pageGrant("view") }, permissions: { personnel: "none" } }));
    render(<PersonnelListView />);
    expect(screen.getByRole("heading", TITLE)).toBeInTheDocument();
  });

  it("ik.* sayfalarında yalnız none → AccessDenied (personnel full olsa bile)", () => {
    session(meFixture({ pages: { "ik.personel": pageGrant("none") }, permissions: { personnel: "full" } }));
    render(<PersonnelListView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: modül izni view olsa bile reddedilir (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { personnel: "none" } }));
    const { unmount } = render(<PersonnelListView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { personnel: "view" } }));
    render(<PersonnelListView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
