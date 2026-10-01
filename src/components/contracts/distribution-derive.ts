import type {
  ContractDistributionGroup,
  ContractDistributionItem,
} from "@/lib/api/hooks/useContract";
import type { DistributeRemainingItem } from "@/lib/distribute-remaining";

/**
 * F-P5 T4 · POZ dağılımı ızgarasının SAF türevleri.
 * Kanon: `projedesign/İşveren Sözleşme - Poz Dağılımı.dc.html` (kısaltma `POZ`;
 * yorumlardaki sayılar o dosyanın SATIR numaralarıdır).
 *
 * React yoktur: hücre gösterimi, birim join'i ve renk sırası burada test edilir.
 * Kaydetme gövdesi BURADA KURULMAZ — o `src/lib/contract-distribution-save.ts`
 * (T1) işidir ve ızgara onu çağırır.
 */

/**
 * Şantiye kolonu renk sırası. POZ yalnız İKİ şantiye çizer: 82/98/169-175
 * mavi, 83/99/178-184 yeşil. Kolon sayısı VERİYE bağlı olduğu için (2 sabit
 * değil) palet dört tona genişletilir ve döngüye alınır; ilk iki ton mockup'la
 * BİREBİR aynıdır, 3-4 yalnız mockup'ta hiç çizilmemiş fazladan şantiyeler
 * için devreye girer.
 */
export const DISTRIBUTION_ACCENT_COUNT = 4;

export function distributionSiteAccent(index: number): number {
  return ((index % DISTRIBUTION_ACCENT_COUNT) + DISTRIBUTION_ACCENT_COUNT) % DISTRIBUTION_ACCENT_COUNT;
}

/**
 * Şantiye özet kartlarındaki birim (POZ 172-174: "1.900 m³").
 *
 * ⚠️ `ContractDistributionSiteItem` şemasında `unit` ALANI YOKTUR. Birim, aynı
 * yanıtın `groups[].items[]` tarafında vardır; ikisini birleştiren tek ortak
 * alan POZ NUMARASIdır (`code`). Bu yüzden birim İSTEMCİDE join'lenir.
 * Çözülemeyen kod (özet kaleminin karşılığı ızgarada yoksa) için birim
 * BASILMAZ — uydurma birim sahada yanlış karar verdirir.
 */
export function buildUnitByItemCode(
  groups: readonly ContractDistributionGroup[],
): ReadonlyMap<string, string> {
  const unitByCode = new Map<string, string>();
  for (const group of groups) {
    for (const item of group.items) {
      // İlk kayıt kazanır: aynı kod iki grupta geçerse birim zaten aynıdır.
      if (!unitByCode.has(item.code)) unitByCode.set(item.code, item.unit);
    }
  }
  return unitByCode;
}

export function resolveSiteItemUnit(
  unitByCode: ReadonlyMap<string, string>,
  code: string,
): string | null {
  const unit = unitByCode.get(code);
  return unit === undefined || unit.trim().length === 0 ? null : unit;
}

/**
 * POZ 170 · özet kartı başlığı: mockup "A-Blok **Şantiyesi** — Kota Özeti"
 * yazar, yani şantiye adına " Şantiyesi" ekler. Mockup'ın kendi fikstüründe ad
 * "A-Blok"tur; GERÇEK veride ad zaten "A-Blok Şantiyesi" olabilir ve düz ekleme
 * "A-Blok Şantiyesi Şantiyesi" üretir. Bu yüzden sonek YALNIZ ad onunla
 * bitmiyorsa eklenir — mockup metni korunur, veri artefaktı çoğaltılmaz.
 */
export function distributionSiteSummaryTitle(siteName: string): string {
  const name = siteName.trim();
  return name.toLocaleLowerCase("tr").endsWith("şantiyesi") ? name : `${name} Şantiyesi`;
}

/**
 * Hücrenin BAŞLANGIÇ metni. Backend Decimal'i `"1800.000"` gibi gönderir;
 * POZ 98 girdisinde `1900` yazar. Sondaki sıfırlar YALNIZ GÖSTERİM için
 * kırpılır — dokunulmamış hücre gövdeye zaten GİRMEDİĞİ için bu kırpma
 * sunucuya hiç yansımaz; kullanıcı hücreye dokunursa yazdığı metin
 * `buildDistributionSaveBody`e string olarak gider (ondalık kaybı yok).
 */
export function distributionCellDisplayValue(quantity: string | null | undefined): string {
  if (quantity === null || quantity === undefined) return "";
  const trimmed = quantity.trim();
  if (!/^\d+\.\d+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/0+$/, "").replace(/\.$/, "");
}

/** Kalemin bir şantiyedeki mevcut kotası — yoksa `null` (hücre boş açılır). */
export function allocationQuantityFor(
  item: ContractDistributionItem,
  siteId: string,
): string | null {
  return item.allocations.find((allocation) => allocation.site_id === siteId)?.quantity ?? null;
}

/**
 * POZ 153-155: hiçbir şantiyeye atanmamış kalem satırı kırmızımsı zeminle ve
 * "⚠ Henüz şantiyeye atanmadı" alt etiketiyle basılır.
 */
export function isUndistributedItem(item: ContractDistributionItem): boolean {
  return item.allocations.length === 0;
}

/**
 * POZ 100 vs 161 · "Kalan" rozeti. Kaynak: kirli hücre YOKSA sunucunun
 * `remaining_quantity` alanı; kirli hücre varsa KDG K7, CEO 2026-10-01:
 * taslaktan canlı hesaplanır (`distribute-remaining.ts::remainingQuantity`) ve
 * rozet "kaydedilmedi" işaretini taşır. Metraj gizli rolde (`null`) canlı
 * hesap YAPILMAZ.
 *
 * "Σ kota = sözleşme miktarı olmalı" (POZ 72) YUMUŞAK gösterimdir: rozet
 * 0'da yeşil ✓, aksi hâlde kırmızı kalan miktardır. HARD VALIDATION YOKTUR —
 * backend yalnız `≤` uygular, aşımda 422 döner ve mesajı ekranda basılır.
 */
export function isRemainingSettled(remainingQuantity: string | null): boolean {
  // 🔴 Maskeli kalıntı (kapsam kısıtlı rol) KAPANMIŞ SAYILMAZ: `Number(null)`
  //    **0**'dır ve dağıtımı tamamlanmamış bir kalemi "tamam" diye işaretlerdi.
  if (remainingQuantity === null) return false;
  const remaining = Number(remainingQuantity);
  return Number.isFinite(remaining) && remaining === 0;
}

/**
 * KDG K7 · `ContractDistributionItem` → saf yardımcının genel kalem şekli.
 * Maskeli metrajda (`quantity` null) `null` döner — canlı hesap/dağıtım YOK.
 */
export function toDistributeRemainingItem(
  item: ContractDistributionItem,
): DistributeRemainingItem | null {
  if (item.quantity === null || item.quantity === undefined) return null;
  const shares = new Map<string, string>();
  for (const allocation of item.allocations) {
    if (allocation.quantity !== null) shares.set(allocation.site_id, allocation.quantity);
  }
  return { id: item.id, quantity: item.quantity, shares };
}

/**
 * Fail-closed (BoqAssignmentCard `some` deseni): HERHANGİ bir kalemde metraj
 * (`quantity`/`remaining_quantity`) gizliyse dağıtım kapanır — gizli bir kalem
 * "kalan 0" gibi okunup sessizce atlanmasın.
 */
export function isDistributionMetrajHidden(groups: readonly ContractDistributionGroup[]): boolean {
  return groups.some((group) =>
    group.items.some(
      (item) =>
        item.quantity === null ||
        item.quantity === undefined ||
        item.remaining_quantity === null ||
        item.remaining_quantity === undefined,
    ),
  );
}
