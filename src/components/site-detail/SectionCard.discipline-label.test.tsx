import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SectionCard } from "./SectionCard";
import type { SectionResponse } from "./SectionCard";

// DSC-F3a — kısıtlıda fiziksel % etiketi "Fiziksel (disiplinlerim)", kısıtsızda bugünkü metin.
const session = vi.hoisted(() => ({ disciplines: [] as { id: string; code: string; name: string; color: string }[] }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u1", disciplines: session.disciplines }, isLoading: false }),
}));

const KAB = { id: "a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };

const SECTION: SectionResponse = {
  id: "55555555-5555-5555-5555-555555555555",
  code: "A-01",
  name: "Kat 6–10 Kaba İnşaat",
  status: "active",
  manager_name: "Sercan Öztürk",
  start_date: "2026-01-01",
  end_date: "2026-09-30",
  sort_order: 0,
  depends_on_section_id: null,
  milestones: [],
  progress_pct: { available: false, value: null, pending_module: "progress_payments" },
  boq_item_count: { available: false, count: null, pending_module: "boq" },
  budget: { available: false, value: null, pending_module: "boq" },
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  planned_worker_count: null,
};

beforeEach(() => {
  session.disciplines = [];
});

describe("SectionCard İlerleme etiketi — DSC-F3a", () => {
  it("kısıtsız: 'İlerleme' aynen", () => {
    render(<SectionCard projectKey="p-1" siteKey="s-1" section={SECTION} />);
    expect(screen.getByText("İlerleme")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel (disiplinlerim)")).not.toBeInTheDocument();
  });

  it("kısıtlı: 'Fiziksel (disiplinlerim)'", () => {
    session.disciplines = [KAB];
    render(<SectionCard projectKey="p-1" siteKey="s-1" section={SECTION} />);
    expect(screen.getByText("Fiziksel (disiplinlerim)")).toBeInTheDocument();
    expect(screen.queryByText("İlerleme")).not.toBeInTheDocument();
  });
});
