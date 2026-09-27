"use client";

import { useState } from "react";

import { Button, Input } from "@/components/ui";
import { cx } from "@/lib/cx";
import { formatAmount, formatCurrencyPrecise, formatPercent, formatQuantity } from "@/lib/format";
import { toDecimalString } from "@/lib/decimal";
import { asPercent } from "@/lib/api/scale";
import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";
import { decimalInputValue, groupContractItems } from "@/components/subcontractor-contract-form/item-rows";
import { FSO_TEXT } from "@/components/subcontractor-contract-form/constants";

import { contractProgressWidth } from "./contract-progress";
import { tsdProgressTone } from "./subcontractor-item-progress";
import "./employer-contract-detail.css";
import "./subcontractor-contract-detail.css";

/**
 * TSD 88-182 · "Poz Listesi & Taşeron Fiyatları" tablosu.
 *
 * Tablo KABUĞU E14/POZ ile PAYLAŞILIR (`.ecd-items__*` — görev emri: "yeniden
 * türetme, paylaş"); yalnız bu ekrana özgü üç yüzey `.tsd-items__*` ile
 * eklenir: yıldızlı B.F. girdisi (101, 115), Hakediş % kolonu (103, 117-120)
 * ve kehribar tfoot (175-179).
 *
 * Kolonlar 97-103'ten BİREBİR: Poz No · Poz Adı · Birim · Sözleşme Miktarı ·
 * ⭐ Taşeron B.F. (₺) · Toplam Bedel · Hakediş %.
 *
 * **TEK YAZILABİLİR ALAN: Taşeron B.F.** Mockup'ta yalnız 115/127/139/154/166
 * `<input>`tir; Sözleşme Miktarı (114) DÜZ METİNdir — FSO'nun (form) miktar
 * girdisi buraya TAŞINMAZ. Düzenleme deseni FSO ile aynıdır: blur'da commit,
 * değişmediyse istek yok, **boş = `null`** ("girilmedi"; `0` ASLA türetilmez).
 */
export interface SubcontractorContractItemsTableProps {
  items: readonly SubcontractorContractItemResponse[];
  /** 176-177 · tfoot TEK KAYNAK. Mockup 73'teki ₺4,82M ile çelişir; şema kazanır. */
  contractTotal: string | null;
  /** `items_missing_price` — fiyatsız satır sayacı (görünür uyarı). */
  itemsMissingPrice: number;
  /** 91 rozetindeki işveren sözleşme no'su; yoksa rozet basılmaz. */
  employerContractNo: string | null;
  /** 103 · poz kimliği → yüzde. `null` ⇒ kolon PENDING (kırpılmış/eksik veri). */
  progressPctByItemId: Map<string, number> | null;
  /** 103 · PENDING gerekçesi. */
  progressPendingReason: string;
  isBusy: boolean;
  /** Satır hatası (PATCH reddi) — mockup'ta yok, sessiz yutma yasak. */
  errorMessage: string | null;
  onCommitUnitPrice: (itemId: string, value: string) => void;
  /**
   * 92 · "+ Poz Ekle". Form mockup'ı geldi (`Form - Poz Ekle Taseron.dc.html`)
   * → buton ARTIK AKTİF; diyalogu sahibi ekran (TSD) açar.
   */
  onAddItem: () => void;
}

const COLUMN_COUNT = 7;
const DASH = "—";

/** 176 · "TOPLAM SÖZLEŞME BEDELİ" etiketi mockup'ın kendi metnidir. */
const FOOT_LABEL_COLSPAN = 5;

export function SubcontractorContractItemsTable({
  items,
  contractTotal,
  itemsMissingPrice,
  employerContractNo,
  progressPctByItemId,
  progressPendingReason,
  isBusy,
  errorMessage,
  onCommitUnitPrice,
  onAddItem,
}: SubcontractorContractItemsTableProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const groups = groupContractItems(items);

  function commit(item: SubcontractorContractItemResponse) {
    const draft = drafts[item.id];
    // Mutasyon YOK: alanı çıkarılmış YENİ nesne kurulur (FSO deseni).
    setDrafts((prev) => {
      if (prev[item.id] === undefined) return prev;
      return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== item.id));
    });
    if (draft === undefined) return;
    const next = draft.trim();
    if (next === decimalInputValue(item.unit_price)) return;
    onCommitUnitPrice(item.id, next);
  }

  return (
    <section className="ecd-items tsd-items" aria-labelledby="tsd-items-title" data-testid="tsd-items">
      {/* 89-93 · başlık şeridi */}
      <div className="ecd-items__head">
        <span className="ecd-items__head-title" id="tsd-items-title">
          Poz Listesi &amp; Taşeron Fiyatları
        </span>
        {employerContractNo && (
          <span className="tsd-items__badge" data-testid="tsd-items-source">
            {employerContractNo}&apos;den yüklendi
          </span>
        )}
        {/* 92 · "+ Poz Ekle" — form mockup'ı geldi (F-BLG T2a), buton AKTİF.
            Diyalog: `SubcontractorItemFormModal`. */}
        <Button
          variant="ghost"
          className="tsd-items__add"
          onClick={onAddItem}
          disabled={isBusy}
          data-testid="tsd-add-item"
        >
          {FSO_TEXT.addItem}
        </Button>
      </div>

      {itemsMissingPrice > 0 && (
        <p className="tsd-items__notice" data-testid="tsd-missing-price">
          {itemsMissingPrice} pozun Taşeron B.F. değeri {FSO_TEXT.missingPriceLabel} — bu satırlar
          sözleşme bedeline katkı vermez.
        </p>
      )}
      {errorMessage && (
        <p className="tsd-items__notice tsd-items__notice--error" data-testid="tsd-items-error">
          {errorMessage}
        </p>
      )}

      <div className="ecd-items__scroll">
        <table className="ecd-items__table">
          <thead>
            <tr>
              <th className="ecd-items__th ecd-items__th--lead">Poz No</th>
              <th className="ecd-items__th ecd-items__th--lead">Poz Adı</th>
              <th className="ecd-items__th ecd-items__th--center">Birim</th>
              <th className="ecd-items__th ecd-items__th--right">Sözleşme Miktarı</th>
              <th className="ecd-items__th ecd-items__th--right tsd-items__th--star">
                ⭐ Taşeron B.F. (₺)
              </th>
              <th className="ecd-items__th ecd-items__th--right tsd-items__th--total">
                Toplam Bedel
              </th>
              <th className="ecd-items__th ecd-items__th--center">Hakediş %</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="ecd-empty" colSpan={COLUMN_COUNT}>
                  Bu sözleşmede henüz poz yok.
                </td>
              </tr>
            ) : (
              groups.map((group, groupIndex) => (
                <ItemGroup
                  key={group.key}
                  group={group}
                  groupIndex={groupIndex}
                  drafts={drafts}
                  isBusy={isBusy}
                  progressPctByItemId={progressPctByItemId}
                  progressPendingReason={progressPendingReason}
                  onDraft={(itemId, value) =>
                    setDrafts((prev) => ({ ...prev, [itemId]: value }))
                  }
                  onCommit={commit}
                />
              ))
            )}
          </tbody>
          <tfoot>
            {/* 175-179 · TEK KAYNAK `contract_total`. Mockup 73'teki ₺4.820.000
                ile 177'deki ₺3.281.500 birbirini TUTMAZ (mockup iç çelişkisi);
                onaylı karar (K5 emsali): sunucunun türev toplamı kazanır ve
                başlıktaki sabit sayı KOPYALANMAZ. */}
            <tr className="tsd-items__foot-row">
              <td className="tsd-items__foot-cell" colSpan={FOOT_LABEL_COLSPAN}>
                {FSO_TEXT.itemsTotal}
              </td>
              <td
                className="tsd-items__foot-cell tsd-items__foot-cell--value"
                data-testid="tsd-items-total"
              >
                {formatCurrencyPrecise(contractTotal)}
              </td>
              <td className="tsd-items__foot-cell" />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

interface ItemGroupProps {
  group: ReturnType<typeof groupContractItems>[number];
  groupIndex: number;
  drafts: Record<string, string>;
  isBusy: boolean;
  progressPctByItemId: Map<string, number> | null;
  progressPendingReason: string;
  onDraft: (itemId: string, value: string) => void;
  onCommit: (item: SubcontractorContractItemResponse) => void;
}

function ItemGroup({
  group,
  groupIndex,
  drafts,
  isBusy,
  progressPctByItemId,
  progressPendingReason,
  onDraft,
  onCommit,
}: ItemGroupProps) {
  return (
    <>
      {group.name && (
        // 107 mavi / 146 yeşil — iki grup İKİ AYRI tonda; ton grup SIRASINA
        // göre dönüşümlü (FSO ile aynı kural).
        <tr
          className={cx(
            "ecd-items__group-row",
            groupIndex % 2 === 1 && "tsd-items__group-row--alt",
          )}
        >
          <td
            className={cx(
              "ecd-items__group-cell",
              groupIndex % 2 === 1 && "tsd-items__group-cell--alt",
            )}
            colSpan={COLUMN_COUNT}
          >
            {group.name}
          </td>
        </tr>
      )}
      {group.items.map((item) => {
        const hasPrice = item.unit_price !== null;
        const pct = progressPctByItemId?.get(item.id);
        return (
          <tr className="ecd-items__row" key={item.id}>
            <td className="ecd-items__td ecd-items__td--code">{item.code}</td>
            <td className="ecd-items__td ecd-items__td--name">{item.description}</td>
            <td className="ecd-items__td ecd-items__td--center">{item.unit}</td>
            {/* 114 · SALT-OKUNUR (mockup'ta düz metin) */}
            <td className="ecd-items__td ecd-items__td--price">
              {formatQuantity(item.quantity)}
            </td>
            {/* 115 · TEK yazılabilir hücre */}
            <td className="ecd-items__td tsd-items__td--input">
              <Input
                size="row"
                inputMode="decimal"
                numeric
                min={0}
                className="tsd-items__price-input"
                aria-label={`${item.code} taşeron birim fiyatı`}
                placeholder={FSO_TEXT.missingPriceLabel}
                disabled={isBusy}
                value={drafts[item.id] ?? decimalInputValue(item.unit_price)}
                onChange={(event) => onDraft(item.id, event.target.value)}
                onBlur={() => onCommit(item)}
              />
            </td>
            {/* 116 · türev satır toplamı (sunucu hesaplar) */}
            <td
              className={cx(
                "ecd-items__td tsd-items__td--line-total",
                !hasPrice && "tsd-items__td--missing",
              )}
              data-testid={`tsd-line-total-${item.code}`}
            >
              {hasPrice ? formatAmount(item.line_total) : FSO_TEXT.missingPriceLabel}
            </td>
            {/* 117-120 · Hakediş % */}
            <td className="ecd-items__td" data-testid={`tsd-progress-${item.code}`}>
              {pct === undefined ? (
                // 🔴 GEREKÇE KOŞULLU (kapsam maskesi, kullanıcı kararı
                //    2026-09-19). `progressPendingReason` "Hakediş listesi
                //    eksik" der; metraj maskeliyken (`finance` kapsamı,
                //    `quantity: null`) hakediş listesi PEKÂLÂ TAM olabilir —
                //    eksik olan metrajdır ve o da eksik değil GİZLİdir. Yanlış
                //    bir sebep, sessiz bir "—"den kötüdür; bu yüzden o hâlde
                //    gerekçe bastırılır (`placeholder-cell.ts` 3. hâli).
                item.quantity === null ? (
                  <span className="tsd-progress__pending">{DASH}</span>
                ) : (
                  <span className="tsd-progress__pending" title={progressPendingReason}>
                    {DASH}
                    <span className="sr-only">{progressPendingReason}</span>
                  </span>
                )
              ) : (
                <>
                  <div className="tsd-progress__track">
                    <div
                      className={cx(
                        "tsd-progress__fill",
                        `tsd-progress__fill--${tsdProgressTone(pct)}`,
                      )}
                      style={{ width: contractProgressWidth(pct) }}
                    />
                  </div>
                  <div
                    className={cx(
                      "tsd-progress__pct",
                      `tsd-progress__pct--${tsdProgressTone(pct)}`,
                    )}
                  >
                    {/* KAÇIŞ: pct hem width/tone (number) hem gösterim (Percent) için
                        çift kullanılıyor (buildItemProgressPct); oranı yalnız
                        formatPercent sınırında Decimal kanonuyla stringe çeviriyoruz. */}
                    {formatPercent(asPercent(toDecimalString(pct) ?? "0"))}
                  </div>
                </>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}
