import { describe, it, expect } from "vitest";
import {
  buildSubcontractorLineRows,
  buildSubcontractorLinesSaveBody,
  type SubcontractorContractItem,
} from "./th-lines";
import type { SubcontractorProgressPaymentLineRead } from "@/lib/api/hooks/useSubcontractorProgressPayments";

function item(overrides: Partial<SubcontractorContractItem> = {}): SubcontractorContractItem {
  return {
    id: "item-1",
    contract_id: "contract-1",
    source_contract_item_id: null,
    code: "03.001",
    description: "Kat Döşemesi Betonu C25/30",
    unit: "m³",
    quantity: "0",
    unit_price: "1200.00",
    sort_order: 0,
    group: { id: "g-1", name: "A — Betonarme İşleri" },
    line_total: "0",
    ...overrides,
  } as SubcontractorContractItem;
}

function line(overrides: Partial<SubcontractorProgressPaymentLineRead> = {}): SubcontractorProgressPaymentLineRead {
  return {
    id: "line-1",
    contract_item_id: "item-1",
    code: "03.001",
    description: "Kat Döşemesi Betonu C25/30",
    unit: "m³",
    contract_unit_price: "1200.00",
    coefficient: "1",
    quantity: "320",
    group_name: "A — Betonarme İşleri",
    sort_order: 0,
    quantity_source: "manual",
    adjusted_unit_price: "1200.00",
    line_total: "384000.00",
    ...overrides,
  } as SubcontractorProgressPaymentLineRead;
}

describe("buildSubcontractorLineRows", () => {
  it("her sözleşme kalemi için, kayıtlı satırı olmasa bile, miktarı 0 ile başlayan bir satır üretir", () => {
    const rows = buildSubcontractorLineRows([item()]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      itemId: "item-1",
      quantity: "0",
      quantitySource: "manual",
      lineTotal: null,
      contractUnitPrice: "1200.00",
    });
  });

  it("kayıtlı satır varsa onun miktarını/kaynağını/tutarını kullanır (sözleşme kaleminin varsayılanı DEĞİL)", () => {
    const rows = buildSubcontractorLineRows([item()], [line()]);
    expect(rows[0]).toMatchObject({
      quantity: "320",
      lineTotal: "384000.00",
      quantitySource: "manual",
    });
  });

  it("quantity_source iki dalı da taşır: 'diary' rozet/vurgu altyapısı için korunur", () => {
    const rows = buildSubcontractorLineRows(
      [item()],
      [line({ quantity_source: "diary", quantity: "320" })],
    );
    expect(rows[0].quantitySource).toBe("diary");
  });

  it("fix round 1 (Important) — sözleşme kaleminin unit_price'ı null ise contractUnitPrice null'dır (SESSİZCE '0'a düşürülmez)", () => {
    const rows = buildSubcontractorLineRows([item({ unit_price: null })]);
    expect(rows[0].contractUnitPrice).toBeNull();
    expect(rows[0].lineTotal).toBeNull();
  });

  it("gerçek sıfır birim fiyat ('0.00') null'dan AYRIŞIR — pending DEĞİL, gerçek '0' olarak taşınır", () => {
    const rows = buildSubcontractorLineRows([item({ unit_price: "0.00" })]);
    expect(rows[0].contractUnitPrice).toBe("0.00");
  });

  it("unit_price null olsa bile kayıtlı satır varsa (LineRead.contract_unit_price ZORUNLU) contractUnitPrice yine dolu gelir", () => {
    const rows = buildSubcontractorLineRows(
      [item({ unit_price: null })],
      [line({ contract_unit_price: "1200.00" })],
    );
    expect(rows[0].contractUnitPrice).toBe("1200.00");
  });

  it("grupsuz kalemde groupName null'dır", () => {
    const rows = buildSubcontractorLineRows([item({ group: null })]);
    expect(rows[0].groupName).toBeNull();
  });

  it("kalemleri sort_order'a göre sıralar", () => {
    const rows = buildSubcontractorLineRows([
      item({ id: "b", sort_order: 2 }),
      item({ id: "a", sort_order: 1 }),
    ]);
    expect(rows.map((r) => r.itemId)).toEqual(["a", "b"]);
  });
});

describe("buildSubcontractorLinesSaveBody — PUT lines DEĞİŞTİRME semantiği", () => {
  it("TÜM satırları gönderir, miktarı '0' olanlar DAHİL (eksik gönderilen satır sunucuda SİLİNİR)", () => {
    const rows = buildSubcontractorLineRows([
      item({ id: "a", sort_order: 0 }),
      item({ id: "b", sort_order: 1 }),
    ]);
    const { body } = buildSubcontractorLinesSaveBody(rows);
    expect(body).toHaveLength(2);
    expect(body.map((l) => l.contract_item_id)).toEqual(["a", "b"]);
    expect(body.every((l) => l.quantity === "0")).toBe(true);
  });

  it("her satır için coefficient GÖNDERMEZ (satır bazlı katsayı girişi yok, mevcut korunur/varsayılan uygulanır)", () => {
    const rows = buildSubcontractorLineRows([item()]);
    const { body } = buildSubcontractorLinesSaveBody(rows);
    expect(body[0]).not.toHaveProperty("coefficient");
  });

  it("sort_order'ı korur", () => {
    const rows = buildSubcontractorLineRows([item({ sort_order: 7 })]);
    const { body } = buildSubcontractorLinesSaveBody(rows);
    expect(body[0].sort_order).toBe(7);
  });

  it("kaydetmeden hemen önce boş/geçersiz miktarları '0'a normalize eder", () => {
    const rows = buildSubcontractorLineRows([item()]).map((r) => ({ ...r, quantity: "" }));
    const { body } = buildSubcontractorLinesSaveBody(rows);
    expect(body[0].quantity).toBe("0");
  });
});

// KAT-F2.4 · Q2: kayıtlı satır VARSA satırın Bakanlık poz no'su anlık görüntüsü, yoksa kalemin kodu.
describe("buildSubcontractorLineRows — sourceCode (Q2)", () => {
  it("kayıtlı satır yok → kalemin source_code'u", () => {
    const rows = buildSubcontractorLineRows([item({ source_code: "15.250.1011" })]);
    expect(rows[0].sourceCode).toBe("15.250.1011");
  });

  it("kayıtlı satır VAR ve snapshot'ı kalemden FARKLI → SATIRIN snapshot'ı", () => {
    const rows = buildSubcontractorLineRows(
      [item({ source_code: "15.250.1011" })],
      [line({ source_code: "35.140.3195-D" })],
    );
    expect(rows[0].sourceCode).toBe("35.140.3195-D");
  });

  it("kayıtlı satırın snapshot'ı null ise kalemin kodu ÖRTÜLMEZ: null", () => {
    const rows = buildSubcontractorLineRows([item({ source_code: "15.250.1011" })], [line({ source_code: null })]);
    expect(rows[0].sourceCode).toBeNull();
  });

  it("gövde (PUT lines) source_code TAŞIMAZ", () => {
    const rows = buildSubcontractorLineRows([item({ source_code: "15.250.1011" })], [line({ source_code: "1" })]);
    for (const entry of buildSubcontractorLinesSaveBody(rows).body) expect(entry).not.toHaveProperty("source_code");
  });
});
