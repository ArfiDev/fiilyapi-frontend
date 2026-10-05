import type { EquipmentEditResponse } from "@/lib/api/hooks/useEquipmentDetail";

import type { EquipmentFormValues } from "./form-state";

/**
 * 🔴 K5 KAPISI — "sunucudaki `null`ı EZME".
 *
 * M2'de bazı seçicilerin **boş seçeneği YOKTUR**: sunucuda `null` olsalar bile
 * ekranda ilk (ya da `selected`) seçenek GÖRÜNÜR. Kullanıcı o seçiciyi hiç
 * AÇMADAN kaydederse, anahtarın gitmesi kullanıcının VERMEDİĞİ bir kararı
 * veriye yazmak olurdu — sunucudaki `null` sessizce EZİLİRDİ.
 *
 * Mockup satır satır denetlendi (`Form - Makine Ekle.dc.html`):
 *
 * | Alan | Satır | Boş seçenek | Kapıya girer mi |
 * |---|---|---|---|
 * | `depreciation_years` | 100 | YOK (5/10/15 Yıl) | ✅ EVET |
 * | `financing` | 102 | YOK (Hayır — Peşin ilk) | ✅ EVET |
 * | `rate_period` | 109 | YOK (Saatlik ilk) | ✅ EVET |
 * | `fuel_type` | 121 | YOK ("—" = `none` ENUM'u, boş DEĞİL) | ✅ EVET |
 * | `maintenance_period` | 123 | YOK (500 Saat `selected`) | ✅ EVET |
 * | `norm_unit` | 122 (bölünmüş) | YOK (Lt/saat ilk) | ✅ EVET |
 * | `category` | 85 | **VAR** ("Seçiniz...") | ❌ hayır |
 * | `supplier_id` | 108 | **VAR** ("— (Kendi malımız)") | ❌ hayır |
 * | `site_id` | 118 | **VAR** ("Seçiniz..." + "Depoda") | ❌ hayır |
 * | `operator_id` | 119 | **VAR** ("Seçiniz...") | ❌ hayır |
 * | `status` | 120 | YOK — ama sunucuda **NOT NULL** | ❌ hayır (ezilecek `null` YOK) |
 * | `ownership` | 54-66 | — (radyo) — sunucuda **NOT NULL** | ❌ hayır |
 *
 * `status`/`ownership`/`category` sunucuda `NOT NULL`dır (MK-1 §2.1): orada
 * `null` HİÇ oluşamaz, dolayısıyla ezilecek bir değer de yoktur. Kapıya
 * alınsalardı ölü bir kod yolu doğardı.
 *
 * Emsaller: `8ac9369` (personel `wage_type`/`payment_method`) ·
 * F-TB1 `progress-payments/period-fields.ts` (tip-kilitli `omitFields`).
 */

/**
 * PATCH gövdesinden ATLANABİLİR alanlar. 🔴 Serbest `string[]` DEĞİL: yanlış
 * yazılmış bir alan adı DERLEMEDE yakalanmalı, sessizce yutulmamalı.
 */
export type OmittableEquipmentField =
  | "depreciation_years"
  | "financing"
  | "rate_period"
  | "fuel_type"
  | "maintenance_period"
  | "norm_unit";

/**
 * Atlanabilir alanın SUNUCU anahtarı ↔ FORM alanı eşlemesi. Tek yerde durur:
 * ikisi ayrı listelerde yaşasaydı biri eklenip öbürü unutulduğunda kapı
 * sessizce delinirdi.
 */
export const OMITTABLE_FIELD_SOURCES: Readonly<
  Record<OmittableEquipmentField, keyof EquipmentFormValues>
> = {
  depreciation_years: "depreciationYears",
  financing: "financing",
  rate_period: "ratePeriod",
  fuel_type: "fuelType",
  maintenance_period: "maintenancePeriod",
  norm_unit: "normUnit",
};

/** `OMITTABLE_FIELD_SOURCES`in anahtarları — döngüler bunun üzerinden gezer. */
export const OMITTABLE_EQUIPMENT_FIELDS = Object.keys(
  OMITTABLE_FIELD_SOURCES,
) as readonly OmittableEquipmentField[];

/**
 * Düzenleme kipinde ATLANACAK anahtarları hesaplar.
 *
 * Kural TEK CÜMLE: **sunucudaki değer `null` VE kullanıcı alana hiç
 * dokunmadıysa** anahtar gövdeye HİÇ KONMAZ. `null` GÖNDERİLMEZ — o da
 * sunucudaki değeri ezerdi (burada `null` zaten `null`dır, ama aynı deseni
 * `null` göndererek kurmak alışkanlığı bozardı ve dolu değerde yanlış olurdu).
 *
 * Dolu gelen alan normal gider (gerileme koruması); kullanıcı dokunduysa
 * seçimi normal gider. **Oluşturma kipi bu fonksiyona hiç uğramaz** —
 * orada ezilecek bir sunucu değeri YOKTUR.
 */
export function omittedEquipmentFields(
  detail: EquipmentEditResponse | undefined,
  touched: ReadonlySet<keyof EquipmentFormValues>,
): readonly OmittableEquipmentField[] {
  if (!detail) return [];
  return OMITTABLE_EQUIPMENT_FIELDS.filter(
    (field) => detail[field] === null && !touched.has(OMITTABLE_FIELD_SOURCES[field]),
  );
}

/**
 * IZN-F4d.2 — `maliyet_kar` gizliyken sunucu şu üç para alanını `null` döner ve `PATCH /equipment/{id}`'de DOLU
 * gönderilmesini reddeder (403; `IZN-B4d-SOZLESME.md` §5). Form bu alanları salt okunur "—" + kilit çizer ve PATCH
 * gövdesinden ÇIKARIR (`null` da gönderilmez). POST serbesttir — `detail` yoksa hiçbiri maskeli değildir.
 */
export type MaskableEquipmentMoneyField = "purchase_amount" | "market_value" | "rate_amount";

export const MASKABLE_EQUIPMENT_MONEY_FIELDS: readonly MaskableEquipmentMoneyField[] = [
  "purchase_amount",
  "market_value",
  "rate_amount",
];

/** Kategori gizli (`isHidden`) VE sunucu değeri `null` olan para alanları (kategori gizli ama değer dolu ise alan normal). */
export function maskedEquipmentMoneyFields(
  detail: EquipmentEditResponse | undefined,
  isHidden: boolean,
): readonly MaskableEquipmentMoneyField[] {
  if (!detail || !isHidden) return [];
  return MASKABLE_EQUIPMENT_MONEY_FIELDS.filter((field) => detail[field] === null);
}
