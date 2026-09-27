/**
 * SEKME-F1.4a-FIX · "BEKLENEN GEZİNME" kaydı — sekme değişiminin push'u
 * yoldayken gelen URL'leri SINIFLAR.
 *
 * ─── Neden var (rv3 YARIŞ bulgusu) ────────────────────────────────────────
 * Denetleyici sekme değişiminde aktif sekmeyi HEMEN değiştirir, `router.push`
 * ise ASENKRONDUR (Next 15 action queue: sunucu yanıtı gelene kadar URL
 * değişmez; yeni bir NAVIGATE bekleyeni ATAR). Bu arada ESKİ sayfa hâlâ
 * ekrandadır ve etkileşimlidir: onun `router.replace`i ya da içindeki bir
 * bağlantı tıkı bizim push'umuzu atar, URL eski sayfanın adresine gider ve
 * `navigateActive` o adresi YENİ aktif sekmeye KALICI yazardı.
 *
 * ─── Kurallar (gözlenen her URL için, `observe`) ──────────────────────────
 * Beklenen yoksa → izle (`navigateActive`, bugünkü davranış). Varsa:
 * (c) popstate ile geldiyse → kaydı düşür, izle (Q5 kararı: geri/ileri
 *     tarayıcının TEK geçmişidir, aktif sekmeye yazılır).
 * (a) URL beklenenle AYNIYSA (aynı normalleştirmeyle) → vardık, kaydı düşür, izle.
 * (b) URL, yerine yenisi konmuş (superseded) eski bir beklenense → YOK SAY.
 * (d) YABANCI URL → aktif sekmeye YAZMA; ilk seferde beklenen adresi
 *     `router.replace` ile YENİDEN DAYAT. Dayatmadan sonra yine yabancı URL
 *     gelirse (sunucu yönlendirmesi: hedef başka yola dönüyor) KABUL et —
 *     TEK-SEFER sınırı yönlendirme döngüsünü imkânsız kılar. Yönlendirme
 *     dayatmayı AYNI yabancı adrese döndürürse URL hiç değişmez; kayıt
 *     `reasserted` hâlde asılı kalır ve bir sonraki gözlenen URL'de (her ne
 *     olursa) düşer — o URL izlenir, ikinci dayatma OLMAZ.
 *
 * Öneriden bilinçli iki sapma (çürütme, raporda):
 * - "pathname aynıysa vardık" kuralı YOK: aynı modülde aynı yolda iki sekme
 *   (`/puantaj?site=1` · `/puantaj?site=2`) olağandır; eski sayfanın query
 *   replace'i (`useEvSiteParam`) yeni sekmeye "vardık" diye yazılırdı.
 *   Onun yerine iki taraf AYNI normalleştirmeden geçer (`normalizeTabUrl`).
 * - Yabancı URL eski (from) sekmeye YAZILMAZ: ilk gelişte eski sayfanın
 *   gezinmesi ile hedefin sunucu yönlendirmesi AYIRT EDİLEMEZ; yazmak
 *   yönlendirme hâlinde eski sekmeyi hedefin adresiyle kirletirdi. Eski
 *   sekme ayrıldığı andaki adresini korur.
 *
 * İç durum değişmezdir: her geçiş yeni bir nesne/küme üretir.
 */

/** Göreli URL çözümü için yer tutucu köken (yalnız kodlama için kullanılır). */
const ENCODING_BASE = "http://x";

/**
 * Router'dan okunan adresi sekme url'sine çevirir.
 *
 * `isSafeInternalUrl` ham ASCII-dışı karakteri REDDEDER; `usePathname` ise
 * yolu kodlu da verebilir kodsuz da. `new URL(...).pathname` ikisini aynı
 * kodlu biçime getirir (`%XX` dizileri korunur, `ö` → `%C3%B6`).
 * `URLSearchParams#toString` zaten kodlu üretir.
 */
export function tabUrlOf(pathname: string | null, search: string): string | null {
  if (pathname === null) return null;
  let encodedPath: string;
  try {
    encodedPath = new URL(pathname, ENCODING_BASE).pathname;
  } catch {
    return null;
  }
  return search.length > 0 ? `${encodedPath}?${search}` : encodedPath;
}

/**
 * Sekme url'sini, router'dan GÖZLENEN url'nin üretildiği biçime getirir
 * (`?a=b%20c` → `?a=b+c`): beklenen ile gelen aynı fonksiyondan geçer.
 */
export function normalizeTabUrl(url: string): string {
  const queryAt = url.indexOf("?");
  const path = queryAt === -1 ? url : url.slice(0, queryAt);
  const search = queryAt === -1 ? "" : url.slice(queryAt + 1);
  return tabUrlOf(path, new URLSearchParams(search).toString()) ?? url;
}

export type UrlVerdict =
  | { readonly kind: "follow" }
  | { readonly kind: "ignore" }
  | { readonly kind: "reassert"; readonly url: string };

interface Expected {
  readonly tabId: string;
  readonly url: string;
  readonly reasserted: boolean;
}

export interface PendingNavigation {
  /** Denetleyici push'tan HEMEN önce çağırır; önceki beklenen superseded olur. */
  expect(tabId: string, url: string): void;
  /** Push, zaten bulunulan adrese gidiyor: beklenecek URL değişimi yok. */
  settle(): void;
  /**
   * Bu sekmeye giden İLK push hâlâ yolda mı. Yeniden dayatılmış kayıt
   * SAYILMAZ: yönlendirme dayatmayı aynı adrese döndürürse URL değişmez ve
   * kayıt bir sonraki gözleme kadar asılı kalır — o sırada kullanıcı zaten
   * hedef sekmededir, sidebar tıkı normal kuralla yürümelidir.
   */
  isPendingFor(tabId: string): boolean;
  /** Tarayıcı geri/ileri (popstate) — bir sonraki gözlemde BİR KEZ tüketilir. */
  markPopstate(): void;
  /** Senkron, işlediği her yeni URL için çağırır. */
  observe(url: string, activeId: string): UrlVerdict;
  /** Senkronun en son işlediği URL (push'un gerçekten URL değiştirip değiştirmeyeceği). */
  currentUrl(): string | null;
  /** Kullanıcı iliştirme/ayrılmada: her şey sıfırlanır, `url` bulunulan adres olur. */
  reset(url: string | null): void;
}

const FOLLOW: UrlVerdict = { kind: "follow" };
const IGNORE: UrlVerdict = { kind: "ignore" };
const NO_SUPERSEDED: ReadonlySet<string> = new Set();

export function createPendingNavigation(): PendingNavigation {
  let expected: Expected | null = null;
  let superseded: ReadonlySet<string> = NO_SUPERSEDED;
  let popstatePending = false;
  let lastUrl: string | null = null;

  function clear(): UrlVerdict {
    expected = null;
    superseded = NO_SUPERSEDED;
    return FOLLOW;
  }

  function classify(url: string, activeId: string, popped: boolean): UrlVerdict {
    if (expected === null) return FOLLOW;
    if (popped) return clear(); // (c)
    if (url === expected.url) return clear(); // (a)
    if (superseded.has(url)) return IGNORE; // (b)
    if (expected.tabId !== activeId) return clear(); // savunma: beklenen artık aktif değil
    if (!expected.reasserted) {
      expected = { ...expected, reasserted: true }; // (d) tek-sefer sınırı
      return { kind: "reassert", url: expected.url };
    }
    return clear(); // (d) ikinci yabancı URL: yönlendirme, kabul
  }

  return {
    expect(tabId, url) {
      if (expected !== null) superseded = new Set([...superseded, expected.url]);
      expected = { tabId, url: normalizeTabUrl(url), reasserted: false };
      popstatePending = false;
    },
    settle() {
      clear();
      popstatePending = false;
    },
    isPendingFor(tabId) {
      return expected !== null && !expected.reasserted && expected.tabId === tabId;
    },
    markPopstate() {
      popstatePending = true;
    },
    observe(url, activeId) {
      const popped = popstatePending;
      popstatePending = false;
      lastUrl = url;
      return classify(url, activeId, popped);
    },
    currentUrl() {
      return lastUrl;
    },
    reset(url) {
      clear();
      popstatePending = false;
      lastUrl = url;
    },
  };
}

/** Uygulama genelinde paylaşılan TEK kayıt (denetleyici yazar, senkron okur). */
export const pendingNavigation: PendingNavigation = createPendingNavigation();
