import { Badge, Button } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";

import {
  accountStatusLabel,
  accountStatusTone,
  accountTypeLabel,
  accountTypeVariant,
  balanceTone,
  CONTRA_BADGE_LABEL,
  CONTRA_BADGE_TEXT,
  CONTRA_BADGE_VARIANT,
  formatBalance,
  type ChartRow,
} from "./chart-of-accounts-rows";

export interface ChartOfAccountsTableProps {
  rows: readonly ChartRow[];
  isLoading: boolean;
  errorMessage?: string;
  /** Aramada sonuç yoksa boş metin farklıdır — sessiz boş tablo YASAK. */
  isFiltered: boolean;
  canWrite: boolean;
  canDelete: boolean;
  busyAccountId: string | null;
  onEdit: (accountId: string) => void;
  onDeactivate: (accountId: string) => void;
  onDelete: (accountId: string) => void;
}

/**
 * HP:54-213 · Hesap Planı tablosu.
 *
 * 🔴 ONAYLI SAPMA (T2'nin "Taslak Fişler" paneliyle aynı sınıf): mockup BEŞ
 * sütun çizer (HP:58-62) ve hiçbir satır EYLEMİ göstermez — ama HP:50
 * `+ Hesap Ekle`nin açtığı formun düzenleme kipi ve kullanımdan kaldırma
 * yolu (yönetim kararı 3) bir yüzey ister. Mockup'ın beş sütunu SIRASIYLA
 * korunur, `İşlemler` sonuna EKLENİR.
 */
const COLUMN_COUNT = 6;

/** Grup satırında ad, kod DIŞINDAKİ bütün sütunları yutar (HP:73 `colspan=4`). */
const GROUP_NAME_COLSPAN = COLUMN_COUNT - 1;

export function ChartOfAccountsTable({
  rows,
  isLoading,
  errorMessage,
  isFiltered,
  canWrite,
  canDelete,
  busyAccountId,
  onEdit,
  onDeactivate,
  onDelete,
}: ChartOfAccountsTableProps) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  return (
    <div className="mu-table-scroll">
      <table className="mu-table mu-chart">
        <thead>
          <tr>
            {/* HP:58-62 — sıra mockup'ın sırasıdır. */}
            <th scope="col">Kod</th>
            <th scope="col">Hesap Adı</th>
            <th scope="col" className="is-center">
              Tür
            </th>
            <th scope="col" className="is-right">
              Bakiye (₺)
              <MaskedMark isHidden={isHidden} values={rows.map((row) => (row.kind === "account" ? row.account.balance : undefined))} />
            </th>
            <th scope="col" className="is-center">
              Durum
            </th>
            <th scope="col" className="is-right">
              İşlemler
            </th>
          </tr>
        </thead>
        <tbody>
          {errorMessage !== undefined && (
            <tr>
              <td
                colSpan={COLUMN_COUNT}
                className="mu-table__state mu-table__state--danger"
                data-testid="hp-error"
              >
                {errorMessage}
              </td>
            </tr>
          )}
          {errorMessage === undefined && isLoading && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="mu-table__state" data-testid="hp-loading">
                Hesap planı yükleniyor…
              </td>
            </tr>
          )}
          {errorMessage === undefined && !isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={COLUMN_COUNT} className="mu-table__state" data-testid="hp-empty">
                {isFiltered
                  ? "Aramanızla eşleşen hesap yok. Arama kod ve hesap adı üzerinde çalışır."
                  : "Hesap planı boş. “+ Hesap Ekle” ile ilk hesabı açabilirsiniz."}
              </td>
            </tr>
          )}
          {errorMessage === undefined &&
            rows.map((row) => {
              if (row.kind === "class") {
                // HP:68-69 · 134-135 · 160-161 · 186-187 — SUNUCUDAN GELMEYEN
                // bant; etiket ve tema `class_code`ten türetilir.
                return (
                  <tr key={row.key} className={`mu-chart__class mu-chart__class--${row.theme}`}>
                    <td colSpan={COLUMN_COUNT} data-testid={`hp-class-${row.classCode}`}>
                      {row.label}
                    </td>
                  </tr>
                );
              }
              if (row.kind === "group") {
                // HP:71-73 · 96-98 · 114-116 — `level === 1` grup satırı.
                return (
                  <tr key={row.key} className="mu-chart__group">
                    <td className="is-mono" data-testid={`hp-group-${row.account.code}`}>
                      {row.account.code}
                    </td>
                    <td colSpan={GROUP_NAME_COLSPAN}>{row.account.name}</td>
                  </tr>
                );
              }
              const { account } = row;
              const busy = busyAccountId === account.id;
              return (
                <tr key={row.key} data-testid={`hp-row-${account.code}`}>
                  {/* HP:76 — kod MONO ve girintilidir (adım 16px). */}
                  <td className={`mu-table__meta is-mono mu-chart__code--${row.indent}`}>
                    {account.code}
                    {/* 🔴 K5 — `is_contra`nın EKRANDAKİ tek görünür sonucu.
                        Kodun YANINDA durur: kontra bilgisi hesabın kimliğine
                        aittir, bakiyesinin yorumuna değil (`Bakiye` sütunu
                        kontra BİLMEZ — `balance.py:52-57`). */}
                    {row.isContra && (
                      <Badge
                        variant={CONTRA_BADGE_VARIANT}
                        className="mu-chart__contra"
                        role="img"
                        aria-label={CONTRA_BADGE_LABEL}
                        title={CONTRA_BADGE_LABEL}
                        data-testid={`hp-contra-${account.code}`}
                      >
                        {CONTRA_BADGE_TEXT}
                      </Badge>
                    )}
                  </td>
                  <td>{account.name}</td>
                  {/* HP:60 `Tür` — `account_type` rozeti. */}
                  <td className="is-center">
                    <Badge
                      variant={accountTypeVariant(account.account_type)}
                      data-testid={`hp-type-${account.code}`}
                    >
                      {accountTypeLabel(account.account_type)}
                    </Badge>
                  </td>
                  {/* HP:61 `Bakiye (₺)` — negatif PARANTEZ içinde (HP:155). */}
                  <td className="is-right is-mono">
                    <span
                      className={`mu-chart__balance mu-chart__balance--${balanceTone(
                        account.balance,
                        account.account_type,
                      )}`}
                      data-testid={`hp-balance-${account.code}`}
                    >
                      {formatBalance(account.balance)}
                    </span>
                  </td>
                  {/* HP:62 `Durum` — `is_active` noktası. TÜR DEĞİLDİR. */}
                  <td className="is-center">
                    <span
                      className={`mu-chart__dot mu-chart__dot--${accountStatusTone(
                        account.is_active,
                      )}`}
                      role="img"
                      aria-label={accountStatusLabel(account.is_active)}
                      data-testid={`hp-status-${account.code}`}
                    />
                  </td>
                  <td className="is-right">
                    <div className="mu-actions-cell">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!canWrite || busy}
                        data-testid={`hp-edit-${account.code}`}
                        onClick={() => onEdit(account.id)}
                      >
                        Düzenle
                      </Button>
                      {/* 🔴 BİRİNCİL eylem PASİFLEŞTİRMEdir, silme değil
                          (yönetim kararı 3). Zaten pasif hesapta sunulmaz. */}
                      {account.is_active && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!canWrite || busy}
                          data-testid={`hp-deactivate-${account.code}`}
                          onClick={() => onDeactivate(account.id)}
                        >
                          Pasifleştir
                        </Button>
                      )}
                      {/* Silme yalnız yetkili yüzeyde; uç `admin` kapısındadır. */}
                      {canDelete && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy}
                          data-testid={`hp-delete-${account.code}`}
                          onClick={() => onDelete(account.id)}
                        >
                          Sil
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
