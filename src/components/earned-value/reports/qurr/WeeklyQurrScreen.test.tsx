import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import { downloadWeeklyXlsx, useWeeklyReport } from "@/lib/api/hooks/useEvReports";

import type { EvQurrReport, EvQurrRow } from "@/lib/api/models";

import type { ReportScreenProps } from "../kit/report-screen";
import { QURR_FIXTURE_EMPTY, QURR_FIXTURE_READY } from "./qurr-fixtures";
import { WeeklyQurrScreen } from "./WeeklyQurrScreen";

/**
 * CEO denetimi (B/i) tanığı: ekran ve yazdırma AYNI hücre için AYNI metni
 * üretmeli. "1,005" narrow-digit birim oran sınırında (`formatUnitRate`
 * ROUND_HALF_UP → "1,01"; `Number(...).toFixed(2)` → "1,00" YANLIŞ) — bu
 * satır tek başına raporun tamamı, `buildQurrTree` `parent_id: null`
 * yaprağı üst düzeyde bırakır.
 */
const BOUNDARY_ROW: EvQurrRow = {
  a_prev_qty: null,
  b_qty: null,
  c_qty_cum: null,
  changed_budget: false,
  changed_qty: false,
  changed_rate: false,
  code: "BND.01",
  contractor_type: null,
  d_remaining_qty: null,
  e_qty_week: null,
  f_prev_budget_mhr: null,
  g_budget_mhr: "0",
  h_earned_cum: "0",
  i_spent_cum: "0",
  is_direct: true,
  j_remaining_mhr: "0",
  k_earned_week: "0",
  l_spent_week: "0",
  level: 3,
  m_prev_unit_mhr: null,
  n_unit_mhr: "1.005",
  name: "Sınır Kalemi",
  node_id: "boundary-row",
  o_actual_unit_mhr_cum: null,
  p_actual_unit_mhr_week: null,
  parent_id: null,
  q_band: null,
  q_pf_cum: null,
  r_band: null,
  r_pf_week: null,
  uom: "m²",
};

const BOUNDARY_REPORT: EvQurrReport = {
  ...QURR_FIXTURE_READY,
  rows: [BOUNDARY_ROW],
  totals: [],
};

vi.mock("@/lib/api/hooks/useEvReports", () => ({
  useWeeklyReport: vi.fn(),
  downloadWeeklyXlsx: vi.fn(),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => searchParams,
}));

function queryStub(over: Partial<ReturnType<typeof useWeeklyReport>> = {}) {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof useWeeklyReport>;
}

const LINKS: ReportScreenProps["links"] = {
  diary: (day) => `/gunluk-kayit${day ? `?tarih=${day}` : ""}`,
  budget: "/butce",
  dailyReport: (date) => `/gunluk-rapor${date ? `?tarih=${date}` : ""}`,
  weeklyReport: (week) => `/haftalik-qurr${week ? `?hafta=${week}` : ""}`,
  panel: "/panel",
};

function baseProps(): ReportScreenProps {
  return {
    siteId: "site-1",
    siteName: "A-Blok Şantiyesi",
    companyName: "FİİL Yapı",
    projectName: "Güneşkent Konut",
    siteCompleted: false,
    links: LINKS,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams("hafta=21");
});

describe("WeeklyQurrScreen", () => {
  it("yükleniyor durumunda iskelet basar", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ isPending: true }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("veri dolu haftada KPI kartlarını, paçal kartlarını ve tabloyu basar", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);

    expect(screen.getByText("Haftalık Miktar & Birim Oran Raporu")).toBeInTheDocument();
    expect(screen.getByText("QURR tablosu · Hafta 21")).toBeInTheDocument();
    expect(screen.getAllByText("Kalıp").length).toBeGreaterThan(0);
    expect(screen.getByText("Kaba İnşaat")).toBeInTheDocument();
    expect(screen.getByText("1 m³ beton başına toplam betonarme a-s")).toBeInTheDocument();
  });

  /**
   * FIX-F2 · Ajan B ek madde — dipnottaki "Günlük İlerleme Raporu →" bağlantısı
   * `next/link`in `Link`iyle client-taraflı geçiş yapmalı (ham `<a href>` tam
   * sayfa yenilemesine yol açar). jsdom'da `Link` de `<a>` üretir — bu test
   * yalnız href doğruluğunu ölçer; "ham `<a>` mı Link mi" ayrımı statik
   * ölçümle (kaynak taramasıyla) doğrulanır, bkz. Ajan B raporu.
   */
  it("dipnottaki 'Günlük İlerleme Raporu →' bağlantısı hafta sonu tarihine gider", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    const link = screen.getByRole("link", { name: "Günlük İlerleme Raporu →" });
    expect(link).toHaveAttribute("href", `/gunluk-rapor?tarih=${QURR_FIXTURE_READY.week_end}`);
  });

  it("veri yok haftasında boş durum kartı basar, tablo YOK, son geçerli haftaya dönüş düğmesi var", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_EMPTY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.getByText("Hafta 22 için veri yok")).toBeInTheDocument();
    expect(screen.queryByText(/QURR tablosu/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("← Hafta 21'e dön"));
    expect(replaceMock).toHaveBeenCalledWith("?hafta=21", { scroll: false });
  });

  it("baseline yok (409) → ErrorCard, tekrar dene yerine bilgi kartı", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(
      queryStub({
        isError: true,
        error: new BackendError(409, { detail: "Şantiyede aktif (dondurulmuş) baseline yok" }),
      }),
    );
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.getByText("Şantiyede aktif baseline yok")).toBeInTheDocument();
  });

  it("hafta takvimde yok (404) → ErrorCard, \"Güncel haftaya dön\" hafta parametresini siler", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(
      queryStub({
        isError: true,
        error: new BackendError(404, { detail: "Hafta proje takviminde yok" }),
      }),
    );
    render(<WeeklyQurrScreen {...baseProps()} />);
    fireEvent.click(screen.getByText("Güncel haftaya dön"));
    expect(replaceMock).toHaveBeenCalledWith("?", { scroll: false });
  });

  it("hafta oku ile onChange URL'i günceller (last_week_no=21 → sonraki pasif, önceki aktif)", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.getByLabelText("Sonraki hafta")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Önceki hafta"));
    expect(replaceMock).toHaveBeenCalledWith("?hafta=20", { scroll: false });
  });

  it("Excel indir düğmesi downloadWeeklyXlsx'i doğru hafta ile çağırır, başarı toast'ı basar", async () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    vi.mocked(downloadWeeklyXlsx).mockResolvedValue(undefined);
    render(<WeeklyQurrScreen {...baseProps()} />);
    fireEvent.click(screen.getByText("Excel indir"));
    await waitFor(() => expect(downloadWeeklyXlsx).toHaveBeenCalledWith("site-1", 21));
    await waitFor(() => expect(screen.getByText("QURR-H21.xlsx hazırlandı")).toBeInTheDocument());
  });

  it("\"Yazdır / PDF\" düğmesi yazdırma görünümünü açar ve window.print() çağırır (§7 S16)", async () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<WeeklyQurrScreen {...baseProps()} />);
    fireEvent.click(screen.getByText("Yazdır / PDF"));
    await waitFor(() => expect(printSpy).toHaveBeenCalled());
    expect(screen.getByText("A4 yatay · 1 sayfa · 18 kolon sayfaya sığdırıldı")).toBeInTheDocument();
    // LİDER madde 2 — yazdırma başlığı: firma · proje · şantiye (Q:210).
    expect(screen.getByText("FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi")).toBeInTheDocument();
    // LİDER 3. tur — paçal etiketi YALNIZ composite.name (S-? CEO onayı bekliyor).
    expect(screen.getAllByText("1 m³ beton başına toplam betonarme a-s").length).toBeGreaterThan(0);
    printSpy.mockRestore();
  });

  it("Ekran / Yazdırma önizlemesi anahtarı görünümü değiştirir", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.getByText("QURR tablosu · Hafta 21")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Yazdırma önizlemesi" }));
    expect(screen.queryByText("QURR tablosu · Hafta 21")).not.toBeInTheDocument();
    expect(screen.getByText("QURR-H21")).toBeInTheDocument();
  });

  it("İki ayrı yapışkan kolon: Kod ve İş tipi (mockup birebir)", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.getByRole("columnheader", { name: "Kod" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "İş tipi" })).toBeInTheDocument();
    expect(screen.getAllByText("KAB.01.01").length).toBeGreaterThan(0);
    // Ara toplam satırında da kod basılır.
    expect(screen.getAllByText("Σ D").length).toBeGreaterThan(0);
  });

  // LİDER DENETİMİ (kırpılma turu — son iş): kırpılabilen `qurr-item__name`
  // (sıradan satır VE Σ D+DL toplam satırı) `title`de TAM adı taşımalı ki
  // fareyle üstüne gelince (CSS ellipsis kırpsa bile) okunabilsin.
  it("kırpılabilen ad hücreleri title'da TAM metni taşır (sıradan satır + Σ D+DL)", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.getByText("Kalıp")).toHaveAttribute("title", "Kalıp");
    expect(screen.getByText("Doğrudan + Dolaylı toplam")).toHaveAttribute(
      "title",
      "Doğrudan + Dolaylı toplam",
    );
  });

  // LİDER DENETİMİ: `changed_rate`→"m" eşlemesi "n" yapılınca hiçbir qurr testi
  // kırmızı olmadı — ekran düzeyinde de bekçi yoktu. KAB.01.01'de
  // changed_qty=true, changed_budget=true, changed_rate=false (fikstür):
  // yalnız "a" (Önc. rev) ve "f" (Önc. bütçe) hücreleri sarı olmalı, "m"
  // (Önc. oran) OLMAMALI.
  it("değişen hücre yalnız KENDİ kolonunda sarı — komşu kolona sızmaz (Q:197)", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    const row = screen.getAllByRole("row").find((r) => within(r).queryByText("Kalıp") !== null);
    expect(row).toBeDefined();
    const cells = within(row!).getAllByRole("cell");
    // [0]=Kod, [1]=a, [6]=f, [13]=m — sıra QURR_COLUMNS (a..r) dizisiyle AYNI.
    expect(cells[1].querySelector(".qurr-cell--changed")).not.toBeNull(); // a — changed_qty
    expect(cells[6].querySelector(".qurr-cell--changed")).not.toBeNull(); // f — changed_budget
    expect(cells[13].querySelector(".qurr-cell--changed")).toBeNull(); // m — changed_rate=false
  });

  it('"Demir" satırında changed_rate=true → yalnız "m" sarı, "a" DEĞİL (Q:197)', () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    const row = screen.getAllByRole("row").find((r) => within(r).queryByText("Demir") !== null);
    expect(row).toBeDefined();
    const cells = within(row!).getAllByRole("cell");
    expect(cells[13].querySelector(".qurr-cell--changed")).not.toBeNull(); // m — changed_rate=true
    expect(cells[1].querySelector(".qurr-cell--changed")).toBeNull(); // a — changed_qty=false
  });

  it("kolon başlığına tıklayınca formül baloncuğu açılır/kapanır (Q:172-182)", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: QURR_FIXTURE_READY }));
    render(<WeeklyQurrScreen {...baseProps()} />);
    expect(screen.queryByText("q = h ÷ i")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Performans · bugüne kadar — formülü göster"));
    expect(screen.getByText("q = h ÷ i")).toBeInTheDocument();
    expect(screen.getByText("Kazanılmış ÷ harcanan")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Performans · bugüne kadar — formülü göster"));
    expect(screen.queryByText("q = h ÷ i")).not.toBeInTheDocument();
  });

  it("ekran ve yazdırma AYNI hücre için AYNI metni üretir (CEO B/i — yarım-yukarı sınırı 1,005)", () => {
    vi.mocked(useWeeklyReport).mockReturnValue(queryStub({ data: BOUNDARY_REPORT }));
    render(<WeeklyQurrScreen {...baseProps()} />);

    const screenRow = screen.getAllByRole("row").find((r) => within(r).queryByText("Sınır Kalemi") !== null);
    expect(screenRow).toBeDefined();
    const screenCells = within(screenRow!).getAllByRole("cell");
    expect(screenCells[14]).toHaveTextContent("1,01"); // n — 14. veri kolonu (Kod=0, a=1,…,n=14)
    expect(screenCells[14]).not.toHaveTextContent("1,00"); // tanık: float kalıntısı SIZMADI

    fireEvent.click(screen.getByRole("tab", { name: "Yazdırma önizlemesi" }));
    const printRow = screen.getAllByRole("row").find((r) => within(r).queryByText("Sınır Kalemi") !== null);
    expect(printRow).toBeDefined();
    const printCells = within(printRow!).getAllByRole("cell");
    // Print: [0]=Kod, [1]=İş tipi, [2]=a,…,[15]=n (İş tipi burada AYRI td, ekrandaki gibi th DEĞİL).
    expect(printCells[15]).toHaveTextContent("1,01");
    expect(printCells[15]).not.toHaveTextContent("1,00");
  });
});
