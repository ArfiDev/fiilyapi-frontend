import type { BalanceSheetSide } from "@/lib/api/hooks/useBalanceSheet";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount } from "@/lib/format";

/** BL:44-63 mavi (AKTİF) · BL:66-88 yeşil (PASİF). Ton ÇAĞIRANIN kararıdır. */
export type BalanceSheetTone = "assets" | "liabilities";

interface BalanceSheetSideCardProps {
  side: BalanceSheetSide;
  tone: BalanceSheetTone;
  /** `bl-assets` / `bl-liabilities` — testid ailesinin ön eki. */
  testId: string;
}

/**
 * Bilançonun BİR TARAFI — BL:44-63 (AKTİF) ya da BL:66-88 (PASİF).
 *
 * İki kart YAPI OLARAK aynıdır (başlık → bölüm bandı → kalem satırları → ara
 * toplam → tam genişlik genel toplam); farkları YALNIZ vurgu rengidir. Bu
 * yüzden tek bileşen + `tone` propu; iki kopya yazmak BL:44 ile BL:66
 * arasındaki her düzeltmeyi iki kez yapmak demekti.
 *
 * 🔴 BAŞLIK/ETİKET METİNLERİ SUNUCUDAN GELİR (`title`, `subtotal_label`,
 * `total_label`). Mockup'ın metinlerini sabitlemek, uç bir kalem adını
 * değiştirdiğinde ekranı SESSİZCE yalancı yapardı.
 *
 * 🔴 K4 · KONTRA HESAPLAR İÇİN AYRI GÖRSEL DİL YOKTUR. BL:57 `Maddi Duran
 * Varlıklar (net)` tek ve POZİTİF bir satırdır; netleme SUNUCUDA olur. Parantez
 * / kırmızı / eksi işareti İCAT EDİLMEZ. Bir kalem yine de NEGATİF gelebilir
 * (geçmiş yıl zararı) — `formatAmount`in kendi işaret davranışı geçer, YENİ bir
 * renk kuralı eklenmez.
 *
 * 🔴 Tutarlar BL:51'in biçimidir: sağa yaslı, MONO, `₺` YOK, binlik noktalı.
 * Bu yüzden `formatCurrency` (₺ önekli) DEĞİL `formatAmount` kullanılır.
 */
export function BalanceSheetSideCard({ side, tone, testId }: BalanceSheetSideCardProps) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  // IZN-F4b.2 — gizli tutarlar için kart başlığında TEK kilit; satırlar `—`.
  const values = [
    side.total,
    ...side.sections.flatMap((section) => [section.subtotal, ...section.lines.map((line) => line.amount)]),
  ];
  return (
    <section
      className={`fs-side fs-side--${tone}`}
      aria-label={side.title}
      data-testid={testId}
    >
      {/* BL:45-47 · BL:67-69 — başlık şeridi, altında 2px vurgu çizgisi. */}
      <header className="fs-side__head">
        <h2 className="fs-side__title">
          {side.title}
          <MaskedMark isHidden={isHidden} values={values} />
        </h2>
      </header>

      <table className="fs-side__table">
        <tbody>
          {side.sections.map((section) => (
            <BalanceSheetSectionRows
              key={section.key}
              section={section}
              testId={`${testId}-${section.key}`}
            />
          ))}

          {/* BL:60 · BL:85 — tam genişlik KOYU genel toplam satırı. */}
          <tr className="fs-side__total" data-testid={`${testId}-total`}>
            <th scope="row" className="fs-side__total-label">
              {side.total_label}
            </th>
            <td className="fs-side__total-value">{formatAmount(side.total)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function BalanceSheetSectionRows({
  section,
  testId,
}: {
  section: BalanceSheetSide["sections"][number];
  testId: string;
}) {
  return (
    <>
      {/* BL:50 · BL:56 — bölüm bandı `colspan=2` gri bir şerittir. */}
      <tr className="fs-side__band" data-testid={`${testId}-band`}>
        <th scope="colgroup" colSpan={2} className="fs-side__band-cell">
          {section.title}
        </th>
      </tr>

      {/* BL:51-54 — kalem satırları. */}
      {section.lines.map((line) => (
        <tr className="fs-side__line" key={line.key} data-testid={`${testId}-${line.key}`}>
          <th scope="row" className="fs-side__line-label">
            {line.label}
          </th>
          <td className="fs-side__line-value">{formatAmount(line.amount)}</td>
        </tr>
      ))}

      {/* BL:55 · BL:59 — ara toplam: kalın, vurgulu zemin, altında 2px çizgi. */}
      <tr className="fs-side__subtotal" data-testid={`${testId}-subtotal`}>
        <th scope="row" className="fs-side__subtotal-label">
          {section.subtotal_label}
        </th>
        <td className="fs-side__subtotal-value">{formatAmount(section.subtotal)}</td>
      </tr>
    </>
  );
}
