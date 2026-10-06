import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { GeneralTimesheetView } from "./GeneralTimesheetView";
import { OVERTIME_SURCHARGE_PERCENT_TEXT } from "./overtime-rule";
import { useSession } from "@/components/shell/SessionProvider";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useTimesheetWeek, type TimesheetWeek } from "@/lib/api/hooks/useTimesheet";
import { useSaveTimesheetWeek } from "@/lib/api/hooks/useTimesheetMutations";
import { PERSONNEL_EDIT, TIMESHEET_VIEW_PAGES } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

/**
 * PUAN-SAAT · E5 ekranının KENDİ davranışları. Ortak çekirdek
 * (`TimesheetWeekScreen`) ŞP dosyasında da ölçülür; buradaki iddialar E5'in
 * ŞP'den AYRILDIĞI yerlere odaklanır: şantiye seçici, meslek/tür/taşeron
 * süzgeçleri (E5 100-127), Excel'in YOKLUĞU ve hafta gezinmesinin YIL SINIRI.
 */

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/puantaj",
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTimesheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTimesheet")>()),
  useTimesheetWeek: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTimesheetMutations", () => ({ useSaveTimesheetWeek: vi.fn() }));
vi.mock("@/lib/api/timesheet-client", () => ({ downloadTimesheetExport: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));

const WEEK_QUERY = { site: "s-1", iso_year: "2026", iso_week: "32" };

function mockSession(level: string) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ pages: { ...levelPages(TIMESHEET_VIEW_PAGES, level), ...pagesFor(PERSONNEL_EDIT, "none") } }),
    isLoading: false,
  });
}

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
  worker_count: 2,
  totals: { normal_hours: "18.0", overtime_hours: "3.0", total_hours: "21.0" },
  leave_day_count: 0,
  temporary_duty_day_count: 0,
  rows: [
    {
      personnel_id: "per-1",
      full_name: "Ahmet Yılmaz",
      trade: "Kalıpçı",
      source: "company",
      subcontractor_name: null,
      cells: [{ work_date: "2026-08-03", hours: "9.0", code: null, section_id: null }],
      totals: { normal_hours: "9.0", overtime_hours: "0.0", total_hours: "9.0" },
    },
    {
      personnel_id: "per-2",
      full_name: "Cem Aksoy",
      trade: "Demirci",
      source: "subcontractor",
      subcontractor_name: "Akın İnşaat",
      cells: [{ work_date: "2026-08-03", hours: "12.0", code: null, section_id: null }],
      totals: { normal_hours: "9.0", overtime_hours: "3.0", total_hours: "12.0" },
    },
  ],
  day_totals: [],
  month_year: 2026,
  month_month: 8,
  month_total_hours: "21.0",
  month_man_days: "2.3",
  month_weeks: [],
} as TimesheetWeek;

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<GeneralTimesheetView />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams(WEEK_QUERY);
  mockSession("full");
  vi.mocked(useSaveTimesheetWeek).mockReturnValue({
    mutateAsync: vi.fn(async () => WEEK),
  } as never);
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
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [
      { siteId: "s-1", label: "A-Blok" },
      { siteId: "s-2", label: "B-Blok" },
    ],
    isLoading: false,
    isError: false,
  } as never);
});

describe("GeneralTimesheetView · E5 kabuğu", () => {
  it("başlık + haftalık giriş kuralı + şantiye seçici basar", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Puantaj" })).toBeInTheDocument();
    expect(screen.getByText(/Giriş haftalık yapılır, birim saattir/)).toBeInTheDocument();
    expect(screen.getByLabelText("Şantiye")).toHaveValue("s-1");
  });

  it("🔴 triyaj #350 — giriş şeridi FM zam yüzdesini panel ile AYNI kaynaktan basar", () => {
    renderView();
    expect(
      screen.getByText(new RegExp(`${OVERTIME_SURCHARGE_PERCENT_TEXT} zamlı hesaplanır`)),
    ).toBeInTheDocument();
  });

  it("KAYIT 358: bilgi şeridindeki haftalık normal mesai formatDecimal ile basılır (panelle aynı biçim)", () => {
    renderView();
    // weekly_normal_hours="45.0" — formatDecimal ham ondalık noktayı silip
    // "45" basar; ham metin "45.0" ekranda YOKTUR.
    expect(screen.getByText(/Haftalık normal mesai 45 saat/)).toBeInTheDocument();
  });

  it("🔴 E5 mockup'ında Excel YOKTUR — uydurulmaz (ŞP'de vardır)", () => {
    renderView();
    expect(screen.queryByRole("button", { name: "Excel" })).not.toBeInTheDocument();
  });

  it("E5'te bölüm süzgeci YOKTUR", () => {
    renderView();
    expect(screen.queryByLabelText("Bölüm")).not.toBeInTheDocument();
  });

  it("şantiye seçimi URL'ye yazılır", async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText("Şantiye"), "s-2");
    expect(replace).toHaveBeenCalledWith(
      "/puantaj?site=s-2&iso_year=2026&iso_week=32",
      { scroll: false },
    );
  });
});

describe("GeneralTimesheetView · hafta gezinmesi", () => {
  it("‹ / › haftayı kaydırır", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Sonraki hafta" }));
    expect(replace).toHaveBeenCalledWith(
      "/puantaj?site=s-1&iso_year=2026&iso_week=33",
      { scroll: false },
    );
  });

  it("🔴 ISO YIL SINIRI doğru geçilir: 2026-W1'den geriye 2025-W52", async () => {
    searchParams = new URLSearchParams({ site: "s-1", iso_year: "2026", iso_week: "1" });
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Önceki hafta" }));
    expect(replace).toHaveBeenCalledWith(
      "/puantaj?site=s-1&iso_year=2025&iso_week=52",
      { scroll: false },
    );
  });

  it("ay şeridi boşsa sessiz kalmaz — gerekçe yazar", () => {
    renderView();
    expect(screen.getByText("Bu ayın hafta özeti yüklenemedi.")).toBeInTheDocument();
  });
});

describe("GeneralTimesheetView · E5 satır süzgeçleri (100-127)", () => {
  it("uç karşılığı olmayan süzgeçler SİLİNMEZ — istemci tarafında süzer", async () => {
    renderView();
    expect(screen.getByText("Gösterilen")).toBeInTheDocument();
    expect(screen.getByLabelText("Meslek")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Meslek"), "Kalıpçı");
    expect(screen.getByText("Ahmet Yılmaz")).toBeInTheDocument();
    expect(screen.queryByText("Cem Aksoy")).not.toBeInTheDocument();
    // Sayaç süzgeçten ÖNCEKİ toplamı paydada tutar.
    const shown = document.querySelector(".ts-shown") as HTMLElement;
    expect(within(shown).getByText("1")).toBeInTheDocument();
    expect(within(shown).getByText("/ 2")).toBeInTheDocument();
  });

  it("🔴 satır süzgeci KAYDETME GÖVDESİNE dokunmaz — süzülen satırın hücresi durur", async () => {
    const mutateAsync = vi.fn((body: { cells?: { personnel_id: string }[] }) =>
      Promise.resolve({ ...WEEK, echoedCellCount: body.cells?.length ?? 0 }),
    );
    vi.mocked(useSaveTimesheetWeek).mockReturnValue({ mutateAsync } as never);
    renderView();
    await userEvent.selectOptions(screen.getByLabelText("Meslek"), "Kalıpçı");

    const input = screen.getByLabelText("Ahmet Yılmaz · 5 Ağu saati");
    await userEvent.type(input, "9");
    await userEvent.tab();
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));

    const body = mutateAsync.mock.calls[0]?.[0];
    // POZİTİF KONTROL: ekranda GÖRÜNMEYEN Cem Aksoy'un hücresi gövdede DURUYOR.
    expect(body?.cells?.map((cell) => cell.personnel_id)).toContain("per-2");
  });

  it("🔴 triyaj #357 — bir meslek seçilince DİĞER süzgeçlerin seçenekleri DARALMAZ", async () => {
    renderView();
    // Başlangıçta "Akın İnşaat" seçeneği listede.
    expect(
      within(screen.getByLabelText("Taşeron firması")).getByRole("option", {
        name: "Akın İnşaat",
      }),
    ).toBeInTheDocument();

    // Meslek "Kalıpçı" seçilince yalnız Ahmet (company, taşeronsuz) görünür
    // KALIR — ama taşeron seçeneği listesi SÜZGEÇTEN ÖNCEKİ kümeden kurulur,
    // "Akın İnşaat" seçeneği KAYBOLMAMALI.
    await userEvent.selectOptions(screen.getByLabelText("Meslek"), "Kalıpçı");
    expect(screen.queryByText("Cem Aksoy")).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Taşeron firması")).getByRole("option", {
        name: "Akın İnşaat",
      }),
    ).toBeInTheDocument();
  });

  it("taşeron süzgeci firma adından süzer", async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText("Taşeron firması"), "Akın İnşaat");
    expect(screen.getByText("Cem Aksoy")).toBeInTheDocument();
    expect(screen.queryByText("Ahmet Yılmaz")).not.toBeInTheDocument();
  });
});

describe("GeneralTimesheetView · izin dalları", () => {
  it("PM (none) AccessDenied görür", () => {
    mockSession("none");
    renderView();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("saha mühendisi (view) ızgarayı görür ama yazamaz", () => {
    mockSession("view");
    renderView();
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Önceki Haftayı Kopyala" })).toBeDisabled();
    expect(screen.getByText(/Puantaj kaydetme yetkiniz yok/)).toBeInTheDocument();
  });
});

describe("GeneralTimesheetView · şantiye yoksa", () => {
  it("boş ızgaranın gerekçesi yazılır — sessiz boş tablo YOK", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: false,
    } as never);
    searchParams = new URLSearchParams({ iso_year: "2026", iso_week: "32" });
    vi.mocked(useTimesheetWeek).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    renderView();
    expect(screen.getByText("Şantiye seçin.")).toBeInTheDocument();
  });

  /**
   * 🔴 E2E-IZOLASYON POZİTİF KONTROLÜ — boş `siteId` ile YAZMA YOLU AÇILAMAZ.
   *
   * Ağa giden hook'lar `enabled: siteId.length > 0` ile durur; "Önceki Haftayı
   * Kopyala" ise ELDE çağrılan bir yoldur (`queryClient.fetchQuery`) ve o
   * kapının dışındaydı. Basılınca `/sites//timesheet/week`
   * istenir, hiçbir desene uymaz, 404 döner ve kullanıcı ham `"not found"`
   * görür. CI run 33312094802 tam bunu bastı.
   *
   * Bu iddia `!isSiteResolved` kapısı KALDIRILINCA kırmızıya döner — mutant
   * ölçüldü.
   */
  it("şantiye kimliği çözülmeden 'Önceki Haftayı Kopyala' AÇILMAZ (boş siteId → 404 'not found')", () => {
    vi.mocked(useSiteOptions).mockReturnValue({
      options: [],
      isLoading: false,
      isError: false,
    } as never);
    searchParams = new URLSearchParams({ iso_year: "2026", iso_week: "32" });
    vi.mocked(useTimesheetWeek).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    renderView();
    expect(screen.getByRole("button", { name: "Önceki Haftayı Kopyala" })).toBeDisabled();
  });
});
