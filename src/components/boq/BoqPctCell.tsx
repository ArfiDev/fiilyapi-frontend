import { cx } from "@/lib/cx";
import { formatPercent } from "@/lib/format";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { metricCell, type MetricEnvelope } from "@/lib/placeholder-cell";

import "./boq.css";

export interface BoqPctCellProps {
  /** `BoqItemResponse.progress_pct` ya da `BoqTotals.grand_progress_pct`. */
  progress: MetricEnvelope<string>;
  /**
   * Hücrenin taban sınıfı — satır `boq-table__pct`, toplam
   * `boq-table__total-pct boq-table__col--pct`.
   *
   * 🔴 ZORUNLU, varsayılanı YOK ve bu ÖLÇÜLMÜŞ bir karardır. İlk hâlinde
   * `= "boq-table__pct"` varsayılanı vardı; `SectionBoqCard`ın TOPLAM hücresi
   * sınıfı geçirmeyi atlayınca satır sınıfına SESSİZCE düştü ve `—` glifi 1px
   * kaydı. Kusuru yalnız görsel kapı gördü (`bolum-detay` karesi), tek bir
   * birim testi bile kırmızı vermedi. Varsayılan olmayınca aynı atlama artık
   * `typecheck`i kırar.
   */
  className: string;
  "data-testid": string;
}

/**
 * BOQ'nun `Gerç. %` hücresi — POZ SATIRI (Ekran 13 · 102 başlık,
 * 110/120/134/144/158/167) ve GENEL TOPLAM (177 `%75`) için TEK kaynak.
 *
 * ⚠️ ESKİ GEREKÇE BAYATLADI. Dört kopyada da *"Gerç. % tamamen yer tutucu,
 * eşik renkleri P7'ye bırakıldı"* yazıyordu ve o gün doğruydu. ILR-1'de
 * (backend `ffb055e`, 2026-08-27) İKİSİ DE BAĞLANDI ve kaynakları HAKEDİŞ
 * DEĞİL ŞANTİYE GÜNLÜĞÜDÜR:
 *   · satır  → `boq/service.py:126` `_progress_metric(realized, taban, izinli=…)`
 *   · toplam → `boq/service.py:215` `grand_progress_pct`
 * Bayat not yüzünden dört hücre de `available` bayrağına HİÇ bakmıyordu;
 * backend'in gönderdiği gerçek yüzde ekrana hiç çıkmıyordu.
 *
 * 🔴 DÖRT KOPYA, TEK KUSUR. Aynı hücre `BoqTable` (satır + toplam) ve
 * `SectionBoqCard` (satır + toplam) içinde birebir tekrarlanıyordu; kusur da
 * dördünde birden yaşıyordu. Kopya çoğaltmak yerine tek kaynağa alındı —
 * sonraki bağlama bir yerde yapılır, dört yerde unutulmaz.
 *
 * Rozet DEĞİL düz metindir (mockup 177) ve sahte yüzde uydurulmaz; eşik
 * renkleri (mockup'ın dört renkli rozeti) hâlâ P7'ye bağlıdır ve BU dilimin
 * kapsamı dışındadır — bağlanan yalnızca SAYININ KENDİSİDİR.
 */
export function BoqPctCell({ progress, className, "data-testid": testId }: BoqPctCellProps) {
  const { text, hint, isHidden } = metricCell(progress, formatPercent);
  return (
    <td
      className={cx(
        className,
        // Soluk hâl YALNIZ boş zarfta; dolu zarfta mockup'ın mavi vurgusu döner.
        text === null && "boq-table__pct--pending",
      )}
      data-testid={testId}
      // 3. hâl (`available:false` + `pending_module:null` = rolün izni yok): "modül henüz gelmedi"
      // YALAN olurdu → hint "Bu bilgi rolünüz için gizli" + kilit (IZN-F4.2).
      title={hint}
    >
      {text ?? "—"}
      {isHidden ? <HiddenMark /> : hint !== undefined && <span className="sr-only">{hint}</span>}
    </td>
  );
}
