import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SectionDetailView } from "./SectionDetailView";
import { useSection } from "@/lib/api/hooks/useSection";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import { useTimesheetData } from "@/components/timesheet/useTimesheetData";
import { buildTimesheetView } from "@/components/timesheet/derive";
import { currentPeriod } from "@/components/timesheet/month";
import { formatPeriod } from "@/lib/format";
import type { TimesheetMatrix } from "@/lib/api/hooks/useTimesheet";
import type { PersonnelListItem } from "@/lib/api/hooks/usePersonnel";
import { BackendError } from "@/lib/api/unwrap";
import type { SectionDetailResponse } from "@/lib/api/hooks/useSection";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import { sectionNav } from "./section-nav.testkit";

vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));

vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

// BOQ-SEC-F: İş Kalemleri sekmesi artık CANLI — süzgeçli BOQ sorgusu mock'lanır.
vi.mock("@/lib/api/hooks/useBoq", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBoq")>()),
  useBoq: vi.fn(),
}));

// F-BLMPUAN: puantaj VERİ KATMANI mock'lanır, TÜREV KATMANI mock'lanmaz —
// `buildTimesheetView` GERÇEĞİ koşar. Türevleri de elle uydursaydık test,
// ekranın bastığı sayıların doğruluğu hakkında HİÇBİR ŞEY söylemezdi.
vi.mock("@/components/timesheet/useTimesheetData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/timesheet/useTimesheetData")>()),
  useTimesheetData: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";
const SECTION_ID = "55555555-5555-5555-5555-555555555555";

// DET-1.2 · S4 — sekme `?sekme=` URL parametresidir; durumlu ikiz `replace`i uygular.
vi.mock("next/navigation", async () =>
  (await import("./section-nav.testkit")).sectionNavModule(() => ({
    projectId: PROJECT_ID,
    siteId: SITE_ID,
    sectionId: SECTION_ID,
  })),
);
beforeEach(() => sectionNav.reset());

/** `level` verilmezse alanı taşımayan eski oturum (bilinmezlik dalı, §2.5.3). */
function mockPermission(level?: string) {
  const base = { id: "u1", email: "a@b.c", full_name: "A", role_key: "admin", status: "active" };
  vi.mocked(useSession).mockReturnValue({
    me: (level === undefined ? base : { ...base, permissions: { sites: level } }) as never,
    isLoading: false,
  });
}

const SITE = { id: SITE_ID, name: "A-Blok Şantiyesi", project: { id: PROJECT_ID } } as unknown as SiteDetail;

const BASE_SECTION: SectionDetailResponse = {
  id: SECTION_ID,
  code: "A-01",
  name: "Kat 6–10 Kaba İnşaat",
  status: "active",
  manager_user_id: null,
  manager_name: "Sercan Öztürk",
  start_date: "2026-01-01",
  end_date: "2026-09-30",
  sort_order: 3,
  depends_on_section_id: null,
  milestones: [],
  progress_pct: { available: false, value: null, pending_module: "boq" },
  boq_item_count: { available: false, count: null, pending_module: "boq" },
  budget: { available: true, value: "3520000.00", pending_module: null },
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  site_id: SITE_ID,
  section_type: { id: "type-structural", name: "Kaba İnşaat" },
  description: null,
  deputy_manager_user_id: null,
  deputy_manager_name: null,
  planned_worker_count: null,
  is_draft: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const BOQ_RESPONSE = {
  totals: {
    contract_total: { available: false, value: null, pending_module: "contracts" },
    realized_total: { available: false, value: null, pending_module: "progress_payments" },
    remaining_total: { available: false, value: null, pending_module: "contracts" },
    revision_total: { available: false, value: null, pending_module: "contracts" },
    grand_total: "2220000.00",
    grand_progress_pct: { available: false, value: null, pending_module: "progress_payments" },
  },
  groups: [
    {
      id: "g-1",
      name: "Betonarme İşleri",
      sort_order: 10,
      group_total: "2220000.00",
      items: [
        {
          id: "i-1",
          code: "03.001",
          description: "Kat Döşemesi — C25/30",
          unit: "m³",
          quantity: "1200.000",
          allocated_quantity: "1700.000",
          unallocated_quantity: "300.000",
          unit_price: "1850.00",
          amount: "2220000.00",
          sort_order: 0,
          progress_pct: { available: false, value: null, pending_module: "progress_payments" },
        },
      ],
    },
  ],
};

function mockBoq(overrides: Record<string, unknown> = {}) {
  vi.mocked(useBoq).mockReturnValue({
    data: BOQ_RESPONSE,
    isLoading: false,
    isError: false,
    error: null,
    ...overrides,
  } as never);
}

/**
 * F-BLMPUAN fikstürü — sec-1'de İKİ kaynak (Şirket/Taşeron), BAŞKA bölümde
 * (`sec-other`) bir hücre daha: bölüm süzgecinin GERÇEKTEN süzdüğü ancak
 * ayrışma noktası olan bir kurulumla ölçülebilir.
 */
const TS_PERSONNEL = [
  { id: "per-1", full_name: "Ahmet Kaya", trade: "Kalıpçı", source: "company" },
  { id: "per-2", full_name: "Bora Sen", trade: "Kalıpçı", source: "company" },
  { id: "per-3", full_name: "Cem Ak", trade: "Demirci", source: "subcontractor" },
  { id: "per-9", full_name: "Zeki Dur", trade: "Boyacı", source: "company" },
] as unknown as PersonnelListItem[];

/**
 * 🔴 DÖNEM ZAMANA BAĞLIDIR: ekran ay gezinmesi taşımaz, İÇİNDE BULUNULAN ayı
 * gösterir (`currentPeriod()`). Fikstür tarihleri o aydan TÜRETİLİR — sabit
 * "2026-08" yazılsaydı test bir sonraki ay KENDİLİĞİNDEN kırmızıya dönerdi.
 */
const TS_PERIOD = currentPeriod();
function tsDay(day: number): string {
  return `${TS_PERIOD.year}-${String(TS_PERIOD.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 🔴 PUAN-SAAT: hücre artık SAAT XOR KOD taşır (`worked` enum üyesi kalktı). */
function tsCell(work_date: string, section_id: string | null, hours: string | null = "9") {
  return { work_date, hours, code: hours === null ? "leave" : null, section_id };
}

const TS_MATRIX = {
  rows: [
    {
      personnel_id: "per-1",
      full_name: "Ahmet Kaya",
      trade: "Kalıpçı",
      source: "company",
      subcontractor_name: null,
      man_days: 1,
      cells: [tsCell(tsDay(3), SECTION_ID)],
    },
    {
      personnel_id: "per-2",
      full_name: "Bora Sen",
      trade: "Kalıpçı",
      source: "company",
      subcontractor_name: null,
      man_days: 1,
      cells: [tsCell(tsDay(3), SECTION_ID)],
    },
    {
      personnel_id: "per-3",
      full_name: "Cem Ak",
      trade: "Demirci",
      source: "subcontractor",
      subcontractor_name: "Akın İnşaat",
      man_days: 1,
      cells: [tsCell(tsDay(4), SECTION_ID)],
    },
    // 🔴 AYRIŞMA NOKTASI: BAŞKA bölümün hücresi. Süzgeç kaldırılırsa bu satır
    // hem matriste hem işçi kartında görünür ve testler KIRMIZI olur.
    {
      personnel_id: "per-9",
      full_name: "Zeki Dur",
      trade: "Boyacı",
      source: "company",
      subcontractor_name: null,
      man_days: 1,
      cells: [tsCell(tsDay(5), "sec-other")],
    },
  ],
} as unknown as TimesheetMatrix;

function mockTimesheet(
  overrides: {
    isLoading?: boolean;
    isError?: boolean;
    matrix?: TimesheetMatrix | undefined;
    isPersonnelUnavailable?: boolean;
    personnelTruncation?: { isTruncated: boolean; shownCount: number; totalCount: number };
  } = {},
) {
  // 🔴 `matrix: undefined` AÇIKÇA verilebilmelidir — varsayılan parametre
  // sözdizimi (`matrix = TS_MATRIX`) açık `undefined`i de EZER ve "veri yok"
  // dalı hiç koşmazdı (bu tuzak bu turda fiilen ısırdı).
  const isLoading = overrides.isLoading ?? false;
  const isError = overrides.isError ?? false;
  const matrix = "matrix" in overrides ? overrides.matrix : TS_MATRIX;
  vi.mocked(useTimesheetData).mockImplementation((input) => ({
    // TÜREV GERÇEKTİR — `buildTimesheetView` bu testte gerçekten koşar.
    view: buildTimesheetView({
      year: input.period.year,
      month: input.period.month,
      personnel: TS_PERSONNEL,
      matrix,
      sectionId: input.sectionId,
    }),
    isLoading,
    isError,
    isForbidden: false,
    isPersonnelUnavailable: overrides.isPersonnelUnavailable ?? false,
    personnelTruncation: overrides.personnelTruncation ?? {
      isTruncated: false,
      shownCount: 0,
      totalCount: 0,
    },
  }));
}

function mockQueries(section: Partial<ReturnType<typeof useSection>> = {}, site: Partial<ReturnType<typeof useSite>> = {}) {
  mockBoq();
  mockTimesheet();
  vi.mocked(useSection).mockReturnValue({
    data: BASE_SECTION,
    isLoading: false,
    isError: false,
    error: null,
    ...section,
  } as never);
  vi.mocked(useSite).mockReturnValue({
    data: SITE,
    isLoading: false,
    isError: false,
    error: null,
    ...site,
  } as never);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SectionDetailView />
    </QueryClientProvider>,
  );
}

describe("SectionDetailView — yükleme/hata durumları", () => {
  beforeEach(() => vi.clearAllMocks());

  it("yuklenirken mesaj basar", () => {
    mockPermission("view");
    mockQueries({ isLoading: true, data: undefined });
    renderView();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("403'te erisim reddi basar", () => {
    mockPermission("view");
    mockQueries({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    renderView();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("diger hatalarda mesaj basar", () => {
    mockPermission("view");
    mockQueries({ isError: true, error: new Error("patladi") });
    renderView();
    expect(screen.getByText("Bölüm yüklenemedi")).toBeInTheDocument();
  });

  it("sites:view yoksa (none) AccessDenied basar", () => {
    mockPermission("none");
    mockQueries();
    renderView();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });
});

describe("SectionDetailView — durum rozeti (4 durum, D59)", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["planned", "Planlandı"],
    ["active", "Aktif"],
    ["on_hold", "Beklemede"],
    ["completed", "Tamamlandı"],
  ] as const)("%s -> '%s' basar", (status, label) => {
    mockPermission("full");
    mockQueries({ data: { ...BASE_SECTION, status } });
    renderView();
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe("SectionDetailView — KPI şeridi (türev `budget` gerçek, diğerleri yer tutucu)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Bölüm Bedeli türev `budget`tan gerçek basılır", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByText("₺ 3,5M")).toBeInTheDocument();
  });

  it("`budget` yer tutucuysa zarif düşüş (—) basılır, sahte sayı yazılmaz", () => {
    mockPermission("view");
    mockQueries({
      data: { ...BASE_SECTION, budget: { available: false, value: null, pending_module: "boq" } },
    });
    renderView();
    expect(screen.getByTestId("section-hero-kpi-budget")).toHaveTextContent("—");
  });

  it("Fiziksel İlerleme/Aktif İşçi/İş Kalemleri yer tutucu — sahte sayı yok", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByTestId("section-hero-kpi-progress")).toHaveTextContent("—");
    expect(screen.getByTestId("section-hero-kpi-worker")).toHaveTextContent("—");
    expect(screen.getByTestId("section-hero-kpi-boq")).toHaveTextContent("—");
  });

  it("'Gerçekleşen' alt satırı her zaman yer tutucu basılır (D78)", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByText(/Gerçekleşen:/)).toHaveTextContent("Gerçekleşen: —");
  });

  it("'3 gecikme riski' basılmaz — backend üretmiyor, yer tutucu basılır (D88)", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.queryByText(/gecikme riski/i)).not.toBeInTheDocument();
  });

  it("Kalan Gün end_date'ten türetilir, gerçek bir sayı basar", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const cell = screen.getByTestId("section-hero-kpi-days");
    expect(cell).not.toHaveTextContent("—");
  });

  it("end_date null ise Kalan Gün dürüst '—' basar", () => {
    mockPermission("view");
    mockQueries({ data: { ...BASE_SECTION, end_date: null } });
    renderView();
    expect(screen.getByTestId("section-hero-kpi-days")).toHaveTextContent("—");
  });
});

describe("SectionDetailView — izin kapısı (Düzenle butonu)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sites:full varsa 'Düzenle' görünür", () => {
    mockPermission("full");
    mockQueries();
    renderView();
    expect(screen.getByRole("link", { name: "Düzenle" })).toBeInTheDocument();
  });

  it("sites:full yoksa (view) 'Düzenle' basılmaz", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.queryByRole("link", { name: "Düzenle" })).not.toBeInTheDocument();
  });

  it("'Hakediş Oluştur' her zaman gerçek linkle basılır", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByRole("link", { name: "Hakediş Oluştur" })).toHaveAttribute(
      "href",
      `/hakedisler/yeni?project=${PROJECT_ID}`,
    );
  });
});

describe("SectionDetailView — sekmeler (D99-105, hepsi BÖLÜM BAĞI bekleyen içerik)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("5 sekme başlığı mockup sırasıyla basılır", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "İş Kalemleri",
      "İşçiler & Puantaj",
      "Malzeme",
      "Hakediş",
      "Günlük Kayıt",
    ]);
  });

  // 🔴 STOK-BOLUM — "yer tutucu kartı basılır" iddiası ÇÜRÜDÜ: sekme kendi
  // panelini basıyor. İddia SİLİNMEDİ, TERSİNE çevrildi.
  it("sekme degistirince Malzeme paneli basilir - YER TUTUCU DEGIL", async () => {
    const user = userEvent.setup();
    mockPermission("view");
    mockQueries();
    renderView();
    await user.click(screen.getByRole("tab", { name: "Malzeme" }));
    const panel = screen.getByRole("tabpanel");

    expect(within(panel).getByTestId("section-stock")).toBeInTheDocument();
    expect(
      within(panel).queryByText(/Stok hareketi bölüm alanı taşımıyor/),
    ).not.toBeInTheDocument();
    expect(
      within(panel).queryByText(/Stok verisi bu yüzeye henüz bağlanmadı/),
    ).not.toBeInTheDocument();
  });

  // BOQ-SEC-F GÖÇÜ: artık BEŞ değil DÖRT sekme gerekçe taşır — "İş Kalemleri"
  // bölüm bağı AÇILDI ve içerik gerçekten basılıyor. Eski hâli aynen bıraksaydık
  // test, canlı sekmeden hâlâ "henüz kırılmıyor" gerekçesi isterdi.
  it("gerekçe taşıyan sekmeler 'modül yok' demez — hepsi bölüm bağı gerekçesidir", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const tabs = screen.getAllByRole("tab");
    const live = tabs.filter((tab) => tab.getAttribute("data-content-live") === "true");
    const pending = tabs.filter((tab) => tab.getAttribute("data-content-live") !== "true");

    // 🔴 STOK-BOLUM: canlı sekme artık BEŞ — "Malzeme" de bölüm bağını kazandı
    // (`stock_entry_lines.section_id`). Gerekçe taşıyan sekme KALMADI.
    //
    // ⚠️ Bu, iddianın ZAYIFLADIĞI bir yer: `pending` kümesi BOŞ olduğu için
    // "gerekçe `section_` ile başlar" döngüsü artık hiç dönmüyor. Döngü
    // SİLİNMEZ (bir sonraki pending sekme geldiğinde bekçi hazır olsun) ama
    // kümenin boşluğu AÇIKÇA iddia edilir — sessizce boş bir döngü, bekçinin
    // kaybolduğunu gizlerdi.
    const LIVE = ["İş Kalemleri", "İşçiler & Puantaj", "Malzeme", "Hakediş", "Günlük Kayıt"];
    expect(live.map((tab) => tab.textContent)).toEqual(LIVE);
    for (const tab of live) expect(tab).not.toHaveAttribute("data-content-pending");

    expect(pending).toHaveLength(0);
    for (const tab of pending) {
      expect(tab.getAttribute("data-content-pending")).toMatch(/^section_/);
    }
    for (const tab of tabs) {
      expect(tab).toHaveAttribute("data-module-written", "true");
    }
  });
});

describe("SectionDetailView — alt kart bağlantıları (K1 · K2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("'Puantaj →' bölüm süzgecini TAŞIR (hedef ekran ?section= okur)", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByRole("link", { name: "Puantaj →" })).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/puantaj?section=${SECTION_ID}`,
    );
  });

  it("'Tümü →' bölüm süzgeci TAŞIMAZ — hedef ekran okumuyor, ölü parametre yazılmaz", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByRole("link", { name: "Tümü →" })).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/stok`,
    );
  });

  it("iki bağlantı da BAYAT 'Bu bölüm yakında' ipucunu taşımaz (rotalar yazılı)", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    for (const name of ["Puantaj →", "Tümü →"]) {
      const link = screen.getByRole("link", { name });
      expect(link).not.toHaveAttribute("title", "Bu bölüm yakında");
      expect(link.getAttribute("title")).toMatch(/açar/);
    }
  });
});

describe("SectionDetailView — alt satır kartları (D213-273)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("worker_count yer tutucuyken başlıkta sahte sayı basılmaz", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByText("Bu Bölümdeki İşçiler")).toBeInTheDocument();
  });

  it("worker_count gerçekse başlıkta gerçek sayı basılır", () => {
    mockPermission("view");
    mockQueries({
      data: { ...BASE_SECTION, worker_count: { available: true, count: 48, pending_module: "timesheet" } },
    });
    renderView();
    expect(screen.getByText("Bu Bölümdeki İşçiler (48)")).toBeInTheDocument();
  });

  it("Bölüm Malzeme Durumu kartı başlığıyla basılır", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.getByText("Bölüm Malzeme Durumu")).toBeInTheDocument();
  });
});

/**
 * BOQ-SEC-F T5 — İş Kalemleri sekmesi bölüm bağını GERÇEKTEN kullanır.
 *
 * 🔑 Bu blok "sekme canlı mı" sorusunu DOM'dan cevaplar (F-IZN kanonu: bir
 * yüzeyin ölüden canlıya geçtiğini görsel kapı KANITLAMAZ).
 */
describe("SectionDetailView — İş Kalemleri sekmesi (BOQ-SEC-F)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("varsayılan sekmede gerçek tablo basılır, yer tutucu kart DEĞİL", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("İş Kalemleri — Kat 6–10 Kaba İnşaat")).toBeInTheDocument();
    expect(within(panel).getByText("03.001")).toBeInTheDocument();
    expect(within(panel).queryByText(/henüz görüntülenemiyor/)).not.toBeInTheDocument();
  });

  it("🔴 BOQ sorgusu BÖLÜM SÜZGECİYLE çağrılır — süzgeçsiz çağrı bütün şantiyeyi basardı", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(useBoq).toHaveBeenCalledWith(SITE_ID, SECTION_ID);
  });

  it("yüklenirken boş tablo BASILMAZ — 'kalem atanmadı' yalanı söylenmez", () => {
    mockPermission("view");
    mockQueries();
    mockBoq({ data: undefined, isLoading: true });
    renderView();
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Yükleniyor…")).toBeInTheDocument();
    expect(within(panel).queryByTestId("section-boq-empty")).not.toBeInTheDocument();
  });

  it("hata (ör. başka şantiyenin bölümü → 404) sessizce boş listeye DÜŞMEZ", () => {
    mockPermission("view");
    mockQueries();
    mockBoq({ data: undefined, isError: true, error: new BackendError(404, null) });
    renderView();
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("İş kalemleri yüklenemedi")).toBeInTheDocument();
    expect(within(panel).queryByTestId("section-boq-empty")).not.toBeInTheDocument();
  });

  it("öbür sekmeler HÂLÂ gerekçeli yer tutucu basar (canlılık sızmaz)", async () => {
    const user = userEvent.setup();
    mockPermission("view");
    mockQueries();
    renderView();
    // 🔴 STOK-BOLUM: "Malzeme" de CANLIYA geçti. Bekçinin ASIL işi SIZINTIDIR
    // ("İş Kalemleri" satırı başka sekmeye sızmasın) ve o KORUNUR; değişen
    // yalnız hedef sekmenin gerekçe yerine KENDİ panelini basması.
    await user.click(screen.getByRole("tab", { name: "Malzeme" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByTestId("section-stock")).toBeInTheDocument();
    expect(within(panel).queryByText("03.001")).not.toBeInTheDocument();
  });
});


/**
 * F-BLMPUAN — "İşçiler & Puantaj" sekmesi + "Bu Bölümdeki İşçiler" kartı.
 *
 * 🔑 "Sekme canlı mı" sorusu DOM'dan cevaplanır (F-IZN kanonu: bir yüzeyin
 * ölüden canlıya geçtiğini görsel kapı KANITLAMAZ).
 */
describe("SectionDetailView — İşçiler & Puantaj sekmesi (F-BLMPUAN)", () => {
  beforeEach(() => vi.clearAllMocks());

  async function openTimesheetTab() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "İşçiler & Puantaj" }));
    return screen.getByRole("tabpanel");
  }

  it("sekme YER TUTUCU DEĞİL gerçek matris basar", async () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const panel = await openTimesheetTab();
    expect(within(panel).getByTestId("section-timesheet")).toBeInTheDocument();
    expect(within(panel).queryByText(/henüz görüntülenemiyor/)).not.toBeInTheDocument();
    expect(within(panel).queryByText(/bu bölüme henüz kırılmıyor/)).not.toBeInTheDocument();
  });

  it("🔴 puantaj verisi BÖLÜM SÜZGECİYLE istenir — süzgeçsiz çağrı şantiyenin tamamını basardı", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(useTimesheetData).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: SITE_ID, sectionId: SECTION_ID }),
    );
  });

  it("🔴 K2 KORUNUR: süzgeç GÖRÜNÜMDEDİR, dönem hep verilir", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const input = vi.mocked(useTimesheetData).mock.calls[0][0];
    expect(input.period.year).toBeGreaterThan(2000);
    expect(input.period.month).toBeGreaterThanOrEqual(1);
    expect(input.period.month).toBeLessThanOrEqual(12);
  });

  it("başka bölümün satırı matriste GÖRÜNMEZ (süzgeç gerçekten süzüyor)", async () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const panel = await openTimesheetTab();
    // Zeki Dur'un TEK hücresi `sec-other`da; satırı kartoteksten gelir ama
    // saati bu bölüme SAYILMAZ ve işçi sayımına GİRMEZ.
    // 🔴 ADAM-GÜN BASILMAZ (PUAN-SAAT): aylık uç bölen olan `normal_day_hours`u
    // yayınlamıyor; uydurulacağına ekranda ölçülen büyüklük (saat) basılır.
    expect(panel.querySelector(".ts-summary__metrics")).toHaveTextContent("27 saat");
    expect(within(panel).getByText("3 işçi")).toBeInTheDocument();
  });

  // 🔴 SALT OKUNURLUK BIR IS KURALIDIR (K2): `PUT .../timesheet` DONEM+SANTIYE
  // kapsaminda DEGISTIRMEDIR; bolum kapsamli bir yuzeyden yazmak diger
  // bolumlerin kayitlarini SILME riskini bu ekrana tasir. Bekci hucrelerin
  // DUZENLENEBILIR OLMADIGINI olcer — yalnizca "Kaydet yok" demek yetmez,
  // hucre popover'i tek basina yazma yoludur.
  // 🔴 EKRANDA AY GEZINMESI YOK (mockup cizmiyor) — hangi ayin gosterildigi
  // BASKA HICBIR YERDEN okunamaz. Donem basliktan dusurse ekran, kullanicinin
  // bilmedigi bir ayin matrisini "bu bolumun puantaji" diye basar.
  it("ozet seridi BOLUM ADINI ve DONEMI birlikte tasir", async () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const panel = await openTimesheetTab();
    const title = panel.querySelector(".ts-summary__title");
    expect(title).toHaveTextContent(BASE_SECTION.name);
    expect(title).toHaveTextContent(formatPeriod(TS_PERIOD.year, TS_PERIOD.month));
  });

  it("salt okunurdur — Kaydet/Excel BASILMAZ ve HUCRELER DUZENLENEMEZ", async () => {
    mockPermission("full");
    mockQueries();
    renderView();
    const panel = await openTimesheetTab();
    expect(within(panel).queryByRole("button", { name: "Kaydet" })).not.toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Excel" })).not.toBeInTheDocument();
    expect(within(panel).queryAllByRole("button", { name: /puantajı$/ })).toHaveLength(0);
    expect(panel.querySelectorAll(".ts-cell-button")).toHaveLength(0);
  });

  it("yüklenirken boş matris BASILMAZ — 'kimse çalışmadı' yalanı söylenmez", async () => {
    mockPermission("view");
    mockQueries();
    mockTimesheet({ isLoading: true, matrix: undefined });
    renderView();
    const panel = await openTimesheetTab();
    expect(within(panel).getByText("Yükleniyor…")).toBeInTheDocument();
    expect(within(panel).queryByTestId("section-timesheet")).not.toBeInTheDocument();
  });

  it("hata sessizce boş matrise DÜŞMEZ", async () => {
    mockPermission("view");
    mockQueries();
    mockTimesheet({ isError: true, matrix: undefined });
    renderView();
    const panel = await openTimesheetTab();
    expect(within(panel).getByText("Puantaj matrisi yüklenemedi")).toBeInTheDocument();
    expect(within(panel).queryByTestId("section-timesheet")).not.toBeInTheDocument();
  });

  it("öbür sekmeler HÂLÂ gerekçeli yer tutucu basar (canlılık sızmaz)", async () => {
    const user = userEvent.setup();
    mockPermission("view");
    mockQueries();
    renderView();
    // 🔴 STOK-BOLUM: "Malzeme" de CANLIYA geçti. Bekçinin ASIL işi SIZINTIDIR
    // (puantaj matrisi başka sekmeye sızmasın) ve o KORUNUR.
    await user.click(screen.getByRole("tab", { name: "Malzeme" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByTestId("section-stock")).toBeInTheDocument();
    expect(within(panel).queryByTestId("section-timesheet")).not.toBeInTheDocument();
  });
});

describe("SectionDetailView — 'Bu Bölümdeki İşçiler' kartı (F-BLMPUAN, D215-250)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("gerçek gruplanmış satırlar basılır, yer tutucu kart DEĞİL", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const rows = screen.getAllByTestId("section-workers-row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "ŞirketKalıpçı2 kişi",
      "TaşeronDemirci — Akın İnşaat1 kişi",
    ]);
    expect(screen.queryByText(/Puantaj verisi bu bölümde henüz görüntülenemiyor/)).not.toBeInTheDocument();
  });

  // 🔴 ROZET RENGI MOCKUP'TAN: D221 mavi (Şirket) · D228 amber (Taşeron).
  // Tek renk basilirsa rozet kaynak bilgisini TASIMAZ ve metinle celisir.
  it("rozet rengi kaynaga gore AYRISIR (D221 mavi · D228 amber)", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    const [company, sub] = screen.getAllByTestId("section-workers-row");
    expect(company.querySelector(".badge")).toHaveClass("badge--primary");
    expect(sub.querySelector(".badge")).toHaveClass("badge--warning");
  });

  it("başka bölümün işçisi bu karta SIZMAZ", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.queryByText(/Boyacı/)).not.toBeInTheDocument();
  });

  // 🔴 BOŞ VERİ ≠ MODÜL YOK. Boş kart "bu bölüme kırılmıyor" DEMEZ.
  it("kayıt yokken 'bu ay kayıt yok' der — 'modül yok' DEMEZ", () => {
    mockPermission("view");
    mockQueries();
    mockTimesheet({ matrix: undefined });
    renderView();
    const empty = screen.getByTestId("section-workers-empty");
    expect(empty).toHaveTextContent(/döneminde bu bölümde puantaj kaydı yok/);
    // Boş hâl HANGİ AY olduğunu söyler — "kayıt yok" tek başına yarım bilgidir.
    expect(empty).toHaveTextContent(formatPeriod(TS_PERIOD.year, TS_PERIOD.month));
    expect(empty).not.toHaveTextContent(/kırılmıyor/);
    expect(empty).not.toHaveTextContent(/henüz görüntülenemiyor/);
    expect(empty).not.toHaveTextContent(/modülle birlikte gelir/);
  });

  it("boş hâl bile 'Puantaj →' bağlantısını KORUR (sekme onun yerine geçmez)", () => {
    mockPermission("view");
    mockQueries();
    mockTimesheet({ matrix: undefined });
    renderView();
    expect(screen.getByRole("link", { name: "Puantaj →" })).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/puantaj?section=${SECTION_ID}`,
    );
  });

  it("yükleme ve hata dalları AYRI basılır", () => {
    mockPermission("view");
    mockQueries();
    mockTimesheet({ isLoading: true, matrix: undefined });
    const { unmount } = renderView();
    expect(screen.queryByTestId("section-workers-empty")).not.toBeInTheDocument();
    unmount();

    vi.clearAllMocks();
    mockPermission("view");
    mockQueries();
    mockTimesheet({ isError: true, matrix: undefined });
    renderView();
    expect(screen.getByText("Puantaj verisi yüklenemedi")).toBeInTheDocument();
    expect(screen.queryByTestId("section-workers-empty")).not.toBeInTheDocument();
  });

  // kalan-4 #280: `isPersonnelUnavailable`/`personnelTruncation` HİÇ
  // tüketilmiyordu — kartoteks okunamazsa ya da 200 tavanında kırpılırsa
  // kart sessizce eksik satır basıyordu, hiçbir uyarı yoktu. Kardeş ekran
  // (`TimesheetWeekScreen` + `TimesheetNotices`) AYNI alanları görünür
  // uyarıya çevirir.
  it("personel kartoteksi okunamayınca GÖRÜNÜR bir uyarı basılır", () => {
    mockPermission("view");
    mockQueries();
    mockTimesheet({ isPersonnelUnavailable: true });
    renderView();
    expect(screen.getByTestId("section-workers-personnel-notice")).toHaveTextContent(
      "Personel kartoteksi okunamadı",
    );
  });

  it("personel kartoteksi KIRPILINCA GÖRÜNÜR bir uyarı basılır", () => {
    mockPermission("view");
    mockQueries();
    mockTimesheet({
      personnelTruncation: { isTruncated: true, shownCount: 200, totalCount: 240 },
    });
    renderView();
    expect(screen.getByTestId("section-workers-personnel-notice")).toBeVisible();
  });

  it("personel kartoteksi TAM okununca uyarı BASILMAZ", () => {
    mockPermission("view");
    mockQueries();
    renderView();
    expect(screen.queryByTestId("section-workers-personnel-notice")).not.toBeInTheDocument();
  });
});

// Kayıt 255 — kaynak düzeyi bekçi: bölüm stok sorgusu KATALOG sabitine
// (`STOCK_LIST_MAX_LIMIT`) değil kendi bağımsız sabitine
// (`SECTION_STOCK_LIST_MAX_LIMIT`) bağlanır. İki uç BAĞIMSIZDIR; katalog
// sabiti burada kullanılsaydı biri değişince diğeri sessizce sürüklenirdi.
describe("SectionDetailView — bölüm stok tavanı katalog sabitinden BAĞIMSIZ (kayıt 255, kaynak düzeyi)", () => {
  it("SECTION_STOCK_LIST_MAX_LIMIT kullanır, STOCK_LIST_MAX_LIMIT'i İTHAL ETMEZ", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/section-detail/SectionDetailView.tsx"),
      "utf8",
    );
    expect(source).toMatch(/SECTION_STOCK_LIST_MAX_LIMIT/);
    expect(source).not.toMatch(/from "@\/lib\/api\/hooks\/useStockItems"/);
  });
});
