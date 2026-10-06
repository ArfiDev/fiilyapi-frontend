import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlockCreateView } from "@/components/block-form/BlockCreateView";
import { BulkUnitCreateView } from "@/components/bulk-unit-form/BulkUnitCreateView";
import { LandShareAllocationView } from "@/components/land-share-allocation/LandShareAllocationView";
import { useSession } from "@/components/shell/SessionProvider";
import { UnitCreateView } from "@/components/unit-form/UnitCreateView";
import { UnitImportView } from "@/components/unit-import/UnitImportView";
import type { PageKey } from "@/lib/api/models";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5b-A madde 2 — satış form ekranlarının YAZMA kapısı SEKME BAŞINA: her ekran yalnız kendi
// mali.satis_* sayfası Düzenler iken açılır; kardeş sekmenin Düzenler'i (eski toplu küme) AÇMAZ.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/x",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const DENIED = "Bu alana yetkiniz yok";
const SALES_TABS = [
  "mali.satis_blok",
  "mali.satis_unite",
  "mali.satis_toplu_uretim",
  "mali.satis_excel",
  "mali.satis_paylasim",
] as const satisfies readonly PageKey[];

const SCREENS: ReadonlyArray<{ name: string; View: ComponentType; page: (typeof SALES_TABS)[number] }> = [
  { name: "BlockCreateView", View: BlockCreateView, page: "mali.satis_blok" },
  { name: "UnitCreateView", View: UnitCreateView, page: "mali.satis_unite" },
  { name: "BulkUnitCreateView", View: BulkUnitCreateView, page: "mali.satis_toplu_uretim" },
  { name: "UnitImportView", View: UnitImportView, page: "mali.satis_excel" },
  { name: "LandShareAllocationView", View: LandShareAllocationView, page: "mali.satis_paylasim" },
];

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView(View: ComponentType) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <View />
    </QueryClientProvider>,
  );
}

describe("satış formları · sekme başına yazma kapısı (IZN-F5b-A madde 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  describe.each(SCREENS)("$name", ({ View, page }) => {
    it("yalnız kendi sayfası Düzenler → ekran açılır (modül none olsa da)", () => {
      session(meFixture({ pages: { [page]: pageGrant("edit") }, permissions: { projects: "none" } }));
      renderView(View);
      expect(screen.queryByText(DENIED)).toBeNull();
    });

    it("yalnız KARDEŞ sekmeler Düzenler, kendi sayfası Görür → AccessDenied", () => {
      const siblings = SALES_TABS.filter((key) => key !== page);
      const pages = Object.fromEntries([
        [page, pageGrant("view")],
        ...siblings.map((key) => [key, pageGrant("edit")] as const),
      ]);
      session(meFixture({ pages, permissions: { projects: "full" } }));
      renderView(View);
      expect(screen.getByText(DENIED)).toBeInTheDocument();
    });
  });
});
