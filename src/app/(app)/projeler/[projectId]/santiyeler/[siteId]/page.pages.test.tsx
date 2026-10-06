import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import SiteDetailPage from "./page";
import { useSite } from "@/lib/api/hooks/useSites";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import { SITE_CONTRACT_DEFAULTS } from "@/lib/api/hooks/site-fixtures";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F5c — "+ Bölüm Ekle" bağlantıları (hero + boş durum) = santiye.bolumler Düzenler
// (POST /sites/{id}/sections). Önceden KAPISIZdı.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID, siteId: SITE_ID }),
  usePathname: () => `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}`,
}));

const SITE: SiteDetail = {
  ...SITE_CONTRACT_DEFAULTS,
  id: SITE_ID,
  code: "A-BLOK",
  name: "A-Blok Şantiyesi",
  status: "active",
  address: null,
  city: null,
  city_inherited: false,
  site_manager_name: null,
  start_date: null,
  end_date: null,
  delivery_date: null,
  remaining_days: null,
  section_count: 0,
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  progress_pct: { available: false, value: null, pending_module: "progress_payments" },
  project: { id: PROJECT_ID, name: "Güneşkent Konut", city: null, employer_name: null },
  section_status_counts: { planned: 0, active: 0, completed: 0 },
  sections: [],
  total_progress_payment: { available: false, value: null, pending_module: "progress_payments" },
  contract_amount: { available: false, value: null, pending_module: "contracts" },
};

const ADD = { name: "+ Bölüm Ekle" } as const;

function renderPage(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSite).mockReturnValue({ data: SITE, isLoading: false, isError: false, error: null } as never);
});

describe("SiteDetailPage · '+ Bölüm Ekle' sayfa kapısı (IZN-F5c)", () => {
  it("santiye.bolumler Düzenler → hero + boş durum bağlantıları var", () => {
    renderPage(meFixture({ pages: { "santiye.bolumler": pageGrant("edit") } }));
    expect(screen.getAllByRole("link", ADD)).toHaveLength(2);
  });

  it("santiye.bolumler Görür + bolum.detay Düzenler (eski kardeş) → bağlantı YOK", () => {
    renderPage(meFixture({ pages: { "santiye.bolumler": pageGrant("view"), "bolum.detay": pageGrant("edit") } }));
    expect(screen.queryAllByRole("link", ADD)).toHaveLength(0);
  });

  it("pages boş (eski oturum) → fail-closed: bağlantı yok (IZN-F6a)", () => {
    renderPage(meFixture({ pages: {} }));
    expect(screen.queryAllByRole("link", ADD)).toHaveLength(0);
  });
});
