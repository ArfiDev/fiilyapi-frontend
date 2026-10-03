import { describe, expect, it } from "vitest";
import { backendErrorMessage, submitBlockedReasons } from "./error-message";
import { BackendError } from "@/lib/api/unwrap";

describe("backendErrorMessage", () => {
  it("string detail dondurur", () => {
    expect(backendErrorMessage(new BackendError(409, { detail: "e-posta kullanimda" }))).toBe("e-posta kullanimda");
  });

  it("validation dizisinden ilk msg'yi dondurur", () => {
    expect(backendErrorMessage(new BackendError(422, { detail: [{ msg: "gecersiz e-posta", loc: ["body", "email"] }] }))).toBe("gecersiz e-posta");
  });

  it("katalog servis 422 zarfı {detail: string, errors: [...]} → detail metni", () => {
    const err = new BackendError(422, {
      detail: "Satır 3: Bakanlık no zaten kayıtlı",
      errors: [{ index: 2, field: "source_code", message: "zaten kayıtlı" }],
    });
    expect(backendErrorMessage(err)).toBe("Satır 3: Bakanlık no zaten kayıtlı");
  });

  it("pydantic 422 zarfı {detail: [{loc, msg, type}]} → ilk msg; bozuk öğe çökertmez", () => {
    const pydantic = new BackendError(422, {
      detail: [{ loc: ["body", "source_code"], msg: "String should have at most 32 characters", type: "string_too_long" }],
    });
    expect(backendErrorMessage(pydantic)).toBe("String should have at most 32 characters");
    expect(backendErrorMessage(new BackendError(422, { detail: [null] }), "yedek")).toBe("yedek");
    expect(backendErrorMessage(new BackendError(422, { detail: [] }), "yedek")).toBe("yedek");
    expect(backendErrorMessage(new BackendError(422, { detail: [{ loc: [], type: "x" }] }), "yedek")).toBe("yedek");
    expect(backendErrorMessage(new BackendError(422, null), "yedek")).toBe("yedek");
  });

  it("bilinmeyen hatada fallback dondurur", () => {
    expect(backendErrorMessage(new Error("x"))).toBe("Beklenmeyen bir hata oluştu.");
  });
});

// PLN-F2.1 · EV'li şantiyede `POST /diary/{id}/submit` → 422 `{detail, reasons[]}`
// (backend `DiarySubmitBlockedError`; `detail` = reasons'ın "; " ile birleşimi).
describe("submitBlockedReasons", () => {
  const blocked = new BackendError(422, {
    detail: "Miktar girilmedi; 3 a-s dağıtılmamış; gerekçe gerekli",
    reasons: ["Miktar girilmedi", "3 a-s dağıtılmamış; gerekçe gerekli"],
  });

  it("422 + reasons[] → gerekçeleri SIRASIYLA ve AYRI AYRI döner (detail'i ';'den bölmez)", () => {
    expect(submitBlockedReasons(blocked)).toEqual([
      "Miktar girilmedi",
      "3 a-s dağıtılmamış; gerekçe gerekli",
    ]);
  });

  it("yanıt gövdesi aynı kalır — backendErrorMessage birleşik detail'i vermeye devam eder", () => {
    expect(backendErrorMessage(blocked)).toBe("Miktar girilmedi; 3 a-s dağıtılmamış; gerekçe gerekli");
  });

  it("FastAPI doğrulama 422'si (reasons yok, detail dizisi) → null", () => {
    expect(
      submitBlockedReasons(new BackendError(422, { detail: [{ msg: "x", loc: ["body"] }] })),
    ).toBeNull();
  });

  it("422 dışı durum reasons taşısa da → null (409 kilit ayrı daldır)", () => {
    expect(submitBlockedReasons(new BackendError(409, { detail: "kilitli", reasons: ["a"] }))).toBeNull();
  });

  it("boş reasons → null (engel yok sayılır, jenerik hata dalı)", () => {
    expect(submitBlockedReasons(new BackendError(422, { detail: "", reasons: [] }))).toBeNull();
  });

  it("dizi olmayan / metin olmayan öğeler güvenilmez — metin olmayan öğe atılır, hiç metin yoksa null", () => {
    expect(submitBlockedReasons(new BackendError(422, { detail: "x", reasons: "Miktar girilmedi" }))).toBeNull();
    expect(submitBlockedReasons(new BackendError(422, { detail: "x", reasons: [1, null, " "] }))).toBeNull();
    expect(
      submitBlockedReasons(new BackendError(422, { detail: "x", reasons: [42, "Hava bilgisi eksik"] })),
    ).toEqual(["Hava bilgisi eksik"]);
  });

  it("BackendError olmayan hata → null", () => {
    expect(submitBlockedReasons(new Error("ağ"))).toBeNull();
    expect(submitBlockedReasons(undefined)).toBeNull();
  });
});
