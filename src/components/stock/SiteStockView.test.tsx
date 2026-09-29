import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

import { SiteStockView } from "./SiteStockView";
import { useSession } from "@/components/shell/SessionProvider";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteStock } from "@/lib/api/hooks/useSiteStock";
import { BackendError } from "@/lib/api/unwrap";
import type { MeResponse } from "@/lib/auth/types";
import type { SiteStockResponse, SiteStockRow } from "@/lib/api/hooks/useSiteStock";

vi.mock("@/lib/api/hooks/useSiteStock", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/hooks/useSiteStock")>()),
  useSiteStock: vi.fn(),
}));
vi.mock("@/lib/api/hooks/useSites", () => ({ useSite: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const PROJECT_ID = "p-1";
const SITE_ID = "s-1";
// 🔴 STOK-BOLUM — ekran artık `?section=` OKUYOR. Mock bir `URLSearchParams`
// döndürür ve testler `setSearchParams(...)` ile onu değiştirir; sabit boş bir
// nesne dönseydi süzgeç dalı HİÇ ölçülemezdi.
let searchParams = new URLSearchParams();
function setSearchParams(query: string): void {
  searchParams = new URLSearchParams(query);
}
vi.mock("next/navigation", () => ({
  usePathname: () => `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/stok`,
  useParams: () => ({ projectId: PROJECT_ID, siteId: SITE_ID }),
  useSearchParams: () => searchParams,
}));

const ROWS: SiteStockRow[] = [
  {
    id: "it-1",
    code: "SNK-0421",
    name: "Nervürlü Demir Ø12",
    category: "steel",
    unit: "Ton",
    min_stock: "10.000",
    balance: "2.400",
    status: "critical",
    monthly_need: { available: false, value: null, pending_module: "site_planning" },
    section: { available: false, items: [], pending_module: "site_planning" },
  },
];

function siteStock(overrides: Partial<SiteStockResponse> = {}): SiteStockResponse {
  return {
    items: ROWS,
    total: ROWS.length,
    limit: 200,
    offset: 0,
    kpis: {
      total_value: "1840000.00",
      critical_count: 3,
      low_count: 7,
      total_items: 64,
      items_without_price: 0,
    },
    ...overrides,
  };
}

/** React Query sonucunun 20+ alanını fikstürde yeniden üretmemek için. */
function queryStub(
  data: unknown,
  extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {},
) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as unknown as ReturnType<typeof useSiteStock>;
}

// 🔴 İZİN ANAHTARI FİKSTÜRDE UYDURULMAZ — sunucunun stok modül anahtarı
// `inventory`dir (`backend/app/modules/inventory/service.py` ·
// `PERMISSION_MODULE`). `stock` yazan fikstür bilinmezlik kuralını tetikler ve
// aşağıdaki yetki testini kör bırakır.
beforeEach(() => {
  setSearchParams("");
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    me: { permissions: { inventory: "full" } } as unknown as MeResponse,
    isLoading: false,
  } as ReturnType<typeof useSession>);
  // 🔴 URL-3 — santiye yaniti artik ekranin KANONIK KIMLIK kaynagidir:
  // rota parametresi slug olabilir, `useSiteStock` ise UUID bekler. `id` ve
  // `project.id` eksik birakilirsa ekran (dogru sekilde) bos kimlikle bekler
  // ve stok sorgusu HIC acilmaz — bu fikstur o gecisi ayakta tutar.
  vi.mocked(useSite).mockReturnValue(
    queryStub({
      id: SITE_ID,
      name: "A-Blok Şantiyesi",
      project: { id: PROJECT_ID, name: "Güneşkent Konut" },
    }) as unknown as ReturnType<typeof useSite>,
  );
  vi.mocked(useSiteStock).mockReturnValue(queryStub(siteStock()));
});

describe("SiteStockView — ŞS başlık, sekme ve KPI şeridi", () => {
  it("mockup başlığı ve alt satırı şantiye/proje adından gelir (uydurma YOK)", () => {
    render(<SiteStockView />);
    expect(
      screen.getByRole("heading", { name: "A-Blok Şantiyesi — Stok Durumu" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Güneşkent Konut · Şantiye Bazlı")).toBeInTheDocument();
  });

  it("sekme şeridinde YALNIZ 'Stok' aktiftir (çift aktiflik YOK — F-SD dersi)", () => {
    render(<SiteStockView />);
    const selected = screen
      .getAllByRole("tab")
      .filter((tab) => tab.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent("Stok");
    // ComingSoon'a DÜŞMEDİĞİNİN kanıtı: gerçek ekran içeriği basılıyor.
    expect(screen.queryByText("Bu modül yakında eklenecek.")).not.toBeInTheDocument();
  });

  it("DÖRT KPI kartı sunucunun kpis zarfından gelir ('Bekleyen Sipariş' YOK)", () => {
    render(<SiteStockView />);
    const strip = screen.getByTestId("santiye-stok-kpi-strip");
    expect(strip).toHaveTextContent("64 Kalem");
    expect(strip).toHaveTextContent("3 Kalem");
    expect(strip).toHaveTextContent("7 Kalem");
    expect(strip).toHaveTextContent("₺ 1,8M");
    // E3'ün kartı ŞS'de ÇİZİLMEMİŞTİR — icat edilmez.
    expect(strip).not.toHaveTextContent("Bekleyen Sipariş");
  });

  it("liste her zaman AÇIK limit tavanıyla istenir (sessiz kırpma korkuluğu)", () => {
    render(<SiteStockView />);
    expect(vi.mocked(useSiteStock).mock.calls[0]).toEqual([SITE_ID, { limit: 200 }]);
  });

  it("liste kırpılırsa GÖRÜNÜR uyarı basılır", () => {
    vi.mocked(useSiteStock).mockReturnValue(queryStub(siteStock({ total: 900 })));
    render(<SiteStockView />);
    expect(screen.getByTestId("santiye-stok-truncation-notice")).toHaveTextContent("liste eksik");
  });

  it("fiyatsız kalem varsa stok değerinin eksikliği GÖRÜNÜR yazılır", () => {
    vi.mocked(useSiteStock).mockReturnValue(
      queryStub(siteStock({ kpis: { ...siteStock().kpis, items_without_price: 2 } })),
    );
    render(<SiteStockView />);
    expect(screen.getByTestId("santiye-stok-price-notice")).toHaveTextContent(
      "2 kalemin birim fiyatı yok",
    );
  });
});

describe("SiteStockView — pending yüzeyler ve aksiyonlar", () => {
  it("'Satınalma Talebi →' DEVRE DIŞIdır, gerekçesi title'da ve metinde durur", () => {
    render(<SiteStockView />);
    const button = screen.getByRole("button", { name: "Satınalma Talebi →" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");
    expect(screen.getByTestId("santiye-stok-pending-notice")).toHaveTextContent(
      "Satınalma verisi bu yüzeye henüz bağlanmadı",
    );
  });

  // 🔴 STOK-BOLUM — BU İDDİA BAYATTI VE DÜZELTİLDİ. Eski hâli bandın "Bölüm"
  // KELİMESİNİ ve "Şantiye planlama … bağlanmadı" cümlesini AYRI AYRI arıyordu;
  // `toHaveTextContent` düğümün TAMAMINA baktığı için iki metin farklı
  // cümlelerde olsa bile YEŞİL kalıyordu — yani sütunlar ayrıldıktan sonra
  // iddia hiçbir şeyi bekçilemiyordu (sahte-yeşil).
  //
  // Yeni iddia AYRIMI çakar: yer tutucu gerekçesi YALNIZ "Aylık İhtiyaç"a
  // bağlıdır ve "Bölüm" o cümlenin İÇİNDE geçmez.
  it("yer tutucu gerekcesi YALNIZ 'Aylik Ihtiyac'a baglidir - 'Bolum' o cumlede YOK", () => {
    render(<SiteStockView />);
    const notice = screen.getByTestId("santiye-stok-pending-notice");
    const text = notice.textContent ?? "";

    const needSentence = text.split(".")[0];
    expect(needSentence).toContain("Aylık İhtiyaç");
    expect(needSentence).toContain("Şantiye planlama verisi bu yüzeye henüz bağlanmadı");
    // 🔴 ASIL BEKÇİ: "Bölüm" o cümlede GEÇMEZ — sütun artık gerçek basıyor ve
    // onu "kaynağı yok" cümlesine geri koymak canlıyı yalanlardı.
    expect(needSentence).not.toContain("Bölüm");
  });

  it("'Bolum' sutunu icin ARTIK 'kaynagi yok' DENMEZ - ne bastigi anlatilir", () => {
    render(<SiteStockView />);
    const notice = screen.getByTestId("santiye-stok-pending-notice");

    expect(notice).toHaveTextContent(/“Bölüm” sütunu stok hareketlerinde atfedilmiş/);
    expect(notice.textContent ?? "").not.toContain(
      "“Aylık İhtiyaç” ve “Bölüm” sütunlarının veri kaynağı henüz yok",
    );
  });

  it("satir sonu düğme gerekcesi bandda KALIR", () => {
    render(<SiteStockView />);
    expect(screen.getByTestId("santiye-stok-pending-notice")).toHaveTextContent(
      "Malzeme detay ekranı henüz tasarlanmadı",
    );
  });

  /* ── `?section=` SÜZGECİ ────────────────────────────────────────────── */

  it("suzgec YOKKEN section_id AGA GONDERILMEZ ve band BASILMAZ", () => {
    render(<SiteStockView />);

    expect(vi.mocked(useSiteStock).mock.calls[0]?.[1]).toEqual({ limit: 200 });
    expect(screen.queryByTestId("santiye-stok-section-filter")).not.toBeInTheDocument();
  });

  it("?section= verilince suzgec AGA gonderilir", () => {
    setSearchParams("section=sec-1");
    render(<SiteStockView />);

    expect(vi.mocked(useSiteStock).mock.calls[0]?.[1]).toEqual({
      limit: 200,
      sectionId: "sec-1",
    });
  });

  // 🔴 BU DİLİMİN EN KOLAY YANLIŞ YAPILACAK YERİ: süzgeç SATIR KÜMESİNİ
  // daraltır, BAKİYEYİ DEĞİŞTİRMEZ. Band bunu SÖYLEMEK ZORUNDADIR; "bölümün
  // stoğu" demek canlı bir yalan olurdu.
  it("suzgec bandi bakiyenin SANTIYE bakiyesi oldugunu SOYLER", () => {
    setSearchParams("section=sec-1");
    render(<SiteStockView />);

    const band = screen.getByTestId("santiye-stok-section-filter");
    expect(band).toHaveTextContent(/ŞANTİYE bakiyesidir/);
    expect(band).toHaveTextContent(/bölümün kendi miktarları değildir/);
  });

  it("suzgec bandi 'bolumun stogu' YALANINI kurmaz", () => {
    setSearchParams("section=sec-1");
    render(<SiteStockView />);

    const text = screen.getByTestId("santiye-stok-section-filter").textContent ?? "";
    expect(text).not.toMatch(/bölümün stoğu/i);
    expect(text).not.toMatch(/bölüm bakiyesi/i);
  });

  it("suzgec kaldirma baglantisi SUZGECSIZ rotaya gider", () => {
    setSearchParams("section=sec-1");
    render(<SiteStockView />);

    const clear = screen.getByTestId("santiye-stok-section-filter-clear");
    expect(clear).toHaveAttribute("href", `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/stok`);
    expect(clear.getAttribute("href")).not.toContain("?section=");
  });

  // Boş/whitespace `?section=` süzgeç SAYILMAZ: ölü bir sorgu parametresiyle
  // ağa çıkmak ve bandı basmak kullanıcıya olmayan bir süzgeç gösterirdi.
  it("bos ?section= suzgec SAYILMAZ", () => {
    setSearchParams("section=%20%20");
    render(<SiteStockView />);

    expect(vi.mocked(useSiteStock).mock.calls[0]?.[1]).toEqual({ limit: 200 });
    expect(screen.queryByTestId("santiye-stok-section-filter")).not.toBeInTheDocument();
  });

  it("'+ Stok Girişi' T4'ün şantiye kapsamlı rotasına gider", () => {
    render(<SiteStockView />);
    expect(screen.getByTestId("santiye-stok-giris-link")).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${SITE_ID}/stok/giris`,
    );
  });
});

describe("SiteStockView — yetki ve hata yolları", () => {
  it("izinsiz kullanıcı erişim reddi görür", () => {
    vi.mocked(useSession).mockReturnValue({
      me: { permissions: { inventory: "none" } } as unknown as MeResponse,
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<SiteStockView />);
    expect(screen.queryByTestId("santiye-stok-kpi-strip")).not.toBeInTheDocument();
  });

  it("403 gelen istek de erişim reddine düşer", () => {
    vi.mocked(useSiteStock).mockReturnValue(
      queryStub(undefined, {
        isError: true,
        error: new BackendError(403, { detail: "Yetkiniz yok." }),
      }),
    );
    render(<SiteStockView />);
    expect(screen.queryByTestId("santiye-stok-kpi-strip")).not.toBeInTheDocument();
  });

  it("görünmeyen şantiye 404 alır ve Türkçe GÖRÜNÜR mesaj basılır (ST §4b)", () => {
    vi.mocked(useSiteStock).mockReturnValue(
      queryStub(undefined, {
        isError: true,
        error: new BackendError(404, { detail: "Şantiye bulunamadı." }),
      }),
    );
    render(<SiteStockView />);
    expect(screen.getByTestId("santiye-stok-error")).toHaveTextContent("Şantiye bulunamadı.");
  });
});
