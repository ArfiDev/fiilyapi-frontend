import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCompany } from "@/lib/api/hooks/useCompany";
import { useSite } from "@/lib/api/hooks/useSites";
import { useDailyReport } from "@/lib/api/hooks/useEvReports";

import { DAILY_REPORT_FIXTURE_DRAFT } from "./daily-fixtures";
import { SiteDailyReportView } from "../views/SiteDailyReportView";

// DSC-F1.3 · kısıtlı kullanıcıda miktar tablosu (tüm liste) boşken bildirim.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

vi.mock("@/lib/api/hooks/useEvReports", () => ({
  useDailyReport: vi.fn(),
  useApproveDailyReport: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
}));
vi.mock("@/lib/api/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));

const searchParams = new URLSearchParams("tarih=2026-09-24");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/planlama/gunluk-rapor",
  useSearchParams: () => searchParams,
  useParams: () => ({ projectId: "guneskent", siteId: "a-blok" }),
}));

function mockReport(quantities: typeof DAILY_REPORT_FIXTURE_DRAFT.quantities) {
  vi.mocked(useDailyReport).mockReturnValue({
    data: { ...DAILY_REPORT_FIXTURE_DRAFT, quantities },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isRefetching: false,
  } as unknown as ReturnType<typeof useDailyReport>);
}

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  vi.mocked(useSite).mockReturnValue({
    data: { id: "s-1", name: "A-Blok Şantiyesi", status: "active", project: { id: "p-1", name: "Güneşkent Konut" } },
  } as never);
  vi.mocked(useCompany).mockReturnValue({ data: { name: "FİİL Yapı" } } as never);
});

describe("DailyReportScreen — kısıtlı boş miktar tablosu (DSC-F1.3)", () => {
  it("kısıtlı + miktar satırı yok → ortak bildirim, tablo yok", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    mockReport([]);
    render(<SiteDailyReportView />);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Miktar tablosu" })).not.toBeInTheDocument();
  });

  it("atamasız + miktar satırı yok → bugünkü tablo aynen, bildirim yok", () => {
    mockReport([]);
    render(<SiteDailyReportView />);
    expect(screen.getByRole("table", { name: "Miktar tablosu" })).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("kısıtlı ama miktar satırı VAR → tablo basılır, bildirim yok", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    mockReport(DAILY_REPORT_FIXTURE_DRAFT.quantities);
    render(<SiteDailyReportView />);
    expect(screen.getByRole("table", { name: "Miktar tablosu" })).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
