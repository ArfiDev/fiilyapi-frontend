// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BETON, DEMIR, DISCIPLINE_BY_CATALOG, D_DUV_ID, D_KAB_ID, SIVA, makeWonRevision } from "./convert-fixtures";
import {
  NEW_ROW_NOTE,
  addFromCatalog,
  applyCatalogDisciplines,
  collidingGroupKeys,
  collidingRowKeys,
  includedRows,
  mixedGroupKeys,
  renameGroup,
  rowsFromRevision,
  sentGroupKeys,
  setBf,
  setCode,
  setGroupDiscipline,
  setQty,
  toggleIncluded,
} from "./convert-model";
import type { ConvertDraft } from "./convert-types";

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as object).forEach(deepFreeze);
  }
  return value;
}

/** Dondurulmuş taban: işlem tabanı DEĞİŞTİRİRSE (mutasyon) strict modda TypeError fırlar. */
function baseDraft(): ConvertDraft {
  return deepFreeze(rowsFromRevision(makeWonRevision(), DISCIPLINE_BY_CATALOG));
}
const rowOf = (draft: ConvertDraft, key: string) => draft.rows.find((row) => row.key === key);

describe("rowsFromRevision", () => {
  it("grup + kalem sırası korunur, boş grup da taşınır", () => {
    const draft = baseDraft();
    expect(draft.groups.map((g) => [g.key, g.name, g.offerName])).toEqual([
      ["g:g-kaba", "KABA İNŞAAT", "KABA İNŞAAT"],
      ["g:g-ince", "İNCE İŞLER", "İNCE İŞLER"],
      ["g:g-bos", "BOŞ GRUP", "BOŞ GRUP"],
    ]);
    expect(draft.rows.map((r) => [r.key, r.groupKey])).toEqual([
      ["o:it-1", "g:g-kaba"],
      ["o:it-2", "g:g-kaba"],
      ["o:it-3", "g:g-ince"],
    ]);
    expect(draft.nextNewSeq).toBe(0);
  });

  it("fiyatlı kalem: teklif değerleri TR biçimiyle kutulara dolar", () => {
    expect(rowOf(baseDraft(), "o:it-1")).toEqual({
      key: "o:it-1",
      groupKey: "g:g-kaba",
      offerItemId: "it-1",
      catalogItemId: BETON.id,
      code: BETON.poz_no,
      sourceCode: null,
      description: BETON.name,
      unit: BETON.uom,
      offer: { qty: "10.000", unitPrice: "128.80", amount: "1288.00" },
      contract: { qtyRaw: "10", bfRaw: "128,80" },
      included: true,
      isNew: false,
      note: null,
      disciplineId: D_KAB_ID,
      codeEdited: false,
    });
  });

  it("🔴 fiyatsız kalem (ÜS-F5-16): B.F. kutusu BOŞ (0 DEĞİL), teklif tutarı 0.00, dahil", () => {
    const row = rowOf(baseDraft(), "o:it-2");
    expect(row?.contract).toEqual({ qtyRaw: "2", bfRaw: "" });
    expect(row?.offer).toEqual({ qty: "2.000", unitPrice: null, amount: "0.00" });
    expect(row?.included).toBe(true);
  });

  it("binlik ve ondalık: 3200.000 → '3.200', 28500.00 → '28.500,00', 2.125 → '2,125'", () => {
    const revision = makeWonRevision();
    const first = revision.groups[0]?.items[0];
    if (!first) throw new Error("fikstür");
    const patched = {
      ...revision,
      groups: [
        { ...revision.groups[0]!, items: [{ ...first, quantity: "3200.000", customer: { unit_price: "28500.00", amount: "91200000.00" } }] },
      ],
    };
    const row = rowsFromRevision(patched).rows[0];
    expect(row?.contract).toEqual({ qtyRaw: "3.200", bfRaw: "28.500,00" });
    const frac = { ...first, quantity: "2.125" };
    expect(rowsFromRevision({ ...patched, groups: [{ ...patched.groups[0]!, items: [frac] }] }).rows[0]?.contract.qtyRaw).toBe("2,125");
  });

  it("miktarı olmayan (maskeli/miktarsız) kalem: miktar kutusu boş, teklif miktarı null", () => {
    const revision = makeWonRevision();
    const g = revision.groups[0]!;
    const patched = { ...revision, groups: [{ ...g, items: [{ ...g.items[0]!, quantity: null, customer: { unit_price: "128.80", amount: null } }] }] };
    const row = rowsFromRevision(patched).rows[0];
    expect(row?.contract.qtyRaw).toBe("");
    expect(row?.offer).toEqual({ qty: null, unitPrice: "128.80", amount: "0.00" });
  });

  it("katalog haritası yoksa disiplin bilinmiyor (null)", () => {
    expect(rowsFromRevision(makeWonRevision()).rows.map((r) => r.disciplineId)).toEqual([null, null, null]);
  });

  it("applyCatalogDisciplines sonradan doldurur (yeni nesne, taban değişmez)", () => {
    const bare = deepFreeze(rowsFromRevision(makeWonRevision()));
    const filled = applyCatalogDisciplines(bare, DISCIPLINE_BY_CATALOG);
    expect(filled.rows.map((r) => r.disciplineId)).toEqual([D_KAB_ID, D_KAB_ID, D_DUV_ID]);
    expect(filled).not.toBe(bare);
  });
});

describe("toggleIncluded", () => {
  it("teklif satırı: dahil ↔ çıkarıldı, satır SİLİNMEZ, diğerleri aynı", () => {
    const base = baseDraft();
    const off = toggleIncluded(base, "o:it-1");
    expect(rowOf(off, "o:it-1")?.included).toBe(false);
    expect(off.rows).toHaveLength(3);
    expect(rowOf(toggleIncluded(off, "o:it-1"), "o:it-1")?.included).toBe(true);
    expect(rowOf(off, "o:it-2")).toBe(rowOf(base, "o:it-2"));
  });

  it("🔴 yeni (katalogdan) satırda = SİL (TDN:284)", () => {
    const added = addFromCatalog(baseDraft(), "g:g-ince", [DEMIR]);
    expect(added.rows).toHaveLength(4);
    const removed = toggleIncluded(added, "n:0");
    expect(removed.rows.map((r) => r.key)).toEqual(["o:it-1", "o:it-2", "o:it-3"]);
  });

  it("bilinmeyen anahtar: aynı durum nesnesi", () => {
    const base = baseDraft();
    expect(toggleIncluded(base, "yok")).toBe(base);
  });
});

describe("setQty / setBf: yazılan metin AYNEN saklanır (kontrollü kutu)", () => {
  it("yalnız hedef satırın ilgili kutusu değişir", () => {
    const base = baseDraft();
    const next = setBf(setQty(base, "o:it-1", " 12,5 "), "o:it-1", "130");
    expect(rowOf(next, "o:it-1")?.contract).toEqual({ qtyRaw: " 12,5 ", bfRaw: "130" });
    expect(rowOf(next, "o:it-2")).toBe(rowOf(base, "o:it-2"));
  });
  it("belirsiz '28.5' de saklanır (hata doğrulamada gösterilir, sessizce 2850 OKUNMAZ)", () => {
    expect(rowOf(setBf(baseDraft(), "o:it-1", "28.5"), "o:it-1")?.contract.bfRaw).toBe("28.5");
  });
});

describe("addFromCatalog", () => {
  it("hedef grubun SONUNA, gruplar arası sıra bozulmadan eklenir (boş gruba da)", () => {
    const toKaba = addFromCatalog(baseDraft(), "g:g-kaba", [SIVA]);
    expect(toKaba.rows.map((r) => r.key)).toEqual(["o:it-1", "o:it-2", "n:0", "o:it-3"]);
    const toEmpty = addFromCatalog(baseDraft(), "g:g-bos", [SIVA]);
    expect(toEmpty.rows.map((r) => [r.key, r.groupKey])).toEqual([
      ["o:it-1", "g:g-kaba"],
      ["o:it-2", "g:g-kaba"],
      ["o:it-3", "g:g-ince"],
      ["n:0", "g:g-bos"],
    ]);
  });

  it("yeni satır: offer_item_id YOK · not · miktar BOŞ · B.F. son fiyat → referans → boş (ÜS-F5-15)", () => {
    const last = { ...BETON, id: "c-last", poz_no: "K-9", source_code: "15.100.1001", last_price: { price: "3410.00", at: "x", source: "SZL", doc_no: "d", doc_id: null } };
    const noPrice = { ...BETON, id: "c-none", poz_no: "K-8", ref_price: null, last_price: null };
    const draft = addFromCatalog(baseDraft(), "g:g-ince", [last, DEMIR, noPrice]);
    const [a, b, c] = draft.rows.filter((r) => r.isNew);
    expect(a).toMatchObject({
      key: "n:0",
      groupKey: "g:g-ince",
      offerItemId: null,
      catalogItemId: "c-last",
      code: "K-9",
      sourceCode: "15.100.1001",
      description: BETON.name,
      unit: BETON.uom,
      offer: { qty: null, unitPrice: null, amount: "0.00" },
      contract: { qtyRaw: "", bfRaw: "3.410,00" },
      included: true,
      isNew: true,
      note: NEW_ROW_NOTE,
      disciplineId: D_KAB_ID,
      codeEdited: false,
    });
    expect(NEW_ROW_NOTE).toBe("Katalogdan eklendi · teklifte yoktu");
    expect(b?.contract.bfRaw).toBe("28.000,00");
    expect(c?.contract.bfRaw).toBe("");
    expect(draft.nextNewSeq).toBe(3);
  });

  it("anahtarlar art arda eklemede çakışmaz; bilinmeyen grup: aynı nesne", () => {
    const once = addFromCatalog(baseDraft(), "g:g-ince", [SIVA]);
    const twice = addFromCatalog(once, "g:g-ince", [SIVA]);
    expect(twice.rows.filter((r) => r.isNew).map((r) => r.key)).toEqual(["n:0", "n:1"]);
    const base = baseDraft();
    expect(addFromCatalog(base, "g:yok", [SIVA])).toBe(base);
    expect(addFromCatalog(base, "g:g-ince", [])).toBe(base);
  });
});

describe("renameGroup / setCode / setGroupDiscipline", () => {
  it("ad ve kod AYNEN yazılır, 'düzenlendi' bayrağı kalıcıdır", () => {
    const base = baseDraft();
    const renamed = renameGroup(base, "g:g-ince", " Yeni ad ");
    expect(renamed.groups[1]).toMatchObject({ name: " Yeni ad ", offerName: "İNCE İŞLER", nameEdited: true });
    const coded = setCode(base, "o:it-2", "K-2");
    expect(rowOf(coded, "o:it-2")).toMatchObject({ code: "K-2", codeEdited: true });
  });
  it("disiplin seçimi (null = temizle)", () => {
    const picked = setGroupDiscipline(baseDraft(), "g:g-kaba", D_DUV_ID);
    expect(picked.groups[0]?.disciplineId).toBe(D_DUV_ID);
    expect(setGroupDiscipline(picked, "g:g-kaba", null).groups[0]?.disciplineId).toBeNull();
  });
});

describe("çakışma (SO-29/30/52): strip + birebir, YALNIZ gövdeye girecek satır/grupta", () => {
  it("grup adı: ikisi de işaretlenir; boşluk ve büyük/küçük harf kuralı", () => {
    expect(collidingGroupKeys(baseDraft()).size).toBe(0);
    const dup = renameGroup(baseDraft(), "g:g-ince", "  KABA İNŞAAT ");
    expect([...collidingGroupKeys(dup)].sort()).toEqual(["g:g-ince", "g:g-kaba"]);
    expect(collidingGroupKeys(renameGroup(baseDraft(), "g:g-ince", "kaba inşaat")).size).toBe(0);
  });
  it("tamamen çıkarılmış / boş grup gövdede YOK → adı çakışmaz", () => {
    const allOut = toggleIncluded(toggleIncluded(baseDraft(), "o:it-1"), "o:it-2");
    expect(collidingGroupKeys(renameGroup(allOut, "g:g-ince", "KABA İNŞAAT")).size).toBe(0);
    expect(collidingGroupKeys(renameGroup(baseDraft(), "g:g-bos", "KABA İNŞAAT")).size).toBe(0);
  });
  it("kalem kodu: gruplar arası da çakışır, ikisi de işaretlenir", () => {
    const dup = setCode(baseDraft(), "o:it-3", ` ${BETON.poz_no}`);
    expect([...collidingRowKeys(dup)].sort()).toEqual(["o:it-1", "o:it-3"]);
  });
  it("çıkarılmış satırın kodu çakışmaz", () => {
    const dup = setCode(toggleIncluded(baseDraft(), "o:it-3"), "o:it-3", BETON.poz_no);
    expect(collidingRowKeys(dup).size).toBe(0);
  });
});

describe("mixedGroupKeys: DAHİL satırların katalog disiplin kümesi > 1; bilinmeyen sayılmaz", () => {
  it("tek disiplinli grup karışık DEĞİL; ikinci disiplin eklenince karışık", () => {
    expect(mixedGroupKeys(baseDraft()).size).toBe(0);
    const mixed = addFromCatalog(baseDraft(), "g:g-kaba", [SIVA]);
    expect([...mixedGroupKeys(mixed)]).toEqual(["g:g-kaba"]);
  });
  it("karışıklığı yaratan satır çıkarılınca / silinince karışık değil", () => {
    const mixed = addFromCatalog(baseDraft(), "g:g-kaba", [SIVA]);
    expect(mixedGroupKeys(toggleIncluded(mixed, "n:0")).size).toBe(0);
  });
  it("bilinmeyen disiplin (null) kümeye girmez", () => {
    const bare = rowsFromRevision(makeWonRevision());
    expect(mixedGroupKeys(bare).size).toBe(0);
    const partial = applyCatalogDisciplines(bare, new Map([[BETON.id, D_KAB_ID]]));
    expect(mixedGroupKeys(partial).size).toBe(0);
  });
});

describe("gövdeye girecek küme", () => {
  it("sentGroupKeys: en az bir DAHİL satırı olan gruplar, grup sırasıyla", () => {
    expect(sentGroupKeys(baseDraft())).toEqual(["g:g-kaba", "g:g-ince"]);
    const out = toggleIncluded(toggleIncluded(baseDraft(), "o:it-1"), "o:it-2");
    expect(sentGroupKeys(out)).toEqual(["g:g-ince"]);
  });
  it("includedRows yalnız dahil satırlar", () => {
    expect(includedRows(toggleIncluded(baseDraft(), "o:it-1")).map((r) => r.key)).toEqual(["o:it-2", "o:it-3"]);
  });
});
