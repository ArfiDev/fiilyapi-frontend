import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCompany } from "@/lib/api/hooks/useCompany";
import { useSite } from "@/lib/api/hooks/useSites";
import { useEvSiteParam } from "@/components/earned-value/reports/kit/site-scope/useEvSiteParam";
import { useDailyReport } from "@/lib/api/hooks/useEvReports";

import { DAILY_REPORT_FIXTURE_DRAFT } from "./daily-fixtures";
import { GeneralDailyReportView } from "../views/GeneralDailyReportView";
import { SiteDailyReportView } from "../views/SiteDailyReportView";

/**
 * PLN-F3.4-düzeltme (lider eki, CEO) · S21 "seçici sayfa başlığında" —
 * `DailyReportScreen`in RAPOR YÜKLENDİKTEN SONRAKİ (`LoadedDailyReport`)
 * gövdesi `picker`ı görmezden geliyordu (build lint bulgusu: kullanılmayan
 * değişken DEĞİL, hiç DESTRUCTURE edilip basılmayan prop). Bu test gerçek
 * `DailyReportScreen`i (mock'suz) KÖK ikiz (`GeneralDailyReportView`, picker
 * VERİR) ve ŞANTİYE ALTI ikiz (`SiteDailyReportView`, picker VERMEZ) üzerinden
 * uçtan uca render eder — yalnız A'nın `views/*` dosyalarını OKUR, YAZMAZ.
 */

vi.mock("@/lib/api/hooks/useEvReports", () => ({
  useDailyReport: vi.fn(),
  useApproveDailyReport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));


vi.mock("@/lib/api/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/components/earned-value/reports/kit/site-scope/useEvSiteParam", () => ({ useEvSiteParam: vi.fn() }));

const searchParams = new URLSearchParams("tarih=2026-09-24");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/planlama/gunluk-rapor",
  useSearchParams: () => searchParams,
  useParams: () => ({ projectId: "guneskent", siteId: "a-blok" }),
}));

const PICKER = <div data-testid="picker-sentinel">şantiye seçici</div>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useDailyReport).mockReturnValue({
    data: DAILY_REPORT_FIXTURE_DRAFT,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isRefetching: false,
  } as unknown as ReturnType<typeof useDailyReport>);
});

describe("S21 — GİR başlığındaki şantiye seçici (kök ikiz VAR, şantiye altı ikiz YOK)", () => {
  it("kök ikizde (GeneralDailyReportView) picker GÖRÜNÜR — rapor YÜKLENDİKTEN sonra da", () => {
    vi.mocked(useEvSiteParam).mockReturnValue({
      siteOptions: { options: [], groups: [], isLoading: false, isError: false },
      selected: { siteId: "s-2", siteName: "A-Blok Şantiyesi", projectId: "p-2", projectName: "Güneşkent Konut", isCompleted: false },
      picker: PICKER,
    });
    vi.mocked(useCompany).mockReturnValue({ data: { name: "FİİL Yapı" } } as never);

    render(<GeneralDailyReportView />);

    expect(screen.getByTestId("picker-sentinel")).toBeInTheDocument();
    // Rapor gerçekten yüklenmiş olmalı (bug tam olarak bu gövdede yaşıyordu).
    expect(screen.getByText("1 · Disiplin KPI")).toBeInTheDocument();
  });

  it("şantiye altı ikizde (SiteDailyReportView) picker VERİLMEZ — hiç basılmaz", () => {
    vi.mocked(useSite).mockReturnValue({
      data: { id: "s-1", name: "A-Blok Şantiyesi", status: "active", project: { id: "p-1", name: "Güneşkent Konut" } },
    } as never);
    vi.mocked(useCompany).mockReturnValue({ data: { name: "FİİL Yapı" } } as never);

    render(<SiteDailyReportView />);

    expect(screen.queryByTestId("picker-sentinel")).not.toBeInTheDocument();
    expect(screen.getByText("1 · Disiplin KPI")).toBeInTheDocument();
  });
});
