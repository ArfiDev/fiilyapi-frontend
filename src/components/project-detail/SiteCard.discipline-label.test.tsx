import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteCard } from "./SiteCard";
import type { SiteListItem } from "@/lib/api/hooks/useSites";
import { SITE_CONTRACT_DEFAULTS } from "@/lib/api/hooks/site-fixtures";

// DSC-F3a — kısıtlıda fiziksel % etiketi "Fiziksel (disiplinlerim)", kısıtsızda bugünkü metin.
const session = vi.hoisted(() => ({ disciplines: [] as { id: string; code: string; name: string; color: string }[] }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u1", all_projects: false, projects: [{ project_id: "p-1", role_key: "x", discipline_ids: session.disciplines.map((d) => d.id) }] }, isLoading: false }),
}));

const KAB = { id: "a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };

const SITE: SiteListItem = {
  ...SITE_CONTRACT_DEFAULTS,
  id: "22222222-2222-2222-2222-222222222222",
  code: "A-BLOK",
  name: "A-Blok Şantiyesi",
  status: "active",
  address: "Kuyubaşı Mah.",
  city: "Ankara",
  city_inherited: false,
  site_manager_name: "S. Öztürk",
  start_date: "2025-03-01",
  end_date: "2026-12-31",
  delivery_date: null,
  remaining_days: 157,
  section_count: 5,
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  progress_pct: { available: false, value: null, pending_module: "progress_payments" },
};

beforeEach(() => {
  session.disciplines = [];
});

describe("SiteCard KPI etiketi — DSC-F3a", () => {
  it("kısıtsız: 'İlerleme' aynen, disiplin metni YOK", () => {
    render(<SiteCard projectKey="p-1" projectType="taahhut" site={SITE} />);
    expect(screen.getByText("İlerleme")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel (disiplinlerim)")).not.toBeInTheDocument();
  });

  it("kısıtlı: 'Fiziksel (disiplinlerim)' basar, 'İlerleme' kalmaz", () => {
    session.disciplines = [KAB];
    render(<SiteCard projectKey="p-1" projectType="taahhut" site={SITE} />);
    expect(screen.getByText("Fiziksel (disiplinlerim)")).toBeInTheDocument();
    expect(screen.queryByText("İlerleme")).not.toBeInTheDocument();
  });
});
