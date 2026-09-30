import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { SectionHeroCard } from "./SectionHeroCard";
import type { SectionDetailResponse } from "@/lib/api/hooks/useSection";

// DSC-F3a — kısıtlıda fiziksel % etiketi "Fiziksel (disiplinlerim)", kısıtsızda bugünkü metin.
// (Büyük harf görünümü CSS `text-transform`dan gelir; DOM metni bugünkü yazım biçiminde kalır.)
const session = vi.hoisted(() => ({ disciplines: [] as { id: string; code: string; name: string; color: string }[] }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u1", disciplines: session.disciplines }, isLoading: false }),
}));

const KAB = { id: "a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };
const SITE_ID = "44444444-4444-4444-4444-444444444444";

const SECTION: SectionDetailResponse = {
  id: "55555555-5555-5555-5555-555555555555",
  code: "A-01",
  name: "Kat 6–10 Kaba İnşaat",
  status: "active",
  manager_user_id: null,
  manager_name: "Sercan Öztürk",
  start_date: "2026-01-01",
  end_date: "2026-09-30",
  sort_order: 3,
  depends_on_section_id: null,
  milestones: [],
  progress_pct: { available: false, value: null, pending_module: "boq" },
  boq_item_count: { available: false, count: null, pending_module: "boq" },
  budget: { available: false, value: null, pending_module: "boq" },
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  site_id: SITE_ID,
  section_type: "structural",
  description: null,
  deputy_manager_user_id: null,
  deputy_manager_name: null,
  planned_worker_count: null,
  budget_amount: "3520000.00",
  is_draft: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function renderHero() {
  return render(
    <SectionHeroCard
      section={SECTION}
      siteName="A-Blok Şantiyesi"
      projectKey="p-1"
      siteKey="s-1"
      sectionKey="sec-1"
      projectId="p-1"
      canEdit={false}
    />,
  );
}

beforeEach(() => {
  session.disciplines = [];
});

describe("SectionHeroCard fiziksel etiket — DSC-F3a", () => {
  it("kısıtsız: 'Fiziksel İlerleme' aynen", () => {
    renderHero();
    const cell = screen.getByTestId("section-hero-kpi-progress");
    expect(within(cell).getByText("Fiziksel İlerleme")).toBeInTheDocument();
  });

  it("kısıtlı: 'Fiziksel (disiplinlerim)'", () => {
    session.disciplines = [KAB];
    renderHero();
    const cell = screen.getByTestId("section-hero-kpi-progress");
    expect(within(cell).getByText("Fiziksel (disiplinlerim)")).toBeInTheDocument();
    expect(within(cell).queryByText("Fiziksel İlerleme")).not.toBeInTheDocument();
  });
});
