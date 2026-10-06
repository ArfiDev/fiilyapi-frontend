import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteCreateView } from "./SiteCreateView";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useCreateSite } from "@/lib/api/hooks/useSiteMutations";
import { useUserOptions } from "@/lib/api/hooks/useUserOptions";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5c — "Yeni Şantiye" formu proje.santiyeler Düzenler kapısından açılır
// (POST /projects/{id}/sites = backend proje.santiyeler Düzenler).
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/api/hooks/useUserOptions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useUserOptions")>()),
  useUserOptions: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteMutations", () => ({ useCreateSite: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const FORM = { name: /Yeni Şantiye/, level: 1 } as const;

describe("SiteCreateView · sayfa izni kapısı (IZN-F5c)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProject).mockReturnValue({
      data: { id: PROJECT_ID, name: "Güneşkent Konut", code: "SZL-1", project_type: "taahhut" },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    vi.mocked(useCreateSite).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(useUserOptions).mockReturnValue({
      options: [],
      isForbidden: false,
      isLoading: false,
      isError: false,
    } as never);
  });

  it("proje.santiyeler Düzenler → form var", () => {
    session(meFixture({ pages: { "proje.santiyeler": pageGrant("edit") } }));
    render(<SiteCreateView />);
    expect(screen.getByRole("heading", FORM)).toBeInTheDocument();
  });

  it("proje.santiyeler Görür + santiye.bolumler/bolum.detay Düzenler (eski küme) → AccessDenied, form YOK", () => {
    session(
      meFixture({
        pages: {
          "proje.santiyeler": pageGrant("view", true),
          "santiye.bolumler": pageGrant("edit"),
          "bolum.detay": pageGrant("edit"),
        },
      }),
    );
    render(<SiteCreateView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", FORM)).toBeNull();
  });

  it("pages boş → fail-closed: form açılmaz (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    render(<SiteCreateView />);
    expect(screen.queryByRole("heading", FORM)).toBeNull();
  });

  it("sistem yöneticisi: grant none olsa da form var", () => {
    session(meFixture({ pages: { "proje.santiyeler": pageGrant("none") }, isSystemAdmin: true }));
    render(<SiteCreateView />);
    expect(screen.getByRole("heading", FORM)).toBeInTheDocument();
  });
});
