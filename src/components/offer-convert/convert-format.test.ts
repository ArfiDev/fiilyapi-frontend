import { describe, expect, it } from "vitest";

import { diffPctText, rowDiffView, rowTagLabel, signedMoney } from "./convert-format";

/** TKL-F5.3 · özet/satır GÖSTERİM metinleri (mockup `sg()/tl()/nf()` — TDN:234-241,218-221); Decimal metin, `Number()` yok. */

describe("signedMoney (mockup sg(D) + tl(|D|), gerçek eksi U+2212)", () => {
  it("negatif −, pozitif +, sıfır işaretsiz", () => {
    expect(signedMoney("-11899452.00")).toBe("−₺11.899.452,00");
    expect(signedMoney("595200.00")).toBe("+₺595.200,00");
    expect(signedMoney("0.00")).toBe("₺0,00");
  });
});

describe("diffPctText", () => {
  it("işaret + % + 1 kesir virgüllü; null → —", () => {
    expect(diffPctText("-21.4")).toBe("−%21,4");
    expect(diffPctText("3.0")).toBe("+%3,0");
    expect(diffPctText("0.0")).toBe("%0,0");
    expect(diffPctText(null)).toBe("—");
  });
});

describe("rowDiffView (TDN:218)", () => {
  it("çıkarıldı / yeni / = / ↓ / ↑ / hesaplanamıyor", () => {
    expect(rowDiffView({ kind: "excluded" })).toEqual({ text: "çıkarıldı", tone: "muted" });
    expect(rowDiffView({ kind: "new" })).toEqual({ text: "+ yeni", tone: "primary" });
    expect(rowDiffView({ kind: "same" })).toEqual({ text: "=", tone: "quiet" });
    expect(rowDiffView({ kind: "down", pct: "3.5" })).toEqual({ text: "↓ %3,5", tone: "danger" });
    expect(rowDiffView({ kind: "up", pct: "12.0" })).toEqual({ text: "↑ %12,0", tone: "success" });
    expect(rowDiffView({ kind: "none" })).toEqual({ text: "—", tone: "quiet" });
  });
});

describe("rowTagLabel (TDN:221)", () => {
  it("dört etiket; değişmemiş satır null", () => {
    expect(rowTagLabel("new")).toBe("Yeni");
    expect(rowTagLabel("excluded")).toBe("Çıkarıldı");
    expect(rowTagLabel("price")).toBe("Fiyat değişti");
    expect(rowTagLabel("quantity")).toBe("Miktar değişti");
    expect(rowTagLabel(null)).toBeNull();
  });
});
