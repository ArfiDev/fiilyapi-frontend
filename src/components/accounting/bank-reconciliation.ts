import type { ChartAccountResponse } from "@/lib/api/hooks/useChartOfAccounts";
import type { TrialBalanceResponse } from "@/lib/api/hooks/useTrialBalance";
import { subtractDecimalStrings } from "@/lib/decimal";

/**
 * F-MUP · Banka Mutabakatı ekranının SAF katmanı. Kanonik mockup
 * `Muhasebe - Banka Mutabakatı.dc.html` (BM); yorumlardaki sayılar O dosyanın
 * SATIR numaralarıdır. Bu modülde AĞ ve DOM yoktur; testi
 * `bank-reconciliation.test.ts`tedir.
 */

/**
 * 🔴 **ÖLÇÜLMÜŞ SÖZLEŞME BOŞLUĞU — EKRANIN SEÇİCİSİ NEYİN KÜMESİ.**
 *
 * BM:74-78 seçiciyi BANKA HESAPLARIYLA çizer (`Ziraat Bank – Vadesiz` …) ve
 * sağ paneli `102.01 – Ziraat Bank Hesabı` diye adlandırır — yani mockup
 * banka kartı ile muhasebe hesabı arasında BİR BAĞ olduğunu varsayar.
 *
 * `openapi.json` ölçüldü (2026-08-26): `BankAccountResponse` şemasında
 * `chart_of_accounts`a giden HİÇBİR alan YOKTUR (`id` · `bank_name` ·
 * `account_type` · `iban` · `display_name` · `opening_balance` · `is_active`
 * · `created_at` · `updated_at` · `balance`). Ters yönde de yok. Yani
 * "bu banka kartının defter hesabı hangisidir" sorusunun sunucuda CEVABI
 * YOK.
 *
 * Bu yüzden seçici HAZİNE KARTLARINI değil, HESAP PLANINI listeler: kümesi
 * "kodu `102` ile başlayan hesaplar"dır. Uydurma bir eşleştirme (ada göre
 * benzerlik, sıraya göre denklik) kurulsaydı ekran YANLIŞ hesabın defterini
 * doğru başlıkla basardı ve dört kapı da yeşil kalırdı.
 */
export const BANK_LEDGER_CODE_PREFIX = "102";

/**
 * Hesap planından banka hesaplarını süzer.
 *
 * 🔴 `startsWith` kod üzerindedir, AD üzerinde değil: "Bankalar" adı
 * serbest metindir ve kullanıcı onu değiştirebilir; TDHP kodu ise sabittir.
 */
export function bankLedgerAccounts(
  accounts: readonly ChartAccountResponse[],
): readonly ChartAccountResponse[] {
  return accounts.filter((account) => account.code.startsWith(BANK_LEDGER_CODE_PREFIX));
}

/**
 * BM:243-246 · seçilen hesabın KAPANIŞ bakiyesi, mizandan.
 *
 * 🔴 Defter satırlarından TOPLANMAZ: `/journal` SAYFALANMIŞTIR ve görünen
 * satırların toplamı dönemin kapanışı değildir. Mizan bu sayının TEK
 * kaynağıdır (Mizan sekmesiyle aynı uç, aynı sayı).
 *
 * `closing_*` NET'tir (şema: "en fazla BİRİ dolu"); banka hesabı bir
 * varlıktır, normalde BORÇ bakiyesi verir — ama kredili çalışan bir hesap
 * ALACAK verebilir ve o hâlde sayı NEGATİF olarak gösterilir. `debit −
 * credit` bu yüzden dize aritmetiğiyle alınır (`Number` taşması: mizan
 * notundaki 2⁵³ tuzağı).
 *
 * 🔴 IZN-F4b.2: kapanış taraflarından biri `null` (rol için gizli) ise `null` döner
 * (`subtractDecimalStrings` null'ı 0 saymaz) — "bakiye 0" değil "bakiye bilinmiyor".
 *
 * Hesap mizanda HİÇ YOKSA `undefined` döner — bu "sıfır" DEĞİLDİR
 * (K-MKD3): `include_empty=false` hareketsiz hesabı eler, yani cevap
 * "bu hesap bu dönemde hiç hareket görmedi"dir ve ekran öyle yazar.
 */
export function ledgerClosingBalance(
  trialBalance: TrialBalanceResponse | undefined,
  accountId: string,
): string | null | undefined {
  const row = trialBalance?.rows.find((item) => item.account_id === accountId);
  if (row === undefined) return undefined;
  return subtractDecimalStrings(row.closing_debit, row.closing_credit);
}
