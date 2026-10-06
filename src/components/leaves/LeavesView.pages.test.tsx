import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { useSession } from "@/components/shell/SessionProvider";
import { useUploadDocument } from "@/lib/api/hooks/useDocumentMutations";
import {
  useApproveLeaveRequest,
  useCreateLeaveRequest,
  useRejectLeaveRequest,
} from "@/lib/api/hooks/useLeaveMutations";
import { usePersonnel } from "@/lib/api/hooks/usePersonnel";
import {
  useHrLeavesSummary,
  usePendingLeaveRequests,
  type HrLeavesSummaryResponse,
  type LeaveBalanceResponse,
  type LeaveRequestListResponse,
  type LeaveRequestResponse,
} from "@/lib/api/hooks/useLeaves";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";

import { LeavesView } from "./LeavesView";

// IZN-F2.x — izin Onayla/Reddet = ik.izin_yonetimi ONAYLAR; "+ İzin Talebi" = ik.* Düzenler.
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("@/lib/api/hooks/useLeaves", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useLeaves")>()),
  useHrLeavesSummary: vi.fn(),
  usePendingLeaveRequests: vi.fn(),
  useLeaveTypes: vi.fn(() => ({ data: [], isError: false })),
}));
// T4 · karar akışı BU bileşende yaşar; üç mutasyon da taklit edilir.
vi.mock("@/lib/api/hooks/useLeaveMutations", () => ({
  useApproveLeaveRequest: vi.fn(),
  useRejectLeaveRequest: vi.fn(),
  useCreateLeaveRequest: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useDocumentMutations", () => ({ useUploadDocument: vi.fn() }));
vi.mock("@/lib/api/hooks/usePersonnel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePersonnel")>()),
  usePersonnel: vi.fn(),
}));

const approveMutate = vi.fn();

function queryStub<T>(
  data: T | undefined,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof useHrLeavesSummary>;
}

function balance(overrides: Partial<LeaveBalanceResponse> = {}): LeaveBalanceResponse {
  return {
    personnel_id: "per-1",
    personnel_name: "Ayşe Demir",
    year: 2026,
    hire_date: "2024-07-01",
    seniority_years: 2,
    seniority_months: 1,
    annual_entitlement: 14,
    carried_over: "3",
    used: 6,
    remaining: "11",
    usage_pct: 35,
    ...overrides,
  };
}

function request(overrides: Partial<LeaveRequestResponse> = {}): LeaveRequestResponse {
  return {
    id: "lr-1",
    personnel_id: "per-1",
    personnel_name: "Ayşe Demir",
    personnel_trade: "Büro Şefi",
    leave_type_id: "lt-1",
    leave_type_name: "Yıllık",
    leave_type_color: "#2563eb",
    deducts_from_annual: true,
    start_date: "2026-08-04",
    end_date: "2026-08-08",
    days: 5,
    note: "Aile ziyareti",
    document_id: null,
    status: "pending",
    decided_by: null,
    decided_at: null,
    reject_reason: null,
    created_at: "2026-07-20T09:00:00Z",
    updated_at: "2026-07-20T09:00:00Z",
    ...overrides,
  };
}

function summary(overrides: Partial<HrLeavesSummaryResponse> = {}): HrLeavesSummaryResponse {
  return {
    year: 2026,
    pending_requests: 6,
    on_leave_today: 14,
    days_used_this_month: 82,
    total_leave_debt: "418",
    carryover_risk_personnel: 8,
    unknown_entitlement_personnel: 3,
    balances: [
      balance(),
      // Hakkı hesaplanamayan personel (161-167) — hem "Hak yok" hem "—" hâli.
      balance({
        personnel_id: "per-3",
        personnel_name: "Sercan Öztürk",
        hire_date: "2026-03-01",
        seniority_years: 0,
        seniority_months: 5,
        annual_entitlement: null,
        carried_over: "0",
        used: 0,
        remaining: null,
        usage_pct: null,
      }),
    ],
    ...overrides,
  };
}

/**
 * 🔴 K5 ayrışması: `total` (6) satır sayısından (2) FARKLIdır — mockup da 6
 * der ve 4 satır çizer. Eşit olsalardı başlık testi hiçbir şey kanıtlamazdı.
 */
function requestList(
  overrides: Partial<LeaveRequestListResponse> = {},
): LeaveRequestListResponse {
  return {
    items: [
      request(),
      // Hak aşan satır (91-99): kalan 11, gün 14.
      request({
        id: "lr-2",
        personnel_id: "per-1",
        days: 14,
        start_date: "2026-08-10",
        end_date: "2026-08-23",
        note: "Uzun izin",
      }),
    ],
    total: 6,
    limit: 50,
    offset: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useApproveLeaveRequest).mockReturnValue({
    mutate: approveMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useApproveLeaveRequest>);
  vi.mocked(useRejectLeaveRequest).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useRejectLeaveRequest>);
  vi.mocked(useCreateLeaveRequest).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useCreateLeaveRequest>);
  vi.mocked(useUploadDocument).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useUploadDocument>);
  vi.mocked(usePersonnel).mockReturnValue({
    data: { items: [], total: 0, limit: 200, offset: 0 },
    isError: false,
  } as unknown as ReturnType<typeof usePersonnel>);
  vi.mocked(useHrLeavesSummary).mockReturnValue(queryStub(summary()));
  vi.mocked(usePendingLeaveRequests).mockReturnValue(
    queryStub(requestList()) as unknown as ReturnType<typeof usePendingLeaveRequests>,
  );
});


function session(me: ReturnType<typeof meFixture>) {
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as ReturnType<typeof useSession>);
}

describe("LeavesView · sayfa izni kapıları (IZN-F2.x)", () => {
  it("ik.izin_yonetimi Onaylar → Onayla/Reddet etkin", () => {
    session(meFixture({ pages: { "ik.izin_yonetimi": pageGrant("view", true) } }));
    render(<LeavesView currentYear={2026} />);
    expect(screen.getByTestId("iz-approve-lr-1")).toBeEnabled();
    expect(screen.getByTestId("iz-reject-lr-1")).toBeEnabled();
  });

  it("ik.izin_yonetimi Düzenler (Onaylar YOK) → Onayla/Reddet PASİF; talep düğmesi var", () => {
    session(meFixture({ pages: { "ik.izin_yonetimi": pageGrant("edit") } }));
    render(<LeavesView currentYear={2026} />);
    expect(screen.getByTestId("iz-approve-lr-1")).toBeDisabled();
    expect(screen.getByTestId("iz-reject-lr-1")).toBeDisabled();
    expect(screen.getByTestId("iz-new-request")).toBeInTheDocument();
  });

  it("yalnız Görür → talep düğmesi YOK ve karar düğmeleri pasif", () => {
    session(meFixture({ pages: { "ik.izin_yonetimi": pageGrant("view") } }));
    render(<LeavesView currentYear={2026} />);
    expect(screen.queryByTestId("iz-new-request")).toBeNull();
    expect(screen.getByTestId("iz-approve-lr-1")).toBeDisabled();
  });

  it("ik.personel Düzenler (ikiz kapı) → talep düğmesi var", () => {
    session(
      meFixture({
        pages: { "ik.izin_yonetimi": pageGrant("view"), "ik.personel": pageGrant("edit") },
      }),
    );
    render(<LeavesView currentYear={2026} />);
    expect(screen.getByTestId("iz-new-request")).toBeInTheDocument();
  });

  it("pages boş → fail-closed: erişim reddi, talep/karar düğmesi YOK (IZN-F6a)", () => {
    session(meFixture({ pages: {} }));
    render(<LeavesView currentYear={2026} />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByTestId("iz-new-request")).toBeNull();
    expect(screen.queryByTestId("iz-approve-lr-1")).toBeNull();
  });

  it("sistem yöneticisi: grant none olsa da karar verebilir", () => {
    session(meFixture({ pages: { "ik.izin_yonetimi": pageGrant("none") }, isSystemAdmin: true }));
    render(<LeavesView currentYear={2026} />);
    expect(screen.getByTestId("iz-approve-lr-1")).toBeEnabled();
  });
});
