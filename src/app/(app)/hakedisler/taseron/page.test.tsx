import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import TaseronHakedisPage from "./page";
import {
  useSubcontractorProgressPayments,
  useSubcontractorProgressPaymentSummary,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock(
  "@/lib/api/hooks/useSubcontractorProgressPayments",
  async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")>()),
    useSubcontractorProgressPayments: vi.fn(),
    useSubcontractorProgressPaymentSummary: vi.fn(),
  }),
);
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/hakedisler/taseron",
  useSearchParams: () => new URLSearchParams(),
}));

// F-TH T2 brief: `/hakedisler/taseron` gercek rota eklenince [...slug]
// catch-all bu segment icin devre disi kalir — bu test, sayfanin ComingSoon
// YERINE gercek Taseron Hakedisi gorunumunu bastigini dogrular (`hakedisler
// /page.test.tsx` deseniyle ayni).
describe("TaseronHakedisPage rotasi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSession).mockReturnValue({
      me: meFixture(),
      isLoading: false,
    });
    vi.mocked(useProjects).mockReturnValue({
      data: { items: [], counts: {} },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    vi.mocked(useSubcontractorProgressPayments).mockReturnValue({
      data: { items: [], total: 0, limit: 50, offset: 0 },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    vi.mocked(useSubcontractorProgressPaymentSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    } as never);
  });

  it("ComingSoon DEGIL gercek Taseron Hakedisi gorunumunu basar", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <TaseronHakedisPage />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Taşeron Hakedişi" })).toBeInTheDocument();
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
  });
});
