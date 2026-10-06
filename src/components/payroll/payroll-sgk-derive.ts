import type { PayrollSgkSummaryResponse } from "@/lib/api/hooks/usePayrollSgk";

import {
  SGK_ROW_INCOME_TAX,
  SGK_ROW_SGK_EMPLOYEE,
  SGK_ROW_SGK_EMPLOYER,
  SGK_ROW_STAMP_TAX,
  SGK_ROW_UNEMPLOYMENT_EMPLOYEE,
  SGK_ROW_UNEMPLOYMENT_EMPLOYER,
} from "./payroll-sgk-labels";

/**
 * F-BOR T4 · `/bordro/sgk` ekranının SAF türetmeleri (mockup
 * `SGK Bildirimi.dc.html` = "SGK"; yorumlardaki sayılar O dosyanın SATIR
 * numaralarıdır).
 *
 * 🔴 BU DOSYADA PARA ARİTMETİĞİ YOKTUR. Para alanları `string`tir (Decimal) ve
 * SGK özetinin HER toplamı sunucudan hazır gelir — istemcinin toplayacağı bir
 * şey yoktur. `payroll-history-derive.ts`teki `parseKurus` burada gerekmez ve
 * ÇAĞRILMAZ: kuruş toplamak, sunucunun zaten gönderdiği toplamı ikinci kez
 * hesaplamak olurdu.
 */

export interface SgkAmountRow {
  /** React anahtarı + `data-testid` eki. */
  key: string;
  label: string;
  /**
   * Decimal metin, OLDUĞU GİBİ — biçimleme sunum katmanının işi.
   * 🔴 IZN-F4c.2: `null` = maskeli (maas_kisisel gizli); "—" basılır, 0 SAYILMAZ.
   */
  amount: string | null;
}

/**
 * SGK:69-73 — İŞÇİ payları. Dört kalem; toplam (`employee_deduction_total`)
 * AYRI basılır (vurgulu satır), bu diziye girmez.
 *
 * 🔴 Etiketlerde YÜZDE YOKTUR: mockup "%14" · "%0,759" yazar ama bu uç TUTAR
 * döndürür, ORAN döndürmez (oranlar `GET /payroll/rates?year` ucundadır ve o
 * uç bu dilimin işi değildir). Türetilemeyen sayı ekrana YAZILMAZ.
 */
export function sgkEmployeeRows(
  summary: PayrollSgkSummaryResponse,
): readonly SgkAmountRow[] {
  return [
    { key: "sgk-employee", label: SGK_ROW_SGK_EMPLOYEE, amount: summary.sgk_employee_total },
    {
      key: "unemployment-employee",
      label: SGK_ROW_UNEMPLOYMENT_EMPLOYEE,
      amount: summary.unemployment_employee_total,
    },
    { key: "income-tax", label: SGK_ROW_INCOME_TAX, amount: summary.income_tax_total },
    { key: "stamp-tax", label: SGK_ROW_STAMP_TAX, amount: summary.stamp_tax_total },
  ];
}

/**
 * SGK:79-82 — İŞVEREN payları. 🔴🔴 **K2 — BU EKRANIN EN ÖNEMLİ KURALI:**
 * mockup'ın ÜÇÜNCÜ satırı olan `Kısa Çalışma Ödeneği (%1)` (SGK:81)
 * **ÇİZİLMEZ**; dizi İKİ kalem döndürür. Yanındaki iki satır kalır.
 *
 * 🔴 `summary.short_work_total` bu dosyada HİÇ OKUNMAZ ve
 * `employer_burden_total` **SUNUCUDAN GELDİĞİ GİBİ** basılır — kısa çalışma
 * payı o toplamın İÇİNDE olsa bile istemci toplamdan HİÇBİR ŞEY ÇIKARMAZ.
 * Doğru düzeltme sunucu tarafındadır (IK3-SEED oran setinde
 * `short_work_pct = 0` tohumlanması); istemcinin sunucunun sayısını
 * "düzeltmesi", ekranda sunucuda olmayan bir gerçeklik uydurmak olurdu ve iki
 * ekran (bu ekran ile Aylık Bordro'nun işveren maliyeti) sessizce çelişirdi.
 *
 * Bu iddianın kör bekçisi `payroll-sgk-derive.test.ts` ve
 * `PayrollSgkView.test.tsx` içindedir: satırın YOKLUĞU ve toplamın
 * DEĞİŞMEMİŞLİĞİ ayrı ayrı iddia edilir.
 */
export function sgkEmployerRows(
  summary: PayrollSgkSummaryResponse,
): readonly SgkAmountRow[] {
  return [
    { key: "sgk-employer", label: SGK_ROW_SGK_EMPLOYER, amount: summary.sgk_employer_total },
    {
      key: "unemployment-employer",
      label: SGK_ROW_UNEMPLOYMENT_EMPLOYER,
      amount: summary.unemployment_employer_total,
    },
  ];
}

/**
 * `sgk_submitted_at` bir ZAMAN DAMGASIDIR (`date-time`). Ekran yalnız GÜNÜ
 * basar: `new Date(...)` KULLANILMAZ — UTC yorumlanır ve TR saatinde damganın
 * günü bir gün geri kayardı (`payroll-history-derive.ts/paymentDateOf`in aynı
 * gerekçesi). Ayrıştırılamayan girdi olduğu gibi döner.
 */
export function submittedDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}
