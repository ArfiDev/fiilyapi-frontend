import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import SiteDiaryPage from "@/app/(app)/projeler/[projectId]/santiyeler/[siteId]/gunluk-kayit/page";
import GunlukKayitPage from "@/app/(app)/gunluk-kayit/page";
import { useSession } from "@/components/shell/SessionProvider";
import { isoDate } from "@/components/site-diary/derive";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useEvCodeTree, useEvDay, usePreviousAllocation } from "@/lib/api/hooks/useEvDay";
import { useSaveDayAllocation, useUnlockDay } from "@/lib/api/hooks/useEvDayMutations";
import { useEvSettings } from "@/lib/api/hooks/useEvSettings";
import { useEvBudget, useEvBudgetRevisions } from "@/lib/api/hooks/useEvBudget";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import {
  useSiteDiaryEntries,
  useSiteDiaryEntry,
  type SiteDiaryEntryDetail,
  type SiteDiaryEntryListResponse,
} from "@/lib/api/hooks/useSiteDiary";
import {
  useCreateSiteDiaryEntry,
  useReopenSiteDiaryEntry,
  useSaveSiteDiaryLines,
  useSubmitSiteDiaryEntry,
  useUpdateSiteDiaryEntry,
} from "@/lib/api/hooks/useSiteDiaryMutations";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useSitePlanDaySummary } from "@/lib/api/hooks/useSitePlanDaySummary";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useTimesheetWeek } from "@/lib/api/hooks/useTimesheet";
import type { EvDayView } from "@/lib/api/models";
import type { MeResponse } from "@/lib/auth/types";
import { BackendError } from "@/lib/api/unwrap";

import { ITEM_BETON, ITEM_KALIP, ITEM_PRIZ, P_RECEP, LEAF_KALIP, SEC_K610, codeTree, dayView } from "./diary-fixtures";
import { useDiaryProgressExtension } from "./useDiaryProgressExtension";

// PLN-F2.3 · ENTEGRASYON: rota sayfası → planlama adaptörü → GERÇEK çekirdek
// (`SiteDiaryEntryView` / `GeneralSiteDiaryView`) → adaptörün yuvaları. Çekirdek
// hook'ları çekirdeğin kendi testindeki gibi sahtelenir; EV hook'ları da.


const WEATHER = { code: "weather_incomplete", message: "Hava bilgisi eksik (durum, min/max sıcaklık, rüzgâr)" };
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("site=s-1"),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiaryEntries: vi.fn(),
  useSiteDiaryEntry: vi.fn(),
}));
// GKS-F1.3 · kayıtsız gün önizlemesi: istenen gün/bölüm için boş, güncel iskelet.
vi.mock("@/lib/api/hooks/useSiteDiarySkeleton", async () => ({
  useSiteDiarySkeleton: (await import("@/components/site-diary/diary-skeleton.testkit")).echoSkeletonQuery,
}));
vi.mock("@/lib/api/hooks/useSiteDiaryMutations", () => ({
  useCreateSiteDiaryEntry: vi.fn(),
  useUpdateSiteDiaryEntry: vi.fn(),
  useSaveSiteDiaryLines: vi.fn(),
  useSubmitSiteDiaryEntry: vi.fn(),
  useReopenSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSitePlanDaySummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSitePlanDaySummary")>()),
  useSitePlanDaySummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));
vi.mock("@/lib/api/hooks/useBoq", () => ({ useBoq: vi.fn() }));
vi.mock("@/lib/api/hooks/useProgressPayments", () => ({ useProgressPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({ useSiteSubcontractorPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useTimesheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTimesheet")>()),
  useTimesheetWeek: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvDay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvDay")>()),
  useEvDay: vi.fn(),
  useEvCodeTree: vi.fn(),
  usePreviousAllocation: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEvDayMutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvDayMutations")>()),
  useSaveDayAllocation: vi.fn(),
  useUnlockDay: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useEvSettings", () => ({ useEvSettings: vi.fn() }));
vi.mock("@/lib/api/hooks/useEvBudget", () => ({ useEvBudget: vi.fn(), useEvBudgetRevisions: vi.fn() }));

const TODAY = isoDate(new Date());
const unlockMutate = vi.fn();
const saveAllocationMutate = vi.fn();
const updateEntryMutate = vi.fn();

function query(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, isFetching: false, error: null, refetch: vi.fn(), ...extra } as never;
}

function mockDay(view: EvDayView) {
  vi.mocked(useEvDay).mockReturnValue(query(view));
}

function mockSession(permissions: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({
    me: { id: "u-1", email: "m@ornek.com", role_key: "engineer", status: "active", permissions } as unknown as MeResponse,
    isLoading: false,
  });
}

/** Günün kaydı: bir kalem × bölüm satırı (kalıp · Kat 6–10). */
function entry(): SiteDiaryEntryDetail {
  return {
    id: "d-1",
    site_id: "s-1",
    project_id: "p-1",
    entry_date: TODAY,
    section_id: null,
    weather: "sunny",
    temp_min_c: "17.0",
    temp_max_c: "28.0",
    wind_ms: "4.2",
    work_done: null,
    chief_note: null,
    safety_meeting_held: true,
    ppe_checked: true,
    has_incident: false,
    incident_note: null,
    status: "draft",
    submitted_at: null,
    created_by: "u-2",
    created_at: "2026-09-24T08:00:00Z",
    updated_at: "2026-09-24T09:00:00Z",
    lines: [
      {
        id: "l-1",
        boq_item_id: ITEM_KALIP,
        section_id: SEC_K610,
        code: "KAB.01.01",
        description: "Kalıp",
        unit: "m²",
        unit_price: "95.00",
        quantity: "93.000",
        cumulative_quantity: "93.000",
        leaf_cumulative_quantity: "1273.000",
        planned_quantity: "5300.000",
        remaining_quantity: "4027.000",
        overrun_reason: null,
        line_amount: "8835.00",
        section_name: "Kat 6–10",
      },
    ],
    worker_counts: [],
    lines_total: "8835.00",
    worker_total: 0,
    dropped_orphan_count: 0,
    // DET-1.B salt-okunur detay alanları — başlıksız taslak: gönderen yok, kilit yok.
    site_name: "A-Blok Şantiyesi",
    project_name: "Güneşkent",
    section_name: null,
    created_by_name: "Mühendis",
    submitted_by: null,
    submitted_by_name: null,
    locked: false,
    lock_report_date: null,
    prev_id: null,
    next_id: null,
    prev_entry_date: null,
    next_entry_date: null,
  } satisfies SiteDiaryEntryDetail;
}

function mockCore() {
  const detail = entry();
  vi.mocked(useSiteDiaryEntries).mockReturnValue(
    query({
      items: [
        {
          id: detail.id,
          entry_date: TODAY,
          status: "draft",
          site_id: "s-1",
          project_id: "p-1",
          section_id: null,
          // DET-1.B: başlıksız kayıt → ad `null`; dönem listesi süzgeçsiz → sayım `null`.
          section_name: null,
          section_line_count: null,
          weather: "sunny",
          has_incident: false,
          worker_total: 0,
          lines_total: "0",
          created_by: "u-2",
          created_at: "x",
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    } satisfies SiteDiaryEntryListResponse),
  );
  vi.mocked(useSiteDiaryEntry).mockReturnValue(query(detail));
  vi.mocked(useSite).mockReturnValue(
    query({ id: "s-1", name: "A-Blok Şantiyesi", status: "active", project: { id: "p-1", name: "Güneşkent" }, sections: [{ id: SEC_K610, name: "Kat 6–10" }] }),
  );
  vi.mocked(useSiteOptions).mockReturnValue({ options: [{ siteId: "s-1", projectId: "p-1", label: "A-Blok" }], isLoading: false, isError: false } as never);
  vi.mocked(useBoq).mockReturnValue(query(undefined));
  vi.mocked(useProgressPayments).mockReturnValue(query({ items: [], total: 0 }));
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({ items: [], isLoading: false, isError: false, isPartial: false, truncation: { isTruncated: false, shownCount: 0, totalCount: 0 } } as never);
  vi.mocked(useTimesheetWeek).mockReturnValue(query(undefined));
  vi.mocked(useSubcontractors).mockReturnValue(query({ items: [] }));
  vi.mocked(useSitePlanDaySummary).mockReturnValue(query(undefined));
  const mutation = () => ({ mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false }) as never;
  vi.mocked(useCreateSiteDiaryEntry).mockReturnValue(mutation());
  vi.mocked(useUpdateSiteDiaryEntry).mockReturnValue({ mutateAsync: updateEntryMutate, mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useSaveSiteDiaryLines).mockReturnValue(mutation());
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mutation());
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mutation());
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession({ site_diary: "full", earned_value: "draft", progress_payments: "view" });
  mockCore();
  mockDay(dayView({ day: TODAY }));
  vi.mocked(useEvCodeTree).mockReturnValue(query(codeTree()));
  vi.mocked(useEvSettings).mockReturnValue(query(undefined));
  vi.mocked(useEvBudgetRevisions).mockReturnValue(query([{ id: "rev-1", status: "active", number: 1 }]));
  vi.mocked(useEvBudget).mockReturnValue(
    query({ disciplines: [{ groups: [{ items: [{ item_id: ITEM_KALIP, is_direct: true, contractor_type: "own" }] }] }] }),
  );
  vi.mocked(usePreviousAllocation).mockReturnValue({ refetch: vi.fn() } as never);
  saveAllocationMutate.mockResolvedValue(dayView({ day: TODAY }));
  updateEntryMutate.mockResolvedValue(entry());
  vi.mocked(useSaveDayAllocation).mockReturnValue({ mutateAsync: saveAllocationMutate, isPending: false } as never);
  unlockMutate.mockResolvedValue({ locked: false });
  vi.mocked(useUnlockDay).mockReturnValue({ mutateAsync: unlockMutate, isPending: false } as never);
});

describe("şantiye rotası → adaptör → çekirdek", () => {
  it("EV'li şantiye: Saat Dağıtımı bloğu, 'Gün 142 · H21', miktar ek kolonları", () => {
    renderWithClient(<SiteDiaryPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Saat Dağıtımı/ })).toBeInTheDocument();
    expect(screen.getByText(/Gün 142 · H21/)).toBeInTheDocument();
    expect(screen.getByText("Bugün kaz. a-s")).toBeInTheDocument();
    // Satırın kazanılmışı + PF'si payload'dan: 79,05 → "79,1"; PF 0,9449 → "0,94" kırmızı.
    const row = screen.getAllByText("0,94")[0].closest("tr") as HTMLElement;
    expect(within(row).getByText("0,94")).toHaveClass("ev-diary-pf--red");
    expect(within(row).getByText("79,1")).toBeInTheDocument();
    // Genişletilmiş yuvalar çekirdekte: alt başlık (İ:213) + kalem etiketi (İ:225).
    expect(screen.getByText(/kazanılmış = bugün miktar × birim oran \(Rev 1\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/Kendi/).length).toBeGreaterThan(0);
    // Aktif revizyonun bütçesi istenir (taslak varsayılanı değil).
    expect(vi.mocked(useEvBudget)).toHaveBeenCalledWith("s-1", "rev-1");
  });

  it("baseline YOK (has_baseline=false): uzantı verilmez, çekirdek bugünkü gibi", () => {
    mockDay(dayView({ day: TODAY, has_baseline: false }));
    renderWithClient(<SiteDiaryPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Saat Dağıtımı/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Bugün kaz. a-s")).not.toBeInTheDocument();
    expect(screen.queryByText(/Gün 142/)).not.toBeInTheDocument();
  });

  it("earned_value görme yetkisi yoksa EV hiç istenmez", () => {
    mockSession({ site_diary: "full", earned_value: "none" });
    renderWithClient(<SiteDiaryPage />);
    expect(vi.mocked(useEvDay).mock.calls.every(([siteId]) => siteId === "")).toBe(true);
    expect(screen.queryByRole("heading", { name: /Saat Dağıtımı/ })).not.toBeInTheDocument();
  });

  it("Gönder kapısı: backend engeli çekirdeğin Gönder düğmesini kapatır, gerekçe ekranda", () => {
    mockDay(dayView({ day: TODAY, submit: { can_submit: false, reasons: [WEATHER.message], reason_items: [WEATHER] } }));
    renderWithClient(<SiteDiaryPage />);
    expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
    // Karar 6 — bloktaki "Gönder" (kontrol çubuğu + tablet çubuğu) çekirdeğin `canSubmit`ini izler.
    for (const button of screen.getAllByRole("button", { name: "Gönder" })) expect(button).toBeDisabled();
    // S4 — gerekçe yalnız kontrol çubuğunda; çekirdek kendi kutusunda LİSTELEMEZ.
    expect(screen.queryByText(WEATHER.message)).not.toBeInTheDocument();
    expect(screen.getByText("Hava eksik")).toBeInTheDocument();
  });

  it("kilitli gün: bant + 'Kilidi aç (yetkili)' → gerekçe modalı → unlock", async () => {
    const user = userEvent.setup();
    mockSession({ site_diary: "full", earned_value: "approve" });
    mockDay(dayView({ day: TODAY, lock: { locked: true, report_date: "2026-09-25", approved_at: null, approved_by: null, unlock: null } }));
    renderWithClient(<SiteDiaryPage />);
    expect(screen.getByText("Bu gün 25.09.2026 raporuyla kilitlendi.")).toBeInTheDocument();
    // Karar 5 — bant `topBanner`da TAM genişlik; durum satırındaki çekirdek bandı basılmaz.
    expect(screen.getByText("Bu gün 25.09.2026 raporuyla kilitlendi.").closest(".diary__top-banner")).not.toBeNull();
    expect(document.querySelector(".diary__lock-banner")).toBeNull();
    expect(screen.getByText("Salt okunur · gün kilitli")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kilidi aç (yetkili)" }));
    const dialog = screen.getByRole("dialog", { name: "Günün kilidini aç" });
    const confirm = within(dialog).getByRole("button", { name: "Kilidi aç" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "puantaj düzeltmesi");
    await user.click(confirm);
    expect(unlockMutate).toHaveBeenCalledWith("puantaj düzeltmesi");
  });

  it("draft seviyesi kilidi AÇAMAZ (approve ister)", () => {
    mockDay(dayView({ day: TODAY, lock: { locked: true, report_date: "2026-09-25", approved_at: null, approved_by: null, unlock: null } }));
    renderWithClient(<SiteDiaryPage />);
    expect(screen.getByText("Bu gün 25.09.2026 raporuyla kilitlendi.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kilidi aç (yetkili)" })).not.toBeInTheDocument();
  });
});

describe("S1 · tek kayıt düğmesi: çekirdek kaydından ÖNCE dağıtım (onBeforeSave)", () => {
  async function editAndSaveDraft() {
    const user = userEvent.setup();
    renderWithClient(<SiteDiaryPage />);
    await user.type(screen.getByLabelText("Recep Uçar · Kalıp · Kat 6–10 saati"), "8");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
  }

  it("kirli dağıtım TAM kümeyle PUT edilir, sonra çekirdek kaydı yapılır", async () => {
    await editAndSaveDraft();
    await waitFor(() => expect(updateEntryMutate).toHaveBeenCalled());
    const body = saveAllocationMutate.mock.calls[0][0];
    expect(body.cells).toHaveLength(3); // dokunulmamış iki satır + düzenlenen
    expect(body.cells.at(-1)).toEqual({ row: { kind: "personnel", ref_id: P_RECEP }, node_id: LEAF_KALIP, hours: "8" });
    expect(saveAllocationMutate.mock.invocationCallOrder[0]).toBeLessThan(updateEntryMutate.mock.invocationCallOrder[0]);
  });

  it.each([409, 422])("dağıtım %i → reddeder: çekirdek kaydı YAPILMAZ, hata ekranda", async (status) => {
    saveAllocationMutate.mockRejectedValue(new BackendError(status, { detail: "Gün kilitli, dağıtım yazılamadı" }));
    await editAndSaveDraft();
    expect(await screen.findByText("Gün kilitli, dağıtım yazılamadı")).toBeInTheDocument();
    expect(updateEntryMutate).not.toHaveBeenCalled();
  });
});

describe("gün görünümü hataları", () => {
  it.each([404, 409])("%i (planlama yok) → uzantı yok, sessiz", (status) => {
    vi.mocked(useEvDay).mockReturnValue(query(undefined, { isError: true, error: new BackendError(status, {}) }));
    renderWithClient(<SiteDiaryPage />);
    expect(screen.queryByRole("heading", { name: /Saat Dağıtımı/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Saat dağıtımı yüklenemedi")).not.toBeInTheDocument();
  });

  it("500 → hata kartı (sessiz boş blok yok), 'Tekrar dene' yeniden ister", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    vi.mocked(useEvDay).mockReturnValue(query(undefined, { isError: true, error: new BackendError(500, {}), refetch }));
    renderWithClient(<SiteDiaryPage />);
    expect(screen.getByText("Saat dağıtımı yüklenemedi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe("useDiaryProgressExtension — üretilen DiaryExtension", () => {
  function extension() {
    const client = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const ctx = { siteId: "s-1", day: TODAY, entryId: "d-1", entryStatus: "draft" as const, lines: [{ key: "a", boqItemId: ITEM_KALIP, sectionId: SEC_K610, quantityToday: "93" }] };
    return renderHook(() => useDiaryProgressExtension(ctx), { wrapper }).result.current;
  }

  it("itemMeta: dolaylı kalem kümesi (G9) + Kendi/Taşeron etiketi (İ:225) aktif bütçeden", () => {
    vi.mocked(useEvBudget).mockReturnValue(
      query({ disciplines: [{ groups: [{ items: [
        { item_id: ITEM_KALIP, is_direct: true, contractor_type: "own" },
        { item_id: ITEM_BETON, is_direct: false, contractor_type: "subcon" },
      ] }] }] }),
    );
    const ext = extension();
    expect([...(ext?.itemMeta?.indirectItemIds ?? [])]).toEqual([ITEM_BETON]);
    expect(ext?.itemMeta?.renderItemTag?.(ITEM_KALIP)).toBe("Kendi");
    expect(ext?.itemMeta?.renderItemTag?.(ITEM_BETON)).toBe("Taşeron");
  });

  it("aktif revizyon yoksa bütçe İSTENMEZ (taslak varsayılanına düşülmez), küme boş", () => {
    vi.mocked(useEvBudgetRevisions).mockReturnValue(query([{ id: "rev-2", status: "draft", number: 2 }]));
    const ext = extension();
    expect(vi.mocked(useEvBudget)).toHaveBeenLastCalledWith("", null);
    expect(ext?.itemMeta?.indirectItemIds?.size).toBe(0);
  });

  it("lineColumns: caption (Rev n) + kalem başlık hücreleri headers uzunluğunda; headerSuffix; submitGate", () => {
    const ext = extension();
    expect(ext?.lineColumns?.caption).toBe("İş tipi × bölüm · kazanılmış = bugün miktar × birim oran (Rev 1)");
    expect(ext?.lineColumns?.renderItemCells?.(ITEM_KALIP)).toHaveLength(ext?.lineColumns?.headers.length ?? -1);
    expect(ext?.headerSuffix).toBe("Gün 142 · H21");
    expect(ext?.submitGate).toEqual({ canSubmit: true, reasons: [], showReasonsInCore: false });
    expect(ext?.topBanner).toBeUndefined();
    expect(ext?.lock).toBeNull();
    const sub = ext?.lineColumns?.renderSubRow;
    expect(sub?.({ key: "a", boqItemId: ITEM_KALIP, sectionId: SEC_K610, quantityToday: "1" })).toBeNull();
    expect(sub?.({ key: "b", boqItemId: ITEM_PRIZ, sectionId: null, quantityToday: "1" })).not.toBeNull();
  });

  it("S1: taslak temizse onBeforeSave istek ATMADAN çözülür", async () => {
    await expect(extension()?.onBeforeSave?.()).resolves.toBeUndefined();
    expect(saveAllocationMutate).not.toHaveBeenCalled();
  });

  it("S3: formen (earned_value view + site_diary yazma) → topBanner formen bandı", () => {
    mockSession({ site_diary: "full", earned_value: "view" });
    const { container } = render(<>{extension()?.topBanner}</>);
    expect(container.textContent).toContain("Formen görünümü.");
  });
});

describe("kök ikiz → adaptör → çekirdek", () => {
  it("/gunluk-kayit da aynı yuvaları basar", () => {
    renderWithClient(<GunlukKayitPage />);
    expect(screen.getByLabelText("Şantiye")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Saat Dağıtımı/ })).toBeInTheDocument();
    expect(screen.getByText(/Gün 142 · H21/)).toBeInTheDocument();
  });
});
