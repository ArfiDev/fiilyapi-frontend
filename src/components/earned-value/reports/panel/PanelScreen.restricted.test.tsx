import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { usePanel } from "@/lib/api/hooks/useEvReports";
import type { ReportScreenProps } from "@/components/earned-value/reports/kit/report-screen";

import { panelReportFixture } from "./panel-fixtures";
import { PanelScreen } from "./PanelScreen";

// DSC-F1.3 · kısıtlı kullanıcıda SÜZGEÇSİZ boş disiplin tablosu → bildirim;
// süzgeçli boşluk eski metni korur.
const scope = vi.hoisted(() => ({ value: { isRestricted: false, names: [] as string[] } }));
vi.mock("@/lib/auth/useDisciplineScope", () => ({ useDisciplineScope: () => scope.value }));

vi.mock("@/lib/api/hooks/useEvReports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useEvReports")>()),
  usePanel: vi.fn(),
}));

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/planlama-paneli",
  useSearchParams: () => searchParams,
}));

import { usePanel as usePanelMocked } from "@/lib/api/hooks/useEvReports";

const LINKS: ReportScreenProps["links"] = {
  diary: () => "/gunluk-kayit",
  budget: "/butce",
  dailyReport: () => "/gunluk-rapor",
  weeklyReport: () => "/haftalik-qurr",
  panel: "/panel",
};
const PROPS: ReportScreenProps = {
  siteId: "site-1",
  siteName: "A-Blok Şantiyesi",
  companyName: "FİİL Yapı",
  projectName: "Güneşkent Konut",
  siteCompleted: false,
  links: LINKS,
};

function mockEmptyRows() {
  vi.mocked(usePanelMocked).mockReturnValue({
    data: panelReportFixture({ rows: [] }),
    isLoading: false,
    isError: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof usePanel>);
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  scope.value = { isRestricted: false, names: [] };
});

describe("PanelScreen — kısıtlı boş disiplin tablosu (DSC-F1.3)", () => {
  it("kısıtlı + süzgeçsiz boş tablo → ortak bildirim", () => {
    scope.value = { isRestricted: true, names: ["Mekanik Tesisat"] };
    mockEmptyRows();
    render(<PanelScreen {...PROPS} />);
    expect(screen.getByText("Disiplininize ait kayıt yok.")).toBeInTheDocument();
    expect(screen.queryByText(/Seçilen filtrede kalem yok/)).not.toBeInTheDocument();
  });

  it("kısıtlı + disiplin süzgeci seçili boş tablo → eski süzgeç metni", () => {
    scope.value = { isRestricted: true, names: ["Mekanik Tesisat"] };
    searchParams = new URLSearchParams("disiplin=d:MEK");
    mockEmptyRows();
    render(<PanelScreen {...PROPS} />);
    expect(screen.getByText(/Seçilen filtrede kalem yok/)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("kısıtlı + iş sahibi süzgeçli boş tablo → eski süzgeç metni", () => {
    scope.value = { isRestricted: true, names: ["Mekanik Tesisat"] };
    searchParams = new URLSearchParams("yuklenici=own");
    mockEmptyRows();
    render(<PanelScreen {...PROPS} />);
    expect(screen.getByText(/Seçilen filtrede kalem yok/)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });

  it("atamasız + boş tablo → bugünkü metin aynen", () => {
    mockEmptyRows();
    render(<PanelScreen {...PROPS} />);
    expect(screen.getByText(/Seçilen filtrede kalem yok/)).toBeInTheDocument();
    expect(screen.queryByText("Disiplininize ait kayıt yok.")).not.toBeInTheDocument();
  });
});
