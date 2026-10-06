import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { useContracts } from "@/lib/api/hooks/useContracts";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSubcontractorProgressPayments } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { SubcontractorsView } from "./SubcontractorsView";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSubcontractors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractors")>()),
  useSubcontractors: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useContracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContracts")>()),
  useContracts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")>()),
  useSubcontractorProgressPayments: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractorMutations", () => ({
  useCreateSubcontractor: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sozlesmeler/taseronlar",
  useSearchParams: () => new URLSearchParams(),
}));

const ADD_FIRM = "+ Taşeron Ekle";

function query<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

function renderView(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
  return render(<SubcontractorsView />);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSubcontractors).mockReturnValue(query({ items: [] }));
  vi.mocked(useContracts).mockReturnValue(
    query({
      summary: { total_amount: "0", active_count: 0, progress_payment_total: null, expiring_this_month_count: 0 },
      items: [],
    }),
  );
  vi.mocked(useSubcontractorProgressPayments).mockReturnValue(query({ items: [], total: 0, limit: 200, offset: 0 }));
});

// IZN-F5b · madde 7 — "+ Taşeron Ekle" = POST /subcontractors → teklif.taseron_firmalar VEYA teklif.sozlesmeler Düzenler.
describe("SubcontractorsView · '+ Taşeron Ekle' sayfa kapısı (IZN-F5b)", () => {
  it("teklif.taseron_firmalar Düzenler → düğme var", () => {
    renderView(meFixture({ pages: { "teklif.taseron_firmalar": pageGrant("edit") } }));
    expect(screen.getByRole("button", { name: ADD_FIRM })).toBeInTheDocument();
  });

  it("taşeron firmaları/sözleşmeler yalnız Görür, kardeş teklif sayfası Düzenler → düğme YOK", () => {
    renderView(
      meFixture({
        pages: {
          "teklif.taseron_firmalar": pageGrant("view"),
          "teklif.sozlesmeler": pageGrant("view"),
          "teklif.teklif_hazirlama": pageGrant("edit"),
        },
      }),
    );
    expect(screen.queryByRole("button", { name: ADD_FIRM })).toBeNull();
  });
});
