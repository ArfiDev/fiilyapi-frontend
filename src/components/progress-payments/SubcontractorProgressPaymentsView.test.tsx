import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SubcontractorProgressPaymentsView } from "./SubcontractorProgressPaymentsView";
import {
  useSubcontractorProgressPayments,
  useSubcontractorProgressPaymentSummary,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { SUBCONTRACTOR_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock(
  "@/lib/api/hooks/useSubcontractorProgressPayments",
  async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api/hooks/useSubcontractorProgressPayments")>()),
    useSubcontractorProgressPayments: vi.fn(),
    useSubcontractorProgressPaymentSummary: vi.fn(),
  }),
);
vi.mock("@/lib/api/hooks/useProjects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProjects")>()),
  useProjects: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/hakedisler/taseron",
  useSearchParams: () => new URLSearchParams(),
}));

function mockSession(permissions?: Record<string, string>) {
  // IZN-F6a.3 · eski modül seviyesi niyeti sayfa izni olarak kurulur (`undefined` = tam yetkili oturum, SA).
  const level = permissions?.progress_payments;
  const me =
    permissions === undefined
      ? meFixture({ isSystemAdmin: true })
      : meFixture({ pages: levelPages(SUBCONTRACTOR_PAYMENT_EDIT, level), isSystemAdmin: level === "admin" });
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false });
}

function mockListQuery(value: Partial<ReturnType<typeof useSubcontractorProgressPayments>>) {
  vi.mocked(useSubcontractorProgressPayments).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

function mockSummaryQuery(value: Partial<ReturnType<typeof useSubcontractorProgressPaymentSummary>>) {
  vi.mocked(useSubcontractorProgressPaymentSummary).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SubcontractorProgressPaymentsView />
    </QueryClientProvider>,
  );
}

describe("SubcontractorProgressPaymentsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession({ progress_payments: "draft" });
    vi.mocked(useProjects).mockReturnValue({
      data: { items: [], counts: {} },
      isLoading: false,
      isError: false,
      error: null,
    } as never);
    mockSummaryQuery({});
  });

  it("baslik + sekme seridini basar (Taseron aktif)", () => {
    mockListQuery({ data: { items: [], total: 0, limit: 50, offset: 0 } });
    renderView();
    expect(screen.getByRole("heading", { name: "Taşeron Hakedişi" })).toBeInTheDocument();
    // Final inceleme F-4: tab/tablist rolleri kaldırıldı — gezinme + aria-current.
    expect(screen.getByRole("link", { name: "Taşeron" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "İşveren" })).not.toHaveAttribute("aria-current");
  });

  // Final inceleme F-3 — uç varsayılan limiti 50; 50'den fazla hakediş olan
  // projede tablo sessizce eksik kalırdı.
  it("total > gösterilen kayıt sayısı iken görünür sınır göstergesi basar", () => {
    mockListQuery({ data: { items: [], total: 137, limit: 50, offset: 0 } });
    renderView();
    expect(screen.getByTestId("thk-limit-note")).toHaveTextContent(
      "İlk 0 kayıt gösteriliyor (toplam 137) — liste eksik.",
    );
  });

  it("total = gösterilen kayıt sayısı iken sınır göstergesi BASILMAZ", () => {
    mockListQuery({ data: { items: [], total: 0, limit: 50, offset: 0 } });
    renderView();
    expect(screen.queryByTestId("thk-limit-note")).not.toBeInTheDocument();
  });

  it("403'te erisim reddi basar", () => {
    mockListQuery({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    renderView();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Taşeron Hakedişi" })).not.toBeInTheDocument();
  });

  it("yazma yetkisi varken 'Yeni Hakediş' butonu gorunur, salt-okunurda gorunmez", () => {
    mockListQuery({ data: { items: [], total: 0, limit: 50, offset: 0 } });
    renderView();
    expect(screen.getByRole("link", { name: "+ Yeni Hakediş" })).toHaveAttribute(
      "href",
      "/hakedisler/taseron/yeni",
    );
  });

  it("salt-okunur yetkide 'Yeni Hakediş' butonu gorunmez", () => {
    mockSession({ progress_payments: "view" });
    mockListQuery({ data: { items: [], total: 0, limit: 50, offset: 0 } });
    renderView();
    expect(screen.queryByRole("link", { name: "+ Yeni Hakediş" })).not.toBeInTheDocument();
  });

  // no 183 — boş liste ipucu düğmesi olmayan salt-okunur kullanıcıya
  // "+ Yeni Hakediş ile başlayın" TARİF ETMEMELİ (tabloya `canWrite`e göre
  // türetilen `newActionLabel` geçirilir).
  it("no 183 · salt-okunurda boş liste ipucu 'Yeni Hakediş' düğmesi VAAT ETMEZ", () => {
    mockSession({ progress_payments: "view" });
    mockListQuery({ data: { items: [], total: 0, limit: 50, offset: 0 } });
    renderView();
    expect(screen.queryByText(/\+ Yeni Hakediş ile başlayın/)).not.toBeInTheDocument();
  });

  it("no 183 · yazma yetkisinde boş liste ipucu 'Yeni Hakediş' düğmesini işaret eder", () => {
    mockListQuery({ data: { items: [], total: 0, limit: 50, offset: 0 } });
    renderView();
    expect(screen.getByText("+ Yeni Hakediş ile başlayın")).toBeInTheDocument();
  });

  it("KPI serit ozet verisiyle basar", () => {
    mockListQuery({ data: { items: [], total: 0, limit: 50, offset: 0 } });
    mockSummaryQuery({
      data: {
        total_gross: "4820000.00",
        pending_gross: "1240000.00",
        paid_period_gross: "2100000.00",
        active_subcontractor_count: 12,
        period_year: 2026,
        period_month: 7,
      },
    });
    renderView();
    expect(screen.getByTestId("thk-kpi-strip")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});
