import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { EmployerContractDetailView } from "./EmployerContractDetailView";
import {
  useEmployerContract,
  useEmployerContractItems,
  type EmployerContractDetail,
  type EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useProjectTimeline } from "@/lib/api/hooks/useProjectTimeline";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.y — işveren sözleşmesi poz yazma eylemleri sözleşme sayfaları Düzenler kapısından karar
// verir (POST/PATCH /projects/{id}/contract/items = backend `contracts:full`). Görüntüleme DEĞİŞMEZ.
vi.mock("@/lib/api/hooks/useContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContract")>()),
  useEmployerContract: vi.fn(),
  useEmployerContractItems: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProgressPayments")>()),
  useProgressPayments: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useContractMutations", () => ({
  useCreateEmployerContractItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateEmployerContractGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateEmployerContractItem: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useProjectTimeline", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjectTimeline")>()),
  useProjectTimeline: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sozlesmeler/isveren/p-1",
  useSearchParams: () => new URLSearchParams("tab=items"),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const SUMMARY: EmployerContractDetail["progress_payment_summary"] = {
  contract_amount: "11200000.00",
  cumulative_gross: "8400000.00",
  progress_pct: "75.00",
  advance_deduction_total: "1680000.00",
  retention_total: "420000.00",
  net_total: "6300000.00",
  payment_count: 5,
  pending_count: 1,
  remaining: "2800000.00",
};

const DETAIL: EmployerContractDetail = {
  project_id: "p-1",
  contract_no: "SZL-2025-001",
  signature_date: "2025-03-15",
  amount: "11200000.00",
  advance_pct: "20.00",
  retainage_pct: "5.00",
  vat_pct: "20.00",
  late_penalty_daily: "15000.00",
  has_price_escalation: true,
  index_type: "tufe",
  status: "active",
  start_date: "2025-04-01",
  end_date: "2026-12-31",
  employer_name: "Güneşkent Gayrimenkul A.Ş.",
  contractor_name: "FİİL Yapı Ltd. Şti.",
  items_total: "12054000.00",
  items_total_diff: "854000.00",
  advance_amount: "2240000.00",
  progress_payment_summary: SUMMARY,
  milestones: null,
  documents: null,
  pending_modules: [],
};

const ITEMS: EmployerContractItemsResponse = {
  groups: [
    {
      id: "cg-1",
      name: "A — Betonarme İşleri",
      sort_order: 0,
      items: [
        {
          id: "ci-1",
          group_id: "cg-1",
          code: "03.001",
          source_code: null,
          description: "Kat Döşemesi Betonu C25/30",
          unit: "m³",
          quantity: "3200.000",
          unit_price: "1850.00",
          sort_order: 0,
          catalog_item_id: null,
          distributed_quantity: "3200.000",
          remaining_quantity: "0.000",
        },
        {
          id: "ci-2",
          group_id: "cg-1",
          code: "03.002",
          source_code: null,
          description: "Kolon Betonu C30/37",
          unit: "m³",
          quantity: "620.000",
          unit_price: "2100.00",
          sort_order: 1,
          catalog_item_id: null,
          distributed_quantity: "400.000",
          remaining_quantity: "220.000",
        },
      ],
    },
  ],
};

function queryStub<T>(data: T) {
  return { data, isLoading: false, isError: false, error: null } as never;
}

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

const ADD_ITEM = "ecd-add-item";
const ADD_ROW = "ecd-add-row-cg-1";
const PRICE_CELL = "03.001 birim fiyatı";

describe("EmployerContractDetailView · sayfa izni kapısı (IZN-F2.y)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useEmployerContract).mockReturnValue(queryStub(DETAIL));
    vi.mocked(useEmployerContractItems).mockReturnValue(queryStub(ITEMS));
    vi.mocked(useProgressPayments).mockReturnValue(queryStub({ items: [] }));
    vi.mocked(useProject).mockReturnValue(queryStub({ id: "p-1", name: "Güneşkent Konut" }));
    vi.mocked(useProjectTimeline).mockReturnValue(queryStub({ today: "2026-07-17", items: [] }));
  });

  it("teklif.isveren_sozlesme Düzenler → '+ Poz Ekle', '+ Satır Ekle' var, hücre düzenlenebilir", () => {
    session(meFixture({ pages: { "teklif.isveren_sozlesme": pageGrant("edit") } }));
    render(<EmployerContractDetailView projectId="p-1" />);
    expect(screen.getByTestId(ADD_ITEM)).toBeInTheDocument();
    expect(screen.getByTestId(ADD_ROW)).toBeInTheDocument();
    expect(screen.getByLabelText(PRICE_CELL)).toBeEnabled();
  });

  it("proje.is_kalemleri Düzenler (VEYA kümesi) → '+ Poz Ekle' var", () => {
    session(meFixture({ pages: { "proje.is_kalemleri": pageGrant("edit") } }));
    render(<EmployerContractDetailView projectId="p-1" />);
    expect(screen.getByTestId(ADD_ITEM)).toBeInTheDocument();
  });

  // IZN-F5b · madde 7 — EMPLOYER_CONTRACT_EDIT = (teklif.isveren_sozlesme, proje.is_kalemleri); kardeş sayfa yazdırmaz.
  // (Hedef sayfaların hücresi VAR olmalı: hücresiz kapı eski karara düşer — burada Görür.)
  it("teklif.taseron_sozlesme Düzenler, işveren sözleşmesi sayfaları Görür → yazma eylemleri YOK, hücreler salt-okunur", () => {
    session(
      meFixture({
        pages: {
          "teklif.isveren_sozlesme": pageGrant("view"),
          "proje.is_kalemleri": pageGrant("view"),
          "teklif.taseron_sozlesme": pageGrant("edit"),
        },
      }),
    );
    render(<EmployerContractDetailView projectId="p-1" />);
    expect(screen.queryByTestId(ADD_ITEM)).toBeNull();
    expect(screen.queryByTestId(ADD_ROW)).toBeNull();
    expect(screen.getByLabelText(PRICE_CELL)).toBeDisabled();
  });

  it("Görür → yazma eylemleri YOK, hücreler salt-okunur, poz listesi görünür", () => {
    session(meFixture({ pages: { "teklif.isveren_sozlesme": pageGrant("view", true) } }));
    render(<EmployerContractDetailView projectId="p-1" />);
    expect(screen.queryByTestId(ADD_ITEM)).toBeNull();
    expect(screen.queryByTestId(ADD_ROW)).toBeNull();
    expect(screen.getByLabelText(PRICE_CELL)).toBeDisabled();
    expect(screen.getByLabelText("03.001 poz adı")).toHaveValue("Kat Döşemesi Betonu C25/30");
  });

  it("pages boş → bugünkü davranış: eylemler var", () => {
    session(meFixture({ pages: {} }));
    render(<EmployerContractDetailView projectId="p-1" />);
    expect(screen.getByTestId(ADD_ITEM)).toBeInTheDocument();
    expect(screen.getByTestId(ADD_ROW)).toBeInTheDocument();
    expect(screen.getByLabelText(PRICE_CELL)).toBeEnabled();
  });

  it("sistem yöneticisi: grant none olsa da eylemler var", () => {
    session(meFixture({ pages: { "teklif.isveren_sozlesme": pageGrant("none") }, isSystemAdmin: true }));
    render(<EmployerContractDetailView projectId="p-1" />);
    expect(screen.getByTestId(ADD_ITEM)).toBeInTheDocument();
  });
});
