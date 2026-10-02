import { trPriceInputValue, trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import type { PaymentPeriod } from "@/lib/contract-labels";
import type { SubcontractorContractDetail } from "@/lib/api/hooks/useSubcontractorProgressPayments";

/**
 * FSO 88-108 · "Sözleşme Şartları" kartının alanları.
 *
 * AYRI bir tip olmasının nedeni PAYLAŞIMDIR: aynı kart TSD'ye (T7)
 * DÜZENLENEBİLİR olarak konacaktır (spec §5). Tüm alanlar KONTROLLÜ ve string
 * tabanlıdır (sayı/tarih dahil) — `section-form/form-state.ts` deseni; boş →
 * `null` dönüşümü `build-body.ts`in işidir.
 */
export interface ContractTermsValues {
  contractNo: string; // 90
  signatureDate: string; // 91
  isNotarized: boolean; // 92
  startDate: string; // 93
  endDate: string; // 94
  latePenaltyDaily: string; // 95
  advancePct: string; // 99
  retainagePct: string; // 100
  paymentPeriod: PaymentPeriod; // 101
  paymentTermDays: string; // 102
  materialsByContractor: boolean; // 105
  subcontractorFilesOwnSgk: boolean; // 106
  vatWithholding: boolean; // 107
}

/** FSO'nun TAMAMI: bağlam (kart 1) + taşeron (kart 2) + şartlar (kart 3). */
export interface SubcontractorContractFormValues extends ContractTermsValues {
  projectId: string; // 56
  siteId: string; // 60
  subcontractorId: string; // 76
  workCategory: string; // 82
}

/**
 * Varsayılanlar mockup'ın ÖN DOLU değerleridir (99 "10", 100 "5", 101 "Aylık",
 * 102 "30") — bunlar aynı zamanda şema varsayılanlarıdır
 * (`advance_pct: "10"`, `retainage_pct: "5"`, `payment_period: "monthly"`,
 * `payment_term_days: 30`), yani icat değildir.
 *
 * ⚠️ Üç kutucuk (105-107) mockup'ta İKİSİ İŞARETLİ gelir; şema varsayılanı
 * ise üçü de `false`tur. Kutucuk bir SÖZLEŞME ŞARTIdır — kullanıcı görmeden
 * işaretli varsaymak veri yanlışlığı üretir; bu yüzden mockup'ın örnek
 * doldurulmuş hâli değil, şema varsayılanı (`false`) esas alınır ve rapora
 * yazılır.
 */
export function emptyContractTermsValues(): ContractTermsValues {
  return {
    contractNo: "",
    signatureDate: "",
    isNotarized: false,
    startDate: "",
    endDate: "",
    latePenaltyDaily: "",
    advancePct: "10",
    retainagePct: "5",
    paymentPeriod: "monthly",
    paymentTermDays: "30",
    materialsByContractor: false,
    subcontractorFilesOwnSgk: false,
    vatWithholding: false,
  };
}

export function emptySubcontractorContractFormValues(): SubcontractorContractFormValues {
  return {
    ...emptyContractTermsValues(),
    projectId: "",
    siteId: "",
    subcontractorId: "",
    workCategory: "",
  };
}

/**
 * Mevcut sözleşmeden şart alanlarını doldurur. FSO taslağı kaydettikten sonra
 * kendi durumunu KORUR (yeniden tohumlamaz), ama T7'nin TSD ekranı bu
 * dönüştürücüyü kullanacaktır — bu yüzden kart ile birlikte burada durur.
 */
export function contractTermsFromDetail(
  detail: SubcontractorContractDetail,
): ContractTermsValues {
  return {
    contractNo: detail.contract_no ?? "",
    signatureDate: detail.signature_date ?? "",
    isNotarized: detail.is_notarized,
    startDate: detail.start_date ?? "",
    endDate: detail.end_date ?? "",
    // TKL-F7a · T42: sunucu "5000.00" Türkçe gösterilir ("5.000,00"); aksi hâlde T30 okuması "5000.00"ı belirsiz sayar.
    latePenaltyDaily: trPriceInputValue(detail.late_penalty_daily),
    advancePct: trQuantityInputValue(detail.advance_pct),
    retainagePct: trQuantityInputValue(detail.retainage_pct),
    paymentPeriod: detail.payment_period,
    paymentTermDays: String(detail.payment_term_days),
    materialsByContractor: detail.materials_by_contractor,
    subcontractorFilesOwnSgk: detail.subcontractor_files_own_sgk,
    vatWithholding: detail.vat_withholding,
  };
}
