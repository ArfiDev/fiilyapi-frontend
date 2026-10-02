// @vitest-environment node
import { describe, expect, it } from "vitest";

import golden from "./convert-total.golden.json";
import {
  CONVERT_AMOUNT_LIMIT,
  diffPercent,
  grossWithVat,
  isOverAmountLimit,
  lineAmount,
  sumAmounts,
} from "./convert-money";

/**
 * 🔴 GOLDEN (TKL-F5.2): `convert-total.golden.json` backend `convert_service._item_total`/`_money` KAYNAĞINDAN üretilir
 * (`convert_total_golden.py`, scratchpad f52-bak; kalıcı yeri CEO belirler) — elle sayı YOK. Σ eşitliği = sunucunun yazacağı sözleşme bedeli.
 */
describe("golden: satır tutarı = ROUND_HALF_UP(miktar × B.F., 0,01) (backend _money)", () => {
  it("üretici kaynağı ve vektör sayısı", () => {
    expect(golden.source.file).toBe("app/modules/offers/convert_service.py");
    expect(golden.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(golden.single.length).toBeGreaterThanOrEqual(300);
    expect(golden.sums.length).toBeGreaterThanOrEqual(100);
  });

  it.each(golden.single.map((v, i) => [i, v] as const))("tekil vektör #%i", (_i, v) => {
    expect(lineAmount(v.quantity, v.unit_price)).toBe(v.total);
  });

  it("tam yarım (…5 sınırı) yukarı yuvarlanır: 0,005 × 1,00 = 0,01 (HALF_EVEN 0,00 olurdu)", () => {
    expect(lineAmount("0.005", "1.00")).toBe("0.01");
    expect(lineAmount("0.005", "0.50")).toBe("0.00");
    expect(lineAmount("2.500", "0.01")).toBe("0.03");
  });
});

describe("golden: Σ satır tutarı = sözleşme bedeli (backend _item_total, satır başı yuvarlama)", () => {
  it.each(golden.sums.map((v, i) => [i, v] as const))("toplam vektörü #%i", (_i, v) => {
    const amounts = v.items.map((item) => lineAmount(item.quantity, item.unit_price));
    expect(sumAmounts(amounts)).toBe(v.total);
  });

  it("toplamda yuvarlamak FARKLI sonuç verir (satır başı şart): 3 × (0,005 × 1,00)", () => {
    const perLine = sumAmounts(["0.005", "0.005", "0.005"].map((q) => lineAmount(q, "1.00")));
    expect(perLine).toBe("0.03");
  });
});

describe("tavan: Σ ≥ 10^16 sunucuda 422 (AMOUNT_TOO_LARGE)", () => {
  it("sınır değeri backend _AMOUNT_LIMIT ile aynı", () => {
    expect(CONVERT_AMOUNT_LIMIT).toBe(golden.source.limit);
  });
  it("sınırın altı geçerli, sınır ve üstü aşım", () => {
    expect(isOverAmountLimit("9999999999999999.99")).toBe(false);
    expect(isOverAmountLimit("10000000000000000.00")).toBe(true);
    expect(isOverAmountLimit("11000000000000000000000.00")).toBe(true);
  });
});

describe("fark % (1 kesir, ROUND_HALF_UP; teklif 0 → null = '—')", () => {
  it.each([
    ["100.00", "96.55", "-3.5"],
    ["100.00", "103.00", "3.0"],
    ["100.00", "100.00", "0.0"],
    ["200.00", "200.10", "0.1"],
    ["300.00", "299.85", "-0.1"],
    ["1000.00", "1000.50", "0.1"],
  ])("teklif %s → sözleşme %s = %s", (offer, contract, expected) => {
    expect(diffPercent(offer, contract)).toBe(expected);
  });
  it("teklif 0 → null (0,0 BASILMAZ)", () => {
    expect(diffPercent("0", "50.00")).toBeNull();
    expect(diffPercent("0.00", "0.00")).toBeNull();
  });
});

describe("KDV dahil = ROUND(Σ × (1 + KDV))", () => {
  it.each([
    ["100.00", "20.00", "120.00"],
    ["0.05", "20.00", "0.06"],
    ["0.03", "18.50", "0.04"],
    ["1000.01", "10.00", "1100.01"],
    ["73982140.00", "20.00", "88778568.00"],
    ["0.00", "20.00", "0.00"],
    ["50.00", "0.00", "50.00"],
  ])("Σ %s KDV %s → %s", (net, vat, expected) => {
    expect(grossWithVat(net, vat)).toBe(expected);
  });
});
