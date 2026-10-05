import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import type { usePanel } from "@/lib/api/hooks/useEvReports";
import type { AccessLevel } from "@/lib/auth/permissions";
import type { ReportScreenProps } from "@/components/earned-value/reports/kit/report-screen";

import { panelReportFixture } from "./panel-fixtures";
import { PanelScreen } from "./PanelScreen";

vi.mock("@/lib/api/hooks/useEvReports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvReports")>()),
  usePanel: vi.fn(),
}));

vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: vi.fn(),
}));

let searchParams = new URLSearchParams();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/planlama-paneli",
  useSearchParams: () => searchParams,
}));

const LINKS: ReportScreenProps["links"] = {
  diary: (day) => `/gunluk-kayit${day ? `?tarih=${day}` : ""}`,
  budget: "/butce",
  dailyReport: (date) => `/gunluk-rapor${date ? `?tarih=${date}` : ""}`,
  weeklyReport: (week) => `/haftalik-qurr${week ? `?hafta=${week}` : ""}`,
  panel: "/panel",
};

function baseProps(overrides: Partial<ReportScreenProps> = {}): ReportScreenProps {
  return {
    siteId: "site-1",
    siteName: "A-Blok Şantiyesi",
    companyName: "FİİL Yapı",
    projectName: "Güneşkent Konut",
    siteCompleted: false,
    links: LINKS,
    ...overrides,
  };
}

function queryStub(over: Partial<ReturnType<typeof usePanel>> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    ...over,
  } as unknown as ReturnType<typeof usePanel>;
}

function permissionStub(level: AccessLevel, canWrite = true) {
  return { level, canView: true, canWrite, canDelete: false };
}

import { usePanel as usePanelMocked } from "@/lib/api/hooks/useEvReports";
import { useModulePermission as usePermissionMocked } from "@/lib/auth/useModulePermission";

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.mocked(usePermissionMocked).mockReturnValue(permissionStub("full") as never);
});

describe("PanelScreen · başlık", () => {
  it("başlığı basar", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub());
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByRole("heading", { name: "Planlama Paneli" })).toBeInTheDocument();
  });

  /**
   * 🔴 PLN-F3.6b LİDER DENETİMİ KUSURU: mockup'ta başlık altında firma ·
   * proje · şantiye alt satırı YOK (kırıntı kabuğun işi) — POZİTİF KONTROL:
   * `companyName`/`projectName`/`siteName` doluyken bile bu metin BASILMAZ.
   */
  it("firma · proje · şantiye alt satırı HİÇ BASILMAZ (kırıntı zaten taşır)", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub());
    render(<PanelScreen {...baseProps()} />);
    expect(screen.queryByText("FİİL Yapı · Güneşkent Konut · A-Blok Şantiyesi")).toBeNull();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  it("kök ikizde picker basılır", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub());
    render(<PanelScreen {...baseProps({ picker: <button type="button">Şantiye seç</button> })} />);
    expect(screen.getByRole("button", { name: "Şantiye seç" })).toBeInTheDocument();
  });
});

describe("PanelScreen · hâl dalları", () => {
  it("siteId boş → 'site' hâli, filtre çubuğu YOK", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub());
    render(<PanelScreen {...baseProps({ siteId: "" })} />);
    expect(screen.getByText("Şantiye seçilmedi.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Gün gezgini" })).toBeNull();
  });

  it("403 → AccessDenied", () => {
    vi.mocked(usePanelMocked).mockReturnValue(
      queryStub({ isError: true, error: new BackendError(403, { detail: "Yetki yok" }) }),
    );
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("diğer hata → ErrorCard 'Tekrar dene' refetch tetikler", () => {
    const refetch = vi.fn();
    vi.mocked(usePanelMocked).mockReturnValue(
      queryStub({ isError: true, error: new BackendError(500, null), refetch }),
    );
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByText("Panel verisi alınamadı")).toBeInTheDocument();
    screen.getByRole("button", { name: "Tekrar dene" }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it("yükleniyor → PanelLoadingSkeleton", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ isLoading: true }));
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByText("Planlama Paneli yükleniyor")).toBeInTheDocument();
  });

  it("has_baseline=false → (a) baseline yok, bütçe linki links.budget'e gider", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture({ has_baseline: false }) }));
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByText("Henüz baseline yok")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Adam-Saat Bütçesi/ })).toHaveAttribute("href", "/butce");
  });

  it("has_baseline=true, has_field_data=false → (b) veri yok", () => {
    vi.mocked(usePanelMocked).mockReturnValue(
      queryStub({ data: panelReportFixture({ has_baseline: true, has_field_data: false }) }),
    );
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByText("İlk günlük gönderildiğinde gerçek eğri ve PF hesaplanır.")).toBeInTheDocument();
  });

  it("yüklendi (loaded) → KPI satırı, 3 grafik, S-eğrisi, disiplin tablosu, uyarılar kartı basılır", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(6); // 6 KPI
    expect(screen.getByRole("img", { name: "S-eğrisi, kümülatif ilerleme" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Günlük kazanılmış ve harcanan saat" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "PF trendi" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Disiplin tablosu" })).toBeInTheDocument();
    expect(screen.getByText("Uyarılar")).toBeInTheDocument();
  });

  /**
   * LİDER TALEBİ (2026-09-26, S32 turu) — mockup Panel:542 `bt: '1.5px
   * dashed #cbd5e1'`: `non_direct` satırı `rowClassName` ile ayırt edici
   * sınıf alır (kesikli üst kenarlık CSS'te — `panel-screen.css`).
   */
  it("non_direct satırı kesikli-kenarlık sınıfını taşır (mockup Panel:542)", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps()} />);
    const nonDirectRow = screen.getByText("Genel / Dolaylı · bütçe dışı").closest("tr");
    expect(nonDirectRow?.className).toContain("ev-panel-table__row--non-direct");
  });
});

describe("PanelScreen · filtre çubuğu ve baseline çipi", () => {
  it("gün gezgini + aralık + disiplin + kendi/taşeron + baseline çipi basılır", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByRole("navigation", { name: "Gün gezgini" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Zaman aralığı" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Disiplin" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Kendi / Taşeron" })).toBeInTheDocument();
    expect(document.querySelector(".ev-panel__baseline-chip")?.textContent).toMatch(/Rev 1/);
  });

  /**
   * LİDER TALEBİ (2026-09-26, S32 turu) — mockup Panel:353-355 İKİ satırlı:
   * 1. satır gezgin+aralık+disiplin, 2. satır Kendi/Taşeron/Hepsi (sol) +
   * Baseline çipi (sağ) AYNI satırda. Önceki tur yalnız "sarmıyor mu"
   * bekçiledi — bu test SATIR GRUPLAMASINI doğrudan sınar.
   */
  it("araç çubuğu İKİ satır: gezgin 1. satırda, Kendi/Taşeron + Baseline AYNI 2. satırda (mockup Panel:353-355)", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps()} />);
    const rows = document.querySelectorAll(".ev-panel__toolbar-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector('nav[aria-label="Gün gezgini"]')).not.toBeNull();
    expect(rows[0]!.textContent).not.toContain("Baseline");
    expect(rows[1]!.querySelector(".ev-panel__baseline-chip")).not.toBeNull();
    expect(rows[1]!.textContent).toContain("Kendi");
    expect(rows[1]!.textContent).toContain("Baseline");
  });

  /**
   * LİDER DENETİMİ KUSURU (3. tur, mockup Panel:117 ölçümü) — disiplin
   * seçicisi kutu İÇİNDE küçük gri büyük harf "DİSİPLİN" öneki taşır
   * (CSS `text-transform:uppercase`, metin içeriği "Disiplin").
   */
  it("disiplin seçici kutusu 'Disiplin' görsel önekini taşır (mockup Panel:117)", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps()} />);
    const box = screen.getByRole("combobox", { name: "Disiplin" }).closest(".ev-panel__toolbar-select");
    expect(box?.querySelector(".ev-panel__toolbar-select-label")?.textContent).toBe("Disiplin");
  });

  it("disiplin seçenekleri report.disciplines'ten gelir", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByRole("option", { name: "Kaba İnşaat" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Elektrik" })).toBeInTheDocument();
  });

  it("revision.frozen_at=null → baseline çipinde tarih basılmaz ama Rev N basılır", () => {
    vi.mocked(usePanelMocked).mockReturnValue(
      queryStub({
        data: panelReportFixture({ revision: { id: "rev-2", number: 2, name: null, frozen_at: null } }),
      }),
    );
    render(<PanelScreen {...baseProps()} />);
    expect(document.querySelector(".ev-panel__baseline-chip")?.textContent).toMatch(/Rev 2/);
  });
});

describe("PanelScreen · disiplin tablosu başlığı", () => {
  it("tolerans metni report.tolerance_points'ten formatDecimal ile basılır", () => {
    vi.mocked(usePanelMocked).mockReturnValue(
      queryStub({ data: panelReportFixture({ tolerance_points: "3.5" }) }),
    );
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByText(/tolerans ±3,5 puan/)).toBeInTheDocument();
  });

  it("tolerance_points=null → EMPTY_CELL basılır", () => {
    vi.mocked(usePanelMocked).mockReturnValue(
      queryStub({ data: panelReportFixture({ tolerance_points: null }) }),
    );
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByText(/tolerans ±— puan/)).toBeInTheDocument();
  });

  it("'Günlük İlerleme Raporu →' bağlantısı links.dailyReport(report.data.day)'e gider", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps()} />);
    expect(screen.getByRole("link", { name: "Günlük İlerleme Raporu →" })).toHaveAttribute(
      "href",
      "/gunluk-rapor?tarih=2026-09-24",
    );
  });
});

describe("PanelScreen · salt okunur (tamamlanmış şantiye)", () => {
  it("siteCompleted=true → ReadOnlyStrip basılır, KPI 6 'Dağıt →' basılmaz", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps({ siteCompleted: true })} />);
    expect(screen.getByText("Görüntüleyici · yalnız okuma")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dağıt →" })).toBeNull();
  });

  it("siteCompleted=false ve yazma izni VAR → 'Dağıt →' basılır, links.diary(report.data.day)'e gider", () => {
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps({ siteCompleted: false })} />);
    expect(screen.getByRole("link", { name: "Dağıt →" })).toHaveAttribute("href", "/gunluk-kayit?tarih=2026-09-24");
  });

  it("yazma izni YOK → 'Dağıt →' basılmaz (siteCompleted olmasa bile)", () => {
    vi.mocked(usePermissionMocked).mockReturnValue(permissionStub("view", false) as never);
    vi.mocked(usePanelMocked).mockReturnValue(queryStub({ data: panelReportFixture() }));
    render(<PanelScreen {...baseProps({ siteCompleted: false })} />);
    expect(screen.queryByRole("link", { name: "Dağıt →" })).toBeNull();
  });
});
