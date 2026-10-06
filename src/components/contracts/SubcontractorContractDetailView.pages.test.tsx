import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SubcontractorContractDetailView } from "./SubcontractorContractDetailView";
import {
  useSubcontractorContract,
  type SubcontractorContractDetail,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import {
  useSubcontractorContractPayments,
  useSubcontractorPaymentLines,
} from "@/lib/api/hooks/useSubcontractorContractPayments";
import {
  useCreateSubcontractorContractItem,
  useUpdateSubcontractorContract,
  useUpdateSubcontractorContractItem,
} from "@/lib/api/hooks/useSubcontractorContractMutations";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useEmployerContract } from "@/lib/api/hooks/useContract";
import { useProject } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

// IZN-F2.y — taşeron sözleşmesi yazma eylemleri (poz ekle / birim fiyat / şartlar Kaydet) sözleşme
// sayfaları Düzenler kapısından karar verir (backend `contracts:full`). Görüntüleme DEĞİŞMEZ.
vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")>()),
  useSubcontractorContract: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractorContractPayments", () => ({
  useSubcontractorContractPayments: vi.fn(),
  useSubcontractorPaymentLines: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractorContractMutations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractorContractMutations")>()),
  useCreateSubcontractorContractItem: vi.fn(),
  useUpdateSubcontractorContract: vi.fn(),
  useUpdateSubcontractorContractItem: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractors")>()),
  useSubcontractors: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useContract", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContract")>()),
  useEmployerContract: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProject: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSites: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/sozlesmeler/taseron/sc-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const CONTRACT_ID = "sc-1";
const SUBCONTRACTOR_ID = "sub-1";

const DETAIL: SubcontractorContractDetail = {
  id: CONTRACT_ID,
  project_id: "p-1",
  site_id: "s-1",
  subcontractor_id: SUBCONTRACTOR_ID,
  subcontractor_name: "Akın İnşaat Ltd. Şti.",
  work_category: "Betonarme",
  contract_no: "TSZ-2025-001",
  signature_date: "2025-04-01",
  is_notarized: true,
  start_date: "2025-04-01",
  end_date: "2026-12-31",
  late_penalty_daily: "5000.00",
  advance_pct: "10.00",
  retainage_pct: "5.00",
  vat_pct: "20.00",
  payment_period: "monthly",
  payment_term_days: 30,
  materials_by_contractor: false,
  subcontractor_files_own_sgk: true,
  vat_withholding: false,
  status: "active",
  is_draft: false,
  items: [
    {
      id: "sci-1",
      contract_id: CONTRACT_ID,
      source_contract_item_id: null,
      code: "03.001",
      source_code: null,
      description: "Kat Döşemesi Betonu C25/30",
      unit: "m³",
      quantity: "1200.000",
      unit_price: "1200.00",
      sort_order: 0,
      group: { id: "g-1", name: "A — Betonarme İşleri" },
      line_total: "1440000.00",
    },
    {
      id: "sci-2",
      contract_id: CONTRACT_ID,
      source_contract_item_id: null,
      code: "03.002",
      source_code: null,
      description: "Kolon Betonu C30/37",
      unit: "m³",
      quantity: "340.000",
      unit_price: null,
      sort_order: 1,
      group: { id: "g-1", name: "A — Betonarme İşleri" },
      line_total: "0.00",
    },
  ],
  // 🛑 tfoot TEK KAYNAK — mockup başlığındaki ₺4.820.000 ile BİLEREK farklı.
  contract_total: "3281500.00",
  items_missing_price: 1,
  progress_payment_summary: null,
  documents: null,
  pending_modules: [],
};

function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

function renderView(me: ReturnType<typeof meFixture>) {
  session(me);
  vi.mocked(useSubcontractorContract).mockReturnValue({
    data: DETAIL, isError: false, isLoading: false, error: null,
  } as never);
  vi.mocked(useSubcontractorContractPayments).mockReturnValue({
    items: [],
    isLoading: false,
    isError: false,
    isPartial: false,
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
    cumulativeGross: "0",
  } as never);
  vi.mocked(useSubcontractorPaymentLines).mockReturnValue({ isPending: false, lines: [] } as never);
  vi.mocked(useSubcontractors).mockReturnValue({
    data: { items: [] }, isLoading: false, isError: false,
  } as never);
  vi.mocked(useEmployerContract).mockReturnValue({
    data: { contract_no: "SZL-2025-001", employer_name: "Güneşkent" }, isLoading: false, isError: false,
  } as never);
  vi.mocked(useProject).mockReturnValue({ data: { name: "Güneşkent Konut" } } as never);
  vi.mocked(useSites).mockReturnValue({ data: { items: [] } } as never);
  vi.mocked(useUpdateSubcontractorContract).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useUpdateSubcontractorContractItem).mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  vi.mocked(useCreateSubcontractorContractItem).mockReturnValue({
    mutateAsync: vi.fn(), isPending: false,
  } as never);
  return render(<SubcontractorContractDetailView contractId={CONTRACT_ID} />);
}

const ADD_ITEM = "tsd-add-item";
const SAVE_TERMS = "tsd-terms-save";
const PRICE_CELL = "03.001 taşeron birim fiyatı";

describe("SubcontractorContractDetailView · sayfa izni kapısı (IZN-F2.y)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("teklif.taseron_sozlesme Düzenler → '+ Poz Ekle', şart 'Kaydet' var, fiyat hücresi düzenlenebilir", () => {
    renderView(meFixture({ pages: { "teklif.taseron_sozlesme": pageGrant("edit") } }));
    expect(screen.getByTestId(ADD_ITEM)).toBeInTheDocument();
    expect(screen.getByTestId(SAVE_TERMS)).toBeInTheDocument();
    expect(screen.getByLabelText(PRICE_CELL)).toBeEnabled();
  });

  // IZN-F5b · madde 7 — SUBCONTRACTOR_CONTRACT_EDIT yalnız teklif.taseron_sozlesme; kardeş sayfa yazdırmaz.
  // (Hedef sayfanın hücresi VAR olmalı: hücresiz kapı eski karara düşer — burada Görür.)
  it("teklif.sozlesmeler Düzenler, taşeron sözleşme sayfası Görür → yazma eylemleri YOK, fiyat hücresi salt-okunur", () => {
    renderView(
      meFixture({ pages: { "teklif.taseron_sozlesme": pageGrant("view"), "teklif.sozlesmeler": pageGrant("edit") } }),
    );
    expect(screen.queryByTestId(ADD_ITEM)).toBeNull();
    expect(screen.queryByTestId(SAVE_TERMS)).toBeNull();
    expect(screen.getByLabelText(PRICE_CELL)).toBeDisabled();
  });

  it("Görür → yazma eylemleri YOK, fiyat hücresi salt-okunur, poz listesi görünür", () => {
    renderView(meFixture({ pages: { "teklif.taseron_sozlesme": pageGrant("view", true) } }));
    expect(screen.queryByTestId(ADD_ITEM)).toBeNull();
    expect(screen.queryByTestId(SAVE_TERMS)).toBeNull();
    expect(screen.getByLabelText(PRICE_CELL)).toBeDisabled();
    expect(screen.getByText("Kat Döşemesi Betonu C25/30")).toBeInTheDocument();
  });

  it("pages boş → bugünkü davranış: eylemler var", () => {
    renderView(meFixture({ pages: {} }));
    expect(screen.getByTestId(ADD_ITEM)).toBeInTheDocument();
    expect(screen.getByTestId(SAVE_TERMS)).toBeInTheDocument();
    expect(screen.getByLabelText(PRICE_CELL)).toBeEnabled();
  });

  it("sistem yöneticisi: grant none olsa da eylemler var", () => {
    renderView(meFixture({ pages: { "teklif.taseron_sozlesme": pageGrant("none") }, isSystemAdmin: true }));
    expect(screen.getByTestId(ADD_ITEM)).toBeInTheDocument();
    expect(screen.getByTestId(SAVE_TERMS)).toBeInTheDocument();
  });
});
