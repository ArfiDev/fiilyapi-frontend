import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import {
  buildDistributionSaveBody,
  CONTRACT_DISTRIBUTION_MAX_CELLS,
  distributionCellKey,
  distributionRejectionMessage,
} from "./contract-distribution-save";

// F-P5 T1 · POZ dağılımı kaydetme = BİRLEŞTİRME (hakediş/puantaj PUT'larının
// TERSİ). Aşağıdaki dört test bu dilimin EN KRİTİK semantiğinin kanıtıdır.

describe("buildDistributionSaveBody — BİRLEŞTİRME semantiği", () => {
  it("DOKUNULMAMIŞ hücre gövdeye GİRMEZ — sunucuda korunur", () => {
    // Izgarada üç hücre var; kullanıcı yalnız birine dokundu.
    const { body } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "120" },
    ]);

    expect(body.allocations).toEqual([
      { contract_item_id: "ci-1", site_id: "s-1", quantity: "120" },
    ]);
    // ci-1/s-2 ve ci-2/s-1 gövdede YOK ⇒ sunucu onlara dokunmaz.
    expect(body.allocations).toHaveLength(1);
  });

  it("BOŞALTILAN hücre `quantity: null` ile gider — bağ koparma", () => {
    const { body, rejections } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "   " },
    ]);

    expect(body.allocations).toEqual([
      { contract_item_id: "ci-1", site_id: "s-1", quantity: null },
    ]);
    expect(rejections).toEqual([]);
  });

  it("`0` ASLA gövdeye girmez — reddedilir (backend 422 verirdi)", () => {
    const { body, rejections } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "0" },
      { contractItemId: "ci-2", siteId: "s-1", value: "0,00" },
      { contractItemId: "ci-3", siteId: "s-1", value: "5" },
    ]);

    expect(body.allocations).toEqual([
      { contract_item_id: "ci-3", site_id: "s-1", quantity: "5" },
    ]);
    expect(rejections.map((r) => r.reason)).toEqual(["zero", "zero"]);
    // `0` SESSİZCE `null`a çevrilmez — kullanıcının niyeti değiştirilmez.
    expect(body.allocations.some((a) => a.quantity === null)).toBe(false);
  });

  it("yalnız KİRLİ hücreler gönderilir — karışık senaryo", () => {
    const { body } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "120.5" },
      { contractItemId: "ci-1", siteId: "s-2", value: "" },
      { contractItemId: "ci-2", siteId: "s-2", value: "8,25" },
    ]);

    expect(body.allocations).toEqual([
      { contract_item_id: "ci-1", site_id: "s-1", quantity: "120.5" },
      { contract_item_id: "ci-1", site_id: "s-2", quantity: null },
      { contract_item_id: "ci-2", site_id: "s-2", quantity: "8.25" },
    ]);
  });
});

describe("buildDistributionSaveBody — girdi ayrıştırma", () => {
  it("virgüllü ondalık noktaya çevrilir, basamaklar KAYIPSIZ korunur", () => {
    const { body } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "1250,400" },
    ]);
    expect(body.allocations[0].quantity).toBe("1250.400");
  });

  // 🔴 KAYIT 426: `decimal.ts::normalizeDecimalInput` ile AYNI kusur burada
  // da vardı — `replace(",", ".")` yalnız İLK virgülü çevirdiği için TR
  // binlik ayraçlı girdi ("1.234,56") iki nokta üretip REDDEDİLİYORDU.
  it("TR binlik ayraçlı girdi kabul edilir (KAYIT 426 düzeltmesi)", () => {
    const { body, rejections } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "1.234,56" },
    ]);
    expect(rejections).toEqual([]);
    expect(body.allocations[0].quantity).toBe("1234.56");
  });

  it("sayı olmayan ve negatif değerler reddedilir", () => {
    const { body, rejections } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "abc" },
      { contractItemId: "ci-2", siteId: "s-1", value: "-4" },
    ]);
    expect(body.allocations).toEqual([]);
    expect(rejections.map((r) => r.reason)).toEqual(["invalid", "invalid"]);
  });

  it("aynı hücre iki kez geçerse SON düzenleme kazanır (ret de temizlenir)", () => {
    const { body, rejections } = buildDistributionSaveBody([
      { contractItemId: "ci-1", siteId: "s-1", value: "0" },
      { contractItemId: "ci-1", siteId: "s-1", value: "42" },
    ]);
    expect(body.allocations).toEqual([
      { contract_item_id: "ci-1", site_id: "s-1", quantity: "42" },
    ]);
    expect(rejections).toEqual([]);
  });

  it("hiç kirli hücre yoksa gövde BOŞ dizi olur", () => {
    expect(buildDistributionSaveBody([]).body).toEqual({ allocations: [] });
  });
});

describe("yardımcılar", () => {
  it("distributionCellKey kalem+şantiyeyi tekilleştirir", () => {
    expect(distributionCellKey("ci-1", "s-1")).toBe("ci-1|s-1");
    expect(distributionCellKey("ci-1", "s-1")).not.toBe(distributionCellKey("ci-1", "s-2"));
  });

  it("ret metinleri Türkçe ve gerekçeye özgüdür", () => {
    expect(distributionRejectionMessage("zero")).toContain("0 olamaz");
    expect(distributionRejectionMessage("invalid")).toContain("geçerli bir sayı");
  });
});

// SZK-F2 · sözleşme ucu da BDG ile AYNI hane sınırı (Numeric(14,3) = 11 tam + 3 ondalık)
// ve hücre tavanı (SZK-B1: ContractDistributionSave 422).
describe("buildDistributionSaveBody — hane sınırı (SZK-F2)", () => {
  const edit = (value: string) => ({ contractItemId: "ci-1", siteId: "s-1", value });

  it.each(["1e30", "0.0004", "123456789012", "1,5e3"])(
    "'%s' görünür 'digits' retidir; gövdeye girmez",
    (value) => {
      const { body, rejections } = buildDistributionSaveBody([edit(value)]);
      expect(rejections.map((r) => r.reason)).toEqual(["digits"]);
      expect(body.allocations).toEqual([]);
    },
  );

  it("11 tam + 3 ondalık sınırda kabul edilir", () => {
    const { body, rejections } = buildDistributionSaveBody([edit("12345678901.123")]);
    expect(rejections).toEqual([]);
    expect(body.allocations[0].quantity).toBe("12345678901.123");
  });

  it("ret metni BDG ile aynıdır", () => {
    expect(distributionRejectionMessage("digits")).toBe(
      "En çok 11 tam ve 3 ondalık hane girilebilir.",
    );
  });

  it("20.001 kirli hücre gövde kurmadan reddedilir, 20.000 kabul edilir", () => {
    const edits = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        contractItemId: `ci-${i}`,
        siteId: "s-1",
        value: "1",
      }));
    const over = buildDistributionSaveBody(edits(CONTRACT_DISTRIBUTION_MAX_CELLS + 1));
    expect(over.cellLimitExceeded).toBe(true);
    expect(over.body.allocations).toEqual([]);
    const ok = buildDistributionSaveBody(edits(CONTRACT_DISTRIBUTION_MAX_CELLS));
    expect(ok.cellLimitExceeded).toBe(false);
    expect(ok.body.allocations).toHaveLength(CONTRACT_DISTRIBUTION_MAX_CELLS);
  });

  it("CONTRACT_DISTRIBUTION_MAX_CELLS openapi maxItems ile aynıdır", () => {
    const spec = JSON.parse(readFileSync(resolve(process.cwd(), "openapi/openapi.json"), "utf8"));
    const save = spec.components.schemas.ContractDistributionSave;
    expect(save.properties.allocations.maxItems).toBe(CONTRACT_DISTRIBUTION_MAX_CELLS);
  });
});
