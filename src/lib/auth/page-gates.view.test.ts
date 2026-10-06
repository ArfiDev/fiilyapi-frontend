import { describe, expect, it } from "vitest";

import {
  ACCOUNTING_VIEW,
  CHART_OF_ACCOUNTS_EDIT,
  CONTRACT_DISTRIBUTION_EDIT,
  CONTRACTS_VIEW,
  DISCIPLINES_EDIT,
  DOCUMENTS_EDIT,
  DOCUMENTS_VIEW,
  EMPLOYER_CONTRACT_EDIT,
  EQUIPMENT_ASSET_EDIT,
  EQUIPMENT_FUEL_EDIT,
  EQUIPMENT_RENTAL_EDIT,
  EQUIPMENT_VIEW,
  EQUIPMENT_WORK_EDIT,
  EV_BUDGET_EDIT,
  EV_SETTINGS_EDIT,
  EV_VIEW,
  JOURNAL_EDIT,
  OFFER_TEMPLATES_EDIT,
  OFFERS_EDIT,
  PERIOD_CLOSE_EDIT,
  SUBCONTRACTOR_CONTRACT_CREATE_EDIT,
  SUBCONTRACTOR_CONTRACT_EDIT,
  SUBCONTRACTOR_CREATE_EDIT,
  SUBCONTRACTOR_FIRM_EDIT,
  UNIT_RATE_CATALOG_EDIT,
  WORK_ITEM_CATALOG_EDIT,
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
    ["muhasebe (hesap planı)", CHART_OF_ACCOUNTS_EDIT, ACCOUNTING_VIEW],
    ["muhasebe (yevmiye)", JOURNAL_EDIT, ACCOUNTING_VIEW],
    ["muhasebe (dönem kapanışı)", PERIOD_CLOSE_EDIT, ACCOUNTING_VIEW],
    ["sözleşmeler (teklif)", OFFERS_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (şablon)", OFFER_TEMPLATES_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (katalog)", WORK_ITEM_CATALOG_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (poz dağılımı)", CONTRACT_DISTRIBUTION_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (işveren)", EMPLOYER_CONTRACT_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (firma oluştur)", SUBCONTRACTOR_CREATE_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (firma)", SUBCONTRACTOR_FIRM_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (taşeron oluştur)", SUBCONTRACTOR_CONTRACT_CREATE_EDIT, CONTRACTS_VIEW],
    ["sözleşmeler (taşeron)", SUBCONTRACTOR_CONTRACT_EDIT, CONTRACTS_VIEW],
    ["belgeler", DOCUMENTS_EDIT, DOCUMENTS_VIEW],
    ["planlama (bütçe)", EV_BUDGET_EDIT, EV_VIEW],
    ["planlama (ayar)", EV_SETTINGS_EDIT, EV_VIEW],
    ["planlama (birim oran)", UNIT_RATE_CATALOG_EDIT, EV_VIEW],
    ["planlama (disiplin)", DISCIPLINES_EDIT, EV_VIEW],
    ["makine (ekipman)", EQUIPMENT_ASSET_EDIT, EQUIPMENT_VIEW],
    ["makine (çalışma)", EQUIPMENT_WORK_EDIT, EQUIPMENT_VIEW],
    ["makine (yakıt)", EQUIPMENT_FUEL_EDIT, EQUIPMENT_VIEW],
    ["makine (kira)", EQUIPMENT_RENTAL_EDIT, EQUIPMENT_VIEW],
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
