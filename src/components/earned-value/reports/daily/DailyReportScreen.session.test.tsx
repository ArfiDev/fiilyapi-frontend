import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { useApproveDailyReport, useDailyReport } from "@/lib/api/hooks/useEvReports";
import type { ReportScreenProps } from "@/components/earned-value/reports/kit/report-screen";
import { SessionProvider } from "@/components/shell/SessionProvider";

import { DAILY_RESTRICTED_LIVE } from "./daily-scope-fixtures";
import { DailyReportScreen } from "./DailyReportScreen";

// DSC-F2 FAZ B · GERÇEK SessionProvider + useDisciplineScope (mock yok): /auth/me.projects[].discipline_ids → etiket.
vi.mock("@/lib/api/hooks/useEvReports", () => ({ useDailyReport: vi.fn(), useApproveDailyReport: vi.fn() }));
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: vi.fn(() => ({ level: "approve", canView: true, canWrite: true, canDelete: false })),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({}),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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
  links: { diary: () => "/g", budget: "/b", dailyReport: () => "/r", weeklyReport: () => "/w", panel: "/p" },
};

function mockMe(disciplines: { id: string; [k: string]: unknown }[]) {
  // IZN-F3.1c: atama `me.projects[].discipline_ids` (me.disciplines kalktı).
  const projects = [{ project_id: "p-1", role_key: "x", discipline_ids: disciplines.map((d) => d.id) }];
  vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ id: "u1", full_name: "Ali", role_key: "x", title: "y", all_projects: false, projects }), {
      status: 200,
    }),
  );
  vi.mocked(useDailyReportMocked).mockReturnValue({
    data: DAILY_RESTRICTED_LIVE,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isRefetching: false,
  } as unknown as ReturnType<typeof useDailyReport>);
  vi.mocked(useApproveMocked).mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as unknown as ReturnType<
    typeof useApproveDailyReport
  >);
}

afterEach(() => vi.restoreAllMocks());

describe("DailyReportScreen — gerçek oturum", () => {
  it("projede disiplin dolu → 'Genel (disiplinlerim)' ve mutabakatta 'başka disiplinde'", async () => {
    mockMe([{ id: "d1", code: "CW", name: "Civil Works", color: "#2563eb" }]);
    render(
      <SessionProvider>
        <DailyReportScreen {...PROPS} />
      </SessionProvider>,
    );
    expect(await screen.findByText("Genel (disiplinlerim)")).toBeInTheDocument();
    expect(screen.getByText(/başka disiplinde 110 a-s/)).toBeInTheDocument();
  });

  it("projelerde disiplin yok → 'Genel' ve H terimi yok", async () => {
    mockMe([]);
    const { container } = render(
      <SessionProvider>
        <DailyReportScreen {...PROPS} />
      </SessionProvider>,
    );
    await waitFor(() => expect(vi.mocked(global.fetch)).toHaveBeenCalled());
    await waitFor(() =>
      expect(container.querySelector(".ev-daily-kpi__name > span:first-child")?.textContent).toBe("Genel"),
    );
    expect(screen.queryByText(/başka disiplinde/)).not.toBeInTheDocument();
  });
});
