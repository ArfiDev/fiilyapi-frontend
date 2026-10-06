import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { SiteTimesheetView } from "./SiteTimesheetView";
import { useSession } from "@/components/shell/SessionProvider";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import {
  timesheetWeekQuery,
  useTimesheetWeek,
  type TimesheetWeek,
} from "@/lib/api/hooks/useTimesheet";
import {
  useSaveTimesheetWeek,
  type TimesheetWeekSave,
} from "@/lib/api/hooks/useTimesheetMutations";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { BackendError } from "@/lib/api/unwrap";
import { routes } from "@/lib/routes";
import { TIMESHEET_VIEW_PAGES } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

/**
 * PLN-F2.4 · ŞP ekranında KİLİTLİ GÜN — mockup
 * `Şantiye - Puantaj (Kilitli Gün).dc.html` M2 (kilit bandı), (b) kopyalama,
 * (c) tamamen kilitli hafta, (e) kilit 409'u. Kadraj 2026-W39 (21–27 Eyl).
 */
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/puantaj",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () =>
    new URLSearchParams({ iso_year: "2026", iso_week: "39" }),
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
vi.mock("@/lib/api/hooks/useTimesheetMutations", () => ({
  useSaveTimesheetWeek: vi.fn(),
}));
vi.mock("@/lib/api/timesheet-client", () => ({
  downloadTimesheetExport: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteSections", () => ({
  useSiteSections: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSite: vi.fn(() => ({
    data: {
      id: "s-1",
      name: "A-Blok",
      project: { id: "p-1", name: "Güneşkent Konut" },
    },
  })),
}));

const WEEK_DAYS = [
  "2026-09-21",
  "2026-09-22",
  "2026-09-23",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26",
  "2026-09-27",
];

function week(overrides: Partial<TimesheetWeek>): TimesheetWeek {
  return {
    site_id: "s-1",
    site_name: "A-Blok",
    project_id: "p-1",
    project_name: "Güneşkent Konut",
    iso_year: 2026,
    iso_week: 39,
    start_date: "2026-09-21",
    end_date: "2026-09-27",
    section_id: null,
    section_name: null,
    normal_day_hours: "9.0",
    weekly_normal_hours: "45.0",
    worker_count: 1,
    totals: {
      normal_hours: "27.0",
      overtime_hours: "0.0",
      total_hours: "27.0",
    },
    leave_day_count: 0,
    temporary_duty_day_count: 0,
    rows: [
      {
        personnel_id: "per-1",
        full_name: "Mehmet Yılmaz",
        trade: "Kalıpçı Usta",
        source: "company",
        subcontractor_name: null,
        cells: [
          {
            work_date: "2026-09-21",
            hours: "9.0",
            code: null,
            section_id: null,
          },
          {
            work_date: "2026-09-24",
            hours: "9.0",
            code: null,
            section_id: null,
          },
          {
            work_date: "2026-09-25",
            hours: "9.0",
            code: null,
            section_id: null,
          },
        ],
        totals: {
          normal_hours: "27.0",
          overtime_hours: "0.0",
          total_hours: "27.0",
        },
      },
    ],
    day_totals: [],
    month_year: 2026,
    month_month: 9,
    month_total_hours: "27.0",
    month_man_days: "3.0",
    month_weeks: [],
    ...overrides,
  } as TimesheetWeek;
}

const PREVIOUS_WEEK = week({
  iso_week: 38,
  start_date: "2026-09-14",
  end_date: "2026-09-20",
  rows: [
    {
      personnel_id: "per-1",
      full_name: "Mehmet Yılmaz",
      trade: "Kalıpçı Usta",
      source: "company",
      subcontractor_name: null,
      cells: [
        { work_date: "2026-09-14", hours: "7.0", code: null, section_id: null },
        { work_date: "2026-09-18", hours: "7.0", code: null, section_id: null },
      ],
      totals: {
        normal_hours: "14.0",
        overtime_hours: "0.0",
        total_hours: "14.0",
      },
    },
  ],
});

let saveBodies: TimesheetWeekSave[] = [];
let saveErrors: Error[] = [];

function mockWeek(data: TimesheetWeek) {
  vi.mocked(useTimesheetWeek).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  // "Önceki Haftayı Kopyala" `fetchQuery` ile önbellekten okur — ağ yok.
  client.setQueryData(
    timesheetWeekQuery("s-1", { isoYear: 2026, isoWeek: 38 }).queryKey,
    PREVIOUS_WEEK,
  );
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(<SiteTimesheetView />, { wrapper: Wrapper });
}

async function typeHours(cellLabel: string, value: string) {
  const input = screen.getByLabelText(`${cellLabel} saati`);
  await userEvent.clear(input);
  await userEvent.type(input, value);
  await userEvent.tab();
}

function bodyCell(workDate: string) {
  return saveBodies.at(-1)?.cells?.find((cell) => cell.work_date === workDate);
}

beforeEach(() => {
  vi.clearAllMocks();
  saveBodies = [];
  saveErrors = [];
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ pages: levelPages(TIMESHEET_VIEW_PAGES, "full") }),
    isLoading: false,
  });
  vi.mocked(useSaveTimesheetWeek).mockReturnValue({
    mutateAsync: vi.fn(async (body: TimesheetWeekSave) => {
      saveBodies.push(body);
      const error = saveErrors.shift();
      if (error) throw error;
      return week({});
    }),
  } as never);
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSiteSections).mockReturnValue({
    data: { items: [] },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  mockWeek(week({ locked_days: WEEK_DAYS.slice(0, 3) }));
});

describe("SiteTimesheetView · M2 kilit bandı", () => {
  it("kilitli gün varsa band tablo üstünde; metin + 'Günlük kaydına git →' şantiye günlüğüne", () => {
    renderView();
    const band = screen.getByRole("status", { name: "Kilitli günler" });
    expect(band).toHaveTextContent(
      'Pzt 21 – Çar 23 Eyl rapor onayıyla kilitli. Bu günlerin hücreleri salt okunur · değişiklik için günlük kaydında "Kilidi aç (yetkili)".',
    );
    // PLN-F3.0 · bant TEK bağlantı taşır — İLK kilitli güne (`WEEK_DAYS[0]`) gider.
    expect(
      within(band).getByRole("link", { name: /Günlük kaydına git/ }),
    ).toHaveAttribute(
      "href",
      routes.projects.sites.diary({ projectId: "p-1", siteId: "s-1", date: "2026-09-21" }),
    );
  });

  it("kilitli gün yoksa band basılmaz (mockup (d))", () => {
    mockWeek(week({}));
    renderView();
    expect(screen.queryByRole("status", { name: "Kilitli günler" })).toBeNull();
    expect(screen.queryByText("Kilitli gün (salt okunur)")).toBeNull();
  });

  it("legend kilitli haftada 'Kilitli gün (salt okunur)' öğesini taşır", () => {
    renderView();
    expect(screen.getByText("Kilitli gün (salt okunur)")).toBeInTheDocument();
  });
});

describe("SiteTimesheetView · (c) tamamen kilitli hafta", () => {
  it("yedi gün kilitliyse 'Önceki Haftayı Kopyala' ve 'Haftayı Kaydet' PASİF", () => {
    mockWeek(week({ locked_days: WEEK_DAYS }));
    renderView();
    expect(
      screen.getByRole("button", { name: "Önceki Haftayı Kopyala" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    ).toBeDisabled();
    // Izgarada hiç saat kutusu kalmaz (bordro panelinin haftalık alanı hariç).
    const grid = screen.getByText("Günlük Toplam").closest("table");
    expect(grid?.querySelector("input")).toBeNull();
  });

  it("taslak varken hafta yeniden yüklenip TAMAMEN kilitli gelirse 'Haftayı Kaydet' yine PASİF", async () => {
    mockWeek(week({}));
    const { rerender } = renderView();
    await typeHours("Mehmet Yılmaz · 25 Eyl", "10");
    expect(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    ).toBeEnabled();
    // Arka planda tazelenen hafta artık yedi günü kilitli taşır; taslak kapsamı aynı.
    mockWeek(week({ locked_days: WEEK_DAYS }));
    rerender(<SiteTimesheetView />);
    expect(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    ).toBeDisabled();
  });

  it("kısmen kilitli haftada kopyalama AÇIK kalır", () => {
    renderView();
    expect(
      screen.getByRole("button", { name: "Önceki Haftayı Kopyala" }),
    ).toBeEnabled();
  });
});

describe("SiteTimesheetView · (b) kopyalama kilitli günleri ATLAR (§3.14 P2)", () => {
  it("kilitli Pzt sunucu değerinde kalır, kilitsiz Cum önceki haftadan dolar; bildirim mockup metni", async () => {
    renderView();
    await userEvent.click(
      screen.getByRole("button", { name: "Önceki Haftayı Kopyala" }),
    );
    expect(
      await screen.findByText(
        "Kopyalandı · kilitli 3 gün atlandı (Pzt 21 – Çar 23 Eyl). Per–Paz 38. Hafta'dan dolduruldu.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mehmet Yılmaz · 25 Eyl saati")).toHaveValue(
      "7",
    );
    // Per 24 önceki haftada boştu: kilitsiz gün TEMİZLENİR (kopya değiştirmedir).
    expect(screen.getByLabelText("Mehmet Yılmaz · 24 Eyl saati")).toHaveValue(
      "",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    );
    // Kilitli Pzt DEĞİŞMEDEN taşınır (P5): önceki haftanın 7'si YAZILMADI.
    expect(bodyCell("2026-09-21")).toMatchObject({ hours: "9.0" });
    expect(bodyCell("2026-09-25")).toMatchObject({ hours: "7.0" });
  });
});

describe("SiteTimesheetView · (e) kilit 409'u (§3.14 P4)", () => {
  it("kilitlenen günün taslağı ATILIR ve salt okunur olur; kilitsiz günün taslağı KORUNUR; band basılır", async () => {
    mockWeek(week({}));
    saveErrors = [
      new BackendError(409, {
        detail: "Gün kilitli.",
        locked_days: ["2026-09-24"],
      }),
    ];
    renderView();
    await typeHours("Mehmet Yılmaz · 24 Eyl", "10");
    await typeHours("Mehmet Yılmaz · 25 Eyl", "10");
    await userEvent.click(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    );

    expect(
      await screen.findByText("Bu gün kilitlendi; değişiklik kaydedilmedi."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Per 24 Eyl, siz düzenlerken rapor onayıyla kilitlendi (409) · kilitli güne yapılan değişiklik geri alındı; diğer günler kaydedilmeye hazır.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Kişi-gün çakışması/)).toBeNull();

    // Per 24: input gitti, sunucudaki 9'a döndü ve salt okunur.
    expect(screen.queryByLabelText("Mehmet Yılmaz · 24 Eyl saati")).toBeNull();
    const locked = screen.getByRole("button", {
      name: "Mehmet Yılmaz · 24 Eyl puantajı (kilitli)",
    });
    expect(within(locked).getByText("9")).toHaveClass("ts-lk");
    // Cum 25: taslak korunur.
    expect(screen.getByLabelText("Mehmet Yılmaz · 25 Eyl saati")).toHaveValue(
      "10",
    );
    // Kilit bandı yeniden yüklemeden görünür.
    expect(
      screen.getByRole("status", { name: "Kilitli günler" }),
    ).toHaveTextContent("Per 24 Eyl");

    // Yeniden gönderim: kilitli gün sunucu değeriyle, kilitsiz gün taslakla.
    await userEvent.click(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    );
    expect(bodyCell("2026-09-24")).toMatchObject({ hours: "9.0" });
    expect(bodyCell("2026-09-25")).toMatchObject({ hours: "10" });
  });

  it("EV-BORC-4 · 409 gövdesi day_locks taşırsa hata bandı ve kilit bandı rapor tarihini yazar", async () => {
    mockWeek(week({}));
    saveErrors = [
      new BackendError(409, {
        detail: "Gün kilitli.",
        locked_days: ["2026-09-24"],
        day_locks: [{ day: "2026-09-24", report_date: "2026-09-25" }],
      }),
    ];
    renderView();
    await typeHours("Mehmet Yılmaz · 24 Eyl", "10");
    await userEvent.click(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    );
    expect(
      await screen.findByText(
        "Per 24 Eyl, siz düzenlerken 25.09.2026 raporuyla kilitlendi (409) · kilitli güne yapılan değişiklik geri alındı; diğer günler kaydedilmeye hazır.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Kilitli günler" }),
    ).toHaveTextContent("Per 24 Eyl 25.09.2026 raporuyla kilitli.");
  });

  it("EV-BORC-4 · hafta yanıtındaki day_locks başlık title'ına ve popover notuna geçer", async () => {
    mockWeek({
      ...week({ locked_days: ["2026-09-21"] }),
      day_locks: [{ day: "2026-09-21", report_date: "2026-09-25" }],
    } as TimesheetWeek);
    renderView();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Mehmet Yılmaz · 21 Eyl puantajı (kilitli)",
      }),
    );
    expect(
      screen.getByText("Bu gün kilitli · 25.09.2026 raporu"),
    ).toBeInTheDocument();
    expect(
      screen.getByTitle("Kilitli · 25.09.2026 raporu"),
    ).toBeInTheDocument();
  });

  it("locked_days taşımayan 409 kişi-gün çakışması olarak kalır; taslak hiç atılmaz", async () => {
    mockWeek(week({}));
    saveErrors = [
      new BackendError(409, {
        detail: "Mehmet Yılmaz 24 Eyl B-Blok'ta kayıtlı.",
      }),
    ];
    renderView();
    await typeHours("Mehmet Yılmaz · 24 Eyl", "10");
    await userEvent.click(
      screen.getByRole("button", { name: "Haftayı Kaydet" }),
    );
    expect(
      await screen.findByText(
        "Kişi-gün çakışması: Mehmet Yılmaz 24 Eyl B-Blok'ta kayıtlı.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mehmet Yılmaz · 24 Eyl saati")).toHaveValue(
      "10",
    );
  });
});
