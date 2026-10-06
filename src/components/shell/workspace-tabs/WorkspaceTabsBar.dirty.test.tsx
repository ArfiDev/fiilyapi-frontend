import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Modal } from "@/components/settings/Modal";
import { useSession } from "@/components/shell/SessionProvider";
import { PERSONNEL_VIEW, TIMESHEET_EDIT, TIMESHEET_VIEW_PAGES } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";
import { GeneralTimesheetView } from "@/components/timesheet/GeneralTimesheetView";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useTimesheetWeek, type TimesheetWeek } from "@/lib/api/hooks/useTimesheet";
import { useSaveTimesheetWeek } from "@/lib/api/hooks/useTimesheetMutations";
import { openTab } from "@/lib/workspace-tabs/tabs-reducer";
import { workspaceTabsStore } from "@/lib/workspace-tabs/tabs-store";
import { WorkspaceTabsBar } from "./WorkspaceTabsBar";

/**
 * SEKME-F1.4a · UÇTAN UCA DIRTY (CEO şartı) — jsdom'da GERÇEK bileşenlerle:
 * gerçek şerit (`WorkspaceTabsStrip`), gerçek denetleyici, gerçek merkezi
 * kayıt ve gerçek dirty kaynakları (puantaj ekranı `useTimesheetWeekEditor`
 * üzerinden; ayarlar `Modal`ı `isDirty` üzerinden). Yalnız ağ/oturum ve
 * router sahte (puantaj testinin mevcut altyapısı, `GeneralTimesheetView.test`).
 */

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/puantaj",
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  useSearchParams: () => new URLSearchParams({ site: "s-1", iso_year: "2026", iso_week: "32" }),
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

// IZN-F6a · sayfa izni: puantaj sayfaları Düzenler (eski timesheet:full), personel sayfaları Görmez (personnel:none).
const ME = meFixture({
  pages: { ...pagesFor(TIMESHEET_EDIT, "edit"), ...pagesFor(TIMESHEET_VIEW_PAGES, "edit"), ...pagesFor(PERSONNEL_VIEW, "none") },
});

const WEEK = {
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
  ],
  day_totals: [],
  month_year: 2026,
  month_month: 8,
  month_total_hours: "9.0",
  month_man_days: "1.0",
  month_weeks: [],
} as unknown as TimesheetWeek;

function renderWith(screenUnderTest: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceTabsBar />
      {screenUnderTest}
    </QueryClientProvider>,
  );
}

/** Şeritte başka (aktif olmayan) sekmeye tık. */
async function clickTab(title: string): Promise<void> {
  const strip = screen.getByRole("tablist", { name: "Çalışma sekmeleri" });
  await userEvent.click(within(strip).getByRole("tab", { name: new RegExp(title) }));
}

function guardDialog(): HTMLElement | null {
  return screen.queryByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" });
}

beforeEach(() => {
  vi.clearAllMocks();
  workspaceTabsStore.detachUser();
  // Panel + Projeler (arka plan) + Puantaj (aktif, üzerinde çalışılan ekran).
  act(() => {
    workspaceTabsStore.dispatch(openTab, { url: "/projeler", background: true });
    workspaceTabsStore.dispatch(openTab, { url: "/puantaj?site=s-1&iso_year=2026&iso_week=32" });
  });
  vi.mocked(useSession).mockReturnValue({ me: ME, isLoading: false });
  vi.mocked(useSaveTimesheetWeek).mockReturnValue({ mutateAsync: vi.fn(async () => WEEK) } as never);
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useTimesheetWeek).mockReturnValue({ data: WEEK, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [{ siteId: "s-1", label: "A-Blok" }],
    isLoading: false,
    isError: false,
  } as never);
});

describe("uçtan uca dirty (a) — puantaj ekranı", () => {
  it("hiç dokunulmadan başka sekmeye tık → modal AÇILMAZ, gidilir", async () => {
    renderWith(<GeneralTimesheetView />);
    await clickTab("Projeler");
    expect(guardDialog()).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/projeler");
  });

  it("hücre değişince başka sekmeye tık → modal açılır, Vazgeç → kalınır", async () => {
    renderWith(<GeneralTimesheetView />);
    await userEvent.type(screen.getByLabelText("Ahmet Yılmaz · 5 Ağu saati"), "9");
    await userEvent.tab();

    await clickTab("Projeler");
    const dialog = guardDialog();
    expect(dialog).not.toBeNull();
    expect(dialog).toHaveTextContent("Puantaj");
    expect(pushMock).not.toHaveBeenCalled();

    await userEvent.click(within(dialog!).getByRole("button", { name: "Vazgeç" }));
    expect(guardDialog()).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
    expect(within(screen.getByRole("tablist")).getByRole("tab", { selected: true })).toHaveTextContent(
      "Puantaj",
    );
  });

  it("hücre değişince 'Değişiklikleri at ve geç' → hedef sekmeye gidilir", async () => {
    renderWith(<GeneralTimesheetView />);
    await userEvent.type(screen.getByLabelText("Ahmet Yılmaz · 5 Ağu saati"), "9");
    await userEvent.tab();
    await clickTab("Projeler");
    await userEvent.click(screen.getByRole("button", { name: "Değişiklikleri at ve geç" }));
    expect(pushMock).toHaveBeenCalledWith("/projeler");
  });
});

describe("uçtan uca dirty (b) — ayarlar Modal'ı", () => {
  it("dirty Modal açıkken sekme değişimi → onay modalı", async () => {
    renderWith(
      <Modal title="Kullanıcı Düzenle" onClose={vi.fn()} isDirty>
        <p>form</p>
      </Modal>,
    );
    await clickTab("Projeler");
    expect(guardDialog()).not.toBeNull();
    expect(guardDialog()).toHaveTextContent("Diyalog");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("dokunulmamış Modal açıkken sekme değişimi → onay modalı AÇILMAZ", async () => {
    renderWith(
      <Modal title="Kullanıcı Düzenle" onClose={vi.fn()}>
        <p>form</p>
      </Modal>,
    );
    await clickTab("Projeler");
    expect(guardDialog()).toBeNull();
    expect(pushMock).toHaveBeenCalledWith("/projeler");
  });
});
