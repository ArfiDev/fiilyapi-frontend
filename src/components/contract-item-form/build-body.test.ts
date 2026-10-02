import { describe, it, expect } from "vitest";

import {
  buildEmployerItemBody,
  buildSubcontractorItemBody,
  nextSortOrder,
} from "./build-body";
import type { ContractItemFormValues, EmployerItemFormValues } from "./validate";

const BASE: ContractItemFormValues = {
  code: "03.012",
  description: "Perde betonu C30/37",
  unit: "m³",
  quantity: "1240.500",
  unitPrice: "2850.75",
  sortOrder: "",
};

// 🔴 TKL-F2.6a (K6): İŞV formu girdisi HAM Türkçe metindir ("1.240,5"); gövde nokta-ondalık olur.
const EMPLOYER_BASE: EmployerItemFormValues = {
  ...BASE,
  quantity: "1.240,5",
  unitPrice: "2.850,75",
  groupId: "gggggggg-0000-0000-0000-000000000001",
  groupName: "",
};

describe("nextSortOrder", () => {
  it("mevcut en büyük sıranın bir fazlasını verir", () => {
    expect(nextSortOrder([0, 5, 3])).toBe(6);
  });

  it("liste boşken sıfırdan başlar", () => {
    expect(nextSortOrder([])).toBe(0);
  });
});

describe("buildSubcontractorItemBody (TAŞ)", () => {
  it("miktar/fiyat DECIMAL-STRING kalır — Number turu yoktur", () => {
    const body = buildSubcontractorItemBody(
      { ...BASE, quantity: "0.10000000000000000001", unitPrice: "12345678901234567890.99" },
      0,
    );
    expect(body.quantity).toBe("0.10000000000000000001");
    expect(body.unit_price).toBe("12345678901234567890.99");
  });

  it("🔴 birim fiyat BOŞken gövdeye `null` gider — `0` ASLA türetilmez", () => {
    const body = buildSubcontractorItemBody({ ...BASE, unitPrice: "   " }, 0);
    expect(body.unit_price).toBeNull();
  });

  it("metin alanlarını kırpar", () => {
    const body = buildSubcontractorItemBody(
      { ...BASE, code: "  03.012 ", description: " Perde ", unit: " m³ " },
      0,
    );
    expect(body).toMatchObject({ code: "03.012", description: "Perde", unit: "m³" });
  });

  it("Sıra boşken hesaplanan varsayılanı, doluyken kullanıcının değerini kullanır", () => {
    expect(buildSubcontractorItemBody(BASE, 6).sort_order).toBe(6);
    expect(buildSubcontractorItemBody({ ...BASE, sortOrder: "9" }, 6).sort_order).toBe(9);
  });

  it("şemada olmayan alan taşımaz (yalnız altı anahtar)", () => {
    expect(Object.keys(buildSubcontractorItemBody(BASE, 0)).sort()).toEqual([
      "code",
      "description",
      "quantity",
      "sort_order",
      "unit",
      "unit_price",
    ]);
  });
});

describe("buildEmployerItemBody (İŞV)", () => {
  it("grup kimliğini ve zorunlu fiyatı string olarak taşır", () => {
    const body = buildEmployerItemBody(EMPLOYER_BASE, 0);
    expect(body.group_id).toBe(EMPLOYER_BASE.groupId);
    expect(body.unit_price).toBe("2850.75");
    expect(body.quantity).toBe("1240.5");
  });

  it("🔴 K6: ham Türkçe metin kayıpsız nokta-ondalık dizeye çevrilir ('1.500' → '1500', '28,5' → '28.50')", () => {
    const body = buildEmployerItemBody({ ...EMPLOYER_BASE, quantity: "1.500", unitPrice: "28,5" }, 0);
    expect(body.quantity).toBe("1500");
    expect(body.unit_price).toBe("28.50");
  });

  it("🔴 K6: okunamayan miktar/fiyat sessizce geçirilmez — fırlatır (doğrulama atlanmış demektir)", () => {
    expect(() => buildEmployerItemBody({ ...EMPLOYER_BASE, quantity: "1.5" }, 0)).toThrow();
    expect(() => buildEmployerItemBody({ ...EMPLOYER_BASE, unitPrice: "28.5" }, 0)).toThrow();
  });

  it("🔴 SALT-OKUNUR fiyat farkı alanları gövdeye GİRMEZ", () => {
    const keys = Object.keys(buildEmployerItemBody(EMPLOYER_BASE, 0));
    expect(keys).not.toContain("has_price_escalation");
    expect(keys).not.toContain("index_type");
    expect(keys.sort()).toEqual([
      "code",
      "description",
      "group_id",
      "quantity",
      "sort_order",
      "unit",
      "unit_price",
    ]);
  });

  it("Sıra boşken grup içi varsayılanı kullanır", () => {
    expect(buildEmployerItemBody(EMPLOYER_BASE, 11).sort_order).toBe(11);
  });

  it("🔴 TKL-F2.2: elle ekleme gövdesi `catalog_item_id` TAŞIMAZ (bağ yalnız katalog seçiciden toplu eklemede)", () => {
    expect(Object.keys(buildEmployerItemBody(EMPLOYER_BASE, 0))).not.toContain("catalog_item_id");
  });
});
