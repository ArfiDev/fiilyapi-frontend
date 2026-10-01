import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteDiaryEntryView } from "./SiteDiaryEntryView";
import { isoDate } from "./derive";
import type { DiaryExtension } from "./diary-extension";
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
import { useSiteDiarySkeleton, type SiteDiarySkeleton } from "@/lib/api/hooks/useSiteDiarySkeleton";
import { useSitePlanDaySummary } from "@/lib/api/hooks/useSitePlanDaySummary";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";

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
    me: { id: "u-1", email: "m@o.com", full_name: "M", title: null, role_key: "site_chief", status: "active", permissions } as unknown as MeResponse,
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
  vi.mocked(useSubcontractors).mockReturnValue({ data: { items: [] }, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useSitePlanDaySummary).mockReturnValue({ data: undefined, isLoading: false, isError: false, error: null } as never);
  vi.mocked(useCreateSiteDiaryEntry).mockReturnValue(mockMutation(createMutate));
  vi.mocked(useUpdateSiteDiaryEntry).mockReturnValue(mockMutation(updateMutate));
  vi.mocked(useSaveSiteDiaryLines).mockReturnValue(mockMutation(linesMutate));
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
});

const QTY_LABEL = "03.001 bugün yapılan miktar";

describe("GKS-F1.3 · kayıtsız günde önizleme satırları", () => {
  it("iskelet satırları görünür ve miktar girilir", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);

    const field = screen.getByLabelText(QTY_LABEL);
    await user.type(field, "12");

    expect(field).toHaveValue("12");
    expect(screen.queryByText(/Önce “Taslak Kaydet” deyin/)).not.toBeInTheDocument();
  });

  it("önizleme sorgusu YALNIZ liste eşleşmesi yokken açıktır", () => {
    mockEntries(entryDetail());
    render(<SiteDiaryEntryView />);

    expect(vi.mocked(useSiteDiarySkeleton).mock.calls.at(-1)?.[3]).toEqual({ enabled: false });
  });

  it("önizleme iskelet satırının × düğmesi pasiftir ve gerekçesini taşır", () => {
    render(<SiteDiaryEntryView />);

    const remove = screen.getByRole("button", { name: "03.001 · Bölümsüz satırını kaldır" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute("title", "İskelet satırıdır, kaydedilmeden kaldırılamaz");
  });

  it("önizlemede yazılan miktar Son Kayıtlar'da kaydedilmemiş uyarısı çıkarır", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);
    expect(screen.queryByText(/Kaydedilmemiş değişiklikleriniz var/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(QTY_LABEL), "5");

    expect(await screen.findByText(/Kaydedilmemiş değişiklikleriniz var/)).toBeInTheDocument();
  });

  it("Ü12 · kayıtsız günde 'Kaydet & Gönder' pasif, title 'Önce taslak kaydedin'", () => {
    render(<SiteDiaryEntryView />);

    const submit = screen.getByRole("button", { name: "Kaydet & Gönder" });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("title", "Önce taslak kaydedin");
  });
});

describe("GKS-F1.3 · Taslak Kaydet (kayıt yok) = TEK POST + satırlar", () => {
  it("gövdede dokunulan satır gider; PATCH ve PUT lines ÇAĞRILMAZ", async () => {
    const user = userEvent.setup();
    createMutate.mockResolvedValue(entryDetail());
    render(<SiteDiaryEntryView />);

    await user.type(screen.getByLabelText(QTY_LABEL), "12");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      entry_date: TODAY,
      lines: [{ boq_item_id: "bi-1", section_id: null, quantity: 12, overrun_reason: null }],
    });
    expect(updateMutate).not.toHaveBeenCalled();
    expect(linesMutate).not.toHaveBeenCalled();
  });

  it("başarıdan sonra kayıtlı akışa geçer (form kaydedilen kayıttan kurulur)", async () => {
    const user = userEvent.setup();
    const created = entryDetail({ work_done: "Sunucudan gelen" });
    createMutate.mockResolvedValue(created);
    // Liste henüz tazelenmedi: kayıt `adoptCreatedEntry` ile kimlikten yüklenir.
    mockEntries(undefined, { [created.id]: created });
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: /Yapılan İşler/ })).toHaveValue("Sunucudan gelen"));
  });

  it("EV onBeforeSave POST'tan ÖNCE çağrılır (çağrı sırası)", async () => {
    const user = userEvent.setup();
    const onBeforeSave = vi.fn().mockResolvedValue(undefined);
    const extension: DiaryExtension = { onBeforeSave };
    createMutate.mockResolvedValue(entryDetail());
    render(<SiteDiaryEntryView extension={extension} />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(onBeforeSave).toHaveBeenCalledTimes(1);
    expect(onBeforeSave.mock.invocationCallOrder[0]).toBeLessThan(createMutate.mock.invocationCallOrder[0]);
  });

  it("onBeforeSave reddederse POST atılmaz", async () => {
    const user = userEvent.setup();
    const extension: DiaryExtension = { onBeforeSave: vi.fn().mockRejectedValue(new Error("x")) };
    render(<SiteDiaryEntryView extension={extension} />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByText("Ek bölüm kaydedilemedi; günlük kaydedilmedi.")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("önizleme bayatken (yeniden çekiliyor) Taslak Kaydet pasif", () => {
    mockSkeleton({ data: skeletonData(), isFetching: true });
    render(<SiteDiaryEntryView />);

    expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeDisabled();
  });

  it("önizleme başka güne/bölüme aitse Taslak Kaydet pasif", () => {
    mockSkeleton({ data: skeletonData({ entry_date: "2001-01-01" }) });
    render(<SiteDiaryEntryView />);

    expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeDisabled();
  });
});

describe("GKS-F1.3 · kaydetme hataları", () => {
  it("kilit 409'u detail'i basar, 'Var olan kaydı aç' BASMAZ, önizlemeyi yeniler", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(
      new BackendError(409, { detail: "Bu gün raporla kilitlendi", locked_days: [TODAY], day_locks: [{ day: TODAY, report_date: TODAY }] }),
    );
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByText("Bu gün raporla kilitlendi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Var olan kaydı aç" })).not.toBeInTheDocument();
    expect(refetchSkeleton).toHaveBeenCalled();
  });

  it("tarih çakışması 409'u 'Var olan kaydı aç' basar; OTOMATİK yenileme YOK (GKS-F1.4.1)", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(new BackendError(409, { detail: "Bu şantiyede bu güne ait günlük kayıt zaten var" }));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByRole("button", { name: "Var olan kaydı aç" })).toBeInTheDocument();
    expect(refetchSkeleton).not.toHaveBeenCalled();
    expect(refetchEntries).not.toHaveBeenCalled();
  });

  it("422 detail'i basar ve önizlemeyi yeniler", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(new BackendError(422, { detail: "Satır bölümü bu kalemde tahsisli değil" }));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByText("Satır bölümü bu kalemde tahsisli değil")).toBeInTheDocument();
    expect(refetchSkeleton).toHaveBeenCalled();
  });

  it("diğer hata mevcut fallback metnini basar", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(new BackendError(500, undefined));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByText("Günlük kayıt kaydedilemedi.")).toBeInTheDocument();
  });
});

describe("GKS-F1.3 · existing_entry_id (yarış)", () => {
  it("önizleme existing_entry_id döndürürse o kayıt yüklenir ve liste tazelenir", async () => {
    mockSkeleton({ data: skeletonData({ existing_entry_id: "d-9" }) });
    mockEntries(undefined, { "d-9": entryDetail({ id: "d-9", work_done: "Başkasının kaydı" }) });
    render(<SiteDiaryEntryView />);

    await waitFor(() => expect(screen.getByRole("textbox", { name: /Yapılan İşler/ })).toHaveValue("Başkasının kaydı"));
    expect(vi.mocked(useSiteDiaryEntry)).toHaveBeenCalledWith("d-9");
    expect(refetchEntries).toHaveBeenCalled();
  });

  it("Ü6 · form kirliyken kayıt yüklenirse bilgi bandı basılır", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SiteDiaryEntryView />);
    await user.type(screen.getByRole("textbox", { name: /Yapılan İşler/ }), "yazdım");

    mockSkeleton({ data: skeletonData({ existing_entry_id: "d-9" }) });
    mockEntries(undefined, { "d-9": entryDetail({ id: "d-9" }) });
    rerender(<SiteDiaryEntryView />);

    expect(
      await screen.findByText("Bu güne ait kayıt başka bir kullanıcı tarafından açıldı; kayıt yüklendi."),
    ).toBeInTheDocument();
  });

  it("Ü6 · form kirli değilse bant YOK", async () => {
    mockSkeleton({ data: skeletonData({ existing_entry_id: "d-9" }) });
    mockEntries(undefined, { "d-9": entryDetail({ id: "d-9" }) });
    render(<SiteDiaryEntryView />);

    await waitFor(() => expect(screen.getByRole("textbox", { name: /Yapılan İşler/ })).toHaveValue("Kayıtlı iş"));
    expect(screen.queryByText(/başka bir kullanıcı tarafından açıldı/)).not.toBeInTheDocument();
  });
});

describe("GKS-F1.3 · kilit (Ü7 + Ü8)", () => {
  it("skeleton.locked → alanlar salt okunur + bant metni (rapor tarihli)", () => {
    mockSkeleton({ data: skeletonData({ locked: true, lock_report_date: "2026-09-25" }) });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("Bu gün 25.09.2026 raporuyla kilitlendi. Bütün alanlar salt okunur.")).toBeInTheDocument();
    expect(screen.getByLabelText("Min °C")).toBeDisabled();
    expect(screen.queryByLabelText(QTY_LABEL)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeDisabled();
  });

  it("rapor tarihi yoksa tek fallback metni", () => {
    mockSkeleton({ data: skeletonData({ locked: true, lock_report_date: null }) });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("Bu gün rapor onayıyla kilitlendi. Bütün alanlar salt okunur.")).toBeInTheDocument();
  });

  it("kayıtlı günde entry.locked → EV uzantısı yokken de salt okunur + bant", () => {
    mockEntries(entryDetail({ locked: true, lock_report_date: "2026-09-25" }));
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("Bu gün 25.09.2026 raporuyla kilitlendi. Bütün alanlar salt okunur.")).toBeInTheDocument();
    expect(screen.getByLabelText("Min °C")).toBeDisabled();
  });

  it("uzantı kilidi varken çekirdek bandı BASILMAZ (çift bant yok)", () => {
    mockSkeleton({ data: skeletonData({ locked: true, lock_report_date: "2026-09-25" }) });
    const extension: DiaryExtension = { lock: { isLocked: true } };
    render(<SiteDiaryEntryView extension={extension} />);

    expect(screen.queryByText(/Bütün alanlar salt okunur/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Min °C")).toBeDisabled();
  });

  it("kilitsiz günde bant YOK", () => {
    render(<SiteDiaryEntryView />);

    expect(screen.queryByText(/Bütün alanlar salt okunur/)).not.toBeInTheDocument();
  });
});

describe("GKS-F1.3 · boş / yükleniyor / hata metinleri", () => {
  it("Ü11 · önizleme yükleniyor", () => {
    mockSkeleton({ data: undefined });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("İş kalemleri yükleniyor…")).toBeInTheDocument();
  });

  it("Ü11 · önizleme hatası + 'Tekrar dene' yeniden çeker", async () => {
    const user = userEvent.setup();
    mockSkeleton({ data: undefined, isError: true });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("İş kalemleri yüklenemedi")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetchSkeleton).toHaveBeenCalledTimes(1);
  });

  it("şantiyede BOQ kalemi yok (bölüm seçili değil, lines=[]) → mevcut metin önizlemede de", () => {
    mockSkeleton({ data: skeletonData({ lines: [] }) });
    render(<SiteDiaryEntryView />);

    expect(
      screen.getByText("Bu şantiyede sözleşme BOQ pozu tanımlı değil — iş kalemi satırı üretilemedi."),
    ).toBeInTheDocument();
  });

  it("Ü1 · bölüm seçili ve lines=[] → tahsis metni + İş Kalemleri bağlantısı", async () => {
    const user = userEvent.setup();
    render(<SiteDiaryEntryView />);
    mockSkeleton({ data: skeletonData({ section_id: "sec-1", lines: [] }) });

    await user.selectOptions(screen.getByLabelText("Bölüm"), "sec-1");

    expect(await screen.findByText("Bu bölüme tahsis edilmiş iş kalemi yok.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "İş Kalemleri'nde tahsis et →" });
    expect(link).toHaveAttribute("href", expect.stringContaining("/santiyeler/s-1/"));
  });

  it("eski 'Önce Taslak Kaydet deyin' metni hiçbir durumda basılmaz", () => {
    mockSkeleton({ data: skeletonData({ lines: [] }) });
    render(<SiteDiaryEntryView />);

    expect(screen.queryByText(/Önce “Taslak Kaydet” deyin/)).not.toBeInTheDocument();
    const card = screen.getByRole("heading", { name: /Yapılan Miktarlar/ }).closest("section") as HTMLElement;
    expect(within(card).queryByText(/kayıt açıldığında/)).not.toBeInTheDocument();
  });
});
