import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";

import { SiteDiaryEntryView } from "./SiteDiaryEntryView";
import { isoDate } from "./derive";
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
import {
  fetchSiteDiarySkeleton,
  useSiteDiarySkeleton,
  type SiteDiarySkeleton,
} from "@/lib/api/hooks/useSiteDiarySkeleton";
import { formatDateDots } from "@/lib/format";
import { useSitePlanDaySummary } from "@/lib/api/hooks/useSitePlanDaySummary";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSession } from "@/components/shell/SessionProvider";
import type { MeResponse } from "@/lib/auth/types";

// GKS-F1.4 · bölüm/tarih değişiminde onay diyalogları (Ü3, Ü3b, Ü5). Hook'lar
// mock'lu; iskelet çekimi `fetchSiteDiarySkeleton` mock'u + gerçek QueryClient.

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", () => ({ useSiteDiaryEntries: vi.fn(), useSiteDiaryEntry: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiarySkeleton", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiarySkeleton")>()),
  useSiteDiarySkeleton: vi.fn(),
  fetchSiteDiarySkeleton: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteDiaryMutations", () => ({
  useCreateSiteDiaryEntry: vi.fn(),
  useUpdateSiteDiaryEntry: vi.fn(),
  useUpdateCreatedSiteDiaryEntry: vi.fn(),
  useSaveSiteDiaryLines: vi.fn(),
  useSubmitSiteDiaryEntry: vi.fn(),
  useReopenSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSitePlanDaySummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSitePlanDaySummary")>()),
  useSitePlanDaySummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/lib/api/hooks/useBoq", () => ({ useBoq: vi.fn() }));
vi.mock("@/lib/api/hooks/useProgressPayments", () => ({ useProgressPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({ useSiteSubcontractorPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));

const TODAY = isoDate(new Date());

const SK_LINE = {
  boq_item_id: "bi-1",
  section_id: null,
  code: "03.001",
  description: "C25/30 Beton",
  unit: "m³",
  unit_price: "1520.00",
  quantity: "0.000",
  cumulative_quantity: "900.000",
  leaf_cumulative_quantity: "900.000",
  planned_quantity: "1000.000",
  remaining_quantity: "100.000",
  overrun_reason: null,
  line_amount: "0.00",
  section_name: null,
} satisfies SiteDiarySkeleton["lines"][number];

const LINE_A = { ...SK_LINE, boq_item_id: "bi-2", section_id: "sec-1", code: "04.001", description: "Kalıp", section_name: "Kat 1–5" };
const LINE_B = { ...SK_LINE, boq_item_id: "bi-3", section_id: "sec-1", code: "05.001", description: "Demir", section_name: "Kat 1–5" };
const LINE_C = { ...SK_LINE, boq_item_id: "bi-4", section_id: "sec-2", code: "06.001", description: "Sıva", section_name: "Kat 6–10" };

/** Bölüme göre iskelet: "" → Bölümsüz kalem; sec-1 → iki kalem; sec-2 → bir kalem. */
function skeletonFor(entryDate: string, sectionId: string): SiteDiarySkeleton {
  const lines = sectionId === "sec-1" ? [LINE_A, LINE_B] : sectionId === "sec-2" ? [LINE_C] : [SK_LINE];
  return {
    entry_date: entryDate,
    section_id: sectionId === "" ? null : sectionId,
    section_name: null,
    existing_entry_id: null,
    locked: false,
    lock_report_date: null,
    lines,
    lines_total: "0.00",
  } satisfies SiteDiarySkeleton;
}

function mockSkeletonBySection() {
  vi.mocked(useSiteDiarySkeleton).mockImplementation(((_siteId: string, entryDate: string, sectionId: string) => ({
    data: skeletonFor(entryDate, sectionId),
    isFetching: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })) as never);
  vi.mocked(fetchSiteDiarySkeleton).mockImplementation(async (_siteId, entryDate, sectionId) =>
    skeletonFor(entryDate, sectionId),
  );
}

function entryDetail(overrides: Partial<SiteDiaryEntryDetail> = {}): SiteDiaryEntryDetail {
  return {
    id: "d-1",
    site_id: "s-1",
    project_id: "p-1",
    entry_date: TODAY,
    section_id: null,
    weather: "sunny",
    temp_max_c: "28.0",
    work_done: "Kayıtlı iş",
    chief_note: null,
    safety_meeting_held: true,
    ppe_checked: true,
    has_incident: false,
    incident_note: null,
    status: "draft",
    submitted_at: null,
    created_by: "u-2",
    created_at: "2026-07-15T08:00:00Z",
    updated_at: "2026-07-15T09:00:00Z",
    lines: [{ ...SK_LINE, id: "l-1", quantity: "120.000", line_amount: "182400.00" }],
    worker_counts: [],
    lines_total: "182400.00",
    worker_total: 0,
    dropped_orphan_count: 0,
    site_name: "A-Blok Şantiyesi",
    project_name: "Güneşkent",
    section_name: null,
    created_by_name: "Mehmet Demir",
    submitted_by: null,
    submitted_by_name: null,
    locked: false,
    lock_report_date: null,
    prev_id: null,
    next_id: null,
    prev_entry_date: null,
    next_entry_date: null,
    ...overrides,
  } satisfies SiteDiaryEntryDetail;
}

const createMutate = vi.fn();
const updateMutate = vi.fn();
const linesMutate = vi.fn();
const refetchEntries = vi.fn();

function mockMutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, mutate: vi.fn(), isPending: false } as never;
}

/** Liste eşleşmesi: `listedEntry` verilirse ekran o günü LİSTEDEN bulur. */
function mockEntries(listedEntry?: SiteDiaryEntryDetail, byId: Record<string, SiteDiaryEntryDetail> = {}) {
  vi.mocked(useSiteDiaryEntries).mockReturnValue({
    data: {
      items: listedEntry
        ? [
            {
              id: listedEntry.id,
              site_id: "s-1",
              project_id: "p-1",
              entry_date: listedEntry.entry_date,
              section_id: null,
              section_name: null,
              section_line_count: null,
              weather: "sunny",
              has_incident: false,
              status: listedEntry.status,
              worker_total: 0,
              lines_total: "0.00",
              created_by: "u-2",
              created_at: "2026-07-15T08:00:00Z",
            },
          ]
        : [],
      total: listedEntry ? 1 : 0,
      limit: 50,
      offset: 0,
    } satisfies SiteDiaryEntryListResponse,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchEntries,
  } as never);
  const all = { ...byId, ...(listedEntry ? { [listedEntry.id]: listedEntry } : {}) };
  vi.mocked(useSiteDiaryEntry).mockImplementation(
    ((id: string) => ({ data: all[id], isLoading: false, isError: false, error: null })) as never,
  );
}

function mockSession(permissions: Record<string, string> = { site_diary: "full", progress_payments: "view" }) {
  vi.mocked(useSession).mockReturnValue({
    me: { id: "u-1", email: "m@o.com", full_name: "M", title: null, role_key: "site_chief", status: "active", permissions } as unknown as MeResponse,
    isLoading: false,
  });
}

const SECTIONS = [
  { id: "sec-1", name: "Kat 1–5", code: "K15", sort_order: 1 },
  { id: "sec-2", name: "Kat 6–10", code: "K610", sort_order: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockSession();
  mockEntries();
  mockSkeletonBySection();
  vi.mocked(useSite).mockReturnValue({
    data: { id: "s-1", name: "A-Blok Şantiyesi", project: { id: "p-1", name: "Güneşkent" }, sections: SECTIONS },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useBoq).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useProgressPayments).mockReturnValue({ data: { items: [], total: 0 }, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isPartial: false,
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
  } as never);
  vi.mocked(useSubcontractors).mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useSitePlanDaySummary).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useCreateSiteDiaryEntry).mockReturnValue(mockMutation(createMutate));
  vi.mocked(useUpdateSiteDiaryEntry).mockReturnValue(mockMutation(updateMutate));
  vi.mocked(useSaveSiteDiaryLines).mockReturnValue(mockMutation(linesMutate));
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
});


function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteDiaryEntryView />
    </QueryClientProvider>,
  );
}

const OTHER_DATE = "2026-07-15";
const MISSING_QTY = /bugün yapılan miktar/;

function sectionSelect() {
  return screen.getByRole("combobox", { name: "Bölüm" });
}
function dateField() {
  return screen.getByRole("textbox", { name: "Tarih" });
}
function dialog() {
  return screen.queryByRole("dialog");
}
async function pickSection(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.selectOptions(sectionSelect(), value);
}
/** S2: bölüm seçili + iki satıra miktar girilmiş. */
async function enterTwoQuantities(user: ReturnType<typeof userEvent.setup>) {
  await pickSection(user, "sec-1");
  const fields = screen.getAllByRole("textbox", { name: MISSING_QTY });
  await user.type(fields[0], "5");
  await user.type(fields[1], "7");
}

describe("GKS-F1.4 · Ü3 bölüm değişimi (kayıt yok)", () => {
  it("girilmiş veri yokken diyalog YOK, bölüm sessizce değişir", async () => {
    const user = userEvent.setup();
    renderView();

    await pickSection(user, "sec-1");

    expect(dialog()).not.toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("sec-1");
  });

  it("miktar varken diyalog çıkar: başlık, {n} satır, düğmeler", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);

    await pickSection(user, "sec-2");

    const modal = within(dialog() as HTMLElement);
    expect(modal.getByText("Girilen miktarlar silinecek")).toBeInTheDocument();
    expect(
      modal.getByText(
        "Bölüm değişince iş kalemi listesi yenilenir; bu güne girdiğiniz 2 satırlık miktar ve gerekçe kaydedilmeden silinir.",
      ),
    ).toBeInTheDocument();
    expect(modal.getByRole("button", { name: "Değiştir" })).toBeInTheDocument();
    expect(modal.getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
  });

  it("Vazgeç → bölüm ve girilen miktarlar korunur", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);
    await pickSection(user, "sec-2");

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));

    expect(dialog()).not.toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("sec-1");
    expect(screen.getAllByRole("textbox", { name: MISSING_QTY }).map((el) => (el as HTMLInputElement).value)).toEqual(["5", "7"]);
  });

  it("Değiştir → bölüm yeni, miktarlar temiz, yeni bölümün satırları gelir", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);
    await pickSection(user, "sec-2");

    await user.click(screen.getByRole("button", { name: "Değiştir" }));

    expect(dialog()).not.toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("sec-2");
    const fields = screen.getAllByRole("textbox", { name: MISSING_QTY });
    expect(fields).toHaveLength(1);
    expect(fields[0]).toHaveValue("");
  });

  it("'Bölüm seçilmedi'ye geçiş de sorar", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);

    await pickSection(user, "");

    expect(within(dialog() as HTMLElement).getByText("Girilen miktarlar silinecek")).toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("sec-1");
  });
});

describe("GKS-F1.4 · Ü3b tarih değişimi (kayıt yok)", () => {
  const OTHER_DISPLAY = formatDateDots(OTHER_DATE);

  it("girilmiş veri yokken tarih alanı değişimi diyalog açmaz", () => {
    renderView();

    fireEvent.change(dateField(), { target: { value: OTHER_DISPLAY } });

    expect(dialog()).not.toBeInTheDocument();
    expect(dateField()).toHaveValue(OTHER_DISPLAY);
  });

  it("tarih alanı: diyalog tarih metniyle çıkar; Vazgeç → tarih ESKİ, miktar korunur", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);
    const before = (dateField() as HTMLInputElement).value;

    fireEvent.change(dateField(), { target: { value: OTHER_DISPLAY } });

    const modal = within(dialog() as HTMLElement);
    expect(modal.getByText("Girilen veriler silinecek")).toBeInTheDocument();
    expect(
      modal.getByText(
        "Tarih değişince iş kalemi listesi yenilenir; bu güne girdiğiniz 2 satırlık miktar, gerekçe ve işçi sayısı kaydedilmeden silinir.",
      ),
    ).toBeInTheDocument();
    await user.click(modal.getByRole("button", { name: "Vazgeç" }));

    expect(dialog()).not.toBeInTheDocument();
    expect(dateField()).toHaveValue(before);
    expect(screen.getAllByRole("textbox", { name: MISSING_QTY }).map((el) => (el as HTMLInputElement).value)).toEqual(["5", "7"]);
  });

  it("tarih alanı: Değiştir → tarih yeni, miktarlar temiz", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);

    fireEvent.change(dateField(), { target: { value: OTHER_DISPLAY } });
    await user.click(screen.getByRole("button", { name: "Değiştir" }));

    await waitFor(() => expect(dateField()).toHaveValue(OTHER_DISPLAY));
    screen.getAllByRole("textbox", { name: MISSING_QTY }).forEach((el) => expect(el).toHaveValue(""));
  });

  it("veri varken yarım/boş tarih: diyalog yok, gün değişmez, miktarlar durur, alan yazmaya devam eder; geçerli tarih → diyalog, Vazgeç → eski", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);
    const before = (dateField() as HTMLInputElement).value;

    fireEvent.change(dateField(), { target: { value: "" } });
    fireEvent.change(dateField(), { target: { value: "15.07.20" } });

    expect(dialog()).not.toBeInTheDocument();
    expect(dateField()).toHaveValue("15.07.20");
    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[1]).toBe(TODAY);
    expect(screen.getAllByRole("textbox", { name: MISSING_QTY }).map((el) => (el as HTMLInputElement).value)).toEqual(["5", "7"]);

    fireEvent.change(dateField(), { target: { value: OTHER_DISPLAY } });

    const modal = within(dialog() as HTMLElement);
    expect(modal.getByText(/Tarih değişince/)).toBeInTheDocument();
    await user.click(modal.getByRole("button", { name: "Vazgeç" }));
    expect(dateField()).toHaveValue(before);
    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[1]).toBe(TODAY);
    expect(screen.getAllByRole("textbox", { name: MISSING_QTY })).toHaveLength(2);
  });

  it("veri varken yarım tarih sonrası tamamlanan tarih Değiştir ile uygulanır", async () => {
    const user = userEvent.setup();
    renderView();
    await enterTwoQuantities(user);

    fireEvent.change(dateField(), { target: { value: "" } });
    fireEvent.change(dateField(), { target: { value: OTHER_DISPLAY } });
    await user.click(screen.getByRole("button", { name: "Değiştir" }));

    await waitFor(() => expect(dateField()).toHaveValue(OTHER_DISPLAY));
    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[1]).toBe(OTHER_DATE);
  });

  it("Son Kayıtlar tıklaması aynı diyaloğu açar; Vazgeç → tarih eski", async () => {
    const user = userEvent.setup();
    mockEntries(entryDetail({ id: "d-old", entry_date: OTHER_DATE }));
    renderView();
    await enterTwoQuantities(user);
    const before = (dateField() as HTMLInputElement).value;

    await user.click(screen.getByRole("button", { name: /15 Temmuz/ }));

    const modal = within(dialog() as HTMLElement);
    expect(
      modal.getByText(
        "Tarih değişince iş kalemi listesi yenilenir; bu güne girdiğiniz 2 satırlık miktar, gerekçe ve işçi sayısı kaydedilmeden silinir.",
      ),
    ).toBeInTheDocument();
    await user.click(modal.getByRole("button", { name: "Vazgeç" }));
    expect(dateField()).toHaveValue(before);
    expect(screen.getAllByRole("textbox", { name: MISSING_QTY })).toHaveLength(2);
  });

  it("Son Kayıtlar: veri yokken sormaz, gün geçer", async () => {
    const user = userEvent.setup();
    mockEntries(entryDetail({ id: "d-old", entry_date: OTHER_DATE }));
    renderView();

    await user.click(screen.getByRole("button", { name: /15 Temmuz/ }));

    expect(dialog()).not.toBeInTheDocument();
    await waitFor(() => expect(dateField()).toHaveValue(formatDateDots(OTHER_DATE)));
  });
});

const ENTRY_LINE_OLD = { ...SK_LINE, id: "l-1", quantity: "120.000", line_amount: "182400.00" };

function mockDraftEntry() {
  const entry = entryDetail({ lines: [ENTRY_LINE_OLD] });
  mockEntries(entry);
  updateMutate.mockResolvedValue(entry);
  linesMutate.mockResolvedValue(entry);
  return entry;
}

function putLineKeys(): string[] {
  const body = linesMutate.mock.calls[0][0] as { lines: { boq_item_id: string; section_id: string | null }[] };
  return body.lines.map((line) => `${line.boq_item_id}|${line.section_id ?? ""}`).sort();
}

describe("GKS-F1.4 · Ü5 kayıtlı taslakta bölüm değişimi", () => {
  it("eksik kalem varsa sorar; bölüm formda hemen değişir", async () => {
    const user = userEvent.setup();
    mockDraftEntry();
    renderView();

    await pickSection(user, "sec-1");

    const modal = within(await screen.findByRole("dialog"));
    expect(modal.getByText("Kat 1–5 bölümünün 2 kalemi bu kayda eklensin mi?")).toBeInTheDocument();
    expect(modal.getByText("Mevcut satırlar korunur.")).toBeInTheDocument();
    expect(modal.getByRole("button", { name: "Ekle" })).toBeInTheDocument();
    expect(modal.getByRole("button", { name: "Yalnız bölümü değiştir" })).toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("sec-1");
    expect(fetchSiteDiarySkeleton).toHaveBeenCalledWith("s-1", TODAY, "sec-1");
  });

  it("Ekle → Taslak Kaydet PUT gövdesinde eklenen satırlar VAR, eski satır KALIR", async () => {
    const user = userEvent.setup();
    mockDraftEntry();
    renderView();
    await pickSection(user, "sec-1");

    await user.click(await screen.findByRole("button", { name: "Ekle" }));
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    expect(putLineKeys()).toEqual(["bi-1|", "bi-2|sec-1", "bi-3|sec-1"]);
  });

  it("'Yalnız bölümü değiştir' → PUT gövdesinde yeni satır YOK, eski satır kalır", async () => {
    const user = userEvent.setup();
    mockDraftEntry();
    renderView();
    await pickSection(user, "sec-1");

    await user.click(await screen.findByRole("button", { name: "Yalnız bölümü değiştir" }));
    expect(dialog()).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    expect(putLineKeys()).toEqual(["bi-1|"]);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ section_id: "sec-1" });
  });

  it("'Bölüm seçilmedi'ye geçişte SORULMAZ ve iskelet çekilmez", async () => {
    const user = userEvent.setup();
    const entry = entryDetail({ section_id: "sec-1", lines: [ENTRY_LINE_OLD] });
    mockEntries(entry);
    renderView();
    await waitFor(() => expect(sectionSelect()).toHaveValue("sec-1"));

    await pickSection(user, "");

    expect(dialog()).not.toBeInTheDocument();
    expect(fetchSiteDiarySkeleton).not.toHaveBeenCalled();
    expect(sectionSelect()).toHaveValue("");
  });

  it("eksik 0 ise soru yok", async () => {
    const user = userEvent.setup();
    mockDraftEntry();
    vi.mocked(fetchSiteDiarySkeleton).mockResolvedValue({ ...skeletonFor(TODAY, "sec-2"), lines: [SK_LINE] });
    renderView();

    await pickSection(user, "sec-2");

    await waitFor(() => expect(fetchSiteDiarySkeleton).toHaveBeenCalledTimes(1));
    expect(dialog()).not.toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("sec-2");
  });

  it("iskelet çekilemezse soru yok, bölüm değişmiş kalır, hata metni basılır", async () => {
    const user = userEvent.setup();
    mockDraftEntry();
    vi.mocked(fetchSiteDiarySkeleton).mockRejectedValue(new Error("boom"));
    renderView();

    await pickSection(user, "sec-1");

    expect(await screen.findByText("İş kalemleri yüklenemedi")).toBeInTheDocument();
    expect(dialog()).not.toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("sec-1");
  });

  it("yarış: yanıt gelince bölüm artık o değilse yanıt yok sayılır", async () => {
    const user = userEvent.setup();
    mockDraftEntry();
    let resolveFetch: (value: SiteDiarySkeleton) => void = () => undefined;
    vi.mocked(fetchSiteDiarySkeleton).mockImplementation(
      () => new Promise<SiteDiarySkeleton>((resolve) => (resolveFetch = resolve)),
    );
    renderView();

    await pickSection(user, "sec-1");
    await pickSection(user, "");
    resolveFetch(skeletonFor(TODAY, "sec-1"));

    await waitFor(() => expect(fetchSiteDiarySkeleton).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(dialog()).not.toBeInTheDocument();
    expect(sectionSelect()).toHaveValue("");
  });
});
