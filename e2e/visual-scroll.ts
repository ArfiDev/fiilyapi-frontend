import { expect, type Page } from "@playwright/test";

/**
 * `fullPage` kadrajdan ÖNCE kaydırmayı sıfırlar ve OTURDUĞUNU doğrular
 * (WORKFLOW §4 "GÖRSEL SPEC KURALI" 2. parça).
 *
 * ⚠️ KÖK NEDEN 1 — PENCERE (F-PT/F-PL dersi, run 31220519552): Playwright'ın
 * `.click()`i hedefi gerekirse görünür alana KAYDIRIR; `fullPage` kadraj da
 * yapışkan kabuğu (topbar+sidebar) o ofsette basar → kare kabuğu ~200px kaymış
 * ve içeriğe binmiş yakalar.
 *
 * ⚠️ KÖK NEDEN 2 — ELEMAN KABI + YATAY EKSEN (F-P10 baseline turu, run
 * 31488352619): pencereyi sıfırlamak YETMEZ. Hedef `overflow: auto` bir kabın
 * İÇİNDEYSE (ör. puantaj matrisinin `.ts-table-scroll`ü) tıklama PENCEREYİ
 * DEĞİL O KABI kaydırır, üstelik YATAY eksende. `puantaj-hucre-popover`
 * baseline'ı tam bu yüzden çift-modluydu: bir tur "Tür" sütununu, öbür tur
 * "Toplam" sütununu basıyordu (iki varyant arasında 43k piksel fark).
 * `playwright.config.ts`te eşik ayarı olmadığı için hangi varyant baseline'a
 * girerse öbürü CI'da KIRMIZIDIR — yani görsel CI'ın yeşil geçmesi ŞANSTI.
 *
 * Bu yüzden korkuluk hem pencereyi hem de sayfadaki kaydırılabilir HER kabı,
 * İKİ EKSENDE sıfırlar. Bekleme DURUM tabanlıdır (`expect.poll`) — sabit
 * `waitForTimeout` YASAK. Kaydırılmayan sayfalarda etkisizdir (no-op), o
 * yüzden kadrajı olan her spec güvenle çağırabilir.
 *
 * `preserveScrollLeft` (SEKME-F1.7c, CEO kararı "d" — 2026-09-28): kanon
 * DEĞİŞMEDİ ("prepareFrame, toHaveScreenshot'tan hemen önceki satırdır",
 * bkz. `src/test-guards/visual-frame-guard.test.ts`) — bunun yerine BU
 * fonksiyon isteğe bağlı bir kaçış kapısı aldı. Seçenek verilmezse (varsayılan
 * `[]`) davranış BİREBİR ÖNCEKİYLE AYNI: her satırın hem `scrollLeft` hem
 * `scrollTop`u sıfırlanır. Seçenek verilirse yalnız o seçicilere uyan
 * öğelerin YATAY kaydırması (`scrollLeft`) KORUNUR — DİKEY sıfırlama
 * (`scrollTop`) ve imleç parkı bu öğeler için de AYNEN çalışır (yalnız
 * `scrollLeft` istisna). Amaç: "sona kaydırılmış" gibi kasıtlı yatay kaydırma
 * taşıyan TEK bir kare, `prepareFrame`in kalan HER garantisini (dikey sıfırlama,
 * imleç parkı, diğer TÜM kapların sıfırlanması) korurken kadraja taşınabilsin.
 */
export interface PrepareFrameOptions {
  /**
   * Bu CSS seçicilerine uyan öğelerin `scrollLeft`i sıfırlanmaz. Diğer HER
   * öğe (ve bu öğelerin `scrollTop`u) her zamanki gibi sıfırlanır.
   */
  preserveScrollLeft?: readonly string[];
}

export async function settleScrollTop(page: Page, options?: PrepareFrameOptions) {
  const preserveSelectors = options?.preserveScrollLeft ?? [];
  await page.evaluate((selectors) => {
    window.scrollTo(0, 0);
    const preserved = new Set<Element>();
    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) preserved.add(el);
    }
    for (const node of document.querySelectorAll("*")) {
      if (!preserved.has(node) && node.scrollLeft !== 0) node.scrollLeft = 0;
      if (node.scrollTop !== 0) node.scrollTop = 0;
    }
  }, preserveSelectors);
  await expect
    .poll(() =>
      page.evaluate((selectors) => {
        const preserved = new Set<Element>();
        for (const selector of selectors) {
          for (const el of document.querySelectorAll(selector)) preserved.add(el);
        }
        const offsets = [Math.round(window.scrollX), Math.round(window.scrollY)];
        for (const node of document.querySelectorAll("*")) {
          if (!preserved.has(node)) offsets.push(node.scrollLeft);
          offsets.push(node.scrollTop);
        }
        return offsets.filter((offset) => offset !== 0).length;
      }, preserveSelectors),
    )
    .toBe(0);
}

/**
 * Görsel kadrajların ORTAK penceresi (1440×900) — imleç bu pencerenin sağ-alt
 * köşesine (1439, 899) park edilir; depodaki yerleşik kanon budur ve hiçbir
 * ekranda orada etkileşimli öğe yoktur.
 *
 * ⚠️ Sabit DEĞİL, TAVANDIR: görsel spec'lerin çoğu `setViewportSize`la 1440'a
 * çıkar, ama dördü (`login-visual`, `shell-visual`, `settings-visual`,
 * `visual`) `playwright.config.ts`teki 1280×900'de kalır. Park noktası fiilî
 * pencereden türetilir — 1440'ta tam kanona (1439, 899) düşer, 1280'de ise
 * pencere DIŞINA taşmaz (taşan koordinat hover'ı temizler ama sessizce
 * "kadrajın dışına park" demektir; köşeyi ölçmek niyeti açık tutar).
 */
const VISUAL_VIEWPORT = { width: 1440, height: 900 } as const;

/** Fiilî pencerenin sağ-alt köşesi (yoksa ORTAK pencereninki). */
function cursorPark(page: Page): { x: number; y: number } {
  const viewport = page.viewportSize() ?? VISUAL_VIEWPORT;
  return { x: viewport.width - 1, y: viewport.height - 1 };
}

/**
 * Kadraj hazırlığının TEK giriş noktası: `toHaveScreenshot` çağrısından hemen
 * önce çağrılır (WORKFLOW §4 "GÖRSEL SPEC KURALI" 2. + 3. parça).
 *
 * 2. parça — KAYDIRMA: `settleScrollTop` (yukarıdaki gerekçe) pencereyi ve
 * sayfadaki kaydırılabilir HER kabı iki eksende sıfırlar.
 *
 * 3. parça — İMLEÇ PARKI (F-BC dersi, 2026-08-09): Playwright imleci son
 * tıkladığı koordinatta BIRAKIR ve altındaki öğeyi `:hover` hâlinde dondurur.
 * Girişteki "Giriş Yap" tıklaması bile sonraki sayfada o noktaya denk gelen
 * kartı hover'lı bastırabilir — F-BC baseline turunda fiilen oldu
 * (`.sdoc-card:hover` kareye sızdı). F-P10 turunda aynı sınıf oynaklık
 * `puantaj-hucre-popover` karesinde 52 piksellik kâh geçen kâh kalan farkla
 * görüldü. Kural KOŞULSUZDUR: eleman kadrajları da (`expect(locator)`) hover
 * halkası taşıyabildiği için parkı atlamaz.
 *
 * SIRA ÖNEMLİ: önce kaydırma sıfırlanır, SONRA imleç park edilir — kaydırma
 * imleci göreli olarak başka bir öğenin üstüne düşürebilir.
 *
 * Görsel spec'ler yerel `page.mouse.move(...)` YAZMAZ; bu yardımcıyı çağırır.
 */
export async function prepareFrame(page: Page, options?: PrepareFrameOptions) {
  await settleScrollTop(page, options);
  const park = cursorPark(page);
  await page.mouse.move(park.x, park.y);
}
