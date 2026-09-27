import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PROJECT_QUERY_KEY } from "@/lib/api/hooks/useProjects";
import { SECTION_QUERY_KEY } from "@/lib/api/hooks/useSection";
import { SITE_QUERY_KEY } from "@/lib/api/hooks/useSites";

import { PageBreadcrumb } from "./PageBreadcrumb";

let currentPath = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

const PROJECT_KEY = "gunesken-konut";
const SITE_KEY = "a-blok";
const SECTION_KEY = "kaba-insaat";

/**
 * 🔴 B3'ün ÖLÇÜM ARACI. Kırıntı ad için ikinci bir istek atarsa bu casus onu
 * görür. `fetch`i mock'lamak DEĞİL, ÇAĞRILDIĞINI SAYMAK önemli: mock'lanmış
 * ama çağrılan bir fetch de "ikinci istek"tir.
 */
let fetchSpy: ReturnType<typeof vi.fn>;

function seededClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Sayfanın KENDİ sorgularının önbelleğe yazdığı hâl — anahtarlar
  // `useProject` / `useSite` / `useSection` ile BİREBİR aynıdır.
  client.setQueryData([PROJECT_QUERY_KEY, PROJECT_KEY], { name: "Güneşkent Konut" });
  client.setQueryData([SITE_QUERY_KEY, SITE_KEY, PROJECT_KEY], {
    name: "A-Blok",
    project: { name: "Güneşkent Konut" },
  });
  client.setQueryData([SECTION_QUERY_KEY, SECTION_KEY, SITE_KEY, PROJECT_KEY], {
    name: "Kaba İnşaat",
  });
  return client;
}

function renderAt(pathname: string, client: QueryClient = seededClient()) {
  currentPath = pathname;
  return render(
    <QueryClientProvider client={client}>
      <PageBreadcrumb />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchSpy = vi.fn(() => Promise.reject(new Error("kırıntı ağa ÇIKMAMALI")));
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
  currentPath = "/";
});

/* ─── B3 · ikinci istek yok ───────────────────────────────────────────── */

describe("ad çözümleme — yalnız önbellek", () => {
  it("adları basar ama HİÇBİR ağ isteği atmaz", async () => {
    renderAt(`/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/gunluk-kayit`);

    const list = screen.getByTestId("page-crumbs");
    expect(within(list).getByText("Güneşkent Konut")).toBeInTheDocument();
    expect(within(list).getByText("A-Blok")).toBeInTheDocument();

    // Mutasyon: kırıntıyı kendi `useQuery`siyle (queryFn dolu) beslet → kırmızı.
    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("bölüm adı da yalnız önbellekten gelir", () => {
    renderAt(`/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/bolumler/${SECTION_KEY}`);
    const list = screen.getByTestId("page-crumbs");
    // 🔴 Parça bazında: birleşik metin iddiası üç ad tek düğüme çökse de geçerdi.
    expect(within(list).getByText("Kaba İnşaat")).toBeInTheDocument();
    expect(within(list).getByText("A-Blok")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("şantiye alt ağacında proje adı ŞANTİYE yanıtından gelir (proje sorgusu YOK)", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData([SITE_QUERY_KEY, SITE_KEY, PROJECT_KEY], {
      name: "A-Blok",
      project: { name: "Güneşkent Konut" },
    });
    renderAt(`/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/puantaj`, client);

    const list = screen.getByTestId("page-crumbs");
    expect(within(list).getByText("Güneşkent Konut")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POZİTİF KONTROL — önbellek BOŞken ham anahtar basılmaz, iskelet basılır", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderAt(`/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}`, client);

    expect(screen.getAllByTestId("crumb-pending")).toHaveLength(2);
    const list = screen.getByTestId("page-crumbs");
    expect(list.textContent).not.toContain(PROJECT_KEY);
    expect(list.textContent).not.toContain(SITE_KEY);
    // Ekran okuyucu yine de nerede olduğunu duyar.
    expect(within(list).getByText("Şantiye")).toBeInTheDocument();
  });
});

/* ─── B5 · son parça bağlantı DEĞİL ───────────────────────────────────── */

describe("son parça", () => {
  it("bağlantı DEĞİLDİR; öncekilerin hepsi bağlantıdır", () => {
    renderAt(`/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/gunluk-kayit`);
    const list = screen.getByTestId("page-crumbs");

    // 🔴 `getAllByRole("link")` KULLANILMAZ: açık `role` taşıyan bir `<a>`
    // (ör. `role="tab"`) o sorgudan KAÇAR ve bekçinin yarısı sessizce ölçmez.
    const anchors = [...list.querySelectorAll("a[href]")];
    expect(anchors.map((a) => a.textContent)).toEqual([
      "Projeler",
      "Güneşkent Konut",
      "A-Blok",
    ]);

    const current = within(list).getByText("Günlük Kayıt");
    expect(current.closest("a")).toBeNull();
    expect(current).toHaveClass("page-crumbs__current");
  });
});

/* ─── SEKME-F1.2 · tek parçalı kırıntı HİÇ BASILMAZ (M1) ─────────────────── */

describe("tek parçalı kırıntı — boş kutu bile kalmaz", () => {
  it("kökte (`/`) hiçbir şey basılmaz", () => {
    // Mutasyon (M1): `trail.length === 1` erken dönüşünü kaldır → bu container
    // artık BOŞ değil, `page-crumbs` testid'i bulunur → kırmızı.
    const { container } = renderAt("/");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("page-crumbs")).toBeNull();
  });

  it("modül kökünde (`/puantaj`) hiçbir şey basılmaz", () => {
    const { container } = renderAt("/puantaj");
    expect(container).toBeEmptyDOMElement();
  });

  it("yazılmamış (ComingSoon) rotada (`/raporlar`) hiçbir şey basılmaz", () => {
    // Sayfanın KENDİ başlığı ("Raporlar") zaten ekranda basılıdır (ComingSoon);
    // kabuk kırıntısı burada İKİNCİ bir "Raporlar" yazmaz.
    const { container } = renderAt("/raporlar");
    expect(container).toBeEmptyDOMElement();
  });
});

/* ─── SEKME-F1.2 · /ayarlar altında kabuk kırıntısı BASILMAZ (M5) ────────── */

describe("/ayarlar altında kabuk kırıntısı basılmaz", () => {
  it("`/ayarlar/kullanicilar` çok parçalı olsa da null döner", () => {
    // Mutasyon (M5): `/ayarlar` önek kontrolünü kaldır → `page-crumbs` basılır
    // → kırmızı. Ayarlar kendi kırıntısını (`SettingsBreadcrumb`) basar.
    const { container } = renderAt("/ayarlar/kullanicilar");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("page-crumbs")).toBeNull();
  });

  // D6 (SEKME-F1.2-FIX) — ikinci bir alt sayfa: tek bir yol tesadüfen
  // geçmiyor, dışlama GERÇEKTEN `isActivePath`ten (`routes.settings.root()`
  // ile eşleşme) geliyor.
  it("`/ayarlar/roller` (ikinci alt sayfa) de null döner", () => {
    const { container } = renderAt("/ayarlar/roller");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("page-crumbs")).toBeNull();
  });

  it("çıplak `/ayarlar` de null döner (isActivePath TAM eşleşme kolu)", () => {
    const { container } = renderAt("/ayarlar");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("page-crumbs")).toBeNull();
  });

  // 🔴 ÇÜRÜTME NOTU (D6) — `startsWith("/ayarlar")` kusuru teorik olarak
  // "/ayarlarX/..." gibi bir yolda YANLIŞ eşleşirdi (Ayarlar DIŞI bir sayfayı
  // da dışlardı). ÖLÇÜLDÜ: `route-tree.ts`in kök çocukları arasında "ayarlar"
  // ile başlayıp ONA EŞİT OLMAYAN bir anahtar YOK; böyle bir yol
  // `childFor`de İLK segmentte zaten eşleşmez ve `buildTrail` onu
  // `comingSoonTrail`e (TEK parçalı kırıntı) düşürür — `trail.length === 1`
  // erken dönüşü zaten onu basmaz. Yani bu depoda kusur PRATİKTE
  // ERİŞİLEMEZDİ (route-tree çok parçalı bir eşleşme üretmiyor); yine de
  // `isActivePath` kullanmak DOĞRU birincil kaynaktır (D6) ve gelecekte
  // "ayarlarim" gibi bir üst-seviye rota eklenirse bu ölçüm geçersiz olur.
  it("ÖLÇÜM — `/ayarlar-harici/x` route-tree'de zaten TEK parçalı kırıntıya düşer", () => {
    const { container } = renderAt("/ayarlar-harici/x");
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("page-crumbs")).toBeNull();
  });
});

/* ─── B2 · geri tuşu ──────────────────────────────────────────────────── */

describe("geri tuşu", () => {
  it("bir seviye yukarıya giden GERÇEK bir bağlantıdır", () => {
    renderAt(`/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}/gunluk-kayit`);
    const back = screen.getByTestId("page-back");
    // Mutasyon: `router.back()` çağıran bir <button>a çevir → `href` kaybolur
    // ve bu iddia kırmızı olur.
    expect(back.tagName).toBe("A");
    expect(back).toHaveAttribute("href", `/projeler/${PROJECT_KEY}/santiyeler/${SITE_KEY}`);
    expect(back).toHaveAccessibleName("A-Blok sayfasına dön");
  });

  it("aynı yol iki ayrı render'da AYNI hedefi verir (geçmiş etkisi yok)", () => {
    const first = renderAt(`/projeler/${PROJECT_KEY}/ozet`);
    const target = first.getByTestId("page-back").getAttribute("href");
    first.unmount();
    const second = renderAt(`/projeler/${PROJECT_KEY}/ozet`);
    expect(second.getByTestId("page-back")).toHaveAttribute("href", target ?? "");
    expect(target).toBe(`/projeler/${PROJECT_KEY}`);
  });

  it("POZİTİF KONTROL — kökte ve modül kökünde geri tuşu BASILMAZ", () => {
    const atRoot = renderAt("/");
    expect(atRoot.queryByTestId("page-back")).toBeNull();
    atRoot.unmount();

    const atModule = renderAt("/puantaj");
    expect(atModule.queryByTestId("page-back")).toBeNull();
  });
});

/* ─── Kabuk bütünlüğü ─────────────────────────────────────────────────── */

describe("kırıntı kabuğu", () => {
  it("erişilebilir bir gezinme bölgesidir", () => {
    renderAt("/muhasebe/mizan");
    expect(screen.getByRole("navigation", { name: "Yol göstergesi" })).toBeInTheDocument();
    expect(screen.getByText("Mizan")).toHaveClass("page-crumbs__current");
  });

  it("K7 — kırıntı `aria-current` SÜRMEZ (sayfadaki tek işaret kabuk menüsünde)", () => {
    // 🔴 Bu deponun YAZILI kararı: sayfada TAM BİR `aria-current="page"`
    // bulunur ve o da kabuk nav'ındadır; ikincisi ekran okuyucuya iki sayfa
    // derdi. Mali Tablolar segment şeridi (aynı şekle sahip yol göstergesi)
    // de sürmez. Mutasyon: son parçaya `aria-current="page"` ekle → kırmızı
    // (burada ve `financial-statements.spec.ts`in BEŞ K7 bekçisinde).
    renderAt("/muhasebe/mizan");
    expect(
      screen.getByTestId("page-crumbs").querySelectorAll("[aria-current]"),
    ).toHaveLength(0);
  });
});
