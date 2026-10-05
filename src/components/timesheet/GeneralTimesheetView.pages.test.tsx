import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { GeneralTimesheetView } from "./GeneralTimesheetView";
import { useSession } from "@/components/shell/SessionProvider";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { useTimesheetWeek } from "@/lib/api/hooks/useTimesheet";
import { useSaveTimesheetWeek } from "@/lib/api/hooks/useTimesheetMutations";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5-ön — Genel puantaj görüntüleme kapısı = saha.puantaj / santiye.puantaj / bolum.puantaj Görür (VEYA);
// grant yoksa `timesheet` izni.
vi.mock("next/navigation", () => ({
  usePathname: () => "/puantaj",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams({ site: "s-1", iso_year: "2026", iso_week: "32" }),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTimesheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTimesheet")>()),
  useTimesheetWeek: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useTimesheetMutations", () => ({ useSaveTimesheetWeek: vi.fn() }));
vi.mock("@/lib/api/timesheet-client", () => ({ downloadTimesheetExport: vi.fn() }));
vi.mock("@/lib/api/hooks/useSiteOptions", () => ({ useSiteOptions: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return render(<GeneralTimesheetView />, { wrapper: Wrapper });
}

const DENIED = "Bu alana yetkiniz yok";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSaveTimesheetWeek).mockReturnValue({ mutateAsync: vi.fn() } as never);
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useTimesheetWeek).mockReturnValue({ data: undefined, isLoading: true, isError: false, error: null } as never);
  vi.mocked(useSiteOptions).mockReturnValue({
    options: [{ siteId: "s-1", label: "A-Blok" }],
    isLoading: false,
    isError: false,
  } as never);
});

describe("GeneralTimesheetView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("saha.puantaj Görür → açılır (timesheet none olsa bile)", () => {
    session(meFixture({ pages: { "saha.puantaj": pageGrant("view") }, permissions: { timesheet: "none" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("puantaj sayfalarında yalnız none → AccessDenied (timesheet full olsa bile)", () => {
    session(meFixture({ pages: { "saha.puantaj": pageGrant("none") }, permissions: { timesheet: "full" } }));
    renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → eski davranış (timesheet none → AccessDenied, view → açık)", () => {
    session(meFixture({ pages: {}, permissions: { timesheet: "none" } }));
    const { unmount } = renderView();
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { timesheet: "view" } }));
    renderView();
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
