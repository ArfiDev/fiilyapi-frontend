import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import SiteHakedislerPage from "./page";
import { useProgressPayments, useProgressPaymentSummary } from "@/lib/api/hooks/useProgressPayments";
import { useSite } from "@/lib/api/hooks/useSites";
import {
  useSiteSubcontractorPayments,
  type UseSiteSubcontractorPaymentsResult,
} from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";
import type { SiteDetail } from "@/lib/api/hooks/useSites";
import { ALL_PAGE_KEYS, fullAccessPages, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useProgressPayments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useProgressPayments")>()),
  useProgressPayments: vi.fn(),
  useProgressPaymentSummary: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSites")>()),
  useSite: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSiteSubcontractorPayments", () => ({
  useSiteSubcontractorPayments: vi.fn(),
}));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const SITE_ID = "44444444-4444-4444-4444-444444444444";

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: PROJECT_ID, siteId: SITE_ID }),
  usePathname: () => `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/hakedisler`,
}));

const SITE = {
  id: SITE_ID,
  name: "A-Blok Şantiyesi",
  project: { id: PROJECT_ID, name: "Güneşkent Konut" },
} as unknown as SiteDetail;

const PAYMENT_ITEM = {
  id: "22222222-2222-2222-2222-222222222222",
  project_id: PROJECT_ID,
  project_name: "Güneşkent Konut",
  sequence_no: 5,
  period_year: 2026,
  period_month: 7,
  description: "Kat 6–8 döşeme",
  status: "pending_approval" as const,
  gross_total: "2100000.00",
  net_total: "2000000.00",
};

/** IZN-F6a · eski modül düzeyi → sayfa izni: draft/full = tam erişim, view = her sayfada Görür, none = her sayfada Yok. */
function mockPermission(level?: string) {
  const base = { id: "u1", email: "a@b.c", full_name: "A", role_key: "admin", status: "active" };
  vi.mocked(useSession).mockReturnValue({
    me: (level === undefined ? base : { ...base, pages: level === "view" ? pagesFor(ALL_PAGE_KEYS, "view") : level === "none" ? pagesFor(ALL_PAGE_KEYS, "none") : fullAccessPages() }) as unknown as MeResponse,
    isLoading: false,
  });
}

function mockSite(value: Partial<ReturnType<typeof useSite>>) {
  vi.mocked(useSite).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

function mockPayments(value: Partial<ReturnType<typeof useProgressPayments>>) {
  vi.mocked(useProgressPayments).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    ...value,
  } as never);
}

// Varsayılan: özet sorgusu HENÜZ BAŞARILI DEĞİL (isSuccess: false) — round 2
// testleri özeti başarıyla döndüren senaryoyu açıkça override eder.
function mockSummary(value: Partial<ReturnType<typeof useProgressPaymentSummary>>) {
  vi.mocked(useProgressPaymentSummary).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    isSuccess: false,
    error: null,
    ...value,
  } as never);
}

// F-TH T5: taşeron tarafı gerçek veriyle dolduruldu — varsayılan mock BOŞ
// liste döner (`isPartial`/`isError` olmayan "hazır" durum), aksi belirtilen
// testler kendi senaryosunu açıkça override eder.
function mockSubcontractor(value: Partial<UseSiteSubcontractorPaymentsResult>) {
  vi.mocked(useSiteSubcontractorPayments).mockReturnValue({
    items: [],
    // HAK-NULL: varsayilan BOS — proje geneli kumesini olcen testler kendi
    // senaryosunda acikca override eder.
    projectWideItems: [],
    isLoading: false,
    isError: false,
    isPartial: false,
    truncation: { isTruncated: false, shownCount: 0, totalCount: 0 },
    ...value,
  });
}

// P7 T6: [...slug] catch-all bu segment için devre dışı kalır; sayfa
// ComingSoon YERİNE gerçek şantiye hakediş görünümünü basar.
describe("SiteHakedislerPage rotasi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermission("draft");
    mockSite({ data: SITE });
    mockSummary({ isSuccess: false });
    mockSubcontractor({});
  });

  it("ComingSoon DEGIL gercek gorunumu basar", () => {
    mockPayments({ data: { items: [] } });
    render(<SiteHakedislerPage />);
    expect(screen.getByRole("heading", { name: "A-Blok Şantiyesi — Hakedişler" })).toBeInTheDocument();
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
  });

  it("proje-düzeyi listeyi çeker — site_id filtresi VERİLMEZ (S4 kararı)", () => {
    mockPayments({ data: { items: [] } });
    render(<SiteHakedislerPage />);
    expect(useProgressPayments).toHaveBeenCalledWith({ project_id: PROJECT_ID });
  });

  it("KPI alt metni için proje özetini rota parametresindeki project_id ile çeker (round 2)", () => {
    mockPayments({ data: { items: [] } });
    render(<SiteHakedislerPage />);
    expect(useProgressPaymentSummary).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("yukleniyor durumunu basar", () => {
    mockPayments({ isLoading: true });
    render(<SiteHakedislerPage />);
    expect(screen.getByText("Yükleniyor…")).toBeInTheDocument();
  });

  it("hata durumunda mesaj basar", () => {
    mockPayments({ isError: true, error: new Error("patladi") });
    render(<SiteHakedislerPage />);
    expect(screen.getByText("Hakedişler yüklenemedi")).toBeInTheDocument();
  });

  it("bos listede bos durum metni basar", () => {
    mockPayments({ data: { items: [] } });
    render(<SiteHakedislerPage />);
    expect(screen.getByText("Henüz hakediş oluşturulmadı")).toBeInTheDocument();
  });

  it("hakediş listesi 403 doner ise AccessDenied basar", () => {
    mockPayments({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    render(<SiteHakedislerPage />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Hakedişler/ })).not.toBeInTheDocument();
  });

  it("şantiye sorgusu 403 doner ise AccessDenied basar", () => {
    mockPayments({ data: { items: [] } });
    mockSite({ isError: true, error: new BackendError(403, { detail: "yasak" }) });
    render(<SiteHakedislerPage />);
    expect(screen.getByText("Bu alana yetkiniz yok")).toBeInTheDocument();
  });

  it("satiri basar ve detay linki /hakedisler/{id} adresine gider", () => {
    mockPayments({ data: { items: [PAYMENT_ITEM] } });
    render(<SiteHakedislerPage />);
    const link = screen.getByRole("link", { name: /Güneşkent Konut/ });
    expect(link).toHaveAttribute("href", `/hakedisler/${PAYMENT_ITEM.id}`);
  });

  it("breadcrumb şantiyeye geri link verir ve proje/şantiye adını gösterir", () => {
    mockPayments({ data: { items: [] } });
    render(<SiteHakedislerPage />);
    const back = screen.getByRole("link", { name: "← A-Blok Şantiyesi" });
    expect(back).toHaveAttribute("href", `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}`);
    expect(screen.getByText(/Güneşkent Konut \/ A-Blok Şantiyesi/)).toBeInTheDocument();
  });

  it("yazma yetkisi varken '+ Hakediş Oluştur' butonu proje sorgu parametresiyle gorunur", () => {
    mockPermission("draft");
    mockPayments({ data: { items: [] } });
    render(<SiteHakedislerPage />);
    expect(screen.getByRole("link", { name: "+ Hakediş Oluştur" })).toHaveAttribute(
      "href",
      `/hakedisler/yeni?project=${PROJECT_ID}`,
    );
  });

  it("salt-okunur yetkide '+ Hakediş Oluştur' butonu gorunmez", () => {
    mockPermission("view");
    mockPayments({ data: { items: [] } });
    render(<SiteHakedislerPage />);
    expect(screen.queryByRole("link", { name: "+ Hakediş Oluştur" })).not.toBeInTheDocument();
  });

  // Brief §pending-modules ile BOŞ kalanlar — bu dilimde veri kaynağı YOK,
  // ara çözüm/sahte veri yasak; negatif testler sessizce eklenmediklerini korur.
  // F-TH T5: taşeron sütunu artık GERÇEK veriyle basılır (aşağıdaki ayrı
  // testler) — bu test yalnız işveren tarafında YOK olan alanları kapsar
  // ("%62 ilerleme", PDF) + taşeron paneli varsayılan (boş) durumdayken bir
  // satır adının basılmadığını doğrular.
  it("işveren satırında '%62 ilerleme' ve PDF butonu BASILMAZ; taşeron paneli boşken satır basılmaz", () => {
    mockPayments({ data: { items: [PAYMENT_ITEM] } });
    render(<SiteHakedislerPage />);
    expect(screen.queryByText("Akın İnşaat #47")).not.toBeInTheDocument();
    // "%62 ilerleme" satır-içi metni YOK — "Brüt Kar Marjı" KPI kartının
    // GERÇEK yüzdesiyle (ör. "%100") KARIŞTIRILMAZ, o yüzden satır tanımı
    // (`pp-row__desc`) içinde aranır, sayfa genelinde DEĞİL.
    expect(screen.queryByText("Kat 6–8 döşeme · %62 ilerleme")).not.toBeInTheDocument();
    expect(screen.queryByText(/ilerleme/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PDF/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/PDF/)).not.toBeInTheDocument();
  });

  it("KPI şeridi basılır: taşeron toplamı boş listede ₺0, kâr marjı %100 (taşeron ödemesi yok)", () => {
    mockPayments({ data: { items: [PAYMENT_ITEM] } });
    render(<SiteHakedislerPage />);
    const strip = screen.getByTestId("pp-totals-strip");
    expect(strip).toBeInTheDocument();
    expect(screen.getByText("Onay Bekleyen").nextSibling).toHaveTextContent("1");
    expect(screen.getByText("Toplam Taşeron Ödemesi").nextSibling).toHaveTextContent("₺ 0");
    expect(screen.getByText("Brüt Kar Marjı").nextSibling).toHaveTextContent("%100");
  });

  // F-TH T5 — sağ sütun: gerçek taşeron hakedişi satırları.
  describe("Taşeron Hakedişleri paneli (F-TH T5)", () => {
    const SUBCONTRACTOR_ITEM = {
      id: "scpp-1",
      contractId: "sc-1",
      subcontractorName: "Akın İnşaat",
      sequenceNo: 47,
      periodYear: 2026,
      periodMonth: 7,
      workCategory: "Betonarme İşleri",
      sectionId: null,
    contractSiteId: "s-1",
      grossTotal: "1240000.00",
      netTotal: "1016800.00",
      status: "pending_approval" as const,
      isRevisionRequired: false,
    };

    it("satırı basar, /hakedisler/taseron/[id]'ye gider ve 'Tümü →' /hakedisler/taseron'a gider", () => {
      mockPayments({ data: { items: [PAYMENT_ITEM] } });
      mockSubcontractor({ items: [SUBCONTRACTOR_ITEM] });
      render(<SiteHakedislerPage />);
      expect(screen.getByText("Akın İnşaat #47")).toBeInTheDocument();
      const link = screen.getByRole("link", { name: /Akın İnşaat — Hakediş #47/ });
      expect(link).toHaveAttribute("href", "/hakedisler/taseron/scpp-1");
      const links = screen.getAllByRole("link", { name: "Tümü →" });
      expect(links.some((el) => el.getAttribute("href") === "/hakedisler/taseron")).toBe(true);
    });

    // Final inceleme F-3 — 210 hakedişli projede tavan (200) aşılır: eksik
    // listeden hesaplanan "Brüt Kar Marjı"/"Toplam Taşeron Ödemesi" YANLIŞ
    // olurdu (ör. %48 basılıp gerçeğin %31 olması). Sayı BASILMAZ, sınır
    // göstergesi GÖRÜNÜR olur. TB2 takip: N+1 sözleşme-detay fan-out'u
    // kaldırıldı — `isPartial` artık YALNIZ sunucu tavanından (`truncation`)
    // gelir, ayrı bir "kısmi sözleşme hatası" kanalı YOK (dead branch temizlendi).
    it("liste sunucu tavanında kırpıldıysa (total > limit) para değerleri basılmaz, sınır göstergesi görünür", () => {
      mockPayments({ data: { items: [PAYMENT_ITEM] } });
      mockSubcontractor({
        items: [SUBCONTRACTOR_ITEM],
        isPartial: true,
        truncation: { isTruncated: true, shownCount: 200, totalCount: 210 },
      });
      render(<SiteHakedislerPage />);
      const band = screen.getByTestId("spp-subcontractor-band");
      expect(band).toHaveTextContent("İlk 200 kayıt gösteriliyor (toplam 210)");
      expect(band).toHaveTextContent("Taşeron toplamı ve kâr marjı bu yüzden gösterilmiyor.");
      const taseronValue = screen.getByText("Toplam Taşeron Ödemesi").nextSibling as HTMLElement;
      const margeValue = screen.getByText("Brüt Kar Marjı").nextSibling as HTMLElement;
      expect(taseronValue.textContent).not.toMatch(/\d/);
      expect(margeValue.textContent).not.toMatch(/\d/);
    });

    it("boş durumda Türkçe boş-durum metni basar", () => {
      mockPayments({ data: { items: [] } });
      mockSubcontractor({ items: [] });
      render(<SiteHakedislerPage />);
      expect(screen.getByText("Bu şantiyede taşeron hakedişi yok")).toBeInTheDocument();
    });
  });

  it("hakediş listesi henüz yüklenmemişken (yükleniyor/hata) KPI şeridi basılmaz", () => {
    mockPayments({ isLoading: true });
    render(<SiteHakedislerPage />);
    expect(screen.queryByTestId("pp-totals-strip")).not.toBeInTheDocument();
  });

  // Round 2 (coordinator review): mockup satır 82 "4 hakediş · %75" alt
  // metni — bu ekranda proje bağlamı bilindiğinden `useProgressPaymentSummary`
  // ile TAM (sayı + yüzde) basılır.
  describe("KPI alt metni — özet sorgusu (round 2)", () => {
    it("özet başarılı ve progress_pct doluyken sayı VE yüzde birlikte basılır", () => {
      mockPayments({ data: { items: [PAYMENT_ITEM] } });
      mockSummary({
        isSuccess: true,
        data: {
          contract_amount: "10000000.00",
          cumulative_gross: "8400000.00",
          progress_pct: "75.00",
          advance_deduction_total: "0.00",
          retention_total: "0.00",
          net_total: "8400000.00",
          payment_count: 4,
          pending_count: 1,
          remaining: "1600000.00",
        },
      });
      render(<SiteHakedislerPage />);
      expect(screen.getByTestId("pp-kpi-subtitle")).toHaveTextContent("4 hakediş · %75");
    });

    it("progress_pct null iken (sözleşme bedeli eksik) yalnız sayı basılır, yüzde düşer — sayfa kırılmaz", () => {
      mockPayments({ data: { items: [PAYMENT_ITEM] } });
      mockSummary({
        isSuccess: true,
        data: {
          contract_amount: null,
          cumulative_gross: "8400000.00",
          progress_pct: null,
          advance_deduction_total: "0.00",
          retention_total: "0.00",
          net_total: "8400000.00",
          payment_count: 4,
          pending_count: 1,
          remaining: null,
        },
      });
      render(<SiteHakedislerPage />);
      expect(screen.getByTestId("pp-kpi-subtitle")).toHaveTextContent("4 hakediş");
      expect(screen.getByTestId("pp-kpi-subtitle").textContent).not.toMatch(/%/);
    });

    it("özet sorgusu hata verirse (403 dahil) sayfa KIRILMAZ — liste ve şerit yine basılır, alt metin yüzdesiz kalır", () => {
      mockPayments({ data: { items: [PAYMENT_ITEM] } });
      mockSummary({ isSuccess: false, isError: true, error: new BackendError(403, { detail: "yasak" }) });
      render(<SiteHakedislerPage />);
      expect(screen.getByRole("heading", { name: "A-Blok Şantiyesi — Hakedişler" })).toBeInTheDocument();
      expect(screen.getByTestId("pp-totals-strip")).toBeInTheDocument();
      // Özet başarısız olunca sayı `items.length`e düşer (fallback), yüzde YOK.
      expect(screen.getByTestId("pp-kpi-subtitle")).toHaveTextContent("1 hakediş");
      expect(screen.getByTestId("pp-kpi-subtitle").textContent).not.toMatch(/%/);
      expect(screen.getByRole("link", { name: /Güneşkent Konut/ })).toBeInTheDocument();
    });
  });
});
