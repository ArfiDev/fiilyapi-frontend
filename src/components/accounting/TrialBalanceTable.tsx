import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import type { TrialBalanceRow, TrialBalanceTotals } from "@/lib/api/hooks/useTrialBalance";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { shouldShowHiddenMark } from "@/lib/auth/masked-values";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { isZeroDecimalString } from "@/lib/decimal";
import { formatAmount } from "@/lib/format";

interface TrialBalanceTableProps {
  rows: readonly TrialBalanceRow[] | undefined;
  totals: TrialBalanceTotals | undefined;
  isLoading: boolean;
  errorMessage?: string;
}

/** MZ:63-76 — iki katmanlı başlığın toplam sütun sayısı. */
const COLUMN_COUNT = 8;

/** MZ:84/88/94 — boş taraf `—` (em dash) ve SOLGUNdur; `0` YAZILMAZ. */
const EMPTY_SIDE = "—";

/**
 * MZ:59-173 — Mizan tablosu. SEKİZ sütun, İKİ KATMANLI `thead` (MZ:61-78):
 * üst satır üç grubu (`Açılış Bakiyesi` · `Dönem Hareketi` · `Kapanış
 * Bakiyesi`) `colspan=2` ile toplar, alt satır her grubun `Borç`/`Alacak`
 * ikilisini adlandırır.
 *
 * 🔴 ÜÇ GRUP AYNI ŞEY DEĞİLDİR (şema notu `TrialBalanceRow`):
 *   · `opening_*` ve `closing_*` **NET** — en fazla BİRİ dolu;
 *   · `period_*` **BRÜT** — İKİSİ BİRDEN dolu olabilir (MZ:85-86 Kasa satırı
 *     bunu fiilen gösterir: dönem borç `2.640.000` VE alacak `2.535.200`).
 * Bu yüzden hücreler ÇİFT olarak değil TEK TEK değerlendirilir: "öbür taraf
 * `—`dır" varsayan tek bir yol brüt grubu yanlış basardı.
 *
 * 🔴 RENK ÜÇ KATMANLIDIR (mockup'ın kendi sözlüğü):
 *   1. sütun BAŞLIKLARI: Borç kırmızı / Alacak yeşil (MZ:71-76);
 *   2. gövdenin AÇILIŞ + DÖNEM hücreleri NÖTR ve normal ağırlık
 *      (MZ:83, :85-86 — mockup burada renk KULLANMAZ);
 *   3. gövdenin KAPANIŞ hücreleri RENKLİ + `600` (MZ:87 kırmızı, :128 yeşil);
 *   4. `tfoot` hepsi renkli + `700`, kapanış ikilisi 1px büyük (MZ:164-169).
 *
 * 🔴 SATIR TIKLAMASI YOKTUR — ölçüldü: MZ:80-159 arasındaki sekiz `<tr>`de
 * `cursor:pointer`, `onclick`, `<a>` ya da hover işareti YOK. Hesap defterine
 * drill-in ÇİZİLMEMİŞTİR; icat edilmez.
 */
export function TrialBalanceTable({
  rows,
  totals,
  isLoading,
  errorMessage,
}: TrialBalanceTableProps) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  // IZN-F4b.2 — gizli sütunun BAŞLIĞINDA tek kilit; hücreler `—`. Her satıra kilit basılmaz.
  const openingMark = shouldShowHiddenMark(isHidden, [
    ...(rows ?? []).flatMap((row) => [row.opening_debit, row.opening_credit]),
    totals?.opening_debit,
    totals?.opening_credit,
  ]);
  const periodMark = shouldShowHiddenMark(isHidden, [
    ...(rows ?? []).flatMap((row) => [row.period_debit, row.period_credit]),
    totals?.period_debit,
    totals?.period_credit,
  ]);
  const closingMark = shouldShowHiddenMark(isHidden, [
    ...(rows ?? []).flatMap((row) => [row.closing_debit, row.closing_credit]),
    totals?.closing_debit,
    totals?.closing_credit,
  ]);
  return (
    // Sekiz sütun dar pencerede taşar → yatay kaydırma KENDİ kabındadır.
    <div className="mu-table-scroll">
      <table className="mu-table mu-tb">
        <thead>
          {/* MZ:62-68 — üst katman: iki kimlik sütunu + üç grup başlığı. */}
          <tr>
            <th scope="col" className="mu-tb__code-head">
              Hesap Kodu
            </th>
            <th scope="col">Hesap Adı</th>
            <th scope="col" colSpan={2} className="is-right">
              Açılış Bakiyesi
              {openingMark && <HiddenMark />}
            </th>
            <th scope="col" colSpan={2} className="is-right">
              Dönem Hareketi
              {periodMark && <HiddenMark />}
            </th>
            <th scope="col" colSpan={2} className="is-right">
              Kapanış Bakiyesi
              {closingMark && <HiddenMark />}
            </th>
          </tr>
          {/* MZ:69-77 — alt katman: kimlik sütunları BOŞ, altı taraf adı. */}
          <tr className="mu-tb__subhead">
            <th colSpan={2} aria-hidden="true" />
            <th scope="col" className="is-right mu-tb__side mu-tb__side--debit">
              Borç
            </th>
            <th scope="col" className="is-right mu-tb__side mu-tb__side--credit">
              Alacak
            </th>
            <th scope="col" className="is-right mu-tb__side mu-tb__side--debit">
              Borç
            </th>
            <th scope="col" className="is-right mu-tb__side mu-tb__side--credit">
              Alacak
            </th>
            <th scope="col" className="is-right mu-tb__side mu-tb__side--debit">
              Borç
            </th>
            <th scope="col" className="is-right mu-tb__side mu-tb__side--credit">
              Alacak
            </th>
          </tr>
        </thead>
        <tbody>
          {errorMessage !== undefined && (
            <tr>
              <td
                colSpan={COLUMN_COUNT}
                className="mu-table__state mu-table__state--danger"
                data-testid="mz-error"
              >
                {errorMessage}
              </td>
            </tr>
          )}
          {errorMessage === undefined && isLoading && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="mu-table__state" data-testid="mz-loading">
                Mizan yükleniyor…
              </td>
            </tr>
          )}
          {errorMessage === undefined && !isLoading && rows !== undefined && rows.length === 0 && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="mu-table__state" data-testid="mz-empty">
                Bu dönemde hareket görmüş hesap yok. Mizan yalnız hareketli hesapları
                listeler; fiş kayıtlaştırıldıkça burada görünür.
              </td>
            </tr>
          )}
          {errorMessage === undefined &&
            rows?.map((row) => (
              <tr key={row.account_id} data-testid={`mz-row-${row.account_code}`}>
                {/* MZ:81-82 — kod MONO ve solgun, ad normal. */}
                <td className="mu-table__meta is-mono">{row.account_code}</td>
                {/* MZ:82 — ad, rakamlardan 1px BÜYÜKtür (13px). */}
                <td className="mu-tb__name">{row.account_name}</td>
                <Money value={row.opening_debit} />
                <Money value={row.opening_credit} />
                <Money value={row.period_debit} />
                <Money value={row.period_credit} />
                {/* MZ:87 · :128 — KAPANIŞ ikilisi tek renkli/kalın çifttir. */}
                <Money value={row.closing_debit} tone="debit" />
                <Money value={row.closing_credit} tone="credit" />
              </tr>
            ))}
        </tbody>
        {/* MZ:161-171 — GENEL TOPLAM. 🔴 K15: mockup'ın tfoot RAKAMLARI kendi
            satırlarıyla çelişir; buradan alınan yalnız YAPIdır (iki kimlik
            sütununu birleştiren `colspan=2` + altı ayrı toplam). Rakamlar
            SUNUCUNUN `totals` alanından gelir — istemci toplam ÜRETMEZ. */}
        {/* 🔴 Boş dönemde tfoot da BASILMAZ (hata dalının kardeşi): altı `—`
            taşıyan bir `GENEL TOPLAM`, "hesap yok" mesajının hemen altında
            gürültüdür ve toplamın bir şeyi topladığını ima ederdi. */}
        {errorMessage === undefined && totals !== undefined && rows !== undefined && rows.length > 0 && (
          <tfoot>
            <tr className="mu-tb__foot" data-testid="mz-totals">
              <td colSpan={2}>GENEL TOPLAM</td>
              <Money value={totals.opening_debit} tone="debit" foot />
              <Money value={totals.opening_credit} tone="credit" foot />
              <Money value={totals.period_debit} tone="debit" foot />
              <Money value={totals.period_credit} tone="credit" foot />
              <Money value={totals.closing_debit} tone="debit" foot closing />
              <Money value={totals.closing_credit} tone="credit" foot closing />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/**
 * TEK bir para hücresi. Sıfır → `—` (MZ:84/94/123 — `0` YAZILMAZ); dolu →
 * `formatAmount`. `null` (IZN-F4b.2 — rol için gizli) → `—`, ton/ağırlık basılmaz.
 *
 * `tone` verilmezse hücre NÖTRdür (2. katman: açılış + dönem, MZ:83/85-86).
 * `foot` `tfoot`un `700` ağırlığını, `closing` de kapanış ikilisinin 1px
 * büyük punto'sunu (MZ:168-169) açar.
 */
function Money({
  value,
  tone,
  foot = false,
  closing = false,
}: {
  value: string | null;
  tone?: "debit" | "credit";
  foot?: boolean;
  closing?: boolean;
}) {
  const cellClass = ["is-right", "is-mono", "mu-tb__cell", closing ? "mu-tb__cell--closing" : null]
    .filter((part) => part !== null)
    .join(" ");
  if (value === null || isZeroDecimalString(value)) {
    return (
      <td className={cellClass}>
        <span className="mu-table__empty-cell">{EMPTY_SIDE}</span>
      </td>
    );
  }
  const spanClass = [
    tone === undefined ? "mu-tb__plain" : `mu-amount--${tone}`,
    foot ? "mu-tb__total" : null,
  ]
    .filter((part) => part !== null)
    .join(" ");
  return (
    <td className={cellClass}>
      <span className={spanClass}>{formatAmount(value)}</span>
    </td>
  );
}
