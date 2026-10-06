import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";
import type { VatReturnResponse } from "@/lib/api/hooks/useVatReturn";
import { useVatReturn } from "@/lib/api/hooks/useVatReturn";
import { BackendError } from "@/lib/api/unwrap";

import { VatReturnView } from "./VatReturnView";

vi.mock("@/lib/api/hooks/useVatReturn", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useVatReturn")>()),
  useVatReturn: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
// 🔴 F-MUP: modül sekme şeridi (`AccountingTabs`) artık görünümün İÇİNDEDİR
// (drill-in sidebar kalktı) ve `usePathname` okur. Mock olmadan jsdom'da
// `null` döner ve şeridin aktiflik kararı çökerdi.
vi.mock("next/navigation", () => ({ usePathname: () => "/muhasebe/kdv-beyani" }));


function response(partial: Partial<VatReturnResponse> = {}): VatReturnResponse {
  return {
    year: 2026,
    month: 6,
    due_date: "2026-07-28",
    calculated_vat: "824000.00",
    deductible_vat: "412000.00",
    payable: "412000.00",
    carried_forward: "0.00",
    taxable_rows: [{ rate: "20.00", base: "4120000.00", vat: "824000.00" }],
    // 🔴 Mockup `0` çizer ama fikstür SIFIR DEĞİL: sıfırda "istisna matrahı
    // toplama dâhil mi" sorusu AYIRT EDİLEMEZ (iki okuma da aynı sayıyı
    // verir). Fikstür mockup'ın RAKAMINA değil, YAPISINA bağlıdır (K3).
    exempt_base: "500000.00",
    // 🔴 Sunucu TEK satır döner (`Alışlar`); mockup'ın iki satırı (Mal/Hizmet)
    // veri modelinde YOKTUR — satır UYDURULMAZ.
    deductions: [{ source: "Alışlar", base: "2060500.00", vat: "412000.00" }],
    ...partial,
  };
}

const CARRIED = response({
  calculated_vat: "412000.00",
  deductible_vat: "824000.00",
  payable: "0.00",
  carried_forward: "412000.00",
  taxable_rows: [{ rate: "20.00", base: "2060000.00", vat: "412000.00" }],
  deductions: [{ source: "Alışlar", base: "4120000.00", vat: "824000.00" }],
});

function queryResult(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<VatReturnResponse, Error>;
}

function setSession(level: string | undefined) {
  // IZN-F6a · modül düzeyi → sayfa izni (ACCOUNTING_VIEW kümesi); izin hiç yoksa kapı KAPALI (fail-closed).
  const pages = level === undefined ? {} : pagesFor(ACCOUNTING_VIEW, level === "none" ? "none" : level === "view" ? "view" : "edit");
  vi.mocked(useSession).mockReturnValue({ me: meFixture({ pages }) } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(2026, 6, 20, 9, 0, 0)); // 20 Temmuz 2026, YEREL
  setSession("full");
  vi.mocked(useVatReturn).mockReturnValue(queryResult({ data: response() }));
});

describe("KDV Beyannamesi — başlık şeridi", () => {
  it("geri bağlantısı (KDV:39) ve başlık (KDV:41) basılır", () => {
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-back")).toHaveAttribute("href", "/muhasebe");
    expect(screen.getByRole("heading", { name: "KDV Beyannamesi" })).toBeInTheDocument();
  });

  it("🔴 K4 — varsayılan dönem ÖNCEKİ AYDIR (beyanname geçmiş ayın beyanıdır)", () => {
    render(<VatReturnView />);
    // Sistem saati Temmuz 2026 → beyanname HAZİRAN 2026.
    expect(vi.mocked(useVatReturn)).toHaveBeenCalledWith(2026, 6);
    expect(screen.getByTestId("mu-period-label")).toHaveTextContent("Haziran 2026");
  });

  it("🔴 dönem TEK AYDIR — Mizan'ın birikimli aralığı DEĞİL", () => {
    render(<VatReturnView />);
    expect(screen.getByTestId("mu-period-label")).not.toHaveTextContent("Ocak–");
  });

  it("yıl sınırını geçerken ay ve YIL birlikte döner", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<VatReturnView />);
    for (let step = 0; step < 6; step += 1) {
      await user.click(screen.getByTestId("mu-period-prev"));
    }
    expect(vi.mocked(useVatReturn)).toHaveBeenLastCalledWith(2025, 12);
    expect(screen.getByTestId("mu-period-label")).toHaveTextContent("Aralık 2025");
  });

  it("KDV:48-49 iki düğme de devre dışıdır, gerekçe EKRANDA görünür", () => {
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-xml")).toBeDisabled();
    expect(screen.getByTestId("kdv-send")).toBeDisabled();
    expect(screen.getByTestId("kdv-send-reason")).toHaveTextContent(
      "e-Fatura/GİB entegrasyonu ertelendi (kullanıcı kararı)",
    );
  });
});

describe("KDV:53-70 — üç özet kartı", () => {
  it("hesaplanan KIRMIZI, indirilecek YEŞİL, alt notlarıyla birlikte", () => {
    render(<VatReturnView />);
    const calculated = screen.getByTestId("kdv-card-calculated");
    expect(calculated).toHaveTextContent("₺ 824.000");
    expect(calculated).toHaveTextContent("Satışlardan doğan");
    expect(calculated.querySelector(".mu-vat-card__value--danger")).not.toBeNull();
    const deductible = screen.getByTestId("kdv-card-deductible");
    expect(deductible).toHaveTextContent("₺ 412.000");
    expect(deductible).toHaveTextContent("Alımlardan doğan");
    expect(deductible.querySelector(".mu-vat-card__value--success")).not.toBeNull();
  });

  it("üçüncü kart ÖDENECEK dalında: turuncu vurgu + NOKTALI vade (KDV:66-68)", () => {
    render(<VatReturnView />);
    const card = screen.getByTestId("kdv-card-outcome");
    expect(card).toHaveClass("mu-vat-card--payable");
    expect(card).toHaveTextContent("Ödenecek KDV");
    expect(card).toHaveTextContent("Vade: 28.07.2026");
    expect(screen.getByTestId("kdv-outcome-amount")).toHaveTextContent("₺ 412.000");
  });

  it("🔴 K1 — DEVREDEN dalında başlık, ton, tutar ve not birlikte DÖNER", () => {
    vi.mocked(useVatReturn).mockReturnValue(queryResult({ data: CARRIED }));
    render(<VatReturnView />);
    const card = screen.getByTestId("kdv-card-outcome");
    expect(card).toHaveClass("mu-vat-card--carried");
    expect(card).not.toHaveClass("mu-vat-card--payable");
    expect(card).toHaveTextContent("Devreden KDV");
    expect(card).toHaveTextContent("Gelecek döneme devreder");
    expect(card).not.toHaveTextContent("Vade:");
    expect(screen.getByTestId("kdv-outcome-amount")).toHaveTextContent("₺ 412.000");
  });
});

describe("KDV:74-104 — Tablo 1 (Matrah ve Vergi)", () => {
  it("🔴 `İşlem` hücresi ORANDAN türer; mockup'ın sınıflandırması UYDURULMAZ", () => {
    render(<VatReturnView />);
    const row = screen.getByTestId("kdv-taxable-rate-20.00");
    expect(row).toHaveTextContent("%20 oranlı teslimler");
    expect(row).not.toHaveTextContent("Yurt İçi Teslimler");
  });

  it("🔴 İSTİSNA satırı `exempt_base`ten kurulur, italik/gri ve TOPLAMDAN ÖNCE", () => {
    render(<VatReturnView />);
    const exempt = screen.getByTestId("kdv-taxable-exempt");
    expect(exempt).toHaveClass("mu-vat-exempt");
    expect(exempt).toHaveTextContent("İstisna İşlemler");
    const cells = within(exempt).getAllByRole("cell");
    // Oran YOKTUR → `—`; matrah ve vergi `0` DEĞİL, GERÇEK/sıfır sayı basar.
    expect(cells[1]).toHaveTextContent("—");
    expect(cells[2]).toHaveTextContent("500.000");
    expect(cells[3]).toHaveTextContent("0");
    // Toplam satırı istisna satırının ALTINDADIR (DOM sırası).
    const body = exempt.parentElement;
    const rows = [...(body?.children ?? [])];
    expect(rows.indexOf(exempt)).toBeLessThan(
      rows.indexOf(screen.getByTestId("kdv-taxable-total")),
    );
  });

  it("🔴 K7 — bu ekranda SIFIR `0` yazılır, `—` DEĞİL (Mizan'ın TERSİ)", () => {
    vi.mocked(useVatReturn).mockReturnValue(
      queryResult({ data: response({ exempt_base: "0.00" }) }),
    );
    render(<VatReturnView />);
    const cells = within(screen.getByTestId("kdv-taxable-exempt")).getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("0");
    expect(cells[2]).not.toHaveTextContent("—");
  });

  it("🔴 matrah toplamı GÖRÜNEN sütunu toplar; vergi toplamı SUNUCUDAN gelir", () => {
    render(<VatReturnView />);
    // 4.120.000 (oranlı) + 500.000 (istisna) = 4.620.000
    expect(screen.getByTestId("kdv-taxable-base-total")).toHaveTextContent("4.620.000");
    expect(screen.getByTestId("kdv-taxable-total")).toHaveTextContent("824.000");
  });

  it("toplam satırı `tfoot` DEĞİL, `tbody`nin son satırıdır (KDV:96)", () => {
    render(<VatReturnView />);
    const total = screen.getByTestId("kdv-taxable-total");
    expect(total.parentElement?.tagName).toBe("TBODY");
  });
});

describe("KDV:106-132 — İndirimler tablosu", () => {
  it("🔴 satır SAYISI sunucudan gelir — mockup'ın iki satırı UYDURULMAZ", () => {
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-deduction-Alışlar")).toHaveTextContent("Alışlar");
    expect(screen.queryByText("Mal Alışları")).toBeNull();
    expect(screen.queryByText("Hizmet Alımları")).toBeNull();
  });

  it("sunucu bir gün İKİ satır dönerse ikisi de basılır (şema liste tipidir)", () => {
    vi.mocked(useVatReturn).mockReturnValue(
      queryResult({
        data: response({
          deductions: [
            { source: "Mal Alışları", base: "1642500.00", vat: "328500.00" },
            { source: "Hizmet Alımları", base: "418000.00", vat: "83500.00" },
          ],
        }),
      }),
    );
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-deduction-Mal Alışları")).toBeInTheDocument();
    expect(screen.getByTestId("kdv-deduction-Hizmet Alımları")).toBeInTheDocument();
    expect(screen.getByTestId("kdv-deduction-base-total")).toHaveTextContent("2.060.500");
  });

  it("toplam satırı: matrah İSTEMCİDE toplanır, KDV `deductible_vat`tir", () => {
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-deduction-base-total")).toHaveTextContent("2.060.500");
    expect(screen.getByTestId("kdv-deduction-total")).toHaveTextContent("412.000");
  });
});

describe("KDV:134-143 — sonuç şeridi (İKİ dal)", () => {
  it("ödenecek dalı: turuncu, aritmetik parantezde, UZUN tarih satırı", () => {
    render(<VatReturnView />);
    const result = screen.getByTestId("kdv-result");
    expect(result).toHaveClass("mu-vat-result--payable");
    expect(result).toHaveTextContent("Ödenecek KDV (824.000 – 412.000)");
    expect(screen.getByTestId("kdv-result-date")).toHaveTextContent(
      "Son ödeme tarihi: 28 Temmuz 2026",
    );
    expect(result).toHaveTextContent("₺ 412.000");
  });

  it("🔴 K1 — devreden dalı: yeşil, aritmetik TERS, tarih satırı YOK", () => {
    vi.mocked(useVatReturn).mockReturnValue(queryResult({ data: CARRIED }));
    render(<VatReturnView />);
    const result = screen.getByTestId("kdv-result");
    expect(result).toHaveClass("mu-vat-result--carried");
    expect(result).toHaveTextContent("Devreden KDV (824.000 – 412.000)");
    expect(screen.queryByTestId("kdv-result-date")).toBeNull();
  });

  it("🔴 tarih İKİ biçimde basılır: kartta noktalı, şeritte uzun — BİRLEŞTİRİLMEZ", () => {
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-card-outcome")).toHaveTextContent("28.07.2026");
    expect(screen.getByTestId("kdv-result-date")).toHaveTextContent("28 Temmuz 2026");
  });
});

describe("yükleme · hata · yetki", () => {
  it("veri gelmeden gövde BASILMAZ, yükleme metni görünür", () => {
    vi.mocked(useVatReturn).mockReturnValue(queryResult({ isLoading: true }));
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("kdv-result")).toBeNull();
    expect(screen.queryByTestId("kdv-card-outcome")).toBeNull();
  });

  it("hata YUTULMAZ: sunucunun Türkçe metni basılır ve gövde çizilmez", () => {
    vi.mocked(useVatReturn).mockReturnValue(
      queryResult({
        isError: true,
        error: new BackendError(500, { detail: "Beyanname hesaplanamadı." }),
      }),
    );
    render(<VatReturnView />);
    expect(screen.getByTestId("kdv-error")).toHaveTextContent("Beyanname hesaplanamadı.");
    expect(screen.queryByTestId("kdv-result")).toBeNull();
  });

  it("görüntüleme yetkisi AÇIKÇA `none` ise erişim reddedilir", () => {
    setSession("none");
    render(<VatReturnView />);
    expect(screen.queryByRole("heading", { name: "KDV Beyannamesi" })).toBeNull();
  });

  it("sunucu 403 verirse de erişim reddedilir", () => {
    vi.mocked(useVatReturn).mockReturnValue(
      queryResult({ isError: true, error: new BackendError(403, { detail: "yok" }) }),
    );
    render(<VatReturnView />);
    expect(screen.queryByRole("heading", { name: "KDV Beyannamesi" })).toBeNull();
  });
});
