/**
 * TKL-F3.6 · seçici HEDEF KURALLARI (TKL-F3-PLAN §3.1 farkları tablosu — SAF veri, React'sız).
 *
 * Seçici iki tüketiciye hizmet eder: işveren sözleşmesi (F2) ve teklif revizyonu (F3). Doğrulama ve
 * seçilemezlik kararlarının hedefe göre değişen kısmı yalnız bu küçük veri nesnesidir; `picker-model`
 * bunu parametre olarak alır, varsayılanı SÖZLEŞMEDİR (F2 davranışı birebir). Metin/gövde farkları
 * `picker-target.ts`te toplanır.
 */

export interface PickerPriceMessages {
  required: string;
  notANumber: string;
  negative: string;
}

export interface PickerRules {
  /** Sözleşme: birim fiyat ZORUNLU. Teklif: maliyet B.F. isteğe bağlı (fiyatsız kalem, T31). */
  isPriceRequired: boolean;
  priceMessages: PickerPriceMessages;
  /** Sözleşme: aynı `code` başka kalemde kullanılıyorsa seçilemez. Teklif: poz no kopyadır, çakışma yok. */
  blocksOnCodeCollision: boolean;
  /** "{linkedLabel} · {grup}" — katalog kalemi hedefte zaten varsa gerekçe. */
  linkedLabel: string;
  /** Başka kalemde kullanılan poz no gerekçesi (yalnız `blocksOnCodeCollision`). */
  codeBlockText: string;
}

/** `contract-item-form/validate.ts` ONAYLI metinleri (birebir; `picker-model.test.ts` drift bekçisi). */
export const CONTRACT_RULES: PickerRules = {
  isPriceRequired: true,
  priceMessages: {
    required: "Birim fiyat girin",
    notANumber: "Birim Fiyat sayı olmalıdır.",
    negative: "Birim Fiyat negatif olamaz.",
  },
  blocksOnCodeCollision: true,
  linkedLabel: "Sözleşmede var",
  codeBlockText: "Bu poz no sözleşmede başka bir kalemde kullanılıyor",
};

/** Teklif: maliyet B.F. isteğe bağlı; "Teklifte var · {grup}"; poz no kopya olduğundan kod çakışması engel DEĞİL. */
export const OFFER_RULES: PickerRules = {
  isPriceRequired: false,
  priceMessages: {
    // Boş kutu "girin" hatası DEĞİL (fiyatsız kalem); alan yalnız tutarlılık için dolu.
    required: "Maliyet B.F. girin",
    notANumber: "Maliyet B.F. sayı olmalıdır.",
    negative: "Maliyet B.F. negatif olamaz.",
  },
  blocksOnCodeCollision: false,
  linkedLabel: "Teklifte var",
  codeBlockText: "",
};
