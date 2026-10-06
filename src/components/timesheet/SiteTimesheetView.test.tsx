import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { SiteTimesheetView } from "./SiteTimesheetView";
import { useSession } from "@/components/shell/SessionProvider";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useTimesheetWeek, type TimesheetWeek } from "@/lib/api/hooks/useTimesheet";
import {
  useSaveTimesheetWeek,
  type TimesheetWeekSave,
} from "@/lib/api/hooks/useTimesheetMutations";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { downloadTimesheetExport } from "@/lib/api/timesheet-client";
import { BackendError } from "@/lib/api/unwrap";
import { TIMESHEET_VIEW_PAGES } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

/**
 * PUAN-SAAT · ŞP ekranı — 🔴 ONAYLI SAPMA ile HAFTALIK saat çekirdeğine geçti
 * (mockup `Şantiye - Puantaj.dc.html`in gün-kodu tasarımı yeni sözleşme
 * altında uygulanamaz; gerekçe `SiteTimesheetView.tsx` docstring'inde).
 *
 * Bu dosya ŞP'nin KORUNAN yeteneklerini kilitler: bölüm süzgeci (K2), özet
 * şeridi, Excel, yazma yetkisi — ve KAPSAM KURALININ iki bacağını ölçer.
 * Saf türevler kendi dosyalarındadır (week-derive / iso-week / timesheet-draft).
 */

const replace = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/puantaj",
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
vi.mock("@/lib/api/hooks/useSiteSections", () => ({ useSiteSections: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({
  useSite: vi.fn(() => ({
    data: { id: "s-1", name: "A-Blok", project: { id: "p-1", name: "Güneşkent Konut" } },
  })),
}));

/** Kadraj haftası: 2026-W32 = 3–9 Ağustos 2026 (Pazartesi başlangıçlı). */
const WEEK_QUERY = { iso_year: "2026", iso_week: "32" };

function mockSession(level: string) {
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ pages: levelPages(TIMESHEET_VIEW_PAGES, level) }),
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
      trade: "Kalıpçı Usta",
      source: "company",
      subcontractor_name: null,
      cells: [{ work_date: "2026-08-03", hours: "9.0", code: null, section_id: "sec-1" }],
      totals: { normal_hours: "9.0", overtime_hours: "0.0", total_hours: "9.0" },
    },
    {
      personnel_id: "per-2",
      full_name: "Cem Aksoy",
      trade: "Demir Ustası",
      source: "subcontractor",
      subcontractor_name: "Akın İnşaat",
      cells: [{ work_date: "2026-08-03", hours: "12.0", code: null, section_id: "sec-2" }],
      totals: { normal_hours: "9.0", overtime_hours: "3.0", total_hours: "12.0" },
    },
  ],
  day_totals: [],
  month_year: 2026,
  month_month: 8,
  month_total_hours: "21.0",
  month_man_days: "2.3",
  month_weeks: [
    {
      iso_year: 2026,
      iso_week: 32,
      start_date: "2026-08-03",
      end_date: "2026-08-09",
      total_hours: "21.0",
      has_entries: true,
    },
    {
      iso_year: 2026,
      iso_week: 33,
      start_date: "2026-08-10",
      end_date: "2026-08-16",
      total_hours: "0.0",
      has_entries: false,
    },
  ],
} as TimesheetWeek;

/** `PUT` gövdeleri — kapsam kanıtı bunların üzerinden yürür. */
let saveBodies: TimesheetWeekSave[] = [];

function savedCells() {
  return saveBodies[0]?.cells ?? [];
}

function mockSave(behaviour: { reject?: Error } = {}) {
  vi.mocked(useSaveTimesheetWeek).mockReturnValue({
    mutateAsync: vi.fn(async (body: TimesheetWeekSave) => {
      saveBodies.push(body);
      if (behaviour.reject) throw behaviour.reject;
      return WEEK;
    }),
  } as never);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<SiteTimesheetView />, { wrapper: Wrapper });
}

/** Saat kutusuna yazar ve odaktan çıkarak taslağa işler (E5 238). */
async function typeHours(cellLabel: string, value: string) {
  const input = screen.getByLabelText(`${cellLabel} saati`);
  await userEvent.clear(input);
  if (value.length > 0) await userEvent.type(input, value);
  await userEvent.tab();
}

/** Kod çapasını açıp rozet seçer (mockup rozeti çizer, seçme yolunu çizmez). */
async function pickCode(cellLabel: string, codeLabel: string) {
  await userEvent.click(screen.getByRole("button", { name: `${cellLabel} puantaj kodu` }));
  const popover = screen.getByRole("dialog", { name: `${cellLabel} — puantaj hücresi` });
  await userEvent.click(within(popover).getByRole("button", { name: codeLabel }));
}

beforeEach(() => {
  vi.clearAllMocks();
  saveBodies = [];
  searchParams = new URLSearchParams(WEEK_QUERY);
  mockSession("full");
  mockSave();
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
  vi.mocked(useSiteSections).mockReturnValue({
    data: {
      items: [
        { id: "sec-1", name: "Kat 6–10 Kaba İnşaat" },
        { id: "sec-2", name: "Kat 1–5 İnce İşler" },
      ],
    },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
});

describe("SiteTimesheetView · haftalık iskelet", () => {
  it("başlık, hafta şeridi ve YEDİ gün sütunu basar", () => {
    renderView();
    expect(screen.getByRole("heading", { name: "A-Blok — Puantaj" })).toBeInTheDocument();
    expect(screen.getByText("3 – 9 Ağustos 2026")).toBeInTheDocument();
    expect(document.querySelector(".ts-week-nav__index")?.textContent).toBe("32. Hafta");
    for (const weekday of ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]) {
      expect(screen.getByText(weekday)).toBeInTheDocument();
    }
    expect(screen.getByText("3 Ağu")).toBeInTheDocument();
  });

  it("Normal/FM/Hafta Toplam kolonları BACKEND türevinden basılır", () => {
    renderView();
    expect(screen.getByRole("columnheader", { name: "Normal Saat" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "FM Saat" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Hafta Toplam" })).toBeInTheDocument();
  });

  it("ŞP'nin KORUNAN parçaları yerinde: Tür rozeti + meslek/firma + özet şeridi", () => {
    renderView();
    expect(screen.getByText("Demir Ustası · Akın İnşaat")).toBeInTheDocument();
    expect(screen.getByText("Taşeron")).toBeInTheDocument();
    expect(screen.getByText("Şirket")).toBeInTheDocument();
    expect(document.querySelector(".ts-summary__title")?.textContent).toBe("Tüm Bölümler");
    expect(screen.getByText("2 işçi")).toBeInTheDocument();
  });

  it("ŞP mockup'ında OLMAYAN meslek/tür/taşeron süzgeçleri UYDURULMAZ", () => {
    renderView();
    expect(screen.queryByLabelText("Meslek")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Çalışan türü")).not.toBeInTheDocument();
  });

  it("ay şeridi 'girilmedi' rozetini SAAT SIFIRLIĞINDAN değil `has_entries`ten basar", () => {
    renderView();
    expect(screen.getByText("girilmedi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /33\. Hafta/ })).toBeInTheDocument();
  });
});

describe("SiteTimesheetView · KPI kartları", () => {
  it("🔴 İzin ve Geçici Görev AYRI karttır (yönetim kararı) — mockup ikisini topluyordu", () => {
    vi.mocked(useTimesheetWeek).mockReturnValue({
      data: {
        ...WEEK,
        rows: [
          {
            ...WEEK.rows[0],
            cells: [
              { work_date: "2026-08-03", hours: null, code: "leave", section_id: "sec-1" },
              { work_date: "2026-08-04", hours: null, code: "leave", section_id: "sec-1" },
              {
                work_date: "2026-08-05",
                hours: null,
                code: "temporary_duty",
                section_id: "sec-1",
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    renderView();
    const kpiLabel = (text: string) =>
      [...document.querySelectorAll<HTMLElement>(".ts-kpi__label")].find(
        (node) => node.textContent === text,
      );
    const leaveCard = kpiLabel("İzin")?.closest(".ts-kpi") as HTMLElement;
    const dutyCard = kpiLabel("Geçici Görev")?.closest(".ts-kpi") as HTMLElement;
    expect(within(leaveCard).getByText("2")).toBeInTheDocument();
    expect(within(dutyCard).getByText("1")).toBeInTheDocument();
  });
});

describe("SiteTimesheetView · K2 bölüm filtresi", () => {
  it("GET'e section_id GEÇMEZ — filtre yalnız görünümü süzer", () => {
    searchParams = new URLSearchParams({ ...WEEK_QUERY, section: "sec-1" });
    renderView();
    // Hafta sorgusu YALNIZ şantiye + hafta alır; üçüncü bir süzgeç argümanı YOK.
    expect(vi.mocked(useTimesheetWeek).mock.calls[0]?.[1]).toEqual({
      isoYear: 2026,
      isoWeek: 32,
    });
    // Ucuncu bir suzgec argumaninin HIC gecirilmemesi K2'nin yapisal
    // guvencesidir: cagriyi bicimlendiren TEK sey santiye + haftadir.
    expect(vi.mocked(useTimesheetWeek).mock.calls[0]).toHaveLength(2);
  });

  it("süzgeç açıkken özet ve toplamlar süzülmüş kümeden hesaplanır", () => {
    searchParams = new URLSearchParams({ ...WEEK_QUERY, section: "sec-1" });
    renderView();
    expect(document.querySelector(".ts-summary__title")?.textContent).toBe(
      "Kat 6–10 Kaba İnşaat",
    );
    expect(screen.getByText("1 işçi")).toBeInTheDocument();
  });

  it("bölüm seçimi URL'ye yazılır (ağ isteği tetiklemez)", async () => {
    renderView();
    await userEvent.selectOptions(screen.getByLabelText("Bölüm"), "sec-2");
    expect(replace).toHaveBeenCalledWith(
      "/projeler/p-1/santiyeler/s-1/puantaj?iso_year=2026&iso_week=32&section=sec-2",
      { scroll: false },
    );
  });
});

describe("SiteTimesheetView · izin dalları", () => {
  it("PM (none) AccessDenied görür", () => {
    mockSession("none");
    renderView();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "A-Blok — Puantaj" })).not.toBeInTheDocument();
  });

  it("saha mühendisi (view) ızgarayı görür; kutular BASILMAZ, Kaydet DEVRE DIŞI + gerekçe", () => {
    mockSession("view");
    renderView();
    expect(screen.getByRole("heading", { name: "A-Blok — Puantaj" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeDisabled();
    expect(screen.getByText(/Puantaj kaydetme yetkiniz yok/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/· \d+ \S+ saati$/)).not.toBeInTheDocument();
    // Salt-okunur saat hücreleri yerinde durur.
    expect(document.querySelectorAll(".ts-hours").length).toBeGreaterThan(0);
  });

  it("yazma izinlide Kaydet değişiklik YOKKEN devre dışı; Excel (ŞP 100) KORUNDU", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excel" })).toBeEnabled();
  });
});

describe("SiteTimesheetView · hücre düzenleme", () => {
  it("saat kutusuna yazmak taslağa işler ve gövdeye SAAT olarak geçer", async () => {
    renderView();
    await typeHours("Ahmet Yılmaz · 5 Ağu", "7,5");
    expect(screen.getByText(/Kaydedilmemiş 1 hücre değişikliği var/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    expect(savedCells()).toContainEqual({
      personnel_id: "per-1",
      work_date: "2026-08-05",
      hours: "7.5",
      code: null,
      section_id: null,
    });
  });

  it("geçersiz saat REDDEDİLİR ve gerekçe hücrede kalır", async () => {
    renderView();
    await typeHours("Ahmet Yılmaz · 5 Ağu", "25");
    expect(screen.getByText(/en çok 24 olmalı/)).toBeInTheDocument();
    expect(screen.queryByText(/Kaydedilmemiş/)).not.toBeInTheDocument();
  });

  it("🔴 kod seçmek SAATİ DÜŞÜRÜR (saat XOR kod)", async () => {
    renderView();
    await pickCode("Ahmet Yılmaz · 3 Ağu", "İzin");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    expect(savedCells()).toContainEqual({
      personnel_id: "per-1",
      work_date: "2026-08-03",
      hours: null,
      code: "leave",
      section_id: "sec-1",
    });
  });

  it("boş kutuyu boş bırakmak hücreyi GÖVDEDEN düşürür (silme)", async () => {
    renderView();
    await typeHours("Ahmet Yılmaz · 3 Ağu", "");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    expect(
      savedCells().some(
        (cell) => cell.personnel_id === "per-1" && cell.work_date === "2026-08-03",
      ),
    ).toBe(false);
  });

  it("HİÇ kaydı olmayan personel satırı da düzenlenebilir (K1)", async () => {
    vi.mocked(usePersonnel).mockReturnValue({
      data: {
        items: [{ id: "per-9", full_name: "Zeki Uçar", trade: "Sıvacı", source: "company" }],
        total: 1,
        limit: 200,
        offset: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    renderView();
    await typeHours("Zeki Uçar · 4 Ağu", "9");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    expect(savedCells()).toContainEqual({
      personnel_id: "per-9",
      work_date: "2026-08-04",
      hours: "9",
      code: null,
      section_id: null,
    });
  });
});

/* ═══ 🔴 KAPSAM KANITI — İKİ BACAK, İKİSİ DE POZİTİF KONTROL ══════════════
 * `PUT .../timesheet/week` HAFTA+şantiye kapsamında DEĞİŞTİRMEDİR.
 *   (a) Bölüm filtresi AÇIKKEN gövde yine ŞANTİYENİN TAM kümesi olmalı —
 *       süzülmüş `rows`tan kurulsaydı sec-2'nin haftası SİLİNİRDİ.
 *   (b) Gövde YALNIZ bu haftanın günlerini taşımalı — ayın öbür haftası
 *       kapsam dışıdır (backend ikizi: `test_hafta_kaydetmek_ayin_diger_
 *       haftasina_DOKUNMAZ`).
 * İKİSİ BİRDEN ölçülmezse "her şeyi silen" bozuk bir gövde de yeşil geçer
 * (K-IKIZ1).
 * ═══════════════════════════════════════════════════════════════════════ */
describe("SiteTimesheetView · KAPSAM KURALI", () => {
  it("(a) bölüm filtresi AÇIKKEN kaydet → süzgeç DIŞINDAKİ bölümün hücresi gövdede HAYATTA", async () => {
    searchParams = new URLSearchParams({ ...WEEK_QUERY, section: "sec-1" });
    renderView();

    // Görünüm süzülmüş: sec-2'li Cem Aksoy'un hücresi ekranda YOK.
    expect(screen.getByText("1 işçi")).toBeInTheDocument();

    await pickCode("Ahmet Yılmaz · 3 Ağu", "İzin");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));

    const cells = savedCells();
    expect(cells).toHaveLength(2);
    expect(cells).toContainEqual({
      personnel_id: "per-2",
      work_date: "2026-08-03",
      hours: "12.0",
      code: null,
      section_id: "sec-2",
    });
    // Aktif filtre, dokunulmayan hücrenin bölümünü DEĞİŞTİRMEZ.
    expect(cells.find((cell) => cell.personnel_id === "per-1")?.section_id).toBe("sec-1");
  });

  it("(b) gövde YALNIZ bu haftanın günlerini taşır — ayın öbür haftası kapsam dışı", async () => {
    // Sunucu yanıtı yalnız haftanın hücrelerini taşır; ekran gövdeye BAŞKA
    // haftanın günlerini EKLEYEMEZ. Kanıt: her `work_date` 3–9 Ağustos'ta.
    renderView();
    await typeHours("Ahmet Yılmaz · 5 Ağu", "9");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    const dates = savedCells().map((cell) => cell.work_date);
    expect(dates.length).toBeGreaterThan(0);
    for (const date of dates) {
      expect(date >= "2026-08-03" && date <= "2026-08-09").toBe(true);
    }
    // 2026-08-26 (W35) gibi ayın başka haftası gövdeye HİÇ girmez.
    expect(dates).not.toContain("2026-08-26");
  });

  it("filtre açıkken açılan YENİ hücre o bölümü alır", async () => {
    searchParams = new URLSearchParams({ ...WEEK_QUERY, section: "sec-1" });
    renderView();
    await typeHours("Ahmet Yılmaz · 6 Ağu", "9");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    expect(savedCells().find((cell) => cell.work_date === "2026-08-06")?.section_id).toBe(
      "sec-1",
    );
  });
});

describe("SiteTimesheetView · taslak KAPSAMI", () => {
  it("🔴 HAFTA değişince taslak DÜŞER — başka haftanın taslağı kaydedilemez", async () => {
    const { rerender } = renderView();
    await typeHours("Ahmet Yılmaz · 5 Ağu", "7");
    expect(screen.getByText(/Kaydedilmemiş 1 hücre/)).toBeInTheDocument();

    // Kullanıcı bir sonraki haftaya geçti (URL değişti, aynı ekran).
    searchParams = new URLSearchParams({ iso_year: "2026", iso_week: "33" });
    rerender(<SiteTimesheetView />);

    // Taslak render SIRASINDA düşer. Efektle sıfırlansaydı bir kare boyunca
    // BAŞKA haftanın taslağı görünür, kaydedilirse backend 422 verirdi.
    expect(screen.queryByText(/Kaydedilmemiş/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeDisabled();
  });

  it("ŞANTİYE aynı kalıp hafta aynıysa taslak KORUNUR (pozitif kontrol)", async () => {
    const { rerender } = renderView();
    await typeHours("Ahmet Yılmaz · 5 Ağu", "7");
    rerender(<SiteTimesheetView />);
    expect(screen.getByText(/Kaydedilmemiş 1 hücre/)).toBeInTheDocument();
  });
});

describe("SiteTimesheetView · kaydetme sonucu", () => {
  it("başarılı kayıttan sonra 'kaydedildi' yazar ve taslak düşer", async () => {
    renderView();
    await pickCode("Ahmet Yılmaz · 3 Ağu", "İzin");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    expect(await screen.findByText("Hafta kaydedildi.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeDisabled();
  });

  it("409 kişi-gün çakışması Türkçe mesajla basılır ve taslak KORUNUR", async () => {
    mockSave({
      reject: new BackendError(409, {
        detail: "Mehmet Kılıç 3 Ağustos günü B-Blok şantiyesinde kayıtlı.",
      }),
    });
    renderView();
    await pickCode("Ahmet Yılmaz · 3 Ağu", "İzin");
    await userEvent.click(screen.getByRole("button", { name: "Haftayı Kaydet" }));
    expect(
      await screen.findByText(
        "Kişi-gün çakışması: Mehmet Kılıç 3 Ağustos günü B-Blok şantiyesinde kayıtlı.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Haftayı Kaydet" })).toBeEnabled();
  });
});

describe("SiteTimesheetView · Excel indirme (K2 istisnası)", () => {
  it("bölüm süzgeci SUNUCUYA geçirilir; ay HAFTA YANITINDAN okunur", async () => {
    searchParams = new URLSearchParams({ ...WEEK_QUERY, section: "sec-1" });
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(vi.mocked(downloadTimesheetExport)).toHaveBeenCalledWith("s-1", {
      year: 2026,
      month: 8,
      sectionId: "sec-1",
    });
  });

  it("filtre kapalıyken section_id GEÇMEZ", async () => {
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(vi.mocked(downloadTimesheetExport)).toHaveBeenCalledWith("s-1", {
      year: 2026,
      month: 8,
    });
  });

  it("indirme hatası GÖRÜNÜR Türkçe mesaj bırakır", async () => {
    vi.mocked(downloadTimesheetExport).mockRejectedValueOnce(
      new BackendError(404, { detail: "Şantiye bulunamadı." }),
    );
    renderView();
    await userEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(await screen.findByText("Şantiye bulunamadı.")).toBeInTheDocument();
  });
});
