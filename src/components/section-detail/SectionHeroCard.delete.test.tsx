import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SectionHeroCard } from "./SectionHeroCard";
import type { SectionDetailResponse } from "@/lib/api/hooks/useSection";

// SIL-F1.2 — "Sil" düğmesi yalnız Sistem Yöneticisine görünür.
const session = vi.hoisted(() => ({ me: null as { is_system_admin?: boolean } | null }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: session.me, isLoading: false }),
}));
vi.mock("next/navigation", () => ({ useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }));

const SECTION: SectionDetailResponse = {
  id: "55555555-5555-5555-5555-555555555555",
  code: "A-01",
  name: "Kat 6–10 Kaba İnşaat",
  status: "active",
  manager_user_id: null,
  manager_name: null,
  start_date: null,
  end_date: null,
  sort_order: 3,
  depends_on_section_id: null,
  milestones: [],
  progress_pct: { available: false, value: null, pending_module: "boq" },
  boq_item_count: { available: false, count: null, pending_module: "boq" },
  budget: { available: false, value: null, pending_module: "boq" },
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  site_id: "44444444-4444-4444-4444-444444444444",
  section_type: { id: "type-structural", name: "Kaba İnşaat" },
  description: null,
  deputy_manager_user_id: null,
  deputy_manager_name: null,
  planned_worker_count: null,
  is_draft: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderHero() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <SectionHeroCard
        section={SECTION}
        siteName="A-Blok Şantiyesi"
        projectKey="p-1"
        siteKey="s-1"
        sectionKey="sec-1"
        projectId="p-1"
        canEdit={false}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  session.me = null;
});

describe("SectionHeroCard — Sil düğmesi (SIL-F1.2)", () => {
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
