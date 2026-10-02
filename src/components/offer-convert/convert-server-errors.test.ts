import { describe, expect, it } from "vitest";

import { BackendError } from "@/lib/api/unwrap";

import { classifyConvertError, firstIssueStep, locateIssues } from "./convert-server-errors";
import { makeWonRevision } from "./convert-fixtures";
import { rowsFromRevision, toggleIncluded } from "./convert-model";

/** TKL-F5.3 · 409/422 sınıflandırma + `errors[{loc,message}]` → satır/alan eşlemesi (BD-4). */

const err = (status: number, body: unknown) => new BackendError(status, body);

describe("classifyConvertError", () => {
  it("409 zaten dönüştürüldü / kod çakışması / veri bütünlüğü ayrı türler; metin AYNEN", () => {
    expect(classifyConvertError(err(409, { detail: "Teklif zaten dönüştürüldü" }))).toMatchObject({ kind: "already", message: "Teklif zaten dönüştürüldü" });
    expect(classifyConvertError(err(409, { detail: "Bu proje kodu zaten kullanılıyor" }))).toMatchObject({ kind: "codeTaken", message: "Bu proje kodu zaten kullanılıyor" });
    expect(classifyConvertError(err(409, { detail: "Veri bütünlüğü hatası" }))).toMatchObject({ kind: "integrity", message: "Veri bütünlüğü hatası" });
  });
  it("TKL-B6.9: 409 kod çakışması yapısal errors[{loc:[project,code]}] taşır → issues'a girer, detail AYNEN", () => {
    const failure = classifyConvertError(
      err(409, { detail: "Bu proje kodu zaten kullanılıyor", errors: [{ loc: ["project", "code"], message: "Bu proje kodu zaten kullanılıyor" }] }),
    );
    expect(failure).toMatchObject({ kind: "codeTaken", message: "Bu proje kodu zaten kullanılıyor" });
    expect(failure.issues).toEqual([{ loc: ["project", "code"], message: "Bu proje kodu zaten kullanılıyor" }]);
  });
  it("won değil 409'u genel hata (metin aynen)", () => {
    const text = "Yalnız son revizyonu kazanılmış (won) olan teklif projeye dönüştürülebilir";
    expect(classifyConvertError(err(409, { detail: text }))).toMatchObject({ kind: "other", message: text });
  });
  it("403: metin aynen", () => {
    expect(classifyConvertError(err(403, { detail: "Bu işlem için yetkiniz yok" }))).toMatchObject({ kind: "forbidden", message: "Bu işlem için yetkiniz yok" });
  });
  it("422: detail AYNEN + yapısal errors", () => {
    const failure = classifyConvertError(
      err(422, { detail: "groups[0].items[1].code: Kalem kodu tekrar ediyor (X)", errors: [{ loc: ["groups", 0, "items", 1, "code"], message: "Kalem kodu tekrar ediyor (X)" }] }),
    );
    expect(failure.kind).toBe("validation");
    expect(failure.message).toBe("groups[0].items[1].code: Kalem kodu tekrar ediyor (X)");
    expect(failure.issues).toEqual([{ loc: ["groups", 0, "items", 1, "code"], message: "Kalem kodu tekrar ediyor (X)" }]);
  });
  it("FastAPI liste biçimi: ilk msg aynen; loc'taki 'body' öneki atılır", () => {
    const failure = classifyConvertError(
      err(422, { detail: [{ loc: ["body", "contract", "contract_no"], msg: "String should have at least 1 character", type: "x" }] }),
    );
    expect(failure.message).toBe("String should have at least 1 character");
    expect(failure.issues).toEqual([{ loc: ["contract", "contract_no"], message: "String should have at least 1 character" }]);
  });
  it("bozuk errors öğeleri atılır; BackendError olmayan hata genel", () => {
    expect(classifyConvertError(err(422, { detail: "x", errors: [{ loc: "yanlış", message: 3 }, null] })).issues).toEqual([]);
    expect(classifyConvertError(new Error("ağ")).kind).toBe("other");
  });
});

describe("locateIssues (gövde konumu → ekran konumu)", () => {
  const base = () => rowsFromRevision(makeWonRevision());
  // beton it-1 (g-kaba #0 item #0), demir it-2 (#1), siva it-3 (g-ince #1 item #0)
  it("groups[i].items[j].alan: gövde sırası = yalnız DAHİL satırlar ve yalnız GÖNDERİLEN gruplar", () => {
    const draft = toggleIncluded(base(), "o:it-1"); // beton çıkarıldı → kaba grubunun gövde #0 öğesi artık DEMİR
    const located = locateIssues([{ loc: ["groups", 0, "items", 0, "code"], message: "m" }], draft);
    expect(located.rows).toEqual({ "o:it-2": { code: "m" } });
  });
  it("tamamen çıkarılmış grup gövdede yok: sonraki grubun indeksi kayar", () => {
    let draft = toggleIncluded(base(), "o:it-1");
    draft = toggleIncluded(draft, "o:it-2"); // kaba grup tümden çıktı → gövde #0 = İNCE
    const located = locateIssues([{ loc: ["groups", 0, "name"], message: "ad" }], draft);
    expect(located.groups).toEqual({ "g:g-ince": "ad" });
  });
  it("alan eşlemesi: quantity→qty, unit_price→bf, offer_item_id→offerItem, description, unit", () => {
    const located = locateIssues(
      [
        { loc: ["groups", 0, "items", 0, "quantity"], message: "q" },
        { loc: ["groups", 0, "items", 0, "unit_price"], message: "b" },
        { loc: ["groups", 0, "items", 1, "offer_item_id"], message: "o" },
      ],
      base(),
    );
    expect(located.rows).toEqual({ "o:it-1": { qty: "q", bf: "b" }, "o:it-2": { offerItem: "o" } });
  });
  it("project/contract alanları form alanına; amount ve group_disciplines ve bilinmeyen konum genel", () => {
    const located = locateIssues(
      [
        { loc: ["project", "city"], message: "şehir" },
        { loc: ["project", "code"], message: "kod" },
        { loc: ["contract", "contract_no"], message: "no" },
        { loc: ["contract", "base_index_value"], message: "d0" },
        { loc: ["contract", "amount"], message: "bedel" },
        { loc: ["group_disciplines", "X"], message: "eşleme" },
        { loc: ["groups", 9, "name"], message: "yok" },
      ],
      base(),
    );
    expect(located.fields).toEqual({ city: "şehir", projectCode: "kod", contractNo: "no", baseIndexValue: "d0" });
    expect(located.general).toEqual(["bedel", "eşleme", "yok"]);
  });
  it("firstIssueStep: alan → 1, satır/grup → 2, yalnız genel → null", () => {
    const draft = base();
    expect(firstIssueStep(locateIssues([{ loc: ["project", "name"], message: "a" }], draft))).toBe(1);
    expect(firstIssueStep(locateIssues([{ loc: ["groups", 0, "items", 0, "code"], message: "a" }], draft))).toBe(2);
    expect(firstIssueStep(locateIssues([{ loc: ["contract", "amount"], message: "a" }], draft))).toBeNull();
    expect(firstIssueStep(locateIssues([], draft))).toBeNull();
  });
});
