import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import type { LedgerRow } from "@/lib/api/hooks/useLedger";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount, formatDateDots } from "@/lib/format";

interface LedgerTableProps {
  rows: readonly LedgerRow[] | undefined;
  isLoading: boolean;
  errorMessage?: string;
}

const COLUMN_COUNT = 6;

/** E8:114/123 — boş taraf `—` (em dash) ve SOLGUNdur. */
const EMPTY_SIDE = "—";

/**
 * E8:98-159 — Tarih · Hesap Kodu · Açıklama · Borç · Alacak · Bakiye.
 *
 * 🔴 SATIR bazlıdır, fiş bazlı DEĞİL: aynı fişin iki bacağı iki ayrı satırdır.
 *
 * 🔴 `running_balance` OLDUĞU GİBİ basılır — sunucu onu `carried_balance`
 * üstüne kurar; istemcide yeniden hesaplamak sayfalanmış pencerede yanlış
 * seri üretirdi.
 *
 * 🔴 `draft` fiş bu uca HİÇ girmez, `reversed` girer — istemci yeniden
 * SÜZMEZ (sunucunun `POSTING_STATUSES` kararı tek sahiptir).
 */
export function LedgerTable({ rows, isLoading, errorMessage }: LedgerTableProps) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  // IZN-F4b.2 — gizli sütun başlığında TEK kilit; hücreler `—`.
  const marks = {
    debit: (rows ?? []).map((row) => row.debit),
    credit: (rows ?? []).map((row) => row.credit),
    balance: (rows ?? []).map((row) => row.running_balance),
  };
  return (
    <div className="mu-table-scroll">
      <table className="mu-table">
        <thead>
          <tr>
            {/* E8:101-106 */}
            <th scope="col">Tarih</th>
            <th scope="col">Hesap Kodu</th>
            <th scope="col">Açıklama</th>
            <th scope="col" className="is-right">
              Borç
              <MaskedMark isHidden={isHidden} values={marks.debit} />
            </th>
            <th scope="col" className="is-right">
              Alacak
              <MaskedMark isHidden={isHidden} values={marks.credit} />
            </th>
            <th scope="col" className="is-right">
              Bakiye
              <MaskedMark isHidden={isHidden} values={marks.balance} />
            </th>
          </tr>
        </thead>
        <tbody>
          {errorMessage !== undefined && (
            <tr>
              <td
                colSpan={COLUMN_COUNT}
                className="mu-table__state mu-table__state--danger"
                data-testid="mu-ledger-error"
              >
                {errorMessage}
              </td>
            </tr>
          )}
          {errorMessage === undefined && isLoading && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="mu-table__state" data-testid="mu-ledger-loading">
                Yevmiye defteri yükleniyor…
              </td>
            </tr>
          )}
          {errorMessage === undefined && !isLoading && rows !== undefined && rows.length === 0 && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="mu-table__state" data-testid="mu-ledger-empty">
                Bu dönemde deftere giren kayıt yok. Taslak fişler deftere girmez;
                kayıtlaştırılınca burada görünür.
              </td>
            </tr>
          )}
          {errorMessage === undefined &&
            rows?.map((row, index) => (
              // Aynı fişin iki bacağı aynı `entry_id`yi taşır → anahtar
              // fiş kimliği TEK BAŞINA benzersiz DEĞİLDİR; hesap ve sıra
              // eklenir (`index` tek başına da yetmezdi: satırlar sıralanır).
              <tr key={`${row.entry_id}-${row.account_id}-${index}`}>
                <td className="mu-table__meta is-mono">{formatDateDots(row.entry_date)}</td>
                <td className="mu-table__meta is-mono">{row.account_code}</td>
                <td>
                  {/* E8:113 — ÜST satır açıklama, ALT satır serbest metin not. */}
                  <div className="mu-table__desc">{row.description}</div>
                  {row.detail_note !== null && row.detail_note.length > 0 && (
                    <div className="mu-table__note">{row.detail_note}</div>
                  )}
                </td>
                <td className="is-right is-mono">
                  {row.debit === null || isZero(row.debit) ? (
                    <span className="mu-table__empty-cell">{EMPTY_SIDE}</span>
                  ) : (
                    <span className="mu-amount--debit">{formatAmount(row.debit)}</span>
                  )}
                </td>
                <td className="is-right is-mono">
                  {row.credit === null || isZero(row.credit) ? (
                    <span className="mu-table__empty-cell">{EMPTY_SIDE}</span>
                  ) : (
                    <span className="mu-amount--credit">{formatAmount(row.credit)}</span>
                  )}
                </td>
                <td className="is-right is-mono">
                  <span className="mu-amount--balance">{formatAmount(row.running_balance)}</span>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Bir bacak ya borç ya alacaktır; kullanılmayan taraf sunucudan `"0.00"`
 * gelir. Dize KARŞILAŞTIRMASI yapılmaz (`"0"`, `"0.00"`, `"0.0000"` hepsi
 * sıfırdır) — sayısal karşılaştırma tek doğru testtir.
 */
function isZero(value: string): boolean {
  const amount = Number(value);
  return Number.isFinite(amount) && amount === 0;
}
