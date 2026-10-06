import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import StokPage from "./page";
import { useSession } from "@/components/shell/SessionProvider";
import { useStockSummary } from "@/lib/api/hooks/useStockSummary";
import { meFixture } from "@/lib/auth/page-grants.testkit";

// F-ST T2 · `/stok` gerçek rota eklenince [...slug] catch-all bu segment için
// devre dışı kalır — bu test sayfanın ComingSoon YERİNE gerçek E3 katalogunu
// bastığını doğrular (catch-all'ın kendisi Next.js dosya-tabanlı yönlendirmenin
// garantisidir, ayrıca test edilmez).

vi.mock("next/navigation", () => ({
  usePathname: () => "/stok",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useStockSummary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useStockSummary")>()),
  useStockSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useStockMutations", () => ({
  useCreateStockItem: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateWarehouse: () => ({ mutate: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    // Sunucunun stok izin anahtarı `inventory`dir (`inventory/service.py` ·
    // `PERMISSION_MODULE`); `stock` diye bir modül backend'de YOK.
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useStockSummary).mockReturnValue({
    data: {
      items: [],
      total: 0,
      limit: 200,
      offset: 0,
      kpis: {
        total_value: "0.00",
        critical_count: 0,
        low_count: 0,
        total_items: 0,
        items_without_price: 0,
        pending_orders: { available: false, value: null, pending_module: "procurement" },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useStockSummary>);
});

describe("/stok sayfası", () => {
  it("E3 katalogunu basar, ComingSoon'a DÜŞMEZ", () => {
    render(<StokPage />);
    expect(screen.getByRole("heading", { name: "Stok & Depo" })).toBeInTheDocument();
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
  });
});
