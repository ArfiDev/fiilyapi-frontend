import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { isoWeekOf } from "@/components/timesheet/iso-week";
import { formatDateDots } from "@/lib/format";

import { SiteDiaryEntryView } from "./SiteDiaryEntryView";
import { isoDate } from "./derive";
import {
  useSiteDiaryEntries,
  useSiteDiaryEntry,
  type SiteDiaryEntryDetail,
  type SiteDiaryEntryListItem,
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
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { routes } from "@/lib/routes";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";
import { diaryMe } from "./diary-session.testkit";

// F-SD T6 · "Kayıt Gir" ekranının DAL testleri: 409 akışı, izin dalları,
// `submitted` salt-okunurluğu ve "Yeniden Aç". Saf türevler kendi
// dosyalarında test edilir (form-state / worker-counts / recent-entries) —
// burada YALNIZ ekranın kararları doğrulanır.

// PLN-F3.0 · `?tarih=` — `router.replace` PAYLAŞILAN bir casus (`routerReplace`):
// her `useRouter()` çağrısı AYNI fonksiyonu döner, yani ekran içindeki yazma
// çağrıları burada TEK bir mock geçmişinde toplanır. `useSearchParams`in
// döndürdüğü nesne de PAYLAŞILAN ve `routerReplace` tarafından İÇTEN
// GÜNCELLENEN tek bir `URLSearchParams`tir (PLN-F3.0-ek 3. tur) — gerçek
// Next.js'te `router.replace` sonraki render'da `useSearchParams()`ı
// GÜNCEL döner; sabit/boş bir mock bu geri-besleme döngüsünü KAÇIRIRDI ve
// "başka güne geçip geri dönme" testi yanlış (iyimser) bir ortamda geçerdi.
const routerReplace = vi.fn((url: string) => {
  const query = url.split("?")[1] ?? "";
  for (const key of [...sharedSearchParams.keys()]) sharedSearchParams.delete(key);
  for (const [key, value] of new URLSearchParams(query)) sharedSearchParams.set(key, value);
});
const sharedSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p-1", siteId: "s-1" }),
  usePathname: () => "/projeler/p-1/santiyeler/s-1/gunluk-kayit",
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => sharedSearchParams,
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteDiary", () => ({
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
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({
  useSiteSubcontractorPayments: vi.fn(),
}));
// PLN-F2.2 — işçi kartının taşeron firma okuması. (PLN-F2.1b: kendi ekip saati
// artık kayıt yanıtının `own_crew_from_timesheet`inden gelir — puantaj haftası
// bu ekrandan OKUNMAZ.)
vi.mock("@/lib/api/hooks/useSubcontractors", () => ({ useSubcontractors: vi.fn() }));

function mockSession(permissions?: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({ me: diaryMe(permissions), isLoading: false });
}

/**
 * Ekranın aradığı gün. Varsayılan tarih BUGÜNdür (`isoDate(new Date())`) —
 * bu KAYAN bir hedeftir, sabit bir gün yazılırsa test yarın kırılır. Sahte
 * zamanlayıcı (`vi.useFakeTimers`) da KULLANILMAZ: `userEvent` ile birlikte
 * kilitleniyor (ölçüldü — etkileşimli testler 15 sn zaman aşımına düşüyor).
 * Bunun yerine fikstür, üretim koduyla AYNI türevden beslenir.
 */
const TODAY = isoDate(new Date());

const LINE = {
  id: "l-1",
  boq_item_id: "bi-1",
  code: "03.001",
  description: "C25/30 Beton",
  unit: "m³",
  unit_price: "1520.00",
  quantity: "120.000",
  cumulative_quantity: "900.000",
  line_amount: "182400.00",
  section_name: null,
} satisfies SiteDiaryLineRead;

function entryDetail(overrides: Partial<SiteDiaryEntryDetail> = {}): SiteDiaryEntryDetail {
  return {
    id: "d-1",
    site_id: "s-1",
    project_id: "p-1",
    entry_date: TODAY,
    section_id: null,
    weather: "sunny",
    temp_max_c: "28.0",
    work_done: "6. kat döşeme betonu döküldü.",
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
    lines: [LINE],
    worker_counts: [],
    lines_total: "182400.00",
    worker_total: 0,
    dropped_orphan_count: 0,
    // DET-1.B salt-okunur detay alanları — başlıksız taslak: gönderen yok, kilit yok.
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

function listItem(overrides: Partial<SiteDiaryEntryListItem> = {}): SiteDiaryEntryListItem {
  return {
    id: "d-1",
    site_id: "s-1",
    project_id: "p-1",
    entry_date: TODAY,
    section_id: null,
    // DET-1.B: başlıksız kayıt → ad `null`; dönem listesi süzgeçsiz → sayım `null`.
    section_name: null,
    section_line_count: null,
    weather: "sunny",
    has_incident: false,
    status: "draft",
    worker_total: 0,
    lines_total: "182400.00",
    created_by: "u-2",
    created_at: "2026-07-15T08:00:00Z",
    ...overrides,
  } satisfies SiteDiaryEntryListItem;
}

const createMutate = vi.fn();
const updateMutate = vi.fn();
const linesMutate = vi.fn();
const submitMutate = vi.fn();
const reopenMutate = vi.fn();
const refetchEntries = vi.fn();

function mockMutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, mutate: vi.fn(), isPending: false } as never;
}

/**
 * Ekran gün eşlemesini `entries` listesinden yapar; `entry` verilirse liste de
 * o günü içerecek şekilde kurulur (gerçek akışın aynısı).
 */
function mockScreen(options: { entry?: SiteDiaryEntryDetail; entriesError?: unknown } = {}) {
  const entry = options.entry;
  vi.mocked(useSiteDiaryEntries).mockReturnValue({
    data: {
      items: entry ? [listItem({ id: entry.id, entry_date: entry.entry_date, status: entry.status })] : [],
      total: entry ? 1 : 0,
      limit: 50,
      offset: 0,
    } satisfies SiteDiaryEntryListResponse,
    isLoading: false,
    isError: options.entriesError !== undefined,
    error: options.entriesError ?? null,
    refetch: refetchEntries,
  } as never);
  vi.mocked(useSiteDiaryEntry).mockReturnValue({
    data: entry,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  // PLN-F3.0-ek (3. tur) · `sharedSearchParams` testler arası PAYLAŞILIR
  // (gerçekçi geri-besleme için) — her testin `?tarih=`SİZ AÇILMASI gerekir,
  // yoksa önceki testin `router.replace` çağrısı sonrakine SIZAR.
  for (const key of [...sharedSearchParams.keys()]) sharedSearchParams.delete(key);
  mockSession({ site_diary: "full", progress_payments: "view" });
  mockScreen();
  vi.mocked(useSite).mockReturnValue({
    data: { id: "s-1", name: "A-Blok Şantiyesi", project: { id: "p-1", name: "Güneşkent" }, sections: [] },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useBoq).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useProgressPayments).mockReturnValue({
    data: { items: [], total: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isPartial: false,
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
  } as never);
  vi.mocked(useSubcontractors).mockReturnValue({
    data: { items: [] },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSitePlanDaySummary).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useCreateSiteDiaryEntry).mockReturnValue(mockMutation(createMutate));
  vi.mocked(useUpdateSiteDiaryEntry).mockReturnValue(mockMutation(updateMutate));
  vi.mocked(useSaveSiteDiaryLines).mockReturnValue(mockMutation(linesMutate));
  vi.mocked(useSubmitSiteDiaryEntry).mockReturnValue(mockMutation(submitMutate));
  vi.mocked(useReopenSiteDiaryEntry).mockReturnValue(mockMutation(reopenMutate));
});

function setupUser() {
  return userEvent.setup();
}

/**
 * 🔴 F-NAVSAHA · POZİTİF İKİZ — DRILL SEKME ŞERİDİ BURADA VARDIR.
 *
 * Kök rota testi şeridin YOKLUĞUNU iddia eder (E7 onu çizmez). Tek başına o
 * iddia, `chrome` prop'u sessizce silinse ya da `SiteDetailTabs` bu ekrandan
 * düşse bile YEŞİL kalırdı — iki ekran da şeritsiz olurdu ve kimse görmezdi.
 * Şeridin şantiye rotasında GERÇEKTEN basıldığı bu yüzden ayrıca ölçülür:
 * ikisi birlikte "fark KABUKTUR" cümlesini bekçiler.
 */
describe("SiteDiaryEntryView · kabuk (drill sekme şeridi)", () => {
  it("santiye rotasinda drill sekme seridi BASILIR", () => {
    render(<SiteDiaryEntryView />);
    expect(
      screen.getByRole("tablist", { name: "Şantiye detay sekmeleri" }),
    ).toBeInTheDocument();
  });

  it("seritteki 'Günlük Kayıt' sekmesi bu ekranin kendi yoluna bakar", () => {
    render(<SiteDiaryEntryView />);
    const tabs = screen.getByRole("tablist", { name: "Şantiye detay sekmeleri" });
    const gunluk = within(tabs).getByRole("tab", { name: "Günlük Kayıt" });
    expect(gunluk).toHaveAttribute(
      "href",
      "/projeler/p-1/santiyeler/s-1/gunluk-kayit",
    );
  });
});

describe("SiteDiaryEntryView · izin dalları", () => {
  it("site_diary=none ise ekran hiç basılmaz (erişim reddi)", () => {
    mockSession({ site_diary: "none" });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Günlük Kayıt & Planlama" })).not.toBeInTheDocument();
  });

  it("liste 403 dönerse erişim reddi basılır", () => {
    mockScreen({ entriesError: new BackendError(403, { detail: "yasak" }) });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("site_diary=view (salt-okur PM) — form devre dışı, kaydetme yüzeyi YOK", () => {
    mockSession({ site_diary: "view" });
    mockScreen({ entry: entryDetail() });
    render(<SiteDiaryEntryView />);

    expect(
      screen.getByText("Bu modülde yalnız görüntüleme yetkiniz var — form salt-okunur."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Taslak Kaydet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kaydet & Gönder" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tarih")).toBeDisabled();
    expect(screen.getByLabelText("03.001 bugün yapılan miktar")).toBeDisabled();
  });

  it("yazma izniyle form açıktır", () => {
    mockScreen({ entry: entryDetail() });
    render(<SiteDiaryEntryView />);

    expect(screen.getByLabelText("Tarih")).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeInTheDocument();
  });

  // Kullanıcı kararı (2026-08-04, spec §2 düzeltmesi): GK264 "Hakediş Durumu →"
  // mockup'ta `Şantiye - Hakedişler.dc.html`e gider — ŞANTİYE sekmesi, proje-genel
  // `/hakedisler` DEĞİL. Aynı ekrandaki GK408 "Hakedişler →" ile aynı hedef.
  it("GK264 'Hakediş Durumu →' şantiyenin Hakedişler sekmesine gider (proje-genele DEĞİL)", () => {
    mockScreen({ entry: entryDetail() });
    render(<SiteDiaryEntryView />);

    expect(screen.getByRole("link", { name: "Hakediş Durumu →" })).toHaveAttribute(
      "href",
      "/projeler/p-1/santiyeler/s-1/hakedisler",
    );
  });
});

describe("SiteDiaryEntryView · gönderilmiş kayıt", () => {
  it("submitted kayıt SALT-OKUNURDUR ve gerekçesi görünür", () => {
    mockScreen({ entry: entryDetail({ status: "submitted", submitted_at: "2026-07-15T17:30:00Z" }) });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText(/Gönderilmiş kayıt salt-okunurdur\./)).toBeInTheDocument();
    expect(screen.getByLabelText("03.001 bugün yapılan miktar")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Taslak Kaydet" })).not.toBeInTheDocument();
  });

  it("admin seviyesinde 'Yeniden Aç' basılır ve reopen ucunu çağırır", async () => {
    const user = setupUser();
    mockSession({ site_diary: "admin" });
    mockScreen({ entry: entryDetail({ status: "submitted" }) });
    reopenMutate.mockResolvedValue(entryDetail({ status: "draft" }));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Yeniden Aç" }));

    await waitFor(() => expect(reopenMutate).toHaveBeenCalledTimes(1));
  });

  it("admin OLMAYAN yazma seviyesinde 'Yeniden Aç' basılmaz", () => {
    mockSession({ site_diary: "full" });
    mockScreen({ entry: entryDetail({ status: "submitted" }) });
    render(<SiteDiaryEntryView />);

    expect(screen.queryByRole("button", { name: "Yeniden Aç" })).not.toBeInTheDocument();
    expect(screen.getByText(/Gönderilmiş kayıt salt-okunurdur\./)).toBeInTheDocument();
  });
});

describe("SiteDiaryEntryView · türev kuralları", () => {
  it("Kümülatif ve Hakediş (₺) sütunları YANITTAN basılır (frontend hesaplamaz)", () => {
    mockScreen({ entry: entryDetail() });
    const { container } = render(<SiteDiaryEntryView />);

    // 900 (cumulative_quantity) ve 182.400 (line_amount) yanıttan gelir;
    // 120 × 1.520 çarpımı ekranda YAPILMAZ.
    expect(container.querySelector(".diary-lines__cumulative")?.textContent).toBe("900");
    expect(container.querySelector(".diary-lines__amount")?.textContent).toBe("182.400");
    expect(container.querySelector(".diary-lines__total-amount")?.textContent).toBe("₺ 182.400");
  });

  it("kaydedilmemiş değişiklikte türev sütunları için görünür uyarı çıkar", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    render(<SiteDiaryEntryView />);

    await user.clear(screen.getByLabelText("03.001 bugün yapılan miktar"));
    await user.type(screen.getByLabelText("03.001 bugün yapılan miktar"), "130");

    expect(
      await screen.findByText(/Kaydedilmemiş değişiklik var\./),
    ).toBeInTheDocument();
  });

  // SEKME-F1.3 · üst çubuk sekme onayı `unsavedRegistry`den okur — bu form
  // MERKEZİ kayda BAĞLI olmalı, aksi hâlde sekme geçişi bu ekrandan çıkarken
  // kaydedilmemiş satır değişikliğini görmez (sessiz veri kaybı).
  it("satır miktarı değişince unsavedRegistry 'kirli' olur, sunucu değerine geri alınınca düşer", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const { unmount } = render(<SiteDiaryEntryView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.clear(screen.getByLabelText("03.001 bugün yapılan miktar"));
    await user.type(screen.getByLabelText("03.001 bugün yapılan miktar"), "130");
    await screen.findByText(/Kaydedilmemiş değişiklik var\./);

    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // Miktarı sunucu değerine geri yazmak formu yeniden TEMİZ yapar.
    await user.clear(screen.getByLabelText("03.001 bugün yapılan miktar"));
    await user.type(screen.getByLabelText("03.001 bugün yapılan miktar"), "120");
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));

    unmount();
  });

  // SEKME-F1.3-FIX D1 · form efektte DOLDURULUYOR (ilk render boş, entry
  // yüklendikten sonra `setForm(diaryFormFromEntry(entry))`); dirty ifadesi
  // form seed'lenmeden ÖNCE de hesaplanırsa ilk commit'te sahte-kirli görülür
  // (boş form ≠ entry) — üst çubuk boşuna onay modalı açar. Kayıt hiç
  // dokunulmadan asla "kirli" olmamalı.
  it("yükle, dokunma → kayıt HİÇBİR ZAMAN kirli olmaz (sahte-dirty regresyonu)", () => {
    mockScreen({ entry: entryDetail() });
    const setSpy = vi.spyOn(unsavedRegistry, "set");

    const { unmount } = render(<SiteDiaryEntryView />);

    const dirtyFlags = setSpy.mock.calls
      .filter(([, entry]) => entry?.label === "Şantiye günlüğü")
      .map(([, entry]) => entry !== null);
    expect(dirtyFlags).not.toContain(true);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    unmount();
    setSpy.mockRestore();
  });

  it("kayıt açılmadan satır UYDURULMAZ (iskelet boş); 'Kaydet & Gönder' gerekçesiyle devre dışıdır", () => {
    mockScreen();
    render(<SiteDiaryEntryView />);

    expect(
      screen.getByText("Bu şantiyede sözleşme BOQ pozu tanımlı değil — iş kalemi satırı üretilemedi."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
  });
});

// O4 (SEKME-F2) · `entry === undefined` (kaydı olmayan gün) iken registry'ye
// HER ZAMAN `false` gitmesi, o günde yazılan bir değerin ("Min °C") sekme
// değişince UYARISIZ kaybolmasına yol açıyordu (bkz. emir sondası). Taban
// artık seed effect'in BU gün için ürettiği başlangıç değeridir.
describe("SiteDiaryEntryView · O4 (SEKME-F2) — kaydı olmayan günde kirlilik", () => {
  it("kaydı olmayan günde dokunulmadan asla kirli olmaz", () => {
    mockScreen();
    const setSpy = vi.spyOn(unsavedRegistry, "set");
    const { unmount } = render(<SiteDiaryEntryView />);

    const dirtyFlags = setSpy.mock.calls
      .filter(([, entry]) => entry?.label === "Şantiye günlüğü")
      .map(([, entry]) => entry !== null);
    expect(dirtyFlags).not.toContain(true);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    unmount();
    setSpy.mockRestore();
  });

  it("kaydı olmayan günde alan yazılınca kirli olur", async () => {
    const user = setupUser();
    mockScreen();
    render(<SiteDiaryEntryView />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);

    await user.type(screen.getByLabelText("Min °C"), "5");

    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("kaydı olmayan günde yazılan alan geri alınınca (boşaltılınca) temiz olur", async () => {
    const user = setupUser();
    mockScreen();
    render(<SiteDiaryEntryView />);

    await user.type(screen.getByLabelText("Min °C"), "5");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    await user.clear(screen.getByLabelText("Min °C"));

    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  // Kaydı olmayan günden kaydı olmayan BAŞKA bir güne geçilirse (seed effect'in
  // "previous.startsWith" dalı) yazılmış-ama-kaydedilmemiş alanlar KASITLI
  // taşınır; taşınan değer AYNI ZAMANDA yeni günün tabanıdır — bu yüzden geçiş
  // TEK BAŞINA sahte-kirli üretmemelidir.
  it("kaydı olmayan günden başka BOŞ güne geçilince sahte-kirli olmaz", async () => {
    const user = setupUser();
    mockScreen();
    render(<SiteDiaryEntryView />);

    await user.type(screen.getByLabelText("Min °C"), "5");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDots = formatDateDots(isoDate(tomorrow));
    fireEvent.change(screen.getByLabelText("Tarih"), { target: { value: nextDots } });

    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
  });

  // Lider denetimi 2. tur — A günü yaz, kaydı olmayan B gününe geç (taşınan
  // alan B'nin TABANINA da girer): B'ye VARIŞTA hiç `true` BİRİKMEMELİ (geçiş
  // TEK BAŞINA sahte-kirli üretmemeli), ama B'de YENİ bir yazı yine `true`
  // üretmeli — taban B'ye özgü (A'nın YENİ değişikliklerini YUTMAZ).
  it("A gününde yaz, kaydı olmayan B'ye geç → B'de sahte-kirli birikmez, B'de yazınca true olur", async () => {
    const user = setupUser();
    mockScreen();
    const setSpy = vi.spyOn(unsavedRegistry, "set");
    render(<SiteDiaryEntryView />);

    // A günü (bugün): Min °C yazılır — A için kirli.
    await user.type(screen.getByLabelText("Min °C"), "5");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    // B gününe geç (kaydı olmayan başka gün) — taşınan "5" B'nin TABANINA girer.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDots = formatDateDots(isoDate(tomorrow));
    setSpy.mockClear();
    fireEvent.change(screen.getByLabelText("Tarih"), { target: { value: nextDots } });

    // B'ye varıştan SONRA hiçbir noktada `true` BİRİKMEMELİ (geçişin kendisi
    // sahte-kirli üretmemeli) — geçiş sırasında registry'ye giden HİÇ bir
    // "Şantiye günlüğü" kaydı `true` olmamalı.
    const transitionDirtyFlags = setSpy.mock.calls
      .filter(([, e]) => e?.label === "Şantiye günlüğü")
      .map(([, e]) => e !== null);
    expect(transitionDirtyFlags).not.toContain(true);
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));

    // B'de YENİ bir yazı yine `true` üretmeli — taban B'ye özgüdür.
    await user.clear(screen.getByLabelText("Min °C"));
    await user.type(screen.getByLabelText("Min °C"), "9");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);

    setSpy.mockRestore();
  });
});

/**
 * M5_3 #305 — mod anahtarının/hakediş bağlantısının hrefleri eskiden elle
 * `${base}/...` birleştiriliyordu; `routes.ts`teki `diary`/`diarySummary`/
 * `diaryPlanning`/`progressPayments` üreticileri ATLANIYORDU. Bu, tek
 * kaynak ilkesini (routes.ts) deler — üretici bir gün değişirse burası
 * SESSİZCE geride kalır. Test, ekranın bastığı hrefin routes.ts'in ÜRETTİĞİ
 * değerle AYNI olduğunu doğrular (ikisi ayrı hesaplanmaz).
 */
describe("SiteDiaryEntryView · rota bağlantıları routes.ts'ten gelir (#305)", () => {
  it("mod anahtarının bağlantıları routes.ts üreticileriyle AYNIdır ('Kayıt Gir' aktif olduğu için LINK DEĞİLDİR)", () => {
    mockScreen();
    render(<SiteDiaryEntryView />);

    expect(screen.getByText("Kayıt Gir")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Planlama" })).toHaveAttribute(
      "href",
      routes.projects.sites.diaryPlanning({ projectId: "p-1", siteId: "s-1" }),
    );
    expect(screen.getByRole("link", { name: "Hakediş Özeti" })).toHaveAttribute(
      "href",
      routes.projects.sites.diarySummary({ projectId: "p-1", siteId: "s-1" }),
    );
  });

  it("hakediş bağlantıları (GK264 + GK406) routes.ts'in progressPayments üreticisiyle AYNIdır", () => {
    mockScreen({ entry: entryDetail() });
    render(<SiteDiaryEntryView />);

    const expected = routes.projects.sites.progressPayments({
      projectId: "p-1",
      siteId: "s-1",
    });
    expect(screen.getByRole("link", { name: "Hakediş Durumu →" })).toHaveAttribute(
      "href",
      expected,
    );
    expect(screen.getByRole("link", { name: "Hakedişler →" })).toHaveAttribute(
      "href",
      expected,
    );
  });
});

describe("SiteDiaryEntryView · 409 akışı", () => {
  it("aynı güne ikinci kayıtta Türkçe mesaj + 'Var olan kaydı aç' yolu basılır", async () => {
    const user = setupUser();
    mockScreen();
    createMutate.mockRejectedValue(
      new BackendError(409, { detail: "Bu güne ait günlük kayıt zaten var." }),
    );
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByText("Bu güne ait günlük kayıt zaten var.")).toBeInTheDocument();
    const openExisting = screen.getByRole("button", { name: "Var olan kaydı aç" });
    // GKS-F1.3: çakışma anında liste zaten yenilenir (S5'e düşmek için).
    const callsAfterError = refetchEntries.mock.calls.length;

    await user.click(openExisting);

    // Mevcut kayda yönlendirme = ay listesini tazele; hata bandı kapanır.
    await waitFor(() => expect(refetchEntries.mock.calls.length).toBeGreaterThan(callsAfterError));
    expect(screen.queryByRole("button", { name: "Var olan kaydı aç" })).not.toBeInTheDocument();
  });

  it("409 DIŞI hatada yönlendirme butonu basılmaz, hata mesajı görünür", async () => {
    const user = setupUser();
    mockScreen();
    createMutate.mockRejectedValue(new BackendError(500, { detail: "sunucu hatası" }));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(await screen.findByText("sunucu hatası")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Var olan kaydı aç" })).not.toBeInTheDocument();
  });

  it("geçersiz miktar hücresi ağa ÇIKMADAN durdurulur", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    render(<SiteDiaryEntryView />);

    await user.clear(screen.getByLabelText("03.001 bugün yapılan miktar"));
    await user.type(screen.getByLabelText("03.001 bugün yapılan miktar"), "-5");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    expect(
      await screen.findByText("Miktar hücrelerinde geçersiz değer var; düzeltip tekrar deneyin."),
    ).toBeInTheDocument();
    expect(updateMutate).not.toHaveBeenCalled();
    expect(linesMutate).not.toHaveBeenCalled();
  });
});

describe("SiteDiaryEntryView · kaydetme akışı", () => {
  it("PLN-F3.0-ek · açılışta `?tarih=` yoksa replace ÇAĞRILMAZ; sunucu FARKLI bir gün döndürünce URL'e YAZILIR", async () => {
    const user = setupUser();
    mockScreen();
    render(<SiteDiaryEntryView />);
    // Açılışta `?tarih=` YOKTU → ilk değer zaten BUGÜNE düşer; URL'i "bugüne"
    // yazmak GEREKSİZ bir yumuşak navigasyon olurdu — çağrılmaz.
    expect(routerReplace).not.toHaveBeenCalled();

    createMutate.mockResolvedValue(entryDetail({ entry_date: "2026-01-15" }));
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith(
        "/projeler/p-1/santiyeler/s-1/gunluk-kayit?tarih=2026-01-15",
        { scroll: false },
      ),
    );
  });

  it("PLN-F3.0-ek (3. tur) · React.StrictMode'da (efekt mount→cleanup→mount) açılışta YİNE de replace ÇAĞRILMAZ", async () => {
    mockScreen();
    render(
      <StrictMode>
        <SiteDiaryEntryView />
      </StrictMode>,
    );
    // StrictMode geliştirmede efekti iki kez çalıştırır (mount→cleanup→mount);
    // durumsuz karşılaştırma (`parseDiaryDateParam(...) === activeDate`) bu
    // çift koşudan ETKİLENMEZ — `?tarih=` yoktu, ikinci koşuda da hâlâ yok.
    await waitFor(() => expect(screen.getByRole("heading", { name: /Günlük Kayıt/ })).toBeInTheDocument());
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("PLN-F3.0-ek (2. tur) · başka güne geçip TEKRAR ilk güne dönünce URL SON durumu yansıtır (adres ile ekran çelişmez)", async () => {
    const user = setupUser();
    const OTHER = "2026-01-15";
    // "Son Kayıtlar" listesi iki gün taşır — satıra tıklamak `setActiveDate`i
    // DOĞRUDAN çağırır (mutasyon/entry eşleşmesi gerekmez, sözleşmeye en
    // sadık senaryo: GK359 "satır tıklanınca o günün kaydına geçilir").
    vi.mocked(useSiteDiaryEntries).mockReturnValue({
      data: {
        items: [listItem({ id: "e-today", entry_date: TODAY }), listItem({ id: "e-other", entry_date: OTHER })],
        total: 2,
        limit: 50,
        offset: 0,
      } satisfies SiteDiaryEntryListResponse,
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchEntries,
    } as never);
    vi.mocked(useSiteDiaryEntry).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    render(<SiteDiaryEntryView />);
    expect(routerReplace).not.toHaveBeenCalled();
    const recentSection = screen.getByText("Son Kayıtlar").closest("section");
    if (!recentSection) throw new Error("Son Kayıtlar kartı bulunamadı");

    // 1) bugünden BAŞKA bir güne (liste DESC sıralı → ikinci satır) geç.
    await user.click(within(recentSection).getAllByRole("button")[1]!);
    await waitFor(() =>
      expect(routerReplace).toHaveBeenLastCalledWith(
        `/projeler/p-1/santiyeler/s-1/gunluk-kayit?tarih=${OTHER}`,
        { scroll: false },
      ),
    );

    // 2) TEKRAR ilk güne (BUGÜN) dön — `activeDate` şimdi İLK DEĞERE eşit,
    // ama URL hâlâ ÖNCEKİ günü yazıyor: efekt YİNE de yazmalı ("ilk değerden
    // sapma" değil "URL'in güncel değerinden sapma" kontrolü).
    await user.click(within(recentSection).getAllByRole("button")[0]!);
    await waitFor(() =>
      expect(routerReplace).toHaveBeenLastCalledWith(
        `/projeler/p-1/santiyeler/s-1/gunluk-kayit?tarih=${TODAY}`,
        { scroll: false },
      ),
    );
  });

  it("kayıt YOKKEN 'Taslak Kaydet' önce kaydı açar (satır iskeleti sunucudan)", async () => {
    const user = setupUser();
    mockScreen();
    createMutate.mockResolvedValue(entryDetail({ entry_date: TODAY }));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate.mock.calls[0][0]).toMatchObject({ entry_date: TODAY });
    // Kayıt açma gövdesi satır TAŞIMAZ.
    expect(createMutate.mock.calls[0][0]).not.toHaveProperty("lines");
    expect(linesMutate).not.toHaveBeenCalled();
  });

  it("kayıt VARKEN 'Taslak Kaydet' başlığı PATCH, satırları PUT eder", async () => {
    const user = setupUser();
    const detail = entryDetail({ entry_date: TODAY });
    mockScreen({ entry: detail });
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(linesMutate.mock.calls[0][0]).toEqual({
      // PLN-F2.1: yeni anahtarlar null olsa da AÇIKÇA gider (B2.x-A eski-istemci bekçisi).
      lines: [{ boq_item_id: "bi-1", section_id: null, quantity: 120, overrun_reason: null }],
    });
  });

  it("'Kaydet & Gönder' kaydeder, SONRA submit eder (sıra korunur)", async () => {
    const user = setupUser();
    const detail = entryDetail({ entry_date: TODAY });
    mockScreen({ entry: detail });
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    submitMutate.mockResolvedValue(entryDetail({ status: "submitted" }));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Kaydet & Gönder" }));

    await waitFor(() => expect(submitMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.invocationCallOrder[0]).toBeLessThan(
      submitMutate.mock.invocationCallOrder[0],
    );
    expect(linesMutate.mock.invocationCallOrder[0]).toBeLessThan(
      submitMutate.mock.invocationCallOrder[0],
    );
  });

  it("kaydetme kırılırsa submit HİÇ çağrılmaz", async () => {
    const user = setupUser();
    const detail = entryDetail({ entry_date: TODAY });
    mockScreen({ entry: detail });
    updateMutate.mockRejectedValue(new BackendError(409, { detail: "Gönderilmiş kayıt düzenlenemez." }));
    render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Kaydet & Gönder" }));

    expect(await screen.findByText("Gönderilmiş kayıt düzenlenemez.")).toBeInTheDocument();
    expect(submitMutate).not.toHaveBeenCalled();
  });
});

/**
 * PLN-F2.1b · G12a — "Bugünkü İşçi Dağılımı" kendi ekip satırlarını kayıt
 * yanıtının `own_crew_from_timesheet`inden basar (backend türetir; ekran
 * puantaj haftası OKUMAZ, dize sezgisi YOK). Eski dört hazır satır kalktı.
 */
describe("SiteDiaryEntryView · işçi dağılımı (G12a)", () => {
  function timesheetHrefFor(day: string): string {
    const week = isoWeekOf(day);
    return `${routes.projects.sites.timesheet({ projectId: "p-1", siteId: "s-1" })}?iso_year=${week.isoYear}&iso_week=${week.isoWeek}`;
  }

  it("kendi ekip satırları own_crew_from_timesheet'ten SALT OKUNUR basılır; hazır satırlar YOK", () => {
    mockScreen({
      entry: entryDetail({
        own_crew_from_timesheet: [{ trade: "Kalıpçı", source: "company", headcount: 3, hours: "27.0" }],
      }),
    });
    render(<SiteDiaryEntryView />);

    const row = screen.getByText("Kalıpçı").closest(".diary-workers__grid-row") as HTMLElement;
    expect(within(row).queryByRole("textbox")).toBeNull();
    expect(within(row).getByText("3")).toBeInTheDocument();
    for (const preset of ["Kalıpçılar", "Demirciler", "Elektrikçiler", "Yardımcı"]) {
      expect(screen.queryByText(preset)).toBeNull();
    }
    expect(screen.queryByText(/Bu gün için puantaj girilmemiş/)).toBeNull();
  });

  it("puantajsız gün: boş hâl + o günün haftasına 'Puantaja git' (routes.ts şantiye puantajı)", () => {
    mockScreen({ entry: entryDetail({ own_crew_from_timesheet: [] }) });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText(/Bu gün için puantaj girilmemiş/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Puantaja git/ })).toHaveAttribute("href", timesheetHrefFor(TODAY));
  });

  it("alan hiç gelmezse (eski yanıt) de boş hâl basılır", () => {
    mockScreen({ entry: entryDetail() });
    render(<SiteDiaryEntryView />);

    expect(screen.getByText(/Bu gün için puantaj girilmemiş/)).toBeInTheDocument();
  });

  it("kayıt yokken boş hâl basılır; 'önce taslak kaydedin' notu YOK (GKS-F1.5)", () => {
    mockScreen();
    render(<SiteDiaryEntryView />);

    expect(screen.getByText(/Bu gün için puantaj girilmemiş/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Puantaja git/ })).toHaveAttribute("href", timesheetHrefFor(TODAY));
    expect(screen.queryByText(/önce “Taslak Kaydet” deyin/)).toBeNull();
  });

  it("🔴 TAM KÜME: gizli (sayısı 0) eski satır PATCH gövdesinde korunur; görünen eski satır 'Diğer (eski kayıt)'", async () => {
    const user = setupUser();
    const detail = entryDetail({
      entry_date: TODAY,
      worker_counts: [
        { id: "w-0", trade: "Yardımcı", source: "general", count: 0, subcontractor_id: null, hours: null, subcontractor_name: null },
        { id: "w-1", trade: "Kalıpçılar", source: "company", count: 4, subcontractor_id: null, hours: null, subcontractor_name: null },
      ],
      own_crew_from_timesheet: [{ trade: "Kalıpçı", source: "company", headcount: 3, hours: "27.0" }],
    });
    mockScreen({ entry: detail });
    updateMutate.mockResolvedValue(detail);
    linesMutate.mockResolvedValue(detail);
    render(<SiteDiaryEntryView />);

    expect(screen.queryByText(/Yardımcı/)).toBeNull();
    const legacy = screen.getByLabelText("Şirket · Diğer (eski kayıt) · Kalıpçılar işçi sayısı");
    await user.clear(legacy);
    await user.type(legacy, "5");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(updateMutate).toHaveBeenCalledTimes(1));
    expect(updateMutate.mock.calls[0][0].worker_counts).toEqual([
      { trade: "Yardımcı", source: "general", count: 0, subcontractor_id: null, hours: null },
      { trade: "Kalıpçılar", source: "company", count: 5, subcontractor_id: null, hours: null },
    ]);
  });
});

// D1 (form-ez-f1) · tohumlama YALNIZ ilk yükleme / gün-kayıt kimliği değişimi /
// bu ekrandan başarılı kayıt sonrası. Sunucu kaydı BU EKRAN DIŞINDAN değişince
// (`updated_at` başka gelir — arka plan refetch'i, başka sekme/kullanıcı)
// kirli form EZİLMEZ. Kancalar mock'lu olduğundan "refetch" = yeni yanıtla
// `rerender` (gerçek akıştaki gibi kullanıcı yazdıktan SONRA, asenkron gelir).
describe("SiteDiaryEntryView · D1 — kayıt dışarıdan değişince kirli form ezilmez", () => {
  const OTHER_DAY = "2026-01-15";

  async function typeMinTemp(user: ReturnType<typeof setupUser>, value: string) {
    await user.type(screen.getByLabelText("Min °C"), value);
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(true));
  }

  it("kirli form, updated_at değişen refetch'te EZİLMEZ; dirty true kalır", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const { rerender, unmount } = render(<SiteDiaryEntryView />);
    await typeMinTemp(user, "5");

    // Sunucu kaydı dışarıdan değişti (yeni updated_at + başka Max °C).
    mockScreen({ entry: entryDetail({ updated_at: "2026-07-15T10:00:00Z", temp_max_c: "31.0" }) });
    rerender(<SiteDiaryEntryView />);

    await waitFor(() => expect(screen.getByLabelText("Min °C")).toHaveValue("5"));
    expect(screen.getByLabelText("Max °C")).toHaveValue("28.0");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    unmount();
  });

  it("TEMİZ form, updated_at değişen refetch'te yeni sunucu verisine hizalanır", async () => {
    mockScreen({ entry: entryDetail() });
    const { rerender, unmount } = render(<SiteDiaryEntryView />);
    expect(screen.getByLabelText("Max °C")).toHaveValue("28.0");

    mockScreen({ entry: entryDetail({ updated_at: "2026-07-15T10:00:00Z", temp_max_c: "31.0" }) });
    rerender(<SiteDiaryEntryView />);

    await waitFor(() => expect(screen.getByLabelText("Max °C")).toHaveValue("31.0"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    unmount();
  });

  it("bu ekrandan başarılı kayıt → form yeni sunucu verisine hizalanır, dirty false", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const saved = entryDetail({ updated_at: "2026-07-15T11:00:00Z", temp_max_c: "33.0" });
    updateMutate.mockResolvedValue(saved);
    linesMutate.mockResolvedValue(saved);
    const { rerender, unmount } = render(<SiteDiaryEntryView />);
    await typeMinTemp(user, "5");

    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));

    await waitFor(() => expect(screen.getByLabelText("Max °C")).toHaveValue("33.0"));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
    // Ardından invalidate → refetch aynı kaydı getirir: hâlâ hizalı ve temiz.
    mockScreen({ entry: saved });
    rerender(<SiteDiaryEntryView />);
    expect(screen.getByLabelText("Max °C")).toHaveValue("33.0");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    unmount();
  });

  it("kayıt sonrası kirlilik tabanı KAYDEDİLEN kayıttır: kayıt-sonrası refetch yeni yazıyı ezmez", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const saved = entryDetail({ updated_at: "2026-07-15T11:00:00Z", temp_max_c: "33.0" });
    updateMutate.mockResolvedValue(saved);
    linesMutate.mockResolvedValue(saved);
    const { rerender, unmount } = render(<SiteDiaryEntryView />);
    await typeMinTemp(user, "5");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));

    // Kayıttan sonra yeniden yazıldı; sonra refetch başka updated_at getirdi.
    await typeMinTemp(user, "7");
    mockScreen({ entry: entryDetail({ updated_at: "2026-07-15T12:00:00Z", temp_max_c: "35.0" }) });
    rerender(<SiteDiaryEntryView />);

    await waitFor(() => expect(screen.getByLabelText("Min °C")).toHaveValue("7"));
    expect(screen.getByLabelText("Max °C")).toHaveValue("33.0");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    unmount();
  });

  it("URL tohumlu açılış (?tarih=): form o kaydın verisiyle dolar ve kirli form orada da ezilmez", async () => {
    const user = setupUser();
    sharedSearchParams.set("tarih", OTHER_DAY);
    const first = entryDetail({ id: "d-2", entry_date: OTHER_DAY, temp_max_c: "12.0" });
    mockScreen({ entry: first });
    const { rerender, unmount } = render(<SiteDiaryEntryView />);
    await waitFor(() => expect(screen.getByLabelText("Max °C")).toHaveValue("12.0"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    await typeMinTemp(user, "5");

    mockScreen({
      entry: entryDetail({
        id: "d-2",
        entry_date: OTHER_DAY,
        temp_max_c: "14.0",
        updated_at: "2026-07-15T10:00:00Z",
      }),
    });
    rerender(<SiteDiaryEntryView />);

    await waitFor(() => expect(screen.getByLabelText("Min °C")).toHaveValue("5"));
    expect(screen.getByLabelText("Max °C")).toHaveValue("12.0");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    unmount();
  });

  // Denetim YÜKSEK-1 · Taslak Kaydet: PATCH invalidate → GET, PUT lines'tan ÖNCE
  // döner; önbelleğe ARA kayıt (yeni başlık + ESKİ satırlar) girer. Ara kayıt,
  // kayıttan dönen daha yeni kaydı geri ezmemeli.
  it("kayıt YOLDAYKEN gelen ara (eski satırlı) kayıt, dönen yeni kaydı ezmez", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const x1 = entryDetail({ updated_at: "2026-07-15T10:00:00Z", temp_max_c: "30.0" });
    const x2 = entryDetail({ updated_at: "2026-07-15T11:00:00Z", temp_max_c: "33.0" });
    updateMutate.mockResolvedValue(x1);
    let resolveLines: (value: SiteDiaryEntryDetail) => void = () => undefined;
    linesMutate.mockReturnValue(new Promise<SiteDiaryEntryDetail>((resolve) => { resolveLines = resolve; }));
    const { rerender, unmount } = render(<SiteDiaryEntryView />);
    await typeMinTemp(user, "5");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));

    mockScreen({ entry: x1 });
    rerender(<SiteDiaryEntryView />);
    resolveLines(x2);
    await waitFor(() => expect(screen.getByLabelText("Max °C")).toHaveValue("33.0"));
    mockScreen({ entry: x1 });
    rerender(<SiteDiaryEntryView />);

    expect(screen.getByLabelText("Max °C")).toHaveValue("33.0");
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
    unmount();
  });

  // Denetim ORTA-1 · kayıt yoldayken yazılan değişiklik başarı anında silinmez.
  it("kayıt YOLDAYKEN yazılan değer başarıda KALIR; taban kaydedilen kayıt, dirty true", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const saved = entryDetail({ updated_at: "2026-07-15T11:00:00Z", temp_max_c: "33.0" });
    updateMutate.mockResolvedValue(saved);
    let resolveLines: (value: SiteDiaryEntryDetail) => void = () => undefined;
    linesMutate.mockReturnValue(new Promise<SiteDiaryEntryDetail>((resolve) => { resolveLines = resolve; }));
    const { unmount } = render(<SiteDiaryEntryView />);
    await typeMinTemp(user, "5");
    await user.click(screen.getByRole("button", { name: "Taslak Kaydet" }));
    await waitFor(() => expect(linesMutate).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText("Min °C"), "7");
    resolveLines(saved);

    await waitFor(() => expect(screen.getByRole("button", { name: "Taslak Kaydet" })).toBeEnabled());
    expect(screen.getByLabelText("Min °C")).toHaveValue("57");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    unmount();
  });

  // Denetim ORTA-2 · Kaydet & Gönder: ara (lines) reseed'i, submit patlasa da
  // kaydedilen veriyi tabana işler.
  it("Kaydet & Gönder: submit patlarsa bile kaydedilen veri forma/tabana işlenir", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const saved = entryDetail({ updated_at: "2026-07-15T11:00:00Z", temp_max_c: "33.0" });
    updateMutate.mockResolvedValue(saved);
    linesMutate.mockResolvedValue(saved);
    submitMutate.mockRejectedValue(new Error("gönderilemedi"));
    const { unmount } = render(<SiteDiaryEntryView />);
    await typeMinTemp(user, "5");

    await user.click(screen.getByRole("button", { name: "Kaydet & Gönder" }));

    await waitFor(() => expect(screen.getByLabelText("Max °C")).toHaveValue("33.0"));
    await waitFor(() => expect(unsavedRegistry.hasUnsaved()).toBe(false));
    unmount();
  });

  it("Kaydet & Gönder: başarılı submit sonrası form gönderilen (submit yanıtı) kayda hizalanır", async () => {
    const user = setupUser();
    mockScreen({ entry: entryDetail() });
    const saved = entryDetail({ updated_at: "2026-07-15T11:00:00Z", temp_max_c: "33.0" });
    updateMutate.mockResolvedValue(saved);
    linesMutate.mockResolvedValue(saved);
    submitMutate.mockResolvedValue(
      entryDetail({ status: "submitted", updated_at: "2026-07-15T12:00:00Z", temp_max_c: "34.0" }),
    );
    const { unmount } = render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Kaydet & Gönder" }));

    await waitFor(() => expect(screen.getByLabelText("Max °C")).toHaveValue("34.0"));
    unmount();
  });

  it("Yeniden Aç: başarılı sonrası form dönen (taslak) kayda hizalanır", async () => {
    const user = setupUser();
    mockSession({ site_diary: "admin" });
    mockScreen({ entry: entryDetail({ status: "submitted" }) });
    reopenMutate.mockResolvedValue(
      entryDetail({ status: "draft", updated_at: "2026-07-15T12:00:00Z", temp_max_c: "36.0" }),
    );
    const { unmount } = render(<SiteDiaryEntryView />);

    await user.click(screen.getByRole("button", { name: "Yeniden Aç" }));

    await waitFor(() => expect(screen.getByLabelText("Max °C")).toHaveValue("36.0"));
    unmount();
  });
});
