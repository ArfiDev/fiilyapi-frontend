// @vitest-environment node
// Not: contracts.css.test.ts ile aynı gerekçe — dosya sistemi okuyan saf
// metin testi. KAPSAM UYARISI: bu dosya YALNIZCA stylesheet METNİNDE ilgili
// kuralın var olduğunu doğrular; cascade'i ya da tarayıcıdaki görünümü
// DOĞRULAMAZ (görsel doğrulama F-SUBPX-4 kapısının işi).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./modal.css", import.meta.url)), "utf8");

/**
 * F-SUBPX-4 (lider denetimi, ÇALIŞMA ZAMANI ölçüldü) · `.modal-overlay`
 * (`align-items:center`) `.modal`ı dikeyde ortalar. Sabit `900px` görsel
 * viewport'ta (`VISUAL_VIEWPORT`) `85vh` sınırına TAŞAN diyaloglar
 * `900*0.85=765` (TEK) yüksekliğe kilitlenip `(900-765)/2=67.5` — KESİRLİ —
 * top üretiyordu (`belge-ekle-formu` · `poz-ekle-isveren-yeni-grup` ölçüldü).
 * `align-items:center` PAYLAŞILAN ortalama davranışına DOKUNULMADI; yalnız
 * `max-height`in SONUCU en yakın ÇİFT piksele (764) aşağı yuvarlandı ki fark
 * (900-764=136) ÇİFT kalsın ve bölüm (68) TAM SAYI versin.
 */
describe("modal.css — .modal max-height tam piksel çift (F-SUBPX-4)", () => {
  it("temel kural değişmedi: `.modal` hâlâ `max-height: 85vh`dir", () => {
    const body = css.match(/\.modal\s*{[^}]*}/)?.[0] ?? "";
    expect(body).toMatch(/max-height:\s*85vh\s*;/);
  });

  it("`@supports` STATİK sorgusu içinde `round(down, 85vh, 2px)` geri düşüşü VAR", () => {
    expect(css).toMatch(
      /@supports\s*\(max-height:\s*round\(down,\s*1px,\s*1px\)\)\s*{\s*\.modal\s*{[^}]*max-height:\s*round\(down,\s*85vh,\s*2px\)\s*;[^}]*}\s*}/,
    );
  });

  it("`@supports` bloğu `.modal-overlay`ın `align-items: center`ına DOKUNMAZ", () => {
    const overlayBody = css.match(/\.modal-overlay\s*{[^}]*}/)?.[0] ?? "";
    expect(overlayBody).toMatch(/align-items:\s*center\s*;/);
  });

  it("IACVT tuzağı YOK: `@supports` bloğunun DIŞINDA ikinci çıplak `round()` bildirimi yazılmadı", () => {
    // `@supports` KOŞULUNUN kendisi ve İÇİNDEKİ tek bildirim olmak üzere
    // TOPLAM iki `round(` beklenir (yorumlar HARİÇ) — F-SUBPX-3'te ölçülen
    // tuzak: art arda iki ÇIPLAK bildirim (`max-height: 85vh; max-height:
    // round(...)`, `@supports` OLMADAN) round() desteklemeyen tarayıcıda
    // IACVT ile `auto`ya düşer, diyalog kaybolur. Bu yüzden `@supports`
    // BLOĞUNUN DIŞINDA (temel `.modal` kuralının içinde) `round(` GEÇMEMELİ.
    const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const roundUsages = cssWithoutComments.match(/round\(/g) ?? [];
    expect(roundUsages).toHaveLength(2);

    const [beforeSupports] = cssWithoutComments.split("@supports");
    expect(beforeSupports).not.toMatch(/round\(/);
  });
});
