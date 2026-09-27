/**
 * TYPE-F1 FAZ 1 — ölçek marka (branded) tipleri: `Fraction` (0–1 kesir) ve
 * `Percent` (0–100 yüzde), FIX-F1 Kusur 1/2'nin (Maskeli/EvNumber ikisi de
 * `string|number|null|undefined`, okuma şemalarında Decimal alanlar düz
 * `string`) derleyicinin kesir↔yüzde karışıklığını YAKALAYAMAMASINDAN doğdu.
 *
 * 🔴 BEDEL NOTU (CEO kararı, TYPE-F1 spike 2026-09-27) — brand YUMUŞAKTIR:
 * `__scale?:` İSTEĞE BAĞLI. Bunun anlamı:
 * - Düz (markasız) `string` HER İKİ tipe de (`Fraction`e de `Percent`e de)
 *   atanabilir — koruma yalnız "MARKALI YANLIŞ ÖLÇEK" sınıfı içindir: bir
 *   `Percent` değerini `Fraction` bekleyen yere (ya da tersini) vermek HÂLÂ
 *   derleme hatasıdır (iki tip aynı anda `__scale?: "fraction"` ile
 *   `__scale?: "percent"` beklediği için, KARŞI markalı — `__scale` alanı VAR
 *   ve değeri öteki literal olan — bir değer atanamaz).
 * - Markasız bir kaynak (elle yazılmış string, DeepScale'lenmemiş bir model,
 *   bir test fixture'ı) biçimlendiriciye SESSİZCE geçer — tsc hiçbir uyarı
 *   VERMEZ. Bu sınıf hata (dönüşüm hiç yapılmadan ham kesrin/yüzdenin
 *   markasız aktığı durum) bu fazda YAKALANMAZ.
 * - Sert varyant (`readonly __scale: "fraction"`, etiket ZORUNLU) ÖLÇÜLDÜ ve
 *   REDDEDİLDİ: 7 modele uygulanınca 184 tsc hatası ve 3 ÜRETİM hook'unun
 *   (`useEvBudgetMutations.ts`/`useEvCatalog.ts`/`useEvBudget.ts`) KIRILMASI
 *   — aynı alan adının READ ve WRITE şemalarında paylaşılmasından doğan
 *   çakışma. Yumuşak varyant bunu 0 hataya indirdi (bkz. TYPE-F1 spike raporu).
 * - Kapsam: yalnız `DeepScale` ile SARILI model takma adları (bkz. models.ts)
 *   marka taşır; çakışan alan adları (aynı ad, farklı ölçek) otomatik
 *   eşlemeye GİRMEZ, `SCALE_NAME_EXCEPTIONS`te listelenir (aşağıda).
 * - FAZ 2 (henüz YAPILMADI): `formatPercent`in kendi imzasının `Maskeli`den
 *   `Percent | null | undefined`e daraltılması + kalan tüm model takma
 *   adlarının `DeepScale`e sarılması — ancak O ZAMAN "markasız kaynak sessizce
 *   geçer" boşluğu kapanır (tahmini ~160-180 dokunuş, TYPE-F1 spike raporu).
 *
 * Tek açık kaçış `asFraction`/`asPercent` (ve null-geçirgen sürümleri).
 *
 * NOT (faz 1 kapsamı): backend `not-scale` MetricPlaceholder zarflarının iç
 * `.value` alanı, `enum`/`factor` satırları bu fazda İŞLENMEZ — yalnız
 * `fraction`/`percent` adları DeepScale'e girer (bkz. models.ts).
 */
import type { ScaleTableLiteral } from "./scale-table";

/** Backend 0–1 kesir alanı (ör. `progress_pct_cum`, `share`). */
export type Fraction = string & { readonly __scale?: "fraction" };

/** Backend 0–100 yüzde alanı (ör. `advance_pct`, `usage_pct`). */
export type Percent = string & { readonly __scale?: "percent" };

/**
 * Tek açık kaçış: ham backend string'ini `Fraction` olarak işaretler.
 * Çağıran yer TABLODAN doğrulamış olmalı (schema·alan `scale: "fraction"`).
 */
export function asFraction(value: string): Fraction {
  return value as Fraction;
}

/**
 * `asFraction`in null/undefined geçirgen sürümü. `EvNumber` (`DecimalLike`)
 * SINIRINDA `number` da kabul eder — TYPE-F1 SPIKE ÖLÇÜMÜ: `varianceStatus`/
 * `formatVariancePoints` (bu spike'ta imzası DEĞİŞMEYEN EvNumber alanları)
 * `toPoints`u çağırıyor; `number` da runtime'da `toDecimalString` tarafından
 * doğru işlenir (bkz. `decimal.ts`), yalnız STATİK etiket burada atılır.
 */
export function asFractionOrNull<T extends string | number | null | undefined>(
  value: T,
): T extends string | number ? Fraction : T extends null ? null : T extends undefined ? undefined : never {
  return value as never;
}

/** Tek açık kaçış: ham backend string'ini `Percent` olarak işaretler. */
export function asPercent(value: string): Percent {
  return value as Percent;
}

/** `asPercent`in null/undefined geçirgen sürümü. */
export function asPercentOrNull<T extends string | null | undefined>(
  value: T,
): T extends string ? Percent : T extends null ? null : T extends undefined ? undefined : never {
  return value as never;
}

// ---------------------------------------------------------------------------
// DeepScale<T> — alan ADINA göre otomatik marka'lama (bkz. TYPE-F1 emir §3).
// ---------------------------------------------------------------------------

/**
 * Çakışan alan adları — tabloda AYNI ad birden fazla FARKLI `scale` değeriyle
 * geçiyor VE ikisi de openapi'de `string` (ölçüldü: `scale-table.ts` +
 * `schema.d.ts`, bkz. `scale-name-exceptions.test.ts`). Bu adlar DeepScale'in
 * otomatik eşlemesine GİRMEZ — ikinci fazda satır satır elle karar verilir.
 *
 * - `rate`: `CatalogActualSite.rate` (not-scale, birim fiyat) vs
 *   `VatTaxableRow.rate` (percent) — ikisi de `string`.
 * - `progress_pct`: çoğu şema `MetricPlaceholder` ZARFI (nesne, DeepScale
 *   zaten dokunmaz) ama `ProjectListItem`/`DashboardProjectCard`/
 *   `ProjectDetailResponse` düz `string | null` PERCENT'tir — adı tabloda
 *   "not-scale" (zarf satırları) ile "percent" arasında bölündüğü için
 *   gerekçeli olarak dışarıda tutuldu (kanıtsız otomatik eşleme YOK).
 */
export const SCALE_NAME_EXCEPTIONS = ["progress_pct", "rate"] as const;
type ScaleNameException = (typeof SCALE_NAME_EXCEPTIONS)[number];

/**
 * FAZ 2b · `progress_pct` istisnasının maliyet ÖLÇÜMÜ (TYPE-F1 emir madde 8):
 * ad düzeyinde DeepScale bu alanı KALICI OLARAK ayıramaz (yukarıdaki not) ama
 * ŞEMA düzeyinde — tek tek her takma ad için — ucuza marka'lanabilir. Ölçüldü
 * (`scale-table.ts`teki TÜM `progress_pct` satırları tarandı): ALTI şemada
 * (`ProjectListItem`, `DashboardProjectCard`, `ProjectDetailResponse`,
 * `SubcontractorCostRow`, `ProgressPaymentSummary`, `ContractListItem`)
 * `progress_pct` GERÇEKTEN düz `string | null` (`ContractListItem`de
 * OPSİYONEL anahtar) PERCENT'tir (zarf DEĞİL) — yedinci bir takma ad
 * (`ProjectResponse`, aynı `ProjectListItem` şemasını sarar) dahil TOPLAM 7
 * alias satırı dokunuldu (`models.ts`, `useProjects.ts`,
 * `useDashboardSummary.ts`, `useProjectCosts.ts`, `useProgressPayments.ts`,
 * `useContracts.ts`, `dashboard/ProjectCard.tsx`, `dashboard/ProjectGrid.tsx`).
 * Maliyet UCUZ: `Omit<DeepScale<T>, "progress_pct"> & {progress_pct: Percent
 * | null}` sarmalayıcısı (opsiyonel anahtarlı `ContractListItem` için ayrı
 * `WithPlainProgressPctOptional` varyantı) — davranış/metin DEĞİŞMEZ, yalnız
 * önceden markasız giden değer artık derleyici düzeyinde korunur.
 *
 * 🔴 KALAN KORUMASIZ: bu altı şemanın LİSTE/nested kullanımları (ör.
 * `ProjectListResponse.items[]`, `DashboardSummary.projects[]`,
 * `ProjectCostsResponse.breakdown.subcontractors[]`,
 * `ContractListResponse.items[]`) bu sarmalayıcıya GİRMEZ — dizinin öge tipi
 * ayrı bir DeepScale uygulamasıdır ve isim istisnası orada da geçerlidir;
 * yalnız DÜZ tekil takma adlar elle düzeltildi (maliyet/fayda: bu nested
 * yollarda doğrudan `.progress_pct` OKUYAN üretim kodu ÖLÇÜLMEDİ —
 * bulunursa aynı sarmalayıcı orada da ucuzdur). Diğer `MetricPlaceholder`
 * zarflı şemalar (`BoqItemResponse`/`SiteCard`/`SectionResponse`/
 * `SiteDetailResponse`/`SectionDetailResponse`) bu sarmalayıcıya HİÇ
 * GİRMEZ — onlarda `.value` iç alanı ayrı bir sorun (bkz.
 * `ProgressCell`/`asPercent` kaçışları, "MetricPlaceholder jenerik zarf"
 * sınıfı, `escape-hatch-inventory-guard.test.ts`), zarfın KENDİSİ
 * `progress_pct` değil `value` adını taşıdığı için bu tipin kapsamı dışında.
 */
export type WithPlainProgressPct<T extends { progress_pct: string | null }> = Omit<
  T,
  "progress_pct"
> & { progress_pct: Percent | null };

/**
 * `WithPlainProgressPct`in İSTEĞE BAĞLI alan sürümü — `ContractListItem`de
 * `progress_pct` openapi'de `progress_pct?:` (anahtar OPSİYONEL) olarak
 * üretilir, diğer beş şemadaki gibi ZORUNLU değil. Ayrı tip: zorunlu sürümün
 * kısıtını gevşetmek beş şemadaki garantiyi de gevşetirdi (anahtar HER ZAMAN
 * var olma garantisi kaybolurdu) — iki ayrı sözleşme, iki ayrı yardımcı tip.
 */
export type WithPlainProgressPctOptional<T extends { progress_pct?: string | null }> = Omit<
  T,
  "progress_pct"
> & { progress_pct?: Percent | null };

type TableRow = ScaleTableLiteral[number];

/** Tablodan türetilen, `scale: "fraction"` taşıyan alan adları (istisnalar hariç). */
export type FractionFieldName = Exclude<Extract<TableRow, { scale: "fraction" }>["field"], ScaleNameException>;

/** Tablodan türetilen, `scale: "percent"` taşıyan alan adları (istisnalar hariç). */
export type PercentFieldName = Exclude<Extract<TableRow, { scale: "percent" }>["field"], ScaleNameException>;

/** `X` tam olarak `string` ya da `string | null` ise `B` (uygun null varyantıyla) döner, aksi hâlde `X` değişmez. */
type BrandIfPlainString<X, B> = [X] extends [string]
  ? B
  : [X] extends [string | null]
    ? [string | null] extends [X]
      ? B | null
      : X
    : X;

/** Sonsuz özyinelemeye karşı derinlik sınırı (öz-referanslı şemalar — ör. ağaç yapıları). */
type Prev = [never, 0, 1, 2, 3, 4, 5, 6];

/**
 * Ad tabanlı derin marka'lama: iç içe nesne/dizilerde `fraction`/`percent`
 * tablosundaki adlarla eşleşen `string`/`string | null` alanları
 * `Fraction`/`Percent` yapar. Zarf/obje/sayı alanları (ad eşleşmiyorsa ya da
 * tip `string`/`string | null` değilse) DOKUNULMAZ — yalnız içine inilir.
 */
export type DeepScale<T, D extends number = 6> = D extends 0
  ? T
  : T extends readonly (infer U)[]
    ? DeepScale<U, Prev[D]>[]
    : T extends object
      ? {
          [K in keyof T]: K extends FractionFieldName
            ? BrandIfPlainString<T[K], Fraction>
            : K extends PercentFieldName
              ? BrandIfPlainString<T[K], Percent>
              : DeepScale<T[K], Prev[D]>;
        }
      : T;
