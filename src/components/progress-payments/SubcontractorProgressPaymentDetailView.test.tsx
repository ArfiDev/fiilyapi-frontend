import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SubcontractorProgressPaymentDetailView } from "./SubcontractorProgressPaymentDetailView";
import {
  useSubcontractorContract,
  useSubcontractorProgressPayment,
  type SubcontractorProgressPaymentDetail,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSession } from "@/components/shell/SessionProvider";
import type { MeResponse } from "@/lib/auth/types";
import { SUBCONTRACTOR_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useSubcontractorProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")>()),
  useSubcontractorProgressPayment: vi.fn(),
  useSubcontractorContract: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// SIL-F2.2 · yalnız Sistem Yöneticisi için çizilen "Sil" düğmesi `useRouter` kullanır.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn() }),
}));

const BASE_ME = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  email: "ayse@ornek.com",
  full_name: "Ayşe Yılmaz",
  title: null,
  role_key: "procurement",
  status: "active",
} as unknown as MeResponse;

function mockSession(permissions?: Record<string, string>) {
  // IZN-F6a.3 · eski modül seviyesi niyeti sayfa izni olarak kurulur (`undefined` = tam yetkili oturum, SA).
  const level = permissions?.progress_payments;
  const me =
    permissions === undefined
      ? meFixture({ isSystemAdmin: true })
      : meFixture({ pages: levelPages(SUBCONTRACTOR_PAYMENT_EDIT, level), isSystemAdmin: level === "admin" });
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
}

const PAYMENT_ID = "22222222-2222-2222-2222-222222222222";

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SubcontractorProgressPaymentDetailView paymentId={PAYMENT_ID} />
    </QueryClientProvider>,
  );
}

function mockDetailQuery(value: Partial<ReturnType<typeof useSubcontractorProgressPayment>>) {
  vi.mocked(useSubcontractorProgressPayment).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

function mockContractQuery(value: Partial<ReturnType<typeof useSubcontractorContract>>) {
  vi.mocked(useSubcontractorContract).mockReturnValue({
    data: undefined,
    isLoading: false,
    isSuccess: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

function mockSiteQuery(value: Partial<ReturnType<typeof useSite>>) {
  vi.mocked(useSite).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

const baseDetail: SubcontractorProgressPaymentDetail = {
  id: PAYMENT_ID,
  contract_id: "33333333-3333-3333-3333-333333333333",
  project_id: "44444444-4444-4444-4444-444444444444",
  project_name: "Güneşkent Konut",
  subcontractor_name: "Aydın Elektrik Taah.",
  contract_no: "SZL-2025-001",
  work_category: "Kaba İnşaat",
  sequence_no: 5,
  period_year: 2026,
  period_month: 7,
  description: "Kaba inşaat",
  status: "draft",
  vat_pct: "20.00",
  advance_pct: "20.00",
  retainage_pct: "5.00",
  default_coefficient: "1.00",
  section_id: null,
  submitted_at: null,
  approved_at: null,
  approved_by: null,
  paid_at: null,
  rejected_at: null,
  rejection_reason: null,
  is_revision_required: false,
  created_by: "55555555-5555-5555-5555-555555555555",
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  lines: [
    {
      id: "l-1",
      contract_item_id: "ci-1",
      code: "A-01",
      source_code: null,
      description: "Kablo tesisatı",
      unit: "m",
      contract_unit_price: "100.00",
      coefficient: "1.00",
      quantity: "500.00",
      group_name: "Elektrik",
      sort_order: 1,
      quantity_source: "manual",
      adjusted_unit_price: "100.00",
      line_total: "50000.00",
    },
  ],
  calculation: {
    gross: "2010000.00",
    vat: "422000.00",
    advance_deduction: "422000.00",
    retention: "105500.00",
    net: "2004500.00",
  },
  dropped_orphan_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockContractQuery({});
  mockSiteQuery({});
});

describe("SubcontractorProgressPaymentDetailView — yukleniyor/hata", () => {
  it("yuklenirken mesaj basar", () => {
    mockSession();
    mockDetailQuery({ isLoading: true });
    renderDetail();
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("hata durumunda mesaj basar", () => {
    mockSession();
    mockDetailQuery({ isError: true });
    renderDetail();
    expect(screen.getByText("Hakediş yüklenemedi")).toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentDetailView — başlık şeridi", () => {
  it("H1 'Taşeron Hakedişi #N' basar", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.getByRole("heading", { name: "Taşeron Hakedişi #5" })).toBeInTheDocument();
  });

  it("← Hakedişler linki /hakedisler/taseron'a doner", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.getByRole("link", { name: "← Hakedişler" })).toHaveAttribute(
      "href",
      "/hakedisler/taseron",
    );
  });

  it("is_revision_required true iken 'Revize Gerekli' rozeti basilir", () => {
    mockSession();
    mockDetailQuery({ data: { ...baseDetail, is_revision_required: true } });
    renderDetail();
    expect(screen.getByText("Revize Gerekli")).toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentDetailView — Düzenle linki", () => {
  it("draft + yazma izni varken görünür", () => {
    mockSession({ progress_payments: "full" });
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.getByRole("link", { name: "Düzenle" })).toHaveAttribute(
      "href",
      `/hakedisler/taseron/${PAYMENT_ID}/duzenle`,
    );
  });

  it("draft olmayan durumda görünmez", () => {
    mockSession({ progress_payments: "full" });
    mockDetailQuery({ data: { ...baseDetail, status: "approved" } });
    renderDetail();
    expect(screen.queryByRole("link", { name: "Düzenle" })).not.toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentDetailView — PDF butonu (ölü yüzey yasağı)", () => {
  it("her zaman basılır ama disabled'dır, nedeni title'da görünür", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    const pdfButton = screen.getByRole("button", { name: "PDF" });
    expect(pdfButton).toBeDisabled();
    expect(pdfButton).toHaveAttribute("title", "Dışa aktarma ucu henüz açılmadı");
  });
});

describe("SubcontractorProgressPaymentDetailView — Ödeme Hesabı (etiketler şemadan)", () => {
  it("beş satırı ve taşerona özgü etiketleri basar", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.getByText("Ödeme Hesabı")).toBeInTheDocument();
    // Final inceleme F-2: Ödeme Hesabı'nın brüt satırı "Brüt Hakediş"tir (BU
    // hakedişin brütü); "Toplam Hakediş" YALNIZ KPI'da (sözleşme kümülatifi)
    // kalır — aynı etiket iki farklı tutarda KULLANILMAZ.
    expect(screen.getByText("Brüt Hakediş")).toBeInTheDocument();
    expect(screen.getAllByText("Toplam Hakediş")).toHaveLength(1);
    expect(screen.getByText("KDV (%20)")).toBeInTheDocument();
    expect(screen.getByText("Avans Kesintisi (%20)")).toBeInTheDocument();
    expect(screen.getByText("Teminat Kesintisi (%5)")).toBeInTheDocument();
    expect(screen.getByText("Net Ödenecek")).toBeInTheDocument();
    expect(screen.getByText("₺ 2.004.500")).toBeInTheDocument();
    // "Net Tahsil" (İşveren etiketi) BASILMAZ — taşeron ekranı ödeme YAPAR.
    expect(screen.queryByText("Net Tahsil")).not.toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentDetailView — zarif düşüşler (schema karşılığı yok)", () => {
  it("'Toplam Hakediş'/'Kalan' KPI kartları pending basılır, kart SİLİNMEZ", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    const kpis = screen.getAllByTestId("th-detail-kpi");
    expect(kpis).toHaveLength(3);
    expect(kpis[1]).toHaveTextContent("Toplam Hakediş");
    expect(kpis[2]).toHaveTextContent("Kalan");
  });

  it("Sözleşme İlerlemesi kartı basılır, üç çubuk pending gösterir", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.getByText("Sözleşme İlerlemesi")).toBeInTheDocument();
    expect(screen.getByText("Finansal")).toBeInTheDocument();
    expect(screen.getByText("Fiziksel")).toBeInTheDocument();
    expect(screen.getByText("Süre")).toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentDetailView — kalem tablosu", () => {
  it("grup başlığı + kalem satırı + Ara Toplam basılır", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.getByText("Elektrik")).toBeInTheDocument();
    expect(screen.getByText(/Kablo tesisatı/)).toBeInTheDocument();
    expect(screen.getByText("Ara Toplam")).toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentDetailView — reddedilme bandı", () => {
  it("rejection_reason doluysa uyarı basılır", () => {
    mockSession();
    mockDetailQuery({
      data: {
        ...baseDetail,
        status: "draft",
        is_revision_required: true,
        rejection_reason: "Eksik metraj",
        rejected_at: "2026-07-15T10:30:00Z",
      },
    });
    renderDetail();
    expect(screen.getByTestId("th-detail-rejection-alert")).toHaveTextContent("Eksik metraj");
    expect(screen.getByTestId("th-detail-rejection-alert")).toHaveTextContent("15.07.2026");
  });

  it("rejection_reason yoksa uyarı basılmaz", () => {
    mockSession();
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.queryByTestId("th-detail-rejection-alert")).not.toBeInTheDocument();
  });
});

describe("SubcontractorProgressPaymentDetailView — düşürülen kalem uyarısı", () => {
  it("dropped_orphan_count > 0 iken uyarı basılır", () => {
    mockSession();
    mockDetailQuery({ data: { ...baseDetail, dropped_orphan_count: 2 } });
    renderDetail();
    expect(screen.getByTestId("th-detail-orphan-alert")).toHaveTextContent(
      "Sözleşmeden kaldırılan 2 kalem bu hakedişten düşürüldü.",
    );
  });
});

// KAT-F2.4 · Q4: taşeron hakediş detayında poz KODUNUN HEMEN ALTINDA Bakanlık poz no'su (satırın snapshot'ı).
describe("SubcontractorProgressPaymentDetailView — Bakanlık poz no'su", () => {
  it("kod doluysa poz kodunun altında basılır; null satırda HİÇBİR ŞEY", () => {
    mockSession();
    const [first] = baseDetail.lines;
    mockDetailQuery({
      data: {
        ...baseDetail,
        lines: [
          { ...first, source_code: "15.250.1011" },
          { ...first, id: "l-2", code: "A-02", source_code: null, sort_order: 2 },
        ],
      },
    });
    renderDetail();
    const subs = screen.getAllByTestId("thd-source-code");
    expect(subs).toHaveLength(1);
    expect(subs[0]).toHaveTextContent("15.250.1011");
    const codeCell = screen.getByText("A-01").closest("td");
    expect(codeCell).toContainElement(subs[0]);
    expect(screen.getByText("A-01").parentElement).toContainElement(subs[0]);
  });
});

// SIL-F2.2 · "Sil" düğmesi YALNIZ Sistem Yöneticisi (fail-closed).
describe("SubcontractorProgressPaymentDetailView — Sil düğmesi (SIL-F2.2)", () => {
  function mockAdmin(flag: boolean | undefined) {
    // Tam sayfa erişimli (Düzenler + Onaylar) ama SA olmayan oturum: Sil'i yalnız `is_system_admin` açar.
    const { is_system_admin: _omitted, ...fullAccess } = meFixture();
    const me = { ...fullAccess, ...(flag === undefined ? {} : { is_system_admin: flag }) } as MeResponse;
    vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
    mockDetailQuery({ data: baseDetail });
  }

  it("is_system_admin=true iken Sil düğmesi görünür", () => {
    mockAdmin(true);
    renderDetail();
    expect(screen.getByRole("button", { name: "Sil" })).toBeInTheDocument();
  });

  it.each([false, undefined])("is_system_admin=%s iken Sil düğmesi YOKTUR", (flag) => {
    mockAdmin(flag);
    renderDetail();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });

  it("oturum bilinmezken (me=null) Sil düğmesi YOKTUR (fail-closed)", () => {
    vi.mocked(useSession).mockReturnValue({ me: null, isLoading: true });
    mockDetailQuery({ data: baseDetail });
    renderDetail();
    expect(screen.queryByRole("button", { name: "Sil" })).not.toBeInTheDocument();
  });
});
