// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BETON, DEMIR, DISCIPLINE_BY_CATALOG, SIVA, makeWonRevision } from "./convert-fixtures";
import { addCatalogEntries, addFromCatalog, applyCatalogEntries, addGroup, toggleIncluded, rowsFromRevision } from "./convert-model";
import { parseQty, parseUnitPrice } from "./convert-parse";
import type { ConvertDraft } from "./convert-types";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as object).forEach(deepFreeze);
  }
  return value;
}

const baseDraft = (): ConvertDraft => deepFreeze(rowsFromRevision(makeWonRevision(), DISCIPLINE_BY_CATALOG));
const rowOf = (draft: ConvertDraft, key: string) => draft.rows.find((row) => row.key === key);

describe("TKL-F5.4 · addFromCatalog: seçicide girilen değerler", () => {
  it("🔴 değerler verilirse kutular onlarla dolar (miktar + B.F. metni AYNEN); verilmeyen kalem eski varsayılanı korur", () => {
    const values = new Map([[DEMIR.id, { qtyRaw: "12,5", bfRaw: "30.000,00" }]]);
    const draft = addFromCatalog(baseDraft(), "g:g-ince", [DEMIR, BETON], values);
    expect(rowOf(draft, "n:0")?.contract).toEqual({ qtyRaw: "12,5", bfRaw: "30.000,00" });
    expect(rowOf(draft, "n:1")?.contract).toEqual({ qtyRaw: "", bfRaw: "1.250,50" });
  });

  it("🔴 değerli ekleme de yeni satırdır: offer_item_id YOK, not, isNew", () => {
    const values = new Map([[SIVA.id, { qtyRaw: "3", bfRaw: "50,00" }]]);
    const row = rowOf(addFromCatalog(baseDraft(), "g:g-kaba", [SIVA], values), "n:0");
    expect(row).toMatchObject({ offerItemId: null, isNew: true, included: true, note: "Katalogdan eklendi · teklifte yoktu" });
  });
});

describe("TKL-F5.4 · addGroup: yerel yeni grup", () => {
  it("🔴 grup SONA eklenir, anahtarı dönülür, sayaç ilerler; kalem eklenebilir", () => {
    const base = baseDraft();
    const { draft, groupKey } = addGroup(base, "Yeni grup");
    expect(groupKey).not.toBe("");
    expect(draft.groups).toHaveLength(base.groups.length + 1);
    expect(draft.groups.at(-1)).toMatchObject({ key: groupKey, name: "Yeni grup", disciplineId: null, nameEdited: false });
    expect(draft.nextNewSeq).toBe(base.nextNewSeq + 1);
    const added = addFromCatalog(draft, groupKey, [SIVA]);
    expect(added.rows.at(-1)).toMatchObject({ groupKey, isNew: true });
  });

  it("🔴 ikinci yeni grubun anahtarı birincisiyle çakışmaz", () => {
    const first = addGroup(baseDraft(), "Yeni grup");
    const second = addGroup(first.draft, "Yeni grup 2");
    expect(second.groupKey).not.toBe(first.groupKey);
  });

  it("🔴 yerel yeni grubun son satırı silinince (toggle = SİL) boş grup da kalkar; teklif grubu kalır", () => {
    const { draft, groupKey } = addGroup(baseDraft(), "Yeni grup");
    const added = addFromCatalog(draft, groupKey, [SIVA]);
    const removed = toggleIncluded(added, "n:1");
    expect(removed.groups.map((group) => group.key)).not.toContain(groupKey);
    const intoOffer = toggleIncluded(addFromCatalog(baseDraft(), "g:g-bos", [SIVA]), "n:0");
    expect(intoOffer.groups.map((group) => group.key)).toContain("g:g-bos");
  });
});

describe("TKL-F5.4 · addCatalogEntries: seçici onayı", () => {
  const entry = { item: SIVA, quantity: "12.5", unitPrice: "3410.00" };

  it("🔴 mevcut gruba: nokta-ondalık metin TR kutu metnine çevrilir (12,5 · 3.410,00)", () => {
    const draft = addCatalogEntries(baseDraft(), { groupKey: "g:g-ince" }, [entry]);
    expect(rowOf(draft, "n:0")).toMatchObject({ groupKey: "g:g-ince", offerItemId: null, isNew: true, contract: { qtyRaw: "12,5", bfRaw: "3.410,00" } });
  });

  it("🔴 yeni grup adıyla: grup açılır, satır ona bağlanır", () => {
    const draft = addCatalogEntries(baseDraft(), { newGroupName: "Yeni grup" }, [entry]);
    const group = draft.groups.at(-1);
    expect(group?.name).toBe("Yeni grup");
    expect(draft.rows.at(-1)?.groupKey).toBe(group?.key);
  });

  it("boş seçim: aynı nesne (boş grup AÇILMAZ)", () => {
    const base = baseDraft();
    expect(addCatalogEntries(base, { newGroupName: "Yeni grup" }, [])).toBe(base);
  });
});

describe("🔴 F5.4b · applyCatalogEntries: açık sonuç (sessiz no-op YOK)", () => {
  const entry = { item: SIVA, quantity: "12.5", unitPrice: "3410.00" };

  it("var olmayan hedef grup → {ok:false}; taslağa dokunulmaz", () => {
    expect(applyCatalogEntries(baseDraft(), { groupKey: "ng:7" }, [entry])).toEqual({ ok: false });
  });

  it("var olan grup → {ok:true, draft} (satır eklenir); yeni grup adı her zaman ok; boş seçim ok + AYNI taslak", () => {
    const base = baseDraft();
    const added = applyCatalogEntries(base, { groupKey: "g:g-ince" }, [entry]);
    expect(added.ok && rowOf(added.draft, "n:0")?.groupKey).toBe("g:g-ince");
    const fresh = applyCatalogEntries(base, { newGroupName: "Yeni grup" }, [entry]);
    expect(fresh.ok && fresh.draft.groups.at(-1)?.name).toBe("Yeni grup");
    expect(applyCatalogEntries(base, { groupKey: "g:g-ince" }, [])).toEqual({ ok: true, draft: base });
  });
});

describe("🔴 F5.4b · seçici → tablo gidiş-dönüş (kutu metni TR biçimi + tablonun ayrıştırıcısı AYNI sayıyı geri verir)", () => {
  const cases = [
    { name: "miktar 1000 → '1.000' → 1000 (binlik nokta ondalık sanılmaz)", quantity: "1000", qtyRaw: "1.000" },
    { name: "3 ondalık 0,125", quantity: "0.125", qtyRaw: "0,125" },
    { name: "miktar üst sınırı 999.999.999,999", quantity: "999999999.999", qtyRaw: "999.999.999,999" },
  ];
  it.each(cases)("$name", ({ quantity, qtyRaw }) => {
    const draft = addCatalogEntries(baseDraft(), { groupKey: "g:g-ince" }, [{ item: SIVA, quantity, unitPrice: "1.00" }]);
    const raw = rowOf(draft, "n:0")?.contract.qtyRaw ?? "";
    expect(raw).toBe(qtyRaw);
    expect(parseQty(raw)).toEqual({ ok: true, value: quantity });
  });

  it("B.F. 1e12 sınırı: '1.000.000.000.000,00' → 1000000000000.00; 1000 → '1.000,00'", () => {
    const limit = addCatalogEntries(baseDraft(), { groupKey: "g:g-ince" }, [{ item: SIVA, quantity: "1", unitPrice: "1000000000000.00" }]);
    const raw = rowOf(limit, "n:0")?.contract.bfRaw ?? "";
    expect(raw).toBe("1.000.000.000.000,00");
    expect(parseUnitPrice(raw)).toEqual({ ok: true, value: "1000000000000.00" });
    const thousand = addCatalogEntries(baseDraft(), { groupKey: "g:g-ince" }, [{ item: SIVA, quantity: "1", unitPrice: "1000.00" }]);
    expect(rowOf(thousand, "n:0")?.contract.bfRaw).toBe("1.000,00");
  });
});
