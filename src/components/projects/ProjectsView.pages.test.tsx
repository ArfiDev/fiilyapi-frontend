import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectsView } from "./ProjectsView";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.x — "+ Yeni Proje" düğmesi genel.projeler sayfa izninden karar verir.
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/projeler",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const CONTRACTING_PLACEHOLDERS = {
  spent: { available: false, value: null, pending_module: "project_costs" },
  physical_progress: { available: false, value: null, pending_module: "progress_payments" },
  final_progress_payment: { available: false, value: null, pending_module: "progress_payments" },
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  subcontractor_count: { available: false, count: null, pending_module: "subcontracts" },
};

const item = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "GK-A",
  name: "Güneşkent A-Blok",
  project_type: "taahhut" as const,
  status: "active" as const,
  category: "Konut",
  city: "Ankara",
  employer_name: "Güneşkent A.Ş.",
  employer: null,
  contract: null,
  budget_lines: { material: "0", labor: "0", subcontractor: "0", overhead: "0" },
  is_draft: false,
  contract_no: null,
  contract_amount: "11200000.00",
  start_date: "2025-03-01",
  end_date: "2026-12-01",
  budget: "1000000.00",
  progress_pct: "75.00",
  contracting: CONTRACTING_PLACEHOLDERS,
  investment: null,
  land_share: null,
};
// BOR-TEMIZ (SITE-1) `/projects`e sayfalama ekledi: `total/limit/offset` ZORUNLU alanlar.
// 🔴 `counts` ile `total` AYNI ŞEY DEĞİLDİR (WORKFLOW §4 "iki sayaç ayrı şeylerdir"):
// `counts` süzgeçten de sayfadan da etkilenmez, tüm görünür kümeyi sayar; `total` ise
// SÜZGEÇLENMİŞ kümenin boyutudur. Burada bilerek FARKLI seçildi (all=4, total=1) —
// eşit seçilseydi ikisini karıştıran bir regresyonu hiçbir test yakalayamazdı.
const data = {
  counts: { all: 4, taahhut: 2, kendi_yatirim: 1, kat_karsiligi: 1, completed: 1, draft: 0 },
  items: [item],
  total: 1,
  limit: 50,
  offset: 0,
};


function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  vi.mocked(useProjects).mockReturnValue({
    data, isLoading: false, isError: false, error: null,
  } as never);
  render(<ProjectsView />);
}

const NEW_PROJECT = "+ Yeni Proje";

describe("ProjectsView · sayfa izni kapısı (IZN-F2.x)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("genel.projeler Düzenler → '+ Yeni Proje' bağlantısı var", () => {
    session(meFixture({ pages: { "genel.projeler": pageGrant("edit") }, permissions: { projects: "view" } }));
    renderView();
    expect(screen.getByRole("link", { name: NEW_PROJECT })).toBeInTheDocument();
  });

  it("genel.projeler Görür → bağlantı YOK, devre-dışı öğe (modül izni full olsa bile)", () => {
    session(meFixture({ pages: { "genel.projeler": pageGrant("view") }, permissions: { projects: "full" } }));
    renderView();
    expect(screen.queryByRole("link", { name: NEW_PROJECT })).toBeNull();
    expect(screen.getByText(NEW_PROJECT)).toHaveAttribute("aria-disabled", "true");
  });

  it("Onaylar bayrağı tek başına yazma kapısını AÇMAZ", () => {
    session(meFixture({ pages: { "genel.projeler": pageGrant("view", true) } }));
    renderView();
    expect(screen.queryByRole("link", { name: NEW_PROJECT })).toBeNull();
  });

  it("pages boş → eski davranış: modül izni yazabiliyorsa bağlantı var", () => {
    session(meFixture({ pages: {}, permissions: { projects: "full" } }));
    renderView();
    expect(screen.getByRole("link", { name: NEW_PROJECT })).toBeInTheDocument();
  });

  it("pages boş + modül izni view → eski davranış: devre-dışı", () => {
    session(meFixture({ pages: {}, permissions: { projects: "view" } }));
    renderView();
    expect(screen.queryByRole("link", { name: NEW_PROJECT })).toBeNull();
  });

  it("sistem yöneticisi: grant none olsa da bağlantı var", () => {
    session(meFixture({ pages: { "genel.projeler": pageGrant("none") }, isSystemAdmin: true }));
    renderView();
    expect(screen.getByRole("link", { name: NEW_PROJECT })).toBeInTheDocument();
  });
});
