import type { TrialBalanceRow } from "@/lib/api/hooks/useTrialBalance";
import { isZeroDecimalString } from "@/lib/decimal";

/**
 * F-MUP · `Muhasebe - Profesyonel` ekranının SAF katmanı. Kanonik mockup
 * `Muhasebe - Profesyonel.dc.html` (MP); yorumlardaki sayılar O dosyanın
 * SATIR numaralarıdır. Bu modülde AĞ ve DOM yoktur; testi
 * `accounting-pro.test.ts`tedir.
 */

/**
 * MP:167-208 sağ raydaki "Hesap Bakiyeleri" satırının hangi TARAFTA kapandığı.
 *
 * 🔴 `flat` üçüncü bir hâldir ve `debit`/`credit`e İNDİRGENEMEZ (K-MKD3 —
 * "SATIR YOK" ile "DEĞER 0" ayrı hâllerdir). `/trial-balance`
 * `include_empty=false` ile HAREKETSİZ hesapları zaten eler; geriye kalan bir
 * satırın iki kapanış tarafı da sıfırsa bu **gerçek bir sıfırdır** (hesap
 * hareket gördü ve tam kapandı). O satırı listeden düşürmek ya da `—`
 * basmak, kullanıcıya hesabın HİÇ HAREKET GÖRMEDİĞİNİ söylerdi — muhasebede
 * bu doğrudan bir para hatasıdır.
 */
export type AccountBalanceSide = "debit" | "credit" | "flat" | "hidden";

export interface AccountBalanceRailRow {
  readonly accountId: string;
  readonly code: string;
  readonly name: string;
  /**
   * `flat` hâlde `"0"` DEĞİL, sunucunun kendi sıfırı. 🔴 IZN-F4b.2: `hidden` hâlde `null`
   * (kapanış tutarları rol için gizli) — `flat` ile KARIŞTIRILMAZ: gizli bakiye "sıfır" değildir.
   */
  readonly amount: string | null;
  readonly side: AccountBalanceSide;
}

/**
 * 🔴 **KARAR-2 KAPSAMINDA ONAYLI MOCKUP SAPMASI — burada hiçbir kod
 * DÖNÜŞTÜRÜLMEZ.** MP sağ rayı ÜÇ HANELİ ana hesaplarla çizer (`100` · `102`
 * · `120` · `153` · `320` · `391` · `730`), defter gövdesini ise ALT
 * HESAPLARLA (`102.01` · `120.01` · `320.04` · `153.01` · `730.01`,
 * MP:154-232). Ekran bu kırılımı **UYDURMAZ** ve tersine de çevirmez: sunucu
 * hangi `account_code`u verirse o basılır — kırpılmaz, genişletilmez,
 * gruplanmaz. Alt hesap açma işi MU-4 dilimindedir (kullanıcı kararı
 * KARAR-2), ve bu sapma sonraki turlarda "mockup tutmuyor" diye GERİ
 * ALINMAZ. Bekçisi `accounting-pro.test.ts`tedir.
 */

/**
 * Mizan satırlarını sağ rayın tek-değerli satırlarına indirger.
 *
 * 🔴 `closing_*` NET'tir (şema notu: "en fazla BİRİ dolu") — bu yüzden
 * çıkarma YAPILMAZ, dolu olan taraf SEÇİLİR. İki taraf da doluymuş gibi
 * davranıp fark alınsaydı sunucunun netlik sözleşmesi istemcide sessizce
 * ikinci kez uygulanır ve iki kaynak ayrışabilirdi.
 */
export function accountBalanceRailRows(
  rows: readonly TrialBalanceRow[],
): readonly AccountBalanceRailRow[] {
  return rows.map((row) => {
    const { closing_credit: credit, closing_debit: debit } = row;
    if (credit !== null && !isZeroDecimalString(credit)) {
      return railRow(row, credit, "credit");
    }
    if (debit !== null && !isZeroDecimalString(debit)) {
      return railRow(row, debit, "debit");
    }
    // Taraflardan biri `null` ise bakiye BİLİNMEZ; "gerçek sıfır" (flat) dalına düşmez.
    if (credit === null || debit === null) {
      return railRow(row, null, "hidden");
    }
    // Gerçek sıfır — sunucunun kendi dizesi korunur ("0" · "0.00" · …).
    return railRow(row, row.closing_debit, "flat");
  });
}

function railRow(
  row: TrialBalanceRow,
  amount: string | null,
  side: AccountBalanceSide,
): AccountBalanceRailRow {
  return {
    accountId: row.account_id,
    code: row.account_code,
    name: row.account_name,
    amount,
    side,
  };
}
