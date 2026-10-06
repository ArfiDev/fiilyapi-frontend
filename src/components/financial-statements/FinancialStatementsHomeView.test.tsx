import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";
import type { IncomeStatementResponse } from "@/lib/api/hooks/useIncomeStatement";
import { useIncomeStatement } from "@/lib/api/hooks/useIncomeStatement";
import { BackendError } from "@/lib/api/unwrap";
import { pendingModuleLabel } from "@/lib/pending-modules";

import { FinancialStatementsHomeView } from "./FinancialStatementsHomeView";
import {
  INCOME_STATEMENT_EXPORT_REASON,
  INCOME_STATEMENT_TREND_REASON,
  PERFORMANCE_SUMMARY_REASON,
  PROJECT_FILTER_REASON,
  PROJECT_PROFITABILITY_REASON,
} from "./income-statement";

vi.mock("@/lib/api/hooks/useIncomeStatement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useIncomeStatement")>()),
  useIncomeStatement: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/mali-tablolar" }));

/**
 * 🔴 F-PRJTAB kanonunun TESTTEKİ karşılığı: gerekçe metinleri kayıttan TÜRER,
 * öğenin yanına SABİTLENMEZ. Kayıt burada MÜHÜRLÜ bir değerle taklit edilir;
 * bir gerekçe ekrana elle yazılırsa bu mühür orada BULUNMAZ ve test kırılır.
 * (Metnin GERÇEĞİNİ ayrı bir describe gerçek uygulamayla sınar.)
 */
vi.mock("@/lib/pending-modules", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pending-modules")>()),
  pendingModuleLabel: vi.fn(),
}));

const SEAL = (key: string | null | undefined) => `GEREKÇE[${String(key)}]`;

/**
 * Fikstür E11:95-145'in RAKAMLARIDIR ve mockup'ın TABLOSUYLA tutar:
 * 24.870.500 + 124.200 = 24.994.700 ✓ ·
 * 12.480.000 + 5.840.000 + 3.120.000 + 42.000 = 21.482.000 ✓ ·
 * 24.994.700 − 21.482.000 = 3.512.700 ✓ (E11:141).
 */
function response(partial: Partial<IncomeStatementResponse> = {}): IncomeStatementResponse {
  return {
    year: 2026,
    month: 7,
    sections: [
      {
        key: "revenue",
        title: "GELİRLER", // E11:96
        subtotal_label: "Toplam Gelir", // E11:106
        subtotal: "24994700.00", // E11:107
        lines: [
          { key: "construction_revenue", label: "İş Hasılatı", amount: "24870500.00", account_codes: ["600"] }, // E11:98
          { key: "other_revenue", label: "Diğer Gelirler", amount: "124200.00", account_codes: ["649"] }, // E11:102
        ],
      },
      {
        key: "expenses",
        title: "GİDERLER", // E11:114
        subtotal_label: "Toplam Gider", // E11:132
        subtotal: "21482000.00", // E11:133
        lines: [
          { key: "material_costs", label: "Malzeme Giderleri", amount: "12480000.00", account_codes: ["150"] }, // E11:116
          { key: "labor_costs", label: "İşçilik Giderleri", amount: "5840000.00", account_codes: ["720"] }, // E11:121
          { key: "subcontractor_costs", label: "Taşeron Ödemeleri", amount: "3120000.00", account_codes: ["740"] }, // E11:126
          { key: "general_expenses", label: "Genel Giderler", amount: "42000.00", account_codes: ["770"] }, // E11:129
        ],
      },
    ],
    total_revenue: "24994700.00",
    total_expense: "21482000.00",
    profit_label: "DÖNEM KARI", // E11:140
    period_profit: "3512700.00", // E11:141
    ...partial,
  };
}

function queryResult(partial: Record<string, unknown>) {
  return {
    data: undefined,
    error: null,
    isLoading: false,
    isError: false,
    ...partial,
  } as unknown as UseQueryResult<IncomeStatementResponse, Error>;
}

function setSession(level: string | undefined) {
  // IZN-F6a · modül düzeyi → sayfa izni (ACCOUNTING_VIEW kümesi); izin hiç yoksa kapı KAPALI (fail-closed).
  const pages = level === undefined ? {} : pagesFor(ACCOUNTING_VIEW, level === "none" ? "none" : level === "view" ? "view" : "edit");
  vi.mocked(useSession).mockReturnValue({ me: meFixture({ pages }) } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 📅 YEREL takvim (TB5): varsayılan dönem `getFullYear()/getMonth()`ten
  // türer. 20 Temmuz 2026 ⇒ mockup'ın `Ocak – Temmuz 2026` aralığı çıkar.
  vi.setSystemTime(new Date(2026, 6, 20, 9, 0, 0));
  setSession("full");
  vi.mocked(pendingModuleLabel).mockImplementation(SEAL);
  vi.mocked(useIncomeStatement).mockReturnValue(queryResult({ data: response() }));
});

describe("E11 · `/mali-tablolar` kök ekranı — başlık şeridi", () => {
  it("E11:62 üst etiketi ve E11:64 başlığı basılır", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-eyebrow")).toHaveTextContent("Mali");
    expect(
      screen.getByRole("heading", { name: "Mali Tablolar", level: 1 }),
    ).toBeInTheDocument();
  });

  it("ekran YÜKLENDİ damgası vardır (görsel spec'in tutamağı)", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-loaded")).toBeInTheDocument();
  });

  it("🔴 E11:36-58 bu rota drill sidebar ÇİZMEZ (grup layout'u BİLEREK yok)", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.queryByRole("complementary", { name: "Mali tablolar menüsü" })).toBeNull();
  });
});

describe("E11:66-70 segment denetimi", () => {
  it("`Bilanço` ve `Nakit Akışı` GERÇEK bağlantılardır", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-seg-bilanco")).toHaveAttribute(
      "href",
      "/mali-tablolar/bilanco",
    );
    expect(screen.getByTestId("mt-seg-nakit-akisi")).toHaveAttribute(
      "href",
      "/mali-tablolar/nakit-akisi",
    );
  });

  it("🔴 E11:67 `Gelir Tablosu` BAĞLANTI DEĞİLDİR — bulunulan sayfa odur", () => {
    render(<FinancialStatementsHomeView />);
    const current = screen.getByTestId("mt-seg-current");
    expect(current).toHaveTextContent("Gelir Tablosu");
    expect(current.tagName).not.toBe("A");
    expect(current).toHaveClass("fs-mt-seg__item--current");
  });

  it("🔴 K3/K7 — sayfada `aria-current` sürecek İKİNCİ bir öğe YOKTUR", () => {
    const { container } = render(<FinancialStatementsHomeView />);
    // Kabuk sidebar'ının `Mali Tablolar` girdisi bu rotada zaten sürüyor; bu
    // ekranın kendi DOM'u hiç sürmemelidir.
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });
});

describe("🔴 E11:87-147 · GELİR TABLOSU artık GERÇEKTİR (uç açıldı)", () => {
  it("tablo sunucunun kalemlerini ve toplamlarını basar", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-is-table")).toBeInTheDocument();
    expect(screen.getByTestId("mt-is-section-revenue-construction_revenue")).toHaveTextContent(
      "24.870.500",
    );
    expect(screen.getByTestId("mt-is-section-revenue-subtotal")).toHaveTextContent("24.994.700");
    expect(screen.getByTestId("mt-is-section-expenses-subtotal")).toHaveTextContent("21.482.000");
    expect(screen.getByTestId("mt-is-profit")).toHaveTextContent("3.512.700");
  });

  it("🔴 kart alt başlığı SUNUCUNUN dönemidir (istemcinin isteği DEĞİL)", () => {
    // Sunucu Haziran döndürüyorsa ekran Haziran yazar — istemci Temmuz istemiş
    // olsa bile. Hangi dönemin görüldüğünün tek kanıtı yanıttır.
    vi.mocked(useIncomeStatement).mockReturnValue(
      queryResult({ data: response({ year: 2026, month: 6 }) }),
    );
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-is-period-label")).toHaveTextContent("Ocak–Haziran 2026");
  });

  it("🔴 K1 mutabakat şeridi VERİ GELMEDEN basılmaz, geldiğinde BASILIR", () => {
    vi.mocked(useIncomeStatement).mockReturnValue(queryResult({ isLoading: true }));
    const { unmount } = render(<FinancialStatementsHomeView />);
    expect(screen.queryByTestId("mt-is-banner")).toBeNull();
    expect(screen.getByTestId("mt-loading")).toBeInTheDocument();
    unmount();

    vi.mocked(useIncomeStatement).mockReturnValue(queryResult({ data: response() }));
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-is-banner")).toHaveClass("fs-banner--ok");
  });

  it("hata dalında tablo BASILMAZ, hata metni basılır", () => {
    vi.mocked(useIncomeStatement).mockReturnValue(
      queryResult({ isError: true, error: new BackendError(500, { detail: "patladı" }) }),
    );
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-error")).toBeInTheDocument();
    expect(screen.queryByTestId("mt-is-table")).toBeNull();
    expect(screen.queryByTestId("mt-loaded")).toBeNull();
  });

  it("403 dalında erişim reddi ekranı basılır", () => {
    vi.mocked(useIncomeStatement).mockReturnValue(
      queryResult({ isError: true, error: new BackendError(403, { detail: "yok" }) }),
    );
    render(<FinancialStatementsHomeView />);
    expect(screen.queryByRole("heading", { name: "Mali Tablolar", level: 1 })).toBeNull();
  });
});

describe("🔴 E11:76-81 · DÖNEM GEZGİNİ ARTIK ÇALIŞIR", () => {
  it("varsayılan dönem YEREL takvimden gelir ve BİRİKİMLİ aralık basar", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-period-label")).toHaveTextContent("Ocak–Temmuz 2026");
    // Uç GERÇEKTEN o dönemle çağrıldı (etiket süslemesi değil).
    expect(vi.mocked(useIncomeStatement)).toHaveBeenCalledWith(2026, 7);
  });

  it("`‹` bir ay geriye gider ve UCU YENİDEN ÇAĞIRIR", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FinancialStatementsHomeView />);

    await user.click(screen.getByTestId("mt-period-prev"));
    expect(screen.getByTestId("mt-period-label")).toHaveTextContent("Ocak–Haziran 2026");
    expect(vi.mocked(useIncomeStatement)).toHaveBeenCalledWith(2026, 6);
  });

  it("🔴 `›` İÇİNDE BULUNULAN AYDA KAPALIDIR (geleceğin gelir tablosu yoktur)", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FinancialStatementsHomeView />);

    expect(screen.getByTestId("mt-period-next")).toBeDisabled();
    // Geri gidince AÇILIR — kapalılık bir dönem KARARIdır, sabit bir hâl değil.
    await user.click(screen.getByTestId("mt-period-prev"));
    expect(screen.getByTestId("mt-period-next")).toBeEnabled();
    await user.click(screen.getByTestId("mt-period-next"));
    expect(screen.getByTestId("mt-period-label")).toHaveTextContent("Ocak–Temmuz 2026");
  });

  it("YIL sınırı aşılır: Ocak'ın öncesi önceki yılın Aralık'ıdır", async () => {
    vi.setSystemTime(new Date(2026, 0, 15, 9, 0, 0));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FinancialStatementsHomeView />);

    // Ocak'ta aralığın iki ucu AYNIdır ⇒ kısa yazım.
    expect(screen.getByTestId("mt-period-label")).toHaveTextContent("Ocak 2026");
    await user.click(screen.getByTestId("mt-period-prev"));
    expect(vi.mocked(useIncomeStatement)).toHaveBeenCalledWith(2025, 12);
  });
});

describe("🔴 K2 · KAYNAKSIZ YÜZEYLER — silinmez, DEVRE DIŞI + TÜREVİ gerekçeyle basılır", () => {
  it("E11:71 `PDF İndir` devre dışıdır ve gerekçesi KAYITTAN gelir", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-export-pdf")).toBeDisabled();
    expect(screen.getByTestId("mt-export-reason")).toHaveTextContent(
      SEAL(INCOME_STATEMENT_EXPORT_REASON),
    );
  });

  it("E11:82 proje süzgeci devre dışıdır ve gerekçesi KAYITTAN gelir", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-project-filter")).toBeDisabled();
    expect(screen.getByTestId("mt-project-filter-reason")).toHaveTextContent(
      SEAL(PROJECT_FILTER_REASON),
    );
  });

  it("E11:99 TREND sütununun gerekçesi KAYITTAN gelir", () => {
    render(<FinancialStatementsHomeView />);
    expect(screen.getByTestId("mt-is-ratio-note")).toHaveTextContent(
      SEAL(INCOME_STATEMENT_TREND_REASON),
    );
  });

  it("🔴 SAĞ SÜTUNUN İKİ KARTI devre dışıdır — TABLO KARTI ARTIK DEĞİL", () => {
    render(<FinancialStatementsHomeView />);
    for (const testId of ["mt-performance", "mt-profitability"]) {
      expect(screen.getByTestId(testId)).toHaveClass("fs-mt-card--disabled");
    }
    // 🔴 Ayrışma noktası: tablo kartı devre dışı SINIFINI TAŞIMAZ.
    expect(screen.getByTestId("mt-income-statement")).not.toHaveClass("fs-mt-card--disabled");
    expect(screen.queryByTestId("mt-income-statement-reason")).toBeNull();

    expect(screen.getByTestId("mt-performance-reason")).toHaveTextContent(
      SEAL(PERFORMANCE_SUMMARY_REASON),
    );
    expect(screen.getByTestId("mt-profitability-reason")).toHaveTextContent(
      SEAL(PROJECT_PROFITABILITY_REASON),
    );
  });

  it("🔴 İKİ ÖZET KARTI SAYI İCAT ETMEZ (mockup'ın kaynaksız yüzdeleri sızmaz)", () => {
    render(<FinancialStatementsHomeView />);
    const aside = screen.getByTestId("mt-grid").querySelector(".fs-mt-aside");
    const text = aside?.textContent ?? "";
    // `%76,7` (Bütçe Kullanımı) · `%66,3` (Tahsilat Oranı) · `%16,2`…
    // (proje kârlılıkları) HİÇBİR uçtan gelmiyor.
    for (const invented of ["%76,7", "%66,3", "%16,2", "%12,8", "%11,4", "%18,5", "Güneşkent"]) {
      expect(text).not.toContain(invented);
    }
  });
});

describe("🔴 dört anahtar kayıtta GERÇEKTEN tanımlıdır", () => {
  it("hiçbiri genel fallback metnine düşmez ve ölçülmüş olguyu söyler", async () => {
    // Mühür KALDIRILIR: gerçek `pendingModuleLabel` koşar. Anahtar kayıtta
    // yoksa "İlgili modülle birlikte gelir" döner — o metin bu ekranda hiçbir
    // şey ANLATMAZ ve kabul edilemez.
    const actual =
      await vi.importActual<typeof import("@/lib/pending-modules")>("@/lib/pending-modules");
    const keys = [
      INCOME_STATEMENT_EXPORT_REASON,
      INCOME_STATEMENT_TREND_REASON,
      PROJECT_FILTER_REASON,
      PERFORMANCE_SUMMARY_REASON,
      PROJECT_PROFITABILITY_REASON,
    ];
    // Beş anahtar da BİRBİRİNDEN farklıdır (K6: ekran/yüzey başına ayrı metin).
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      const label = actual.pendingModuleLabel(key);
      expect(label).not.toBe("İlgili modülle birlikte gelir");
      expect(label.length).toBeGreaterThan(20);
    }
  });

  /**
   * 🔴 K2 — İKİ ÖZET KARTININ gerekçeleri BUGÜN YANLIŞTI: "gelir tablosu
   * ucuyla birlikte gelir (MT-2)" diyorlardı. Uç AÇILDI ve kartlar hâlâ
   * kapalı; metin artık bir YALANDIR. Bekçi metnin o vaadi TEKRARLAMADIĞINI
   * çakar (F-PRJTAB kanonu: yaşayan gerekçe çalışan yüzeyle ÇELİŞEMEZ).
   */
  it("🔴 iki özet kartının gerekçesi ARTIK `MT-2 ile gelir` DEMEZ", async () => {
    const actual =
      await vi.importActual<typeof import("@/lib/pending-modules")>("@/lib/pending-modules");
    for (const key of [PERFORMANCE_SUMMARY_REASON, PROJECT_PROFITABILITY_REASON]) {
      const label = actual.pendingModuleLabel(key);
      expect(label).not.toMatch(/MT-2/);
      expect(label).not.toMatch(/gelir tablosu ucuyla/i);
    }
  });
});

describe("yetki", () => {
  it("görüntüleme yetkisi AÇIKÇA `none` ise erişim reddedilir", () => {
    setSession("none");
    render(<FinancialStatementsHomeView />);
    expect(screen.queryByRole("heading", { name: "Mali Tablolar" })).toBeNull();
  });

  // IZN-F6a · bilinmezlik kuralı KALKTI: sayfa izni hiç yoksa ekran KAPALI (fail-closed).
  it("sayfa izni YOKSA ekran KAPALI kalır (fail-closed)", () => {
    setSession(undefined);
    render(<FinancialStatementsHomeView />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Mali Tablolar", level: 1 })).toBeNull();
  });

  it("yalnız Görür sayfa izni → ekran AÇIK", () => {
    setSession("view");
    render(<FinancialStatementsHomeView />);
    expect(screen.getByRole("heading", { name: "Mali Tablolar", level: 1 })).toBeInTheDocument();
  });
});

describe("E11:82 süzgecin tek seçeneği", () => {
  it("`Tüm Projeler` DIŞINDA bir seçenek SUNULMAZ (süzgeç uçta yok)", () => {
    render(<FinancialStatementsHomeView />);
    const options = within(screen.getByTestId("mt-project-filter")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Tüm Projeler"]);
  });
});
