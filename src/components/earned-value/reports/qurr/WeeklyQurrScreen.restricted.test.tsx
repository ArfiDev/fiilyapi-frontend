import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useWeeklyReport } from "@/lib/api/hooks/useEvReports";
import type { EvQurrReport } from "@/lib/api/models";

import type { ReportScreenProps } from "../kit/report-screen";
import { QURR_FIXTURE_READY } from "./qurr-fixtures";
import { WeeklyQurrScreen } from "./WeeklyQurrScreen";

// DSC-F1.3 · kısıtlı kullanıcıda satırsız QURR tablosu → bildirim.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

vi.mock("@/lib/api/hooks/useEvReports", () => ({
  useWeeklyReport: vi.fn(),
  downloadWeeklyXlsx: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("hafta=21"),
}));

const NO_ROWS: EvQurrReport = { ...QURR_FIXTURE_READY, rows: [], totals: [] };

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

beforeEach(() => {
  vi.clearAllMocks();
  scope.value = { isRestricted: false, names: [] };
  vi.mocked(useWeeklyReport).mockReturnValue({
    data: NO_ROWS,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useWeeklyReport>);
});

describe("WeeklyQurrScreen — kısıtlı boş tablo (DSC-F1.3)", () => {
  it("kısıtlı + satır yok → ortak bildirim", () => {
    scope.value = { isRestricted: true, names: ["Civil Works"] };
    render(<WeeklyQurrScreen {...PROPS} />);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText("Bu hafta için satır yok.")).not.toBeInTheDocument();
  });

  it("atamasız + satır yok → bugünkü metin aynen", () => {
    render(<WeeklyQurrScreen {...PROPS} />);
    expect(screen.getByText("Bu hafta için satır yok.")).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
