import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import {
  usePayrollRates,
  usePayrollTaxBrackets,
  useReplacePayrollTaxBrackets,
  useUpsertPayrollRate,
} from "@/lib/api/hooks/usePayrollRates";
import type { MeResponse } from "@/lib/auth/types";

import { PayrollRatesScreen } from "./PayrollRatesScreen";
import { unsavedRegistry } from "@/lib/workspace-tabs/unsaved-registry";

vi.mock("@/lib/api/hooks/usePayrollRates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayrollRates")>()),
  usePayrollRates: vi.fn(),
  usePayrollTaxBrackets: vi.fn(),
  useUpsertPayrollRate: vi.fn(),
  useReplacePayrollTaxBrackets: vi.fn(),
}));
vi.mock("@/lib/api/hooks/usePayroll", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/usePayroll")>()),
  usePayrollPeriods: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const upsertRate = vi.fn();
const replaceBrackets = vi.fn();

/** Ekran `new Date().getFullYear()` okur — testin sabiti onunla AYNI olmalı. */
const NOW_YEAR = new Date().getFullYear();
const DATA_YEAR = NOW_YEAR;
const EMPTY_YEAR = NOW_YEAR + 1;

function q(data: unknown, extra: Record<string, unknown> = {}) {
  return { data, error: null, isError: false, isLoading: false, ...extra } as never;
}

function rate(source: string, over: Record<string, unknown> = {}) {
  return {
    id: `r-${source}`,
    year: DATA_YEAR,
    personnel_source: source,
    sgk_employee_pct: "14.000",
    unemployment_employee_pct: "1.000",
    income_tax_pct: null,
    stamp_tax_pct: "0.759",
    sgk_employer_pct: "20.500",
    unemployment_employer_pct: "2.000",
    short_work_pct: "0.000",
    is_active: true,
    ...over,
  };
}

const BRACKETS = [
  { id: "b1", year: DATA_YEAR, income_kind: "wage", ordinal: 1, upper_bound: "190000.00", rate_pct: "15.000", is_active: true },
  { id: "b2", year: DATA_YEAR, income_kind: "wage", ordinal: 2, upper_bound: "400000.00", rate_pct: "20.000", is_active: true },
  { id: "b3", year: DATA_YEAR, income_kind: "wage", ordinal: 3, upper_bound: null, rate_pct: "40.000", is_active: true },
];

function mockSession(payrollLevel: string | undefined) {
  const me = {
    id: "me",
    email: "me@fiil.com",
    full_name: "Deneme",
    title: "",
    role_key: "patron",
    status: "active",
    ...(payrollLevel === undefined ? {} : { permissions: { payroll: payrollLevel } }),
  } as unknown as MeResponse;
  vi.mocked(useSession).mockReturnValue({ me, isLoading: false } as never);
}

function period(year: number, status: string) {
  return {
    id: `p-${year}-${status}`,
    year,
    month: 1,
    status,
    payment_due_date: null,
    paid_at: null,
    personnel_count: 0,
    gross_total: "0.00",
    sgk_employer_total: "0.00",
    net_total: "0.00",
    total_cost: "0.00",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession("admin");
  vi.mocked(usePayrollRates).mockReturnValue(
    q({ items: [rate("company"), rate("subcontractor")], total: 2 }),
  );
  vi.mocked(usePayrollTaxBrackets).mockReturnValue(q({ items: BRACKETS, total: BRACKETS.length }));
  vi.mocked(usePayrollPeriods).mockReturnValue(q({ items: [], total: 0, limit: 200, offset: 0 }));
  vi.mocked(useUpsertPayrollRate).mockReturnValue({ mutate: upsertRate, isPending: false } as never);
  vi.mocked(useReplacePayrollTaxBrackets).mockReturnValue({
    mutate: replaceBrackets,
    isPending: false,
  } as never);
});

describe("dört bordro tipi (`general` DEĞİL)", () => {
  it("DÖRT sekme basar ve `Genel İşçi` YOKTUR", () => {
    render(<PayrollRatesScreen />);
    const tabs = screen.getAllByRole("tab", { selected: false }).concat(
      screen.getAllByRole("tab", { selected: true }),
    );
    expect(screen.getByRole("tab", { name: /Şirket Kadrosu/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Taşeron İşçisi/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Serbest Meslek/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Stajyer/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Genel İşçi/ })).toBeNull();
    // Dört tip + iki gelir türü sekmesi.
    expect(tabs).toHaveLength(6);
  });
  it("oran seti olmayan tipi EKSİK rozetiyle işaretler", () => {
    render(<PayrollRatesScreen />);
    expect(within(screen.getByRole("tab", { name: /Şirket Kadrosu/ })).getByText("TAM")).toBeInTheDocument();
    expect(within(screen.getByRole("tab", { name: /Stajyer/ })).getByText("EKSİK")).toBeInTheDocument();
  });
});

describe("gelir vergisi oranı — NULL DİLİMLİ REJİMDİR (mockup notu TERS)", () => {
  it("`income_tax_pct: null` boş kutu + `Dilimli tarife` olarak basılır", () => {
    render(<PayrollRatesScreen />);
    expect(screen.getByLabelText("Gelir Vergisi Oranı")).toHaveValue("");
    expect(screen.getByText("Dilimli tarife")).toBeInTheDocument();
  });
  it("notu doğru yönde anlatır (boş ⇒ DİLİMLER kullanılır)", () => {
    render(<PayrollRatesScreen />);
    expect(
      screen.getByText(/Boş bırakılırsa aşağıdaki gelir vergisi DİLİMLERİ kullanılır/),
    ).toBeInTheDocument();
  });
});

describe("toplam sütunu", () => {
  it("işçi + işveren payını ondalık aritmetikle toplar", () => {
    render(<PayrollRatesScreen />);
    // Mockup `:151` "34,50" — EN AZ iki ondalık (sondaki sıfır ATILMAZ).
    expect(screen.getByText("34,50")).toBeInTheDocument();
    expect(screen.getByText("3,00")).toBeInTheDocument();
    expect(screen.getByText("0,759")).toBeInTheDocument();
  });
});

describe("kısa çalışma — TEK ORAN", () => {
  it("işçi/işveren çifti DEĞİLDİR: tek kutu iki kolonu kaplar", () => {
    render(<PayrollRatesScreen />);
    const input = screen.getByLabelText("Kısa Çalışma Ödeneği");
    expect(input.closest("td")).toHaveAttribute("colspan", "2");
    expect(screen.queryByLabelText("Kısa Çalışma Ödeneği işveren payı")).toBeNull();
  });
});

describe("TAM KÜME yazma uyarısı", () => {
  it("dilim kartında kalıcı olarak GÖRÜNÜR", () => {
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId("bro-full-set-warning").textContent).toMatch(
      /tarifenin TAMAMINI değiştirir/,
    );
    expect(screen.getByTestId("bro-full-set-warning").textContent).toMatch(
      /Sildiğiniz dilim sunucudan da silinir/,
    );
  });
});

describe("yıl kilidi — 409'un ÖN kapısı", () => {
  it("onaylı dönemi olan yılda kaydet düğmeleri YOK, gerekçe GÖRÜNÜR", () => {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      q({ items: [period(DATA_YEAR, "approved")], total: 1, limit: 200, offset: 0 }),
    );
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId("bro-locked").textContent).toMatch(/onaylanmış veya ödenmiş/);
    expect(screen.queryByTestId("bro-save-rates")).toBeNull();
    expect(screen.queryByTestId("bro-save-brackets")).toBeNull();
    expect(screen.getByLabelText("SGK Primi işçi payı")).toHaveAttribute("readonly");
  });
  /**
   * ⚠️ Fikstür GEÇMİŞ bir veri yılı TAŞIMALIDIR: `bro-copy` yalnız "seçili
   * yıldan önce, verisi olan bir yıl" varken basılır. Onsuz düğme ZATEN
   * görünmez ve test hiçbir şey bekçilemez — ilk hâli tam bu yüzden
   * MUTASYONU GEÇİRDİ (kilit kaldırıldığında da yeşil kaldı).
   */
  it("kilitli yılda araç çubuğundaki KOPYALA da basılmaz (ölü eylem yok)", () => {
    vi.mocked(usePayrollRates).mockReturnValue(
      q({ items: [rate("company"), rate("company", { year: DATA_YEAR - 1 })], total: 2 }),
    );
    vi.mocked(usePayrollPeriods).mockReturnValue(
      q({ items: [period(DATA_YEAR, "paid")], total: 1, limit: 200, offset: 0 }),
    );
    render(<PayrollRatesScreen />);
    expect(screen.queryByTestId("bro-copy")).toBeNull();
    // Gelecek yılı (KİLİTSİZ) hedefleyen düğme KALIR.
    expect(screen.getByTestId("bro-copy-next")).toBeInTheDocument();
  });
  it("kilitsiz yılda araç çubuğundaki KOPYALA GÖRÜNÜR (pozitif kontrol)", () => {
    vi.mocked(usePayrollRates).mockReturnValue(
      q({ items: [rate("company"), rate("company", { year: DATA_YEAR - 1 })], total: 2 }),
    );
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId("bro-copy")).toBeInTheDocument();
  });
  it("taslak dönemli yıl SERBESTTİR (kural bordroyu tıkamaz)", () => {
    vi.mocked(usePayrollPeriods).mockReturnValue(
      q({ items: [period(DATA_YEAR, "draft")], total: 1, limit: 200, offset: 0 }),
    );
    render(<PayrollRatesScreen />);
    expect(screen.queryByTestId("bro-locked")).toBeNull();
    expect(screen.getByTestId("bro-save-rates")).toBeInTheDocument();
  });
});

describe("İKİ AYRI YETKİ KAPISI (oran `full`, tarife `admin`)", () => {
  it("`full` seviyede oran kaydedilir ama TARİFE kaydedilemez", () => {
    mockSession("full");
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId("bro-save-rates")).toBeInTheDocument();
    expect(screen.queryByTestId("bro-save-brackets")).toBeNull();
    expect(screen.getByTestId("bro-bracket-permission").textContent).toMatch(/yönetici/);
  });
  it("`view` seviyede ikisi de kapalıdır", () => {
    mockSession("view");
    render(<PayrollRatesScreen />);
    expect(screen.queryByTestId("bro-save-rates")).toBeNull();
    expect(screen.getByTestId("bro-no-permission")).toBeInTheDocument();
  });
  it("seviye BİLİNMİYORSA ikisi de açıktır (bilinmezlik kuralı)", () => {
    mockSession(undefined);
    render(<PayrollRatesScreen />);
    expect(screen.getByTestId("bro-save-rates")).toBeInTheDocument();
    expect(screen.getByTestId("bro-save-brackets")).toBeInTheDocument();
  });
});

describe("boş yıl — bu dilimin var oluş sebebi", () => {
  it("veride hiç olmayan GELECEK yıl seçilebilir ve boş hâl gösterilir", async () => {
    const user = userEvent.setup();
    render(<PayrollRatesScreen />);
    await user.selectOptions(screen.getByTestId("bro-year"), String(EMPTY_YEAR));
    expect(screen.getByTestId("bro-empty")).toBeInTheDocument();
    expect(screen.getByText(`${EMPTY_YEAR} oranları henüz girilmemiş`)).toBeInTheDocument();
  });
  it("yıl seçeneği 'oran girilmedi' diye işaretlenir", () => {
    render(<PayrollRatesScreen />);
    expect(
      within(screen.getByTestId("bro-year")).getByRole("option", {
        name: `${EMPTY_YEAR} — oran girilmedi`,
      }),
    ).toBeInTheDocument();
  });
});

describe("KOPYALA — sunucuya İSTEK ATMAZ, formu doldurur", () => {
  it("boş yıla kopyalama formu doldurur ve 'kaydedilmedi' der; HİÇBİR mutasyon koşmaz", async () => {
    const user = userEvent.setup();
    render(<PayrollRatesScreen />);
    await user.click(screen.getByTestId("bro-copy-next"));

    expect(screen.getByTestId("bro-copied").textContent).toMatch(/KOPYALANDI/);
    expect(screen.getByTestId("bro-copied").textContent).toMatch(/henüz KAYDEDİLMEDİ/);
    expect(screen.getByLabelText("SGK Primi işçi payı")).toHaveValue("14.000");
    expect(screen.getByLabelText("1. dilim üst sınırı")).toHaveValue("190000.00");
    // 🔴 Kopyalama bir YAZMA DEĞİLDİR — `POST …/copy` ucu yoktur.
    expect(upsertRate).not.toHaveBeenCalled();
    expect(replaceBrackets).not.toHaveBeenCalled();
  });
});

describe("kaydetme", () => {
  it("oran gövdesi YEDİ alanı birden taşır ve `null` gelir vergisini korur", async () => {
    const user = userEvent.setup();
    render(<PayrollRatesScreen />);
    await user.click(screen.getByTestId("bro-save-rates"));
    expect(upsertRate).toHaveBeenCalledTimes(1);
    const [input] = upsertRate.mock.calls[0]!;
    expect(input.year).toBe(DATA_YEAR);
    expect(input.source).toBe("company");
    expect(input.body).toEqual({
      sgk_employee_pct: "14.000",
      unemployment_employee_pct: "1.000",
      income_tax_pct: null,
      stamp_tax_pct: "0.759",
      sgk_employer_pct: "20.500",
      unemployment_employer_pct: "2.000",
      short_work_pct: "0.000",
      is_active: true,
    });
  });

  it("dilim gövdesi TÜM seti taşır ve son dilim `null` sınırlıdır", async () => {
    const user = userEvent.setup();
    render(<PayrollRatesScreen />);
    await user.click(screen.getByTestId("bro-save-brackets"));
    const [input] = replaceBrackets.mock.calls[0]!;
    expect(input.body.brackets).toEqual([
      { ordinal: 1, upper_bound: "190000.00", rate_pct: "15.000" },
      { ordinal: 2, upper_bound: "400000.00", rate_pct: "20.000" },
      { ordinal: 3, upper_bound: null, rate_pct: "40.000" },
    ]);
  });

  it("🔴 SÖZLEŞMEYİ İHLAL EDEN ORAN SUNUCUYA HİÇ GİTMEZ (istemci korkuluğu)", async () => {
    const user = userEvent.setup();
    render(<PayrollRatesScreen />);
    const input = screen.getByLabelText("SGK Primi işçi payı");
    await user.clear(input);
    await user.type(input, "101");
    await user.click(screen.getByTestId("bro-save-rates"));
    expect(upsertRate).not.toHaveBeenCalled();
    expect(screen.getByTestId("bro-rate-error").textContent).toMatch(/en fazla 100/);
  });

  it("🔴 SINIRLI SON DİLİM SUNUCUYA HİÇ GİTMEZ (kural 5)", async () => {
    const user = userEvent.setup();
    render(<PayrollRatesScreen />);
    await user.click(screen.getByTestId("bro-add-bracket"));
    // Yeni satır sondan bir öncedir; sonuncunun üst sınırı hâlâ yoktur.
    // Son satırın oranını boşaltarak seti bozarız.
    const bos = screen.getByLabelText("3. dilim üst sınırı");
    await user.type(bos, "5300000");
    await user.click(screen.getByTestId("bro-save-brackets"));
    // 3. dilim oranı boş → korkuluk keser.
    expect(replaceBrackets).not.toHaveBeenCalled();
    expect(screen.getByTestId("bro-bracket-error")).toBeInTheDocument();
  });
});

describe("alt sınır TÜREVDİR", () => {
  it("önceki üst sınırın 1 kuruş fazlasıdır ve gövdeye GİRMEZ", () => {
    render(<PayrollRatesScreen />);
    const rows = screen.getAllByRole("row");
    // 1. dilim alt sınırı 0, 2. dilim 190.000,01
    expect(screen.getByText("190.000,01")).toBeInTheDocument();
    expect(rows.length).toBeGreaterThan(3);
  });
});

/**
 * 🔴 KUSUR `decimal-normalize-sessiz-kayip`: ekranın ÖZEL `normalize()`si
 * `replace(",", ".")` ile YALNIZ İLK virgülü çeviriyor ve hiçbir doğrulama
 * kapısı yok → çift ayraçlı string doğrudan `sumDecimalStrings`e giriyordu.
 * İki ölçülmüş sonuç: (a) "1.234,56" → toplam sütununda SESSİZ yanlış sayı,
 * (b) "1,2," → `BigInt("12,0")` RENDER SIRASINDA fırlatıyor (hata sınırı yok,
 * tüm ekran kaybediliyor).
 *
 * 🔴 KAYIT 426 (2026-09-23): (a) davranışı `lib/decimal.ts::normalizeDecimalInput`
 * düzeltmesiyle DEĞİŞTİ — "1.234,56" GEÇERLİ bir TR sayısıdır (1234,56),
 * artık virgülden önceki nokta binlik ayıracı sayılıp doğru ayrıştırılır.
 * "—" basmak ARTIK YANLIŞ olurdu (geçerli bir tutarı gizlerdi); test bu
 * yüzden DOĞRU TOPLAMIN basıldığını doğrular. (b) davranışı DEĞİŞMEDİ — çift
 * virgüllü girdi hâlâ gerçekten bozuktur, aşağıdaki test korunur.
 */
describe("geçersiz ondalık girdi — toplam sütunu", () => {
  function totalCellOf(employeeLabel: string): HTMLElement {
    const row = screen.getByLabelText(employeeLabel).closest("tr");
    const cell = row?.querySelector<HTMLElement>(".bro-td--total");
    if (!cell) throw new Error(`toplam hücresi bulunamadı: ${employeeLabel}`);
    return cell;
  }

  it("TR binlik ayraçlı girdi doğru ayrıştırılır, toplam SESSİZCE gizlenmez (KAYIT 426)", async () => {
    render(<PayrollRatesScreen />);
    const employee = screen.getByLabelText("SGK Primi işçi payı");
    await userEvent.clear(employee);
    await userEvent.type(employee, "1.234,56");
    expect(employee).toHaveValue("1.234,56");
    expect(totalCellOf("SGK Primi işçi payı")).toHaveTextContent("1.255,06");
  });

  it("ikinci virgül ekranı ÇÖKERTMEZ", async () => {
    render(<PayrollRatesScreen />);
    const employee = screen.getByLabelText("İşsizlik Sigortası işçi payı");
    await userEvent.clear(employee);
    await userEvent.type(employee, "1,2,");
    expect(employee).toHaveValue("1,2,");
    expect(totalCellOf("İşsizlik Sigortası işçi payı")).toHaveTextContent("—");
  });

  it("geçerli TR virgüllü girdi ÇALIŞMAYA DEVAM eder", async () => {
    render(<PayrollRatesScreen />);
    const employee = screen.getByLabelText("SGK Primi işçi payı");
    await userEvent.clear(employee);
    await userEvent.type(employee, "14,5");
    expect(totalCellOf("SGK Primi işçi payı")).toHaveTextContent("35,00");
  });
});

describe("SEKME-F1.3b — kaydedilmemiş değişiklik kaydı", () => {
  it("yüklendi + dokunulmadı → false", () => {
    render(<PayrollRatesScreen />);
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });

  it("bir oran alanı değişti → true", async () => {
    render(<PayrollRatesScreen />);
    const employee = screen.getByLabelText("SGK Primi işçi payı");
    await userEvent.clear(employee);
    await userEvent.type(employee, "15");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
  });

  it("başarılı kayıt (onSuccess) → false", async () => {
    // Reset zaten koddadır (saveRates onSuccess'te draft'ı siler) — mutasyon
    // mock'u gerçek onSuccess'i çağırarak bunu doğrular.
    upsertRate.mockImplementation((_input, opts) => opts?.onSuccess?.());
    render(<PayrollRatesScreen />);
    const employee = screen.getByLabelText("SGK Primi işçi payı");
    await userEvent.clear(employee);
    await userEvent.type(employee, "15");
    expect(unsavedRegistry.hasUnsaved()).toBe(true);
    await userEvent.click(screen.getByTestId("bro-save-rates"));
    expect(unsavedRegistry.hasUnsaved()).toBe(false);
  });
});
