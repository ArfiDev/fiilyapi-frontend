import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { useCompany } from "@/lib/api/hooks/useCompany";
import { usePayrollPeriods, type PayrollPeriodListResponse } from "@/lib/api/hooks/usePayroll";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { PayrollHistoryView } from "./PayrollHistoryView";

// IZN-F5-ön — Bordro Geçmişi görüntüleme kapısı = bordro sayfaları Görür (VEYA); grant yoksa modül izni.
vi.mock("next/navigation", () => ({ usePathname: () => "/bordro/gecmis" }));
vi.mock("@/lib/api/hooks/usePayroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayroll")>()),
  usePayrollPeriods: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useCompany", () => ({ useCompany: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function stub<T>(partial: Record<string, unknown>) {
  return { data: undefined, error: null, isLoading: false, isError: false, ...partial } as unknown as UseQueryResult<T, Error>;
}

const DENIED = "Bu alana yetkiniz yok";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePayrollPeriods).mockReturnValue(
    stub<PayrollPeriodListResponse>({ data: { items: [], total: 0, limit: 240, offset: 0 } }),
  );
  vi.mocked(useCompany).mockReturnValue(stub({ data: { name: "FİİL Yapı Ltd. Şti." } }));
});

describe("PayrollHistoryView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("mali.bordro_gecmis Görür → açılır (modül none olsa bile)", () => {
    session(meFixture({ pages: { "mali.bordro_gecmis": pageGrant("view") }, permissions: { payroll: "none" } }));
    render(<PayrollHistoryView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });

  it("bordro sayfalarının hepsi none → AccessDenied (modül full olsa bile)", () => {
    session(meFixture({ pages: { "mali.bordro_gecmis": pageGrant("none") }, permissions: { payroll: "full" } }));
    render(<PayrollHistoryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → fail-closed: modül izni view olsa bile reddedilir (IZN-F6a)", () => {
    session(meFixture({ pages: {}, permissions: { payroll: "none" } }));
    const { unmount } = render(<PayrollHistoryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { payroll: "view" } }));
    render(<PayrollHistoryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });
});
