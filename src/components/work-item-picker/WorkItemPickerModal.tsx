"use client";

import {
  CatalogPickerModal,
  type CatalogPickerModalProps,
  type PickerSubmission as CatalogPickerSubmission,
} from "./CatalogPickerModal";
import { CONTRACT_PICKER_TARGET, type ContractBulkBody } from "./picker-target";

/** Sözleşme hedefinin gönderimi (F2.4 host'u bunu tüketir). */
export type PickerSubmission = CatalogPickerSubmission<ContractBulkBody>;

export type WorkItemPickerModalProps = Omit<CatalogPickerModalProps<ContractBulkBody>, "target">;

/**
 * "Katalogdan Poz Ekle" — İŞVEREN SÖZLEŞMESİ hedefi (TKL-F2.4; davranış TKL-F3.6 genelleştirmesinden ÖNCEKİYLE
 * BİREBİR). Gövde hedef-bağımsız `CatalogPickerModal`dadır; teklif hedefi `components/offers`te aynı gövdeyi
 * `OFFER_PICKER_TARGET` ile açar.
 */
export function WorkItemPickerModal(props: WorkItemPickerModalProps) {
  return <CatalogPickerModal<ContractBulkBody> target={CONTRACT_PICKER_TARGET} {...props} />;
}
