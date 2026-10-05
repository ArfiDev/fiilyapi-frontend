import type {
  CashFlowStatementResponse,
  CashFlowStatementSection,
} from "@/lib/api/hooks/useCashFlowStatement";
import { formatAmount } from "@/lib/format";

import { MaskedStatementNote } from "./MaskedStatementNote";

import { cashFlowDirection, formatSignedAmount, sectionTone } from "./cash-flow-statement";

interface CashFlowTableProps {
  data: CashFlowStatementResponse;
}

/**
 * NA:65-112 — A/B/C bölümleri + ÜÇ SATIRLI kapanış.
 *
 * 🔴 BAŞLIK/ETİKET METİNLERİ SUNUCUDAN GELİR (`title`, `subtotal_label`,
 * kalem `label`ları). Mockup'ın metinlerini sabitlemek, uç bir kalem adını
 * değiştirdiğinde ekranı SESSİZCE yalancı yapardı (`BalanceSheetSideCard`
 * kanonu).
 *
 * 🔴 K9 — `schema.d.ts` açıklaması BAYAT: "mockup'ta `DÖNEM BAŞI NAKİT` satırı
 * EKSİK" ve "A ara toplamı 6.842.000" diyor. İkisi de ÖLÇÜLDÜ ve artık doğru
 * DEĞİL: mockup NA:99-110'da üç satırlı kapanışı TAŞIYOR ve NA:78'deki A ara
 * toplamı `5.842.000`, satırlarıyla (NA:71-75) TUTUYOR. Çizim MOCKUP'tan gelir.
 */
export function CashFlowTable({ data }: CashFlowTableProps) {
  return (
    <div className="fs-cf-card" data-testid="na-table">
      <MaskedStatementNote
        values={[
          data.opening_cash,
          data.net_change,
          data.closing_cash,
          ...data.sections.flatMap((section) => [section.subtotal, ...section.lines.map((line) => line.amount)]),
        ]}
      />
      <table className="fs-cf-table">
        <tbody>
          {data.sections.map((section) => (
            <CashFlowSectionRows key={section.key} section={section} />
          ))}

          {/* NA:100-101 — DÖNEM BAŞI NAKİT. İşaretsizdir: bir AKIŞ değil,
              bir BAKİYEdir; `+`/`-` öneki yön iddia ederdi. */}
          <tr className="fs-cf-closing fs-cf-closing--opening" data-testid="na-opening">
            <th scope="row" className="fs-cf-closing__label">
              DÖNEM BAŞI NAKİT
            </th>
            <td className="fs-cf-closing__value">{formatAmount(data.opening_cash)}</td>
          </tr>

          {/* 🔴 NA:104-105 — NET NAKİT DEĞİŞİMİ (A+B+C). K2: bu satır ile
              NA:56-59 KPI kartı AYNI sunucu alanını (`net_change`) basar;
              istemci A+B+C'yi YENİDEN TOPLAMAZ. */}
          <tr className="fs-cf-closing fs-cf-closing--net" data-testid="na-net-change">
            <th scope="row" className="fs-cf-closing__label">
              NET NAKİT DEĞİŞİMİ <span className="fs-cf-closing__code">(A+B+C)</span>
            </th>
            <td className="fs-cf-closing__value">{formatSignedAmount(data.net_change)}</td>
          </tr>

          {/* NA:107-110 — TAM GENİŞLİK koyu mavi DÖNEM SONU NAKİT. Bakiye
              olduğu için yine işaretsizdir. */}
          <tr className="fs-cf-closing fs-cf-closing--total" data-testid="na-closing">
            <th scope="row" className="fs-cf-closing__label">
              DÖNEM SONU NAKİT
            </th>
            <td className="fs-cf-closing__value">{formatAmount(data.closing_cash)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** NA:68-79 (A) · NA:81-88 (B) · NA:90-97 (C) — bant → kalemler → ara toplam. */
function CashFlowSectionRows({ section }: { section: CashFlowStatementSection }) {
  const tone = sectionTone(section.code);
  const testId = `na-section-${section.key}`;

  return (
    <>
      {/* NA:69 · NA:82 · NA:91 — `colspan=2` renkli bölüm bandı. */}
      <tr className={`fs-cf-band fs-cf-band--${tone}`} data-testid={`${testId}-band`}>
        <th scope="colgroup" colSpan={2} className="fs-cf-band__cell">
          {section.title}
        </th>
      </tr>

      {/* NA:71-75 — kalem satırları; tutar İŞARETLİ ve yönüne göre renkli. */}
      {section.lines.map((line) => (
        <tr className="fs-cf-line" key={line.key} data-testid={`${testId}-${line.key}`}>
          <th scope="row" className="fs-cf-line__label">
            {line.label}
          </th>
          <td className={`fs-cf-line__value fs-cf-amount--${cashFlowDirection(line.amount)}`}>
            {formatSignedAmount(line.amount)}
          </td>
        </tr>
      ))}

      {/* NA:76-79 · NA:85-88 · NA:94-97 — ara toplam. Kod harfi mockup'ta
          etiketin YANINDA soluk bir parantezdir ve bölümün KENDİ `code`u
          basılır; harf metne gömülmez. */}
      <tr className={`fs-cf-subtotal fs-cf-subtotal--${tone}`} data-testid={`${testId}-subtotal`}>
        <th scope="row" className="fs-cf-subtotal__label">
          {section.subtotal_label} <span className="fs-cf-subtotal__code">({section.code})</span>
        </th>
        <td className={`fs-cf-subtotal__value fs-cf-subtotal__value--${tone}`}>
          {formatSignedAmount(section.subtotal)}
        </td>
      </tr>
    </>
  );
}
