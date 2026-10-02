// @vitest-environment node
//
// 🔴🔴 TEST İKİZİNİN DÖNÜŞ TİPİ BEKÇİSİ — `e2e/mock-backend.ts`.
//
// GEREKÇE ÖLÇÜLDÜ. `mock-backend.ts` bu deponun test ikizidir: e2e testleri
// gerçek backend'e değil ona konuşur. Bir üreticinin dönüş tipi yazılmamışsa
// TypeScript o gövdeyi SÖZLEŞMEYLE HİÇ KARŞILAŞTIRMAZ — ikiz sözleşmeden
// saptığında dört kapının dördü de yeşil kalır.
//
// Sınıfın canlı bedeli: F-MKD diliminde `equipment_id` süzgeci ikizin iki
// ucunda eksikti ve ekran FİLONUN TOPLAM YAKITINI tek makinenin tüketimi gibi
// bastı; kusuru yalnız kareye BAKMAK gösterdi. Kanon (K-MKD2): **bir
// süzgeç/korkuluk İKİZDE yoksa, olmadığını hiçbir kapı söylemez.**
//
// Bu bekçi tipsiz üreticiyi DERLEME ZAMANINA taşır: yeni bir üretici tipsiz
// eklenirse burada kırmızı verir.
//
// ⚠️ NE YAPMAZ: sözleşme kısıtı (`maximum`/`pattern`/`minLength`) üretilen TS
// tipinde YAŞAMAZ. Tip bağlamak korkuluk bağlamak DEĞİLDİR; o iş
// `form-limits.contract.test.ts`in kaydındadır.
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const TWIN = path.join(process.cwd(), "e2e", "mock-backend.ts");

/**
 * TKL-F3.2 · teklif sahte backend'i `mock-backend.ts`ten AYRI dosyalardadır (tek giriş noktası
 * `handleOffers`); AYNI bekçi onları da tarar — yanıt üreticilerinin dönüş tipi openapi'ye
 * (`components["schemas"]["Offer…"]`) bağlıdır, tipsiz üretici sözleşmeyle HİÇ karşılaşmaz.
 */
const TWIN_FILES: readonly string[] = [
  TWIN,
  path.join(process.cwd(), "e2e", "mock-offers.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-service.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-views.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-calc.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-body.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-seed.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-types.ts"),
  // TKL-F4.4: şablon ikizi + oluşturma kaynakları + (taşınan) hata/doğrulama yardımcıları.
  path.join(process.cwd(), "e2e", "mock-offer-templates.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-create-sources.ts"),
  path.join(process.cwd(), "e2e", "mock-offer-guards.ts"),
  // TKL-F5.1: teklif → proje dönüştürme ikizi (`POST /offers/{id}/convert`).
  path.join(process.cwd(), "e2e", "mock-offer-convert.ts"),
];

interface TwinFunction {
  readonly name: string;
  readonly line: number;
  readonly file: string;
  readonly returnType: string | null;
}

/** İkizi DİSKTEN okur ve AST'den fonksiyon bildirimlerini toplar. */
function twinFunctions(): readonly TwinFunction[] {
  const found: TwinFunction[] = [];
  for (const file of TWIN_FILES) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.ESNext, true);
    const visit = (node: ts.Node): void => {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
        found.push({
          name: node.name.text,
          line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          file: path.basename(file),
          returnType: node.type === undefined ? null : node.type.getText(),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

const FUNCTIONS = twinFunctions();

/* ═══════════ SÖZLEŞMEDEN SAPAN ÜRETİCİLER — AÇIK BORÇ KAYDI ════════════════
 * 🔴 Buraya YALNIZ tipi bağlanmaya ÇALIŞILMIŞ ve `typecheck` KIRMIZI VERMİŞ
 * bir üretici yazılır. Kırmızı bir kusur değil, **ikizin sözleşmeden
 * saptığının kanıtıdır**. Sapmayı `as any` ile gizlemek yerine gerekçesiyle
 * buraya yazılır.
 *
 * 🔑 KAYIT İKİ YÖNLÜ ÇALIŞIR: bir ad buraya yazılıp da o üretici SONRADAN
 * tiplenirse (ya da adı değişirse) bu dosya KIRMIZI verir — bayat kayıt
 * sessizce birikemez.
 *
 * 🟢 KAYIT ŞU AN BOŞ ve boş olması DOĞRU HÂLDİR: TB-MOCKTIP'in yazdığı DOKUZ
 * sapmanın DOKUZU da TB-IKIZ'de kapatıldı (bordronun üç gelir vergisi alanı +
 * `unknown_tax_count` · `SiteDetailResponse`in 16 zorunlu alanı · dört enum).
 * Boşluk bekçiyi zayıflatmaz, TERSİNE en sıkı hâline getirir: kayıtta hiçbir ad
 * olmadığı için tipsiz EKLENEN her üretici doğrudan kırmızı verir.
 *
 * Bir adı buradan silmenin TEK yolu sapmayı gerçekten kapatmaktır. Sapmaların
 * çoğu ikizin DÖNDÜRDÜĞÜ VERİYİ değiştirir; o bir davranış değişikliğidir ve
 * kendi diliminde, kare ölçümüyle yapılır.
 * ========================================================================= */
const SOZLESMEDEN_SAPAN: Readonly<Record<string, string>> = {};

describe("🔴 test ikizi (`e2e/mock-backend.ts`) dönüş tipleri ↔ sözleşme", () => {
  it("bekçi GERÇEKTEN ölçüyor (boş küme sessizce yeşil geçemez)", () => {
    // 🔴 Kapsam korkuluğu: AST taraması bozulursa (dosya taşınır, `ts` API'si
    // değişir, üretici deseni kırılır) aşağıdaki `it`ler BOŞ küme üzerinde
    // koşar ve dosya "yeşil" görünürdü — bekçinin KENDİSİ sahte-yeşile
    // düşerdi. Sayılar 2026-08-26'da ÖLÇÜLMÜŞTÜR; aşağı inerlerse tarama
    // bozulmuş demektir.
    expect(FUNCTIONS.length, "ikizdeki fonksiyon bildirimi sayısı").toBeGreaterThanOrEqual(195);
    const bound = FUNCTIONS.filter(
      (fn) => fn.returnType !== null && fn.returnType.includes('components["schemas"]'),
    );
    expect(bound.length, "sözleşme tipine BAĞLI dönüş tipi sayısı").toBeGreaterThanOrEqual(60);
  });

  it("her fonksiyonun dönüş tipi YAZILIDIR (kayıttakiler hariç)", () => {
    const untyped = FUNCTIONS.filter(
      (fn) => fn.returnType === null && SOZLESMEDEN_SAPAN[fn.name] === undefined,
    ).map((fn) => `${fn.name} (${fn.file}:${fn.line})`);
    expect(
      untyped,
      "dönüş tipi YAZILMAMIŞ fonksiyon(lar) — tipsiz üretici sözleşmeyle HİÇ " +
        "karşılaştırılmaz, ikiz sapsa bile dört kapı yeşil kalır. Tipi " +
        "`components[\"schemas\"][...]`e bağla; bağlayınca `typecheck` kırmızı " +
        "veriyorsa bu SENİN kusurun DEĞİL, ikizin sapmasının kanıtıdır — " +
        "`SOZLESMEDEN_SAPAN` kaydına GEREKÇESİYLE yaz.",
    ).toEqual([]);
  });

  it("borç kaydında BAYAT ad yoktur (kayıt iki yönlü)", () => {
    const byName = new Map(FUNCTIONS.map((fn) => [fn.name, fn]));
    const stale: string[] = [];
    for (const name of Object.keys(SOZLESMEDEN_SAPAN)) {
      const fn = byName.get(name);
      if (fn === undefined) {
        stale.push(`${name}: ikizde BÖYLE BİR FONKSİYON YOK (silinmiş/yeniden adlandırılmış)`);
        continue;
      }
      if (fn.returnType !== null) {
        stale.push(`${name}: artık tipli (\`${fn.returnType}\`) — kayıttan SİL`);
      }
    }
    expect(
      stale,
      "borç kaydı gerçeklikten ayrıştı — tek yönlü bekçi bunu göremezdi: " +
        "kapatılmış bir sapma kayıtta kalırsa borç OLDUĞUNDAN BÜYÜK görünür.",
    ).toEqual([]);
  });

  it("her kayıt satırı GEREKÇE taşır (susturma değil, karar)", () => {
    const bare = Object.entries(SOZLESMEDEN_SAPAN)
      .filter(([, reason]) => reason.trim().length < 30)
      .map(([name]) => name);
    expect(bare, "gerekçesiz kayıt = susturma").toEqual([]);
  });
});
