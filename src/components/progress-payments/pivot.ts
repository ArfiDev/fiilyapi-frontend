import { sumDecimalStrings } from "@/lib/decimal";
import type {
  ContractDistributionItem,
  ContractDistributionResponse,
  ContractDistributionSite,
} from "@/lib/api/hooks/useContract";
import type { ProgressPaymentLineDetail } from "@/lib/api/hooks/useProgressPayments";
import type { ProgressPaymentLineInput } from "@/lib/api/hooks/useProgressPaymentMutations";

import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";

import { parsePaymentQuantity } from "./tr-quantity";
import { DEFAULT_QUANTITY_SOURCE, type QuantitySource } from "./quantity-source";

// P7 T5 · Hakediş formu pivot dönüşümü — EN RİSKLİ modül (brief §Uyarı).
// Satırlar sözleşme kalemleridir (`ContractDistributionItem`), sütunlar
// şantiyelerdir (`sites[]`). Bir hücre yalnız kalemin o şantiyeye
// `allocations` içinde tahsisi VARSA düzenlenebilir.

export interface PivotCell {
  siteId: string;
  editable: boolean;
  /**
   * EKRAN METNİ (TKL-F8 · T30): Türkçe yazım — "12,5", "1.234,5", "0". Sunucu değeri
   * `trQuantityInputValue` ile çevrilir ("12.500" → "12,5"); gövdeye `normalizePivotRowsForSave`
   * nokta-ondalık metin olarak çevirir. Düzenlenebilir hücrede boş girişe izin vardır (kayıtta "0");
   * kapalı hücrede "".
   */
  quantity: string;
  /** Var olan kaydedilmiş satırın `line_total`'ı (salt okunur gösterim) — yoksa null. */
  lineTotal: string | null;
  /** Var olan kaydedilmiş satırın `is_price_stale`'i — yoksa null (satır hiç yok). */
  isPriceStale: boolean | null;
  /**
   * Sunucunun kalıcı kaynak damgası (F-P10 T2 göçü) — rozetin TEK kaynağı.
   * Hiç kaydedilmemiş hücre `manual`dır (taşeron `th-lines` varsayılanıyla aynı).
   */
  quantitySource: QuantitySource;
}

export interface PivotRow {
  item: ContractDistributionItem;
  groupName: string;
  cells: PivotCell[];
}

/** Hücre kimliği: (kalem, şantiye) çifti — satır eşleme ve hücre hata anahtarı. */
export function cellKey(contractItemId: string, siteId: string): string {
  return `${contractItemId}::${siteId}`;
}

/**
 * `distribution` + (varsa) mevcut `lines` → pivot satır/hücre matrisi.
 *
 * Tahsissiz hücre KAPALI kalır (`editable: false`, `quantity: ""`) — backend
 * kuralı "Bu poz seçilen şantiyeye dağıtılmadı; önce poz dağılımını yapın."
 * Düzenlenebilir ama henüz kaydedilmemiş hücre `"0"` ile başlar (0 miktar
 * MEŞRUDUR, brief §PUT lines — boş bırakmak yerine geçerli bir varsayılan).
 *
 * `contract_item_id` null olan satırlar (kopmuş bağ — sözleşmeden kaldırılmış
 * kalem) pivot'a YERLEŞTİRİLEMEZ: artık hiçbir `ContractDistributionItem`e
 * ait değiller, bu formda düzenlenemezler (backend `dropped_orphan_count`
 * ile ayrıca bildirir, o gösterim detay ekranının kapsamındadır).
 */
export function buildPivotRows(
  distribution: Pick<ContractDistributionResponse, "groups" | "sites">,
  existingLines: readonly ProgressPaymentLineDetail[] = [],
): PivotRow[] {
  const lineByKey = new Map<string, ProgressPaymentLineDetail>();
  for (const line of existingLines) {
    if (!line.contract_item_id) continue;
    lineByKey.set(cellKey(line.contract_item_id, line.site_id), line);
  }

  const rows: PivotRow[] = [];
  for (const group of distribution.groups) {
    for (const item of group.items) {
      const allocatedSiteIds = new Set(item.allocations.map((a) => a.site_id));
      const cells: PivotCell[] = distribution.sites.map((site) => {
        const editable = allocatedSiteIds.has(site.id);
        const existing = lineByKey.get(cellKey(item.id, site.id));
        return {
          siteId: site.id,
          editable,
          quantity: existing ? trQuantityInputValue(existing.quantity) : editable ? "0" : "",
          lineTotal: existing ? existing.line_total : null,
          isPriceStale: existing ? (existing.is_price_stale ?? null) : null,
          quantitySource: existing ? existing.quantity_source : DEFAULT_QUANTITY_SOURCE,
        };
      });
      rows.push({ item, groupName: group.name, cells });
    }
  }
  return rows;
}

/**
 * ⚠️ `PUT …/lines` gövdesini üretir — DEĞİŞTİRME semantiğine uyar (brief
 * §PUT lines DEĞİŞTİRME SEMANTİĞİ): gövdede GEÇMEYEN satır SUNUCUDA SİLİNİR.
 * Bu yüzden pivot'taki TÜM düzenlenebilir hücreler tek gövdede gönderilir —
 * `"0"` miktarlı hücreler de DAHİL (0 meşrudur, düşürülmez). Yalnız
 * düzenlenemez (dağıtılmamış) hücreler atlanır; onlar zaten satır olarak var
 * OLAMAZ (backend 422 "dağıtılmadı" ile reddeder).
 *
 * Aynı `(contract_item_id, site_id)` çifti bir `Map` ile tekilleştirilir:
 * pivot yapısı gereği zaten satır×şantiye tekil olsa da, backend'in 422
 * "Aynı poz ve şantiye için tek satır gönderilebilir." kuralını burada da
 * yapısal olarak garanti eder (testle korunur).
 */
export function buildLinesSaveBody(rows: readonly PivotRow[]): ProgressPaymentLineInput[] {
  const map = new Map<string, ProgressPaymentLineInput>();
  for (const row of rows) {
    for (const cell of row.cells) {
      if (!cell.editable) continue;
      map.set(cellKey(row.item.id, cell.siteId), {
        contract_item_id: row.item.id,
        site_id: cell.siteId,
        quantity: cell.quantity,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * 🔴 TKL-F8 (T30/T43) · Kaydetmeden HEMEN ÖNCE çağrılır: her düzenlenebilir hücrenin EKRAN METNİ
 * ("3,5", "1.234,5") Türkçe kuralla okunur ve nokta-ondalık METNE çevrilir ("3.5", "1234.5";
 * `Number()` YOK). Boş hücre ve sıfır "0"a düşer (0 bu formda MEŞRU; reddetmek gereksiz sürtünme).
 * Okunamayan hücre (belirsiz "0.500", "1,2345", "12a") `errors`a `hücre anahtarı → görünür mesaj`
 * olarak düşer; `errors` boş değilse çağıran İSTEK ATMAZ. Hatalı hücrenin gövde karşılığı uydurulmaz:
 * satırda "0" kalır ama gövde zaten gönderilmez.
 * `buildLinesSaveBody`nin kendisi BİLEREK değiştirilmedi (kritik testleri ona kilitli).
 */
export function normalizePivotRowsForSave(rows: readonly PivotRow[]): {
  rows: PivotRow[];
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const normalized = rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => {
      if (!cell.editable) return cell;
      const parsed = parsePaymentQuantity(cell.quantity);
      if (parsed.kind === "error") {
        errors[cellKey(row.item.id, cell.siteId)] = parsed.message;
        return cell;
      }
      return { ...cell, quantity: parsed.value };
    }),
  }));
  return { rows: normalized, errors };
}

/**
 * Satırın düzenlenebilir hücrelerindeki miktar toplamı — kuruş hassasiyetli TOPLAMA (çarpma yok,
 * güvenli). Hücre metni TÜRKÇEDİR: T30 ile okunur, nokta-ondalık değer toplanır. Boş hücre 0'dır;
 * okunamayan hücre (yazım sürüyor ya da belirsiz "0.500") de 0 sayılır — uydurma değer yoktur, hata
 * kaydetmede hücrenin altında görünür. Dönen değer nokta-ondalık metindir (gösterimi çağıran biçimler).
 */
export function rowQuantityTotal(row: PivotRow): string {
  const editableQuantities = row.cells
    .filter((c) => c.editable)
    .map((c) => {
      const parsed = parsePaymentQuantity(c.quantity);
      return parsed.kind === "ok" ? parsed.value : "0";
    });
  return sumDecimalStrings(editableQuantities.length > 0 ? editableQuantities : ["0"]);
}

/**
 * Satırın kaydedilmiş `line_total` toplamı — yalnız backend'den gelen (zaten
 * hesaplanmış) tutarları toplar, ikinci bir çarpma YAPMAZ. Hiç kaydedilmiş
 * satır yoksa `null` (henüz hesaplanmadı, "—" basılır).
 */
export function rowAmountTotal(row: PivotRow): string | null {
  const totals = row.cells.filter((c) => c.lineTotal !== null).map((c) => c.lineTotal as string);
  if (totals.length === 0) return null;
  return sumDecimalStrings(totals);
}

export interface OrphanedAllocationCell {
  item: ContractDistributionItem;
  groupName: string;
  siteId: string;
  siteName: string;
  /** Sunucudaki kayıtlı miktar — kaydedilince (PUT gövdesinden düşeceği için) kaybolacak değer. */
  quantity: string;
}

/**
 * FİNAL İNCELEME düzeltmesi #2: bir (kalem, şantiye) çifti daha önce
 * kaydedilmiş (`ProgressPaymentLineDetail` var) AMA o kalemin o şantiyeye
 * tahsisi (`allocations`) SONRADAN kaldırılmışsa hücre `editable:false` olur
 * — `buildPivotRows`daki `existing ? existing.quantity : …` önceliği
 * yüzünden `cell.quantity`/`cell.lineTotal` yine DOLU kalır (kilitli ama
 * veri taşıyor). `buildLinesSaveBody` düzenlenemez hücreleri ATLADIĞI için
 * ilk "Taslak Kaydet" bu satırı PUT gövdesinden düşürür → backend'de SİLİNİR.
 * Kaydetmeden önce kullanıcıya göstermek için bu hücreler tek yerde tespit
 * edilir — `editable:false` VE `lineTotal !== null` (hiç kayıt yoksa
 * kaybedilecek bir şey de yoktur, o hücre bu listeye girmez).
 */
export function findOrphanedAllocationCells(
  rows: readonly PivotRow[],
  sites: readonly ContractDistributionSite[],
): OrphanedAllocationCell[] {
  const siteNameById = new Map(sites.map((site) => [site.id, site.name]));
  const orphaned: OrphanedAllocationCell[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.editable || cell.lineTotal === null) continue;
      orphaned.push({
        item: row.item,
        groupName: row.groupName,
        siteId: cell.siteId,
        siteName: siteNameById.get(cell.siteId) ?? cell.siteId,
        quantity: cell.quantity,
      });
    }
  }
  return orphaned;
}
