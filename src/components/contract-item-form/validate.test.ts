import { describe, it, expect } from "vitest";

import { MAX_LENGTH, NEW_GROUP_OPTION } from "./constants";
import {
  parseEmployerQuantity,
  validateEmployerItem,
  validateSubcontractorItem,
  type ContractItemFormValues,
  type EmployerItemFormValues,
} from "./validate";

const VALID: ContractItemFormValues = {
  code: "03.012",
  description: "Perde betonu C30/37",
  unit: "m³",
  quantity: "1240.5",
  unitPrice: "2850",
  sortOrder: "",
};

// 🔴 TKL-F2.6a (K6/T30): İŞV formu metni Türkçe okur ("1240,5"; nokta = binlik) — TAŞ formunun
// nokta-ondalık "1240.5"i burada BELİRSİZdir, bu yüzden miktar/fiyat ezilir.
const VALID_EMPLOYER: EmployerItemFormValues = {
  ...VALID,
  quantity: "1240,5",
  groupId: "gggggggg-0000-0000-0000-000000000001",
  groupName: "",
};

// 🔴 TKL-F7a (T42): TAŞ formu da T30 okur — nokta-ondalık "1240.5" belirsizdir (REF_PRICE_AMBIGUOUS_DOT).
const VALID_SUB: ContractItemFormValues = { ...VALID, quantity: "1240,5" };

describe("validateSubcontractorItem (TAŞ)", () => {
  it("geçerli formda sorun bulmaz", () => {
    expect(validateSubcontractorItem(VALID_SUB)).toBeNull();
  });

  it("🔴 birim fiyat BOŞ bırakılabilir — hata değildir", () => {
    expect(validateSubcontractorItem({ ...VALID_SUB, unitPrice: "" })).toBeNull();
  });

  it("zorunlu alanları mockup sırasıyla yakalar", () => {
    expect(validateSubcontractorItem({ ...VALID_SUB, code: " " })?.field).toBe("code");
    expect(validateSubcontractorItem({ ...VALID_SUB, description: "" })?.field).toBe("description");
    expect(validateSubcontractorItem({ ...VALID_SUB, unit: "" })?.field).toBe("unit");
    expect(validateSubcontractorItem({ ...VALID_SUB, quantity: "" })?.field).toBe("quantity");
  });

  it("miktar sıfır veya negatifken reddeder (şema `exclusiveMinimum: 0`)", () => {
    expect(validateSubcontractorItem({ ...VALID_SUB, quantity: "0" })?.field).toBe("quantity");
    expect(validateSubcontractorItem({ ...VALID_SUB, quantity: "-5" })?.field).toBe("quantity");
  });

  it("sayı olmayan miktarı reddeder", () => {
    expect(validateSubcontractorItem({ ...VALID_SUB, quantity: "abc" })?.field).toBe("quantity");
  });

  it("negatif birim fiyatı reddeder (şema `minimum: 0`)", () => {
    expect(validateSubcontractorItem({ ...VALID_SUB, unitPrice: "-1" })?.field).toBe("unitPrice");
  });

  it("uzunluk sınırlarını şemadan uygular", () => {
    const longCode = "x".repeat(MAX_LENGTH.code + 1);
    expect(validateSubcontractorItem({ ...VALID_SUB, code: longCode })?.field).toBe("code");
    const longUnit = "x".repeat(MAX_LENGTH.unit + 1);
    expect(validateSubcontractorItem({ ...VALID_SUB, unit: longUnit })?.field).toBe("unit");
  });

  it("Sıra boş olabilir ama ondalık/negatif olamaz", () => {
    expect(validateSubcontractorItem({ ...VALID_SUB, sortOrder: "" })).toBeNull();
    expect(validateSubcontractorItem({ ...VALID_SUB, sortOrder: "3" })).toBeNull();
    expect(validateSubcontractorItem({ ...VALID_SUB, sortOrder: "-1" })?.field).toBe("sortOrder");
    expect(validateSubcontractorItem({ ...VALID_SUB, sortOrder: "1.5" })?.field).toBe("sortOrder");
  });
});

describe("validateEmployerItem (İŞV)", () => {
  it("geçerli formda sorun bulmaz", () => {
    expect(validateEmployerItem(VALID_EMPLOYER)).toBeNull();
  });

  it("🔴 poz grubu ZORUNLUdur ve ilk sırada denetlenir", () => {
    const problem = validateEmployerItem({ ...VALID_EMPLOYER, groupId: "", code: "" });
    expect(problem?.field).toBe("group");
  });

  it("🔴 birim fiyat ZORUNLUdur — TAŞ formunun tersine boş geçilemez", () => {
    const problem = validateEmployerItem({ ...VALID_EMPLOYER, unitPrice: "" });
    expect(problem?.field).toBe("unitPrice");
    expect(problem?.message).toBe("Birim Fiyat zorunludur.");
  });

  it("negatif birim fiyatı reddeder", () => {
    expect(validateEmployerItem({ ...VALID_EMPLOYER, unitPrice: "-3" })?.field).toBe("unitPrice");
  });

  // F-POZGRUP · "+ Yeni Grup" dalının SINIR değeri. Kanon: her uzunluk sınırı
  // `N` kabul · `N+1` reddedilir diye AYRI AYRI sınanır.
  it("🔴 yeni grup adı SINIRDA (2000) kabul edilir, 2001'de reddedilir", () => {
    const newGroup = { ...VALID_EMPLOYER, groupId: NEW_GROUP_OPTION };

    expect(validateEmployerItem({ ...newGroup, groupName: "g".repeat(2000) })).toBeNull();

    const problem = validateEmployerItem({ ...newGroup, groupName: "g".repeat(2001) });
    expect(problem?.field).toBe("groupName");
    expect(problem?.message).toBe("Grup Adı en fazla 2000 karakter olabilir.");
  });

  it("🔴 uzunluk sınırı YALNIZ yeni grup dalında koşar — mevcut grup seçiliyken groupName YOK SAYILIR", () => {
    expect(
      validateEmployerItem({ ...VALID_EMPLOYER, groupName: "g".repeat(2001) }),
    ).toBeNull();
  });
});

describe("parseEmployerQuantity · T30 (K6/K7)", () => {
  const ok = (value: string) => ({ kind: "ok", value });
  const err = (message: string) => ({ kind: "error", problem: { field: "quantity", message } });

  it("'1.500' → 1500 (binlik), '1,5' → 1.5 (ondalık), '2,125' → 2.125 (kayıpsız metin)", () => {
    expect(parseEmployerQuantity("1.500")).toEqual(ok("1500"));
    expect(parseEmployerQuantity("1,5")).toEqual(ok("1.5"));
    expect(parseEmployerQuantity("2,125")).toEqual(ok("2.125"));
    expect(parseEmployerQuantity(" 1.234.567,125 ")).toEqual(ok("1234567.125"));
  });

  it("belirsiz nokta ('1.5', '0.500', '1234.567') reddedilir — onaylı metin", () => {
    const message = "Ondalık için virgül kullanın (ör. 28,50)";
    expect(parseEmployerQuantity("1.5")).toEqual(err(message));
    expect(parseEmployerQuantity("0.500")).toEqual(err(message));
    expect(parseEmployerQuantity("1234.567")).toEqual(err(message));
  });

  it("boş / sayı değil / sıfır / negatif: mevcut miktar metinleri", () => {
    expect(parseEmployerQuantity("  ")).toEqual(err("Miktar zorunludur."));
    expect(parseEmployerQuantity("abc")).toEqual(err("Miktar sayı olmalıdır."));
    expect(parseEmployerQuantity("0")).toEqual(err("Miktar sıfırdan büyük olmalıdır."));
    expect(parseEmployerQuantity("0,000")).toEqual(err("Miktar sıfırdan büyük olmalıdır."));
    expect(parseEmployerQuantity("-5")).toEqual(err("Miktar sıfırdan büyük olmalıdır."));
  });

  it("Numeric(14,3): 3 kesir ve 11 tam basamak SINIRDA kabul, bir fazlası reddedilir", () => {
    expect(parseEmployerQuantity("1,125")).toEqual(ok("1.125"));
    expect(parseEmployerQuantity("1,1255").kind).toBe("error");
    expect(parseEmployerQuantity("99999999999").kind).toBe("ok");
    expect(parseEmployerQuantity("100000000000").kind).toBe("error");
  });
});

describe("validateEmployerItem · T30 miktar/fiyat metni (K6)", () => {
  it("🔴 belirsiz miktar ('1.5') ve belirsiz fiyat ('28.5') satır hatasıdır", () => {
    expect(validateEmployerItem({ ...VALID_EMPLOYER, quantity: "1.5" })).toEqual({
      field: "quantity",
      message: "Ondalık için virgül kullanın (ör. 28,50)",
    });
    expect(validateEmployerItem({ ...VALID_EMPLOYER, unitPrice: "28.5" })).toEqual({
      field: "unitPrice",
      message: "Ondalık için virgül kullanın (ör. 28,50)",
    });
  });

  it("Türkçe girdi geçerlidir: '1.500' miktar, '28.500,75' fiyat", () => {
    expect(
      validateEmployerItem({ ...VALID_EMPLOYER, quantity: "1.500", unitPrice: "28.500,75" }),
    ).toBeNull();
  });
});

describe("UNIT_OPTIONS — T47 metre kanonu", () => {
  it("birim listesinde 'm' var, 'mt' yok (kullanıcı onaylı mockup sapması)", async () => {
    const { UNIT_OPTIONS } = await import("./constants");
    expect(UNIT_OPTIONS).toContain("m");
    expect(UNIT_OPTIONS).not.toContain("mt");
  });
});
