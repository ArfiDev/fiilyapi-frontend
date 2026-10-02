// @vitest-environment node
import { describe, expect, it } from "vitest";

import { MESSAGES } from "@/components/project-form/validate";

import { BETON, DISCIPLINE_BY_CATALOG, SIVA, makeForm, makeWonRevision } from "./convert-fixtures";
import {
  addFromCatalog,
  renameGroup,
  rowsFromRevision,
  setBf,
  setCode,
  setQty,
  toggleIncluded,
} from "./convert-model";
import {
  MAX_CONVERT_ITEMS,
  hasStep1Errors,
  hasStep2Errors,
  validateStep1,
  validateStep2,
} from "./convert-validate";
import type { ConvertDraft } from "./convert-types";

const revision = makeWonRevision();
const filled = (): ConvertDraft => setBf(rowsFromRevision(revision, DISCIPLINE_BY_CATALOG), "o:it-2", "100");
const check = (draft: ConvertDraft) => validateStep2(draft, revision);
/** Teklifte olmayan, kodu çakışmayan ikinci disiplin kalemi (SIVA kodu teklifteki it-3 ile aynıdır). */
const FRESH = { ...SIVA, id: "c-fresh", poz_no: "DUV-0099" };
const ALL_OUT = (draft: ConvertDraft) => ["o:it-1", "o:it-2", "o:it-3"].reduce(toggleIncluded, draft);

describe("Adım 1 (project-form/validate.ts metinleri AYNEN)", () => {
  it("dolu geçerli form: hata yok", () => {
    expect(validateStep1(makeForm())).toEqual({});
    expect(hasStep1Errors({})).toBe(false);
  });

  it("zorunlu alanlar boşken TÜM hatalar birlikte döner (ilk hatada durmaz)", () => {
    const errors = validateStep1(
      makeForm({ projectName: " ", city: "", contractNo: "", signatureDate: "", startDate: "", endDate: "" }),
    );
    expect(errors).toEqual({
      projectName: "Proje adı zorunludur.",
      city: "İl / ilçe zorunludur.",
      contractNo: "Sözleşme no zorunludur.",
      signatureDate: "İmza tarihi zorunludur.",
      startDate: "Başlangıç ve bitiş tarihi zorunludur.",
      endDate: "Başlangıç ve bitiş tarihi zorunludur.",
    });
    expect(hasStep1Errors(errors)).toBe(true);
  });

  it("metinler project-form MESSAGES ile aynı kaynaktan", () => {
    const errors = validateStep1(makeForm({ projectName: "", city: "", contractNo: "", signatureDate: "" }));
    expect(errors.projectName).toBe(MESSAGES.nameRequired);
    expect(errors.city).toBe(MESSAGES.cityRequired);
    expect(errors.contractNo).toBe(MESSAGES.contractNoRequired);
    expect(errors.signatureDate).toBe(MESSAGES.signatureDateRequired);
  });

  it("bitiş < başlangıç (tarih sırası 422'si önlenir); eşit gün geçerli", () => {
    expect(validateStep1(makeForm({ startDate: "2026-10-02", endDate: "2026-10-01" })).endDate).toBe(
      "Bitiş tarihi başlangıçtan önce olamaz.",
    );
    expect(validateStep1(makeForm({ startDate: "2026-10-02", endDate: "2026-10-02" }))).toEqual({});
  });

  it("takvimde olmayan tarih boş sayılır", () => {
    expect(validateStep1(makeForm({ startDate: "2026-02-30" })).startDate).toBe(MESSAGES.datesRequired);
    expect(validateStep1(makeForm({ signatureDate: "abc" })).signatureDate).toBe(MESSAGES.signatureDateRequired);
  });

  it("fiyat farkı açık: endeks türü + D0 zorunlu (iki alan da işaretlenir); kapalıyken denetlenmez", () => {
    const open = validateStep1(makeForm({ hasPriceEscalation: true }));
    expect(open).toEqual({ indexType: MESSAGES.escalationRequired, baseIndexValue: MESSAGES.escalationRequired });
    const closed = validateStep1(makeForm({ hasPriceEscalation: false, baseIndexValue: "abc" }));
    expect(closed).toEqual({});
    expect(validateStep1(makeForm({ hasPriceEscalation: true, indexType: "tufe", baseIndexValue: "1234,5" }))).toEqual({});
  });

  it("D0 biçimi: sayı, ≥ 0, ≤ 3 ondalık, ≤ 12 hane (Numeric(12,3))", () => {
    const withD0 = (baseIndexValue: string) =>
      validateStep1(makeForm({ hasPriceEscalation: true, indexType: "ufe", baseIndexValue })).baseIndexValue;
    expect(withD0("abc")).toBe(MESSAGES.notANumber);
    expect(withD0("-1")).toBe(MESSAGES.negativeAmount);
    expect(withD0("1,2345")).toBe("En fazla 3 ondalık");
    expect(withD0("1.000.000.000")).toBe("En fazla 999.999.999,999");
    expect(withD0("999999999,999")).toBeUndefined();
    expect(withD0("0")).toBeUndefined();
  });

  it("uzunluk sınırları (ad 150 · il 100 · sözleşme no 100 · şantiye adı 150); şantiye adı yalnız şantiye açıkken", () => {
    const long = (n: number) => "x".repeat(n);
    expect(validateStep1(makeForm({ projectName: long(150), city: long(100), contractNo: long(100) }))).toEqual({});
    expect(validateStep1(makeForm({ projectName: long(151), city: long(101), contractNo: long(101) }))).toEqual({
      projectName: "En çok 150 karakter",
      city: "En çok 100 karakter",
      contractNo: "En çok 100 karakter",
    });
    expect(validateStep1(makeForm({ openSite: true, siteName: long(151) })).siteName).toBe("En çok 150 karakter");
    expect(validateStep1(makeForm({ openSite: false, siteName: long(151) }))).toEqual({});
    expect(validateStep1(makeForm({ openSite: true, siteName: "  " }))).toEqual({});
  });
});

describe("Adım 2 · geçerli durum", () => {
  it("fiyatsız kaleme B.F. girilmiş taslak: hata yok", () => {
    const errors = check(filled());
    expect(errors).toEqual({ groups: {}, rows: {}, general: {} });
    expect(hasStep2Errors(errors)).toBe(false);
  });
});

describe("Adım 2 · satır kutuları (T30, ÜS-F5-16)", () => {
  it("🔴 fiyatsız kalem B.F. boşken ilerlemeyi ENGELLER: 'Birim fiyat girin'", () => {
    const errors = check(rowsFromRevision(revision, DISCIPLINE_BY_CATALOG));
    expect(errors.rows["o:it-2"]).toEqual({ bf: "Birim fiyat girin" });
    expect(hasStep2Errors(errors)).toBe(true);
  });
  it("miktar 0 / boş / belirsiz nokta; B.F. negatif; her ikisi birlikte", () => {
    const draft = setBf(setQty(setQty(filled(), "o:it-1", "0"), "o:it-3", "28.5"), "o:it-3", "-2");
    const errors = check(draft);
    expect(errors.rows["o:it-1"]).toEqual({ qty: "Miktar 0'dan büyük olmalı" });
    expect(errors.rows["o:it-3"]).toEqual({ qty: "Ondalık için virgül kullanın (ör. 28,50)", bf: "Birim fiyat negatif olamaz." });
    expect(check(setQty(filled(), "o:it-1", "")).rows["o:it-1"]).toEqual({ qty: "Miktar girin" });
  });
  it("çıkarılmış satırın geçersiz kutusu hata DEĞİL", () => {
    const draft = toggleIncluded(setQty(filled(), "o:it-1", "0"), "o:it-1");
    expect(check(draft).rows).toEqual({});
  });
  it("yeni satırda miktar boş zorunlu (ÜS-F5-15)", () => {
    const draft = addFromCatalog(filled(), "g:g-ince", [FRESH]);
    expect(check(draft).rows["n:0"]).toEqual({ qty: "Miktar girin", bf: "Birim fiyat girin" });
    expect(check(setBf(draft, "n:0", "60")).rows["n:0"]).toEqual({ qty: "Miktar girin" });
  });
});

describe("Adım 2 · kod ve grup adı tekrarı (SO-29/30)", () => {
  it("kod tekrarı: iki satırda da 'Kalem kodu tekrar ediyor ({kod})' (kırpılmış kod)", () => {
    const errors = check(setCode(filled(), "o:it-3", ` ${BETON.poz_no} `));
    expect(errors.rows["o:it-1"]).toEqual({ code: `Kalem kodu tekrar ediyor (${BETON.poz_no})` });
    expect(errors.rows["o:it-3"]).toEqual({ code: `Kalem kodu tekrar ediyor (${BETON.poz_no})` });
  });
  it("çıkarılmış satır kodu çakışma yaratmaz; çakışma çözülünce hata gider", () => {
    const dup = setCode(filled(), "o:it-3", BETON.poz_no);
    expect(check(toggleIncluded(dup, "o:it-3")).rows).toEqual({});
    expect(check(setCode(dup, "o:it-3", "DUV-9")).rows).toEqual({});
  });
  it("boş / uzun kod (Poz No metinleri)", () => {
    expect(check(setCode(filled(), "o:it-3", "  ")).rows["o:it-3"]).toEqual({ code: "Poz No zorunludur." });
    expect(check(setCode(filled(), "o:it-3", "x".repeat(51))).rows["o:it-3"]).toEqual({
      code: "Poz No en fazla 50 karakter olabilir.",
    });
  });
  it("grup adı tekrarı: 'Bu adla grup var' iki grupta; tamamen çıkarılmış grup çakışmaz", () => {
    const dup = renameGroup(filled(), "g:g-ince", "KABA İNŞAAT");
    expect(check(dup).groups).toEqual({ "g:g-kaba": "Bu adla grup var", "g:g-ince": "Bu adla grup var" });
    const out = toggleIncluded(toggleIncluded(dup, "o:it-1"), "o:it-2");
    expect(check(out).groups).toEqual({});
  });
  it("boş / uzun grup adı (yalnız gövdeye girecek grup)", () => {
    expect(check(renameGroup(filled(), "g:g-ince", " ")).groups).toEqual({ "g:g-ince": "Grup adı zorunlu" });
    expect(check(renameGroup(filled(), "g:g-ince", "g".repeat(201))).groups).toEqual({ "g:g-ince": "En çok 200 karakter" });
    expect(check(renameGroup(filled(), "g:g-bos", " ")).groups).toEqual({});
  });
});

describe("Adım 2 · teklif kalemi bağı (sunucu 422'leri gönderim ÖNCESİ)", () => {
  it("teklif kalemi son revizyonda yok → 'Kalem teklifin son revizyonunda bulunamadı'", () => {
    const stale = rowsFromRevision(revision, DISCIPLINE_BY_CATALOG);
    const ghost = { ...stale, rows: stale.rows.map((r) => (r.key === "o:it-3" ? { ...r, offerItemId: "silinmis" } : r)) };
    expect(validateStep2(setBf(ghost, "o:it-2", "100"), revision).rows["o:it-3"]).toEqual({
      offerItem: "Kalem teklifin son revizyonunda bulunamadı",
    });
  });
  it("katalog bağı uyuşmuyor → 'Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor'", () => {
    const stale = filled();
    const mismatch = { ...stale, rows: stale.rows.map((r) => (r.key === "o:it-3" ? { ...r, catalogItemId: BETON.id } : r)) };
    expect(check(mismatch).rows["o:it-3"]).toEqual({ offerItem: "Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor" });
  });
  it("yeni satır (offer_item_id yok) bu denetime takılmaz", () => {
    const draft = setBf(setQty(addFromCatalog(filled(), "g:g-ince", [FRESH]), "n:0", "5"), "n:0", "60");
    expect(check(draft).rows).toEqual({});
  });
});

describe("Adım 2 · genel kurallar", () => {
  it("en az bir dahil kalem (boş gövde 422'si önlenir)", () => {
    const errors = check(ALL_OUT(filled()));
    expect(errors.general.noItems).toBe("En az bir kalem sözleşmeye dahil olmalı");
    expect(hasStep2Errors(errors)).toBe(true);
  });

  it("🔴 tavan: 2000 kalem geçerli, 2001 'En fazla 2000 kalem dönüştürülebilir'", () => {
    const entries = (n: number) => Array.from({ length: n }, (_, i) => ({ ...SIVA, id: `c${i}`, poz_no: `P-${i}` }));
    const room = MAX_CONVERT_ITEMS - 3; // 3 dahil teklif satırı var
    const at = addFromCatalog(filled(), "g:g-ince", entries(room));
    const atLimit = Object.fromEntries(at.rows.filter((r) => r.isNew).map((r) => [r.key, r]));
    const quantified = { ...at, rows: at.rows.map((r) => (atLimit[r.key] ? { ...r, contract: { qtyRaw: "1", bfRaw: "1" } } : r)) };
    expect(quantified.rows.filter((r) => r.included)).toHaveLength(2000);
    expect(check(quantified).general.tooMany).toBeUndefined();
    const over = addFromCatalog(quantified, "g:g-ince", [{ ...SIVA, id: "extra", poz_no: "P-X" }]);
    expect(check(over).general.tooMany).toBe("En fazla 2000 kalem dönüştürülebilir");
  });

  it("çıkarılan teklif satırı tavana sayılmaz (2001 satır, 2000 dahil → geçerli)", () => {
    const entries = Array.from({ length: MAX_CONVERT_ITEMS - 2 }, (_, i) => ({ ...SIVA, id: `c${i}`, poz_no: `P-${i}` }));
    const draft = toggleIncluded(addFromCatalog(filled(), "g:g-ince", entries), "o:it-1");
    expect(draft.rows).toHaveLength(MAX_CONVERT_ITEMS + 1);
    expect(check(draft).general.tooMany).toBeUndefined();
  });

  it("🔴 Σ ≥ 10^16: 'Kalem toplamı sözleşme bedeli sınırını aşıyor' (amount gönderilmediği için sunucu reddederdi)", () => {
    const huge = setBf(setQty(filled(), "o:it-1", "1.000.000.000"), "o:it-1", "1.000.000.000.000");
    expect(check(huge).general.amountLimit).toBe("Kalem toplamı sözleşme bedeli sınırını aşıyor");
    const ok = setBf(setQty(filled(), "o:it-1", "1.000.000"), "o:it-1", "1.000.000.000");
    expect(check(ok).general.amountLimit).toBeUndefined();
  });

  it("karışık disiplinli grupta eşleme ZORUNLU DEĞİL (SO-31)", () => {
    const mixed = setBf(setQty(addFromCatalog(filled(), "g:g-kaba", [FRESH]), "n:0", "3"), "n:0", "60");
    expect(check(mixed)).toEqual({ groups: {}, rows: {}, general: {} });
  });

  it("TÜM hatalar tek çağrıda (ilk hata değil): satır + grup + genel", () => {
    let draft = renameGroup(rowsFromRevision(revision, DISCIPLINE_BY_CATALOG), "g:g-ince", "KABA İNŞAAT");
    draft = setCode(setQty(draft, "o:it-1", "0"), "o:it-3", BETON.poz_no);
    const errors = check(draft);
    expect(Object.keys(errors.groups)).toHaveLength(2);
    expect(errors.rows["o:it-1"]).toEqual({ qty: "Miktar 0'dan büyük olmalı", code: `Kalem kodu tekrar ediyor (${BETON.poz_no})` });
    expect(errors.rows["o:it-2"]).toEqual({ bf: "Birim fiyat girin" });
    expect(errors.rows["o:it-3"]).toEqual({ code: `Kalem kodu tekrar ediyor (${BETON.poz_no})` });
  });
});
