import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

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
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";

// GKS-F1.4.1 · opus çürütmesinin bulduğu kusurların onarım testleri (ekran
// düzeyi). Hook'lar mock'lu; mock durumu `bump()` ile ekrana yeniden okutulur
// (sunucu gerçeğinin sonradan değişmesi = refetch / başka kullanıcı).

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
const QTY_LABEL = "03.001 bugün yapılan miktar";

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

/** Test başına değişebilen "sunucu" durumu; mock'lar HER render'da buradan okur. */
let existingEntryId: string | null = null;

function skeletonFor(entryDate: string, sectionId: string): SiteDiarySkeleton {
  return {
    entry_date: entryDate,
    section_id: sectionId === "" ? null : sectionId,
    section_name: null,
    existing_entry_id: existingEntryId,
    locked: false,
    lock_report_date: null,
    lines: sectionId === "sec-1" ? [LINE_A, LINE_B] : [SK_LINE],
    lines_total: "0.00",
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
const submitMutate = vi.fn();
const refetchEntries = vi.fn();
const refetchSkeleton = vi.fn();
const refetchEntry = vi.fn();

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
    ((id: string) => ({ data: all[id], isLoading: false, isError: false, error: null, refetch: refetchEntry })) as never,
  );
}

/** Yeni mock durumunu ekrana okutur (gerçekte: sorgu önbelleği değişince render). */
let bump: () => void = () => undefined;
function Harness() {
  const [, setTick] = useState(0);
  bump = () => setTick((tick) => tick + 1);
  return <SiteDiaryEntryView />;
}
function rerenderNow() {
  act(() => bump());
}

beforeEach(() => {
  vi.clearAllMocks();
  existingEntryId = null;
  vi.mocked(useSession).mockReturnValue({
    me: {
      id: "u-1",
      email: "m@o.com",
      full_name: "M",
      title: null,
      role_key: "site_chief",
      status: "active",
      permissions: { site_diary: "full", progress_payments: "view" },
    } as unknown as MeResponse,
    isLoading: false,
  });
  mockEntries();
  // Gerçek davranış: liste eşleşmesi varken önizleme sorgusu KAPALI (`enabled: false`).
  vi.mocked(useSiteDiarySkeleton).mockImplementation(((
    _siteId: string,
    entryDate: string,
    sectionId: string,
    options?: { enabled?: boolean },
  ) => ({
    data: options?.enabled === false ? undefined : skeletonFor(entryDate, sectionId),
    isFetching: false,
    isLoading: false,
    isError: false,
    error: null,
    refetch: refetchSkeleton,
  })) as never);
  vi.mocked(fetchSiteDiarySkeleton).mockImplementation(async (_siteId, entryDate, sectionId) =>
    skeletonFor(entryDate, sectionId),
  );
  vi.mocked(useSite).mockReturnValue({
    data: {
      id: "s-1",
      name: "A-Blok Şantiyesi",
      project: { id: "p-1", name: "Güneşkent" },
      sections: [
        { id: "sec-1", name: "Kat 1–5", code: "K15", sort_order: 1 },
        { id: "sec-2", name: "Kat 6–10", code: "K610", sort_order: 2 },
      ],
    },
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
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mockMutation(submitMutate));
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
});

const dateField = () => screen.getByRole("textbox", { name: "Tarih" });
const workDoneField = () => screen.getByRole("textbox", { name: /Yapılan İşler/ });
const dialog = () => screen.queryByRole("dialog");
const draftButton = () => screen.getByRole("button", { name: "Taslak Kaydet" });

const LOCK_409 = () =>
  new BackendError(409, { detail: "Bu gün raporla kilitlendi", locked_days: [TODAY], day_locks: [{ day: TODAY, report_date: TODAY }] });

describe("GKS-F1.4.1 · madde 1 · tarih çakışması yazılanları ezmez", () => {
  it("POST 409 date_conflict: yazılanlar durur, otomatik yeniden çekim YOK; 'Var olan kaydı aç' kaydı yükler", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(new BackendError(409, { detail: "Bu şantiyede bu güne ait günlük kayıt zaten var" }));
    render(<Harness />);
    await user.type(screen.getByLabelText(QTY_LABEL), "42");
    await user.type(workDoneField(), "benim notum");

    await user.click(draftButton());

    const openExisting = await screen.findByRole("button", { name: "Var olan kaydı aç" });
    expect(screen.getByLabelText(QTY_LABEL)).toHaveValue("42");
    expect(workDoneField()).toHaveValue("benim notum");
    expect(refetchEntries).not.toHaveBeenCalled();
    expect(refetchSkeleton).not.toHaveBeenCalled();

    // Düğme listeyi çeker; başkasının kaydı gelince ekran o kayda geçer.
    refetchEntries.mockImplementation(() => {
      mockEntries(entryDetail({ work_done: "Başkasının kaydı" }));
      rerenderNow();
    });
    await user.click(openExisting);
    await waitFor(() => expect(workDoneField()).toHaveValue("Başkasının kaydı"));
    expect(refetchEntries).toHaveBeenCalledTimes(1);
  });

  it("kilit 409'unda önizleme yeniden çekimi KALIR (liste çekilmez)", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(LOCK_409());
    render(<Harness />);

    await user.click(draftButton());

    await waitFor(() => expect(refetchSkeleton).toHaveBeenCalled());
    expect(refetchEntries).not.toHaveBeenCalled();
  });

  it("422'de önizleme yeniden çekimi KALIR", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(new BackendError(422, { detail: "Satır bölümü bu kalemde tahsisli değil" }));
    render(<Harness />);

    await user.click(draftButton());

    await waitFor(() => expect(refetchSkeleton).toHaveBeenCalled());
  });
});

describe("GKS-F1.4.1 · madde 2 · Ü3 diyaloğu açıkken bağlam değişirse", () => {
  it("existing_entry_id ile kayıt yüklenince diyalog KAPANIR; kayıtlı miktar korunur (PUT'ta 0 yok)", async () => {
    const user = userEvent.setup();
    const other = entryDetail({ id: "d-9" });
    updateMutate.mockResolvedValue(other);
    linesMutate.mockResolvedValue(other);
    render(<Harness />);
    await user.type(screen.getByLabelText(QTY_LABEL), "5");
    await user.selectOptions(screen.getByRole("combobox", { name: "Bölüm" }), "sec-2");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Başkası o günü açtı: önizleme existing_entry_id getirir, ekran S3'e geçer.
    existingEntryId = "d-9";
    mockEntries(undefined, { "d-9": other });
    rerenderNow();

    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
    await waitFor(() => expect(workDoneField()).toHaveValue("Kayıtlı iş"));
    await user.click(draftButton());
    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    const body = linesMutate.mock.calls[0][0] as { lines: { quantity: number }[] };
    expect(body.lines.map((line) => line.quantity)).toEqual([120]);
  });
});

describe("GKS-F1.4.1 · madde 3 · geçersiz / uyuşmayan tarihte kaydet pasif", () => {
  it("S1: tarih boşken Taslak Kaydet pasif, POST atılmaz", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    fireEvent.change(dateField(), { target: { value: "" } });

    expect(draftButton()).toBeDisabled();
    await user.click(draftButton());
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("S1: yarım tarihte de pasif; geçerli tarih yazılınca (gün değişir) tekrar açılır", () => {
    render(<Harness />);

    fireEvent.change(dateField(), { target: { value: "15.07.20" } });
    expect(draftButton()).toBeDisabled();

    fireEvent.change(dateField(), { target: { value: formatDateDots("2026-07-15") } });
    expect(draftButton()).toBeEnabled();
  });

  it("S3: tarih boşken Taslak Kaydet ve Kaydet & Gönder pasif, PATCH atılmaz", async () => {
    const user = userEvent.setup();
    mockEntries(entryDetail());
    render(<Harness />);
    await waitFor(() => expect(workDoneField()).toHaveValue("Kayıtlı iş"));

    fireEvent.change(dateField(), { target: { value: "" } });

    expect(draftButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
    await user.click(draftButton());
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("S3: geçerli yeni tarih (kaydın taşınması) Taslak Kaydet'i AÇIK bırakır", async () => {
    mockEntries(entryDetail());
    render(<Harness />);
    await waitFor(() => expect(workDoneField()).toHaveValue("Kayıtlı iş"));

    fireEvent.change(dateField(), { target: { value: formatDateDots("2026-07-15") } });

    expect(draftButton()).toBeEnabled();
  });
});

describe("GKS-F1.4.1 · madde 4 · Ü5 yarış koruması gönderim/kilidi görür", () => {
  it("iskelet yanıtı gelmeden kayıt gönderilirse diyalog AÇILMAZ", async () => {
    const user = userEvent.setup();
    const draft = entryDetail();
    mockEntries(draft);
    let resolveFetch: (value: SiteDiarySkeleton) => void = () => undefined;
    vi.mocked(fetchSiteDiarySkeleton).mockImplementation(
      () => new Promise<SiteDiarySkeleton>((resolve) => (resolveFetch = resolve)),
    );
    render(<Harness />);
    await waitFor(() => expect(workDoneField()).toHaveValue("Kayıtlı iş"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Bölüm" }), "sec-1");
    await waitFor(() => expect(fetchSiteDiarySkeleton).toHaveBeenCalledTimes(1));

    mockEntries(entryDetail({ status: "submitted", submitted_at: "2026-07-15T10:00:00Z", updated_at: "2026-07-15T10:00:00Z" }));
    rerenderNow();
    await act(async () => resolveFetch(skeletonFor(TODAY, "sec-1")));

    expect(dialog()).not.toBeInTheDocument();
  });

  it("yanıt gelmeden gün kilitlenirse diyalog AÇILMAZ", async () => {
    const user = userEvent.setup();
    mockEntries(entryDetail());
    let resolveFetch: (value: SiteDiarySkeleton) => void = () => undefined;
    vi.mocked(fetchSiteDiarySkeleton).mockImplementation(
      () => new Promise<SiteDiarySkeleton>((resolve) => (resolveFetch = resolve)),
    );
    render(<Harness />);
    await waitFor(() => expect(workDoneField()).toHaveValue("Kayıtlı iş"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Bölüm" }), "sec-1");
    await waitFor(() => expect(fetchSiteDiarySkeleton).toHaveBeenCalledTimes(1));

    mockEntries(entryDetail({ locked: true, lock_report_date: "2026-09-25", updated_at: "2026-07-15T10:00:00Z" }));
    rerenderNow();
    await act(async () => resolveFetch(skeletonFor(TODAY, "sec-1")));

    expect(dialog()).not.toBeInTheDocument();
  });
});

describe("GKS-F1.4.1 · madde 5 · S3'te kilit 409'u detayı yeniden çeker", () => {
  it("Taslak Kaydet → 409 locked_days → detay refetch; locked gelince salt okunur + bant", async () => {
    const user = userEvent.setup();
    mockEntries(entryDetail());
    updateMutate.mockRejectedValue(LOCK_409());
    render(<Harness />);
    await waitFor(() => expect(workDoneField()).toHaveValue("Kayıtlı iş"));
    refetchEntry.mockImplementation(() => {
      mockEntries(entryDetail({ locked: true, lock_report_date: "2026-09-25" }));
      rerenderNow();
    });

    await user.click(draftButton());

    await waitFor(() => expect(refetchEntry).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Bu gün 25.09.2026 raporuyla kilitlendi. Bütün alanlar salt okunur.")).toBeInTheDocument();
    expect(draftButton()).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Var olan kaydı aç" })).not.toBeInTheDocument();
  });
});

describe("GKS-F1.4.1 · madde 6 · 'Var olan kaydı aç' yalnız kayıt AÇMA hatasında", () => {
  it("S3 PATCH 409 (kilit değil): detail basılır, 'Var olan kaydı aç' YOK", async () => {
    const user = userEvent.setup();
    mockEntries(entryDetail());
    updateMutate.mockRejectedValue(new BackendError(409, { detail: "Gönderilmiş kayıt düzenlenemez" }));
    render(<Harness />);
    await waitFor(() => expect(workDoneField()).toHaveValue("Kayıtlı iş"));

    await user.click(draftButton());

    expect(await screen.findByText("Gönderilmiş kayıt düzenlenemez")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Var olan kaydı aç" })).not.toBeInTheDocument();
    expect(refetchEntry).not.toHaveBeenCalled();
  });

  it("S1 POST 409: 'Var olan kaydı aç' VAR", async () => {
    const user = userEvent.setup();
    createMutate.mockRejectedValue(new BackendError(409, { detail: "Bu güne ait günlük kayıt zaten var" }));
    render(<Harness />);

    await user.click(draftButton());

    expect(await screen.findByRole("button", { name: "Var olan kaydı aç" })).toBeInTheDocument();
  });
});

describe("GKS-F1.4.1 · madde 7 · detay yüklenemezse hata hâli", () => {
  it("matchedId var + detay hatası → 'İş kalemleri yüklenemedi' + 'Tekrar dene' detayı yeniden çeker", async () => {
    const user = userEvent.setup();
    mockEntries(entryDetail());
    vi.mocked(useSiteDiaryEntry).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("boom"),
      refetch: refetchEntry,
    } as never);
    render(<Harness />);

    expect(screen.getByText("İş kalemleri yüklenemedi")).toBeInTheDocument();
    expect(screen.queryByText("İş kalemleri yükleniyor…")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tekrar dene" }));

    expect(refetchEntry).toHaveBeenCalledTimes(1);
    expect(refetchSkeleton).not.toHaveBeenCalled();
  });
});
