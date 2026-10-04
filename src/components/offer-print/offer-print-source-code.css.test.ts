// @vitest-environment node
// Not: diğer `*.css.test.ts` dosyalarıyla aynı gerekçe — dosya sistemi okuyan saf metin testi.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./offer-print.css", import.meta.url)), "utf8");

const LONGEST_TYPICAL_CODE_CHARS = 13; // "35.140.3195-D"
const MONO_ADVANCE_EM = 0.6;
const CELL_PADDING_PX = 12; // td padding 0 6px
const customerSource = readFileSync(fileURLToPath(new URL("./OfferCustomerPrint.tsx", import.meta.url)), "utf8");
const internalSource = readFileSync(fileURLToPath(new URL("./OfferInternalPrint.tsx", import.meta.url)), "utf8");
/** Poz sütunu yüzdesi KAYNAKTAN okunur (ilk <col> / "Poz No" başlığı). */
const customerPct = Number(customerSource.match(/<col style=\{\{ width: "([\d.]+)%" \}\} \/>/)?.[1]);
const internalPct = Number(internalSource.match(/label: "Poz No", numeric: false, width: "([\d.]+)%"/)?.[1]);
/** A4 dikey tablo ≈ 734px · A4 yatay tablo ≈ 1063px. */
const CUSTOMER_POZ_INNER_PX = (customerPct / 100) * 734 - CELL_PADDING_PX;
const INTERNAL_POZ_INNER_PX = (internalPct / 100) * 1063 - CELL_PADDING_PX;

function subLineFontPx(): number {
  const match = css.match(/\.offer-print__table \.source-code-sub--print\s*{([^}]*)}/);
  if (!match) throw new Error("kural yok: .offer-print__table .source-code-sub--print");
  const size = match[1].match(/font-size:\s*([\d.]+)px/);
  if (!size) throw new Error("font-size px yok");
  return Number(size[1]);
}

describe("offer-print.css — Bakanlık no alt satırı sığması (Q6)", () => {
  it("Poz sütunu yüzdeleri: işveren %14, iç döküm %10", () => {
    expect([customerPct, internalPct]).toEqual([14, 10]);
  });

  it("13 karakterlik kod her iki yazdırma poz sütununda TEK satıra sığar", () => {
    const width = LONGEST_TYPICAL_CODE_CHARS * MONO_ADVANCE_EM * subLineFontPx();
    expect(width).toBeLessThanOrEqual(CUSTOMER_POZ_INNER_PX);
    expect(width).toBeLessThanOrEqual(INTERNAL_POZ_INNER_PX);
  });
});
