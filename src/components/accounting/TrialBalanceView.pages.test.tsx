import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type { TrialBalanceResponse } from "@/lib/api/hooks/useTrialBalance";
import { useTrialBalance } from "@/lib/api/hooks/useTrialBalance";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { TrialBalanceView } from "./TrialBalanceView";

// IZN-F5-ön — Mizan ekranının GÖRÜNTÜLEME kapısı (AccessDenied) mali.* Görür sayfalarından karar verir
// (backend `accounting:view` = VIEW_GATE_PAGES).
vi.mock("@/lib/api/hooks/useTrialBalance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useTrialBalance")>()),
  useTrialBalance: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/muhasebe/mizan" }));

const DENIED = "Bu alana yetkiniz yok";
const EMPTY = {
  year: 2026,
  month: 7,
  is_balanced: true,
  rows: [],
  totals: {
    opening_debit: "0.00",
    opening_credit: "0.00",
    period_debit: "0.00",
    period_credit: "0.00",
    closing_debit: "0.00",
    closing_credit: "0.00",
  },
} as TrialBalanceResponse;

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

describe("TrialBalanceView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTrialBalance).mockReturnValue({
      data: EMPTY,
      error: null,
      isLoading: false,
      isError: false,
    } as unknown as UseQueryResult<TrialBalanceResponse, Error>);
  });

  it("mali.mizan Görür → ekran açılır", () => {
    session(meFixture({ pages: { "mali.mizan": pageGrant("view") } }));
    render(<TrialBalanceView />);
    expect(screen.queryByText(DENIED)).toBeNull();
    expect(screen.getByRole("heading", { name: "Mizan" })).toBeInTheDocument();
  });

  it("muhasebe kümesinde yalnız none grant → erişim reddedilir", () => {
    session(meFixture({ pages: { "mali.mizan": pageGrant("none") } }));
    render(<TrialBalanceView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  // IZN-F6a · modül-izni düşüşü KALKTI: grant yoksa kapı KAPALI (fail-closed).
  it("pages boş → ekran KAPALI", () => {
    session(meFixture({ pages: {} }));
    const { unmount } = render(<TrialBalanceView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();

    session(meFixture({ pages: {} }));
    render(<TrialBalanceView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("sistem yöneticisi: grant none olsa da ekran açılır", () => {
    session(meFixture({ pages: { "mali.mizan": pageGrant("none") }, isSystemAdmin: true }));
    render(<TrialBalanceView />);
    expect(screen.queryByText(DENIED)).toBeNull();
  });
});
