import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
import { BackendError } from "@/lib/api/unwrap";

import { LeavesView } from "./LeavesView";
import { DECISION_PENDING_REASON } from "./leaves-labels";
import { meFixture } from "@/lib/auth/page-grants.testkit";

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
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
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

describe("LeavesView — İZ KPI şeridi (45-51)", () => {
  it("BEŞ kart sunucu sayılarını AYNEN basar", () => {
    render(<LeavesView currentYear={2026} />);
    const strip = screen.getByTestId("iz-kpi-strip");

    expect(within(strip).getByTestId("iz-kpi-pending")).toHaveTextContent("6");
    expect(within(strip).getByTestId("iz-kpi-on-leave")).toHaveTextContent("14");
    expect(within(strip).getByTestId("iz-kpi-used")).toHaveTextContent("82 gün");
    expect(within(strip).getByTestId("iz-kpi-debt")).toHaveTextContent("418 gün");
    expect(within(strip).getByTestId("iz-kpi-risk")).toHaveTextContent("8 kişi");
  });

  it("`unknown_entitlement_personnel` KPI olarak BASILMAZ (şef kararı)", () => {
    render(<LeavesView currentYear={2026} />);
    const strip = screen.getByTestId("iz-kpi-strip");

    // Fikstürde 3'tür; şeritte hiçbir kart 3 basmamalıdır.
    expect(within(strip).queryByText("3")).not.toBeInTheDocument();
    expect(strip).not.toHaveTextContent(/hak(kı)? hesaplanamayan/i);
  });
});

describe("LeavesView — onay bekleyen talepler (54-113)", () => {
  it("K5 · başlıktaki sayı `total`dandır, satır sayısından DEĞİL", () => {
    render(<LeavesView currentYear={2026} />);

    expect(screen.getByTestId("iz-pending-title")).toHaveTextContent(
      "Onay Bekleyen İzin Talepleri (6)",
    );
    expect(screen.getAllByTestId(/^iz-pending-row-/)).toHaveLength(2);
    expect(screen.getByTestId("iz-pending-title")).not.toHaveTextContent("(2)");
  });

  it("K4 · kalan hak `balances[]`ten JOIN'lenir; eşleşme yoksa 0 DEĞİL '—'", () => {
    vi.mocked(usePendingLeaveRequests).mockReturnValue(
      queryStub(
        requestList({ items: [request(), request({ id: "lr-9", personnel_id: "per-yok" })] }),
      ) as unknown as ReturnType<typeof usePendingLeaveRequests>,
    );
    render(<LeavesView currentYear={2026} />);

    expect(screen.getByTestId("iz-remaining-lr-1")).toHaveTextContent("11 gün");
    expect(screen.getByTestId("iz-remaining-lr-9")).toHaveTextContent("—");
    expect(screen.getByTestId("iz-remaining-lr-9")).not.toHaveTextContent("0");
  });

  it("K9 · yıllık haktan düşmeyen tipte 'Düşmez' basılır ('—' DEĞİL)", () => {
    vi.mocked(usePendingLeaveRequests).mockReturnValue(
      queryStub(
        requestList({
          items: [
            request({ id: "lr-5", deducts_from_annual: false, leave_type_name: "Hastalık" }),
          ],
        }),
      ) as unknown as ReturnType<typeof usePendingLeaveRequests>,
    );
    render(<LeavesView currentYear={2026} />);

    const cell = screen.getByTestId("iz-remaining-lr-5");
    expect(cell).toHaveTextContent("Düşmez");
    expect(cell).not.toHaveTextContent("—");
  });

  it("hak aşan satırda onay PASİF, red AKTİFtir (98-99)", () => {
    render(<LeavesView currentYear={2026} />);

    expect(screen.getByTestId("iz-approve-lr-2")).toBeDisabled();
    expect(screen.getByTestId("iz-reject-lr-2")).toBeEnabled();
    // Hak aşmayan satırın onayı serbesttir — kapı satır bazlıdır.
    expect(screen.getByTestId("iz-approve-lr-1")).toBeEnabled();
    expect(screen.getByTestId("iz-pending-row-lr-2")).toHaveTextContent("Hak aşımı");
  });

  it("🔴 T4 · karar akışı BAĞLI: gerekçe metni ekranda KALMAZ", () => {
    render(<LeavesView currentYear={2026} />);

    // GÖRÜNÜR GEREKÇE canon'u: gerekçe öğenin KENDİ durumundan türetilir.
    // Handler'lar bağlıyken hâlâ basılıyorsa canlı bir düğmeyi yalanlar.
    expect(screen.queryByTestId("iz-decision-reason")).not.toBeInTheDocument();
    expect(screen.queryByText(DECISION_PENDING_REASON)).not.toBeInTheDocument();
    expect(screen.getByTestId("iz-approve-lr-1")).toBeEnabled();
    expect(screen.getByTestId("iz-reject-lr-1")).toBeEnabled();
  });

  it("onay GÖVDESİZ ucu doğrudan çağırır (diyalog YOKTUR)", async () => {
    render(<LeavesView currentYear={2026} />);

    // Aynı personelin iki talebi vardır: erişilebilir ad tarihle AYRIŞIR.
    await userEvent.click(
      screen.getByRole("button", { name: "Onayla: Ayşe Demir, 04.08.2026" }),
    );

    expect(approveMutate).toHaveBeenCalledWith("lr-1", expect.anything());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /**
   * 🔴 ÇİFT GÖNDERİM — onay GÖVDESİZDİR ve diyalog açmaz, yani düğme ile uç
   * arasında hiçbir kapı yoktur. `approveRequest.isPending` okunmazsa aynı
   * satıra iki hızlı tıklama İKİ POST üretir: ikincisi sunucunun satır
   * kilidinden 409 yer ve ekrana "onay başarısız" gibi okunan bir hata basar —
   * oysa onay GERÇEKLEŞMİŞTİR. İki diyalog (LeaveRequestFormModal /
   * LeaveRejectModal) bu kilidi zaten kuruyor; onay yolu kurmuyordu.
   */
  it("🔴 onay isteği uçarken onay düğmesi KİLİTLİdir (çift gönderim yok)", async () => {
    vi.mocked(useApproveLeaveRequest).mockReturnValue({
      mutate: approveMutate,
      isPending: true,
    } as unknown as ReturnType<typeof useApproveLeaveRequest>);
    render(<LeavesView currentYear={2026} />);

    const approve = screen.getByTestId("iz-approve-lr-1");
    expect(approve).toBeDisabled();

    await userEvent.click(approve);
    expect(approveMutate).not.toHaveBeenCalled();

    // 🔴 Red AYRI mutasyondur — onayın kilidi reddi ENGELLEMEZ.
    expect(screen.getByTestId("iz-reject-lr-1")).toBeEnabled();
  });

  it("🔴 onayın 409'u (çakışma/hak aşımı/hesaplanamayan kalan) EKRANDA basılır", async () => {
    render(<LeavesView currentYear={2026} />);
    await userEvent.click(screen.getByTestId("iz-approve-lr-1"));

    const { onError } = approveMutate.mock.calls[0][1] as { onError: (e: Error) => void };
    act(() => onError(new BackendError(409, { detail: "Çakışan onaylı izin var." })));

    expect(screen.getByTestId("iz-decision-error")).toHaveTextContent(
      "Çakışan onaylı izin var.",
    );
  });

  it("red DİYALOG açar ve talebin künyesini taşır", async () => {
    render(<LeavesView currentYear={2026} />);
    await userEvent.click(screen.getByTestId("iz-reject-lr-2"));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("iz-reject-summary")).toHaveTextContent("Ayşe Demir");
    expect(within(dialog).getByTestId("iz-reject-summary")).toHaveTextContent("23.08.2026");
    // Gerekçe boşken düğme PASİFtir (R 123-128).
    expect(within(dialog).getByTestId("iz-reject-submit")).toBeDisabled();
  });

  it("talep formu başlık satırındaki düğmeyle açılır", async () => {
    render(<LeavesView currentYear={2026} />);
    expect(screen.queryByTestId("iz-request-personnel")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("iz-new-request"));

    expect(screen.getByTestId("iz-request-personnel")).toBeVisible();
  });

  it("belge eki `document_id` doluyken SVG + erişilebilir adla basılır (88)", () => {
    vi.mocked(usePendingLeaveRequests).mockReturnValue(
      queryStub(
        requestList({ items: [request({ id: "lr-7", document_id: "doc-1" }), request()] }),
      ) as unknown as ReturnType<typeof usePendingLeaveRequests>,
    );
    render(<LeavesView currentYear={2026} />);

    expect(screen.getByTestId("iz-attachment-lr-7")).toHaveTextContent("belge ekli");
    expect(screen.queryByTestId("iz-attachment-lr-1")).not.toBeInTheDocument();
  });

  it("K3 istisnası · bekleyen talep yoksa boş durum basılır", () => {
    vi.mocked(usePendingLeaveRequests).mockReturnValue(
      queryStub(requestList({ items: [], total: 0 })) as unknown as ReturnType<
        typeof usePendingLeaveRequests
      >,
    );
    render(<LeavesView currentYear={2026} />);

    expect(screen.getByTestId("iz-pending-empty")).toBeVisible();
    expect(screen.getByTestId("iz-pending-title")).toHaveTextContent("(0)");
  });

  it("K3 · durum süzgeci/sekmesi İCAT EDİLMEZ", () => {
    render(<LeavesView currentYear={2026} />);

    expect(screen.queryByText(/Onaylanan|Reddedilen/)).not.toBeInTheDocument();
    // Ekranda TEK select vardır: bakiye yılı (120).
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });
});

describe("LeavesView — izin bakiyeleri (116-171)", () => {
  it("hakkı hesaplanamayan satırda 'Hak yok' + '—' basılır, 0 BASILMAZ (163-167)", () => {
    render(<LeavesView currentYear={2026} />);
    const row = screen.getByTestId("iz-balance-row-per-3");

    expect(within(row).getByTestId("iz-remaining-balance-per-3")).toHaveTextContent("Hak yok");
    expect(within(row).getByTestId("iz-remaining-balance-per-3")).not.toHaveTextContent("0");
    expect(within(row).getByTestId("iz-carried-per-3")).toHaveTextContent("—");
    expect(row).toHaveTextContent("5 ay");
    expect(row).toHaveTextContent("1 yıl dolunca hak kazanır");
  });

  it("hakkı olan satır kıdem/yüzde basar (134-140)", () => {
    render(<LeavesView currentYear={2026} />);
    const row = screen.getByTestId("iz-balance-row-per-1");

    expect(row).toHaveTextContent("2 yıl 1 ay");
    expect(within(row).getByTestId("iz-remaining-balance-per-1")).toHaveTextContent("11");
  });

  it("K8 · bakiye tablosu SALT-OKUMAdır: düzenleme düğmesi YOKTUR", () => {
    render(<LeavesView currentYear={2026} />);
    const card = screen.getByTestId("iz-balances-card");

    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("yıl seçici primitive'dir ve özet ucu SEÇİLEN yılla yeniden sorulur (120)", async () => {
    render(<LeavesView currentYear={2026} />);

    expect(useHrLeavesSummary).toHaveBeenCalledWith(2026);
    await userEvent.selectOptions(screen.getByTestId("iz-year-select"), "2025");

    // Bakiye tablosunun sorgusu SEÇİLEN yıla döner (2025). Bekleyen talepler
    // için ayrıca sabit `currentYear` (2026) sorgusu da PARALEL yaşamaya
    // devam eder — KAYIT NO 145, bkz. aşağıdaki test.
    expect(useHrLeavesSummary).toHaveBeenCalledWith(2025);
    expect(useHrLeavesSummary).toHaveBeenCalledWith(2026);
  });

  it("🔴 KAYIT NO 145 — bekleyen talepler tablosu bakiye tablosunun yıl seçiminden ETKİLENMEZ", async () => {
    // 2026 bakiyesi: kalan 11. 2025 bakiyesi (geçmiş yıl seçilince) FARKLI: kalan 2.
    vi.mocked(useHrLeavesSummary).mockImplementation(
      (queryYear: number) =>
        queryStub(
          summary({ year: queryYear, balances: [balance({ year: queryYear, remaining: queryYear === 2026 ? "11" : "2" })] }),
        ) as ReturnType<typeof useHrLeavesSummary>,
    );
    render(<LeavesView currentYear={2026} />);

    // lr-2: gün 14, kalan 11 (2026) → "1 gün aşım" (K9 tonu "exceeded").
    expect(screen.getByTestId("iz-remaining-lr-2")).toHaveTextContent("11");

    await userEvent.selectOptions(screen.getByTestId("iz-year-select"), "2025");

    // Bakiye tablosu 2025'e geçse de bekleyen talepler HÂLÂ currentYear (2026)
    // bakiyesiyle eşleşmeli — 2025'in "2" kalanı SIZMAMALI.
    expect(screen.getByTestId("iz-remaining-lr-2")).toHaveTextContent("11");
  });
});

describe("LeavesView — erişim ve hata", () => {
  it("403 gelen uç ekranı AccessDenied'a düşürür", () => {
    vi.mocked(useHrLeavesSummary).mockReturnValue(
      queryStub(undefined, { isError: true, error: new BackendError(403, null) }),
    );
    render(<LeavesView currentYear={2026} />);

    expect(screen.queryByTestId("iz-kpi-strip")).not.toBeInTheDocument();
  });

  it("özet düşerse KPI sahte 0 BASMAZ, bakiye tablosu hata satırı yazar", () => {
    vi.mocked(useHrLeavesSummary).mockReturnValue(
      queryStub(undefined, { isError: true, error: new Error("sunucu hatası") }),
    );
    render(<LeavesView currentYear={2026} />);

    expect(screen.getByTestId("iz-kpi-pending")).toHaveTextContent("—");
    expect(screen.getByTestId("iz-kpi-pending")).not.toHaveTextContent("0");
    expect(screen.getByTestId("iz-balances-error")).toHaveTextContent("İzin özeti yüklenemedi");
  });
});
