import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { SubcontractorsView } from "./SubcontractorsView";
import { useContracts } from "@/lib/api/hooks/useContracts";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSubcontractorProgressPayments } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import type { ContractListItem } from "@/lib/api/hooks/useContracts";
import type { SubcontractorListItem } from "@/lib/api/hooks/useSubcontractors";
import type { SubcontractorProgressPaymentListItem } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { BackendError } from "@/lib/api/unwrap";

vi.mock("@/lib/api/hooks/useSubcontractors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractors")>()),
  useSubcontractors: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useContracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContracts")>()),
  useContracts: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")
  >()),
  useSubcontractorProgressPayments: vi.fn(),
}));
// Modal `useCreateSubcontractor` ile ağa çıkar — bu dosyada yalnız açılışı test edilir.
vi.mock("@/lib/api/hooks/useSubcontractorMutations", () => ({
  useCreateSubcontractor: () => ({ mutate: vi.fn(), isPending: false }),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => "/sozlesmeler/taseronlar",
  useSearchParams: () => new URLSearchParams(),
}));

const FIRMS: SubcontractorListItem[] = [
  {
    id: "sub-1",
    name: "Akın İnşaat Ltd. Şti.",
    tax_number: "1234567890",
    contact_person: "Akın Bey",
    phone: "0212 555 00 01",
    email: null,
    category: "Betonarme",
    is_active: true,
  },
  {
    id: "sub-2",
    name: "Yılmaz Elektrik A.Ş.",
    tax_number: "9876543210",
    contact_person: null,
    phone: null,
    email: null,
    category: "Elektrik",
    is_active: true,
  },
];

const CONTRACTS: ContractListItem[] = [
  {
    id: "sc-1",
    title: "Kaba Yapı",
    contract_no: "TSD-001",
    counterparty_name: "Akın İnşaat Ltd. Şti.",
    amount: "4820000.00",
    start_date: null,
    end_date: null,
    progress_pct: null,
    status: "active",
    is_draft: false,
    project_id: "p-1",
  },
];

const PAYMENTS: SubcontractorProgressPaymentListItem[] = [
  {
    id: "scpp-1",
    contract_id: "sc-1",
    project_id: "p-1",
    project_name: "Güneşkent",
    subcontractor_name: "Akın İnşaat Ltd. Şti.",
    contract_no: "TSD-001",
    work_category: "Betonarme",
    sequence_no: 1,
    period_year: 2026,
    period_month: 5,
    description: null,
    status: "paid",
    section_id: null,
    contract_site_id: null,
    created_at: "2026-05-01T00:00:00Z",
    gross_total: "3000000.00",
    net_total: "2940000.00",
    is_revision_required: false,
  },
  {
    id: "scpp-2",
    contract_id: "sc-1",
    project_id: "p-1",
    project_name: "Güneşkent",
    subcontractor_name: "Akın İnşaat Ltd. Şti.",
    contract_no: "TSD-001",
    work_category: "Betonarme",
    sequence_no: 2,
    period_year: 2026,
    period_month: 6,
    description: null,
    status: "pending_approval",
    section_id: null,
    contract_site_id: null,
    created_at: "2026-06-01T00:00:00Z",
    gross_total: "1300000.00",
    net_total: "1240000.00",
    is_revision_required: false,
  },
];

interface MockOptions {
  firms?: SubcontractorListItem[];
  contracts?: ContractListItem[];
  payments?: SubcontractorProgressPaymentListItem[];
  paymentTotal?: number;
}

function mockQueries({
  firms = FIRMS,
  contracts = CONTRACTS,
  payments = PAYMENTS,
  paymentTotal,
}: MockOptions = {}) {
  vi.mocked(useSubcontractors).mockReturnValue({
    data: { items: firms },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useContracts).mockReturnValue({
    data: {
      summary: {
        total_amount: "0",
        active_count: 0,
        progress_payment_total: null,
        expiring_this_month_count: 0,
      },
      items: contracts,
    },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
  vi.mocked(useSubcontractorProgressPayments).mockReturnValue({
    data: {
      items: payments,
      total: paymentTotal ?? payments.length,
      limit: 200,
      offset: 0,
    },
    isLoading: false,
    isError: false,
    error: null,
  } as never);
}

function rowOf(name: RegExp): HTMLElement {
  return screen.getByRole("row", { name });
}

describe("SubcontractorsView · TL taşeron firma listesi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueries();
  });

  it("başlık ve alt satır agregasyondan gelir (24)", () => {
    render(<SubcontractorsView />);
    expect(screen.getByRole("heading", { name: "Taşeron Listesi" })).toBeInTheDocument();
    expect(screen.getByText("2 taşeron firma · 1 aktif sözleşme")).toBeInTheDocument();
  });

  it("4 KPI'ı basar (35-38)", () => {
    render(<SubcontractorsView />);
    const strip = screen.getByTestId("tl-kpi-strip");
    expect(within(strip).getByText("Toplam Taşeron")).toBeInTheDocument();
    expect(within(strip).getByText("Aktif Sözleşme")).toBeInTheDocument();
    expect(within(strip).getByText("Bu Ay Ödeme")).toBeInTheDocument();
    expect(within(strip).getByText("Onay Bekleyen")).toBeInTheDocument();
    expect(screen.getByTestId("tl-kpi-pending-approval")).toHaveTextContent("1 Hakediş");
  });

  // kalan-6 no 322 — `isLoading`/`isError` yalnız tabloya geçiyordu; başlık
  // alt satırı ve KPI şeridi sorgular pending/hatalıyken de koşulsuz "0"
  // basıyordu ("0 taşeron firma", KPI'ların hepsi 0). Yükleniyorken sahte
  // sıfır basılmamalı.
  it("sorgular yükleniyorken başlık alt satırı ve KPI'lar sahte SIFIR basmaz", () => {
    vi.mocked(useSubcontractors).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as never);
    render(<SubcontractorsView />);
    expect(screen.queryByText("0 taşeron firma · 0 aktif sözleşme")).not.toBeInTheDocument();
    const strip = screen.getByTestId("tl-kpi-strip");
    expect(within(strip).queryByText("0")).not.toBeInTheDocument();
  });

  it("satır para kolonlarını üç kaynaktan birleştirir (58-61)", () => {
    render(<SubcontractorsView />);
    const row = rowOf(/Akın İnşaat/);
    expect(within(row).getByText("Betonarme")).toBeInTheDocument();
    // 56 · VKN + İletişim tek satırda
    expect(
      within(row).getByText("VKN: 1234567890 · İletişim: 0212 555 00 01"),
    ).toBeInTheDocument();
    expect(within(row).getByText("₺ 4,8M")).toBeInTheDocument(); // 59 bedel
    expect(within(row).getByText("₺ 2,9M")).toBeInTheDocument(); // 60 ödenen
    expect(within(row).getByTestId("tl-pending-money")).toHaveTextContent("₺ 1.240.000");
  });

  it("telefonu olmayan firmada alt satır yalnız VKN taşır (86)", () => {
    render(<SubcontractorsView />);
    expect(within(rowOf(/Yılmaz Elektrik/)).getByText("VKN: 9876543210")).toBeInTheDocument();
  });

  it("PUAN kolonu basılır ama hücreler '—' + gerekçedir (ONAYLI KARAR S4)", () => {
    render(<SubcontractorsView />);
    expect(screen.getByRole("columnheader", { name: "Puan" })).toBeInTheDocument();
    const cells = screen.getAllByTestId("tl-rating-pending");
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent("—");
    expect(cells[0]).toHaveAttribute("title", "Taşeron değerlendirme özelliği henüz yok");
    // Yıldız İCAT EDİLMEZ.
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
  });

  it("KIRPILMA: hakediş listesi eksikse para değerleri PENDING + bant görünür", () => {
    mockQueries({ paymentTotal: 412 });
    render(<SubcontractorsView />);

    expect(screen.getByTestId("tl-truncation-notice")).toBeInTheDocument();
    expect(screen.getByTestId("tl-kpi-month-payment")).toHaveTextContent("—");
    expect(screen.getByTestId("tl-kpi-pending-approval")).toHaveTextContent("—");
    expect(screen.getAllByTestId("tl-pending-money")[0]).toHaveTextContent("—");
    // Sözleşme türevleri kırpılmadan etkilenmez (uç sayfalanmıyor).
    expect(within(rowOf(/Akın İnşaat/)).getByText("₺ 4,8M")).toBeInTheDocument();
  });

  // M5_1 kayıt #339: hakediş ucu 403 (yetki eksikliği) verdiğinde eskiden
  // "liste eksik" gerekçesi ve YALNIZ kırpılma bandı basılıyordu — yetki
  // hatası "liste eksik" DEĞİLDİR, ayrı bir bant + gerekçe gerekir.
  it("403: hakediş ucu yetkisiz verince ayrı 'yetki yok' bant ve gerekçe basar", () => {
    vi.mocked(useSubcontractorProgressPayments).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new BackendError(403, { detail: "yasak" }),
    } as never);
    render(<SubcontractorsView />);

    expect(screen.getByTestId("tl-payment-forbidden-notice")).toHaveTextContent(
      "Hakediş listesini görüntüleme yetkiniz yok",
    );
    // Kırpılma bandı (liste eksik) AYNI anda basılmaz — sebep farklı.
    expect(screen.queryByTestId("tl-truncation-notice")).not.toBeInTheDocument();
    const pendingCell = screen.getAllByTestId("tl-pending-money")[0];
    expect(pendingCell).toHaveAttribute(
      "title",
      "Hakediş listesini görüntüleme yetkiniz yok — tutar hesaplanmadı",
    );
  });

  it("arama İSTEMCİDE süzer", () => {
    render(<SubcontractorsView />);
    fireEvent.change(screen.getByLabelText("Taşeron ara"), { target: { value: "Yılmaz" } });
    expect(screen.queryByText("Akın İnşaat Ltd. Şti.")).not.toBeInTheDocument();
    expect(screen.getByText("Yılmaz Elektrik A.Ş.")).toBeInTheDocument();
  });

  it("kategori süzgecinin seçenekleri gerçek veriden gelir ve süzer", () => {
    render(<SubcontractorsView />);
    const select = screen.getByLabelText("Kategori filtresi");
    expect(within(select).getByRole("option", { name: "Tüm Kategoriler" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Betonarme" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Elektrik" })).toBeInTheDocument();
    // Mockup 30'daki "Tesisat" seçeneği veride yok — artefakt, basılmaz.
    expect(within(select).queryByRole("option", { name: "Tesisat" })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: "Elektrik" } });
    expect(screen.queryByText("Akın İnşaat Ltd. Şti.")).not.toBeInTheDocument();
  });

  it("satır linki taşeron sözleşme detayına gider; sözleşmesizde devre dışıdır", () => {
    render(<SubcontractorsView />);
    expect(within(rowOf(/Akın İnşaat/)).getByRole("link", { name: "Detay →" })).toHaveAttribute(
      "href",
      "/sozlesmeler/taseron/sc-1",
    );
    const disabled = within(rowOf(/Yılmaz Elektrik/)).getByTestId("tl-detail-disabled");
    expect(disabled).toHaveAttribute("aria-disabled", "true");
  });

  it("eşleşmeyen sözleşme sessizce yutulmaz, görünür not basılır", () => {
    mockQueries({
      contracts: [
        ...CONTRACTS,
        { ...CONTRACTS[0], id: "sc-9", counterparty_name: "Kayıtsız Boya A.Ş." },
      ],
    });
    render(<SubcontractorsView />);
    expect(screen.getByTestId("tl-orphan-notice")).toBeInTheDocument();
  });

  it("AYNI ADLI iki firmada sözleşme hiçbir satıra yazılmaz, görünür not basılır", () => {
    mockQueries({
      firms: [...FIRMS, { ...FIRMS[0], id: "sub-3", tax_number: "5555555555" }],
    });
    render(<SubcontractorsView />);
    expect(screen.getByTestId("tl-ambiguous-notice")).toBeInTheDocument();
    // Aynı adı taşıyan İKİ satırın hiçbiri diğerinin sözleşmesini basmaz.
    for (const row of screen.getAllByTestId("tl-detail-disabled")) {
      expect(row).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("'+ Taşeron Ekle' paylaşılan modalı açar", () => {
    render(<SubcontractorsView />);
    fireEvent.click(screen.getByRole("button", { name: "+ Taşeron Ekle" }));
    expect(screen.getByRole("dialog", { name: "Yeni Taşeron Ekle" })).toBeInTheDocument();
  });

  it("firma yoksa boş durum, süzgeç eşleşmezse farklı boş durum gösterir", () => {
    mockQueries({ firms: [], contracts: [], payments: [] });
    const { unmount } = render(<SubcontractorsView />);
    expect(screen.getByText("Henüz taşeron firma yok")).toBeInTheDocument();
    unmount();

    mockQueries();
    render(<SubcontractorsView />);
    fireEvent.change(screen.getByLabelText("Taşeron ara"), { target: { value: "zzz" } });
    expect(screen.getByText("Süzgeçle eşleşen taşeron yok")).toBeInTheDocument();
  });
});
