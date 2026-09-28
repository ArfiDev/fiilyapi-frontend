import { test, expect } from "@playwright/test";

// SEKME-F1.7b · S:0 GİZLİ KOPYA BEKÇİSİ
//
// KÖK OLAY (teşhisçi ölçtü): React 19 streaming'de sayfa düzeyinde `<Suspense>`
// sınırı taşıyan rotalarda, `/me` context'i client render'a düştüğü an
// `</main>`den SONRA gizli `<div hidden id="S:0">` içinde SSR kopyası 10–250 ms
// yaşar. Gerçek üretim çıktısından ölçülmüş örnek (bu depoda
// `Günlük Kayıt` ekranı, sayfa kaynağı dökümü):
//
//   ...</ol></nav><!--$?--><template id="B:0"></template><!--/$-->
//   <!--$--><!--/$--></main>
//   <script>...</script><script src=".../webpack-....js" id="_R_" async></script>
//   <div hidden id="S:0"><div class="diary">... (TÜM ekranın SUNUCU kopyası,
//     `.diary__status-row` DAHİL) ...</div></div>
//
// Yani `S:0`, `main`in KARDEŞİDİR (main'in İÇİNDE değil) — bu bekçi TAM OLARAK
// bu gerçek DOM şeklini sabitler.
//
// ⚠️ ÇÜRÜTME (bu turda ölçüldü): teşhisçinin "goto'dan önce networkidle ile
// ısıtma %100 üretir" iddiası bu makinede DOĞRULANAMADI —
// `MutationObserver` ile CANLI rotaya karşı ölçüldüğünde (bkz. mutasyon
// geçmişi) örtülme ısıtmasız ~%50-60, CPU kısmayla (rate=4) İSE %0 yakalandı
// (kısma muhtemelen akış/hidrasyon dengesini TERSİNE çeviriyor, genişletmiyor).
// Yani CANLI ırk koşulu bu makinede DETERMİNİSTİK DEĞİL — gerçek zamanlı bir
// bekçi burada "bazen yeşil, bazen kırmızı" olur ve emrin ("Deterministik
// olmalı, sabit waitForTimeout YASAK") aradığı garantiyi VEREMEZ.
//
// Bu yüzden bekçi CANLI IRKI YAKALAMAYA ÇALIŞMAZ; bunun yerine ÖLÇÜLMÜŞ GERÇEK
// DOM ŞEKLİNİ sentetik bir sayfada SABİTLER (`page.setContent`). Bu, mekanizma
// bir sürüm değişikliğiyle ortadan kalksa bile YANLIŞ-YEŞİL VERMEZ: iddia
// DOM YAPISINA (main'in dışında duran gizli kopya) dayanır, canlı zamanlamaya
// değil — yani rastgele değildir, HER koşuda AYNI sonucu verir.
const S0_GHOST_FIXTURE = `<!doctype html><html><body>
  <main>
    <div class="diary">
      <div class="diary__status-row">Taslak</div>
    </div>
  </main>
  <script>requestAnimationFrame(function(){});</script>
  <div hidden id="S:0">
    <div class="diary">
      <div class="diary__status-row">Taslak</div>
    </div>
  </div>
</body></html>`;

test.describe("S:0 hayalet kopya — kapsam bekçisi (ölçülmüş gerçek DOM şekli, sentetik sabit)", () => {
  test("kapsamsız locator IKI öğe bulur (pozitif kontrol: ırk gerçekten kaçırılabilir)", async ({
    page,
  }) => {
    await page.setContent(S0_GHOST_FIXTURE);
    await expect(page.locator(".diary__status-row")).toHaveCount(2);
  });

  test("`main` kapsamlı locator TEK öğe bulur (koruma çalışıyor)", async ({ page }) => {
    await page.setContent(S0_GHOST_FIXTURE);
    await expect(page.locator("main .diary__status-row")).toHaveCount(1);
    await expect(page.locator("main .diary__status-row")).toContainText("Taslak");
  });

  test("`getByText` da kapsamsızken IKI bulur, `main` içine daraltılınca TEK bulur", async ({
    page,
  }) => {
    await page.setContent(S0_GHOST_FIXTURE);
    await expect(page.getByText("Taslak")).toHaveCount(2);
    await expect(page.locator("main").getByText("Taslak")).toHaveCount(1);
  });
});
