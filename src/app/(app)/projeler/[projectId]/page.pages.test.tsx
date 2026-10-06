import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import ProjectDetailPage from "./page";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5c — iki "+ Şantiye Ekle" bağlantısı (üst bar + boş durum) = proje.santiyeler Düzenler
// (POST /projects/{id}/sites). Önceden KAPISIZdı.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSites: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID }),
  usePathname: () => `/projeler/${PROJECT_ID}`,
}));

const ADD = { name: "+ Şantiye Ekle" } as const;

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProject).mockReturnValue({
    data: {
      id: PROJECT_ID,
      code: "SZL-1",
      name: "Güneşkent Konut",
      project_type: "taahhut",
      status: "active",
      site_count: 0,
      employer_name: null,
      contract_amount: null,
      budget_lines: { material: "0", labor: "0", subcontractor: "0", overhead: "0" },
    },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSites).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
});

describe("ProjectDetailPage · '+ Şantiye Ekle' sayfa kapısı (IZN-F5c)", () => {
  it("proje.santiyeler Düzenler → iki bağlantı da var", () => {
    session(meFixture({ pages: { "proje.santiyeler": pageGrant("edit") } }));
    render(<ProjectDetailPage />);
    expect(screen.getAllByRole("link", ADD)).toHaveLength(2);
  });

  it("proje.santiyeler Görür + santiye.bolumler/bolum.detay Düzenler (eski küme) → bağlantı YOK", () => {
    session(
      meFixture({
        pages: {
          "proje.santiyeler": pageGrant("view"),
          "santiye.bolumler": pageGrant("edit"),
          "bolum.detay": pageGrant("edit"),
        },
      }),
    );
    render(<ProjectDetailPage />);
    expect(screen.queryAllByRole("link", ADD)).toHaveLength(0);
  });

  it("pages boş (eski oturum) → bugünkü davranış: iki bağlantı da var", () => {
    session(meFixture({ pages: {} }));
    render(<ProjectDetailPage />);
    expect(screen.getAllByRole("link", ADD)).toHaveLength(2);
  });
});
