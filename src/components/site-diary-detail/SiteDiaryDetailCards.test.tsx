import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { SiteDiaryDetailView } from "./SiteDiaryDetailView";
import type { DiaryDetailExtension } from "./detail-extension";
import { useSiteDiaryEntry, type SiteDiaryEntryDetail, type SiteDiaryLineRead } from "@/lib/api/hooks/useSiteDiary";
import { useSection } from "@/lib/api/hooks/useSection";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import { diaryMe } from "../site-diary/diary-session.testkit";

// DET-1.3 · Günlük kayıt detayının KARTLARI + KPI + uzantı yuvası.
// Mockup: `projedesign/Şantiye - Günlük Kayıt Detay (Salt Okunur).dc.html`.

vi.mock("@/lib/api/hooks/useSiteDiary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteDiary")>()),
  useSiteDiaryEntry: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSection")>()),
  useSection: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "guneskent", siteId: "a-blok", sectionId: "kat-6-10", entryId: "e-24" }),
}));

function line(overrides: Partial<SiteDiaryLineRead>): SiteDiaryLineRead {
  return {
    id: "l",
    boq_item_id: "boq-kalip",
    code: "KAB.01.01",
    description: "Kalıp",
    unit: "m²",
    unit_price: "185.00",
    quantity: "93.000",
    cumulative_quantity: "1273.000",
    leaf_cumulative_quantity: null,
    planned_quantity: "5300.000",
    remaining_quantity: "4027.000",
    line_amount: "17205.00",
    overrun_reason: null,
    section_id: "sec-uuid",
    section_name: "Kat 6–10",
    ...overrides,
  };
}

const LINES = [
  line({ id: "o1", boq_item_id: "boq-priz", code: "ELK.01.02", description: "Buat/priz montajı", section_id: "k15", section_name: "Kat 1–5", quantity: "22", cumulative_quantity: "1212", planned_quantity: "1200", remaining_quantity: "-12", line_amount: "2090.00", overrun_reason: "proje revizyonu, ilave priz" }),
  line({ id: "c1" }),
  line({ id: "c2", boq_item_id: "boq-demir", code: "KAB.01.02", description: "Demir", unit: "ton", line_amount: "73100.00" }),
];

function entry(overrides: Partial<SiteDiaryEntryDetail> = {}): SiteDiaryEntryDetail {
  return {
    id: "e-24",
    site_id: "s-uuid",
    project_id: "p-uuid",
    entry_date: "2026-09-24",
    section_id: "sec-uuid",
    status: "submitted",
    created_at: "2026-09-24T05:12:00Z",
    created_by: "u-1",
    updated_at: "2026-09-24T15:40:00Z",
    lines: LINES,
    lines_total: "92395.00",
    site_name: "A-Blok Şantiyesi",
    project_name: "Güneşkent Konut",
    section_name: "Kat 6–10 Kaba İnşaat",
    created_by_name: "Hasan Kaya",
    submitted_at: "2026-09-24T15:40:00Z",
    submitted_by: "u-2",
    submitted_by_name: "Sercan Öztürk",
    locked: false,
    lock_report_date: null,
    prev_id: null,
    prev_entry_date: null,
    next_id: null,
    next_entry_date: null,
    work_done: "Kat 8 döşeme kalıbı devam (93 m²).",
    chief_note: null,
    weather: "partly_cloudy",
    temp_min_c: "17.0",
    temp_max_c: "28.0",
    wind_ms: "4.2",
    safety_meeting_held: true,
    ppe_checked: true,
    has_incident: false,
    incident_note: null,
    own_crew_from_timesheet: [{ trade: "Kalıpçı", source: "company", headcount: 8, hours: "74.00" }],
    worker_counts: [
      { id: "w1", trade: "Kaya", source: "subcontractor", count: 7, hours: "8.0", subcontractor_id: "s1", subcontractor_name: "Kaya Duvar" },
    ],
    worker_total: 15,
    ...overrides,
  } satisfies SiteDiaryEntryDetail;
}

function mockSession(permissions: Record<string, string>) {
  vi.mocked(useSession).mockReturnValue({
    me: diaryMe(permissions) as never,
    isLoading: false,
  });
}

function mockEntry(data: SiteDiaryEntryDetail) {
  vi.mocked(useSiteDiaryEntry).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
}

/** S10 · tutar backend'den MASKELİ (null) gelmiş kayıt — gizleme veriye bağlı. */
function mockMaskedEntry() {
  // Kasıtlı tip dışı değer: şema `lines_total: string` der, alan maskesi ise `null`
  // döndürür — sözleşmenin DIŞINDAKİ gerçek yanıt ancak cast ile kurulur.
  mockEntry(entry({ lines_total: null as unknown as string }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession({ site_diary: "view", progress_payments: "view" });
  vi.mocked(useSite).mockReturnValue({ data: { id: "s-uuid", name: "A-Blok Şantiyesi" }, isError: false } as never);
  vi.mocked(useSection).mockReturnValue({
    data: { id: "sec-uuid", name: "Kat 6–10 Kaba İnşaat" },
    isError: false,
  } as never);
  mockEntry(entry());
});

function linesTable() {
  return within(screen.getByRole("region", { name: "📋 Yapılan Miktarlar" })).getByRole("table");
}

/** Kolon başlıkları — yalnız `thead` (grup ayırıcıları da `th`dir ama kolon değildir). */
function columnHeaders(): (string | null)[] {
  const [head] = within(linesTable()).getAllByRole("rowgroup");
  return within(head).getAllByRole("columnheader").map((th) => th.textContent);
}

describe("detay kartları — uzantı YOKKEN (planlamasız şantiye · hâl h) kartlar TAM", () => {
  it("Yapılan İşler · Şef notu (boş → —) · Temel Bilgiler & Hava · İş Güvenliği · İşçi · Fotoğraf", () => {
    render(<SiteDiaryDetailView />);

    expect(screen.getByRole("region", { name: "📝 Yapılan İşler" })).toHaveTextContent("Kat 8 döşeme kalıbı devam (93 m²).");
    expect(screen.getByRole("region", { name: "Şantiye Şefi Notu" })).toHaveTextContent("—");
    const basic = screen.getByRole("region", { name: "📅 Temel Bilgiler & Hava" });
    expect(basic).toHaveTextContent("Parçalı bulutlu");
    expect(basic).toHaveTextContent("Başlık bölümüKat 6–10 Kaba İnşaat");
    expect(basic).toHaveTextContent("4,2");
    expect(basic).toHaveTextContent("~ 15 km/sa");
    const safety = screen.getByRole("region", { name: "⛑ İş Güvenliği" });
    expect(safety).toHaveTextContent("Sabah İSG toplantısı yapıldı");
    expect(safety).toHaveTextContent("Ramak kala / kaza yok");
    // S7 — işçi dağılımı şantiyenin günün tümüdür
    const workers = screen.getByRole("region", { name: "👷 Bugünkü İşçi Dağılımı" });
    expect(workers).toHaveTextContent("günün tümü (şantiye)");
    expect(workers).toHaveTextContent("Kaya Duvar");
    // S11 — fotoğraf kartı devre dışı notla
    expect(screen.getByRole("region", { name: "📷 Şantiye Fotoğrafları" })).toHaveTextContent(
      "Fotoğraf görüntüleme henüz açılmadı — Belge verisi bu yüzeye henüz bağlanmadı.",
    );
  });

  it("salt okunur = düz metin: sayfada GİRDİ yok", () => {
    const { container } = render(<SiteDiaryDetailView />);

    expect(container.querySelector("input, textarea, select")).toBeNull();
  });

  it("miktar tablosu çekirdek kolonları: planlama kolonu YOK, Hakediş ₺ VAR; günün toplamı satırı YOK", () => {
    render(<SiteDiaryDetailView />);

    const headers = columnHeaders();
    expect(headers).toEqual(["Kalem / bölüm", "Birim", "Bugün", "Kümülatif", "Planlı", "Kalan", "Hakediş ₺"]);
    expect(screen.queryByText(/Günün toplamı/)).not.toBeInTheDocument();
    expect(screen.getByText("Bugünkü Hakediş Katkısı")).toBeInTheDocument();
  });

  it("KPI: miktar satırı (bu bölüm / tümü) · hakediş katkısı · işçi — planlama kutusu YOK", () => {
    render(<SiteDiaryDetailView />);

    const kpis = screen.getByTestId("diary-detail-kpis");
    const labels = within(kpis).getAllByRole("term").map((dt) => dt.textContent);
    expect(labels).toEqual(["Miktar satırı", "Hakediş katkısı", "İşçi"]);
    expect(kpis).toHaveTextContent("2 / 3");
    expect(kpis).toHaveTextContent("₺90.305");
    expect(kpis).toHaveTextContent("günün tümü ₺92.395");
    expect(kpis).toHaveTextContent("15");
    expect(kpis).toHaveTextContent("8 kendi · 7 taşeron");
  });
});

describe("Kural A — önce bu bölüm, sonra diğer bölümler", () => {
  it("'Bu bölüm' ayırıcısı + satırları + ara toplam ÖNCE; 'Diğer bölümler' ayırıcısı ve soluk satırlar SONRA", () => {
    render(<SiteDiaryDetailView />);

    const rows = within(linesTable()).getAllByRole("row").map((tr) => tr.textContent ?? "");
    const indexOf = (text: string) => rows.findIndex((row) => row.includes(text));
    expect(indexOf("Bu bölüm · Kat 6–10 Kaba İnşaat · 2 satır")).toBeGreaterThan(0);
    expect(indexOf("Kalıp")).toBeGreaterThan(indexOf("Bu bölüm ·"));
    expect(indexOf("Ara toplam")).toBeGreaterThan(indexOf("Demir"));
    expect(indexOf("Diğer bölümler · aynı gün · 1 satır")).toBeGreaterThan(indexOf("Ara toplam"));
    expect(indexOf("Buat/priz montajı")).toBeGreaterThan(indexOf("Diğer bölümler"));

    const other = within(linesTable()).getByText("Buat/priz montajı").closest("tr");
    expect(other).toHaveClass("diary-detail-lines__row--other");
  });

  it("ara toplam bu bölümün Hakediş ₺'si; katkı satırı 'bu bölüm … · tüm bölümler' + lines_total", () => {
    render(<SiteDiaryDetailView />);

    const subtotal = within(linesTable()).getByText("Ara toplam").closest("tr") as HTMLElement;
    expect(subtotal).toHaveTextContent("90.305");
    const contribution = within(linesTable()).getByText("Bugünkü Hakediş Katkısı").closest("tr") as HTMLElement;
    expect(contribution).toHaveTextContent("bu bölüm ₺90.305 · tüm bölümler");
    expect(contribution).toHaveTextContent("₺ 92.395");
  });

  it("aşım alt satırı gerekçeyi DÜZ METİN basar (İ:236-237)", () => {
    render(<SiteDiaryDetailView />);

    expect(screen.getByText("Aşım · 1.212 / 1.200 m² (+12)")).toBeInTheDocument();
    expect(screen.getByText("Gerekçe: proje revizyonu, ilave priz")).toBeInTheDocument();
  });

  it("bu bölümde satır yoksa boş gövde + altında diğerleri (hâl k)", () => {
    mockEntry(entry({ lines: [LINES[0]] }));
    render(<SiteDiaryDetailView />);

    expect(within(linesTable()).getByText("Bu gün miktar satırı girilmemiş")).toBeInTheDocument();
    expect(within(linesTable()).getByText("Buat/priz montajı")).toBeInTheDocument();
    expect(screen.queryByText("Ara toplam")).not.toBeInTheDocument();
  });

  it("hiç satır yoksa kart kalır, tablo/katkı/hakediş bandı basılmaz", () => {
    mockEntry(entry({ lines: [], lines_total: "0.00" }));
    render(<SiteDiaryDetailView />);

    const card = screen.getByRole("region", { name: "📋 Yapılan Miktarlar" });
    expect(card).toHaveTextContent("Bu gün miktar satırı girilmemiş");
    expect(within(card).queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Hakediş Durumu")).not.toBeInTheDocument();
  });
});

describe("S10 — Hakediş ₺ İZNE bağlı DEĞİL (kullanıcı kararı: izin işleri sonra); yalnız tutar null ise gizli", () => {
  it("hakediş izni olmayan kullanıcı da ₺'yi görür — günlük kayıt ekranıyla aynı", () => {
    mockSession({ site_diary: "view", progress_payments: "none" });
    render(<SiteDiaryDetailView />);

    expect(columnHeaders()).toContain("Hakediş ₺");
    expect(screen.getByText("Bugünkü Hakediş Katkısı")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("17.205");
  });

  it("tutar null gelirse kolon, hücreler, ara toplam tutarı, katkı satırı, KPI ve hakediş bandı basılmaz", () => {
    mockSession({ site_diary: "view", progress_payments: "view" });
    mockMaskedEntry();
    render(<SiteDiaryDetailView />);

    expect(columnHeaders()).not.toContain("Hakediş ₺");
    expect(screen.queryByText("Bugünkü Hakediş Katkısı")).not.toBeInTheDocument();
    expect(screen.queryByText("Hakediş katkısı")).not.toBeInTheDocument();
    expect(screen.queryByText("Hakediş Durumu")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("17.205");
    expect(document.body).not.toHaveTextContent("₺");
  });
});

describe("uzantı yuvası VARKEN", () => {
  const onContext = vi.fn();
  const extension: DiaryDetailExtension = {
    headerSuffix: "Gün 142 · H21",
    kpis: [
      { key: "earned", label: "Bugün kazanılmış", value: "251,9 a-s", note: "harcanan 243,0 a-s" },
      { key: "pf", label: "Bugün PF", value: "1,04", note: "kazanılmış ÷ harcanan" },
    ],
    lineColumns: {
      headers: [
        { key: "earned", label: "Bugün kaz. a-s", width: 76 },
        { key: "pf", label: "PF", width: 58 },
      ],
      renderCells: (line) => [`kaz-${line.lineId}`, `pf-${line.lineId}`],
      renderSubRow: (line) => (line.lineId === "c2" ? <span>Bu kaleme oran atanmamış</span> : null),
      renderSectionSubtotal: (sectionId) => ({ note: `harcanan-${sectionId}`, cells: ["sub-kaz", "sub-pf"] }),
      dayTotal: { label: "Günün toplamı (tüm bölümler)", cells: ["gun-kaz", "gun-pf"] },
      captionSuffix: "kazanılmış = bugün miktar × birim oran (Rev 1)",
      renderLineTag: (line) => (line.lineId === "c1" ? "Kendi" : null),
    },
    fullWidthBlock: <section aria-label="Saat Dağıtımı · özet">özet</section>,
  };

  it("bağlamı bildirir: kanonik şantiye + gün + kayıt + bölüm + (yalnız düzenleyebilene) açma hedefi", () => {
    render(<SiteDiaryDetailView extension={extension} onExtensionContext={onContext} />);

    expect(onContext).toHaveBeenLastCalledWith({
      siteId: "s-uuid",
      day: "2026-09-24",
      entryId: "e-24",
      currentSectionId: "sec-uuid",
      currentSectionName: "Kat 6–10 Kaba İnşaat",
      openHref: undefined,
    });
  });

  it("yazabilen + kilitsiz günde açma hedefi bağlama girer (S8)", () => {
    mockSession({ site_diary: "full", progress_payments: "view" });
    render(<SiteDiaryDetailView extension={extension} onExtensionContext={onContext} />);

    expect(onContext).toHaveBeenLastCalledWith(
      expect.objectContaining({ openHref: "/projeler/guneskent/santiyeler/a-blok/gunluk-kayit" }),
    );
  });

  it("kolonlar Hakediş ₺'den ÖNCE; satır/ara toplam/gün toplamı hücreleri; oransız alt satır; kod satırında etiket", () => {
    render(<SiteDiaryDetailView extension={extension} />);

    const table = linesTable();
    const headers = columnHeaders();
    expect(headers.slice(-3)).toEqual(["Bugün kaz. a-s", "PF", "Hakediş ₺"]);
    expect(within(table).getByText("kaz-c1")).toBeInTheDocument();
    expect(within(table).getByText("pf-o1")).toBeInTheDocument();
    const subtotal = within(table).getByText("Ara toplam").closest("tr") as HTMLElement;
    expect(subtotal).toHaveTextContent("harcanan-sec-uuid");
    expect(subtotal).toHaveTextContent("sub-kaz");
    const dayTotal = within(table).getByText("Günün toplamı (tüm bölümler)").closest("tr") as HTMLElement;
    expect(dayTotal).toHaveTextContent("gun-kazgun-pf");
    expect(within(table).getByText("Bu kaleme oran atanmamış")).toBeInTheDocument();
    expect(within(table).getByText(/KAB\.01\.01 · Kat 6–10 · Kendi · ₺185\/m²/)).toBeInTheDocument();
    expect(screen.getByText(/kazanılmış = bugün miktar × birim oran \(Rev 1\)/)).toBeInTheDocument();
  });

  it("KPI kutuları 'Miktar satırı'ndan SONRA; başlık eki meta satırında; Saat Dağıtımı bloğu basılır", () => {
    render(<SiteDiaryDetailView extension={extension} />);

    const labels = within(screen.getByTestId("diary-detail-kpis")).getAllByRole("term").map((dt) => dt.textContent);
    expect(labels).toEqual(["Miktar satırı", "Bugün kazanılmış", "Bugün PF", "Hakediş katkısı", "İşçi"]);
    expect(screen.getByTestId("diary-detail-meta")).toHaveTextContent(/Güneşkent Konut · Gün 142 · H21$/);
    expect(screen.getByRole("region", { name: "Saat Dağıtımı · özet" })).toBeInTheDocument();
  });

  it("S10 maskede (tutar null) planlama kolonları KALIR, yalnız Hakediş ₺ gider", () => {
    mockSession({ site_diary: "view", progress_payments: "view" });
    mockMaskedEntry();
    render(<SiteDiaryDetailView extension={extension} />);

    const headers = columnHeaders();
    expect(headers.slice(-2)).toEqual(["Bugün kaz. a-s", "PF"]);
    expect(within(linesTable()).getByText(/KAB\.01\.01 · Kat 6–10 · Kendi$/)).toBeInTheDocument();
  });
});
