import { describe, expect, it } from "vitest";

import { makeTemplateDetail, makeTemplateGroup } from "./template-fixtures";
import {
  MAX_TEMPLATE_GROUPS,
  MAX_TEMPLATE_ITEMS,
  MSG_GROUPS_TOO_MANY,
  MSG_ITEMS_TOO_MANY,
  addGroup,
  addItems,
  applyEdit,
  editAddItems,
  editRemoveGroup,
  editRemoveItem,
  editRenameGroup,
  removeGroup,
  removeItem,
  renameGroup,
  toBody,
  toDraft,
  type Draft,
} from "./template-content";

const draftOf = (groups: [string, string[]][]): Draft =>
  toDraft(makeTemplateDetail({ groups: groups.map(([name, ids]) => makeTemplateGroup(name, ids)) }));

function groupsOf(result: { ok: boolean; groups?: Draft; error?: string }) {
  if (!result.ok) throw new Error(`beklenmeyen hata: ${result.error}`);
  return (result.groups ?? []).map((group) => [group.name, group.items.map((item) => item.catalog_item_id)]);
}

describe("toBody / toDraft", () => {
  it("gövde = grup adları + katalog kimlikleri + expected_updated_at (detayın updated_at'i AYNEN)", () => {
    const detail = makeTemplateDetail({ updated_at: "2026-10-02T10:00:00.123456Z" });
    expect(toBody(detail)).toEqual({
      groups: [
        { name: "Betonarme", items: [{ catalog_item_id: "cat-1" }, { catalog_item_id: "cat-2" }] },
        { name: "Kalıp", items: [{ catalog_item_id: "cat-3" }] },
      ],
      expected_updated_at: "2026-10-02T10:00:00.123456Z",
    });
  });

  it("verilen taslak gövdeye girer, expected_updated_at yine detaydan gelir", () => {
    const detail = makeTemplateDetail({ updated_at: "T-yeni" });
    const edited = addGroup("Cephe")(toDraft(detail));
    if (!edited.ok) throw new Error("beklenmeyen");
    const body = toBody(detail, edited.groups);
    expect(body.groups.map((group) => group.name)).toEqual(["Betonarme", "Kalıp", "Cephe"]);
    expect(body.expected_updated_at).toBe("T-yeni");
  });
});

describe("addGroup", () => {
  it("adsız çağrı 'Yeni grup', çakışırsa 'Yeni grup 2'… (offer-group-names yeniden kullanılır)", () => {
    const first = addGroup()(draftOf([["A", []]]));
    expect(groupsOf(first)[1]?.[0]).toBe("Yeni grup");
    const second = addGroup()(draftOf([["Yeni grup", []]]));
    expect(groupsOf(second)[1]?.[0]).toBe("Yeni grup 2");
  });

  it("aynı ad reddedilir: 'Bu adla grup var'", () => {
    const result = addGroup("Betonarme")(draftOf([["Betonarme", []]]));
    expect(result).toEqual({ ok: false, error: "Bu adla grup var" });
  });

  it("boş ad reddedilir", () => {
    expect(addGroup("   ")(draftOf([])).ok).toBe(false);
  });

  it("100 grup tavanı: backend metni aynen", () => {
    const full = draftOf(Array.from({ length: MAX_TEMPLATE_GROUPS }, (_, i) => [`G${i}`, []] as [string, string[]]));
    expect(addGroup("Fazla")(full)).toEqual({ ok: false, error: MSG_GROUPS_TOO_MANY });
    expect(MSG_GROUPS_TOO_MANY).toBe("Şablonda en fazla 100 grup olabilir");
  });
});

describe("renameGroup", () => {
  it("adı değiştirir, kalemler yerinde kalır", () => {
    const result = renameGroup(0, "Karkas")(draftOf([["Betonarme", ["c1"]], ["Kalıp", []]]));
    expect(groupsOf(result)).toEqual([["Karkas", ["c1"]], ["Kalıp", []]]);
  });

  it("başka bir grubun adı reddedilir; kendi adı serbesttir", () => {
    const draft = draftOf([["Betonarme", []], ["Kalıp", []]]);
    expect(renameGroup(0, "Kalıp")(draft)).toEqual({ ok: false, error: "Bu adla grup var" });
    expect(renameGroup(0, "Betonarme")(draft).ok).toBe(true);
  });

  it("boş ad reddedilir", () => {
    expect(renameGroup(0, " ")(draftOf([["A", []]])).ok).toBe(false);
  });
});

describe("removeGroup — yalnız BOŞ grup (ÜS-F4-4)", () => {
  it("boş grubu siler", () => {
    expect(groupsOf(removeGroup(1)(draftOf([["A", ["c"]], ["B", []]])))).toEqual([["A", ["c"]]]);
  });

  it("dolu grup SİLİNMEZ (kalemler kaybolmasın)", () => {
    const result = removeGroup(0)(draftOf([["A", ["c"]], ["B", []]]));
    expect(result.ok).toBe(false);
  });
});

describe("addItems", () => {
  it("mevcut gruba katalog kimliklerini sona ekler", () => {
    const result = addItems({ groupIndex: 0 }, ["c2", "c3"])(draftOf([["A", ["c1"]]]));
    expect(groupsOf(result)).toEqual([["A", ["c1", "c2", "c3"]]]);
  });

  it("yeni grup adıyla: grup sona açılır, kalemler içine girer", () => {
    const result = addItems({ newGroupName: "Cephe" }, ["c1"])(draftOf([["A", []]]));
    expect(groupsOf(result)).toEqual([["A", []], ["Cephe", ["c1"]]]);
  });

  it("yeni grup adı çakışırsa 'Bu adla grup var'", () => {
    expect(addItems({ newGroupName: "A" }, ["c1"])(draftOf([["A", []]]))).toEqual({ ok: false, error: "Bu adla grup var" });
  });

  it("1000 kalem tavanı: backend metni aynen; sınırda (=1000) serbest", () => {
    const base = Array.from({ length: MAX_TEMPLATE_ITEMS - 1 }, (_, i) => `c${i}`);
    expect(addItems({ groupIndex: 0 }, ["x"])(draftOf([["A", base]])).ok).toBe(true);
    expect(addItems({ groupIndex: 0 }, ["x", "y"])(draftOf([["A", base]]))).toEqual({ ok: false, error: MSG_ITEMS_TOO_MANY });
    expect(MSG_ITEMS_TOO_MANY).toBe("Şablonda en fazla 1000 kalem olabilir");
  });

  it("tavan TÜM gruplardaki toplamı sayar", () => {
    const half = Array.from({ length: 600 }, (_, i) => `c${i}`);
    const other = Array.from({ length: 400 }, (_, i) => `d${i}`);
    expect(addItems({ groupIndex: 0 }, ["x"])(draftOf([["A", half], ["B", other]])).ok).toBe(false);
  });

  it("var olmayan grup dizini hata verir", () => {
    expect(addItems({ groupIndex: 5 }, ["c"])(draftOf([["A", []]])).ok).toBe(false);
  });
});

describe("removeItem", () => {
  it("yalnız o kalemi çıkarır", () => {
    expect(groupsOf(removeItem(0, 1)(draftOf([["A", ["c1", "c2", "c3"]]])))).toEqual([["A", ["c1", "c3"]]]);
  });

  it("var olmayan dizin hata verir", () => {
    expect(removeItem(0, 9)(draftOf([["A", ["c1"]]])).ok).toBe(false);
  });
});

describe("kimlikle çözülen düzenlemeler (kuyrukta bayat dizin = yanlış kalemi silmesin)", () => {
  it("editRemoveItem grup ADI + katalog kimliğiyle çözer: önceki işlem diziniyi kaydırsa da doğru kalem gider", () => {
    const draft = draftOf([["A", ["c1", "c2", "c3", "c4"]]]);
    const afterFirst = editRemoveItem("A", "c2")(draft);
    if (!afterFirst.ok) throw new Error("beklenmeyen");
    // UI, ilk silmeden ÖNCE çizilmiş görüntüde c4'ü (dizin 3) gösteriyordu.
    expect(groupsOf(editRemoveItem("A", "c4")(afterFirst.groups))).toEqual([["A", ["c1", "c3"]]]);
  });

  it("zaten yok olan kalem: değişiklik yok (aynı taslak referansı)", () => {
    const draft = draftOf([["A", ["c1"]]]);
    const result = editRemoveItem("A", "yok")(draft);
    expect(result).toEqual({ ok: true, groups: draft });
  });

  it("editRenameGroup / editRemoveGroup adla çözer", () => {
    const draft = draftOf([["A", []], ["B", []]]);
    expect(groupsOf(editRenameGroup("B", "Z")(draft))).toEqual([["A", []], ["Z", []]]);
    expect(groupsOf(editRemoveGroup("A")(draft))).toEqual([["B", []]]);
  });
});

describe("editAddItems — katalogdan ekleme (F4.6): grup ADLA çözülür", () => {
  it("🔴 mevcut grup adıyla: sona eklenir; dizin kaymış olsa da doğru grup", () => {
    const draft = draftOf([["A", ["c1"]], ["B", ["c2"]]]);
    expect(groupsOf(editAddItems({ groupName: "B" }, ["c3", "c4"])(draft))).toEqual([["A", ["c1"]], ["B", ["c2", "c3", "c4"]]]);
  });

  it("🔴 grup artık yok (başka işlem sildi) → 'Grup bulunamadı', taslak değişmez", () => {
    expect(editAddItems({ groupName: "Z" }, ["c"])(draftOf([["A", []]]))).toEqual({ ok: false, error: "Grup bulunamadı" });
  });

  it("yeni grup adıyla: sona yeni grup açılır; aynı ad reddedilir", () => {
    expect(groupsOf(editAddItems({ newGroupName: "Cephe" }, ["c1"])(draftOf([["A", []]])))).toEqual([["A", []], ["Cephe", ["c1"]]]);
    expect(editAddItems({ newGroupName: "A" }, ["c1"])(draftOf([["A", []]]))).toEqual({ ok: false, error: "Bu adla grup var" });
  });

  it("1000 kalem tavanı aşılırsa backend metni, PUT yok", () => {
    const base = Array.from({ length: MAX_TEMPLATE_ITEMS }, (_, i) => `c${i}`);
    expect(editAddItems({ groupName: "A" }, ["x"])(draftOf([["A", base]]))).toEqual({ ok: false, error: MSG_ITEMS_TOO_MANY });
  });
});

describe("applyEdit", () => {
  it("değişmeyen sonuç (aynı taslak) 'changed: false' döner → PUT atılmaz", () => {
    const detail = makeTemplateDetail();
    expect(applyEdit(detail, editRemoveItem("Betonarme", "yok"))).toEqual({ ok: true, changed: false });
  });

  it("değişiklik gövdeyi kurar (expected_updated_at = detay)", () => {
    const detail = makeTemplateDetail({ updated_at: "T0" });
    const result = applyEdit(detail, addGroup("Yeni"));
    if (!result.ok || !result.changed) throw new Error("beklenmeyen");
    expect(result.body.expected_updated_at).toBe("T0");
    expect(result.body.groups.at(-1)?.name).toBe("Yeni");
  });

  it("hata sonucu aynen iletilir", () => {
    expect(applyEdit(makeTemplateDetail(), addGroup("Betonarme"))).toEqual({ ok: false, error: "Bu adla grup var" });
  });
});
