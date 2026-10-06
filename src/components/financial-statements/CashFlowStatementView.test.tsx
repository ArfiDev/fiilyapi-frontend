import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";
import type {
  CashFlowStatementResponse,
  CashFlowStatementSection,
  MonthlyCashPoint,
} from "@/lib/api/hooks/useCashFlowStatement";
import { useCashFlowStatement } from "@/lib/api/hooks/useCashFlowStatement";
import { BackendError } from "@/lib/api/unwrap";

import { CashFlowStatementView } from "./CashFlowStatementView";

vi.mock("@/lib/api/hooks/useCashFlowStatement", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useCashFlowStatement")>()),
  useCashFlowStatement: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/mali-tablolar/nakit-akisi" }));

/**
 * Fikstür NA:68-110'un RAKAMLARIDIR ve mockup'ın TABLOSUYLA tutar:
 * A = 24.994.700 − 12.480.000 − 5.840.000 − 605.300 − 227.400 = 5.842.000 ✓
 * (NA:71-78) · B = −1.240.000 (NA:84-87) · C = −800.000 (NA:93-96) ·
 * A+B+C = 3.802.000 (NA:105) · 2.447.500 + 3.802.000 = 6.249.500 (NA:101/109).
 *
 * 🔴 K2: NA:58'deki KPI kartı `+ 4.802.000` diyor — 1.000.000 FAZLA ve
 * mockup'ın KENDİ tablosuyla çelişiyor. Fikstür TABLOYU izler (K15).
 */
const OPERATING: CashFlowStatementSection = {
  key: "operating",
  code: "A",
  title: "A. İŞLETME FAALİYETLERİNDEN NAKITLER", // NA:69
  subtotal_label: "İşletme Faaliyetleri Net Nakit", // NA:77
  subtotal: "5842000.00", // NA:78
  lines: [
    { key: "collections", label: "Müşterilerden Tahsilat", amount: "24994700.00", account_codes: ["120"] }, // NA:71
    { key: "suppliers", label: "Tedarikçilere Ödeme", amount: "-12480000.00", account_codes: ["320"] }, // NA:72
    { key: "payroll", label: "Personele Ödeme", amount: "-5840000.00", account_codes: ["335"] }, // NA:73
    { key: "tax", label: "Vergi Ödemesi", amount: "-605300.00", account_codes: ["360"] }, // NA:74
    { key: "other_out", label: "Diğer Nakit Çıkışları", amount: "-227400.00", account_codes: [] }, // NA:75
  ],
};

const INVESTING: CashFlowStatementSection = {
  key: "investing",
  code: "B",
  title: "B. YATIRIM FAALİYETLERİNDEN NAKITLER", // NA:82
  subtotal_label: "Yatırım Faaliyetleri Net Nakit", // NA:86
  subtotal: "-1240000.00", // NA:87
  lines: [
    { key: "equipment", label: "Ekipman Alımı", amount: "-1240000.00", account_codes: ["253"] }, // NA:84
  ],
};

const FINANCING: CashFlowStatementSection = {
  key: "financing",
  code: "C",
  title: "C. FİNANSMAN FAALİYETLERİNDEN NAKITLER", // NA:91
  subtotal_label: "Finansman Faaliyetleri Net Nakit", // NA:95
  subtotal: "-800000.00", // NA:96
  lines: [
    { key: "loan_repayment", label: "Kredi Geri Ödemesi", amount: "-800000.00", account_codes: ["300"] }, // NA:93
  ],
};

/** NA:131-137 — yedi ay, artan ay sonu BAKİYESİ (akış değil). */
const MONTHLY: MonthlyCashPoint[] = [
  { year: 2026, month: 1, closing_cash: "2447500.00" },
  { year: 2026, month: 2, closing_cash: "2900000.00" },
  { year: 2026, month: 3, closing_cash: "3400000.00" },
  { year: 2026, month: 4, closing_cash: "4100000.00" },
  { year: 2026, month: 5, closing_cash: "4900000.00" },
  { year: 2026, month: 6, closing_cash: "5600000.00" },
  { year: 2026, month: 7, closing_cash: "6249500.00" },
];

function response(partial: Partial<CashFlowStatementResponse> = {}): CashFlowStatementResponse {
  return {
    year: 2026,
    month: 7,
    sections: [OPERATING, INVESTING, FINANCING],
    net_change: "3802000.00", // NA:105
    opening_cash: "2447500.00", // NA:101
    closing_cash: "6249500.00", // NA:109
    monthly_cash: MONTHLY,
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
  } as unknown as UseQueryResult<CashFlowStatementResponse, Error>;
}

function setSession(level: string | undefined) {
  // IZN-F6a · modül düzeyi → sayfa izni (ACCOUNTING_VIEW kümesi); izin hiç yoksa kapı KAPALI (fail-closed).
  const pages = level === undefined ? {} : pagesFor(ACCOUNTING_VIEW, level === "none" ? "none" : level === "view" ? "view" : "edit");
  vi.mocked(useSession).mockReturnValue({ me: meFixture({ pages }) } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 📅 YEREL takvim (TB5): `cashFlowPeriodOptions` `getFullYear()/getMonth()`
  // okur. 20 Temmuz 2026 ⇒ mockup'ın iki seçeneği birebir çıkar.
  vi.setSystemTime(new Date(2026, 6, 20, 9, 0, 0));
  setSession("full");
  vi.mocked(useCashFlowStatement).mockReturnValue(queryResult({ data: response() }));
});

describe("Nakit Akış Tablosu — NA başlık şeridi", () => {
  it("geri bağlantısı `← Mali Tablolar` (NA:33) ve başlık (NA:35) basılır", () => {
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-back")).toHaveAttribute("href", "/mali-tablolar");
    expect(screen.getByTestId("na-back")).toHaveTextContent("← Mali Tablolar");
    // 🔴 Sidebar etiketi `Nakit Akışı` (NA:30) ama BAŞLIK `Nakit Akış
    // Tablosu`dur (NA:35) — ikisi BİLEREK farklıdır.
    expect(
      screen.getByRole("heading", { name: "Nakit Akış Tablosu", level: 1 }),
    ).toBeInTheDocument();
  });

  it("🔴 NA:37 seçici BİRİKİMLİ ARALIKTIR ve mockup'ın İKİ seçeneğini sunar", () => {
    render(<CashFlowStatementView />);
    const options = within(screen.getByTestId("na-period")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Ocak–Temmuz 2026", "2025 Yılı"]);
  });

  it("🔴 varsayılan dönem YEREL takvimdendir ve UÇ'a o çift gider (K10)", () => {
    render(<CashFlowStatementView />);
    expect(vi.mocked(useCashFlowStatement)).toHaveBeenCalledWith(2026, 7);
  });

  it("başka bir dönem seçilince UÇ o çiftle yeniden çağrılır", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CashFlowStatementView />);
    await user.selectOptions(screen.getByTestId("na-period"), "2025-12");
    expect(vi.mocked(useCashFlowStatement)).toHaveBeenLastCalledWith(2025, 12);
  });

  it("NA:38 `PDF` devre dışıdır ve gerekçe EKRANDA görünür (K8)", () => {
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-export-pdf")).toBeDisabled();
    expect(screen.getByTestId("na-export-reason")).toHaveTextContent(
      "Nakit akış tablosu dışa aktarma ucu henüz açılmadı",
    );
  });

  /** 🔴 KULLANICI KARARI 2026-08-27 — bkz. `BalanceSheetView.test.tsx`. */
  it("🔴 drill sidebar BASILMAZ — ana menü örtülmez (kullanıcı kararı 2026-08-27)", () => {
    const { container } = render(<CashFlowStatementView />);
    expect(screen.queryByRole("complementary", { name: "Mali tablolar menüsü" })).toBeNull();
    expect(screen.queryByTestId("fs-nav-parent")).toBeNull();
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("🔴 geçiş segmentleri BU ekranda da basılır ve CURRENT `Nakit Akışı`dır", () => {
    render(<CashFlowStatementView />);
    const current = screen.getByTestId("mt-seg-current");
    expect(current).toHaveTextContent("Nakit Akışı");
    expect(current.tagName).not.toBe("A");
    // 🔴 KARŞIT KANIT: yanlış olanlar CURRENT DEĞİL, gerçek bağlantı.
    expect(screen.queryByTestId("mt-seg-nakit-akisi")).toBeNull();
    expect(screen.getByTestId("mt-seg-bilanco")).toHaveAttribute(
      "href",
      "/mali-tablolar/bilanco",
    );
    expect(screen.getByTestId("mt-seg-mali-tablolar")).toHaveAttribute("href", "/mali-tablolar");
  });
});

describe("NA:43-60 — dört kartlık KPI şeridi", () => {
  it("ilk üç kart A/B/C ara toplamlarını kendi TONLARIYLA basar", () => {
    render(<CashFlowStatementView />);
    const operating = screen.getByTestId("na-kpi-operating");
    expect(operating).toHaveTextContent("+ 5.842.000"); // NA:46
    expect(operating).toHaveClass("fs-cf-kpi--in");
    // NA:45 — kart etiketi kod harfi TAŞIMAZ, tablo bandı (NA:69) TAŞIR.
    expect(operating).toHaveTextContent("İŞLETME FAALİYETLERİNDEN NAKITLER");
    expect(operating.textContent ?? "").not.toContain("A. İŞLETME");

    expect(screen.getByTestId("na-kpi-investing")).toHaveTextContent("- 1.240.000"); // NA:50
    expect(screen.getByTestId("na-kpi-investing")).toHaveClass("fs-cf-kpi--out");
    expect(screen.getByTestId("na-kpi-financing")).toHaveTextContent("- 800.000"); // NA:54
    expect(screen.getByTestId("na-kpi-financing")).toHaveClass("fs-cf-kpi--finance");
  });

  it("kart etiketleri SUNUCUDAN gelir, sabitlenmiş DEĞİLDİR", () => {
    vi.mocked(useCashFlowStatement).mockReturnValue(
      queryResult({
        data: response({
          sections: [{ ...OPERATING, title: "A. SUNUCUDAN GELEN BAŞLIK" }, INVESTING, FINANCING],
        }),
      }),
    );
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-kpi-operating")).toHaveTextContent("SUNUCUDAN GELEN BAŞLIK");
  });

  it("NET kart NEGATİF net değişimde KIRMIZI tona düşer (mockup'ta çizilmemiş dal)", () => {
    vi.mocked(useCashFlowStatement).mockReturnValue(
      queryResult({ data: response({ net_change: "-1500000.00" }) }),
    );
    render(<CashFlowStatementView />);
    const net = screen.getByTestId("na-kpi-net");
    expect(net).toHaveTextContent("- 1.500.000");
    expect(net).toHaveClass("fs-cf-kpi--out");
  });
});

describe("🔴 K2 — KPI kartı ile tablonun ORTA satırı AYNI sunucu alanını basar", () => {
  /**
   * 🔴 MUTASYON HEDEFİ. NA:58 KPI kartı `+ 4.802.000`, NA:105 tablo satırı
   * `+ 3.802.000` diyor; ölçüm `5.842.000 − 1.240.000 − 800.000 = 3.802.000`
   * ve tablo kendi içinde tutarlı (`2.447.500 + 3.802.000 = 6.249.500`) ⇒
   * K15 gereği SATIRLAR kazanır ve İKİ YÜZEY de sunucunun `net_change`ini
   * basar.
   *
   * Fikstür A+B+C toplamıyla ÖRTÜŞMEYEN bir `net_change` taşır: kart kendi
   * toplamını hesaplasaydı `3.802.000` basar ve bu iddia KIRILIRDI. Mockup'ın
   * rakamlarıyla yazılmış bir test bu mutasyonu GEÇİRİRDİ.
   */
  it("kart ve satır, A+B+C ile ÖRTÜŞMESE bile sunucunun `net_change`ini basar", () => {
    vi.mocked(useCashFlowStatement).mockReturnValue(
      queryResult({ data: response({ net_change: "9999999.00" }) }),
    );
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-kpi-net")).toHaveTextContent("+ 9.999.999");
    expect(screen.getByTestId("na-net-change")).toHaveTextContent("+ 9.999.999");
    // Bölümlerin toplamı (3.802.000) HİÇBİR yerde basılmaz.
    expect(screen.getByTestId("na-kpi-net").textContent ?? "").not.toContain("3.802.000");
  });

  it("mockup'ın kendi rakamlarında da iki yüzey AYNI sayıyı basar (NA:105)", () => {
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-kpi-net")).toHaveTextContent("+ 3.802.000");
    expect(screen.getByTestId("na-net-change")).toHaveTextContent("+ 3.802.000");
    // 🔴 NA:58'in `4.802.000`i EKRANA GİRMEZ (mockup DÜZELTİLMEDİ, ekran
    // sunucuyu izler).
    expect(screen.getByTestId("na-kpis").textContent ?? "").not.toContain("4.802.000");
  });
});

describe("NA:65-112 — A/B/C tablosu + üç satırlı kapanış", () => {
  it("bölüm bandı → kalemler → ara toplam sırasıyla basılır", () => {
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-section-operating-band")).toHaveTextContent(
      "A. İŞLETME FAALİYETLERİNDEN NAKITLER", // NA:69
    );
    const collections = screen.getByTestId("na-section-operating-collections");
    expect(collections).toHaveTextContent("Müşterilerden Tahsilat");
    expect(collections).toHaveTextContent("+ 24.994.700"); // NA:71
    // NA:71 — `₺` YOK, binlik noktalı, ondalıksız.
    expect(collections.textContent ?? "").not.toContain("₺");
    const subtotal = screen.getByTestId("na-section-operating-subtotal");
    expect(subtotal).toHaveTextContent("İşletme Faaliyetleri Net Nakit"); // NA:77
    expect(subtotal).toHaveTextContent("(A)"); // NA:77 — kod SUNUCUDAN
    expect(subtotal).toHaveTextContent("+ 5.842.000"); // NA:78
  });

  it("🔴 NA:71-75 — GİRİŞ `+`/yeşil, ÇIKIŞ `-`/kırmızı basar", () => {
    render(<CashFlowStatementView />);
    const inflow = screen.getByTestId("na-section-operating-collections");
    const outflow = screen.getByTestId("na-section-operating-suppliers");
    expect(within(inflow).getByText("+ 24.994.700")).toHaveClass("fs-cf-amount--in");
    expect(within(outflow).getByText("- 12.480.000")).toHaveClass("fs-cf-amount--out");
    // Eksi işareti `-12.480.000` gibi BİTİŞİK basılmaz (NA:72 boşlukludur).
    expect(outflow.textContent ?? "").not.toContain("-12.480.000");
  });

  it("🔴 NA:99-110 — ÜÇ SATIRLI kapanış tamdır ve BAKİYELER işaretsizdir", () => {
    render(<CashFlowStatementView />);
    // K9: `schema.d.ts` "mockup'ta DÖNEM BAŞI NAKİT satırı EKSİK" diyor —
    // BAYAT. Mockup NA:100'de o satırı TAŞIYOR ve ekran da basar.
    const opening = screen.getByTestId("na-opening");
    expect(opening).toHaveTextContent("DÖNEM BAŞI NAKİT");
    expect(opening).toHaveTextContent("2.447.500");
    expect(opening.textContent ?? "").not.toContain("+");

    expect(screen.getByTestId("na-net-change")).toHaveTextContent("NET NAKİT DEĞİŞİMİ");
    expect(screen.getByTestId("na-net-change")).toHaveTextContent("(A+B+C)"); // NA:104

    const closing = screen.getByTestId("na-closing");
    expect(closing).toHaveTextContent("DÖNEM SONU NAKİT"); // NA:108
    expect(closing).toHaveTextContent("6.249.500"); // NA:109
    expect(closing.textContent ?? "").not.toContain("+");
  });

  it("bölüm TONU `code` harfinden türer — SIRADAN değil", () => {
    // Sunucu bölümleri ters sırada gönderse bile renkler doğru bölümde kalır.
    vi.mocked(useCashFlowStatement).mockReturnValue(
      queryResult({ data: response({ sections: [FINANCING, INVESTING, OPERATING] }) }),
    );
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-section-financing-band")).toHaveClass("fs-cf-band--finance");
    expect(screen.getByTestId("na-section-operating-band")).toHaveClass("fs-cf-band--in");
  });
});

describe("NA:117-141 — Aylık Nakit Pozisyonu grafiği", () => {
  it("SVG'nin ERİŞİLEBİLİR ADI vardır ve ay etiketleri basılır", () => {
    render(<CashFlowStatementView />);
    const chart = within(screen.getByTestId("na-chart")).getByRole("img");
    expect(chart).toHaveAccessibleName(/Aylık nakit pozisyonu/);
    expect(chart).toHaveAccessibleName(/6.249.500/);
    for (const label of ["Oca", "Şub", "Tem"]) {
      expect(within(screen.getByTestId("na-chart")).getByText(label)).toBeInTheDocument();
    }
  });

  it("seri BOŞSA uydurma eğri BASILMAZ, gerekçe gösterilir", () => {
    vi.mocked(useCashFlowStatement).mockReturnValue(
      queryResult({ data: response({ monthly_cash: [] }) }),
    );
    render(<CashFlowStatementView />);
    expect(within(screen.getByTestId("na-chart")).queryByRole("img")).toBeNull();
    expect(screen.getByTestId("na-chart-empty")).toBeInTheDocument();
  });
});

describe("🔴 K8 — NA:143-159 `3 Aylık Projeksiyon` kartı", () => {
  it("kart SİLİNMEZ: başlığıyla durur ama devre dışıdır", () => {
    render(<CashFlowStatementView />);
    const card = screen.getByTestId("na-projection");
    expect(card).toHaveTextContent("3 Aylık Projeksiyon"); // NA:144
    // `aria-disabled` YOKTUR (`<section>` = `region` rolü onu desteklemez);
    // devre-dışılık SOLUK tonla ve GÖRÜNÜR gerekçeyle taşınır.
    expect(card).toHaveClass("fs-cf-panel--disabled");
  });

  it("gerekçe EKRANDA görünür ve kartın KENDİ anahtarından TÜRER", () => {
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-projection-reason")).toHaveTextContent(
      "Nakit akışı projeksiyonu henüz hesaplanmıyor",
    );
  });

  it("🔴 mockup'ın ÜÇ tahmin satırı UYDURULMAZ", () => {
    render(<CashFlowStatementView />);
    const card = screen.getByTestId("na-projection");
    // NA:147-156'nın serbest metinleri ve sayıları EKRANA GİRMEZ.
    for (const invented of ["Ağustos 2026", "Hakediş + bordro", "+1,2M", "₺3,8M"]) {
      expect(card.textContent ?? "").not.toContain(invented);
    }
  });
});

describe("yükleme / hata / yetki", () => {
  it("veri gelmeden gövde BASILMAZ ve `na-loaded` damgası YOKTUR", () => {
    vi.mocked(useCashFlowStatement).mockReturnValue(queryResult({ isLoading: true }));
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("na-kpis")).toBeNull();
    expect(screen.queryByTestId("na-table")).toBeNull();
    expect(screen.queryByTestId("na-loaded")).toBeNull();
  });

  it("veri gelince `na-loaded` damgası basılır", () => {
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-loaded")).toBeInTheDocument();
    expect(screen.queryByTestId("na-loading")).toBeNull();
  });

  it("hata YUTULMAZ: sunucunun Türkçe metni basılır ve gövde BASILMAZ", () => {
    vi.mocked(useCashFlowStatement).mockReturnValue(
      queryResult({
        isError: true,
        error: new BackendError(500, { detail: "Nakit akışı hesaplanamadı." }),
      }),
    );
    render(<CashFlowStatementView />);
    expect(screen.getByTestId("na-error")).toHaveTextContent("Nakit akışı hesaplanamadı.");
    expect(screen.queryByTestId("na-table")).toBeNull();
    expect(screen.queryByTestId("na-loading")).toBeNull();
  });

  it("görüntüleme yetkisi AÇIKÇA `none` ise erişim reddedilir", () => {
    // 🔴 "Bilinmezlik kuralı": seviye YOKSA ekran AÇIK kalır.
    setSession("none");
    render(<CashFlowStatementView />);
    expect(screen.queryByRole("heading", { name: "Nakit Akış Tablosu" })).toBeNull();
  });

  it("sunucu 403 verirse de erişim reddedilir", () => {
    vi.mocked(useCashFlowStatement).mockReturnValue(
      queryResult({ isError: true, error: new BackendError(403, { detail: "yok" }) }),
    );
    render(<CashFlowStatementView />);
    expect(screen.queryByRole("heading", { name: "Nakit Akış Tablosu" })).toBeNull();
  });
});
