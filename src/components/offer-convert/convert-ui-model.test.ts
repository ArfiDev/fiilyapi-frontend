import { describe, expect, it } from "vitest";

import { buildConvertRequest } from "./convert-body";
import { rowChangedFields } from "./convert-derive";
import { addCalendarDays, initialConvertForm } from "./convert-initial";
import { rowsFromRevision, setBf, setQty } from "./convert-model";
import { hasStep1Errors, validateStep1 } from "./convert-validate";
import { makeForm, makeWonRevision } from "./convert-fixtures";

/** TKL-F5.3 · UI'nin ihtiyaç duyduğu küçük model eklerinin testleri (proje kodu, kutu başına vurgu, başlangıç formu). */

const revision = makeWonRevision();
const draft = () => rowsFromRevision(revision);

describe("proje kodu (BD-2 / K-F5-1: isteğe bağlı)", () => {
  it("boşken gövdeye HİÇ girmez; doluyken kırpılmış gider", () => {
    expect(buildConvertRequest(makeForm({ projectCode: "" }), draftAllPriced(), revision).project).not.toHaveProperty("code");
    expect(buildConvertRequest(makeForm({ projectCode: "  " }), draftAllPriced(), revision).project).not.toHaveProperty("code");
    expect(buildConvertRequest(makeForm({ projectCode: " PRJ-2026-005 " }), draftAllPriced(), revision).project.code).toBe("PRJ-2026-005");
  });

  it("50 karakterden uzun kod Adım 1'de reddedilir; boş kod hata değildir", () => {
    expect(validateStep1(makeForm({ projectCode: "X".repeat(51) })).projectCode).toBe("En çok 50 karakter");
    expect(hasStep1Errors(validateStep1(makeForm({ projectCode: "" })))).toBe(false);
  });
});

function draftAllPriced() {
  return setBf(setQty(draft(), "o:it-2", "2"), "o:it-2", "100");
}

describe("rowChangedFields (kutu başına mavi vurgu)", () => {
  it("dokunulmamış satır: ikisi de değişmedi", () => {
    const row = draft().rows[0]!;
    expect(rowChangedFields(row)).toEqual({ qty: false, bf: false });
  });
  it("yalnız miktar değişince yalnız miktar kutusu; yalnız fiyat değişince yalnız B.F.", () => {
    expect(rowChangedFields(setQty(draft(), "o:it-1", "11").rows[0]!)).toEqual({ qty: true, bf: false });
    expect(rowChangedFields(setBf(draft(), "o:it-1", "100").rows[0]!)).toEqual({ qty: false, bf: true });
  });
  it("sayısal eşitlik: 10 = 10,000", () => {
    expect(rowChangedFields(setQty(draft(), "o:it-1", "10,000").rows[0]!).qty).toBe(false);
  });
  it("çıkarılmış ve yeni satırda vurgu YOK", () => {
    const excluded = { ...draft().rows[0]!, included: false, contract: { qtyRaw: "99", bfRaw: "1" } };
    expect(rowChangedFields(excluded)).toEqual({ qty: false, bf: false });
    const fresh = { ...draft().rows[0]!, isNew: true };
    expect(rowChangedFields(fresh)).toEqual({ qty: false, bf: false });
  });
});

describe("addCalendarDays", () => {
  it("ay/yıl taşar, artık yılı bilir", () => {
    expect(addCalendarDays("2026-10-02", 0)).toBe("2026-10-02");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("geçersiz tarih null", () => {
    expect(addCalendarDays("", 1)).toBeNull();
    expect(addCalendarDays("2026-02-30", 1)).toBeNull();
  });
});

describe("initialConvertForm (ÜS-F5-8…11)", () => {
  const input = { title: "Güneşkent Konut Kompleksi", today: "2026-10-02" };
  it("ad = teklif başlığı; il boş; sözleşme tarihi = bugün; başlangıç = sözleşme tarihi; kod/no boş", () => {
    const form = initialConvertForm({ ...input, revision: { ...revision, delivery_days: null } });
    expect(form).toMatchObject({
      projectName: "Güneşkent Konut Kompleksi", city: "", contractNo: "", projectCode: "",
      signatureDate: "2026-10-02", startDate: "2026-10-02", endDate: "",
    });
  });
  it("bitiş = başlangıç + teslim süresi − 1 (uç-dahil: 420 gün = 420 takvim günü)", () => {
    const form = initialConvertForm({ ...input, revision: { ...revision, delivery_days: 420 } });
    expect(form.endDate).toBe("2027-11-25");
  });
  it("teslim süresi 1 gün: bitiş = başlangıç", () => {
    expect(initialConvertForm({ ...input, revision: { ...revision, delivery_days: 1 } }).endDate).toBe("2026-10-02");
  });
  it("şantiye açık, ad kutusu boş (boşsa proje adı); fiyat farkı: TÜİK → açık + teklif endeksi, D0 boş; sabit → kapalı", () => {
    const tuik = initialConvertForm({ ...input, revision: { ...revision, price_escalation: "tuik", price_index_type: "ufe" } });
    expect(tuik).toMatchObject({ openSite: true, siteName: "", hasPriceEscalation: true, indexType: "ufe", baseIndexValue: "" });
    const fixed = initialConvertForm({ ...input, revision: { ...revision, price_escalation: "fixed", price_index_type: null } });
    expect(fixed).toMatchObject({ hasPriceEscalation: false, indexType: "", baseIndexValue: "" });
  });
  it("TÜİK ama endeks türü yok → endeks boş (kullanıcı seçer)", () => {
    expect(initialConvertForm({ ...input, revision: { ...revision, price_escalation: "tuik", price_index_type: null } }).indexType).toBe("");
  });
});
