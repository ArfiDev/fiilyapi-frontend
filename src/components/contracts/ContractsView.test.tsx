import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { ContractsView } from "./ContractsView";
import { useContracts } from "@/lib/api/hooks/useContracts";
import type { ContractListItem, ContractListResponse } from "@/lib/api/hooks/useContracts";

vi.mock("@/lib/api/hooks/useContracts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useContracts")>()),
  useContracts: vi.fn(),
}));

// Sekme durumu URL'dedir; testler `?type=` parametresini bu değişkenle sürer.
let searchParams = new URLSearchParams();
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => "/sozlesmeler",
  useSearchParams: () => searchParams,
}));

// M5_3 #400 — "+ Yeni Sözleşme" izin kapısı testi (ContractDistributionView.test.tsx deseni).
let permissionLevel: string | undefined = "full";
vi.mock("@/lib/auth/useModulePermission", () => ({
  useModulePermission: () => ({
    level: permissionLevel,
    canView: true,
    canWrite: permissionLevel !== "read",
    canDelete: permissionLevel === "full",
  }),
}));
// IZN-F6a · kapılar yalnız sayfa izninden karar verir: `permissionLevel` (modül niyeti) oturum sayfa iznine çevrilir
// ("read" = tüm sözleşme sayfaları Görür; aksi = tam erişim). Modül mock'u kapı DIŞI mantık için kalır.
vi.mock("@/components/shell/SessionProvider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/shell/SessionProvider")>();
  const { meFixture, pagesFor } = await import("@/lib/auth/page-grants.testkit");
  const { CONTRACTS_VIEW } = await import("@/lib/auth/page-gates");
  return {
    ...actual,
    useSession: () => ({
      ...actual.SESSION_CONTEXT_DEFAULT,
      me: permissionLevel === "read" ? meFixture({ pages: pagesFor(CONTRACTS_VIEW, "view") }) : meFixture(),
      isLoading: false,
    }),
  };
});

const EMPLOYER_ROW: ContractListItem = {
  id: "p-1",
  title: "Güneşkent Konut A-Blok",
  contract_no: "SZL-2025-001",
  counterparty_name: "Güneşkent Gayrimenkul A.Ş.",
  amount: "11200000.00",
  start_date: "2025-04-01",
  end_date: "2026-12-31",
  progress_pct: "75.00",
  status: "active",
  is_draft: false,
  project_id: "p-1",
};

const SUBCONTRACTOR_ROW: ContractListItem = {
  ...EMPLOYER_ROW,
  id: "sc-1",
  title: "Yılmaz İnşaat — Kaba Yapı",
  contract_no: "TSZ-2025-004",
  counterparty_name: "Yılmaz İnşaat Ltd.",
  // Taşeron sekmesinde backend BİLEREK `None` döner (spec §2).
  progress_pct: null,
};

function mockContracts(data?: ContractListResponse, extra: Record<string, unknown> = {}) {
  vi.mocked(useContracts).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    error: null,
    ...extra,
  } as never);
}

function employerResponse(): ContractListResponse {
  return {
    summary: {
      total_amount: "56200000.00",
      active_count: 4,
      progress_payment_total: "42400000.00",
      expiring_this_month_count: 1,
    },
    items: [EMPLOYER_ROW],
  };
}

function subcontractorResponse(): ContractListResponse {
  return {
    summary: {
      total_amount: "9400000.00",
      active_count: 2,
      progress_payment_total: null,
      expiring_this_month_count: 0,
    },
    items: [SUBCONTRACTOR_ROW],
  };
}

describe("ContractsView · SZL sekmeli liste", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    permissionLevel = "full";
  });

  describe("KPI şeridi (mockup 34-38)", () => {
    it("dört kartı mockup sırası ve etiketleriyle basar", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      const strip = screen.getByTestId("szl-kpi-strip");
      const labels = within(strip)
        .getAllByText(/Toplam Bedel|Aktif|Toplam Hakediş|Bu Ay Dolacak/)
        .map((node) => node.textContent);
      expect(labels).toEqual(["Toplam Bedel", "Aktif", "Toplam Hakediş", "Bu Ay Dolacak"]);
    });

    it("değerleri `ContractSummary`den basar (₺ 56,2M · 4 Sözleşme · ₺ 42,4M · 1 Sözleşme)", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      const strip = screen.getByTestId("szl-kpi-strip");
      expect(within(strip).getByText("₺ 56,2M")).toBeInTheDocument();
      expect(within(strip).getByText("4 Sözleşme")).toBeInTheDocument();
      expect(within(strip).getByText("₺ 42,4M")).toBeInTheDocument();
      expect(within(strip).getByText("1 Sözleşme")).toBeInTheDocument();
    });

    it("başlık alt satırı aktif sözleşme sayısını taşır (mockup 24)", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);
      expect(screen.getByText("Tüm projeler · 4 aktif sözleşme")).toBeInTheDocument();
    });

    // 🔴 F-SZLPCT: bu SAVUNMACI daldır, backend davranışı DEĞİL. TH-SUM
    // (`cb9e26e`) `progress_payment_total`ı bağladı ve backend yorumu
    // *"`None` bir daha DÖNMEZ"* diyor; alan yalnız ŞEMA UYUMLULUĞU için
    // `Decimal | None` kaldı.
    //
    // 🔴 F-KAPSAM (2026-09-19) — İDDİA DÜZELTİLDİ. Yukarıdaki ölçüm bu turda
    // DOĞRULANDI (`contracts/service.py:264` ve `:289` iki dalda da `0.00`
    // üretir) ve SONUCU değişti: sunucu `None` üretemiyorsa, yanıttaki `null`un
    // TEK kaynağı kapsam maskesidir (`Gorunurluk.para`). O hâlde "bu görünüme
    // gelmedi" cümlesi basıldığı HER seferde yalandır — kart artık gerekçesiz
    // "—" basar. Dalın kendi bekçisi `ContractsSummaryStrip.masked.test.tsx`.
    it("`progress_payment_total` null gelirse kart silinmez, gerekçesiz '—' basar", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts(subcontractorResponse());
      render(<ContractsView />);

      const card = screen.getByTestId("szl-kpi-payment-total");
      expect(card).toHaveTextContent("—");
      expect(card).not.toHaveAttribute("title");
      expect(screen.getByText("Toplam Hakediş")).toBeInTheDocument();
    });
  });

  describe("sekmeler (mockup 26-29) — URL durumu", () => {
    it("parametresiz URL'de İşveren sekmesi aktiftir ve uca `employer` gider", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      expect(screen.getByRole("link", { name: "İşveren" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(screen.getByRole("link", { name: "Taşeron" })).not.toHaveAttribute("aria-current");
      expect(vi.mocked(useContracts)).toHaveBeenCalledWith({ type: "employer" });
    });

    it("`?type=subcontractor` ile Taşeron sekmesi aktiftir ve uca `subcontractor` gider", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts(subcontractorResponse());
      render(<ContractsView />);

      expect(screen.getByRole("link", { name: "Taşeron" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(vi.mocked(useContracts)).toHaveBeenCalledWith({ type: "subcontractor" });
    });

    it("sekmeler gerçek link'tir — hedefleri paylaşılabilir URL'lerdir", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      expect(screen.getByRole("link", { name: "İşveren" })).toHaveAttribute(
        "href",
        "/sozlesmeler",
      );
      expect(screen.getByRole("link", { name: "Taşeron" })).toHaveAttribute(
        "href",
        "/sozlesmeler?type=subcontractor",
      );
    });
  });

  describe("+ Yeni Sözleşme (ONAYLI KARAR S2)", () => {
    it("işveren sekmesinde DEVRE DIŞI basılır ve gerekçesi görünür", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      const button = screen.getByTestId("szl-new-contract-disabled");
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent("+ Yeni Sözleşme");
      expect(button).toHaveAttribute("title", "İşveren sözleşmesi proje formunda kurulur.");
      // Gerekçe yalnız `title`da saklı kalmaz — ekranda da yazar.
      expect(
        screen.getByText("İşveren sözleşmesi proje formunda kurulur."),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "+ Yeni Sözleşme" })).not.toBeInTheDocument();
    });

    it("taşeron sekmesinde FSO formuna giden link olur", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts(subcontractorResponse());
      render(<ContractsView />);

      expect(screen.getByRole("link", { name: "+ Yeni Sözleşme" })).toHaveAttribute(
        "href",
        "/sozlesmeler/taseron/yeni",
      );
      expect(screen.queryByTestId("szl-new-contract-disabled")).not.toBeInTheDocument();
    });

    /**
     * M5_3 #400 — eskiden taşeron sekmesindeki link HİÇBİR izin kontrolüyle
     * sarılmadan render ediliyordu; kapı yalnız hedef formdaydı. Backend
     * yazmayı reddeder ama liste ekranında tıklanabilir bir buton yanlış
     * bir yetki izlenimi verirdi.
     */
    it("taşeron sekmesinde yazma yetkisi yoksa LINK DEĞİL, gerekçeli devre-dışı buton basılır", () => {
      permissionLevel = "read";
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts(subcontractorResponse());
      render(<ContractsView />);

      expect(screen.queryByRole("link", { name: "+ Yeni Sözleşme" })).not.toBeInTheDocument();
      const button = screen.getByTestId("szl-new-contract-disabled");
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute("title", "Bu modülde yazma yetkiniz yok.");
    });
  });

  describe("Taşeron Firmaları → girişi (spec §1)", () => {
    it("YALNIZ taşeron sekmesinde görünür ve TL rotasına gider", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts(subcontractorResponse());
      render(<ContractsView />);

      expect(screen.getByRole("link", { name: "Taşeron Firmaları →" })).toHaveAttribute(
        "href",
        "/sozlesmeler/taseronlar",
      );
    });

    it("işveren sekmesinde HİÇ basılmaz", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);
      expect(screen.queryByRole("link", { name: "Taşeron Firmaları →" })).not.toBeInTheDocument();
    });
  });

  describe("tablo (mockup 41-106)", () => {
    it("kolon başlıklarını mockup sırasıyla basar", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
      expect(headers).toEqual([
        "Sözleşme",
        "İşveren",
        "Bedel",
        "Başlangıç",
        "Bitiş",
        "İlerleme",
        "Durum",
        "",
      ]);
    });

    it("taşeron sekmesinde ikinci kolon başlığı 'Taşeron' olur", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts(subcontractorResponse());
      render(<ContractsView />);

      const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
      expect(headers[1]).toBe("Taşeron");
    });

    it("işveren satırını mockup biçimleriyle basar (bedel, tarihler, yüzde, durum)", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      const row = screen.getByRole("row", { name: "Güneşkent Konut A-Blok" });
      expect(within(row).getByText("SZL-2025-001")).toBeInTheDocument();
      expect(within(row).getByText("Güneşkent Gayrimenkul A.Ş.")).toBeInTheDocument();
      expect(within(row).getByText("₺ 11,2M")).toBeInTheDocument();
      expect(within(row).getByText("01.04.2025")).toBeInTheDocument();
      expect(within(row).getByText("31.12.2026")).toBeInTheDocument();
      expect(within(row).getByText("%75")).toBeInTheDocument();
      expect(within(row).getByText("Aktif")).toBeInTheDocument();
    });

    it("işveren satırının detay hedefi PROJE kimliğidir", () => {
      mockContracts(employerResponse());
      render(<ContractsView />);

      expect(screen.getByRole("link", { name: "Detay →" })).toHaveAttribute(
        "href",
        "/sozlesmeler/isveren/p-1",
      );
    });

    it("taşeron satırının detay hedefi SÖZLEŞME kimliğidir", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts(subcontractorResponse());
      render(<ContractsView />);

      expect(screen.getByRole("link", { name: "Detay →" })).toHaveAttribute(
        "href",
        "/sozlesmeler/taseron/sc-1",
      );
    });

    // 🔴 F-SZLPCT: `progress_pct` P-YT4'te (`c0d3ac8`) taşeron satırında da
    // BAĞLANDI. `null` artık "taşeron sekmesi" demek değil, "sözleşme bedeli
    // yok/`<= 0`" demektir (`progress_pct` sıfır paydada bölme yapmaz) — dal
    // İKİ sekmede de yaşar, çünkü işveren sözleşmesi de bedelsiz olabilir.
    // 🔴 F-KAPSAM (2026-09-19) — FİKSTÜR DÜZELTİLDİ, KURAL DARALDI.
    //
    // Bu test eskiden `SUBCONTRACTOR_ROW`u olduğu gibi kullanıyordu ve satırın
    // `amount`una BAKMADAN gerekçenin basıldığını çakıyordu. `progress_pct`
    // artık `Gorunurluk.operasyonel` etiketli olduğu için `finance` kapsamlı
    // rolde de `null` gelir — o hâlde "bedel girilmemiş" cümlesi YALANDIR ve
    // hücre onu basmaz (`contract-progress.ts::isProvenZeroAmount`).
    //
    // Testin ÖLÇMEK İSTEDİĞİ şey ("bedelsiz sözleşme") artık fikstürde AÇIKÇA
    // kurulur: bedel GÖRÜNÜR ve sıfırdır. Maskeli hâlin kendi bekçisi
    // `ContractsTable.masked.test.tsx`tedir.
    it("bedel GÖRÜNÜR ve 0 iken `progress_pct` null → çubuk yerine '—' + gerekçe", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts({
        ...subcontractorResponse(),
        items: [{ ...SUBCONTRACTOR_ROW, amount: "0.00", progress_pct: null }],
      });
      render(<ContractsView />);

      const cell = screen.getByTestId("szl-progress-pending");
      expect(cell).toHaveTextContent("—");
      expect(cell).toHaveAttribute(
        "title",
        "Sözleşme bedeli girilmemiş — ilerleme oranı hesaplanamaz",
      );
      expect(screen.queryByTestId("szl-progress")).not.toBeInTheDocument();
    });

    // 🔴 YENİ (F-SZLPCT) — POZİTİF KONTROL: yukarıdaki test tek başına
    // "hücre HER ZAMAN '—' basıyor" kusurunu da geçirirdi. Taşeron satırı
    // GERÇEK bir yüzdeyle geldiğinde çubuğun ÇİZİLDİĞİ ayrıca çakılır.
    it("taşeron satırı gerçek `progress_pct` ile gelirse çubuk ÇİZİLİR", () => {
      searchParams = new URLSearchParams("type=subcontractor");
      mockContracts({
        ...subcontractorResponse(),
        summary: { ...subcontractorResponse().summary, progress_payment_total: "110800.00" },
        items: [{ ...SUBCONTRACTOR_ROW, progress_pct: "29.83" }],
      });
      render(<ContractsView />);

      expect(screen.getByTestId("szl-progress")).toBeInTheDocument();
      expect(screen.queryByTestId("szl-progress-pending")).not.toBeInTheDocument();
      expect(screen.getByTestId("szl-kpi-payment-total")).not.toHaveTextContent("—");
    });

    it("boş listede tablo yerine boş durum basar", () => {
      mockContracts({ ...employerResponse(), items: [] });
      render(<ContractsView />);
      expect(screen.getByText("Henüz işveren sözleşmesi yok")).toBeInTheDocument();
    });

    it("yükleme ve hata durumlarını ayırır", () => {
      mockContracts(undefined, { isLoading: true });
      const { unmount } = render(<ContractsView />);
      expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
      unmount();

      mockContracts(undefined, { isError: true });
      render(<ContractsView />);
      expect(screen.getByText("Sözleşmeler yüklenemedi")).toBeInTheDocument();
    });
  });
});
