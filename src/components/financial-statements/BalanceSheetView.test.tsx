import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useSession } from "@/components/shell/SessionProvider";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { meFixture, pagesFor } from "@/lib/auth/page-grants.testkit";
import type {
  BalanceSheetResponse,
  BalanceSheetSide,
} from "@/lib/api/hooks/useBalanceSheet";
import { useBalanceSheet } from "@/lib/api/hooks/useBalanceSheet";
import { BackendError } from "@/lib/api/unwrap";

import { BalanceSheetView } from "./BalanceSheetView";

vi.mock("@/lib/api/hooks/useBalanceSheet", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useBalanceSheet")>()),
  useBalanceSheet: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/mali-tablolar/bilanco" }));

/**
 * Fikstür BL:44-88'in RAKAMLARIDIR (yapı da, aritmetik de mockup'la tutar):
 * AKTİF 16.782.220 + 3.860.000 = 20.642.220 · PASİF 3.360.000 + 2.400.000 +
 * 14.882.220 = 20.642.220. İki taraf EŞİT ⇒ `is_balanced` doğrudur.
 */
const ASSETS: BalanceSheetSide = {
  key: "assets",
  title: "AKTİF (Varlıklar)", // BL:46
  total_label: "AKTİF TOPLAM", // BL:60
  total: "20642220.00",
  sections: [
    {
      key: "current_assets",
      title: "I. DÖNEN VARLIKLAR", // BL:50
      subtotal_label: "Dönen Varlıklar Toplamı", // BL:55
      subtotal: "16782220.00",
      lines: [
        { key: "cash", label: "Kasa ve Bankalar", amount: "4249500.00", account_codes: ["100"], group_codes: [] }, // BL:51
        { key: "receivables", label: "Ticari Alacaklar", amount: "8524200.00", account_codes: ["120"], group_codes: [] }, // BL:52
        { key: "stock", label: "Stoklar", amount: "3240000.00", account_codes: ["150"], group_codes: [] }, // BL:53
        { key: "other_current", label: "Diğer Dönen Varlıklar", amount: "768520.00", account_codes: [], group_codes: ["19"] }, // BL:54
      ],
    },
    {
      key: "fixed_assets",
      title: "II. DURAN VARLIKLAR", // BL:56
      subtotal_label: "Duran Varlıklar Toplamı", // BL:59
      subtotal: "3860000.00",
      lines: [
        // 🔴 K4 — BL:57 KONTRA netlemesi SUNUCUDA yapılmıştır: tek ve POZİTİF
        // bir satır. İstemci parantez/kırmızı/eksi İCAT ETMEZ.
        { key: "tangible_net", label: "Maddi Duran Varlıklar (net)", amount: "3620000.00", account_codes: ["252", "257"], group_codes: [] },
        { key: "other_fixed", label: "Diğer Duran Varlıklar", amount: "240000.00", account_codes: [], group_codes: ["26"] }, // BL:58
      ],
    },
  ],
};

const LIABILITIES: BalanceSheetSide = {
  key: "liabilities",
  title: "PASİF (Kaynaklar)", // BL:68
  total_label: "PASİF TOPLAM", // BL:85
  total: "20642220.00",
  sections: [
    {
      key: "short_term",
      title: "I. KISA VADELİ YÜKÜMLÜLÜKLER", // BL:72
      subtotal_label: "Kısa Vadeli Yük. Toplamı", // BL:76
      subtotal: "3360000.00",
      lines: [
        { key: "payables", label: "Ticari Borçlar", amount: "2184000.00", account_codes: ["320"], group_codes: [] }, // BL:73
        { key: "tax_payables", label: "Vergi Borçları", amount: "696000.00", account_codes: ["360"], group_codes: [] }, // BL:74
        { key: "other_short", label: "Diğer Kısa Vadeli Borçlar", amount: "480000.00", account_codes: [], group_codes: ["33"] }, // BL:75
      ],
    },
    {
      key: "long_term",
      title: "II. UZUN VADELİ YÜKÜMLÜLÜKLER", // BL:77
      subtotal_label: "Uzun Vadeli Yük. Toplamı", // BL:79
      subtotal: "2400000.00",
      lines: [
        { key: "long_loans", label: "Uzun Vadeli Krediler", amount: "2400000.00", account_codes: ["400"], group_codes: [] }, // BL:78
      ],
    },
    {
      key: "equity",
      title: "III. ÖZKAYNAKLAR", // BL:80
      subtotal_label: "Özkaynaklar Toplamı", // BL:84
      subtotal: "14882220.00",
      lines: [
        { key: "capital", label: "Sermaye", amount: "8000000.00", account_codes: ["500"], group_codes: [] }, // BL:81
        { key: "retained", label: "Geçmiş Yıllar Kârları", amount: "3369520.00", account_codes: ["570"], group_codes: [] }, // BL:82
        { key: "net_profit", label: "Dönem Net Kârı", amount: "3512700.00", account_codes: [], group_codes: [] }, // BL:83
      ],
    },
  ],
};

function response(partial: Partial<BalanceSheetResponse> = {}): BalanceSheetResponse {
  return {
    as_of: "2026-07-31",
    is_balanced: true,
    assets: ASSETS,
    liabilities: LIABILITIES,
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
  } as unknown as UseQueryResult<BalanceSheetResponse, Error>;
}

function setSession(level: string | undefined) {
  // IZN-F6a · modül düzeyi → sayfa izni (ACCOUNTING_VIEW kümesi); izin hiç yoksa kapı KAPALI (fail-closed).
  const pages = level === undefined ? {} : pagesFor(ACCOUNTING_VIEW, level === "none" ? "none" : level === "view" ? "view" : "edit");
  vi.mocked(useSession).mockReturnValue({ me: meFixture({ pages }) } as unknown as ReturnType<typeof useSession>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  // 📅 YEREL takvim (TB5): `balanceSheetAsOfOptions` `getFullYear()/getMonth()`
  // okur. 20 Temmuz 2026 ⇒ mockup'ın üç seçeneği birebir çıkar.
  vi.setSystemTime(new Date(2026, 6, 20, 9, 0, 0));
  setSession("full");
  vi.mocked(useBalanceSheet).mockReturnValue(queryResult({ data: response() }));
});

describe("Bilanço ekranı — BL başlık şeridi", () => {
  it("geri bağlantısı `← Mali Tablolar` (BL:33) ve başlık (BL:35) basılır", () => {
    render(<BalanceSheetView />);
    expect(screen.getByTestId("bl-back")).toHaveAttribute("href", "/mali-tablolar");
    expect(screen.getByTestId("bl-back")).toHaveTextContent("← Mali Tablolar");
    expect(screen.getByRole("heading", { name: "Bilanço", level: 1 })).toBeInTheDocument();
  });

  it("🔴 BL:37 seçici NOKTA-ZAMANDIR ve mockup'ın ÜÇ gününü sunar", () => {
    render(<BalanceSheetView />);
    const options = within(screen.getByTestId("bl-as-of")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "31 Temmuz 2026",
      "30 Haziran 2026",
      "31 Aralık 2025",
    ]);
  });

  it("🔴 varsayılan gün YEREL takvimdendir ve UÇ'a o gün gider", () => {
    render(<BalanceSheetView />);
    expect(vi.mocked(useBalanceSheet)).toHaveBeenCalledWith("2026-07-31");
  });

  it("başka bir gün seçilince UÇ o günle yeniden çağrılır", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BalanceSheetView />);
    await user.selectOptions(screen.getByTestId("bl-as-of"), "2025-12-31");
    expect(vi.mocked(useBalanceSheet)).toHaveBeenLastCalledWith("2025-12-31");
  });

  it("BL:38 `PDF` devre dışıdır ve gerekçe EKRANDA görünür", () => {
    render(<BalanceSheetView />);
    expect(screen.getByTestId("bl-export-pdf")).toBeDisabled();
    expect(screen.getByTestId("bl-export-reason")).toHaveTextContent(
      "Bilanço dışa aktarma ucu henüz açılmadı",
    );
  });

  /**
   * 🔴 KULLANICI KARARI 2026-08-27 — drill sidebar KALDIRILDI. Konumu global
   * kabuk sidebar'ıyla BİREBİR aynıydı (`position: fixed; left: 0; width:
   * 220px; z-index: 90`) ve onu ÖRTÜYORDU: kullanıcı bu ekranda ana menünün
   * kaybolmasını kusur olarak bildirdi. Ana menü artık üç yolda da yerinde.
   */
  it("🔴 drill sidebar BASILMAZ — ana menü örtülmez (kullanıcı kararı 2026-08-27)", () => {
    const { container } = render(<BalanceSheetView />);
    expect(screen.queryByRole("complementary", { name: "Mali tablolar menüsü" })).toBeNull();
    expect(screen.queryByTestId("fs-nav-parent")).toBeNull();
    // K7 — `aria-current="page"`i artık YALNIZ kabuk sidebar'ı taşır; bu
    // ekranın kendi DOM'u hiç sürmez.
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  /**
   * 🔴 Sidebar gidince `/bilanco ↔ /nakit-akisi` DOĞRUDAN geçişi ölürdü
   * (yaprakta başka çıkış yalnız `← Mali Tablolar`dı). Geçiş segment
   * denetimine taşındı; bu bekçi onun BU ekranda da basıldığını ölçer.
   */
  it("🔴 geçiş segmentleri BU ekranda da basılır ve CURRENT `Bilanço`dur", () => {
    render(<BalanceSheetView />);
    const current = screen.getByTestId("mt-seg-current");
    expect(current).toHaveTextContent("Bilanço");
    expect(current.tagName).not.toBe("A");
    // 🔴 KARŞIT KANIT: yanlış olanlar CURRENT DEĞİL, gerçek bağlantı.
    expect(screen.queryByTestId("mt-seg-bilanco")).toBeNull();
    expect(screen.getByTestId("mt-seg-nakit-akisi")).toHaveAttribute(
      "href",
      "/mali-tablolar/nakit-akisi",
    );
    expect(screen.getByTestId("mt-seg-mali-tablolar")).toHaveAttribute("href", "/mali-tablolar");
  });
});

describe("🔴 K3 denge banner'ı — İKİ dal", () => {
  it("dengedeyken YEŞİL dal: iki tarafın EŞİT toplamı basılır", () => {
    render(<BalanceSheetView />);
    const banner = screen.getByTestId("bl-banner");
    expect(banner).toHaveTextContent(
      "Bilanço Dengede — AKTİF TOPLAM = PASİF TOPLAM: ₺ 20.642.220",
    );
    expect(banner).toHaveClass("fs-banner--ok");
  });

  it("🔴 dengesizken KIRMIZI dal: fark hesaplanıp basılır", () => {
    vi.mocked(useBalanceSheet).mockReturnValue(
      queryResult({
        data: response({
          is_balanced: false,
          liabilities: { ...LIABILITIES, total: "20502220.00" },
        }),
      }),
    );
    render(<BalanceSheetView />);
    const banner = screen.getByTestId("bl-banner");
    expect(banner).toHaveTextContent("Bilanço Dengede Değil");
    expect(banner).toHaveTextContent("fark: ₺ 140.000");
    expect(banner).toHaveClass("fs-banner--off");
    // 🔴 `≠` (U+2260) YASAK — kapsanmayan glif tarayıcıyı sistem yedeğine
    // düşürür (F-SEM dersi). Anlam "eşit değil" sözcükleriyle taşınır.
    expect(banner.textContent ?? "").not.toContain("≠");
    expect(banner).toHaveTextContent("eşit değil");
  });

  it("🔴 DENGE KARARI SUNUCUNUNDUR — istemci toplamları YENİDEN karşılaştırmaz", () => {
    // İki taraf toplamı EŞİT ama sunucu `is_balanced: false` diyor: ekran
    // SUNUCUYU izler. İstemci kendi karşılaştırmasını koşsaydı YEŞİL basardı.
    vi.mocked(useBalanceSheet).mockReturnValue(
      queryResult({ data: response({ is_balanced: false }) }),
    );
    render(<BalanceSheetView />);
    expect(screen.getByTestId("bl-banner")).toHaveClass("fs-banner--off");
    // Fark sıfır olduğu için cümle "₺ 0" der — sayı UYDURULMAZ.
    expect(screen.getByTestId("bl-banner")).toHaveTextContent("fark: ₺ 0");
  });

  it("veri gelmeden banner HİÇ basılmaz (denge bilinmiyorken iddia edilmez)", () => {
    vi.mocked(useBalanceSheet).mockReturnValue(queryResult({ isLoading: true }));
    render(<BalanceSheetView />);
    expect(screen.queryByTestId("bl-banner")).toBeNull();
    expect(screen.getByTestId("bl-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("bl-loaded")).toBeNull();
  });
});

describe("BL:42-88 iki taraf kartı", () => {
  it("başlıklar ve toplam etiketleri SUNUCUDAN gelir, sabitlenmiş DEĞİLDİR", () => {
    vi.mocked(useBalanceSheet).mockReturnValue(
      queryResult({
        data: response({ assets: { ...ASSETS, title: "AKTİF (Sunucudan)" } }),
      }),
    );
    render(<BalanceSheetView />);
    expect(screen.getByTestId("bl-assets")).toHaveAccessibleName("AKTİF (Sunucudan)");
  });

  it("AKTİF kartı bölüm bandı → kalem → ara toplam → genel toplam basar", () => {
    render(<BalanceSheetView />);
    expect(screen.getByTestId("bl-assets-current_assets-band")).toHaveTextContent(
      "I. DÖNEN VARLIKLAR",
    );
    expect(screen.getByTestId("bl-assets-current_assets-cash")).toHaveTextContent(
      "Kasa ve Bankalar",
    );
    // BL:51 — `₺` YOK, binlik noktalı, ondalıksız.
    expect(screen.getByTestId("bl-assets-current_assets-cash")).toHaveTextContent("4.249.500");
    expect(screen.getByTestId("bl-assets-current_assets-cash")).not.toHaveTextContent("₺");
    expect(screen.getByTestId("bl-assets-current_assets-subtotal")).toHaveTextContent(
      "Dönen Varlıklar Toplamı",
    );
    expect(screen.getByTestId("bl-assets-current_assets-subtotal")).toHaveTextContent(
      "16.782.220",
    );
    // BL:60
    expect(screen.getByTestId("bl-assets-total")).toHaveTextContent("AKTİF TOPLAM");
    expect(screen.getByTestId("bl-assets-total")).toHaveTextContent("20.642.220");
  });

  it("PASİF kartı ÜÇ bölüm taşır ve YEŞİL tondadır (BL:66-88)", () => {
    render(<BalanceSheetView />);
    expect(screen.getByTestId("bl-liabilities")).toHaveClass("fs-side--liabilities");
    for (const key of ["short_term", "long_term", "equity"]) {
      expect(screen.getByTestId(`bl-liabilities-${key}-band`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("bl-liabilities-total")).toHaveTextContent("PASİF TOPLAM");
    expect(screen.getByTestId("bl-liabilities-total")).toHaveTextContent("20.642.220");
  });

  it("🔴 K4 — kontra netlemesi TEK ve POZİTİF bir satırdır (BL:57)", () => {
    render(<BalanceSheetView />);
    const row = screen.getByTestId("bl-assets-fixed_assets-tangible_net");
    expect(row).toHaveTextContent("Maddi Duran Varlıklar (net)");
    expect(row).toHaveTextContent("3.620.000");
    // Parantez / eksi işareti / ayrı bir renk sınıfı İCAT EDİLMEZ.
    expect(row.textContent ?? "").not.toContain("(3.620.000)");
    expect(row.textContent ?? "").not.toContain("-3.620.000");
  });

  it("🔴 NEGATİF kalem OLDUĞU GİBİ basılır (geçmiş yıl zararı gerçek bir sonuçtur)", () => {
    vi.mocked(useBalanceSheet).mockReturnValue(
      queryResult({
        data: response({
          liabilities: {
            ...LIABILITIES,
            sections: LIABILITIES.sections.map((section) =>
              section.key !== "equity"
                ? section
                : {
                    ...section,
                    lines: section.lines.map((line) =>
                      line.key === "retained" ? { ...line, amount: "-1250000.00" } : line,
                    ),
                  },
            ),
          },
        }),
      }),
    );
    render(<BalanceSheetView />);
    // İşaret GİZLENMEZ, `0`a da KIRPILMAZ.
    expect(screen.getByTestId("bl-liabilities-equity-retained")).toHaveTextContent("-1.250.000");
  });
});

describe("hata / yetki", () => {
  it("hata YUTULMAZ: sunucunun Türkçe metni ekrana basılır ve kartlar BASILMAZ", () => {
    vi.mocked(useBalanceSheet).mockReturnValue(
      queryResult({
        isError: true,
        error: new BackendError(500, { detail: "Bilanço hesaplanamadı." }),
      }),
    );
    render(<BalanceSheetView />);
    expect(screen.getByTestId("bl-error")).toHaveTextContent("Bilanço hesaplanamadı.");
    expect(screen.queryByTestId("bl-assets")).toBeNull();
    expect(screen.queryByTestId("bl-banner")).toBeNull();
  });

  it("görüntüleme yetkisi AÇIKÇA `none` ise erişim reddedilir", () => {
    // 🔴 "Bilinmezlik kuralı": seviye YOKSA ekran AÇIK kalır; yalnız açıkça
    // `none` olduğunda kapanır.
    setSession("none");
    render(<BalanceSheetView />);
    expect(screen.queryByRole("heading", { name: "Bilanço" })).toBeNull();
  });

  it("sunucu 403 verirse de erişim reddedilir", () => {
    vi.mocked(useBalanceSheet).mockReturnValue(
      queryResult({ isError: true, error: new BackendError(403, { detail: "yok" }) }),
    );
    render(<BalanceSheetView />);
    expect(screen.queryByRole("heading", { name: "Bilanço" })).toBeNull();
  });
});
