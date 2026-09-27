import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// SEKME-F1.7c · `prepareFrame`in `preserveScrollLeft` seçeneği — CEO kararı
// "d" (2026-09-28): kanon DEĞİŞMEDİ (`prepareFrame` her zaman `toHaveScreenshot`
// öncesindeki son satır kalır, bkz. `src/test-guards/visual-frame-guard.test.ts`)
// — bunun yerine `prepareFrame`/`settleScrollTop` isteğe bağlı bir kaçış
// kapısı ALDI (`visual-scroll.ts`).
//
// Bu dosya `page.setContent` ile sentetik bir sayfa kurar (gerçek giriş/backend
// gerekmez) ve iki şeyi ÖLÇER:
//  1) Seçenek VERİLMEZSE davranış BİREBİR ÖNCEKİYLE AYNI (her yatay/dikey
//     kaydırma sıfırlanır) — "varsayılan bozulmadı" kanıtı.
//  2) Seçenek VERİLİRSE yalnız o seçiciye uyan öğenin YATAY kaydırması
//     korunur, dikey kaydırması VE başka bir kabın yatay kaydırması yine
//     sıfırlanır.
//
// MUTASYON KANITI (liderin 2. isteği): `preserveScrollLeft` KALDIRILINCA
// (yani düz `prepareFrame(page)` çağrılınca) `workspace-tabs-visual.spec.ts`
// "10 sekme sona kaydırılmış" senaryosunun tam kurduğu durum — yatay
// kaydırılmış bir `.workspace-tabs__list` benzeri kap — sıfırlanır. Kareyi
// (screenshot) yerelde karşılaştıramadığımız için (baseline yalnız Linux'ta)
// kırmızı DOĞRUDAN piksel farkıyla gösterilemez; bunun yerine kadraj ANINDAKİ
// `scrollLeft`i ölçen `toBe(0)` iddiasıyla kanıtlanır — bu, gerçek spec'te
// `expect.poll(...).toBe(true)` iddiasının (scrollLeft > 0) TAM TERSİNİ,
// yani `preserveScrollLeft` olmadan o iddianın KIRMIZI olacağını gösterir.
const SCROLLED_STRIP_FIXTURE = `<!doctype html><html><body>
  <div class="workspace-tabs">
    <div class="workspace-tabs__list" style="display:flex; width:200px; overflow-x:auto;">
      <div style="flex:0 0 400px; height:20px;">dolgu</div>
      <div style="flex:0 0 400px; height:20px;">dolgu</div>
    </div>
  </div>
  <div class="other-scroller" style="width:100px; height:50px; overflow:auto;">
    <div style="width:400px; height:400px;">baska kap</div>
  </div>
</body></html>`;

test.describe("prepareFrame — preserveScrollLeft seceneği", () => {
  test("seçenek VERİLMEZSE davranış birebir öncekiyle aynı (her iki eksen sıfırlanır)", async ({
    page,
  }) => {
    await page.setContent(SCROLLED_STRIP_FIXTURE);
    await page.evaluate(() => {
      const list = document.querySelector(".workspace-tabs__list");
      if (list) list.scrollLeft = 150;
      const other = document.querySelector(".other-scroller");
      if (other) {
        other.scrollLeft = 80;
        other.scrollTop = 30;
      }
    });

    // MUTASYON KANITI (İş 1'in "preserveScrollLeft kaldırılınca kırmızı"
    // gereksinimi): seçenek OLMADAN çağrı — gerçek spec'te bu, poll
    // iddiasının (`scrollLeft > 0`) KIRMIZIYA düşmesine denk gelir.
    await prepareFrame(page);

    const listScrollLeft = await page.evaluate(
      () => document.querySelector(".workspace-tabs__list")?.scrollLeft ?? -1,
    );
    expect(listScrollLeft).toBe(0);

    const otherScrollLeft = await page.evaluate(
      () => document.querySelector(".other-scroller")?.scrollLeft ?? -1,
    );
    const otherScrollTop = await page.evaluate(
      () => document.querySelector(".other-scroller")?.scrollTop ?? -1,
    );
    expect(otherScrollLeft).toBe(0);
    expect(otherScrollTop).toBe(0);
  });

  test("preserveScrollLeft VERİLİRSE yalnız o seçicinin yatay kaydırması korunur", async ({
    page,
  }) => {
    await page.setContent(SCROLLED_STRIP_FIXTURE);
    await page.evaluate(() => {
      const list = document.querySelector(".workspace-tabs__list");
      if (list) {
        list.scrollLeft = 150;
        list.scrollTop = 5; // gerçekte yatay-yalnız bir kap ama dikey de ölçülsün
      }
      const other = document.querySelector(".other-scroller");
      if (other) other.scrollLeft = 80;
    });

    await prepareFrame(page, { preserveScrollLeft: [".workspace-tabs__list"] });

    const list = await page.evaluate(() => {
      const el = document.querySelector(".workspace-tabs__list");
      return { scrollLeft: el?.scrollLeft ?? -1, scrollTop: el?.scrollTop ?? -1 };
    });
    // Yatay KORUNDU (mutasyonun tam tersi — bu ÜST test yeşil, önceki test
    // aynı kurulumla ama seçeneksiz KIRMIZI olurdu).
    expect(list.scrollLeft).toBe(150);
    // Dikey yine SIFIRLANDI — yalnız scrollLeft istisna.
    expect(list.scrollTop).toBe(0);

    // Seçiciye UYMAYAN başka bir kap yine sıfırlanır.
    const otherScrollLeft = await page.evaluate(
      () => document.querySelector(".other-scroller")?.scrollLeft ?? -1,
    );
    expect(otherScrollLeft).toBe(0);
  });
});
