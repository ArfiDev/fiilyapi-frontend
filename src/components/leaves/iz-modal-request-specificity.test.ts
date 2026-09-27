// @vitest-environment node
// `modal.css.test.ts` ile aynı gerekçe (KAPSAM UYARISI aynen geçerli): bu
// dosya YALNIZCA stylesheet METNİNDE ilgili kuralın var olduğunu doğrular;
// gerçek tarayıcı CASCADE'ini DOĞRULAMAZ. jsdom'un CSS motoru ÖZGÜLLÜK
// hesaplamadan "son eşleşen kural kazanır" davranışı sergiliyor (bu turda
// ölçüldü — `.modal.iz-modal--request` ÖNCE, `.modal` SONRA yazılınca jsdom
// yine 480px veriyor, gerçek tarayıcı 600px verir); bu yüzden gerçek cascade
// doğrulaması bilerek jsdom'a YAPTIRILMAZ, yalnız METİN denetlenir.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./leaves.css", import.meta.url)), "utf8");

/**
 * K1 (ölçüldü, `leaves.css` T4 yorumu): `Modal` bileşeni `cx("modal",
 * className)` ile `class="modal iz-modal iz-modal--request"` üretir.
 * `.modal { max-width: 480px }` ve `.iz-modal--request { max-width: 600px }`
 * TEK SINIF seçiciyle yazılsaydı ÖZGÜLLÜKLERİ EŞİT olurdu; kazanan CSS YÜKLEME
 * SIRASI olurdu (`modal.css` chunk'ı `leaves.css`den SONRA gelirse 480px
 * sessizce kazanır, mockup T66 = 600px kırılır). Bileşik seçici
 * (`.modal.iz-modal--request`, iki sınıf) özgüllüğü YÜKLEME SIRASINDAN
 * BAĞIMSIZ kalıcı üstün kılar.
 */
describe("leaves.css K1 — talep diyaloğu 600px, CSS yükleme sırasından BAĞIMSIZ", () => {
  it("kural BİLEŞİK seçicidedir (`.modal.iz-modal--request`), TEK sınıf DEĞİL", () => {
    const rule = css.match(/\.modal\.iz-modal--request\s*{[^}]*}/)?.[0];
    expect(rule, "`.modal.iz-modal--request` kuralı leaves.css'te bulunamadı").toBeTruthy();
    expect(rule).toMatch(/max-width:\s*600px\s*;/);
  });

  it("kırılgan tek-sınıf yazım (`.iz-modal--request { ... }`, `.modal` öneki YOK) GERİ GELMEDİ", () => {
    // `.modal.iz-modal--request` içindeki `.iz-modal--request` alt dizesini
    // saymamak için, hemen önünde `.modal` öneki OLMAYAN bir `.iz-modal--request
    // {` deseni arıyoruz.
    const bareClassRule = /(?<!\.modal)\.iz-modal--request\s*{/;
    expect(css).not.toMatch(bareClassRule);
  });
});
