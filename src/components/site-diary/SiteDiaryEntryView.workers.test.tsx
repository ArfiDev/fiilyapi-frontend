import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  useUpdateCreatedSiteDiaryEntry,
  useUpdateSiteDiaryEntry,
} from "@/lib/api/hooks/useSiteDiaryMutations";
import { formatDateDots } from "@/lib/format";
import { useSiteDiarySkeleton, type SiteDiarySkeleton } from "@/lib/api/hooks/useSiteDiarySkeleton";
import { useSitePlanDaySummary } from "@/lib/api/hooks/useSitePlanDaySummary";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { diaryMe } from "./diary-session.testkit";

// GKS-F1.3 · kayıtsız günde önizleme (iskelet) ile çalışan "Kayıt Gir" ekranı:
// tek POST + satırlar, kilit sınıfları, existing_entry_id yarışı, boş/yükleniyor
// metinleri. Hook'lar mock'lu; saf türevler kendi dosyalarında test edilir.

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", () => ({ useSiteDiaryEntries: vi.fn(), useSiteDiaryEntry: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiarySkeleton", () => ({ useSiteDiarySkeleton: vi.fn() }));
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

function skeletonData(overrides: Partial<SiteDiarySkeleton> = {}): SiteDiarySkeleton {
  return {
    entry_date: TODAY,
    section_id: null,
    section_name: null,
    existing_entry_id: null,
    locked: false,
    lock_report_date: null,
    lines: [SK_LINE],
    lines_total: "0.00",
    ...overrides,
  } satisfies SiteDiarySkeleton;
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
const refetchSkeleton = vi.fn();
const patchCreatedMutate = vi.fn();

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

interface SkeletonMock {
  data?: SiteDiarySkeleton;
  isFetching?: boolean;
  isError?: boolean;
}

function mockSkeleton(state: SkeletonMock = { data: skeletonData() }) {
  vi.mocked(useSiteDiarySkeleton).mockReturnValue({
    data: state.data,
    isFetching: state.isFetching ?? false,
    isLoading: state.data === undefined && !state.isError,
    isError: state.isError ?? false,
    error: null,
    refetch: refetchSkeleton,
  } as never);
}

function mockSession(permissions: Record<string, string> = { site_diary: "full", progress_payments: "view" }) {
  vi.mocked(useSession).mockReturnValue({
    me: diaryMe(permissions),
    isLoading: false,
  });
}

const SECTIONS = [{ id: "sec-1", name: "Kat 1–5", code: "K15", sort_order: 1 }];

beforeEach(() => {
  vi.clearAllMocks();
  mockSession();
  mockEntries();
  mockSkeleton();
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
  vi.mocked(useSubcontractors).mockReturnValue({
    data: { items: [{ id: "sub-1", name: "Kaya Duvar", is_active: true }] },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSitePlanDaySummary).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useCreateSiteDiaryEntry).mockReturnValue(mockMutation(createMutate));
  vi.mocked(useUpdateSiteDiaryEntry).mockReturnValue(mockMutation(updateMutate));
  vi.mocked(useUpdateCreatedSiteDiaryEntry).mockReturnValue(mockMutation(patchCreatedMutate));
  vi.mocked(useSaveSiteDiaryLines).mockReturnValue(mockMutation(linesMutate));
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
});

const QTY_LABEL = "03.001 bugün yapılan miktar";
const FIRM_COUNT = "Taşeron · Kaya Duvar işçi sayısı";
const FIRM_HOURS = "Taşeron · Kaya Duvar kişi başı saat";
const PATCH_FAILED = "Günlük açıldı ama işçi dağılımı kaydedilemedi; tekrar “Taslak Kaydet” deyin.";
const OTHER_DATE = "2026-07-15";

const PATCHED_WORKERS = [
  { trade: "Kaya Duvar", source: "subcontractor", count: 4, subcontractor_id: "sub-1", subcontractor_name: "Kaya Duvar", hours: "8.00" },
] as unknown as SiteDiaryEntryDetail["worker_counts"];

/** Firma ekle + sayı (+ saat) yaz — kayıtsız günde. */
async function enterFirmWorkers(user: ReturnType<typeof userEvent.setup>, count = "4", hours = "8") {
  await user.selectOptions(screen.getByRole("combobox", { name: "Taşeron firma ekle" }), "sub-1");
  await user.type(screen.getByLabelText(FIRM_COUNT), count);
  await user.type(screen.getByLabelText(FIRM_HOURS), hours);
}

/**
 * POST sonrası ekranın göreceği kayıt: önbellek POST yanıtıdır (işçisiz). PATCH
 * BAŞARILI olunca önbellek PATCH yanıtına döner (gerçekte geçersiz kılma + yeniden
 * çekim). PATCH yanıtı AYNI `updated_at`i taşır: seed efektinin "sunucu daha yeni"
 * yeniden hizalaması devreye GİRMEZ — işçi değeri yalnız reseed'den gelir.
 */
function setupCreated(patched: SiteDiaryEntryDetail | Error) {
  const created = entryDetail({ id: "d-new", worker_counts: [] });
  const cache: Record<string, SiteDiaryEntryDetail> = { [created.id]: created };
  createMutate.mockResolvedValue(created);
  if (patched instanceof Error) patchCreatedMutate.mockRejectedValue(patched);
  else {
    patchCreatedMutate.mockImplementation(async () => {
      cache[created.id] = patched;
      return patched;
    });
  }
  mockEntries();
  vi.mocked(useSiteDiaryEntry).mockImplementation(
    ((id: string) => ({ data: cache[id], isLoading: false, isError: false, error: null })) as never,
  );
  return created;
}

describe("GKS-F1.5 · kayıtsız günde işçi dağılımı girilebilir", () => {
  it("firma eklenir, sayı ve saat yazılır; 'önce Taslak Kaydet' metni/başlığı YOK", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);

    await enterFirmWorkers(user);

    expect(screen.getByLabelText(FIRM_COUNT)).toHaveValue("4");
    expect(screen.getByLabelText(FIRM_COUNT)).toBeEnabled();
    expect(screen.getByLabelText(FIRM_COUNT)).not.toHaveAttribute("title");
    expect(screen.getByLabelText(FIRM_HOURS)).toHaveValue("8");
    expect(screen.getByRole("button", { name: "Kaya Duvar satırını kaldır" })).toBeInTheDocument();
    expect(screen.queryByText(/kayıt açıldıktan sonra girilebilir/)).not.toBeInTheDocument();
  });

  it("kilitli kayıtsız günde işçi alanları AYNEN pasif", () => {
    mockSkeleton({ data: skeletonData({ locked: true }) });
    render(<SiteDiaryEntryView />);

    expect(screen.queryByRole("combobox", { name: "Taşeron firma ekle" })).not.toBeInTheDocument();
  });
});

describe("GKS-F1.5 · ilk Taslak Kaydet zinciri (POST → işçi PATCH)", () => {
  it("işçi kirliyken POST SONRA PATCH; PATCH yeni kayda gider ve worker_counts taşır", async () => {
    const user = userEvent.setup();
    const patched = entryDetail({ id: "d-new", worker_counts: PATCHED_WORKERS });
    setupCreated(patched);
    render(<SiteDiaryEntryView />);

    await enterFirmWorkers(user);
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(patchCreatedMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.invocationCallOrder[0]).toBeLessThan(patchCreatedMutate.mock.invocationCallOrder[0]);
    const [variables] = patchCreatedMutate.mock.calls[0] as [{ entryId: string; body: { worker_counts?: unknown[] } }];
    expect(variables.entryId).toBe("d-new");
    expect(variables.body.worker_counts).toEqual([expect.objectContaining({ subcontractor_id: "sub-1", count: 4 })]);
    expect(createMutate.mock.calls[0][0]).not.toHaveProperty("worker_counts");
    expect(linesMutate).not.toHaveBeenCalled();
  });

  it("işçi kirli DEĞİLKEN PATCH ATILMAZ", async () => {
    const user = userEvent.setup();
    setupCreated(entryDetail({ id: "d-new" }));
    render(<SiteDiaryEntryView />);

    await user.type(screen.getByLabelText(QTY_LABEL), "12");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeEnabled());
    expect(patchCreatedMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("başarıda işçi değeri ekranda KALIR (form son sunucu yanıtından kurulur)", async () => {
    const user = userEvent.setup();
    setupCreated(entryDetail({ id: "d-new", worker_counts: PATCHED_WORKERS }));
    render(<SiteDiaryEntryView />);

    await enterFirmWorkers(user);
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(patchCreatedMutate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeEnabled());
    expect(screen.getByLabelText(FIRM_COUNT)).toHaveValue("4");
    // Form sunucunun normalleştirdiği son yanıttan kurulur ("8" → "8.00").
    expect(screen.getByLabelText(FIRM_HOURS)).toHaveValue("8.00");
    expect(screen.queryByText(PATCH_FAILED)).not.toBeInTheDocument();
  });

  it.each([
    ["500", new BackendError(500, { detail: "" }), PATCH_FAILED],
    ["422 detail'li", new BackendError(422, { detail: "Sayı geçersiz." }), `${PATCH_FAILED} Sayı geçersiz.`],
  ])("PATCH %s düşerse: uyarı görünür, kayıt AÇIK, işçi değeri formda KALIR", async (_label, failure, message) => {
    const user = userEvent.setup();
    setupCreated(failure);
    render(<SiteDiaryEntryView />);

    await enterFirmWorkers(user);
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText(FIRM_COUNT)).toHaveValue("4");
    expect(screen.getByLabelText(FIRM_HOURS)).toHaveValue("8");
    // Kayıt açık: "Kaydet & Gönder" artık kayıtlı günün kuralıyla açık, "Var olan kaydı aç" YOK.
    expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Var olan kaydı aç" })).not.toBeInTheDocument();
  });

  it("PATCH düştükten sonra İKİNCİ Taslak Kaydet kayıtlı akıştan gider (PATCH + PUT lines), POST tekrarlanmaz", async () => {
    const user = userEvent.setup();
    setupCreated(new BackendError(500, { detail: "" }));
    updateMutate.mockResolvedValue(entryDetail({ id: "d-new", worker_counts: PATCHED_WORKERS }));
    linesMutate.mockResolvedValue(entryDetail({ id: "d-new", worker_counts: PATCHED_WORKERS }));
    render(<SiteDiaryEntryView />);
    await enterFirmWorkers(user);
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    await screen.findByText(PATCH_FAILED);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0][0]).toMatchObject({
      worker_counts: [expect.objectContaining({ subcontractor_id: "sub-1", count: 4 })],
    });
    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(patchCreatedMutate).toHaveBeenCalledTimes(1);
  });
});

describe("GKS-F1.5 · kayıtsız günde kendi ekip (iskeletin own_crew_from_timesheet'i)", () => {
  it("puantajlı günde kendi ekip satırı basılır; boş hâl BASILMAZ", () => {
    mockSkeleton({
      data: skeletonData({ own_crew_from_timesheet: [{ trade: "Kalıpçı", source: "company", headcount: 3, hours: "27.0" }] }),
    });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("Kalıpçı")).toBeInTheDocument();
    expect(screen.queryByText(/Bu gün için puantaj girilmemiş/)).not.toBeInTheDocument();
  });

  it("alan yoksa (eski yanıt) ya da boşsa mevcut boş hâl", () => {
    render(<SiteDiaryEntryView />);

    expect(screen.getByText(/Bu gün için puantaj girilmemiş/)).toBeInTheDocument();
  });
});

describe("GKS-F1.5 · tarih diyaloğu işçiyi de sayar; bölüm diyaloğu işçiyi silmez", () => {
  const TITLE = "Girilen veriler silinecek";
  const dateField = () => screen.getByRole("textbox", { name: "Tarih" });

  it("yalnız işçi girilmişken tarih değişimi diyalog açar: yeni başlık/metin, n = işçi satırı", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);
    await enterFirmWorkers(user);

    fireEvent.change(dateField(), { target: { value: formatDateDots(OTHER_DATE) } });

    const modal = within(screen.getByRole("dialog"));
    expect(modal.getByText(TITLE)).toBeInTheDocument();
    expect(
      modal.getByText(
        "Tarih değişince iş kalemi listesi yenilenir; bu güne girdiğiniz 1 satırlık miktar, gerekçe ve işçi sayısı kaydedilmeden silinir.",
      ),
    ).toBeInTheDocument();
    expect(modal.getByRole("button", { name: "Vazgeç" })).toBeInTheDocument();
    expect(modal.getByRole("button", { name: "Değiştir" })).toBeInTheDocument();
    await user.click(modal.getByRole("button", { name: "Vazgeç" }));
    expect(screen.getByLabelText(FIRM_COUNT)).toHaveValue("4");
  });

  it("satır + işçi birlikte sayılır (2) ve Değiştir işçiyi de temizler", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);
    await user.type(screen.getByLabelText(QTY_LABEL), "5");
    await enterFirmWorkers(user);

    fireEvent.change(dateField(), { target: { value: formatDateDots(OTHER_DATE) } });

    expect(within(screen.getByRole("dialog")).getByText(/bu güne girdiğiniz 2 satırlık miktar, gerekçe ve işçi sayısı/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Değiştir" }));
    await waitFor(() => expect(dateField()).toHaveValue(formatDateDots(OTHER_DATE)));
    expect(screen.queryByLabelText(FIRM_COUNT)).not.toBeInTheDocument();
  });

  it("bölüm değişince: işçi girilmiş + miktar yok → diyalog YOK, işçi değeri durur", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);
    await enterFirmWorkers(user);

    await user.selectOptions(screen.getByRole("combobox", { name: "Bölüm" }), "sec-1");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText(FIRM_COUNT)).toHaveValue("4");
  });

  it("bölüm diyaloğu AYNEN (başlık, yalnız satır sayısı) ve Değiştir sonrası işçi değeri DURUR", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);
    await user.type(screen.getByLabelText(QTY_LABEL), "5");
    await enterFirmWorkers(user);

    await user.selectOptions(screen.getByRole("combobox", { name: "Bölüm" }), "sec-1");

    const modal = within(screen.getByRole("dialog"));
    expect(modal.getByText("Girilen miktarlar silinecek")).toBeInTheDocument();
    expect(
      modal.getByText("Bölüm değişince iş kalemi listesi yenilenir; bu güne girdiğiniz 1 satırlık miktar ve gerekçe kaydedilmeden silinir."),
    ).toBeInTheDocument();
    await user.click(modal.getByRole("button", { name: "Değiştir" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText(FIRM_COUNT)).toHaveValue("4");
    expect(screen.getByLabelText(FIRM_HOURS)).toHaveValue("8");
  });
});

describe("GKS-F1.5 · satır kartı 'Kaydedilmemiş değişiklik' notu kayıtsız günde", () => {
  const NOTE = /Kaydedilmemiş değişiklik var\. “Kümülatif” ve “Kalan”/;

  it("önizlemede miktar yazılınca görünür; yazılmadan önce yok", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(QTY_LABEL), "5");

    expect(await screen.findByText(NOTE)).toBeInTheDocument();
  });

  it("kayıtlı günde davranış AYNEN: temiz formda yok", () => {
    mockEntries(entryDetail());
    render(<SiteDiaryEntryView />);

    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
});
