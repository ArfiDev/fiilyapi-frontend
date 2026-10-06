import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { SalesView } from "./SalesView";
import { PRICE_LIST_PENDING_REASON } from "./sales-labels";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { useProjectUnits } from "@/lib/api/hooks/useProjectUnits";
import { useSales } from "@/lib/api/hooks/useSales";
import { useSalesSummary } from "@/lib/api/hooks/useSalesSummary";
import { useSession } from "@/components/shell/SessionProvider";
import { BackendError } from "@/lib/api/unwrap";
import { ALL_PAGE_KEYS, meFixture, pageGrant, pagesFor } from "@/lib/auth/page-grants.testkit";

vi.mock("@/lib/api/hooks/useProjects", () => ({ useProjects: vi.fn() }));
vi.mock("@/lib/api/hooks/useProjectUnits", () => ({ useProjectUnits: vi.fn() }));
vi.mock("@/lib/api/hooks/useSales", () => ({ useSales: vi.fn() }));
vi.mock("@/lib/api/hooks/useSalesSummary", () => ({ useSalesSummary: vi.fn() }));
vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

const replaceMock = vi.fn();
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/satis",
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

function queryStub(data: unknown, extra: Partial<{ isLoading: boolean; isError: boolean; error: unknown }> = {}) {
  return {
    data,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: extra.error ?? null,
  } as never;
}

const PROJECTS = {
  items: [
    { id: "p-1", name: "Yeşilvadi Rezidans" },
    { id: "p-2", name: "Mavişehir Villaları" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  vi.mocked(useSession).mockReturnValue({
    me: meFixture(),
    isLoading: false,
  } as ReturnType<typeof useSession>);
  vi.mocked(useProjects).mockReturnValue(queryStub(PROJECTS));
  vi.mocked(useSales).mockReturnValue(queryStub({ items: [], totals: undefined }));
  vi.mocked(useSalesSummary).mockReturnValue(queryStub(undefined));
  vi.mocked(useProjectUnits).mockReturnValue(queryStub({ blocks: [] }));
});

describe("SalesView — başlık ve kabuk sınırı", () => {
  it("sayfa başlığı basılır; mockup'ın kendi kabuğu YENİDEN çizilmez", () => {
    render(<SalesView />);
    expect(screen.getByRole("heading", { name: "Satış Yönetimi", level: 1 })).toBeInTheDocument();
    // Mockup'ın sol menüsü (30-49) kabuğun işidir.
    expect(screen.queryByText("Tüm Projeler")).not.toBeInTheDocument();
  });

  it("mockup'ın dört bölümü de basılır (KPI · harita · tablo · yaklaşan)", () => {
    render(<SalesView />);
    expect(screen.getByTestId("satis-kpi-strip")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Blok Doluluk Haritası" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Satış Sözleşmeleri & Tahsilat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Yaklaşan Tahsilatlar (30 Gün)" }),
    ).toBeInTheDocument();
  });
});

/**
 * ⚠️ PROJE SEÇİCİ — onaylı türetim. Uçlar proje kapsamlıdır
 * (`/projects/{id}/sales`) ama rota proje-geneldir (`/satis`, spec K1);
 * köprü seçicidir (emsal: `/puantaj` şantiye seçicisi).
 */
describe("SalesView — proje seçici (onaylı türetim) ve URL durumu", () => {
  it("seçim yoksa listenin İLK projesi kullanılır ve uçlar onunla çağrılır", () => {
    render(<SalesView />);
    expect(vi.mocked(useSales).mock.calls[0][0]).toBe("p-1");
    expect(vi.mocked(useSalesSummary).mock.calls[0][0]).toBe("p-1");
  });

  it("URL'deki proje seçimi kazanır", () => {
    searchParams = new URLSearchParams("proje=p-2");
    render(<SalesView />);
    expect(vi.mocked(useSales).mock.calls[0][0]).toBe("p-2");
  });

  it("proje değişimi URL'ye yazılır (paylaşılabilir durum)", () => {
    render(<SalesView />);
    fireEvent.change(screen.getByLabelText("Proje seçimi"), { target: { value: "p-2" } });
    expect(replaceMock).toHaveBeenCalledWith("/satis?proje=p-2", { scroll: false });
  });

  it("durum süzgeci URL'ye yazılır ve proje seçimini KORUR", () => {
    searchParams = new URLSearchParams("proje=p-2");
    render(<SalesView />);
    fireEvent.change(screen.getByLabelText("Durum filtresi"), { target: { value: "overdue" } });
    expect(replaceMock).toHaveBeenCalledWith("/satis?proje=p-2&durum=overdue", { scroll: false });
  });
});

/**
 * 🛑 F-TH KALICI KURALI: rotası olmayan mockup öğesi SİLİNMEZ, devre dışı basılır.
 */
describe("SalesView — 'Fiyat Listesi' (24) devre dışı, gerekçeli", () => {
  it("düğme SİLİNMEZ; devre dışıdır ve gerekçesi `title`dadır", () => {
    render(<SalesView />);
    const button = screen.getByRole("button", { name: "Fiyat Listesi" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", PRICE_LIST_PENDING_REASON);
  });

  it("gerekçe ekranda METİN olarak da görünür (sessiz düşüş yok)", () => {
    render(<SalesView />);
    expect(screen.getByTestId("satis-fiyat-listesi-notu")).toHaveTextContent(
      /Fiyat Listesi.*henüz tasarlanmadı/,
    );
  });
});

describe("SalesView — satış formu girişi (25)", () => {
  it("'+ Satış Kaydı' /satis/yeni rotasına, seçili proje bağlamıyla gider (no 236)", () => {
    render(<SalesView />);
    expect(screen.getByRole("link", { name: "+ Satış Kaydı" })).toHaveAttribute(
      "href",
      "/satis/yeni?proje=p-1",
    );
  });

  // ⚠️ Okuma seviyesinin adı `view`dır ("read" TANINMAZ bir dizedir ve
  // bilinmezlik kuralına düşerek yazma yüzeyini AÇIK bırakırdı).
  it("yalnız okuma ('view') yetkisi olan kullanıcıya form girişi BASILMAZ", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "view") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<SalesView />);
    expect(screen.queryByRole("link", { name: "+ Satış Kaydı" })).not.toBeInTheDocument();
  });

  // ⚠️ Bilinmezlik kuralı: izin alanı YOK olmak ekranı kapatmaz; yalnız
  // AÇIKÇA "none" kapatır — test bu yüzden "none" verir.
  it("izni 'none' olan kullanıcı ekranı göremez", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({ pages: pagesFor(ALL_PAGE_KEYS, "none") }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<SalesView />);
    expect(screen.queryByRole("heading", { name: "Satış Yönetimi" })).not.toBeInTheDocument();
  });
});

/**
 * kalan-6 no 275 — `projectsQuery` 403 aldığında (kullanıcının `sales:view`
 * var ama `projects:view` YOK) `projectsQuery.error` hiç okunmuyordu; proje
 * listesi sessizce boş dizi olup ekran "Proje yok" gösteriyordu. Gerçek
 * gerekçe (yetki eksikliği) hiç basılmıyordu — AccessDenied'a düşmesi gerekir.
 */
describe("SalesView — proje listesi 403'ü ekranı düşürür", () => {
  it("projectsQuery 403 aldığında AccessDenied basılır, 'Proje yok' değil", () => {
    vi.mocked(useProjects).mockReturnValue(
      queryStub(undefined, { isError: true, error: new BackendError(403, null) }),
    );
    render(<SalesView />);
    expect(screen.queryByRole("heading", { name: "Satış Yönetimi" })).not.toBeInTheDocument();
    expect(screen.queryByText("Proje yok")).not.toBeInTheDocument();
  });
});

/**
 * no 237 — `projectsQuery.isError` 403 DIŞI bir hatada (ağ/500) hiç
 * okunmuyordu; ekran sessizce "Proje yok" + boş KPI gösterip gerçek hatayı
 * gizliyordu.
 */
describe("SalesView — proje listesi 403 DIŞI hatası görünür olmalı (no 237)", () => {
  it("500/ağ hatasında ekran düşmez ama hata bandı basılır", () => {
    vi.mocked(useProjects).mockReturnValue(
      queryStub(undefined, {
        isError: true,
        error: new BackendError(500, { detail: "Sunucu hatası" }),
      }),
    );
    render(<SalesView />);
    expect(screen.getByRole("heading", { name: "Satış Yönetimi" })).toBeInTheDocument();
    expect(screen.getByTestId("satis-proje-hatasi")).toBeInTheDocument();
  });
});

/**
 * Ünite ucunun kapısı `projects` modülüdür (`sales` DEĞİL) — 403 ekranı
 * DÜŞÜRMEZ, yalnız harita kartı gerekçeyle boş kalır.
 */
describe("SalesView — ünite 403'ü ekranı düşürmez", () => {
  it("harita yetkisizken tablo ve KPI çalışmaya devam eder", () => {
    vi.mocked(useProjectUnits).mockReturnValue(
      queryStub(undefined, { isError: true, error: new BackendError(403, null) }),
    );
    render(<SalesView />);
    expect(screen.getByTestId("satis-harita-notu")).toHaveTextContent(/ünite \(proje\) yetkisi/);
    expect(
      screen.getByRole("heading", { name: "Satış Sözleşmeleri & Tahsilat" }),
    ).toBeInTheDocument();
  });
});

/**
 * 🔴 F-UNIT1 T3 — BLOK/ÜNİTE FORM GİRİŞLERİ.
 *
 * İki form (`/satis/blok-ekle`, `/satis/unite-ekle`) T1/T2'de yazıldı ama
 * ÜRÜNDE HİÇBİR GİRİŞ NOKTASI YOKTU: rotalar yalnız elle URL yazarak
 * açılabiliyordu. Konumu mockup'ın KENDİSİ söylüyor — BE 35 / UE 37
 * breadcrumb'ları "Satış Yönetimi / …" yazar ve `Satış Yönetimi.dc.html`e
 * link verir.
 *
 * 🔴 KAPI `projects`, `sales` DEĞİL: blok/ünite uçlarının izin modülü
 * `projects`tir (`useProjectUnits.ts` ölçümü). Aşağıdaki iki test bu ayrımı
 * TERSİNDEN de sınar — biri olup öteki olmayan kullanıcılar ayrışmazsa
 * ikisinden biri sessizce yanlış kapıya bağlanmış demektir.
 */
describe("SalesView — blok/ünite form girişleri (F-UNIT1 T3)", () => {
  /** IZN-F6a · satış sayfası Düzenler; blok/ünite sayfaları (AYRI kapı) `level` düzeyinde. */
  function grantProjects(level: "edit" | "view") {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({
        pages: {
          "mali.satis": pageGrant("edit"),
          "mali.satis_blok": pageGrant(level),
          "mali.satis_unite": pageGrant(level),
        },
      }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
  }

  it("'projects' yazma yetkisiyle iki giriş de basılır", () => {
    grantProjects("edit");
    render(<SalesView />);
    expect(screen.getByRole("link", { name: "+ Blok Ekle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "+ Ünite Ekle" })).toBeInTheDocument();
  });

  it("seçili proje `?proje=` ile forma TAŞINIR (bağlam kaybolmaz)", () => {
    grantProjects("edit");
    searchParams = new URLSearchParams("proje=p-2");
    render(<SalesView />);
    expect(screen.getByRole("link", { name: "+ Blok Ekle" })).toHaveAttribute(
      "href",
      "/satis/blok-ekle?proje=p-2",
    );
    expect(screen.getByRole("link", { name: "+ Ünite Ekle" })).toHaveAttribute(
      "href",
      "/satis/unite-ekle?proje=p-2",
    );
  });

  it("URL'de seçim yoksa listenin İLK projesi taşınır", () => {
    grantProjects("edit");
    render(<SalesView />);
    expect(screen.getByRole("link", { name: "+ Blok Ekle" })).toHaveAttribute(
      "href",
      "/satis/blok-ekle?proje=p-1",
    );
  });

  it("hiç proje yokken bağlamsız (çıplak) rotaya gider", () => {
    grantProjects("edit");
    vi.mocked(useProjects).mockReturnValue(queryStub({ items: [] }));
    render(<SalesView />);
    expect(screen.getByRole("link", { name: "+ Ünite Ekle" })).toHaveAttribute(
      "href",
      "/satis/unite-ekle",
    );
  });

  // 🔴 ASIL BEKÇİ: `sales` yetkisi VAR, `projects` yetkisi YOK. Kapı `sales`e
  // bağlanmış olsaydı bu kullanıcı iki düğmeyi de görür, tıklayınca 403 alırdı.
  it("yalnız 'sales' yetkisi olan (projects: view) kullanıcı girişleri GÖRMEZ", () => {
    grantProjects("view");
    render(<SalesView />);
    expect(screen.queryByRole("link", { name: "+ Blok Ekle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+ Ünite Ekle" })).not.toBeInTheDocument();
    // Satış formu AYRI kapıdadır ve etkilenmez.
    expect(screen.getByRole("link", { name: "+ Satış Kaydı" })).toBeInTheDocument();
  });

  // Ters yön: `projects` yazar ama `sales` yalnız okur → blok/ünite görünür,
  // satış kaydı görünmez. İki kapının GERÇEKTEN ayrı olduğunu bu kanıtlar.
  it("'projects' yazar / 'sales' okur kullanıcıda yalnız blok-ünite girişleri kalır", () => {
    vi.mocked(useSession).mockReturnValue({
      me: meFixture({
        pages: {
          "mali.satis": pageGrant("view"),
          "mali.satis_blok": pageGrant("edit"),
          "mali.satis_unite": pageGrant("edit"),
        },
      }),
      isLoading: false,
    } as ReturnType<typeof useSession>);
    render(<SalesView />);
    expect(screen.getByRole("link", { name: "+ Blok Ekle" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "+ Satış Kaydı" })).not.toBeInTheDocument();
  });

  // 🔴 F-UNIT2 KAPSAMI BURAYA GİRMEZ: "Toplu Üretim / Excel İçe Aktar /
  // Paylaşım Girişi" mockup'ta (BE 50-52 · UE 52-54) FORMUN İÇİNDEKİ sekme
  // şeridinde çizilir, `/satis` başlığında DEĞİL. İkinci bir devre-dışı kopya
  // basmak mockup'ın hiç çizmediği bir yüzeyi icat etmek olurdu.
  it("F-UNIT2 sekmeleri `/satis` başlığında BASILMAZ (mockup onları forma çizer)", () => {
    grantProjects("edit");
    render(<SalesView />);
    for (const label of ["Toplu Üretim", "Excel İçe Aktar", "Paylaşım Girişi"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

/**
 * Kart ile çağıran arasındaki KABLO: bileşen üç hâli ayırsa bile `SalesView`
 * bayrakları geçirmezse kullanıcı yine "taksit yok" okur.
 */
describe("SalesView — yaklaşan tahsilatlar kartına yükleniyor/hata GEÇİRİLİR", () => {
  const EMPTY_CLAIM = "Önümüzdeki 30 günde vadesi gelen taksit yok.";

  it("özet yüklenirken 'taksit yok' iddiası BASILMAZ", () => {
    vi.mocked(useSalesSummary).mockReturnValue(queryStub(undefined, { isLoading: true }));
    render(<SalesView />);
    expect(screen.queryByText(EMPTY_CLAIM)).not.toBeInTheDocument();
  });

  it("özet 403 DIŞI bir hata verdiğinde 'taksit yok' yerine sunucunun cümlesi basılır", () => {
    vi.mocked(useSalesSummary).mockReturnValue(
      queryStub(undefined, {
        isError: true,
        error: new BackendError(500, { detail: "Özet hesaplanamadı." }),
      }),
    );
    render(<SalesView />);
    expect(screen.queryByText(EMPTY_CLAIM)).not.toBeInTheDocument();
    expect(screen.getByTestId("satis-yaklasan-bos")).toHaveTextContent("Özet hesaplanamadı.");
  });
});
