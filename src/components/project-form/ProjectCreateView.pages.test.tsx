import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectCreateView } from "./ProjectCreateView";
import { useCreateProject } from "@/lib/api/hooks/useProjectMutations";
import { useEmployers } from "@/lib/api/hooks/useEmployers";
import { useCreateEmployer } from "@/lib/api/hooks/useEmployerMutations";
import { useUsers } from "@/lib/api/hooks/useUsers";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.y — "Yeni Proje" formu genel.projeler Düzenler kapısından açılır (POST /projects).
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api/hooks/useProjectMutations", () => ({ useCreateProject: vi.fn() }));
vi.mock("@/lib/api/hooks/useEmployers", () => ({ useEmployers: vi.fn() }));
vi.mock("@/lib/api/hooks/useEmployerMutations", () => ({ useCreateEmployer: vi.fn() }));
vi.mock("@/lib/api/hooks/useUsers", () => ({ useUsers: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const FORM = { name: "Yeni Proje Oluştur", level: 1 } as const;

describe("ProjectCreateView · sayfa izni kapısı (IZN-F2.y)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreateProject).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(useEmployers).mockReturnValue({ data: { items: [] } } as never);
    vi.mocked(useCreateEmployer).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
    vi.mocked(useUsers).mockReturnValue({ data: { items: [] } } as never);
  });

  it("genel.projeler Düzenler → form var", () => {
    session(meFixture({ pages: { "genel.projeler": pageGrant("edit") } }));
    render(<ProjectCreateView />);
    expect(screen.getByRole("heading", FORM)).toBeInTheDocument();
  });

  it("genel.projeler Görür → AccessDenied, form YOK", () => {
    session(meFixture({ pages: { "genel.projeler": pageGrant("view", true) } }));
    render(<ProjectCreateView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", FORM)).toBeNull();
  });

  it("pages boş → fail-closed: form açılmaz (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    render(<ProjectCreateView />);
    expect(screen.queryByRole("heading", FORM)).toBeNull();
  });

  it("sistem yöneticisi: grant none olsa da form var", () => {
    session(meFixture({ pages: { "genel.projeler": pageGrant("none") }, isSystemAdmin: true }));
    render(<ProjectCreateView />);
    expect(screen.getByRole("heading", FORM)).toBeInTheDocument();
  });
});
