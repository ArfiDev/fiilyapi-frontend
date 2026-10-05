import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ProjectsView } from "./ProjectsView";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { BackendError } from "@/lib/api/unwrap";

vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/projeler",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// M5_3 #400 — "+ Yeni Proje" izin kapısı testi (ContractDistributionView.test.tsx deseni).
let permissionLevel: string | undefined = "full";
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({
    level: permissionLevel,
    canView: true,
    canWrite: permissionLevel !== "read",
    canDelete: permissionLevel === "full",
  }),
}));

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

function mockQuery(value: Partial<ReturnType<typeof useProjects>>) {
  vi.mocked(useProjects).mockReturnValue({
    data: undefined, isLoading: false, isError: false, error: null, ...value,
  } as never);
}

describe("ProjectsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.search = "";
    permissionLevel = "full";
  });

  it("breadcrumb aktif sayisi counts'tan turer (all - completed)", () => {
    mockQuery({ data });
    render(<ProjectsView />);
    expect(screen.getByText("Portföy · 3 Aktif Proje")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Projeler" })).toBeInTheDocument();
    expect(screen.getByText("Güneşkent A-Blok")).toBeInTheDocument();
  });

  it("'+ Yeni Proje' artik /projeler/yeni'ye giden bir link", () => {
    mockQuery({ data });
    render(<ProjectsView />);
    const link = screen.getByRole("link", { name: "+ Yeni Proje" });
    expect(link).toHaveAttribute("href", "/projeler/yeni");
  });

  /**
   * M5_3 #400 — eskiden "+ Yeni Proje" HİÇBİR izin kontrolüyle sarılmadan
   * render ediliyordu; kapı yalnız hedef formdaydı (ProjectCreateView).
   * Backend yazmayı reddeder ama liste ekranında tıklanabilir bir buton
   * yanlış bir yetki izlenimi verirdi.
   */
  it("yazma yetkisi yoksa LINK DEĞİL, gerekçeli devre-dışı öğe basılır", () => {
    permissionLevel = "read";
    mockQuery({ data });
    render(<ProjectsView />);

    expect(screen.queryByRole("link", { name: "+ Yeni Proje" })).not.toBeInTheDocument();
    const placeholder = screen.getByText("+ Yeni Proje");
    expect(placeholder).toHaveAttribute("aria-disabled", "true");
    expect(placeholder).toHaveAttribute("title", "Bu modülde yazma yetkiniz yok");
  });

  it("sekme tiklaninca URL'e yazar", () => {
    mockQuery({ data });
    render(<ProjectsView />);
    fireEvent.click(screen.getByRole("tab", { name: "Taahhüt (2)" }));
    expect(nav.replace).toHaveBeenCalledWith("/projeler?tab=taahhut", { scroll: false });
  });

  it("tumu sekmesi bosken kurulum bos durumu basar", () => {
    mockQuery({ data: { ...data, items: [] } });
    render(<ProjectsView />);
    expect(screen.getByText("Henüz proje tanımlanmadı")).toBeInTheDocument();
  });

  it("filtreli sekme bosken sekme bos durumu basar", () => {
    nav.search = "tab=completed";
    mockQuery({ data: { ...data, items: [] } });
    render(<ProjectsView />);
    expect(screen.getByText("Bu sekmede proje yok")).toBeInTheDocument();
  });

  it("403'te erisim reddi basar", () => {
    mockQuery({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    render(<ProjectsView />);
    expect(screen.queryByRole("heading", { name: "Projeler" })).not.toBeInTheDocument();
  });

  it("diger hatalarda mesaj basar", () => {
    mockQuery({ isError: true, error: new Error("patladi") });
    render(<ProjectsView />);
    expect(screen.getByText("Projeler yüklenemedi")).toBeInTheDocument();
  });

  // F-PRJPAGE — 50'den fazla proje varken sessiz kırpma yasak (F-FIN emsali).
  it("useProjects'i acikca limit=200 ile cagirir", () => {
    mockQuery({ data });
    render(<ProjectsView />);
    expect(useProjects).toHaveBeenCalledWith(expect.objectContaining({ limit: 200 }));
  });

  it("total gosterilenden buyukse kirpilma bandini basar (gercek sayilarla)", () => {
    mockQuery({ data: { ...data, items: [item], total: 57 } });
    render(<ProjectsView />);
    const notice = screen.getByTestId("prj-truncation");
    expect(notice).toHaveTextContent("İlk 1 kayıt gösteriliyor (toplam 57)");
  });

  it("total gosterilene esit/kucukse kirpilma bandi BASILMAZ", () => {
    mockQuery({ data });
    render(<ProjectsView />);
    expect(screen.queryByTestId("prj-truncation")).not.toBeInTheDocument();
  });
});
