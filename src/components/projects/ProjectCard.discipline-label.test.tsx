import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectCard } from "./ProjectCard";
import type { ProjectListItem } from "@/lib/api/hooks/useProjects";

// DSC-F3a — YALNIZ taahhüt kartının fiziksel çubuğu kısıtlıda "Fiziksel (disiplinlerim)" olur.
// B4 kapsamı dışı etiketler (Mali İlerleme · İnşaat İlerlemesi · Satış Oranı) DEĞİŞMEZ.
const session = vi.hoisted(() => ({ disciplines: [] as { id: string; code: string; name: string; color: string }[] }));
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { id: "u1", disciplines: session.disciplines }, isLoading: false }),
}));

const KAB = { id: "a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };
const PENDING = (m: string) => ({ available: false, value: null, pending_module: m });
const COUNT = (m: string) => ({ available: false, count: null, pending_module: m });

const BASE = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "GK-A",
  name: "Güneşkent A-Blok",
  project_type: "taahhut",
  status: "active",
  category: "Konut",
  city: "Ankara",
  employer_name: "Güneşkent A.Ş.",
  employer: null,
  contract: null,
  budget_lines: { material: "0", labor: "0", subcontractor: "0", overhead: "0" },
  is_draft: false,
  contract_no: "SZL-2025-01",
  contract_amount: "11200000.00",
  start_date: "2025-03-01",
  end_date: "2026-12-01",
  budget: "1000000.00",
  progress_pct: "75.00",
  contracting: null,
  investment: null,
  land_share: null,
};

const taahhut = {
  ...BASE,
  contracting: {
    spent: PENDING("project_costs"),
    physical_progress: PENDING("site_diary"),
    financial_progress: PENDING("progress_payments"),
    final_progress_payment: PENDING("progress_payments"),
    worker_count: COUNT("timesheet"),
    subcontractor_count: COUNT("subcontracts"),
  },
} as unknown as ProjectListItem;

const kendiYatirim = {
  ...BASE,
  project_type: "kendi_yatirim",
  name: "Yeşilvadi Rezidans",
  investment: {
    sales_target: "48200000.00",
    land_cost: "5000000.00",
    sold_amount: PENDING("units"),
    sales_ratio: PENDING("units"),
    unit_summary: COUNT("units"),
    total_cost: PENDING("project_costs"),
    estimated_profit: PENDING("progress_payments"),
    margin: PENDING("progress_payments"),
  },
} as unknown as ProjectListItem;

const katKarsiligi = {
  ...BASE,
  project_type: "kat_karsiligi",
  name: "Bahçelievler Konut",
  land_share: {
    landowner_name: "Yılmaz Ailesi",
    our_share_pct: "55.00",
    owner_share_pct: "45.00",
    land_cost: "0.00",
    contract_no: null,
    notary_date: null,
    land_area_m2: null,
    construction_area_m2: null,
    delivery_date: null,
    daily_penalty: null,
    guarantee_amount: null,
    shareholder_count: 0,
    shareholders: [],
    our_unit_count: COUNT("units"),
    owner_unit_count: COUNT("units"),
    our_share_value: PENDING("units"),
    construction_cost: PENDING("project_costs"),
    estimated_profit: PENDING("progress_payments"),
    margin: PENDING("progress_payments"),
    construction_progress: PENDING("progress_payments"),
  },
} as unknown as ProjectListItem;

beforeEach(() => {
  session.disciplines = [];
});

describe("ProjectCard fiziksel etiket — DSC-F3a", () => {
  it("taahhüt kısıtsız: 'Fiziksel İlerleme' + 'Mali İlerleme' aynen", () => {
    render(<ProjectCard project={taahhut} />);
    expect(screen.getByText("Fiziksel İlerleme")).toBeInTheDocument();
    expect(screen.getByText("Mali İlerleme")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel (disiplinlerim)")).not.toBeInTheDocument();
  });

  it("taahhüt kısıtlı: fiziksel çubuk 'Fiziksel (disiplinlerim)', Mali İlerleme DEĞİŞMEZ", () => {
    session.disciplines = [KAB];
    render(<ProjectCard project={taahhut} />);
    expect(screen.getByText("Fiziksel (disiplinlerim)")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel İlerleme")).not.toBeInTheDocument();
    expect(screen.getByText("Mali İlerleme")).toBeInTheDocument();
  });

  it("kat karşılığı kısıtlıda 'İnşaat İlerlemesi' DEĞİŞMEZ", () => {
    session.disciplines = [KAB];
    render(<ProjectCard project={katKarsiligi} />);
    expect(screen.getByText("İnşaat İlerlemesi")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel (disiplinlerim)")).not.toBeInTheDocument();
  });

  it("kendi yatırım kısıtlıda 'Satış Oranı' DEĞİŞMEZ (fiziksel değil)", () => {
    session.disciplines = [KAB];
    render(<ProjectCard project={kendiYatirim} />);
    expect(screen.getByText("Satış Oranı")).toBeInTheDocument();
    expect(screen.queryByText("Fiziksel (disiplinlerim)")).not.toBeInTheDocument();
  });
});
