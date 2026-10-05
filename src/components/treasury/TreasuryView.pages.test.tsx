import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { useBankAccounts } from "@/lib/api/hooks/useBankAccounts";
import { useCashFlow } from "@/lib/api/hooks/useCashFlow";
import { useUpcomingPayments } from "@/lib/api/hooks/useUpcomingPayments";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { TreasuryView } from "./TreasuryView";

// IZN-F5-ön — Hazine görüntüleme kapısı = mali.hazine / mali.cek_odeme Görür (VEYA); grant yoksa `treasury` izni.
vi.mock("@/lib/api/hooks/useBankAccounts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBankAccounts")>()),
  useBankAccounts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useCashFlow", () => ({ useCashFlow: vi.fn() }));
vi.mock("@/lib/api/hooks/useUpcomingPayments", () => ({ useUpcomingPayments: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

function loading() {
  return { data: undefined, isLoading: true, isError: false, error: null } as never;
}

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const DENIED = "Bu alana yetkiniz yok";
const TITLE = { level: 1, name: "Hazine" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useBankAccounts).mockReturnValue(loading());
  vi.mocked(useCashFlow).mockReturnValue(loading());
  vi.mocked(useUpcomingPayments).mockReturnValue(loading());
});

describe("TreasuryView · sayfa izni görüntüleme kapısı (IZN-F5-ön)", () => {
  it("mali.hazine Görür → açılır (treasury none olsa bile)", () => {
    session(meFixture({ pages: { "mali.hazine": pageGrant("view") }, permissions: { treasury: "none" } }));
    render(<TreasuryView />);
    expect(screen.getByRole("heading", TITLE)).toBeInTheDocument();
  });

  it("ikiz kapı: mali.cek_odeme Görür → açılır", () => {
    session(meFixture({ pages: { "mali.hazine": pageGrant("none"), "mali.cek_odeme": pageGrant("view") } }));
    render(<TreasuryView />);
    expect(screen.getByRole("heading", TITLE)).toBeInTheDocument();
  });

  it("hazine sayfalarında yalnız none → AccessDenied (treasury full olsa bile)", () => {
    session(meFixture({ pages: { "mali.hazine": pageGrant("none") }, permissions: { treasury: "full" } }));
    render(<TreasuryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
  });

  it("pages boş → eski davranış (treasury none → AccessDenied, view → açık)", () => {
    session(meFixture({ pages: {}, permissions: { treasury: "none" } }));
    const { unmount } = render(<TreasuryView />);
    expect(screen.getByText(DENIED)).toBeInTheDocument();
    unmount();
    session(meFixture({ pages: {}, permissions: { treasury: "view" } }));
    render(<TreasuryView />);
    expect(screen.getByRole("heading", TITLE)).toBeInTheDocument();
  });
});
