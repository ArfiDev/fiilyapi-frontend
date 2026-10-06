import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { useContracts } from "@/lib/api/hooks/useContracts";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { ContractsView } from "./ContractsView";

// IZN-F5b · madde 7 — "+ Yeni Sözleşme" (taşeron) → POST /projects/{id}/subcontractor-contracts
// = SUBCONTRACTOR_CONTRACT_CREATE_EDIT (teklif.sozlesmeler, teklif.taseron_sozlesme). Kardeş sayfalar yazdırmaz.
vi.mock("@/lib/api/hooks/useContracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContracts")>()),
  useContracts: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sozlesmeler",
  useSearchParams: () => new URLSearchParams("type=subcontractor"),
}));

const NEW_LINK = { name: "+ Yeni Sözleşme" } as const;

function renderView(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
  vi.mocked(useContracts).mockReturnValue({
    data: { summary: { total_amount: "0.00", active_count: 0, progress_payment_total: null, expiring_this_month_count: 0 }, items: [] },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  return render(<ContractsView />);
}

beforeEach(() => vi.clearAllMocks());

describe("ContractsView · '+ Yeni Sözleşme' kapısı (IZN-F5b)", () => {
  it("teklif.sozlesmeler Düzenler → bağlantı var", () => {
    renderView(meFixture({ pages: { "teklif.sozlesmeler": pageGrant("edit") } }));
    expect(screen.getByRole("link", NEW_LINK)).toBeInTheDocument();
  });

  it("teklif.taseron_sozlesme Düzenler → bağlantı var", () => {
    renderView(meFixture({ pages: { "teklif.taseron_sozlesme": pageGrant("edit") } }));
    expect(screen.getByRole("link", NEW_LINK)).toBeInTheDocument();
  });

  it("yalnız teklif.taseron_firmalar Düzenler → bağlantı YOK, devre dışı düğme", () => {
    renderView(meFixture({ pages: { "teklif.taseron_firmalar": pageGrant("edit") } }));
    expect(screen.queryByRole("link", NEW_LINK)).toBeNull();
    expect(screen.getByTestId("szl-new-contract-disabled")).toBeDisabled();
  });
});
