import type {
  IncomeStatementResponse,
  IncomeStatementSection,
} from "@/lib/api/hooks/useIncomeStatement";
import { formatAmount, formatPercent } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";
import { toDecimalString } from "@/lib/decimal";
import { asPercent } from "@/lib/api/scale";

import { MaskedStatementNote } from "./MaskedStatementNote";
import { INCOME_STATEMENT_TREND_REASON, revenueSharePercent } from "./income-statement";

/**
 * E11:87-147 — `GELİRLER` / `GİDERLER` bölümleri + `DÖNEM KARI` kapanışı.
 *
 * 🔴 BAŞLIK/ETİKET METİNLERİ SUNUCUDAN GELİR (`title`, `subtotal_label`,
 * kalem `label`ları, `profit_label`). Mockup'ın metinlerini sabitlemek, uç
 * bir kalem adını değiştirdiğinde ekranı SESSİZCE yalancı yapardı
 * (`BalanceSheetSideCard` kanonu).
 *
 * 🔴 K1 — `DÖNEM KARI` satırı `period_profit` basar, `total_revenue −
 * total_expense` DEĞİL. Gerekçe: `period_profit()` Bilanço'nun
 * `Dönem Net Kârı` kalemiyle BİREBİR AYNI fonksiyondur (MT-K3, tek kopya);
 * başka bir sayı basılırsa aynı dönemin kârı iki mali tabloda FARKLI çıkar.
 * İkisi ayrışabildiğinde şerit (`IncomeStatementBanner`) BAĞIRIR.
 *
 * 🔴 Hareketsiz kalem (`amount = 0`) listeden DÜŞMEZ: küme SABİTtir (2 bölüm ·
 * 6 kalem) ve eksilen bir satır "bu kalem yok" derdi, "bu kalemde hareket
 * yok" değil.
 */
export function IncomeStatementTable({ data }: { data: IncomeStatementResponse }) {
  return (
    <>
      <MaskedStatementNote
        values={[
          data.total_revenue,
          data.total_expense,
          data.period_profit,
          ...data.sections.flatMap((section) => [section.subtotal, ...section.lines.map((line) => line.amount)]),
        ]}
      />
      <table className="fs-is-table" data-testid="mt-is-table">
        <tbody>
          {data.sections.map((section) => (
            <IncomeSectionRows key={section.key} section={section} totalRevenue={data.total_revenue} />
          ))}

          {/* E11:139-145 — TAM GENİŞLİK yeşil kapanış. Oran hücresi NET
              marjdır (E11:142 `%14,1`); mockup'ın `Performans Özeti`
              kartındaki "Brüt Marj" etiketi YANLIŞTIR, burada doğru adıyla
              basılır. */}
          <tr className="fs-is-profit" data-testid="mt-is-profit">
            <th scope="row" className="fs-is-profit__label">
              {data.profit_label}
            </th>
            <td className="fs-is-profit__value">{formatAmount(data.period_profit)}</td>
            <RatioCell percent={revenueSharePercent(data.period_profit, data.total_revenue)} strong />
          </tr>
        </tbody>
      </table>

      {/* 🔴 K2 — oran sütununun ANLAMI ve trendin NEDEN boş olduğu EKRANDA
          yazar. Gerekçe `title`da SAKLANMAZ ve öğenin yanına SABİTLENMEZ:
          `pending-modules` kaydından TÜRER (F-PRJTAB kanonu). */}
      <p className="fs-notice" data-testid="mt-is-ratio-note">
        Oran sütunu gider kalemlerinde toplam gelire payı, kapanış satırında net marjı gösterir.
        Gelir kalemlerinde trend basılmaz: {pendingModuleLabel(INCOME_STATEMENT_TREND_REASON)}.
      </p>
    </>
  );
}

/**
 * E11:94-107 (`GELİRLER`) · E11:112-137 (`GİDERLER`) — bant → kalemler → ara
 * toplam.
 *
 * 🔴 ORAN YALNIZ GİDER BÖLÜMÜNDE HESAPLANIR. Mockup'ın gelir satırlarındaki
 * sütun bir TREND'dir (E11:99 `↑ %8,3`), bir pay değil — oraya "toplam gelire
 * oran" yazmak SESSİZCE BAŞKA BİR ŞEY iddia etmek olurdu. Tanınmayan bir
 * bölüm anahtarı da oransız kalır: uydurulmuş bir oran, olmayan bir anlam
 * iddia ederdi (`sectionTone`un nötr dalıyla aynı gerekçe).
 */
function IncomeSectionRows({
  section,
  totalRevenue,
}: {
  section: IncomeStatementSection;
  totalRevenue: string | null;
}) {
  const testId = `mt-is-section-${section.key}`;
  const showsShare = section.key === EXPENSE_SECTION_KEY;

  return (
    <>
      {/* E11:95 · E11:113 — `colspan=3` gri bölüm bandı. */}
      <tr className="fs-is-band" data-testid={`${testId}-band`}>
        <th scope="colgroup" colSpan={3} className="fs-is-band__cell">
          {section.title}
        </th>
      </tr>

      {/* E11:97-104 · E11:115-130 — kalem satırları. */}
      {section.lines.map((line) => (
        <tr className="fs-is-line" key={line.key} data-testid={`${testId}-${line.key}`}>
          <th scope="row" className="fs-is-line__label">
            {line.label}
          </th>
          <td className="fs-is-line__value">{formatAmount(line.amount)}</td>
          <RatioCell percent={showsShare ? revenueSharePercent(line.amount, totalRevenue) : null} />
        </tr>
      ))}

      {/* E11:105-110 · E11:131-137 — ara toplam. Oran hücresi mockup'ta
          BOŞtur; ara toplamın kendi payını basmak mockup'a aykırı olurdu. */}
      <tr className={`fs-is-subtotal fs-is-subtotal--${showsShare ? "expense" : "revenue"}`} data-testid={`${testId}-subtotal`}>
        <th scope="row" className="fs-is-subtotal__label">
          {section.subtotal_label}
        </th>
        <td className="fs-is-subtotal__value">{formatAmount(section.subtotal)}</td>
        <td className="fs-is-ratio" />
      </tr>
    </>
  );
}

/**
 * 🔴 Sunucunun GİDER bölümünün anahtarı. Şema açıklaması kümeyi SABİT sayar
 * (`revenue` → 2 kalem, `expenses` → 4 kalem); ton/anlam kararı SIRAYA
 * (`sections[1]`) bağlanmaz — üçüncü bir bölüm eklenirse index kayar ve
 * yanlış bölüm gider gibi işlenirdi (`sectionTone` kanonu).
 *
 * 🔴 M5_1 kayıt #118 — `IncomeStatementSection.key` üretilen tipte DÜZ
 * `string`dir (literal birleşim DEĞİL, `schema.d.ts`), yani bu sabitle
 * karşılaştırma TİP SİSTEMİ tarafından bekçilenmiyor. Kaynak değer backend'de
 * `app/modules/accounting/statement_map/income_statement_map.py`
 * (`INCOME_STATEMENT_EXPENSE_SECTION = "expenses"`) — iki taraf da elle
 * senkron tutulmalı. Anahtar SÜRÜKLENİRSE bu bekçilenmez ama sonucu
 * KAZA DEĞİL SESSİZ DERECELENMEDİR: `showsShare` `false` kalır, oran sütunu
 * o bölümde boş basılır ("—"), yanlış bir yüzde ASLA uydurulmaz (bkz. altta
 * "tanınmayan bölüm anahtarı" testi).
 */
const EXPENSE_SECTION_KEY = "expenses";

/**
 * Oran hücresi. `null` ⇒ oran YOKTUR (`total_revenue === 0` guard'ı ya da
 * kaynağı olmayan trend sütunu) ve `—` basılır: `NaN`/`Infinity` ekrana
 * ASLA sızmaz.
 */
function RatioCell({ percent, strong = false }: { percent: number | null; strong?: boolean }) {
  return (
    <td className={`fs-is-ratio${strong ? " fs-is-ratio--strong" : ""}`}>
      {/* KAÇIŞ: revenueSharePercent test edilen kesinlikte (toBeCloseTo) number
          döndürür — davranışı korumak için burada sadece formatPercent
          sınırında Decimal kanonuyla stringe çevriliyor. */}
      {percent === null ? "—" : formatPercent(asPercent(toDecimalString(percent) ?? "0"))}
    </td>
  );
}
