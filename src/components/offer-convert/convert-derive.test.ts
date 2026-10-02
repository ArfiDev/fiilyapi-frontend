// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DEMIR, DISCIPLINE_BY_CATALOG, SIVA, makeWonRevision } from "./convert-fixtures";
import { addFromCatalog, rowsFromRevision, setBf, setQty, toggleIncluded } from "./convert-model";
import { parsedRow, rowContractAmount, rowDiff, rowTag, summarize } from "./convert-derive";
import type { ConvertDraft, ConvertRow } from "./convert-types";

const base = (): ConvertDraft => rowsFromRevision(makeWonRevision(), DISCIPLINE_BY_CATALOG);
const row = (draft: ConvertDraft, key: string): ConvertRow => {
  const found = draft.rows.find((r) => r.key === key);
  if (!found) throw new Error(`satır yok: ${key}`);
  return found;
};

describe("rowContractAmount = ROUND_HALF_UP(miktar × B.F., 0,01) — backend _item_total ile aynı satır kuralı", () => {
  it("teklif değerleriyle açılışta teklif tutarına eşit", () => {
    expect(rowContractAmount(row(base(), "o:it-1"))).toBe("1288.00");
    expect(rowContractAmount(row(base(), "o:it-3"))).toBe("5000.00");
  });
  it("düzenlenen kutular: 12,5 × 128,80 = 1610.00; 0,005 × 1 = 0.01 (yarım yukarı)", () => {
    expect(rowContractAmount(row(setQty(base(), "o:it-1", "12,5"), "o:it-1"))).toBe("1610.00");
    const half = setBf(setQty(base(), "o:it-1", "0,005"), "o:it-1", "1");
    expect(rowContractAmount(row(half, "o:it-1"))).toBe("0.01");
  });
  it("🔴 fiyatsız satırın B.F.'si boşken tutar YOK (null) — 0 varsayılmaz", () => {
    expect(rowContractAmount(row(base(), "o:it-2"))).toBeNull();
  });
  it("geçersiz kutu → null; çıkarılmış satır → 0.00", () => {
    expect(rowContractAmount(row(setBf(base(), "o:it-1", "28.5"), "o:it-1"))).toBeNull();
    expect(rowContractAmount(row(setBf(base(), "o:it-1", "128,805"), "o:it-1"))).toBeNull();
    expect(rowContractAmount(row(toggleIncluded(base(), "o:it-1"), "o:it-1"))).toBe("0.00");
  });
  it("parsedRow iki kutuyu ayrı ayrı ayrıştırır", () => {
    const parsed = parsedRow(row(base(), "o:it-2"));
    expect(parsed.qty).toEqual({ ok: true, value: "2" });
    expect(parsed.bf).toEqual({ ok: false, message: "Birim fiyat girin" });
  });
});

describe("rowTag (TDN:268): yeni / çıkarıldı / fiyat önce / miktar", () => {
  it("değişmeyen satır etiketsiz", () => {
    expect(rowTag(row(base(), "o:it-1"))).toBeNull();
  });
  it("aynı sayı başka yazımla DEĞİŞİKLİK değildir (10 = 10,000 · 128,80 = 128,8)", () => {
    const same = setBf(setQty(base(), "o:it-1", "10,000"), "o:it-1", "128,8");
    expect(rowTag(row(same, "o:it-1"))).toBeNull();
  });
  it("miktar değişti / fiyat değişti / ikisi birden = FİYAT önce", () => {
    expect(rowTag(row(setQty(base(), "o:it-1", "11"), "o:it-1"))).toBe("quantity");
    expect(rowTag(row(setBf(base(), "o:it-1", "130"), "o:it-1"))).toBe("price");
    const both = setBf(setQty(base(), "o:it-1", "11"), "o:it-1", "130");
    expect(rowTag(row(both, "o:it-1"))).toBe("price");
  });
  it("çıkarılmış satır 'excluded' (değişiklik olsa da); yeni satır 'new'", () => {
    const out = toggleIncluded(setQty(base(), "o:it-1", "11"), "o:it-1");
    expect(rowTag(row(out, "o:it-1"))).toBe("excluded");
    expect(rowTag(row(addFromCatalog(base(), "g:g-ince", [SIVA]), "n:0"))).toBe("new");
  });
  it("fiyatsız teklif kalemine B.F. girmek = fiyat değişti; geçersiz miktar = değişti sayılır", () => {
    expect(rowTag(row(setBf(base(), "o:it-2", "100"), "o:it-2"))).toBe("price");
    expect(rowTag(row(setQty(base(), "o:it-1", "abc"), "o:it-1"))).toBe("quantity");
  });
});

describe("rowDiff (TDN:276-289): rozet türü + % (1 kesir, mutlak değer)", () => {
  it("çıkarıldı / yeni", () => {
    expect(rowDiff(row(toggleIncluded(base(), "o:it-1"), "o:it-1"))).toEqual({ kind: "excluded" });
    expect(rowDiff(row(addFromCatalog(base(), "g:g-ince", [DEMIR]), "n:0"))).toEqual({ kind: "new" });
  });
  it("aynı → same; düşüş → down %3,0; artış → up %8,7", () => {
    expect(rowDiff(row(base(), "o:it-1"))).toEqual({ kind: "same" });
    expect(rowDiff(row(setBf(base(), "o:it-1", "125"), "o:it-1"))).toEqual({ kind: "down", pct: "3.0" });
    expect(rowDiff(row(setBf(base(), "o:it-1", "140"), "o:it-1"))).toEqual({ kind: "up", pct: "8.7" });
  });
  it("yüzde 0,0'a yuvarlanırsa 'same'", () => {
    expect(rowDiff(row(setBf(base(), "o:it-1", "128,81"), "o:it-1"))).toEqual({ kind: "same" });
  });
  it("🔴 teklif tutarı 0 (fiyatsız) → 'none' (—), '0,0' ya da sonsuz % BASILMAZ", () => {
    expect(rowDiff(row(setBf(base(), "o:it-2", "100"), "o:it-2"))).toEqual({ kind: "none" });
  });
  it("geçersiz kutu → none", () => {
    expect(rowDiff(row(setBf(base(), "o:it-1", "x"), "o:it-1"))).toEqual({ kind: "none" });
  });
});

describe("summarize (TDN:291-301)", () => {
  const priced = (): ConvertDraft => setBf(base(), "o:it-2", "100");

  it("açılış: teklif tutarı = revizyon net'i; fiyatsız B.F. boş → hasInvalid", () => {
    const s = summarize(base(), "20.00");
    expect(s.offerTotal).toBe("6288.00");
    expect(s.contractTotal).toBe("6288.00");
    expect(s.hasInvalid).toBe(true);
    expect(s.includedCount).toBe(3);
  });

  it("fiyatsız kaleme B.F. girilince: Σ, fark, %, KDV dahil, sayaçlar", () => {
    const s = summarize(priced(), "20.00");
    expect(s).toEqual({
      offerTotal: "6288.00",
      contractTotal: "6488.00",
      difference: "200.00",
      diffPct: "3.2",
      includedCount: 3,
      excludedCount: 0,
      changedCount: 1,
      newCount: 0,
      excludedOfferTotal: "0.00",
      changedDelta: "200.00",
      newTotal: "0.00",
      contractGross: "7785.60",
      hasInvalid: false,
    });
  });

  it("çıkarılan + değişen + yeni birlikte", () => {
    let draft = priced();
    draft = toggleIncluded(draft, "o:it-1");
    draft = setQty(draft, "o:it-3", "90");
    draft = addFromCatalog(draft, "g:g-ince", [SIVA]);
    draft = setBf(setQty(draft, "n:0", "10"), "n:0", "60");
    const s = summarize(draft, "20.00");
    expect(s).toMatchObject({
      offerTotal: "6288.00",
      contractTotal: "5300.00", // it-2 200 + it-3 4500 + yeni 600
      difference: "-988.00",
      diffPct: "-15.7",
      includedCount: 3 + 1 - 1,
      excludedCount: 1,
      changedCount: 2, // it-2 (fiyat girildi) + it-3 (miktar)
      newCount: 1,
      excludedOfferTotal: "1288.00",
      changedDelta: "-300.00", // (+200) + (-500)
      newTotal: "600.00",
      contractGross: "6360.00",
    });
  });

  it("🔴 teklif toplamı 0 → diffPct null ('—')", () => {
    const revision = makeWonRevision();
    const zero = rowsFromRevision({
      ...revision,
      groups: [{ ...revision.groups[0]!, items: [revision.groups[0]!.items[1]!] }],
    });
    const s = summarize(setBf(zero, "o:it-2", "10"), "20.00");
    expect(s.offerTotal).toBe("0.00");
    expect(s.diffPct).toBeNull();
  });

  it("geçersiz dahil satır Σ'ya girmez ama hasInvalid işaretlenir; tüm satırlar çıkarılırsa Σ 0", () => {
    const s = summarize(setBf(priced(), "o:it-1", "28.5"), "20.00");
    expect(s.hasInvalid).toBe(true);
    expect(s.contractTotal).toBe("5200.00");
    const none = summarize(toggleIncluded(toggleIncluded(toggleIncluded(priced(), "o:it-1"), "o:it-2"), "o:it-3"), "20.00");
    expect(none.contractTotal).toBe("0.00");
    expect(none.includedCount).toBe(0);
    expect(none.hasInvalid).toBe(false);
  });
});
