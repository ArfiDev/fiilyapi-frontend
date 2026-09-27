// TYPE-F1 SPIKE — negatif tipi testleri (tsc'nin KENDİSİYLE, @ts-expect-error).
//
// LİDER ÖLÇÜM VARYANTI (2026-09-27) — "yumuşak brand" (`__scale?:` opsiyonel):
// düz `string` artık BİLİNÇLİ olarak Fraction/Percent'e atanabilir (fixture'lar
// ve DeepScale'lenmemiş modeller kırılmasın diye) — bu YENİDEN AÇILAN bir kapı
// DEĞİL, ölçülmüş bir ödünleşim: FIX-F1 Kusur 1'in asıl yakalanması gereken
// hatası "kesir yerine yüzde" karışıklığıdır (Percent↔Fraction), "elde string
// var, kanıtsız fraction/percent sayıyoruz" değil. Bu yüzden testin ASIL
// bekçisi 2) ve 3): Percent→Fraction ve Fraction→Percent HÂLÂ tsc hatası.
//
// Bu dosya runtime'da HİÇBİR ŞEY test etmez (tek `it` yalnız vitest'in dosyayı
// atlamaması için) — asıl bekçi `npx tsc --noEmit`in KENDİSİDİR: aşağıdaki
// `@ts-expect-error` yorumlarından biri "kullanılmadı" (hatasız derlendi)
// olursa tsc bunu KENDİSİ bir hata olarak raporlar (TS2578) — bu da testin
// gerçekten ÇALIŞTIĞININ kanıtıdır (emir §5).
import { describe, it, expect } from "vitest";

import { formatPercent01 } from "@/lib/earned-value";
import { progressBarWidth } from "@/components/earned-value/reports/panel/panel-kpi-format";
import { formatPercent } from "@/lib/format";
import { asFraction, asPercent, type Fraction, type Percent } from "./scale";

describe("TYPE-F1 SPIKE · Fraction/Percent marka tipleri (derleyici bekçisi, yumuşak brand)", () => {
  it("bu test yalnız yukarıdaki @ts-expect-error yorumlarının GERÇEKTEN gerekli olduğunu kanıtlar", () => {
    expect(true).toBe(true);
  });
});

// Bu fonksiyon HİÇBİR ZAMAN çağrılmaz (runtime'da ReferenceError/side-effect
// olmasın diye) — yalnız `tsc --noEmit`in TİP KONTROLÜ için gövdesi taranır.
function typeOnlyAssertions(): void {
  const rawString: string = "";
  const percentValue = "" as unknown as Percent;
  const fractionValue = "" as unknown as Fraction;

  // 1) Düz `string` → formatPercent01 KABUL (BİLİNÇLİ ödünleşim, yumuşak brand).
  //    Sert varyantta bu satır HATA veriyordu — yumuşak varyantın maliyeti BUDUR
  //    (bkz. rapor: fixture/write-payload uyumluluğu için etiket zorunlu değil).
  formatPercent01(rawString);

  // 2) `Percent` → formatPercent01 (Fraction bekler) HÂLÂ HATA — asıl FIX-F1
  //    Kusur 1 (kesri yüzde sanıp/yüzdeyi kesir yerine geçirme) BURADA yakalanır.
  // @ts-expect-error — Percent, Fraction'a GEÇİRİLEMEZ (etiket literal'leri çakışır).
  formatPercent01(percentValue);

  // 3) `Fraction` → progressBarWidth OK (aynı yönde, doğru akış).
  progressBarWidth(fractionValue);

  // 3b) `Percent` → progressBarWidth (Fraction bekler) HÂLÂ HATA (ters yön de kapalı).
  // @ts-expect-error — Percent, Fraction'a GEÇİRİLEMEZ.
  progressBarWidth(percentValue);

  // 4) FAZ 2 · `Fraction` → formatPercent (Percent bekler) HÂLÂ HATA — asıl
  //    korunan sınıf: kesri yanlışlıkla yüzde biçimlendiricisine vermek
  //    (ör. `item.completion_ratio`'yu `toCompletionPercent(...)` ATLAYIP
  //    doğrudan `formatPercent`e geçirmek — bkz. mutant kanıtı, DiarySummaryAccrualTable).
  // @ts-expect-error — Fraction, Percent'e GEÇİRİLEMEZ.
  formatPercent(fractionValue);

  // Ek: kaçışların KENDİSİ (asFraction/asPercent) her iki yöne de izin verir —
  // bu, "tek açık kaçış" olduklarının kanıtı.
  const viaEscape: Fraction = asFraction(rawString);
  const viaEscape2: Percent = asPercent(rawString);
  void viaEscape;
  void viaEscape2;
}
void typeOnlyAssertions;
