import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { useApproveDailyReport, useDailyReport } from "@/lib/api/hooks/useEvReports";
import type { ReportScreenProps } from "@/components/earned-value/reports/kit/report-screen";

import { DAILY_REPORT_FIXTURE_APPROVED, DAILY_REPORT_FIXTURE_DRAFT } from "./daily-fixtures";
import { DAILY_MIXED_DISCIPLINE, DAILY_RESTRICTED_APPROVED, DAILY_RESTRICTED_LIVE } from "./daily-scope-fixtures";
import { DailyReportScreen } from "./DailyReportScreen";

// DSC-F2 FAZ B · kısıtlı / atamasız günlük rapor gösterimi.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));
vi.mock("@/lib/api/hooks/useEvReports", () => ({ useDailyReport: vi.fn(), useApproveDailyReport: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/gunluk-rapor",
  useSearchParams: () => new URLSearchParams("tarih=2026-09-24"),
}));

import { useApproveDailyReport as useApproveMocked, useDailyReport as useDailyReportMocked } from "@/lib/api/hooks/useEvReports";

const PROPS: ReportScreenProps = {
  siteId: "site-1",
  siteName: "A-Blok Şantiyesi",
  companyName: "FİİL Yapı",
  projectName: "Güneşkent Konut",
  siteCompleted: false,
  links: {
    diary: () => "/gunluk-kayit",
    budget: "/butce",
    dailyReport: () => "/gunluk-rapor",
    weeklyReport: () => "/haftalik-qurr",
    panel: "/panel",
  },
};

function show(data: unknown) {
  vi.mocked(useDailyReportMocked).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isRefetching: false,
  } as unknown as ReturnType<typeof useDailyReport>);
}

const kpiNames = (container: HTMLElement) =>
  Array.from(container.querySelectorAll(".ev-daily-kpi__table .ev-daily-kpi__name > span:first-child")).map((el) => el.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  vi.mocked(useApproveMocked).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useApproveDailyReport
  >);
});

describe("DailyReportScreen — kısıtlı canlı rapor (S1, Toplam doğrudan, mutabakat)", () => {
  it("kısıtlı: yalnız overall 'Genel (disiplinlerim)'; Kendi/Taşeron eksiz", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    show(DAILY_RESTRICTED_LIVE);
    const { container } = render(<DailyReportScreen {...PROPS} />);
    expect(kpiNames(container).slice(0, 3)).toEqual(["Genel (disiplinlerim)", "Genel – Kendi", "Genel – Taşeron"]);
  });

  it("atamasız: 'Genel' aynen", () => {
    show(DAILY_RESTRICTED_LIVE);
    const { container } = render(<DailyReportScreen {...PROPS} />);
    expect(kpiNames(container)[0]).toBe("Genel");
  });

  it("kısıtlı: 'Toplam doğrudan (disiplinlerim)'; atamasız: 'Toplam doğrudan'", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    show(DAILY_RESTRICTED_LIVE);
    const restricted = render(<DailyReportScreen {...PROPS} />);
    expect(restricted.container.querySelector("tr.ev-daily-qty__total-row th")?.textContent).toContain("Toplam doğrudan (disiplinlerim)");
    restricted.unmount();
    scope.value = { isRestricted: false, names: [] };
    const open = render(<DailyReportScreen {...PROPS} />);
    expect(open.container.querySelector("tr.ev-daily-qty__total-row th")?.textContent?.trim()).toBe("Toplam doğrudan");
  });

  it("kısıtlı: mutabakat çipi 'başka disiplinde H' terimini taşır (H = 326 − 16 − 200 = 110)", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    show(DAILY_RESTRICTED_LIVE);
    render(<DailyReportScreen {...PROPS} />);
    expect(
      screen.getByText("Σ harcanan 200 a-s + dağıtılmamış 16 a-s + başka disiplinde 110 a-s = Σ puantaj 326 a-s"),
    ).toBeInTheDocument();
  });

  it("atamasız: mutabakat çipi bugünkü metin AYNEN", () => {
    show(DAILY_REPORT_FIXTURE_DRAFT);
    render(<DailyReportScreen {...PROPS} />);
    expect(screen.getByText("Σ harcanan 310 a-s + dağıtılmamış 16 a-s = Σ puantaj 326 a-s")).toBeInTheDocument();
  });
});

describe("DailyReportScreen — kısıtlı onaylı rapor (overall yok, trend [], footer null)", () => {
  it("arşiv kartı: overall yoksa Küm. planlı / Küm. gerçek / Sapma '—'", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    show(DAILY_RESTRICTED_APPROVED);
    const { container } = render(<DailyReportScreen {...PROPS} />);
    const metrics = Array.from(container.querySelectorAll(".ev-daily-archive-summary__metrics b")).map((el) => el.textContent);
    expect(metrics).toEqual(["—", "—", "—"]);
  });

  it("atamasız onaylı: arşiv kartı metrikleri dolu (değişmedi)", () => {
    show(DAILY_REPORT_FIXTURE_APPROVED);
    const { container } = render(<DailyReportScreen {...PROPS} />);
    const metrics = Array.from(container.querySelectorAll(".ev-daily-archive-summary__metrics b")).map((el) => el.textContent);
    expect(metrics).toHaveLength(3);
    expect(metrics.every((m) => m !== "—")).toBe(true);
  });

  it("raporu göster: kısıtlıda trend bölümü GİZLİ, sentetik Genel satırı YOK, kpi yalnız disiplinler", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    show(DAILY_RESTRICTED_APPROVED);
    const { container } = render(<DailyReportScreen {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Raporu göster" }));
    expect(screen.queryByRole("region", { name: "7 günlük trend" })).not.toBeInTheDocument();
    expect(screen.queryByText(/7 günlük trend/)).not.toBeInTheDocument();
    expect(kpiNames(container).some((n) => n?.startsWith("Genel"))).toBe(false);
  });

  it("atamasız + trend boş (olağan dışı): trend bölümü GİZLENMEZ (davranış değişmez)", () => {
    show({ ...DAILY_REPORT_FIXTURE_APPROVED, trend: [] });
    render(<DailyReportScreen {...PROPS} />);
    fireEvent.click(screen.getByRole("button", { name: "Raporu göster" }));
    expect(screen.getByText(/2 · 7 günlük trend/)).toBeInTheDocument();
  });

  it("kısıtlı + canlı rapor (trend dolu): trend bölümü görünür, başlıkta '(disiplinlerim)' eki", () => {
    scope.value = { isRestricted: true, names: ["Civil"] };
    show(DAILY_RESTRICTED_LIVE);
    render(<DailyReportScreen {...PROPS} />);
    expect(screen.getByText("2 · 7 günlük trend · Genel kümülatif (disiplinlerim)")).toBeInTheDocument();
  });

  it("atamasız: trend başlığı bugünkü metin, ek yok", () => {
    show(DAILY_RESTRICTED_LIVE);
    render(<DailyReportScreen {...PROPS} />);
    expect(screen.getByText("2 · 7 günlük trend · Genel kümülatif")).toBeInTheDocument();
  });

  it("non_direct satırı (name null) 'Genel / Dolaylı · bütçe dışı'; kısıtlıda ek yok", () => {
    const nonDirect = { ...DAILY_REPORT_FIXTURE_DRAFT.kpis[0]!, kind: "non_direct" as const, name: null };
    for (const restricted of [false, true]) {
      scope.value = { isRestricted: restricted, names: restricted ? ["Civil"] : [] };
      show({ ...DAILY_RESTRICTED_LIVE, kpis: [...DAILY_RESTRICTED_LIVE.kpis, nonDirect] });
      const { container, unmount } = render(<DailyReportScreen {...PROPS} />);
      expect(kpiNames(container).at(-1)).toBe("Genel / Dolaylı · bütçe dışı");
      unmount();
    }
  });
});

describe("DailyReportScreen — KPI satır anahtarı (discipline / _own / _subcon aynı node_id'yi paylaşır)", () => {
  it("karma disiplinli raporda React 'same key' uyarısı yok ve her satır basılır", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    show(DAILY_MIXED_DISCIPLINE);
    const { container } = render(<DailyReportScreen {...PROPS} />);
    expect(container.querySelectorAll(".ev-daily-kpi__table tbody tr")).toHaveLength(DAILY_MIXED_DISCIPLINE.kpis.length);
    const keyWarnings = errors.mock.calls.filter((call) => String(call[0]).includes("same key"));
    errors.mockRestore();
    expect(keyWarnings).toEqual([]);
  });
});
