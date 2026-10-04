import { describe, expect, it } from "vitest";

import {
  BOQ_EDIT,
  DIARY_REOPEN_APPROVE,
  EV_BUDGET_EDIT,
  EV_DAILY_APPROVE,
  EV_FREEZE_APPROVE,
  EV_UNLOCK_APPROVE,
  RENTAL_APPROVE,
  TIMESHEET_EDIT,
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

  it("bütçe yazma kapısı ayarlar.planlama'yı da içerir", () => {
    expect(EV_BUDGET_EDIT).toContain("ayarlar.planlama");
  });
});
