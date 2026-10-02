"use client";

import { Button, Input } from "@/components/ui";
import { BooksIcon, CheckIcon, SearchIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";

interface RatesToolbarProps {
  /** Görüntüleyicide eylem düğmeleri gizlenir (BÜT:488). */
  showActions: boolean;
  editable: boolean;
  filling: boolean;
  /** TKL-F5.5 · ÜS-F5-24: "Sözleşmeden doldur" görünür mü (kısıtlıda gizli, SO-57). */
  showFillFromContract?: boolean;
  fillingFromContract?: boolean;
  onFillFromContract?: () => void;
  selectedCount: number;
  bulkOpen: boolean;
  query: string;
  onlyEmpty: boolean;
  onSuggestAll: () => void;
  onToggleBulk: () => void;
  onQuery: (value: string) => void;
  onToggleEmpty: () => void;
}

/** Adım 1 başlık çubuğu — Adam-Saat Bütçesi.dc.html:179-188. */
export function RatesToolbar(props: RatesToolbarProps) {
  const { showActions, editable, selectedCount, onlyEmpty } = props;
  return (
    <div className="ev-budget-toolbar">
      <h2 className="ev-budget-card__title">Adım 1 · Oranlar</h2>
      {showActions && (
        <>
          <Button variant="secondary" size="sm" disabled={!editable || props.filling} onClick={props.onSuggestAll}>
            <BooksIcon width={13} height={13} aria-hidden="true" />
            Katalogdan öner (tümü)
          </Button>
          {props.showFillFromContract === true && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!editable || props.filling || props.fillingFromContract === true}
              onClick={props.onFillFromContract}
            >
              Sözleşmeden doldur
            </Button>
          )}
          <button
            type="button"
            className={cx("ev-budget-bulk-btn", editable && selectedCount > 0 && "ev-budget-bulk-btn--active")}
            disabled={!editable || selectedCount === 0}
            aria-expanded={props.bulkOpen}
            onClick={props.onToggleBulk}
          >
            Seçili satırlara toplu oran ata · {selectedCount}
          </button>
        </>
      )}
      <Input
        wrapperClassName="ev-budget-search"
        leftIcon={<SearchIcon width={13} height={13} />}
        aria-label="Kalem veya bölüm ara"
        placeholder="Kalem veya bölüm ara"
        value={props.query}
        onChange={(event) => props.onQuery(event.target.value)}
      />
      <button
        type="button"
        aria-pressed={onlyEmpty}
        className={cx("ev-budget-empty-btn", onlyEmpty && "ev-budget-empty-btn--on")}
        onClick={props.onToggleEmpty}
      >
        <span className="ev-budget-empty-btn__box" aria-hidden="true">
          {onlyEmpty && <CheckIcon width={9} height={9} />}
        </span>
        Yalnız oranı boş olanlar
      </button>
    </div>
  );
}

interface BulkRateBarProps {
  count: number;
  names: string;
  value: string;
  onValue: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

/** BÜT:189-201 — seçili yapraklara tek oran. */
export function BulkRateBar({ count, names, value, onValue, onApply, onCancel }: BulkRateBarProps) {
  return (
    <div className="ev-budget-bulk" role="group" aria-label="Toplu oran ata">
      <b>{count} bölüm satırı seçili</b>
      <span className="ev-budget-bulk__names">{names}</span>
      <div className="ev-budget-bulk__form">
        <span className="ev-budget-bulk__caption">Oran</span>
        <Input
          size="row"
          numeric
          inputMode="decimal"
          aria-label="Toplu oran"
          placeholder="0,00"
          className="ev-budget-bulk__input"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onApply();
          }}
        />
        <span className="ev-budget-bulk__unit">a-s/birim</span>
        <Button size="sm" onClick={onApply}>
          Uygula
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Vazgeç
        </Button>
      </div>
    </div>
  );
}
