import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import type {
  PayrollPeriodListResponse,
  PayrollPeriodListRow,
} from "@/lib/api/hooks/usePayroll";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import type {
  PayrollSgkSubmitResult,
  PayrollSgkSummaryResponse,
} from "@/lib/api/hooks/usePayrollSgk";
import { usePayrollSgkSummary, useSubmitPayrollSgk } from "@/lib/api/hooks/usePayrollSgk";
import { BackendError } from "@/lib/api/unwrap";

import { PayrollSgkView } from "./PayrollSgkView";
import { PAYROLL_VIEW_PAGES } from "@/lib/auth/page-gates";
import { levelPages } from "@/lib/auth/legacy-level.testkit";
import { meFixture } from "@/lib/auth/page-grants.testkit";

vi.mock("next/navigation", () => ({ usePathname: () => "/bordro/sgk" }));
vi.mock("@/lib/api/hooks/usePayroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayroll")>()),
  usePayrollPeriods: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePayrollSgk", () => ({
  usePayrollSgkSummary: vi.fn(),
  useSubmitPayrollSgk: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

/* ------------------------------------------------------------- fikstürler */

function period(overrides: Partial<PayrollPeriodListRow> = {}): PayrollPeriodListRow {
  return {
    id: "period-7",
    year: 2026,
    month: 7, // SGK:35 "Temmuz 2026"
    status: "pending_approval",
    payment_due_date: "2026-07-20",
    paid_at: null,
    personnel_count: 48,
    gross_total: "743200.00",
    sgk_employer_total: "152356.00",
    net_total: "551759.00",
    total_cost: "917852.00",
    ...overrides,
  };
}

const JULY = period();
const JUNE = period({ id: "period-6", month: 6 });

/**
 * 🔴 K4 — MOCKUP ARİTMETİĞİ BOZUK, fikstür KOPYALAMAZ: SGK:80-82'nin üç
 * kalemi 174.652 eder, SGK:83 toplamı 148.800 yazar. Fikstür KENDİ İÇİNDE
 * tutarlıdır: işveren toplamı üç kalemin (kısa çalışma DAHİL) toplamıdır —
 * sunucu da öyle üretir ve ekran onu OLDUĞU GİBİ basar (K2).
 */
function sgkSummary(
  overrides: Partial<PayrollSgkSummaryResponse> = {},
): PayrollSgkSummaryResponse {
  return {
    period_id: "period-7",
    year: 2026,
    month: 7,
    sgk_submitted_at: null,
    declared_personnel_count: 48, // SGK:55
    sgk_base_total: "743200.00", // SGK:56
    sgk_premium_total: "256404.00", // SGK:57
    unemployment_total: "22296.00", // SGK:58
    sgk_employee_total: "104048.00", // SGK:70
    unemployment_employee_total: "7432.00", // SGK:71
    income_tax_total: "74320.00", // SGK:72
    stamp_tax_total: "5641.00", // SGK:73
    employee_deduction_total: "191441.00", // SGK:74
    sgk_employer_total: "152356.00", // SGK:80
    unemployment_employer_total: "14864.00", // SGK:81
    short_work_total: "7432.00", // SGK:82 — 🔴 ÇİZİLMEZ
    employer_burden_total: "174652.00", // SGK:83 — kısa çalışma İÇİNDE
    sgk_payable_total: "278700.00", // SGK:91
    uncomputed_count: 0,
    unknown_rate_count: 0,
    unknown_tax_count: 0,
    ...overrides,
  };
}

function periodList(
  rows: PayrollPeriodListRow[],
  total = rows.length,
): PayrollPeriodListResponse {
  return { items: rows, total, limit: 240, offset: 0 };
}

function queryResult<T>(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<T, Error>;
}

function mutationResult(partial: Record<string, unknown> = {}) {
  return {
    isPending: false,
    mutateAsync: vi.fn(),
    ...partial,
  } as unknown as UseMutationResult<PayrollSgkSubmitResult, Error, string>;
}

function setSession(level: string | undefined) {
  // IZN-F6a.3 · eski bordro seviyesi niyeti sayfa izni olarak kurulur (full = Düzenler + Onaylar).
  const pages = levelPages(PAYROLL_VIEW_PAGES, level === "full" ? "approve" : level);
  vi.mocked(useSession).mockReturnValue({
    me: meFixture({ pages }),
    isLoading: false,
  } as unknown as ReturnType<typeof useSession>);
}

function setPeriods(result: Record<string, unknown>) {
  vi.mocked(usePayrollPeriods).mockReturnValue(queryResult<PayrollPeriodListResponse>(result));
}

function setSummary(result: Record<string, unknown>) {
  vi.mocked(usePayrollSgkSummary).mockReturnValue(
    queryResult<PayrollSgkSummaryResponse>(result),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setSession("full");
  setPeriods({ data: periodList([JUNE, JULY]) });
  setSummary({ data: sgkSummary() });
  vi.mocked(useSubmitPayrollSgk).mockReturnValue(mutationResult());
});

/* -------------------------------------------------------------------- kapı */

describe("SGK Bildirimi — yetki ve yükleme kapıları", () => {
  it("izin `none` ise AccessDenied basılır", () => {
    setSession("none");
    render(<PayrollSgkView />);
    expect(screen.queryByTestId("bordro-sgk-premium")).not.toBeInTheDocument();
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("403 yanıtı AccessDenied'a düşer", () => {
    setSummary({ isError: true, error: new BackendError(403, { detail: "yok" }) });
    render(<PayrollSgkView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("özet gelmeden nöbetçi BASILMAZ, yükleniyor notu görünür", () => {
    setSummary({});
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("bordro-sgk-loaded")).not.toBeInTheDocument();
  });

  it("dönem listesi gelmeden nöbetçi BASILMAZ (iki bağımsız kaynak)", () => {
    setPeriods({});
    setSummary({});
    render(<PayrollSgkView />);
    expect(screen.queryByTestId("bordro-sgk-loaded")).not.toBeInTheDocument();
  });

  it("her iki kaynak da çözülünce nöbetçi basılır", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-loaded")).toBeInTheDocument();
  });

  it("özet hatası görünür metne dönüşür", () => {
    setSummary({ isError: true, error: new BackendError(500, { detail: "sunucu patladı" }) });
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-error")).toHaveTextContent("sunucu patladı");
  });

  /** 🔴 K3 — dönem yoksa açıklayıcı boş durum; dönem açma DÜĞMESİ YOK. */
  it("hiç dönem yoksa boş durum basılır ve dönem açma düğmesi ÇİZİLMEZ", () => {
    setPeriods({ data: periodList([]) });
    setSummary({});
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-empty")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /(dönem aç|yeni dönem|oluştur)/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("bordro-sgk-loaded")).toBeInTheDocument();
  });
});

/* ----------------------------------------------------------------- başlık */

describe("SGK Bildirimi — başlık ve ay gezgini (SGK:35-40)", () => {
  it("başlık, alt başlık ve sekme şeridi basılır", () => {
    render(<PayrollSgkView />);
    expect(screen.getByRole("heading", { name: "SGK e-Bildirge" })).toBeInTheDocument();
    expect(screen.getByTestId("bordro-sgk-subtitle")).toHaveTextContent(
      "Temmuz 2026 · Aylık Prim Hizmet Belgesi",
    );
    expect(screen.getByRole("tablist", { name: "Bordro sekmeleri" })).toBeInTheDocument();
  });

  it("varsayılan dönem EN YENİ dönemdir ve `›` devre dışıdır", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-period-label")).toHaveTextContent("Temmuz 2026");
    expect(screen.getByTestId("bordro-sgk-next")).toBeDisabled();
  });

  it("`‹` bir önceki dönemin özetini ister", async () => {
    const user = userEvent.setup();
    render(<PayrollSgkView />);
    await user.click(screen.getByTestId("bordro-sgk-prev"));
    expect(screen.getByTestId("bordro-sgk-period-label")).toHaveTextContent("Haziran 2026");
    expect(vi.mocked(usePayrollSgkSummary)).toHaveBeenLastCalledWith("period-6");
  });
});

/* -------------------------------------------------------------------- KPI */

describe("SGK Bildirimi — KPI kartları (SGK:54-59)", () => {
  it("dört kart sunucunun alanlarını basar", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-kpi-personnel-value")).toHaveTextContent("48");
    expect(screen.getByTestId("bordro-sgk-kpi-base-value")).toHaveTextContent("₺743.200");
    expect(screen.getByTestId("bordro-sgk-kpi-premium-value")).toHaveTextContent("₺256.404");
    expect(screen.getByTestId("bordro-sgk-kpi-unemployment-value")).toHaveTextContent("₺22.296");
  });

  it("kart alt etiketleri mockup metnidir", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-kpi-personnel")).toHaveTextContent("4a + 4b");
    expect(screen.getByTestId("bordro-sgk-kpi-premium")).toHaveTextContent("İşçi + İşveren");
  });
});

/* ------------------------------------------------------------ prim tablosu */

describe("SGK Bildirimi — prim tablosu (SGK:62-93)", () => {
  it("SGK:69-74 dört işçi kalemi + toplam basılır", () => {
    render(<PayrollSgkView />);
    const column = screen.getByTestId("bordro-sgk-employee");
    expect(within(column).getByTestId("bordro-sgk-employee-sgk-employee")).toHaveTextContent(
      "104.048",
    );
    expect(
      within(column).getByTestId("bordro-sgk-employee-unemployment-employee"),
    ).toHaveTextContent("7.432");
    expect(within(column).getByTestId("bordro-sgk-employee-income-tax")).toHaveTextContent(
      "74.320",
    );
    expect(within(column).getByTestId("bordro-sgk-employee-stamp-tax")).toHaveTextContent(
      "5.641",
    );
    expect(screen.getByTestId("bordro-sgk-employee-total")).toHaveTextContent("191.441");
  });

  it("SGK:79-81 iki işveren kalemi basılır", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-employer-sgk-employer")).toHaveTextContent("152.356");
    expect(
      screen.getByTestId("bordro-sgk-employer-unemployment-employer"),
    ).toHaveTextContent("14.864");
  });

  /**
   * 🔴🔴 K2 MUTASYON BEKÇİSİ (1/2) — SGK:81 `Kısa Çalışma Ödeneği (%1)` satırı
   * EKRANDA YOKTUR. Biri "eksik kalem" sanıp eklerse bu iddia KIRILIR.
   */
  it("🔴 K2 — `Kısa Çalışma Ödeneği` satırı HİÇ ÇİZİLMEZ", () => {
    render(<PayrollSgkView />);
    expect(screen.queryByText(/Kısa Çalışma/)).not.toBeInTheDocument();
    // İşveren sütununda TAM İKİ kalem + bir toplam satırı vardır.
    const column = screen.getByTestId("bordro-sgk-employer");
    expect(within(column).getAllByText(/^[\d.,]+$/)).toHaveLength(3);
  });

  /**
   * 🔴🔴 K2 MUTASYON BEKÇİSİ (2/2) — `employer_burden_total` SUNUCUDAN GELDİĞİ
   * GİBİ basılır. Kısa çalışma payı (7.432) o toplamın İÇİNDEDİR; istemci onu
   * ÇIKARMAZ. Doğru düzeltme sunucudadır (IK3-SEED: `short_work_pct = 0`).
   * Biri ileride toplamı istemcide "düzeltirse" (174.652 − 7.432 = 167.220)
   * bu iddia KIRILIR.
   */
  it("🔴 K2 — işveren toplamı sunucudan geldiği gibi, DÜZELTİLMEDEN basılır", () => {
    render(<PayrollSgkView />);
    const total = screen.getByTestId("bordro-sgk-employer-total");
    expect(total).toHaveTextContent("174.652");
    expect(total).not.toHaveTextContent("167.220");
  });

  it("kalem etiketlerinde YÜZDE yazmaz (uç oran değil tutar döndürür)", () => {
    render(<PayrollSgkView />);
    const card = screen.getByTestId("bordro-sgk-premium");
    expect(within(card).queryByText(/%/)).not.toBeInTheDocument();
  });

  it("SGK:86-91 ödenecek prim kutusu sunucunun toplamını basar", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-payable-value")).toHaveTextContent("₺ 278.700");
    expect(screen.getByTestId("bordro-sgk-payable")).toHaveTextContent(
      /Gelir vergisi stopajı ve damga vergisi bu tutara DAHİL DEĞİLDİR/,
    );
  });
});

/* ------------------------------------------------------------------- K11 */

describe("🔴 K11 — uçsuz öğeler silinmez, gerekçe görünür", () => {
  it("SGK:22 `XML İndir` devre dışıdır ve gerekçesi basılır", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-xml")).toBeDisabled();
    expect(screen.getByTestId("bordro-sgk-xml-reason")).toHaveTextContent(
      /e-Bildirge XML üreten bir uç yok/,
    );
  });

  it("SGK:96-118 çalışan listesi BASILMAZ; yerine görünür gerekçe vardır", () => {
    render(<PayrollSgkView />);
    expect(screen.queryByText("SGK No")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByTestId("bordro-sgk-personnel-omitted")).toHaveTextContent(
      /SGK sicil numarası kolonu yok/,
    );
  });
});

/* -------------------------------------------------------------- K3 bantlar */

describe("🔴 K3 — fail-closed sayaçlar görünür bant yakar", () => {
  it("sayaçlar sıfırken bant YOKTUR", () => {
    render(<PayrollSgkView />);
    expect(screen.queryByTestId("bordro-sgk-uncomputed-band")).not.toBeInTheDocument();
    expect(screen.queryByTestId("bordro-sgk-unknown-rate-band")).not.toBeInTheDocument();
  });

  it("hesaplanamayan satır bandı sayıyı yazar", () => {
    setSummary({ data: sgkSummary({ uncomputed_count: 3 }) });
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-uncomputed-band")).toHaveTextContent("3");
  });

  /** IK3-SEED bağımlılığının yüzeye çıktığı yer: oran seti yoksa tutarlar 0. */
  it("oran seti tanımsızsa bant yanar ve tutarların eksik olduğunu söyler", () => {
    setSummary({ data: sgkSummary({ unknown_rate_count: 12 }) });
    render(<PayrollSgkView />);
    const band = screen.getByTestId("bordro-sgk-unknown-rate-band");
    expect(band).toHaveTextContent("12");
    expect(band).toHaveTextContent(/eksiktir/);
  });
});

/* ------------------------------------------------------- durum + tek uçuş */

describe("SGK Bildirimi — bildirim damgası (SGK:44-51 · K7)", () => {
  it("damga yokken uyarı hâli, düğme ve dürüst son-tarih notu basılır", () => {
    render(<PayrollSgkView />);
    const band = screen.getByTestId("bordro-sgk-status");
    expect(band).toHaveTextContent("Temmuz 2026 SGK Bildirimi Gönderilmedi");
    expect(screen.getByTestId("bordro-sgk-status-badge")).toHaveTextContent("Gönderilmedi");
    expect(band).toHaveTextContent(/Bildirim son tarihi sistemde tutulmuyor/);
    expect(screen.getByTestId("bordro-sgk-submit")).toBeEnabled();
  });

  it("düğme metni dış entegrasyon İMA ETMEZ", () => {
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-status")).toHaveTextContent(
      /yalnızca dönemin bildirim damgasını basar; sistemden SGK'ya dosya ya da istek gönderilmez/,
    );
  });

  /** 🔴 K3 — mockup'ta ÇİZİLMEYEN hâl: damga basılmış dönem. */
  it("damga varsa başarı hâli basılır, gönder düğmesi ÇİZİLMEZ", () => {
    setSummary({ data: sgkSummary({ sgk_submitted_at: "2026-07-18T21:45:00Z" }) });
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-status-badge")).toHaveTextContent("Gönderildi");
    expect(screen.getByTestId("bordro-sgk-submitted-at")).toHaveTextContent("18 Temmuz 2026");
    expect(screen.queryByTestId("bordro-sgk-submit")).not.toBeInTheDocument();
  });

  it("yazma izni yoksa düğme kapalıdır ve gerekçesi görünür", () => {
    setSession("view");
    render(<PayrollSgkView />);
    expect(screen.getByTestId("bordro-sgk-submit")).toBeDisabled();
    expect(screen.getByTestId("bordro-sgk-submit-reason")).toHaveTextContent(
      "Bordro yazma izniniz yok.",
    );
  });

  it("düğme `/sgk-submit` ucunu dönem kimliğiyle çağırır", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi.fn().mockResolvedValue({
      period_id: "period-7",
      sgk_submitted_at: "2026-07-18T21:45:00Z",
    });
    vi.mocked(useSubmitPayrollSgk).mockReturnValue(mutationResult({ mutateAsync }));
    render(<PayrollSgkView />);
    await user.click(screen.getByTestId("bordro-sgk-submit"));
    expect(mutateAsync).toHaveBeenCalledWith("period-7");
  });

  /**
   * 🔴 K7 TEK UÇUŞ — `sgk-submit` idempotent DEĞİLDİR (ikinci damga 409).
   * Uçuş sürerken düğme kilitlenir; ÇİFT TIKLAMA TEK istek atar.
   */
  it("çift tıklama TEK istek gönderir (uçuş sürerken düğme kilitli)", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    vi.mocked(useSubmitPayrollSgk).mockImplementation(() => {
      // Gerçek `useMutation`ın `isPending` davranışını taklit eden minik
      // kabuk: uçuş başlar ve ÇÖZÜLMEZ, tıpkı ağdaki bekleyen istek gibi.
      const [isPending, setPending] = useState(false);
      return mutationResult({
        isPending,
        mutateAsync: (periodId: string) => {
          spy(periodId);
          setPending(true);
          return new Promise(() => {});
        },
      });
    });

    render(<PayrollSgkView />);
    const button = screen.getByTestId("bordro-sgk-submit");
    await user.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("damga hatası ekranda görünür", async () => {
    const user = userEvent.setup();
    const mutateAsync = vi
      .fn()
      .mockRejectedValue(new BackendError(409, { detail: "Dönem zaten bildirilmiş" }));
    vi.mocked(useSubmitPayrollSgk).mockReturnValue(mutationResult({ mutateAsync }));
    render(<PayrollSgkView />);
    await user.click(screen.getByTestId("bordro-sgk-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("bordro-sgk-submit-error")).toHaveTextContent(
        "Dönem zaten bildirilmiş",
      ),
    );
  });
});
