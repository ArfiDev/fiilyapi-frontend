import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import HakedislerPage from "./page";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProgressPayments")>()),
  useProgressPayments: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

// F-PRJTAB T3: görünüm proje süzgecini URL'den okur ve süzgeç çubuğu proje
// listesini çeker.
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/hakedisler",
  useSearchParams: () => new URLSearchParams(),
}));

// P7 T2 brief: `/hakedisler` gercek rota eklenince [...slug] catch-all bu
// segment icin devre disi kalir — bu test, sayfanin ComingSoon YERİNE
// gercek hakedis listesini bastigini dogrular (catch-all'in kendisi Next.js
// dosya-tabanli yonlendirmenin bir garantisidir, ayrica test edilmez).
describe("HakedislerPage rotasi", () => {
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
    vi.mocked(useProgressPayments).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
  });

  it("ComingSoon DEGIL gercek Hakedisler gorunumunu basar", () => {
    render(<HakedislerPage />);
    expect(screen.getByRole("heading", { name: "Hakedişler" })).toBeInTheDocument();
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
  });
});
