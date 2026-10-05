import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { EMPLOYER_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { sumDecimalStrings } from "@/lib/decimal";
import { formatAmount } from "@/lib/format";
import type { ProgressPaymentDetail } from "@/lib/api/hooks/useProgressPayments";

type ProgressPaymentGroupSummary = ProgressPaymentDetail["groups"][number];

export interface PaymentGroupTableProps {
  groups: ProgressPaymentGroupSummary[];
}

// E15 94-145 "Hakediş Kalemleri" kartı — grup satırları (spec §6.6, brief §3).
// `group_name` null olduğunda uydurma bir "Gruplanmamış" başlığı YAZILMAZ,
// hücre boş bırakılır (brief açık talimatı).
//
// Mockup 136-142'deki "Ara Toplam" satırı review düzeltmesiyle EKLENDİ:
// dört sütunun bileşenleri `groups[]` payload'ında tam olarak mevcut, bu
// yüzden istemci tarafında toplamak veri uydurmak değil TÜRETMEKTİR
// (kontrolcü kararı). Toplama `sumDecimalStrings` ile kuruş hassasiyetli
// yapılır — `Number()` ile toplama float yuvarlama hatası riski taşır.
// `groups` boşken satır basılmaz (boş dizi toplamı anlamsız).
export function PaymentGroupTable({ groups }: PaymentGroupTableProps) {
  const isHidden = useCategoryHidden(EMPLOYER_PAYMENT_HIDDEN_CATEGORIES);
  // IZN-F4b.2 — gizli sütun başlığında TEK kilit; hücreler `—`, "Ara Toplam" da `—` (null 0 sayılmaz).
  const marks = {
    contract: groups.map((group) => group.contract_amount),
    previous: groups.map((group) => group.previous_amount),
    this: groups.map((group) => group.this_amount),
    cumulative: groups.map((group) => group.cumulative_amount),
  };
  return (
    <section className="pp-table-card">
      <div className="pp-table-card__head">Hakediş Kalemleri</div>
      <table className="pp-table">
        <thead>
          <tr>
            <th className="pp-table__th pp-table__col--item">İş Kalemi</th>
            <th className="pp-table__th pp-table__col--amount">Sözleşme<MaskedMark isHidden={isHidden} values={marks.contract} /></th>
            <th className="pp-table__th pp-table__col--amount">Önceki<MaskedMark isHidden={isHidden} values={marks.previous} /></th>
            <th className="pp-table__th pp-table__col--amount">Bu Ay<MaskedMark isHidden={isHidden} values={marks.this} /></th>
            <th className="pp-table__th pp-table__col--amount">Toplam<MaskedMark isHidden={isHidden} values={marks.cumulative} /></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => (
            // group_name benzersiz değil (null de olabilir) — sıra sabit
            // olduğundan index anahtar olarak güvenli.
            <tr key={index} className="pp-table__row">
              <td className="pp-table__cell pp-table__col--item">{group.group_name ?? ""}</td>
              <td className="pp-table__cell pp-table__col--amount">
                {formatAmount(group.contract_amount)}
              </td>
              <td className="pp-table__cell pp-table__col--amount">
                {formatAmount(group.previous_amount)}
              </td>
              <td className="pp-table__cell pp-table__col--amount pp-table__cell--this">
                {formatAmount(group.this_amount)}
              </td>
              <td className="pp-table__cell pp-table__col--amount pp-table__cell--total">
                {formatAmount(group.cumulative_amount)}
              </td>
            </tr>
          ))}
        </tbody>
        {groups.length > 0 && <PaymentGroupTableFoot groups={groups} />}
      </table>
    </section>
  );
}

// Mockup 136-142: zemin --color-info-tint, üst çizgi 2px (--border-width-total),
// "Bu Ay" sütunu 14px + primary (diğerleri 13px + text) — BOQ'un GENEL TOPLAM
// satırıyla aynı token kullanımı.
function PaymentGroupTableFoot({ groups }: { groups: ProgressPaymentGroupSummary[] }) {
  const contractTotal = sumDecimalStrings(groups.map((g) => g.contract_amount));
  const previousTotal = sumDecimalStrings(groups.map((g) => g.previous_amount));
  const thisTotal = sumDecimalStrings(groups.map((g) => g.this_amount));
  const cumulativeTotal = sumDecimalStrings(groups.map((g) => g.cumulative_amount));
  return (
    <tfoot>
      <tr className="pp-table__total-row">
        <td className="pp-table__cell pp-table__col--item pp-table__total-label">Ara Toplam</td>
        <td className="pp-table__cell pp-table__col--amount pp-table__total-value">
          {formatAmount(contractTotal)}
        </td>
        <td className="pp-table__cell pp-table__col--amount pp-table__total-value">
          {formatAmount(previousTotal)}
        </td>
        <td className="pp-table__cell pp-table__col--amount pp-table__total-value pp-table__total-value--this">
          {formatAmount(thisTotal)}
        </td>
        <td className="pp-table__cell pp-table__col--amount pp-table__total-value">
          {formatAmount(cumulativeTotal)}
        </td>
      </tr>
    </tfoot>
  );
}
