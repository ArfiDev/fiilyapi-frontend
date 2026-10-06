import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import PuantajPage from "./page";
import { useSession } from "@/components/shell/SessionProvider";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useTimesheetWeek, type TimesheetWeek } from "@/lib/api/hooks/useTimesheet";
import { TIMESHEET_EDIT, TIMESHEET_VIEW_PAGES, PERSONNEL_EDIT } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

// PUAN-SAAT · `/puantaj` gerçek rota: [...slug] catch-all bu segment için
// devre dışı kalır — bu test sayfanın ComingSoon YERİNE gerçek E5 haftalık
// ızgarasını bastığını ve "Personel Ekle" girişinin izin dallarını doğrular.

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/puantaj",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTimesheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTimesheet")>()),
  useTimesheetWeek: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTimesheetMutations", () => ({
  useSaveTimesheetWeek: () => ({ mutateAsync: vi.fn(async () => ({})) }),
}));
vi.mock("@/lib/api/timesheet-client", () => ({ downloadTimesheetExport: vi.fn() }));

/** Kadraj haftası: 2026-W32 = 3–9 Ağustos 2026. */
const WEEK_QUERY = { iso_year: "2026", iso_week: "32" };

const WEEK: TimesheetWeek = {
  site_id: "s-1",
  site_name: "A-Blok",
  project_id: "p-1",
  project_name: "Güneşkent Konut",
  iso_year: 2026,
  iso_week: 32,
  start_date: "2026-08-03",
  end_date: "2026-08-09",
  section_id: null,
  section_name: null,
  normal_day_hours: "9.0",
  weekly_normal_hours: "45.0",
  worker_count: 1,
  totals: { normal_hours: "9.0", overtime_hours: "0.0", total_hours: "9.0" },
  leave_day_count: 0,
  temporary_duty_day_count: 1,
  rows: [
    {
      personnel_id: "per-1",
      full_name: "Ahmet Yılmaz",
      trade: "Kalıpçı Usta",
      source: "company",
      subcontractor_name: null,
      cells: [
        { work_date: "2026-08-03", hours: "9.0", code: null, section_id: "sec-1" },
        // Kod hücresi de veride VARDIR — rozeti basılır.
        { work_date: "2026-08-05", hours: null, code: "temporary_duty", section_id: "sec-1" },
      ],
      totals: { normal_hours: "9.0", overtime_hours: "0.0", total_hours: "9.0" },
    },
  ],
  day_totals: [],
  month_year: 2026,
  month_month: 8,
  month_total_hours: "9.0",
  month_man_days: "1.0",
  month_weeks: [],
} as TimesheetWeek;

/**
 * IZN-F6a · eski modül düzeyi → sayfa izni. `level` = puantaj sayfaları (full = Düzenler, view = Görür, none = Yok);
 * `personnelLevel` = personel sayfaları (verilmezse personel sayfasında grant YOK → kapalı).
 */
function mockSession(level: "full" | "view" | "none", personnelLevel?: "full" | "view" | "none") {
  const grantLevel = { full: "edit", view: "view", none: "none" } as const;
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({
      pages: {
        ...pagesFor(TIMESHEET_VIEW_PAGES, grantLevel[level]),
        ...pagesFor(TIMESHEET_EDIT, grantLevel[level]),
        ...(personnelLevel !== undefined ? pagesFor(PERSONNEL_EDIT, grantLevel[personnelLevel]) : {}),
      },
    }),
    isLoading: false,
  });
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<PuantajPage />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams(WEEK_QUERY);
  mockSession("full");
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [{ siteId: "s-1", projectId: "p-1", label: "Güneşkent Konut A-Blok" }],
    isLoading: false,
    isError: false,
  });
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useTimesheetWeek).mockReturnValue({
    data: WEEK,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

describe("PuantajPage rotasi", () => {
  it("ComingSoon DEGIL gercek haftalik puantaj izgarasini basar", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Puantaj" })).toBeInTheDocument();
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Hafta Toplam" })).toBeInTheDocument();
  });

  it("santiye secicisi ve haftalik giris kurali basar", () => {
    renderPage();
    expect(screen.getByLabelText("Şantiye")).toBeInTheDocument();
    expect(screen.getByText(/Giriş haftalık yapılır, birim saattir/)).toBeInTheDocument();
  });

  it("PM (none) AccessDenied gorur", () => {
    mockSession("none");
    renderPage();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("saha muhendisi (view) izgarayi gorur, Kaydet devre disi + gerekce basilir", () => {
    mockSession("view");
    renderPage();
    expect(screen.getByRole("heading", { name: "Puantaj" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeDisabled();
    expect(screen.getByText(/Puantaj kaydetme yetkiniz yok/)).toBeInTheDocument();
    // Salt-okunur: saat kutusu HIC basilmaz.
    expect(screen.queryByLabelText(/· \d+ \S+ saati$/)).not.toBeInTheDocument();
  });

  it("yazma izinlide saat kutulari basilir, Kaydet degisiklik yokken devre disi", () => {
    renderPage();
    expect(screen.getAllByLabelText(/· \d+ \S+ saati$/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeDisabled();
  });
});

describe("PuantajPage · hucre sekli (PUAN-SAAT)", () => {
  it("kodlu hucre ROZET, saatli hucre KUTU basar (saat XOR kod)", () => {
    renderPage();
    const row = screen.getByRole("rowheader", { name: /Ahmet Yılmaz/ }).closest("tr");
    expect(row).not.toBeNull();
    // 5 Ağu geçici görev — rozet.
    expect(within(row as HTMLElement).getByText("Görev")).toBeInTheDocument();
    // 3 Ağu saatli — kutu, değeri 9.
    expect(screen.getByLabelText("Ahmet Yılmaz · 3 Ağu saati")).toHaveValue("9");
  });

  it("legend SAAT tonlarini anlatir — eski kod legend'i (Ç/İ/T/FM) KALKTI", () => {
    renderPage();
    for (const label of ["Tam gün", "Eksik gün", "Fazla mesai", "Çalışılmadı"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText("Çalıştı (Ç)")).not.toBeInTheDocument();
    expect(screen.queryByText("Fazla Mesai (FM)")).not.toBeInTheDocument();
  });
});

// "Personel Ekle" girisi — mockup'ta YOK; spec §4 S2(a) onayli turetimi.
describe("PuantajPage · Personel Ekle girisi", () => {
  it("personnel:full olanda gorunur ve donus rotasini tasir", () => {
    mockSession("full", "full");
    renderPage();
    const link = screen.getAllByRole("link", { name: "Personel Ekle" })[0];
    expect(link).toHaveAttribute(
      "href",
      `/personel/yeni?donus=${encodeURIComponent("/puantaj?iso_year=2026&iso_week=32")}`,
    );
  });

  it("personnel:none olanda HIC basilmaz", () => {
    mockSession("full", "none");
    renderPage();
    expect(screen.queryByRole("link", { name: "Personel Ekle" })).not.toBeInTheDocument();
  });

  it("personnel:view de yetmez (form yalniz full+)", () => {
    mockSession("full", "view");
    renderPage();
    expect(screen.queryByRole("link", { name: "Personel Ekle" })).not.toBeInTheDocument();
  });

  it("personel sayfasinda grant yoksa HIC basilmaz (IZN-F6a: bilinmezlik kurali kalkti, fail-closed)", () => {
    mockSession("full");
    renderPage();
    expect(screen.queryByRole("link", { name: "Personel Ekle" })).not.toBeInTheDocument();
  });

  it("hic personel yoksa izgarada bos-durum + ekleme yonlendirmesi basilir", () => {
    mockSession("full", "full");
    vi.mocked(useTimesheetWeek).mockReturnValue({
      data: { ...WEEK, rows: [], worker_count: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    renderPage();
    const empty = document.querySelector(".ts-week-table__empty") as HTMLElement;
    expect(empty).toHaveTextContent("Bu hafta için puantaj kaydı ve aktif personel bulunmuyor.");
    expect(within(empty).getByRole("link", { name: "Personel Ekle" })).toBeInTheDocument();
  });

  it("bos izgarada izinsiz kullaniciya yonlendirme BASILMAZ", () => {
    mockSession("full", "none");
    vi.mocked(useTimesheetWeek).mockReturnValue({
      data: { ...WEEK, rows: [], worker_count: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    renderPage();
    const empty = document.querySelector(".ts-week-table__empty") as HTMLElement;
    expect(within(empty).queryByRole("link", { name: "Personel Ekle" })).not.toBeInTheDocument();
  });
});
