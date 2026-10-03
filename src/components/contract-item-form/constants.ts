/**
 * "Poz Ekle" formlarının metin/seçenek envanteri.
 *
 * İKİ mockup, İKİ ayrı iş kuralı (mockup'ların kendi tasarım notları:
 * TAŞ 30-37 ve İŞV 29-36 — "AYRI dosya olarak çizildi, birleştirilmedi"):
 *   TAŞ = `Form - Poz Ekle Taseron.dc.html`  → `unit_price` BOŞ bırakılabilir
 *   İŞV = `Form - Poz Ekle Isveren.dc.html`  → `group_id` + `unit_price` ZORUNLU
 * Parantez içindeki sayılar ilgili dosyanın SATIR numaralarıdır.
 *
 * Uzunluk sınırları openapi `SubcontractorContractItemCreate` /
 * `EmployerContractItemCreate` şemalarından alınır — ezberden yazılmaz.
 */

import type { components } from "@/lib/api/schema";

export type PriceIndexType = components["schemas"]["PriceIndexType"];

/** openapi `maxLength` değerleri (mockup ipuçlarıyla da örtüşür). */
export const MAX_LENGTH = {
  /** `code` — TAŞ 97 · İŞV 122 "Maks 50 karakter" */
  code: 50,
  /** `description` — TAŞ 108 · İŞV 133 "Maks 2000 karakter" */
  description: 2000,
  /** `unit` — TAŞ 130 · İŞV 155 "Maks 50 karakter" */
  unit: 50,
  /** `name` — openapi `EmployerContractGroupCreate` (mockup'ta alan yok). */
  groupName: 2000,
} as const;

/**
 * Birim açılırının seçenekleri — TAŞ 119-128 / İŞV 144-153 BİREBİR aynı on
 * seçenek. Backend'de karşılık serbest metindir (`unit`, ≤50); enum YOKTUR,
 * bu yüzden liste mockup'ın kendisidir.
 */
export const UNIT_OPTIONS: readonly string[] = [
  "m³",
  "m²",
  "m", // T47 (kullanıcı onaylı mockup sapması): metre kanonu "m"; mockup "mt" yazar
  "Ton",
  "Adet",
  "Kg",
  "Lt",
  "Gün",
  "Saat",
  "Takım",
];

/** TAŞ 118 / İŞV 143 · seçilmemiş birim seçeneği. */
export const UNIT_PLACEHOLDER_OPTION = "Birim seçiniz...";

/** İŞV 106 · seçilmemiş grup seçeneği. */
export const GROUP_PLACEHOLDER_OPTION = "Grup seçiniz...";

/**
 * 🔴 ONAYLI SAPMA — mockup'ta ÇİZİLİ DEĞİL (`Form - Poz Ekle Isveren.dc.html`
 * 104-116 yalnız mevcut grupları listeler).
 *
 * Gerekçe: mockup'ın çizdiği hâl İLK pozu eklemeyi imkânsız kılıyor. Yeni bir
 * işveren sözleşmesinde hiç grup yoktur, `group_id` ise ZORUNLUdur — grup
 * yaratma girişi olmadan sözleşme sonsuza kadar pozsuz kalır. Çözüm İCAT
 * EDİLMEDİ: `BoqItemFormModal` (Ekran 13) aynı problemi aynı sentinel seçenekle
 * çözmüştür, o desen birebir izlenir. Sentinel değeri UUID ile çakışmaz.
 */
export const NEW_GROUP_OPTION = "__new__";

/**
 * İŞV 184-185 · "Fiyat Farkı Uygulanır mı?" seçenekleri. SALT-OKUNURdur:
 * değeri sözleşmenin `has_price_escalation` alanından gelir, poz gövdesine
 * GİRMEZ (poz sözleşmenin ayarını devralır).
 */
export const ESCALATION_OPTIONS = {
  yes: "Evet — endeks/katsayı uygulanır", // 184
  no: "Hayır — sabit fiyat", // 185
} as const;

/**
 * İŞV 192-196 · "Varsayılan Endeks" seçenekleri ↔ `PriceIndexType` enum'u.
 * Mockup'ın DÖRT seçeneği enum'un dört değeriyle birebir eşleşir; başsız
 * seçenek (192) sözleşmede endeks seçilmemiş hâlidir (`index_type === null`).
 * Bu alan da SALT-OKUNURdur ve gövdeye GİRMEZ.
 */
export const INDEX_TYPE_EMPTY_OPTION = "— Hakedişte belirlenir"; // 192

export const INDEX_TYPE_LABELS: Record<PriceIndexType, string> = {
  ufe: "ÜFE (Üretici Fiyatları)", // 193
  tufe: "TÜFE (Tüketici Fiyatları)", // 194
  construction_cost: "İnşaat Maliyet Endeksi", // 195
  fixed_coefficient: "Sabit Katsayı", // 196
};

/** Enum sırası mockup 193-196 sırasıdır. */
export const INDEX_TYPE_ORDER: readonly PriceIndexType[] = [
  "ufe",
  "tufe",
  "construction_cost",
  "fixed_coefficient",
];

/** TAŞ metin envanteri — ekran ve testler tek kaynaktan okur. */
export const SUBCONTRACTOR_ITEM_TEXT = {
  title: "Taşeron Sözleşmesine Poz Ekle", // 74
  subtitle: "Bu sözleşme kapsamında yapılacak iş kalemini tanımla", // 75
  definitionCard: "📋 Poz Tanımı", // 92
  amountCard: "📐 Miktar & Fiyat", // 113
  code: "Poz No", // 95
  codePlaceholder: "03.012", // 96
  codeHint: "Maks 50 karakter", // 97
  sortOrder: "Sıra", // 100
  sortOrderHint: "Sözleşme listesindeki görünüm sırası", // 102
  description: "İş Kalemi Tanımı", // 106
  descriptionPlaceholder:
    "Örn. Perde betonu C30/37 — kalıp ve demir hariç, sadece beton dökümü ve vibrasyon", // 107
  descriptionHint: "Maks 2000 karakter · Hakediş kalemlerinde bu metin görünür", // 108
  unit: "Birim", // 116
  unitHint: "Listede yoksa yazabilirsiniz · Maks 50 karakter", // 130
  quantity: "Miktar", // 133
  quantityPlaceholder: "0", // 134
  quantityHint: "Sözleşme kapsamındaki toplam miktar", // 135
  unitPrice: "Taşeron Birim Fiyatı (₺)", // 141
  unitPricePlaceholder: "Boş bırakılabilir", // 142
  lineTotal: "Bu Pozun Sözleşme Bedeli", // 152
  lineTotalUnpriced: "— Fiyatsız", // 153
  lineTotalHint: "Miktar × Birim Fiyat olarak otomatik hesaplanır", // 155
  summaryCard: "Poz Özeti", // 163
  summaryUnitPrice: "Birim Fiyat", // 167
  summaryUnitPriceMissing: "Girilmedi", // 167
  summaryStatus: "Durum", // 169
  summaryStatusUnpriced: "Fiyatlanmadı", // 170
  contractCard: "Sözleşme Durumu", // 176
  contractItemCount: "Mevcut poz sayısı", // 178
  contractPricedCount: "Fiyatlanmış poz", // 179
  contractUnpricedCount: "Fiyatsız poz", // 180
  contractTotal: "Sözleşme tutarı", // 182
  noteLead: "Not:", // 188
  note: "Birim fiyatlar taşeron sözleşmesinde bir kez belirlenir. Hakediş oluştururken yalnızca miktar girilir, fiyat buradan gelir.", // 188-189
  keepOpen: "Kaydettikten sonra yeni poz ekle", // 198
  cancel: "İptal", // 201
  submit: "Pozu Ekle", // 202
  addItem: "+ Poz Ekle",
} as const;

/**
 * 🔴 TAŞ 143-147 · FİYATSIZ POZ UYARISI — metin mockup'tan BİREBİR.
 *
 * Basılması ZORUNLUdur: fiyatsız kalem satınalma tarafında bilinmeyen tutar
 * demektir (NULL-EŞİK kanonu: bilinmeyen toplanabilir alan eşikte BÜYÜK
 * sayılır). Kullanıcı bu pozu fiyatsız bırakırken ne olduğunu GÖRMELİDİR.
 */
export const UNPRICED_ITEM_WARNING_LEAD = "Birim fiyat girilmedi"; // 145
export const UNPRICED_ITEM_WARNING_BODY =
  " — bu poz fiyatlanana kadar sözleşme tutarına dâhil edilmez, hakediş oluştururken de tutarsız görünür. Fiyatı sonra belirleyecekseniz boş bırakabilirsiniz."; // 145-146

/** İŞV metin envanteri. */
export const EMPLOYER_ITEM_TEXT = {
  title: "İşveren Sözleşmesine Poz Ekle", // 74
  subtitle:
    "Sözleşme poz listesine yeni iş kalemi tanımla — grup ve birim fiyat zorunludur", // 75
  rule: "İşveren sözleşmesi pozlarında poz grubu ve birim fiyat zorunludur — hakediş hesabı ve fiyat farkı katsayısı bu değerler üzerinden yapılır. Fiyatsız poz girilemez.", // 91-93
  definitionCard: "📋 Poz Tanımı", // 102
  amountCard: "📐 Miktar & Fiyat", // 138
  escalationCard: "📈 Fiyat Farkı Ayarı", // 179
  group: "Poz Grubu", // 104
  groupHint: "Pozlar hakediş ve BOQ ekranlarında bu gruba göre gruplanır", // 116
  /** ONAYLI SAPMA (bkz. `NEW_GROUP_OPTION`) — BOQ'un seçenek metni birebir. */
  newGroupOption: "+ Yeni Grup",
  groupName: "Grup Adı",
  groupNameHint: "Poz kaydedilirken bu adla yeni bir poz grubu oluşturulur",
  code: "Poz No", // 120
  codePlaceholder: "03.012", // 121
  codeHint: "Maks 50 karakter", // 122
  sortOrder: "Sıra", // 125
  sortOrderHint: "Grup içindeki görünüm sırası", // 127
  description: "İş Kalemi Tanımı", // 131
  descriptionPlaceholder:
    "Örn. Perde betonu C30/37 — beton, kalıp ve demir dahil, her türlü işçilik ve malzeme", // 132
  descriptionHint: "Maks 2000 karakter · Hakediş ve fatura kalemlerinde bu metin görünür", // 133
  unit: "Birim", // 141
  unitHint: "Maks 50 karakter", // 155
  quantity: "Sözleşme Miktarı", // 158
  quantityPlaceholder: "0", // 159
  quantityHint: "Şantiyelere dağıtılacak toplam", // 160
  unitPrice: "Birim Fiyat (₺)", // 163
  unitPricePlaceholder: "0", // 164
  unitPriceHint: "Sözleşmede sabit — hakedişte değiştirilemez", // 165
  lineTotal: "Bu Pozun Sözleşme Bedeli", // 171
  lineTotalHint: "Miktar × Birim Fiyat · Sözleşme toplamına eklenir", // 174
  escalation: "Fiyat Farkı Uygulanır mı?", // 182
  escalationHint: "Hakediş oluştururken katsayı girilebilir", // 187
  indexType: "Varsayılan Endeks", // 190
  summaryCard: "Poz Özeti", // 206
  summaryGroup: "Grup", // 208
  /**
   * 🔴 Özet rayındaki miktar etiketi FORM alanınınkinden AYRIDIR: mockup 158
   * alanı "Sözleşme Miktarı" derken 210'daki özet satırı yalnız "Miktar" der.
   * Mockup ikisini bilinçle ayırmış (alan uzun/açıklayıcı, dar özet rayı kısa)
   * → tek sabite bağlanmaz.
   */
  summaryQuantity: "Miktar", // 210
  summaryUnitPrice: "Birim Fiyat", // 211
  summaryAmount: "Bedel", // 213
  contractCard: "Sözleşme Durumu", // 220
  contractItemCount: "Mevcut poz", // 222
  contractDistributedCount: "Dağıtılmış poz", // 223
  contractUndistributedCount: "Dağıtılmamış", // 224
  contractTotal: "Sözleşme tutarı", // 226
  noteLead: "Sonraki adım:", // 232
  noteBefore: " Poz eklendikten sonra ", // 232
  noteLink: "Poz Dağılımı", // 232
  noteAfter:
    " ekranından şantiyelere kota atamanız gerekir — aksi halde günlük kayıt ve hakediş yapılamaz.", // 232-233
  goToDistribution: "Kaydettikten sonra poz dağılımı ekranına git", // 242
  cancel: "İptal", // 245
  submit: "Pozu Ekle", // 246
  addItem: "+ Poz Ekle",
} as const;

/** İki formda da ortak olan salt-okunur özet satırı boşluğu. */
export const SUMMARY_DASH = "—";

/**
 * 🔴 İŞV 178-200 · Fiyat farkı alanları SÖZLEŞMENİN ayarıdır, pozun değil.
 * Mockup bu kartı çizmiştir, bu yüzden SİLİNMEZ; ama poz gövdesine bu alanlar
 * GİRMEZ (openapi `EmployerContractItemCreate` böyle bir alan tanımlamaz).
 * Devre-dışı kontrolün gerekçesi `title`da saklı kalmaz (F-TH kanonu).
 */
export const ESCALATION_READONLY_REASON =
  "Fiyat farkı ayarı sözleşmeden gelir — poz onu devralır, burada değiştirilemez";

/**
 * Sözleşmede henüz grup yokken tablonun altına basılan YÖNLENDİRME.
 *
 * 🔴 Eskiden bu metin "önce iş kalemi grubu oluşturulmalı" diyerek kullanıcıyı
 * ÇIKMAZA sokuyordu: grup yaratmanın hiçbir girişi yoktu, `+ Poz Ekle` de
 * kapalıydı. Artık düğme AÇIK ve ilk grup formun içinden ("+ Yeni Grup")
 * yaratılıyor — metin de gerekçe değil EYLEM anlatır.
 */
export const EMPLOYER_NO_GROUPS_HINT =
  "Sözleşmede henüz poz grubu yok — “+ Poz Ekle” ile ilk pozu eklerken grubu da oluşturabilirsiniz";
