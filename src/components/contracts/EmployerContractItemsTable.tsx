"use client";

import { useState } from "react";
import Link from "next/link";

import { Button, Input, Select } from "@/components/ui";
import { CheckIcon, inlineSymbolProps } from "@/components/ui/icons";
import {
  EMPLOYER_ITEM_TEXT,
  EMPLOYER_NO_GROUPS_HINT,
  MAX_LENGTH,
  UNIT_OPTIONS,
  UNIT_PLACEHOLDER_OPTION,
} from "@/components/contract-item-form/constants";
import { buildEmployerItemBody, nextSortOrder } from "@/components/contract-item-form/build-body";
import { validateEmployerItem } from "@/components/contract-item-form/validate";
import type { EmployerItemFormValues } from "@/components/contract-item-form/validate";
import type { EmployerItemCreateBody } from "@/components/contract-item-form/build-body";
import { cx } from "@/lib/cx";
import { formatAmount, formatQuantity } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import type {
  EmployerContractDetail,
  EmployerContractItemsResponse,
} from "@/lib/api/hooks/useContract";

import {
  commitInlineCell,
  decimalInputValue,
  type EmployerItemUpdateBody,
  type InlineRowDraft,
} from "./employer-item-inline";
import { employerContractDistributionHref } from "./employer-contract-tabs";
import { isRemainingSettled } from "./distribution-derive";
import "./employer-contract-detail.css";

/**
 * E14 92 · "İş Kalemleri" sekmesi.
 *
 * ⚠️ Bu sekmenin İÇERİĞİ E14 mockup'ında ÇİZİLİ DEĞİLDİR (mockup yalnız
 * "Genel" sekmesini gösterir, 97-149). Tasarım İCAT EDİLMEDİ: kanon
 * `İşveren Sözleşme - Poz Dağılımı.dc.html`tir (POZ) — aynı verinin çizilmiş
 * tek tablosu. Kolonlar POZ 77-84'ten BİREBİR alınır:
 *   POZ 77 "Poz No" · 78 "Poz Adı" · 79 "Birim" · 80 "Sözl. Birim F." ·
 *   81 "Toplam Miktar" · 82-83 şantiye kota kolonları · 84 "Kalan"
 * E14'ün ucu (`GET /projects/{id}/contract/items`) ŞANTİYE KIRILIMI VERMEZ —
 * kalem başına toplam `distributed_quantity` verir. Bu yüzden POZ'un dinamik
 * şantiye kolonları (82-83) TEK bir "Dağıtılan" kolonuna toplulaştırılır;
 * kolon eklenmez/çıkarılmaz, yalnız kırılım toplanır. Şantiye kırılımı POZ
 * ekranının işidir — sekmenin sağ üstündeki giriş oraya götürür.
 * Grup başlık satırı POZ 89-90; "Kalan" rozeti POZ 100.
 *
 * `items_total`/`items_total_diff` şemada VARDIR ama ne E14 ne POZ onları
 * çizer; veri kaybını önlemek için BOQ'un "GENEL TOPLAM" satırı emsaliyle
 * (`Ekran 13 - İş Kalemleri.dc.html` 174-176) tablonun tfoot'unda gösterilir.
 *
 * ---------------------------------------------------------------------------
 * 🔴 F-ISVPOZ · SATIR-İÇİ DÜZENLEME + SATIR-İÇİ EKLEME — ONAYLI SAPMA
 * ---------------------------------------------------------------------------
 * E14 mockup'ı başlıkta bir "Düzenle" düğmesi çizer (77) ama DÜZENLEME
 * YÜZEYİNİ ÇİZMEZ; poz tablosunda satır düzeyinde input yoktur. Yani mockup
 * bu yüzeyi EKSİK bırakmıştır. Kullanıcı "inline" dedi ve depoda KANONİK
 * EMSAL var (`subcontractor-contract-form/ContractItemsCard.tsx`): miktar ve
 * birim fiyat hücrede `Input size="row"` ile düzenlenir, `onBlur`da kaydedilir,
 * gösterim `decimalInputValue`den gelir. Yüzey o emsalden TÜRETİLDİ; yeni bir
 * etkileşim dili icat edilmedi.
 *
 * 🔴 `EmployerContractHeaderCard`taki "Düzenle" düğmesi (77) ve onun
 * `employer_contract_edit` gerekçesi DEĞİŞMEDEN kalır: o düğme SÖZLEŞMENİN
 * KENDİ alanlarını (bedel/tarih/şartlar) düzenler ve backend'de o yazma ucu
 * HÂLÂ YOKTUR. Poz düzenleme ≠ sözleşme başlığı düzenleme.
 */
export interface EmployerContractItemsTableProps {
  projectId: string;
  detail: EmployerContractDetail;
  isError: boolean;
  isLoading: boolean;
  data?: EmployerContractItemsResponse;
  /**
   * F-BLG T2a · "+ Poz Ekle" (kanon `Form - Poz Ekle Isveren.dc.html`). E14
   * mockup'ında bu sekme çizili olmadığı için buton POZ ekranının ekleme
   * girişinden türetilmedi; forma giden TEK görünür giriş budur. Sözleşmede
   * hiç grup olmasa da basılabilir (F-POZGRUP): `group_id` zorunluluğu formun
   * "+ Yeni Grup" akışıyla karşılanır, düğme kapatılarak DEĞİL.
   *
   * 🔴 F-ISVPOZ · MODAL KALDIRILMADI. Satır-içi ekleme HIZLI YOLdur ve
   * yalnız VAR OLAN bir grubun içine satır açar. Modalın taşıdığı iki yetenek
   * satıra SIĞMAZ: (a) "+ Yeni Grup" ile sözleşmenin İLK grubunu yaratmak —
   * grupsuz sözleşmede satır-içi ekleme için tutunacak grup yoktur (F-POZGRUP
   * çıkmazının ta kendisi), (b) `sort_order`ın elle verilmesi. Modal
   * kaldırılsaydı bu iki yetenek KAYBOLURDU; bu yüzden "ayrıntılı ekleme"
   * olarak yerinde kalır.
   */
  onAddItem: () => void;
  /** Hücre kaydetme — kısmi `PATCH` gövdesi zaten elenmiş/doğrulanmış gelir. */
  onCommitItem: (itemId: string, body: EmployerItemUpdateBody) => void;
  /** Satır-içi ekleme; `true` dönerse taslak satır kapanır. */
  onCreateItem: (body: EmployerItemCreateBody) => Promise<boolean>;
  /** Bir yazma uçuşta — hücreler kilitlenir (emsal `isBusy`). */
  isBusy: boolean;
  /** Sunucu hatası (`backendErrorMessage`); istemci hatasıyla aynı yerde basılır. */
  saveError: string | null;
}

const COLUMN_COUNT = 7;

/**
 * Satır-içi taslağın alanları. `group_id` ve `sort_order` YOKTUR: grup
 * satırın KONUMUNDAN, sıra ise grubun mevcut en büyük `sort_order`ından
 * türetilir — bu iki yetenek modalın işidir (bkz. `onAddItem` notu).
 */
type NewRowValues = Pick<
  EmployerItemFormValues,
  "code" | "description" | "unit" | "quantity" | "unitPrice"
>;

/** Boş taslak satır — her açılışta buradan kopyalanır (mutasyon yok). */
const EMPTY_NEW_ROW: NewRowValues = {
  code: "",
  description: "",
  unit: "",
  quantity: "",
  unitPrice: "",
};

export const INLINE_ADD_ROW_LABEL = "+ Satır Ekle";
export const INLINE_ADD_SUBMIT_LABEL = "Kaydet";
export const INLINE_ADD_CANCEL_LABEL = "Vazgeç";

export function EmployerContractItemsTable({
  projectId,
  detail,
  isError,
  isLoading,
  data,
  onAddItem,
  onCommitItem,
  onCreateItem,
  isBusy,
  saveError,
}: EmployerContractItemsTableProps) {
  const groups = data?.groups;
  // 🔴 Grup YOKLUĞU artık düğmeyi KAPATMAZ (F-POZGRUP): `group_id` hâlâ
  // zorunludur ama grup formun içinden ("+ Yeni Grup") yaratılabildiği için
  // düğmeyi kapatmak sözleşmeyi sonsuza kadar pozsuz bırakıyordu. Bayrak
  // yalnız yönlendirme metnini basmak için kalır.
  const hasGroups = (groups?.length ?? 0) > 0;

  const [drafts, setDrafts] = useState<Record<string, InlineRowDraft>>({});
  const [addingGroupId, setAddingGroupId] = useState<string | null>(null);
  const [newRow, setNewRow] = useState<NewRowValues>(EMPTY_NEW_ROW);
  const [clientError, setClientError] = useState<string | null>(null);

  // SEKME-F1.3b — hücre-içi `drafts` (odak çıkışında ANINDA kaydolur) DIŞARI
  // BIRAKILIR (kanon); yalnız YENİ SATIR taslağı commit edilmemiştir.
  useUnsavedChanges(
    addingGroupId !== null && JSON.stringify(newRow) !== JSON.stringify(EMPTY_NEW_ROW),
    "İş kalemi satırı",
  );

  function setDraft(itemId: string, patch: InlineRowDraft) {
    setDrafts((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  function clearDraft(itemId: string, field: keyof InlineRowDraft) {
    setDrafts((prev) => {
      const current = prev[itemId];
      if (!current || current[field] === undefined) return prev;
      // Mutasyon YOK: alanı çıkarılmış YENİ bir nesne kurulur.
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => key !== field),
      ) as InlineRowDraft;
      return { ...prev, [itemId]: next };
    });
  }

  /**
   * Odak çıkışında kaydetme (emsal tetikleyicisi). Taslak HER hâlde temizlenir:
   * kısıt ihlalinde hücre sunucu değerine geri döner ve sebebi basılır —
   * geçersiz metnin ekranda "kaydedilmiş gibi" durması yasaktır.
   */
  function commitCell(
    // 🔴 KAPSAM MASKESİ (2026-09-19): metraj/fiyat `null` gelebilir; gösterim
    //    `decimalInputValue` ile "" olur, kaydetme kararı ise `commitInlineCell`
    //    içinde ham metinle verilir.
    item: { id: string; quantity: string | null; unit_price: string | null },
    field: "quantity" | "unitPrice",
  ) {
    const draft = drafts[item.id]?.[field];
    const serverValue = field === "quantity" ? item.quantity : item.unit_price;
    const result = commitInlineCell(field, draft, serverValue);
    clearDraft(item.id, field);
    if (result.kind === "noop") {
      // no 52 · noop = "değer değişmedi/dokunulmadı", önceki bir hücrenin
      // ihlal hatası buna rağmen ekranda ASILI kalmamalı.
      setClientError(null);
      return;
    }
    if (result.kind === "error") {
      setClientError(result.message);
      return;
    }
    setClientError(null);
    onCommitItem(item.id, result.body);
  }

  function openAddRow(groupId: string) {
    setAddingGroupId(groupId);
    setNewRow(EMPTY_NEW_ROW);
    setClientError(null);
  }

  function closeAddRow() {
    setAddingGroupId(null);
    setNewRow(EMPTY_NEW_ROW);
    setClientError(null);
  }

  async function submitNewRow(group: EmployerContractItemsResponse["groups"][number]) {
    // Tam form doğrulamasının AYNISI koşar (`groupId` gerçek grup, sentinel
    // değil) — satır-içi yol formdan DAHA GEVŞEK olamaz.
    const problem = validateEmployerItem({ ...newRow, groupId: group.id, groupName: "", sortOrder: "" });
    if (problem) {
      setClientError(problem.message);
      return;
    }
    setClientError(null);
    const body = buildEmployerItemBody(
      { ...newRow, groupId: group.id, groupName: "", sortOrder: "" },
      nextSortOrder(group.items.map((item) => item.sort_order)),
    );
    if (await onCreateItem(body)) closeAddRow();
  }

  const errorMessage = clientError ?? saveError;

  return (
    <section className="ecd-items" aria-labelledby="ecd-items-title">
      {/* POZ 70-72 başlık şeridi + POZ ekranına GÖRÜNÜR giriş (E14'te karşılığı
          YOK; her rotanın görünür bir girişi olmalı — rapor edildi). */}
      <div className="ecd-items__head">
        <span className="ecd-items__head-title" id="ecd-items-title">
          Poz Listesi
        </span>
        <Link
          href={employerContractDistributionHref(projectId)}
          className="ecd-items__head-link"
          data-testid="ecd-distribution-link"
        >
          Poz Dağılımı →
        </Link>
        <Button
          variant="ghost"
          className="ecd-items__add"
          onClick={onAddItem}
          data-testid="ecd-add-item"
        >
          {EMPLOYER_ITEM_TEXT.addItem}
        </Button>
      </div>

      {!hasGroups && !isLoading && !isError && (
        <p className="ecd-items__notice" data-testid="ecd-add-item-reason">
          {EMPLOYER_NO_GROUPS_HINT}
        </p>
      )}

      {errorMessage && (
        <p className="ecd-items__notice ecd-items__notice--error" data-testid="ecd-items-error">
          {errorMessage}
        </p>
      )}

      {isError ? (
        <p className="ecd-empty">İş kalemleri yüklenemedi</p>
      ) : isLoading || !groups ? (
        <p className="ecd-empty">Yükleniyor…</p>
      ) : groups.length === 0 ? (
        <p className="ecd-empty">Bu sözleşmede henüz iş kalemi yok</p>
      ) : (
        <div className="ecd-items__scroll">
          <table className="ecd-items__table">
            <thead>
              <tr>
                <th className="ecd-items__th ecd-items__th--lead">Poz No</th>
                <th className="ecd-items__th ecd-items__th--lead">Poz Adı</th>
                <th className="ecd-items__th ecd-items__th--center">Birim</th>
                <th className="ecd-items__th ecd-items__th--right">Sözl. Birim F.</th>
                <th className="ecd-items__th ecd-items__th--right">Toplam Miktar</th>
                <th className="ecd-items__th ecd-items__th--right">Dağıtılan</th>
                <th className="ecd-items__th ecd-items__th--center">Kalan</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <GroupRows
                  key={group.id}
                  group={group}
                  drafts={drafts}
                  isBusy={isBusy}
                  isAdding={addingGroupId === group.id}
                  newRow={newRow}
                  onDraft={setDraft}
                  onCommitCell={commitCell}
                  onOpenAddRow={() => openAddRow(group.id)}
                  onChangeNewRow={(patch) => setNewRow((prev) => ({ ...prev, ...patch }))}
                  onCancelAddRow={closeAddRow}
                  onSubmitNewRow={() => submitNewRow(group)}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="ecd-items__foot-row">
                <td className="ecd-items__foot-cell" colSpan={COLUMN_COUNT - 1}>
                  Kalem Toplamı
                  {/* Sözleşme bedeliyle farkı — şemada `items_total_diff`. */}
                  <span className="ecd-items__foot-diff" data-testid="ecd-items-diff">
                    {" "}
                    · Sözleşme bedeliyle fark: {formatAmount(detail.items_total_diff)}
                  </span>
                </td>
                <td
                  className="ecd-items__foot-cell ecd-items__foot-cell--value"
                  data-testid="ecd-items-total"
                >
                  {formatAmount(detail.items_total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

interface GroupRowsProps {
  group: EmployerContractItemsResponse["groups"][number];
  drafts: Record<string, InlineRowDraft>;
  isBusy: boolean;
  isAdding: boolean;
  newRow: NewRowValues;
  onDraft: (itemId: string, patch: InlineRowDraft) => void;
  onCommitCell: (
    // 🔴 KAPSAM MASKESİ (2026-09-19): metraj/fiyat `null` gelebilir; gösterim
    //    `decimalInputValue` ile "" olur, kaydetme kararı ise `commitInlineCell`
    //    içinde ham metinle verilir.
    item: { id: string; quantity: string | null; unit_price: string | null },
    field: "quantity" | "unitPrice",
  ) => void;
  onOpenAddRow: () => void;
  onChangeNewRow: (patch: Partial<NewRowValues>) => void;
  onCancelAddRow: () => void;
  onSubmitNewRow: () => void;
}

function GroupRows({
  group,
  drafts,
  isBusy,
  isAdding,
  newRow,
  onDraft,
  onCommitCell,
  onOpenAddRow,
  onChangeNewRow,
  onCancelAddRow,
  onSubmitNewRow,
}: GroupRowsProps) {
  return (
    <>
      {/* POZ 89-90 */}
      <tr className="ecd-items__group-row">
        <td className="ecd-items__group-cell" colSpan={COLUMN_COUNT}>
          {group.name}
        </td>
      </tr>
      {group.items.map((item) => {
        // 🔴 KAPSAM MASKESİ — `Number()` ile okunmaz. `remaining_quantity`
        //    `Gorunurluk.operasyonel`dir ve `finance` kapsamlı rol onu `null`
        //    görür; `Number(null)` **0**'dır, yani ham okuma HER satırı yeşil
        //    "✓ 0" ile "tamamı dağıtıldı" diye damgalardı. Kural POZ 100'ün
        //    ikiz yüzeyi `ContractDistributionGrid` ile ORTAKTIR ve oradan
        //    TÜRETİLİR — ikinci bir eşik kopyası açmak, iki tablonun aynı
        //    satıra farklı cevap verdiği bir gelecek kurardı.
        const isSettled = isRemainingSettled(item.remaining_quantity);
        const draft = drafts[item.id] ?? {};
        return (
          <tr className="ecd-items__row" key={item.id}>
            <td className="ecd-items__td ecd-items__td--code">{item.code}</td>
            <td className="ecd-items__td ecd-items__td--name">{item.description}</td>
            <td className="ecd-items__td ecd-items__td--center">{item.unit}</td>
            <td className="ecd-items__td ecd-items__td--input">
              <Input
                size="row"
                inputMode="decimal"
                numeric
                // 🔴 `min` yalnız TARAYICI ipucudur; gerçek korkuluk
                // `commitInlineCell`dedir (yapıştırma/otomatik doldurma bu
                // özniteliği atlar). `type="number"` DEĞİLDİR (no 51): Türkçe
                // klavyenin virgülünü tarayıcı sessizce ""a indirger.
                min={0}
                className="ecd-items__cell-input"
                aria-label={`${item.code} birim fiyatı`}
                disabled={isBusy}
                value={draft.unitPrice ?? decimalInputValue(item.unit_price)}
                onChange={(event) => onDraft(item.id, { unitPrice: event.target.value })}
                onBlur={() => onCommitCell(item, "unitPrice")}
              />
            </td>
            <td className="ecd-items__td ecd-items__td--input">
              <Input
                size="row"
                inputMode="decimal"
                numeric
                min={0}
                className="ecd-items__cell-input"
                aria-label={`${item.code} miktar`}
                disabled={isBusy}
                value={draft.quantity ?? decimalInputValue(item.quantity)}
                onChange={(event) => onDraft(item.id, { quantity: event.target.value })}
                onBlur={() => onCommitCell(item, "quantity")}
              />
            </td>
            <td
              className="ecd-items__td ecd-items__td--distributed"
              data-testid="ecd-item-distributed"
            >
              {formatQuantity(item.distributed_quantity)}
            </td>
            <td className="ecd-items__td ecd-items__td--center">
              {/* POZ 100: tamamı dağıtılmışsa yeşil "✓ 0", değilse kalan miktar. */}
              <span
                className={cx(
                  "ecd-items__remaining",
                  isSettled ? "ecd-items__remaining--zero" : "ecd-items__remaining--open",
                )}
                data-testid="ecd-item-remaining"
                // `✓` artık inline SVG (F-SEM) ⇒ metinden ayırt edilemez;
                // kapanmış rozet YAPISAL olarak da damgalanır.
                data-settled={isSettled ? "true" : "false"}
              >
                {isSettled ? (
                  <>
                    <CheckIcon {...inlineSymbolProps} /> 0
                  </>
                ) : (
                  formatQuantity(item.remaining_quantity)
                )}
              </span>
            </td>
          </tr>
        );
      })}
      {isAdding ? (
        <tr className="ecd-items__new-row" data-testid="ecd-new-row">
          <td className="ecd-items__td ecd-items__td--input">
            <Input
              size="row"
              maxLength={MAX_LENGTH.code}
              className="ecd-items__cell-input"
              aria-label="Yeni poz no"
              placeholder={EMPLOYER_ITEM_TEXT.codePlaceholder}
              disabled={isBusy}
              value={newRow.code}
              onChange={(event) => onChangeNewRow({ code: event.target.value })}
            />
          </td>
          <td className="ecd-items__td ecd-items__td--input">
            <Input
              size="row"
              maxLength={MAX_LENGTH.description}
              className="ecd-items__cell-input"
              aria-label="Yeni poz adı"
              disabled={isBusy}
              value={newRow.description}
              onChange={(event) => onChangeNewRow({ description: event.target.value })}
            />
          </td>
          <td className="ecd-items__td ecd-items__td--input">
            <Select
              size="row"
              className="ecd-items__cell-input"
              aria-label="Yeni poz birimi"
              disabled={isBusy}
              value={newRow.unit}
              onChange={(event) => onChangeNewRow({ unit: event.target.value })}
            >
              <option value="">{UNIT_PLACEHOLDER_OPTION}</option>
              {UNIT_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </td>
          <td className="ecd-items__td ecd-items__td--input">
            <Input
              size="row"
              inputMode="decimal"
              numeric
              min={0}
              className="ecd-items__cell-input"
              aria-label="Yeni poz birim fiyatı"
              placeholder={EMPLOYER_ITEM_TEXT.unitPricePlaceholder}
              disabled={isBusy}
              value={newRow.unitPrice}
              onChange={(event) => onChangeNewRow({ unitPrice: event.target.value })}
            />
          </td>
          <td className="ecd-items__td ecd-items__td--input">
            <Input
              size="row"
              inputMode="decimal"
              numeric
              min={0}
              className="ecd-items__cell-input"
              aria-label="Yeni poz miktarı"
              placeholder={EMPLOYER_ITEM_TEXT.quantityPlaceholder}
              disabled={isBusy}
              value={newRow.quantity}
              onChange={(event) => onChangeNewRow({ quantity: event.target.value })}
            />
          </td>
          <td className="ecd-items__td ecd-items__td--actions" colSpan={2}>
            <Button
              variant="primary"
              className="ecd-items__row-submit"
              disabled={isBusy}
              onClick={onSubmitNewRow}
              data-testid="ecd-new-row-submit"
            >
              {INLINE_ADD_SUBMIT_LABEL}
            </Button>
            <Button
              variant="ghost"
              className="ecd-items__row-cancel"
              disabled={isBusy}
              onClick={onCancelAddRow}
              data-testid="ecd-new-row-cancel"
            >
              {INLINE_ADD_CANCEL_LABEL}
            </Button>
          </td>
        </tr>
      ) : (
        <tr className="ecd-items__add-row">
          <td colSpan={COLUMN_COUNT}>
            {/* Satır-içi ekleme GRUBUN İÇİNDE açılır: `group_id` zorunludur ve
                bu düğme onu SEÇİMDEN DEĞİL KONUMDAN türetir (alan gerekmez). */}
            <Button
              variant="ghost"
              className="ecd-items__add-row-btn"
              disabled={isBusy}
              onClick={onOpenAddRow}
              data-testid={`ecd-add-row-${group.id}`}
            >
              {INLINE_ADD_ROW_LABEL}
            </Button>
          </td>
        </tr>
      )}
    </>
  );
}
