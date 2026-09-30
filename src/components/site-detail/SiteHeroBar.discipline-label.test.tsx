import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { SiteHeroBar } from "./SiteHeroBar";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import { SITE_CONTRACT_DEFAULTS } from "@/lib/api/hooks/site-fixtures";

// DSC-F3a — kısıtlıda fiziksel % etiketi "Fiziksel (disiplinlerim)", kısıtsızda bugünkü metin.
const session = vi.hoisted(() => ({ disciplines: [] as { id: string; code: string; name: string; color: string }[] }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u1", disciplines: session.disciplines }, isLoading: false }),
}));

const KAB = { id: "a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };

const SITE: SiteDetail = {
  ...SITE_CONTRACT_DEFAULTS,
  id: "44444444-4444-4444-4444-444444444444",
  code: "A-BLOK",
  name: "A-Blok Şantiyesi",
  status: "active",
  address: "Kuyubaşı Mah.",
  city: "Ankara",
  city_inherited: false,
  site_manager_name: "Sercan Öztürk",
  start_date: "2025-03-01",
  end_date: "2026-12-31",
  delivery_date: null,
  remaining_days: 157,
  section_count: 5,
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  progress_pct: { available: false, value: null, pending_module: "progress_payments" },
  project: {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Güneşkent Konut",
    city: "Ankara",
    employer_name: "Güneşkent Gayrimenkul A.Ş.",
  },
  section_status_counts: { planned: 2, active: 1, completed: 2 },
  sections: [],
  total_progress_payment: { available: false, value: null, pending_module: "progress_payments" },
  contract_amount: { available: false, value: null, pending_module: "contracts" },
};

beforeEach(() => {
  session.disciplines = [];
});

describe("SiteHeroBar fiziksel etiket — DSC-F3a", () => {
  it("kısıtsız: 'Fiziksel İlerleme' aynen", () => {
    render(<SiteHeroBar site={SITE} />);
    const cell = screen.getByTestId("site-hero-kpi-progress");
    expect(within(cell).getByText("Fiziksel İlerleme")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel (disiplinlerim)")).not.toBeInTheDocument();
  });

  it("kısıtlı: 'Fiziksel (disiplinlerim)'", () => {
    session.disciplines = [KAB];
    render(<SiteHeroBar site={SITE} />);
    const cell = screen.getByTestId("site-hero-kpi-progress");
    expect(within(cell).getByText("Fiziksel (disiplinlerim)")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel İlerleme")).not.toBeInTheDocument();
  });
});
