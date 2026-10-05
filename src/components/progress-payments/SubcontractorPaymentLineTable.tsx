import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { sumDecimalStrings } from "@/lib/decimal";
import { formatAmount, formatQuantity } from "@/lib/format";
import type { SubcontractorProgressPaymentLineRead } from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { SourceCodeSub } from "@/components/catalog-shared/SourceCodeSub";
import { sourceCodeLabel } from "@/components/catalog-shared/source-code";
import "./subcontractor-progress-payment-detail.css";

/**
 * Poz kodu; Bakanlık poz no'su (KAT-F2.4 · Q4) VARSA kodun HEMEN ALTINDA küçük mono — kod + alt satır dikey bir
 * sarmalayıcıda, açıklama yanında kalır. Kod yoksa eski düzen (yalnız kod span'ı) AYNEN korunur.
 */
function PaymentLineCode({ code, sourceCode }: { code: string; sourceCode: string | null }) {
  const codeSpan = <span className="thd-line-table__code">{code}</span>;
  if (sourceCode === null) return codeSpan;
  return (
    <span className="thd-line-table__code-stack">
      {codeSpan}
      <SourceCodeSub code={sourceCode} data-testid="thd-source-code" />
    </span>
  );
}

export interface SubcontractorPaymentLineTableProps {
  lines: SubcontractorProgressPaymentLineRead[];
}

/**
 * F-TH T4 · "Hakediş Kalemleri" kartı — Ekran 15'in `PaymentGroupTable`'ıyla
 * AYNI yerleşim (başlık şeridi + tablo + "Ara Toplam" tfoot), ama VERİ ŞEKLİ
 * kökten FARKLI: İşveren `groups[]` ÖNCEDEN AGREGE edilmiş grup toplamları
 * taşır (Sözleşme/Önceki/Bu Ay/Toplam — dört tutar), Taşeron `lines[]` HER
 * SÖZLEŞME KALEMİ için BİR SATIR taşır (`SubcontractorProgressPaymentLineRead`).
 * Bu yüzden `PaymentGroupTable` PAYLAŞILAMAZ (brief §Kalem tablosu) — bu yeni
 * bileşen yalnız şemada GERÇEK karşılığı olan alanları basar:
 * `code`/`description`/`unit` (İş Kalemi), `contract_unit_price` (Sözleşme
 * B.F.), `coefficient` (Katsayı), `quantity` (Miktar), `adjusted_unit_price`
 * (Düzeltilmiş B.F.), `line_total` (Toplam). İşveren tablosunun "Önceki"
 * sütununun (kümülatif kısmi hakediş) taşeron şemasında KARŞILIĞI YOK —
 * uydurulmaz, sütun hiç açılmaz (silinen değil, hiç var olmayan bir sütun).
 *
 * Gruplama: `group_name` null olduğunda uydurma bir "Gruplanmamış" başlığı
 * YAZILMAZ (`PaymentGroupTable` ile aynı karar) — grup değiştiğinde VE yeni
 * grup adı doluyken bir bölüm başlığı satırı basılır.
 */
export function SubcontractorPaymentLineTable({ lines }: SubcontractorPaymentLineTableProps) {
  const isHidden = useCategoryHidden(SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES);
  const sorted = [...lines].sort((a, b) => a.sort_order - b.sort_order);
  const total = sumDecimalStrings(lines.map((line) => line.line_total));

  let previousGroup: string | null | undefined;

  return (
    <section className="pp-table-card">
      <div className="pp-table-card__head">Hakediş Kalemleri</div>
      {/* F-TH T6 dar-viewport düzeltmesi (brief §Dar viewport kontrolü):
          taşeron tablosu İşveren'den bir sütun FAZLA taşır (6 vs 5) — dar
          viewport'ta (320/375px) sayfa gövdesi yerine bu kart kendi içinde
          yatay kaysın diye tablo ayrı bir `overflow-x: auto` sarmalayıcıya
          alındı (yeniden tasarım DEĞİL, yalnız taşma düzeltmesi). */}
      <div className="thd-line-table__scroll">
      <table className="pp-table">
        <thead>
          <tr>
            <th className="pp-table__th pp-table__col--item">İş Kalemi</th>
            <th className="pp-table__th pp-table__col--amount">Sözleşme B.F.<MaskedMark isHidden={isHidden} values={lines.map((line) => line.contract_unit_price)} /></th>
            <th className="pp-table__th pp-table__col--amount">Katsayı</th>
            <th className="pp-table__th pp-table__col--amount">Miktar</th>
            <th className="pp-table__th pp-table__col--amount">Düzeltilmiş B.F.<MaskedMark isHidden={isHidden} values={lines.map((line) => line.adjusted_unit_price)} /></th>
            <th className="pp-table__th pp-table__col--amount">
              Toplam
              <MaskedMark isHidden={isHidden} values={lines.map((line) => line.line_total)} />
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((line) => {
            const rows = [];
            if (line.group_name && line.group_name !== previousGroup) {
              rows.push(
                <tr key={`group-${line.id}`} className="thd-line-table__group-row">
                  <td className="thd-line-table__group-cell" colSpan={6}>
                    {line.group_name}
                  </td>
                </tr>,
              );
            }
            previousGroup = line.group_name;
            rows.push(
              <tr key={line.id} className="pp-table__row">
                <td className="pp-table__cell pp-table__col--item">
                  <PaymentLineCode code={line.code} sourceCode={sourceCodeLabel(line)} /> {line.description}
                </td>
                <td className="pp-table__cell pp-table__col--amount">
                  {formatAmount(line.contract_unit_price)}
                </td>
                <td className="pp-table__cell pp-table__col--amount">
                  {formatQuantity(line.coefficient)}
                </td>
                <td className="pp-table__cell pp-table__col--amount">
                  {formatQuantity(line.quantity)} {line.unit}
                </td>
                <td className="pp-table__cell pp-table__col--amount">
                  {formatAmount(line.adjusted_unit_price)}
                </td>
                <td className="pp-table__cell pp-table__col--amount pp-table__cell--total">
                  {formatAmount(line.line_total)}
                </td>
              </tr>,
            );
            return rows;
          })}
        </tbody>
        {lines.length > 0 && (
          <tfoot>
            <tr className="pp-table__total-row">
              <td className="pp-table__cell pp-table__col--item pp-table__total-label" colSpan={5}>
                Ara Toplam
              </td>
              <td className="pp-table__cell pp-table__col--amount pp-table__total-value">
                {formatAmount(total)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
      </div>
    </section>
  );
}
