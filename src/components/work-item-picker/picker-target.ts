/**
 * TKL-F3.6 · seçici HEDEF ADAPTÖRÜ (TKL-F3-PLAN §3.1). İki tüketici: işveren sözleşmesi (F2, varsayılan)
 * ve teklif revizyonu (F3). Hedefe göre değişen her şey burada: başlık/alt metin/bant, fiyat kolonu etiketi,
 * seçilemezlik gerekçesi (`PickerRules`), Σ etiketi, altbilgi bağlantısı ve TOPLU UÇ GÖVDESİ.
 * Sözleşme hedefi F2'nin mevcut davranışıdır — metinler/gövde BİREBİR korunur.
 */
import type { EmployerContractItemsBulkCreateRequest } from "@/lib/api/hooks/useContractMutations";
import type { OfferItemsBulkBody } from "@/lib/api/hooks/useOfferMutations";

import { compareDecimalStrings } from "@/lib/decimal";

import { buildBulkBody, requirePricedEntries, suggestedPriceValue, type ResolvedEntry } from "./picker-model";
import { CONTRACT_RULES, OFFER_RULES, type PickerRules } from "./picker-rules";

export interface PickerTarget<TBody> extends PickerRules {
  title: string;
  /** `bağlam · subtitle` (bağlam yoksa yalnız subtitle). */
  subtitle: string;
  noteLead: string;
  noteRest: string;
  unsavedLabel: string;
  tableCaption: string;
  /** Araç çubuğu onay kutusu etiketi. */
  hideLabel: string;
  /** Fiyat kolonu başlığı. */
  priceHeader: string;
  /** `${poz_no} ${priceAriaSuffix}` — fiyat kutusunun erişilebilir adı. */
  priceAriaSuffix: string;
  /** Altbilgi Σ etiketi. */
  totalLabel: string;
  /** Altbilgi solundaki ikincil bağlantı etiketi. */
  manualAddLabel: string;
  /** Sözleşme: bağlantı seçiciyi KAPATIR (kirli seçim için onay sorulur). Teklif: yeni sekmede açar, seçici AÇIK kalır. */
  manualAddClosesPicker: boolean;
  buildBody: (entries: readonly ResolvedEntry[], groupId: string, baseSortOrder: number) => TBody;
}

export type ContractBulkBody = EmployerContractItemsBulkCreateRequest;

/** ÜS-F2-2 / ÜS-F2-3 (SABAH ONAYI varsayılanları) — F2 davranışı. */
export const CONTRACT_PICKER_TARGET: PickerTarget<ContractBulkBody> = {
  ...CONTRACT_RULES,
  title: "Katalogdan Poz Ekle",
  subtitle: "İş Kalemi Kataloğu'ndan işveren sözleşmesine poz ekle",
  noteLead: "Poz no, tanım ve birim katalogdan kopyalanır.",
  noteRest:
    " Sözleşmede sonradan değiştirilebilir, katalog değişmez — birim fiyat son fiyattan, yoksa referans fiyattan önerilir.",
  unsavedLabel: "Katalogdan poz seçimi",
  tableCaption: "Katalogdan sözleşmeye eklenebilecek pozlar",
  hideLabel: "Sözleşmede olanları gizle",
  priceHeader: "Birim fiyat",
  priceAriaSuffix: "birim fiyat",
  totalLabel: "Eklenecek Tutar",
  manualAddLabel: "Katalogda yok mu? Elle poz ekle",
  manualAddClosesPicker: true,
  buildBody: (entries, groupId, baseSortOrder) => buildBulkBody(requirePricedEntries(entries), groupId, baseSortOrder),
};

/**
 * Teklif gövdesindeki maliyet alanının ÜÇ hâli (`item_service.py`, `model_fields_set` ayrımı):
 * · kullanıcı öneriye DOKUNMADIYSA alan HİÇ gönderilmez → sunucu `suggest_cost(son, ref)` uygular (SO-6/T38;
 *   tek kural tek yerde — istemci yalnız gösterir) · değiştirdiyse açık değer · önerili kutuyu SİLDİYSE açık null.
 * Öneri yokken (ya da rol maskeliyken) boş kutu da "dokunulmadı"dır: sunucu kendi kuralını uygular.
 */
function costField(entry: ResolvedEntry): { cost_unit_price?: string | null } {
  const suggested = suggestedPriceValue(entry.item);
  if (entry.unitPrice === null) return suggested === null ? {} : { cost_unit_price: null };
  if (suggested !== null && compareDecimalStrings(entry.unitPrice, suggested) === 0) return {};
  return { cost_unit_price: entry.unitPrice };
}

/** `POST …/revisions/{rev}/items/bulk` — kopyalanan alanlar (`poz_no/description/unit/unit_mhr`) GÖNDERİLMEZ (sunucu kopyalar). */
function buildOfferBulkBody(entries: readonly ResolvedEntry[], groupId: string, baseSortOrder: number): OfferItemsBulkBody {
  return {
    items: entries.map((entry, index) => ({
      catalog_item_id: entry.item.id,
      group_id: groupId,
      quantity: entry.quantity,
      sort_order: baseSortOrder + index,
      ...costField(entry),
    })),
  };
}

/** TKL-F3.6 · teklif revizyonu hedefi (plan §3.1 farkları tablosu + ÜS-F3-18/19). */
export const OFFER_PICKER_TARGET: PickerTarget<OfferItemsBulkBody> = {
  ...OFFER_RULES,
  title: "Katalogdan Kalem Ekle",
  subtitle: "İş Kalemi Kataloğu'ndan teklife kalem ekle",
  noteLead: "Poz no, tarif, birim ve adam-saat katalogdan kopyalanır.",
  noteRest: " Maliyet son fiyattan, yoksa referans fiyattan önerilir; teklifte değiştirilebilir, katalog değişmez.",
  unsavedLabel: "Katalogdan kalem seçimi",
  tableCaption: "Katalogdan teklife eklenebilecek kalemler",
  hideLabel: "Teklifte olanları gizle",
  priceHeader: "Maliyet B.F.",
  priceAriaSuffix: "maliyet B.F.",
  totalLabel: "Eklenecek maliyet",
  manualAddLabel: "Katalogda yok mu? Kataloğa yeni kalem ekle",
  manualAddClosesPicker: false,
  buildBody: buildOfferBulkBody,
};
