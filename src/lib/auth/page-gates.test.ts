import { describe, expect, it } from "vitest";

import {
  BOQ_EDIT,
  CHART_OF_ACCOUNTS_EDIT,
  CONTRACT_DISTRIBUTION_EDIT,
  DIARY_REOPEN_APPROVE,
  DISCIPLINES_EDIT,
  EMPLOYER_CONTRACT_EDIT,
  EMPLOYER_PAYMENT_APPROVE,
  EMPLOYER_PAYMENT_EDIT,
  EQUIPMENT_ASSET_EDIT,
  EQUIPMENT_FUEL_EDIT,
  EQUIPMENT_RENTAL_EDIT,
  EQUIPMENT_WORK_EDIT,
  EV_BUDGET_EDIT,
  EV_DAILY_APPROVE,
  EV_FREEZE_APPROVE,
  EV_SETTINGS_EDIT,
  EV_UNLOCK_APPROVE,
  JOURNAL_EDIT,
  OFFER_TEMPLATES_EDIT,
  OFFERS_EDIT,
  PERIOD_CLOSE_EDIT,
  RENTAL_APPROVE,
  SALES_BLOCK_EDIT,
  SALES_BULK_UNIT_EDIT,
  SALES_LAND_SHARE_EDIT,
  SALES_UNIT_EDIT,
  SALES_UNIT_IMPORT_EDIT,
  SUBCONTRACTOR_CONTRACT_CREATE_EDIT,
  SUBCONTRACTOR_CONTRACT_EDIT,
  SUBCONTRACTOR_CREATE_EDIT,
  SUBCONTRACTOR_FIRM_EDIT,
  SUBCONTRACTOR_PAYMENT_APPROVE,
  SUBCONTRACTOR_PAYMENT_EDIT,
  TIMESHEET_EDIT,
  UNIT_RATE_CATALOG_EDIT,
  WORK_ITEM_CATALOG_EDIT,
} from "./page-gates";

// Backend `test_izn_b2_sayfa_bayragi_bekcisi.py` sabitleriyle eşleşme bekçisi (düğme → eşik tablosu).
describe("page-gates · backend kümeleriyle eşleşme", () => {
  it("Günlük 'Yeniden Aç' YALNIZ kök saha.gunluk_kayit (73/88 ikizleri B3'e kadar işlevsiz)", () => {
    expect([...DIARY_REOPEN_APPROVE]).toEqual(["saha.gunluk_kayit"]);
  });

  it("Gün Kilidi Aç = bütçe + günlük rapor Onaylar sayfalarının birleşimi (4 sayfa)", () => {
    expect([...EV_UNLOCK_APPROVE].sort()).toEqual(
      [...EV_FREEZE_APPROVE, ...EV_DAILY_APPROVE].sort(),
    );
    expect(EV_UNLOCK_APPROVE).toHaveLength(4);
  });

  it("makine kira Onayla = yalnız saha.makine_kira", () => {
    expect([...RENTAL_APPROVE]).toEqual(["saha.makine_kira"]);
  });

  it("puantaj yazma kapısı bolum.puantaj'ı İÇERMEZ (salt görüntüleme ikizi)", () => {
    expect([...TIMESHEET_EDIT]).toEqual(["saha.puantaj", "santiye.puantaj"]);
  });

  it("BOQ yazma kapısı bolum.is_kalemleri'ni İÇERMEZ", () => {
    expect([...BOQ_EDIT]).toEqual(["santiye.is_kalemleri", "santiye.bolum_dagilimi"]);
  });
});

// IZN-F5b — `IZN-B5b-ESLEME.md` sayfa ayırma kümeleriyle BİREBİR (backend `require_page(s)` çağrıları).
describe("page-gates · IZN-B5b sayfa ayırma kümeleri", () => {
  it.each([
    ["madde 2 blok", SALES_BLOCK_EDIT, ["mali.satis_blok"]],
    ["madde 2 ünite", SALES_UNIT_EDIT, ["mali.satis_unite"]],
    ["madde 2 toplu üretim", SALES_BULK_UNIT_EDIT, ["mali.satis_toplu_uretim"]],
    ["madde 2 excel", SALES_UNIT_IMPORT_EDIT, ["mali.satis_excel"]],
    ["madde 2 paylaşım", SALES_LAND_SHARE_EDIT, ["mali.satis_paylasim"]],
    ["madde 4 hesap planı", CHART_OF_ACCOUNTS_EDIT, ["mali.hesap_plani"]],
    ["madde 4 yevmiye", JOURNAL_EDIT, ["mali.yevmiye"]],
    ["madde 4 dönem kapanışı", PERIOD_CLOSE_EDIT, ["mali.donem_kapanisi"]],
    ["madde 5 HI", EMPLOYER_PAYMENT_EDIT, ["mali.hakedis_isveren", "proje.isveren_hakedis", "santiye.hakedisler"]],
    ["madde 5 HT", SUBCONTRACTOR_PAYMENT_EDIT, ["mali.hakedis_taseron", "proje.taseron_hakedis"]],
    ["madde 6 işveren onay", EMPLOYER_PAYMENT_APPROVE, ["mali.hakedis_isveren", "proje.isveren_hakedis", "santiye.hakedisler"]],
    ["madde 6 taşeron onay", SUBCONTRACTOR_PAYMENT_APPROVE, ["mali.hakedis_taseron", "proje.taseron_hakedis"]],
    ["madde 7 katalog", WORK_ITEM_CATALOG_EDIT, ["teklif.is_kalemi_katalogu"]],
    ["madde 7 poz dağılımı", CONTRACT_DISTRIBUTION_EDIT, ["teklif.poz_dagilimi"]],
    ["madde 7 ISV", EMPLOYER_CONTRACT_EDIT, ["teklif.isveren_sozlesme", "proje.is_kalemleri"]],
    ["madde 7 firma oluştur", SUBCONTRACTOR_CREATE_EDIT, ["teklif.taseron_firmalar", "teklif.sozlesmeler"]],
    ["madde 7 firma düzenle", SUBCONTRACTOR_FIRM_EDIT, ["teklif.taseron_firmalar"]],
    ["madde 7 taşeron sözleşme oluştur", SUBCONTRACTOR_CONTRACT_CREATE_EDIT, ["teklif.sozlesmeler", "teklif.taseron_sozlesme"]],
    ["madde 7 taşeron sözleşme", SUBCONTRACTOR_CONTRACT_EDIT, ["teklif.taseron_sozlesme"]],
    ["madde 7 şablonlar", OFFER_TEMPLATES_EDIT, ["teklif.sablonlar"]],
    ["madde 7 teklifler", OFFERS_EDIT, ["teklif.teklif_hazirlama"]],
    ["madde 9 EVB", EV_BUDGET_EDIT, ["planlama.adam_saat_butcesi", "santiye.adam_saat_butcesi"]],
    ["madde 9 ayar", EV_SETTINGS_EDIT, ["ayarlar.planlama"]],
    ["madde 10 birim oran", UNIT_RATE_CATALOG_EDIT, ["planlama.birim_oran_katalogu"]],
    ["madde 10 disiplin", DISCIPLINES_EDIT, ["planlama.disiplin_yonetimi"]],
    ["madde 11 ekipman", EQUIPMENT_ASSET_EDIT, ["saha.makine_ekipman"]],
    ["madde 11 çalışma", EQUIPMENT_WORK_EDIT, ["saha.makine_calisma"]],
    ["madde 11 yakıt", EQUIPMENT_FUEL_EDIT, ["saha.makine_yakit"]],
    ["madde 11 kira", EQUIPMENT_RENTAL_EDIT, ["saha.makine_kira"]],
  ] as const)("%s", (_name, gate, expected) => {
    expect([...gate]).toEqual([...expected]);
  });
});
