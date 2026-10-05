import { describe, expect, it } from "vitest";

import {
  ACCOUNTING_EDIT,
  ACCOUNTING_VIEW,
  CONTRACTS_EDIT,
  CONTRACTS_VIEW,
  DOCUMENTS_EDIT,
  DOCUMENTS_VIEW,
  EQUIPMENT_EDIT,
  EQUIPMENT_VIEW,
  EV_BUDGET_EDIT,
  EV_CATALOG_EDIT,
  EV_VIEW,
  INVOICING_EDIT,
  INVOICING_VIEW,
  PERSONNEL_EDIT,
  PERSONNEL_VIEW,
  TREASURY_EDIT,
  TREASURY_VIEW,
} from "./page-gates";

// IZN-F5-ön — Görür (V) kümeleri backend `VIEW_GATE_PAGES` ile eşleşir; yazma kapısını açan her sayfa
// aynı modülün görme kapısını da açar (Düzenler ⊂ Görür).
describe("page-gates · Görür kümeleri (IZN-F5-ön)", () => {
  it.each([
    ["muhasebe", ACCOUNTING_EDIT, ACCOUNTING_VIEW],
    ["sözleşmeler", CONTRACTS_EDIT, CONTRACTS_VIEW],
    ["belgeler", DOCUMENTS_EDIT, DOCUMENTS_VIEW],
    ["planlama (bütçe)", EV_BUDGET_EDIT, EV_VIEW],
    ["planlama (katalog)", EV_CATALOG_EDIT, EV_VIEW],
    ["makine", EQUIPMENT_EDIT, EQUIPMENT_VIEW],
    ["fatura", INVOICING_EDIT, INVOICING_VIEW],
    ["personel", PERSONNEL_EDIT, PERSONNEL_VIEW],
    ["hazine", TREASURY_EDIT, TREASURY_VIEW],
  ] as const)("%s: Düzenler sayfaları Görür kümesinin içindedir", (_name, edit, view) => {
    const viewKeys: readonly string[] = view;
    expect(edit.every((key) => viewKeys.includes(key))).toBe(true);
  });

  it("muhasebe Görür kümesi 9 sayfa (mizan, KDV, banka, gelir tablosu, bilanço, nakit akışı dahil)", () => {
    expect(ACCOUNTING_VIEW).toHaveLength(9);
    expect(ACCOUNTING_VIEW).toEqual(
      expect.arrayContaining(["mali.mizan", "mali.kdv_beyani", "mali.banka_mutabakati", "mali.gelir_tablosu", "mali.bilanco", "mali.nakit_akisi"]),
    );
  });

  it("planlama Görür kümesi 11 sayfa ve ayarlar.planlama'yı içerir", () => {
    expect(EV_VIEW).toHaveLength(11);
    expect(EV_VIEW).toContain("ayarlar.planlama");
  });
});
