"use client";

import { Button, Input, Select } from "@/components/ui";
import { cx } from "@/lib/cx";
import { EMPTY_CELL } from "@/lib/format";
import type { ChartAccountResponse } from "@/lib/api/hooks/useChartOfAccounts";

import {
  isSideLocked,
  lineFilledSide,
  JOURNAL_FORM_TEXT,
  type JournalLineDraft,
  type LineSide,
} from "./journal-entry-form";

export interface JournalLinesEditorProps {
  lines: readonly JournalLineDraft[];
  /** Yalnız YAPRAK hesaplar (backend §4c) — süzgeç `selectableLineAccounts`ten. */
  accounts: readonly ChartAccountResponse[];
  /**
   * Seçenek listesinde bulunmayan bir hesabın etiketi (düzenlenen fişin satırı
   * kataloğun sayfasında olmayabilir). `undefined` ⇒ hiç bilinmiyor.
   */
  labelOf: (accountId: string) => string | undefined;
  disabled: boolean;
  onAccountChange: (key: string, accountId: string) => void;
  onAmountChange: (key: string, side: LineSide, raw: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}

/** `M:119-124` — `#` · `Hesap` · `Borç ₺` · `Alacak ₺` · sil. */
const COLUMN_COUNT = 5;

/**
 * Fişin bacakları — kanon `Form - Yevmiye Kaydi.dc.html` `M:111-192`
 * (`M:` = o dosyanın satırı).
 *
 * 🔴 **`M:121` `Satır Açıklaması` SÜTUNU ÇİZİLMEZ — KARAR K4.**
 * Mockup bu sütunu dolu değerlerle çizer ama şemada KARŞILIĞI YOKTUR:
 * `JournalLineInput` = `account_id` · `debit` · `credit` ve `extra="forbid"`
 * (`schema.d.ts:9088-9107` bunu açıkça yazar: *"Satırda `description` ve
 * `sort_order` YOKTUR"*). Bu "şema yetişmedi" DEĞİL **tasarımcı icadıdır**.
 * F-TH'nin *"rotası olmayan öğe devre-dışı basılır"* kanonu burada YANLIŞ
 * REÇETEdir: kullanıcının yazdığı satır açıklaması hiçbir yere gitmez, gövdeye
 * konsaydı 422 gelirdi. Sütun HİÇ basılmaz; sonraki okuyucu mockup'a bakıp
 * "eksik kalmış" SANMASIN.
 *
 * 🔴 **TEK TARAF**: bir bacakta hem borç hem alacak dolamaz
 * (`ck_journal_lines_single_side`). Bir tarafa değer girilince öteki taraf
 * TEMİZLENİR ve KİLİTLENİR (`M:144`/`M:161` soluk+disabled), dolu taraf ise
 * VURGULANIR (`M:143` kırmızı zemin · `M:162` yeşil zemin) — kullanıcı 422'yi
 * beklemeden kuralı görür.
 *
 * Ham `<select>/<input>` YASAK: `Select`/`Input` primitive'leri (`size="row"`).
 */
export function JournalLinesEditor({
  lines,
  accounts,
  labelOf,
  disabled,
  onAccountChange,
  onAmountChange,
  onAdd,
  onRemove,
}: JournalLinesEditorProps) {
  return (
    <section className="mu-lines" aria-label={JOURNAL_FORM_TEXT.linesTitle}>
      {/* `M:112-116` — başlık, kuralın ipucu ve sağa yaslı ekleme düğmesi. */}
      <div className="mu-lines__head">
        <span className="mu-panel__title">{JOURNAL_FORM_TEXT.linesTitle}</span>
        <span className="mu-lines__hint" data-testid="mu-lines-hint">
          {JOURNAL_FORM_TEXT.linesHint}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="mu-lines__add"
          disabled={disabled}
          data-testid="mu-line-add"
          onClick={onAdd}
        >
          + Satır Ekle
        </Button>
      </div>
      <div className="mu-table-scroll">
        <table className="mu-table mu-lines__table" data-testid="mu-lines-editor">
          <thead>
            <tr>
              {/* `M:119` — sıra no; MONO ve ortalı. */}
              <th scope="col" className="mu-lines__th-no">
                #
              </th>
              <th scope="col">
                Hesap{" "}
                <span className="mu-lines__req" aria-hidden="true">
                  *
                </span>
              </th>
              {/* `M:122-123` — Borç KIRMIZI, Alacak YEŞİL başlıklıdır. */}
              <th scope="col" className="is-right mu-lines__th--debit">
                Borç ₺
              </th>
              <th scope="col" className="is-right mu-lines__th--credit">
                Alacak ₺
              </th>
              <th scope="col">
                <span className="sr-only">Sil</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="mu-table__state" data-testid="mu-lines-empty">
                  Fişte satır yok; en az iki satır ekleyin.
                </td>
              </tr>
            )}
            {lines.map((line, index) => {
              const rowNo = index + 1;
              const filled = lineFilledSide(line);
              const isKnown =
                line.accountId.length === 0 ||
                accounts.some((account) => account.id === line.accountId);
              return (
                <tr key={line.key} data-testid="mu-line-row">
                  <td className="mu-lines__no is-mono" data-testid={`mu-line-no-${index}`}>
                    {rowNo}
                  </td>
                  <td>
                    <Select
                      size="row"
                      aria-label={`${rowNo}. satır hesabı`}
                      value={line.accountId}
                      disabled={disabled}
                      data-testid={`mu-line-account-${index}`}
                      onChange={(event) => onAccountChange(line.key, event.target.value)}
                    >
                      <option value="">Hesap seçin</option>
                      {/* Kataloğun sayfasında olmayan mevcut hesap DÜŞÜRÜLMEZ:
                          seçenek yoksa tarayıcı değeri sessizce ilk seçeneğe
                          kaydırır ve kullanıcı farkında olmadan hesabı değiştirirdi. */}
                      {!isKnown && (
                        <option value={line.accountId}>
                          {labelOf(line.accountId) ?? "Listede olmayan hesap"}
                        </option>
                      )}
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} · {account.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    <Input
                      size="row"
                      type="number"
                      step="any"
                      min="0"
                      className={cx(
                        "mu-line-amount",
                        "mu-line-amount--debit",
                        filled === "debit" && "is-filled",
                      )}
                      aria-label={`${rowNo}. satır borç tutarı`}
                      value={line.debit}
                      placeholder={line.isMasked === true ? EMPTY_CELL : undefined}
                      disabled={disabled || isSideLocked(line, "debit")}
                      data-testid={`mu-line-debit-${index}`}
                      onChange={(event) => onAmountChange(line.key, "debit", event.target.value)}
                    />
                  </td>
                  <td>
                    <Input
                      size="row"
                      type="number"
                      step="any"
                      min="0"
                      className={cx(
                        "mu-line-amount",
                        "mu-line-amount--credit",
                        filled === "credit" && "is-filled",
                      )}
                      aria-label={`${rowNo}. satır alacak tutarı`}
                      value={line.credit}
                      placeholder={line.isMasked === true ? EMPTY_CELL : undefined}
                      disabled={disabled || isSideLocked(line, "credit")}
                      data-testid={`mu-line-credit-${index}`}
                      onChange={(event) => onAmountChange(line.key, "credit", event.target.value)}
                    />
                  </td>
                  <td className="is-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      aria-label={`${rowNo}. satırı sil`}
                      data-testid={`mu-line-remove-${index}`}
                      onClick={() => onRemove(line.key)}
                    >
                      &times;
                    </Button>
                  </td>
                </tr>
              );
            })}
            {/* `M:183-190` — tablonun ALTINDAKİ kesikli ekleme satırı. Mockup iki
                ekleme yolu çizer (başlıkta ve altta); uzun fişte kullanıcı
                başlığa kadar geri kaydırmak zorunda kalmasın diye ikisi de
                basılır. `M:186`nın artı SVG'si yerine ASCII `+` kullanılır:
                yeni ikon `ui/icons`a eklenmeden aynı işaret elde edilir ve
                `+` (U+002B) yazı tipi alt-kümesinde ZATEN vardır. */}
            <tr className="mu-lines__foot">
              <td colSpan={COLUMN_COUNT}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mu-lines__add-row"
                  disabled={disabled}
                  data-testid="mu-line-add-bottom"
                  onClick={onAdd}
                >
                  + Satır Ekle
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
