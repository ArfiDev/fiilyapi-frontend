import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { PurchaseRequestsView } from "./PurchaseRequestsView";
import { usePurchaseRequests } from "@/lib/api/hooks/usePurchaseRequests";
import { usePurchasingSummary } from "@/lib/api/hooks/usePurchasingSummary";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type {
  PurchaseRequestListResponse,
  PurchaseRequestListRow,
} from "@/lib/api/hooks/usePurchaseRequests";
import type { PurchasingSummaryResponse } from "@/lib/api/hooks/usePurchasingSummary";
import { ALL_PAGE_KEYS, meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/usePurchaseRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePurchaseRequests")>()),
  usePurchaseRequests: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePurchasingSummary", () => ({ usePurchasingSummary: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjects", () => ({
  useProjects: () => ({
    data: { items: [{ id: "prj-1", name: "Liman Altyapı" }] },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/satinalma",
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const ROW: PurchaseRequestListRow = {
  id: "req-1",
  request_no: "SAT-2026-0042",
  request_date: "2026-08-01",
  priority: "urgent",
  project_id: "prj-1",
  site_id: null,
  section_id: null,
  needed_by: null,
  justification: "Stok kritik",
  status: "pending_approval",
  quote_deadline: null,
  approved_by_user_id: null,
  approved_at: null,
  rejected_at: null,
  rejection_reason: null,
  created_by_user_id: "u-1",
  created_at: "2026-08-01T09:00:00Z",
  estimated_total: "328500.00",
  can_delete: true,
  line_count: 3,
};

const SUMMARY: PurchasingSummaryResponse = {
  open_requests: 8,
  quote_wait_requests: 5,
  pending_approval_requests: 2,
  orders_this_month_total: "1240000.00",
  active_orders: 12,
  in_transit_orders: 3,
  delivered_orders: 24,
};

function list(overrides: Partial<PurchaseRequestListResponse> = {}): PurchaseRequestListResponse {
  return { items: [ROW], total: 1, limit: 200, offset: 0, ...overrides };
}

/** React Query sonucunun 20+ alanını fikstürde yeniden üretmemek için (E12 deseni). */
function queryStub(
  data: unknown,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof usePurchaseRequests>;
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(usePurchaseRequests).mockReturnValue(queryStub(list()));
  vi.mocked(usePurchasingSummary).mockReturnValue(
    queryStub(SUMMARY) as unknown as ReturnType<typeof usePurchasingSummary>,
  );
});

describe("PurchaseRequestsView — SAT başlık ve aksiyonlar", () => {
  it("mockup başlığını ve breadcrumb'ını basar (62-64)", () => {
    render(<PurchaseRequestsView />);
    expect(screen.getByRole("heading", { name: "Satınalma & Teklif" })).toBeInTheDocument();
    expect(screen.getByText("Stok & Satınalma")).toBeInTheDocument();
  });

  it("'+ Satın Alma Talebi' T3'ün form rotasına gider (65)", () => {
    render(<PurchaseRequestsView />);
    expect(screen.getByRole("link", { name: "+ Satın Alma Talebi" })).toHaveAttribute(
      "href",
      "/satinalma/talep/yeni",
    );
  });

  it("yazma yetkisi yoksa oluşturma bağlantısı basılmaz", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "view") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<PurchaseRequestsView />);
    expect(screen.queryByRole("link", { name: "+ Satın Alma Talebi" })).not.toBeInTheDocument();
  });

  it("izin 'none' ise erişim reddedilir", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<PurchaseRequestsView />);
    expect(screen.queryByRole("heading", { name: "Satınalma & Teklif" })).not.toBeInTheDocument();
  });

  it("403 yanıtında da erişim reddedilir", () => {
    vi.mocked(usePurchaseRequests).mockReturnValue(
      queryStub(undefined, { isError: true, error: new BackendError(403, {}) }),
    );
    render(<PurchaseRequestsView />);
    expect(screen.queryByRole("heading", { name: "Satınalma & Teklif" })).not.toBeInTheDocument();
  });
});

describe("PurchaseRequestsView — sekme/süzgeç durumu URL'de", () => {
  it("süzgeçsiz açılışta 'Satın Alma Talepleri' sekmesi aktiftir", () => {
    render(<PurchaseRequestsView />);
    expect(screen.getByRole("link", { name: "Satın Alma Talepleri" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Teklifler" })).not.toHaveAttribute("aria-current");
  });

  // spec K3 + F-SD çift-aktiflik dersi.
  it("?durum=quote_wait ile YALNIZ 'Teklifler' sekmesi aktiftir", () => {
    searchParams = new URLSearchParams("durum=quote_wait");
    render(<PurchaseRequestsView />);
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Teklifler");
  });

  it("durum süzgecini SUNUCUYA gönderir (istemcide süzmez)", () => {
    searchParams = new URLSearchParams("durum=quote_wait");
    render(<PurchaseRequestsView />);
    expect(vi.mocked(usePurchaseRequests)).toHaveBeenCalledWith(
      expect.objectContaining({ status: "quote_wait", limit: 200 }),
    );
  });

  it("tanınmayan durum değeri süzgeç olarak GÖNDERİLMEZ (422 üretirdi)", () => {
    searchParams = new URLSearchParams("durum=uydurma");
    render(<PurchaseRequestsView />);
    expect(vi.mocked(usePurchaseRequests)).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
    );
  });

  it("proje/arama süzgeci etkinken GÖRÜNÜR bant + temizleme düğmesi basar", () => {
    searchParams = new URLSearchParams("proje=prj-1&q=demir");
    render(<PurchaseRequestsView />);
    const notice = screen.getByTestId("sat-filter-notice");
    expect(notice.textContent).toContain("Liman Altyapı");
    expect(notice.textContent).toContain("demir");

    fireEvent.click(screen.getByRole("button", { name: "Süzgeci temizle" }));
    expect(replaceMock).toHaveBeenCalledWith("/satinalma", { scroll: false });
  });

  it("temizleme sekmenin durum anahtarını KORUR", () => {
    searchParams = new URLSearchParams("durum=quote_wait&proje=prj-1");
    render(<PurchaseRequestsView />);
    fireEvent.click(screen.getByRole("button", { name: "Süzgeci temizle" }));
    expect(replaceMock).toHaveBeenCalledWith("/satinalma?durum=quote_wait", { scroll: false });
  });

  it("KPI özeti proje süzgecini alır ama durum süzgecini ALMAZ", () => {
    searchParams = new URLSearchParams("durum=quote_wait&proje=prj-1");
    render(<PurchaseRequestsView />);
    expect(vi.mocked(usePurchasingSummary)).toHaveBeenCalledWith("prj-1");
  });
});

describe("PurchaseRequestsView — görünür gerekçe ve kırpılma bantları", () => {
  it("iki kaynaksız sütunu ADIYLA sayan tek bant basılır", () => {
    render(<PurchaseRequestsView />);
    const notice = screen.getByTestId("sat-pending-notice");
    expect(notice.textContent).toContain("Miktar");
    expect(notice.textContent).toContain("Teklif");
    expect(notice.textContent).toContain("Talep miktarı liste ucundan gelmiyor");
    expect(notice.textContent).toContain("Teklif sayısı liste ucundan gelmiyor");
  });

  it("liste kırpıldığında sınır göstergesi basar", () => {
    vi.mocked(usePurchaseRequests).mockReturnValue(queryStub(list({ total: 340 })));
    render(<PurchaseRequestsView />);
    expect(screen.getByTestId("sat-truncation-notice").textContent).toContain("toplam 340");
  });

  it("liste tamsa sınır göstergesi basmaz", () => {
    render(<PurchaseRequestsView />);
    expect(screen.queryByTestId("sat-truncation-notice")).not.toBeInTheDocument();
  });
});
