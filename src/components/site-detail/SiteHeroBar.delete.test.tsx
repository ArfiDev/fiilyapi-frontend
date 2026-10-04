import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SiteHeroBar } from "./SiteHeroBar";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import { SITE_CONTRACT_DEFAULTS } from "@/lib/api/hooks/site-fixtures";

// SIL-F1.2 — "Sil" düğmesi yalnız Sistem Yöneticisine görünür.
const session = vi.hoisted(() => ({ me: null as { is_system_admin?: boolean } | null }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: session.me, isLoading: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const SITE: SiteDetail = {
  ...SITE_CONTRACT_DEFAULTS,
  id: "44444444-4444-4444-4444-444444444444",
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
  project: { id: "11111111-1111-1111-1111-111111111111", name: "Güneşkent Konut", city: "Ankara", employer_name: null },
  section_status_counts: { planned: 0, active: 0, completed: 0 },
  sections: [],
  total_progress_payment: { available: false, value: null, pending_module: "progress_payments" },
  contract_amount: { available: false, value: null, pending_module: "contracts" },
};

function renderHero() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SiteHeroBar site={SITE} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  session.me = null;
});

describe("SiteHeroBar — Sil düğmesi (SIL-F1.2)", () => {
  it("is_system_admin=false iken Sil YOKTUR", () => {
    session.me = { is_system_admin: false };
    renderHero();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("is_system_admin=true iken Sil vardır", () => {
    session.me = { is_system_admin: true };
    renderHero();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });
});
