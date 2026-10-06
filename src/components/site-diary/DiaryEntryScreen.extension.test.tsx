import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

import { SiteDiaryEntryView } from "./SiteDiaryEntryView";
import { isoDate } from "./derive";
import type { DiaryCoreActions, DiaryExtension } from "./diary-extension";
import {
  useSiteDiaryEntries,
  useSiteDiaryEntry,
  type SiteDiaryEntryDetail,
  type SiteDiaryEntryListResponse,
  type SiteDiaryLineRead,
} from "@/lib/api/hooks/useSiteDiary";
import {
  useCreateSiteDiaryEntry,
  useReopenSiteDiaryEntry,
  useSaveSiteDiaryLines,
  useSubmitSiteDiaryEntry,
  useUpdateSiteDiaryEntry,
} from "@/lib/api/hooks/useSiteDiaryMutations";
import { useSitePlanDaySummary } from "@/lib/api/hooks/useSitePlanDaySummary";
import { useSite } from "@/lib/api/hooks/useSites";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { fetchBoqItemAllocations } from "@/lib/api/hooks/useBoqAllocations";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { diaryMe } from "./diary-session.testkit";

// PLN-F2.2 · çekirdek günlük ekranının UZANTI YUVALARI (§2.7) ve genişlemesi
// (G1–G10, K16). Planlama kodu import EDİLMEZ — uzantı burada elle kurulur.

// PLN-F3.0 · `?tarih=` — bu dosya uzantı yuvalarını test eder, URL yazımı
// AYRI dalda (`SiteDiaryEntryView.test.tsx`) doğrulanır.
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", () => ({ useSiteDiaryEntries: vi.fn(), useSiteDiaryEntry: vi.fn() }));
// GKS-F1.3 · kayıtsız gün önizlemesi: istenen gün/bölüm için boş, güncel iskelet.
vi.mock("@/lib/api/hooks/useSiteDiarySkeleton", async () => ({
  useSiteDiarySkeleton: (await import("@/components/site-diary/diary-skeleton.testkit")).echoSkeletonQuery,
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
vi.mock("@/lib/api/hooks/useBoqAllocations", () => ({ fetchBoqItemAllocations: vi.fn() }));
vi.mock("@/lib/api/hooks/useProgressPayments", () => ({ useProgressPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({ useSiteSubcontractorPayments: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));

const TODAY = isoDate(new Date());

function mockSession(permissions: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({
    me: diaryMe(permissions),
    isLoading: false,
  });
}

function line(overrides: Partial<SiteDiaryLineRead> = {}): SiteDiaryLineRead {
  return {
    id: "l-u",
    boq_item_id: "duv",
    section_id: null,
    code: "DUV.01.01",
    description: "Tuğla duvar",
    unit: "m²",
    unit_price: "420.00",
    quantity: "20.000",
    cumulative_quantity: "220.000",
    leaf_cumulative_quantity: "20.000",
    planned_quantity: "500.000",
    remaining_quantity: "480.000",
    overrun_reason: null,
    line_amount: "8400.00",
    // DET-1.B: bölümsüz satırda bölüm adı `null`.
    section_name: null,
    ...overrides,
  } satisfies SiteDiaryLineRead;
}

const LINES = [
  line(),
  line({
    id: "l-s",
    section_id: "k610",
    section_name: "Kat 6–10",
    quantity: "52.000",
    leaf_cumulative_quantity: "200.000",
    planned_quantity: "4400.000",
    remaining_quantity: "4200.000",
    line_amount: "21840.00",
  }),
];

function entryDetail(overrides: Partial<SiteDiaryEntryDetail> = {}): SiteDiaryEntryDetail {
  return {
    id: "d-1",
    site_id: "s-uuid",
    project_id: "p-1",
    entry_date: TODAY,
    section_id: null,
    weather: "sunny",
    temp_min_c: "17.0",
    temp_max_c: "28.0",
    wind_ms: "4.2",
    work_done: null,
    chief_note: null,
    safety_meeting_held: false,
    ppe_checked: false,
    has_incident: false,
    incident_note: null,
    status: "draft",
    submitted_at: null,
    created_by: "u-2",
    created_at: "2026-09-24T08:00:00Z",
    updated_at: "2026-09-24T09:00:00Z",
    lines: LINES,
    worker_counts: [
      {
        id: "w-f",
        trade: "Kaya Duvar",
        source: "subcontractor",
        count: 7,
        subcontractor_id: "firm-1",
        hours: "8.0",
        subcontractor_name: "Kaya Duvar",
      },
    ],
    // PLN-F2.1b · G12a — kendi ekip backend'de puantajdan türetilir (salt okunur).
    own_crew_from_timesheet: [{ trade: "Kalıpçı", source: "company", headcount: 1, hours: "9.0" }],
    lines_total: "30240.00",
    worker_total: 7,
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
    ...overrides,
  } satisfies SiteDiaryEntryDetail;
}

const createMutate = vi.fn();
const updateMutate = vi.fn();
const linesMutate = vi.fn();
const submitMutate = vi.fn();

function mockMutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, mutate: vi.fn(), isPending: false } as never;
}

function mockEntry(entry: SiteDiaryEntryDetail | undefined) {
  vi.mocked(useSiteDiaryEntries).mockReturnValue({
    data: {
      items: entry
        ? [
            {
              id: entry.id,
              site_id: "s-uuid",
              project_id: "p-1",
              entry_date: entry.entry_date,
              section_id: null,
              // DET-1.B: başlıksız kayıt → ad `null`; dönem listesi süzgeçsiz → sayım `null`.
              section_name: null,
              section_line_count: null,
              weather: "sunny",
              has_incident: false,
              status: entry.status,
              worker_total: 7,
              lines_total: "30240.00",
              created_by: "u-2",
              created_at: "2026-09-24T08:00:00Z",
            },
          ]
        : [],
      total: entry ? 1 : 0,
      limit: 50,
      offset: 0,
    } satisfies SiteDiaryEntryListResponse,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
  vi.mocked(useSiteDiaryEntry).mockReturnValue({ data: entry, isLoading: false, isError: false, error: null } as never);
}

const idle = { isLoading: false, isError: false, error: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockSession({ site_diary: "full", progress_payments: "view" });
  mockEntry(entryDetail());
  vi.mocked(useSite).mockReturnValue({
    data: {
      id: "s-uuid",
      name: "A-Blok Şantiyesi",
      project: { id: "p-1", name: "Güneşkent" },
      sections: [
        { id: "k610", name: "Kat 6–10", code: "K610", sort_order: 3 },
        { id: "k15", name: "Kat 1–5", code: "K15", sort_order: 2 },
        { id: "tml", name: "Temel & Bodrum", code: "TML", sort_order: 1 },
      ],
    },
    ...idle,
  } as never);
  vi.mocked(useBoq).mockReturnValue({ data: undefined, ...idle } as never);
  vi.mocked(useProgressPayments).mockReturnValue({ data: { items: [], total: 0 }, ...idle } as never);
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isPartial: false,
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
  } as never);
  vi.mocked(useSitePlanDaySummary).mockReturnValue({ data: undefined, ...idle } as never);
  vi.mocked(useSubcontractors).mockReturnValue({
    data: {
      items: [
        { id: "firm-1", name: "Kaya Duvar", is_active: true },
        { id: "firm-2", name: "Deniz Tesisat", is_active: true },
      ],
    },
    ...idle,
  } as never);
  vi.mocked(fetchBoqItemAllocations).mockResolvedValue({
    item: {} as never,
    allocations: [
      { section_id: "k610", section_name: "Kat 6–10", quantity: "4400" },
      { section_id: "k15", section_name: "Kat 1–5", quantity: "4600" },
    ],
  });
  vi.mocked(useCreateSiteDiaryEntry).mockReturnValue(mockMutation(createMutate));
  vi.mocked(useUpdateSiteDiaryEntry).mockReturnValue(mockMutation(updateMutate));
  vi.mocked(useSaveSiteDiaryLines).mockReturnValue(mockMutation(linesMutate));
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mockMutation(submitMutate));
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mockMutation(vi.fn()));
});

function renderScreen(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("DiaryEntryScreen · uzantı yuvaları (§2.7)", () => {
  it("uzantı YOKKEN ekran bugünkü gibidir: yuva içeriği yok, K16 Hakediş kolonu + tfoot var", () => {
    const { container } = renderScreen(<SiteDiaryEntryView />);

    expect(screen.getByRole("columnheader", { name: "Hakediş ₺" })).toBeInTheDocument();
    expect(screen.getByText("Bugünkü Hakediş Katkısı")).toBeInTheDocument();
    expect(container.querySelector(".diary__full-width")).toBeNull();
    expect(container.querySelector(".diary__lock-banner")).toBeNull();
    expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeEnabled();
  });

  it("onExtensionContext: kanonik şantiye + gün + kayıt + satırlar; yazınca GÜNCEL miktarla yeniden, ilgisiz değişiklikte TEKRAR ÇAĞRILMAZ", async () => {
    const user = userEvent.setup();
    const onContext = vi.fn();
    renderScreen(<SiteDiaryEntryView onExtensionContext={onContext} />);

    await waitFor(() => expect(onContext).toHaveBeenCalled());
    expect(onContext).toHaveBeenLastCalledWith({
      siteId: "s-uuid",
      day: TODAY,
      entryId: "d-1",
      entryStatus: "draft",
      lines: [
        { key: "duv|", boqItemId: "duv", sectionId: null, quantityToday: "20.000" },
        { key: "duv|k610", boqItemId: "duv", sectionId: "k610", quantityToday: "52.000" },
      ],
    });
    const callsBefore = onContext.mock.calls.length;

    await user.click(screen.getByLabelText("Sabah İSG toplantısı", { exact: false }));
    expect(onContext.mock.calls.length).toBe(callsBefore);

    const field = screen.getByLabelText("DUV.01.01 · Kat 6–10 bugün yapılan miktar");
    await user.clear(field);
    await user.type(field, "60");
    expect(onContext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([{ key: "duv|k610", boqItemId: "duv", sectionId: "k610", quantityToday: "60" }]),
      }),
    );
  });

  it("lock: kilitliyse BÜTÜN alanlar salt okunur, bant durum satırında, + Bölüm / × gizli, Bugün düz metin", () => {
    const extension: DiaryExtension = {
      lock: { isLocked: true, banner: <span>Bu gün 25.09.2026 raporuyla kilitlendi.</span> },
    };
    const { container } = renderScreen(<SiteDiaryEntryView extension={extension} />);

    const statusRow = container.querySelector(".diary__status-row") as HTMLElement;
    expect(within(statusRow).getByText("Bu gün 25.09.2026 raporuyla kilitlendi.")).toBeInTheDocument();
    expect(screen.getByLabelText("Tarih")).toBeDisabled();
    expect(screen.getByLabelText("Min °C")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Güneşli" })).toBeDisabled();
    expect(screen.queryByLabelText("DUV.01.01 bugün yapılan miktar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "DUV.01.01 için bölüm ekle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /satırını kaldır/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Taşeron · Kaya Duvar işçi sayısı")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeDisabled();
  });

  it("lock: gönderilmiş ve KİLİTLİ günde 'Yeniden Aç' basılmaz (backend geçişi 409 verir; İ:143-149 düğme yok)", () => {
    mockSession({ site_diary: "admin", progress_payments: "view" });
    mockEntry(
      entryDetail({ status: "submitted", submitted_at: "2026-09-24T17:00:00Z", submitted_by: "u-1", submitted_by_name: "Mühendis" }),
    );
    const locked: DiaryExtension = { lock: { isLocked: true, banner: <span>kilitli</span> } };
    const { unmount } = renderScreen(<SiteDiaryEntryView extension={locked} />);
    expect(screen.queryByRole("button", { name: "Yeniden Aç" })).not.toBeInTheDocument();
    unmount();

    // Kontrol: kilitsiz gönderilmiş günde yetkili yeniden açabilir.
    renderScreen(<SiteDiaryEntryView extension={{ lock: { isLocked: false, banner: null } }} />);
    expect(screen.getByRole("button", { name: "Yeniden Aç" })).toBeInTheDocument();
  });

  it("submitGate: canSubmit=false → Gönder pasif ve gerekçeler EKRANDA (title değil)", () => {
    const extension: DiaryExtension = {
      submitGate: { canSubmit: false, reasons: ["1 aşım satırında gerekçe yok", "12 a-s dağıtılmamış"] },
    };
    renderScreen(<SiteDiaryEntryView extension={extension} />);

    const submit = screen.getByRole("button", { name: "Kaydet & Gönder" });
    expect(submit).toBeDisabled();
    expect(submit).not.toHaveAttribute("title");
    expect(screen.getByText("1 aşım satırında gerekçe yok")).toBeVisible();
    expect(screen.getByText("12 a-s dağıtılmamış")).toBeVisible();
  });

  it("lineColumns: ek başlıklar, her satırın hücresi ve footer; Hakediş ₺ YİNE var (K16)", () => {
    const extension: DiaryExtension = {
      lineColumns: {
        headers: [
          { key: "earned", label: "Bugün kaz. a-s" },
          { key: "pf", label: "PF" },
        ],
        renderCells: (ref) => [`kaz-${ref.key}`, `pf-${ref.quantityToday ?? "yok"}`],
        footer: <span>Bugün toplam kazanılmış</span>,
      },
    };
    renderScreen(<SiteDiaryEntryView extension={extension} />);

    expect(screen.getByRole("columnheader", { name: "Bugün kaz. a-s" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "PF" })).toBeInTheDocument();
    expect(screen.getByText("kaz-duv|k610")).toBeInTheDocument();
    expect(screen.getByText("pf-52.000")).toBeInTheDocument();
    expect(screen.getByText("Bugün toplam kazanılmış")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Hakediş ₺" })).toBeInTheDocument();
    expect(screen.getByText("Bugünkü Hakediş Katkısı")).toBeInTheDocument();
  });

  it("fullWidthBlock ızgaranın ALTINDA, headerSuffix başlık alt satırının SONUNDA (tarihten sonra)", () => {
    const extension: DiaryExtension = {
      headerSuffix: "Gün 142 · H21",
      fullWidthBlock: <section aria-label="Saat Dağıtımı">dağıtım</section>,
    };
    const { container } = renderScreen(<SiteDiaryEntryView extension={extension} />);

    expect(container.querySelector(".diary__subtitle")?.textContent).toMatch(
      /Güneşkent · \d{2}\.\d{2}\.\d{4} \p{L}+ · Gün 142 · H21$/u,
    );
    const block = container.querySelector(".diary__full-width") as HTMLElement;
    expect(within(block).getByRole("region", { name: "Saat Dağıtımı" })).toBeInTheDocument();
    expect(container.querySelector(".diary__grid")?.nextElementSibling).toBe(block);
  });
});

describe("DiaryEntryScreen · submit 422 reasons[]", () => {
  it("backend ön koşul reddi gerekçeleri LİSTE olarak basılır", async () => {
    const user = userEvent.setup();
    const detail = entryDetail();
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    submitMutate.mockRejectedValue(
      new BackendError(422, { detail: "Günlük gönderilemez", reasons: ["Dağıtılmamış saat var", "Hava eksik"] }),
    );
    renderScreen(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Kaydet & Gönder" }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("Dağıtılmamış saat var")).toBeInTheDocument();
    expect(within(alert).getByText("Hava eksik")).toBeInTheDocument();
  });
});

describe("DiaryEntryScreen · miktar ağacı (G1–G6)", () => {
  it("G1/G2: kalem başlığı + Bölümsüz + bölüm satırı; başlık toplamı", () => {
    const { container } = renderScreen(<SiteDiaryEntryView />);

    const header = container.querySelector(".diary-lines__item-row") as HTMLElement;
    expect(within(header).getByText("Tuğla duvar")).toBeInTheDocument();
    expect(header.querySelector(".diary-lines__amount")?.textContent).toBe("30.240");
    const leaves = container.querySelectorAll(".diary-lines__leaf-row");
    expect([...leaves].map((row) => row.querySelector(".diary-lines__leaf-name")?.textContent)).toEqual([
      "Bölümsüztahsis dışı kalan",
      "Kat 6–10",
    ]);
  });

  it("G3: Bölümsüz satırın × düğmesi pasif", () => {
    renderScreen(<SiteDiaryEntryView />);

    expect(screen.getByRole("button", { name: "DUV.01.01 · Bölümsüz satırını kaldır" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "DUV.01.01 · Kat 6–10 satırını kaldır" })).toBeEnabled();
  });

  it("M1: '+ Bölüm' seçicisi tahsisliyi üstte, tahsissizi 'planlı 0' altta basar; eklenen satır TAM küme gövdesinde `added`", async () => {
    const user = userEvent.setup();
    const detail = entryDetail();
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    renderScreen(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "DUV.01.01 için bölüm ekle" }));
    const picker = await screen.findByRole("dialog", { name: "Tuğla duvar için bölüm ekle" });
    await within(picker).findByText("BOQ tahsisi olan");
    expect(within(picker).getByText("Tahsis yok · planlı 0")).toBeInTheDocument();
    expect(within(picker).getByLabelText("Kat 6–10")).toBeDisabled();
    await user.click(within(picker).getByLabelText("Kat 1–5"));
    await user.click(within(picker).getByRole("button", { name: "Tamam" }));

    expect(screen.getByText("YENİ")).toBeInTheDocument();
    await user.type(screen.getByLabelText("DUV.01.01 · Kat 1–5 bugün yapılan miktar"), "5");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    expect(linesMutate.mock.calls[0][0]).toEqual({
      lines: [
        { boq_item_id: "duv", section_id: null, quantity: 20, overrun_reason: null },
        { boq_item_id: "duv", section_id: "k610", quantity: 52, overrun_reason: null },
        { boq_item_id: "duv", section_id: "k15", quantity: 5, overrun_reason: null },
      ],
    });
  });

  it("M2/G6: miktarlı satır ONAY modalıyla kalkar (saat KORUNUR metni); gövde kalan TAM kümedir", async () => {
    const user = userEvent.setup();
    const detail = entryDetail();
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    renderScreen(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "DUV.01.01 · Kat 6–10 satırını kaldır" }));
    const modal = await screen.findByRole("dialog", { name: "Kat 6–10 satırı kaldırılsın mı?" });
    expect(within(modal).getByText(/saatler KORUNUR/)).toBeInTheDocument();
    await user.click(within(modal).getByRole("button", { name: "Satırı kaldır" }));
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    expect(linesMutate.mock.calls[0][0]).toEqual({
      lines: [{ boq_item_id: "duv", section_id: null, quantity: 20, overrun_reason: null }],
    });
  });

  it("M4: aşımda alt satır + gerekçe; gerekçe `overrun_reason` olarak gider", async () => {
    const user = userEvent.setup();
    const detail = entryDetail();
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    renderScreen(<SiteDiaryEntryView />);

    const field = screen.getByLabelText("DUV.01.01 bugün yapılan miktar");
    await user.clear(field);
    await user.type(field, "600");
    expect(screen.getByText(/Planlı miktar aşıldı/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("DUV.01.01 · Bölümsüz aşım gerekçesi"), "Proje revizyonu");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    expect(linesMutate.mock.calls[0][0].lines[0]).toEqual({
      boq_item_id: "duv",
      section_id: null,
      quantity: 600,
      overrun_reason: "Proje revizyonu",
    });
  });
});

describe("DiaryEntryScreen · hava + işçi genişlemesi", () => {
  it("on ikonlu seçici; rüzgâr km/sa", async () => {
    const user = userEvent.setup();
    renderScreen(<SiteDiaryEntryView />);

    expect(screen.getAllByRole("radio")).toHaveLength(10);
    expect(screen.getByRole("radio", { name: "Güneşli" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Sisli" }));
    expect(screen.getByRole("radio", { name: "Sisli" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("~ 15 km/sa")).toBeInTheDocument();
  });

  it("kendi ekip own_crew_from_timesheet'ten SALT OKUNUR; firma satırı kişi × saat girer ve gövdeye gider", async () => {
    const user = userEvent.setup();
    const detail = entryDetail();
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    renderScreen(<SiteDiaryEntryView />);

    expect(screen.queryByLabelText("Şirket · Kalıpçılar kişi başı saat")).not.toBeInTheDocument();
    const ownRow = screen.getByText("Kalıpçı").closest(".diary-workers__grid-row") as HTMLElement;
    expect(within(ownRow).queryByRole("textbox")).toBeNull();
    const hours = screen.getByLabelText("Taşeron · Kaya Duvar kişi başı saat");
    await user.clear(hours);
    await user.type(hours, "9");
    await user.selectOptions(screen.getByLabelText("Taşeron firma ekle"), "firm-2");
    await user.type(screen.getByLabelText("Taşeron · Deniz Tesisat işçi sayısı"), "4");
    await user.type(screen.getByLabelText("Taşeron · Deniz Tesisat kişi başı saat"), "8");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0][0].worker_counts).toEqual([
      { trade: "Kaya Duvar", source: "subcontractor", count: 7, subcontractor_id: "firm-1", hours: 9 },
      { trade: "Deniz Tesisat", source: "subcontractor", count: 4, subcontractor_id: "firm-2", hours: 8 },
    ]);
  });
});

describe("DiaryEntryScreen · F2.2.1 sözleşme genişlemesi (renderItemCells · caption · itemMeta)", () => {
  const columns = {
    headers: [{ key: "earned", label: "Bugün kaz. a-s" }],
    renderCells: () => ["satır"],
  };

  it("renderItemCells: kalem BAŞLIK satırında ek hücreler basılır", () => {
    const extension: DiaryExtension = {
      lineColumns: { ...columns, renderItemCells: (itemId) => [`kalem-${itemId}`] },
    };
    const { container } = renderScreen(<SiteDiaryEntryView extension={extension} />);

    const header = container.querySelector(".diary-lines__item-row") as HTMLElement;
    expect(within(header).getByText("kalem-duv")).toBeInTheDocument();
  });

  it("renderItemCells verilmezse başlık satırında BOŞ hücre (kolon hizası korunur)", () => {
    const { container } = renderScreen(<SiteDiaryEntryView extension={{ lineColumns: columns }} />);

    const header = container.querySelector(".diary-lines__item-row") as HTMLElement;
    const ext = header.querySelectorAll(".diary-lines__ext");
    expect(ext).toHaveLength(1);
    expect(ext[0].textContent).toBe("");
  });

  function linesSubtitle(container: HTMLElement) {
    return container.querySelector("#diary-lines-title")?.parentElement?.querySelector(".diary-card__subtitle");
  }

  it("caption (karar 3): verilirse alt başlığın TAMAMIdır — çekirdek metni BASILMAZ (İ:213)", () => {
    const caption = "İş tipi × bölüm · kazanılmış = bugün miktar × birim oran (Rev 1)";
    const extension: DiaryExtension = { lineColumns: { ...columns, caption } };
    const { container } = renderScreen(<SiteDiaryEntryView extension={extension} />);

    expect(linesSubtitle(container)?.textContent).toBe(caption);
    expect(screen.queryByText(/girişler otomatik olarak aylık hakedişe işlenir/)).not.toBeInTheDocument();
  });

  it("caption YOKSA çekirdek alt başlığı aynen kalır (uzantılı ve uzantısız)", () => {
    const { container, unmount } = renderScreen(<SiteDiaryEntryView extension={{ lineColumns: columns }} />);
    expect(linesSubtitle(container)?.textContent).toBe(
      "Kalem × bölüm · girişler otomatik olarak aylık hakedişe işlenir",
    );
    unmount();

    const bare = renderScreen(<SiteDiaryEntryView />);
    expect(linesSubtitle(bare.container)?.textContent).toBe(
      "Kalem × bölüm · girişler otomatik olarak aylık hakedişe işlenir",
    );
  });

  it("G9: dolaylı kalemde '+ Bölüm' YOK ve Bölümsüz satır 'Tüm şantiye' etiketli", () => {
    const extension: DiaryExtension = { itemMeta: { indirectItemIds: new Set(["duv"]) } };
    const { container } = renderScreen(<SiteDiaryEntryView extension={extension} />);

    expect(screen.queryByRole("button", { name: "DUV.01.01 için bölüm ekle" })).not.toBeInTheDocument();
    const firstLeaf = container.querySelector(".diary-lines__leaf-row .diary-lines__leaf-name");
    expect(firstLeaf?.textContent).toBe("Tüm şantiye");
    // Erişilebilir ad sabit kalır (e2e seçicisi).
    expect(screen.getByLabelText("DUV.01.01 bugün yapılan miktar")).toBeInTheDocument();
  });

  it("dolaylı OLMAYAN kalemde '+ Bölüm' durur", () => {
    const extension: DiaryExtension = { itemMeta: { indirectItemIds: new Set(["baska"]) } };
    renderScreen(<SiteDiaryEntryView extension={extension} />);

    expect(screen.getByRole("button", { name: "DUV.01.01 için bölüm ekle" })).toBeInTheDocument();
  });

  it("renderItemTag kalem kod satırına eklenir (İ:225 '· Taşeron')", () => {
    const extension: DiaryExtension = { itemMeta: { renderItemTag: (itemId) => (itemId === "duv" ? "Taşeron" : null) } };
    const { container } = renderScreen(<SiteDiaryEntryView extension={extension} />);

    const meta = container.querySelector(".diary-lines__item-row .diary-lines__item-meta");
    expect(meta?.textContent).toBe("DUV.01.01 · Taşeron · ₺420/m²");
  });
});

describe("DiaryEntryScreen · G5 düzeltmesi (tahsissiz bölüm seçilemez)", () => {
  it("'Tahsis yok · planlı 0' grubu PASİF; altında İş Kalemleri'ne tahsis bağlantısı", async () => {
    const user = userEvent.setup();
    renderScreen(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "DUV.01.01 için bölüm ekle" }));
    const picker = await screen.findByRole("dialog", { name: "Tuğla duvar için bölüm ekle" });
    await within(picker).findByText("BOQ tahsisi olan");

    expect(within(picker).getByLabelText("Temel & Bodrum")).toBeDisabled();
    expect(within(picker).getByLabelText("Kat 1–5")).toBeEnabled();
    expect(within(picker).getByRole("link", { name: "Önce İş Kalemleri'nde bölüme tahsis et →" })).toHaveAttribute(
      "href",
      "/projeler/p-1/santiyeler/s-1/is-kalemleri",
    );
  });
});

describe("DiaryEntryScreen · F2.3.1 (onBeforeSave · renderSubRow · topBanner · showReasonsInCore)", () => {
  it("S1: onBeforeSave REDDEDİLİRSE çekirdek hiçbir istek atmaz; hata mevcut hata yolunda görünür", async () => {
    const user = userEvent.setup();
    const onBeforeSave = vi.fn().mockRejectedValue(new BackendError(409, { detail: "Gün kilitli, dağıtım yazılamadı" }));
    renderScreen(<SiteDiaryEntryView extension={{ onBeforeSave }} />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    expect(await screen.findByText("Gün kilitli, dağıtım yazılamadı")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet & Gönder" }));

    await waitFor(() => expect(onBeforeSave).toHaveBeenCalledTimes(2));
    expect(updateMutate).not.toHaveBeenCalled();
    expect(linesMutate).not.toHaveBeenCalled();
    expect(submitMutate).not.toHaveBeenCalled();
  });

  it("S1: onBeforeSave çözülürse SIRAYLA — önce uzantı, sonra çekirdek kaydı ve gönderim", async () => {
    const user = userEvent.setup();
    const detail = entryDetail();
    const onBeforeSave = vi.fn().mockResolvedValue(undefined);
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    submitMutate.mockResolvedValue(detail);
    renderScreen(<SiteDiaryEntryView extension={{ onBeforeSave }} />);

    await user.click(screen.getByRole("button", { name: "Kaydet & Gönder" }));

    await waitFor(() => expect(submitMutate).toHaveBeenCalledTimes(1));
    expect(onBeforeSave.mock.invocationCallOrder[0]).toBeLessThan(updateMutate.mock.invocationCallOrder[0]);
    expect(linesMutate.mock.invocationCallOrder[0]).toBeLessThan(submitMutate.mock.invocationCallOrder[0]);
  });

  it("S1: kayıt YOKKEN de (POST) önce onBeforeSave; reddedilirse POST atılmaz", async () => {
    const user = userEvent.setup();
    mockEntry(undefined);
    const onBeforeSave = vi.fn().mockRejectedValue(new Error("dağıtım kaydedilemedi"));
    renderScreen(<SiteDiaryEntryView extension={{ onBeforeSave }} />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(onBeforeSave).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("S2: renderSubRow satırın HEMEN altında; aşım alt satırından SONRA; null → alt satır yok", async () => {
    const user = userEvent.setup();
    const extension: DiaryExtension = {
      lineColumns: {
        headers: [],
        renderCells: () => [],
        renderSubRow: (ref) => (ref.sectionId === null ? <span>uzantı-alt-{ref.key}</span> : null),
      },
    };
    const { container } = renderScreen(<SiteDiaryEntryView extension={extension} />);

    const sub = screen.getByText("uzantı-alt-duv|");
    const subRow = sub.closest("tr") as HTMLElement;
    expect(subRow.previousElementSibling?.classList.contains("diary-lines__leaf-row")).toBe(true);
    expect(within(subRow).getByText("uzantı-alt-duv|").closest("td")).toHaveAttribute("colspan", "8");
    expect(container.querySelectorAll(".diary-lines__ext-subrow")).toHaveLength(1);

    const field = screen.getByLabelText("DUV.01.01 bugün yapılan miktar");
    await user.clear(field);
    await user.type(field, "600");
    const overRow = screen.getByText(/Planlı miktar aşıldı/).closest("tr") as HTMLElement;
    expect(overRow.nextElementSibling).toBe(screen.getByText("uzantı-alt-duv|").closest("tr"));
  });

  it("S3: topBanner başlığın altında, kart ızgarasından ÖNCE", () => {
    const { container } = renderScreen(
      <SiteDiaryEntryView extension={{ topBanner: <div>Formen görünümü.</div> }} />,
    );

    const banner = screen.getByText("Formen görünümü.");
    const grid = container.querySelector(".diary__grid") as HTMLElement;
    const head = container.querySelector(".diary__head") as HTMLElement;
    expect(head.compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(banner.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("S4: showReasonsInCore=false → çekirdek gerekçe listesi BASILMAZ, Gönder yine pasif", () => {
    const extension: DiaryExtension = {
      submitGate: { canSubmit: false, reasons: ["12 a-s dağıtılmamış"], showReasonsInCore: false },
    };
    renderScreen(<SiteDiaryEntryView extension={extension} />);

    expect(screen.queryByText("12 a-s dağıtılmamış")).not.toBeInTheDocument();
    expect(screen.queryByText("Gönderim engelli")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
  });
});

describe("DiaryEntryScreen · PLN-F2.5e çekirdek kararları", () => {
  describe("karar 1 · başlık alt satırı şantiye · proje · seçili gün", () => {
    beforeEach(() => {
      // Yalnız `Date` sahte — react-query/userEvent zamanlayıcıları gerçek kalır.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 8, 24, 10, 0));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("uzantısız (EV'siz) ekranda da tarih + Türkçe gün adı basılır", () => {
      const { container } = renderScreen(<SiteDiaryEntryView />);

      expect(container.querySelector(".diary__subtitle")?.textContent).toBe(
        "A-Blok Şantiyesi · Güneşkent · 24.09.2026 Perşembe",
      );
    });

    it("İ:113 birebir: headerSuffix tarihten SONRA gelir", () => {
      const { container } = renderScreen(<SiteDiaryEntryView extension={{ headerSuffix: "Gün 142 · H21" }} />);

      expect(container.querySelector(".diary__subtitle")?.textContent).toBe(
        "A-Blok Şantiyesi · Güneşkent · 24.09.2026 Perşembe · Gün 142 · H21",
      );
    });

    it("yıl sınırında seçili gün (31.12 → Perşembe)", () => {
      vi.setSystemTime(new Date(2026, 11, 31, 23, 30));
      const { container } = renderScreen(<SiteDiaryEntryView />);

      expect(container.querySelector(".diary__subtitle")?.textContent).toBe(
        "A-Blok Şantiyesi · Güneşkent · 31.12.2026 Perşembe",
      );
    });
  });

  describe("karar 5 · banner'sız kilit", () => {
    it("lock.banner YOKSA durum satırında bant kabı basılmaz; alanlar YİNE salt okunur", () => {
      const { container } = renderScreen(<SiteDiaryEntryView extension={{ lock: { isLocked: true } }} />);

      const statusRow = container.querySelector(".diary__status-row") as HTMLElement;
      expect(statusRow.querySelector(".diary__lock-banner")).toBeNull();
      expect(container.querySelector(".diary__lock-banner")).toBeNull();
      expect(screen.getByLabelText("Tarih")).toBeDisabled();
      expect(screen.getByRole("radio", { name: "Güneşli" })).toBeDisabled();
      expect(screen.queryByLabelText("DUV.01.01 bugün yapılan miktar")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Taşeron · Kaya Duvar işçi sayısı")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeDisabled();
    });
  });

  describe("karar 6 · fullWidthBlock fonksiyonu çekirdek eylemlerini alır", () => {
    function blockExtension(extra: Partial<DiaryExtension> = {}) {
      const render = vi.fn((actions: DiaryCoreActions) => (
        <section aria-label="Saat Dağıtımı">
          <button type="button" disabled={!actions.canSubmit} onClick={actions.submit}>
            Blok Gönder
          </button>
          <span data-testid="block-saving">{actions.isSaving ? "kaydediliyor" : "boşta"}</span>
        </section>
      ));
      const extension: DiaryExtension = { fullWidthBlock: render, ...extra };
      return { extension, render };
    }

    it("blok düğmesi başlıktaki 'Kaydet & Gönder' ile AYNI zinciri çalıştırır (onBeforeSave → kayıt → gönder)", async () => {
      const user = userEvent.setup();
      const detail = entryDetail();
      const onBeforeSave = vi.fn().mockResolvedValue(undefined);
      updateMutate.mockResolvedValue(detail);
      linesMutate.mockResolvedValue(detail);
      submitMutate.mockResolvedValue(detail);
      const { extension } = blockExtension({ onBeforeSave });
      renderScreen(<SiteDiaryEntryView extension={extension} />);

      await user.click(screen.getByRole("button", { name: "Blok Gönder" }));

      await waitFor(() => expect(submitMutate).toHaveBeenCalledTimes(1));
      expect(onBeforeSave).toHaveBeenCalledTimes(1);
      expect(updateMutate).toHaveBeenCalledTimes(1);
      expect(linesMutate).toHaveBeenCalledTimes(1);
      expect(onBeforeSave.mock.invocationCallOrder[0]).toBeLessThan(updateMutate.mock.invocationCallOrder[0]);
      expect(updateMutate.mock.invocationCallOrder[0]).toBeLessThan(linesMutate.mock.invocationCallOrder[0]);
      expect(linesMutate.mock.invocationCallOrder[0]).toBeLessThan(submitMutate.mock.invocationCallOrder[0]);
    });

    it("kayıt sürerken isSaving=true ve iki düğme birlikte pasif", async () => {
      const user = userEvent.setup();
      let release: () => void = () => {};
      const onBeforeSave = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
      const { extension } = blockExtension({ onBeforeSave });
      renderScreen(<SiteDiaryEntryView extension={extension} />);

      await user.click(screen.getByRole("button", { name: "Blok Gönder" }));

      expect(await screen.findByText("kaydediliyor")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Blok Gönder" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
      release();
    });

    const branches: { name: string; arrange: () => Partial<DiaryExtension>; canSubmit: boolean }[] = [
      { name: "açık gün", arrange: () => ({}), canSubmit: true },
      { name: "kilitli", arrange: () => ({ lock: { isLocked: true } }), canSubmit: false },
      {
        name: "kapı kapalı",
        arrange: () => ({ submitGate: { canSubmit: false, reasons: ["12 a-s dağıtılmamış"] } }),
        canSubmit: false,
      },
      {
        name: "kayıt yok",
        arrange: () => {
          mockEntry(undefined);
          return {};
        },
        canSubmit: false,
      },
    ];

    it.each(branches)("$name: canSubmit başlık düğmesinin disabled'ıyla tutarlı", ({ arrange, canSubmit }) => {
      const { extension, render } = blockExtension(arrange());
      renderScreen(<SiteDiaryEntryView extension={extension} />);

      const lastActions = render.mock.calls.at(-1)?.[0] as DiaryCoreActions;
      expect(lastActions.canSubmit).toBe(canSubmit);
      expect(lastActions.isSaving).toBe(false);
      const header = screen.getByRole("button", { name: "Kaydet & Gönder" });
      expect((header as HTMLButtonElement).disabled).toBe(!canSubmit);
      expect(screen.getByRole("button", { name: "Blok Gönder" })).toHaveProperty("disabled", !canSubmit);
    });

    it("yazma izni yoksa canSubmit=false; blokta submit çağrılsa bile istek atılmaz", async () => {
      mockSession({ site_diary: "view", progress_payments: "view" });
      const { extension, render } = blockExtension();
      renderScreen(<SiteDiaryEntryView extension={extension} />);

      const lastActions = render.mock.calls.at(-1)?.[0] as DiaryCoreActions;
      expect(lastActions.canSubmit).toBe(false);
      expect(screen.queryByRole("button", { name: "Kaydet & Gönder" })).not.toBeInTheDocument();
      lastActions.submit();
      await Promise.resolve();
      expect(updateMutate).not.toHaveBeenCalled();
      expect(submitMutate).not.toHaveBeenCalled();
    });

    it("ReactNode verilirse bugünkü gibi basılır", () => {
      const { container } = renderScreen(
        <SiteDiaryEntryView extension={{ fullWidthBlock: <p>düz blok</p> }} />,
      );
      const block = container.querySelector(".diary__full-width") as HTMLElement;
      expect(within(block).getByText("düz blok")).toBeInTheDocument();
    });
  });
});
