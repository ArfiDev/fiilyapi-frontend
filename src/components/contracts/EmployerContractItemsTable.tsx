"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import { Button, Input, Select } from "@/components/ui";
import { dedupeUnits, selectedUnit } from "@/components/catalog-shared/catalog-units";
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
  trPriceInputValue,
  trQuantityInputValue,
  type EmployerItemUpdateBody,
  type InlineCellField,
  type InlineRowDraft,
} from "./employer-item-inline";
import { employerContractDistributionHref } from "./employer-contract-tabs";
import { isRemainingSettled } from "./distribution-derive";
import "./employer-contract-detail.css";
import { SourceCodeSub } from "@/components/catalog-shared/SourceCodeSub";
import { sourceCodeLabel } from "@/components/catalog-shared/source-code";

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
 * gösterim (K7: Türkçe biçim, `trQuantityInputValue`/`trPriceInputValue`) hücre yardımcısından gelir. Yüzey o emsalden TÜRETİLDİ; yeni bir
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
  /**
   * Hücre kaydetme — kısmi `PATCH` gövdesi zaten elenmiş/doğrulanmış gelir.
   * Dönen söz istek BİTİNCE (ASLA reddetmez) çözülür: `null` = başarı,
   * metin = sunucu hata mesajı (tablo onu HÜCRE hatası olarak tutar/basar): tablo uçuştaki HÜCREYİ (kalem+alan) o ana kadar
   * kilitler — aynı alana iki PATCH'in sunucuya ters sırada ulaşması önlenir.
   */
  onCommitItem: (itemId: string, body: EmployerItemUpdateBody) => Promise<string | null>;
  /** Satır-içi ekleme; `true` dönerse taslak satır kapanır. */
  onCreateItem: (body: EmployerItemCreateBody) => Promise<boolean>;
  /**
   * YENİ SATIR oluşturma uçuşta — yalnız yeni-satır kontrolleri ve ekleme
   * düğmeleri kilitlenir. Var olan satır hücreleri update PATCH'i uçarken
   * KİLİTLENMEZ (Tab ile komşu hücreye geçişte odak korunur).
   */
  isCreating: boolean;
  /** Sunucu hatası (`backendErrorMessage`); istemci hatasıyla aynı yerde basılır. */
  saveError: string | null;
  /** TKL-F2.4 · toplu ekleme başarı bildirimi ("N poz eklendi"); başlıkta `role="status"`. */
  addedNotice?: string | null;
}

const COLUMN_COUNT = 7;

/** Hücre kaydetmenin okuduğu kalem alanları. */
interface CellItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  quantity: string | null;
  unit_price: string | null;
}

const SERVER_FIELD: Record<InlineCellField, keyof Omit<CellItem, "id">> = {
  code: "code",
  description: "description",
  unit: "unit",
  quantity: "quantity",
  unitPrice: "unit_price",
};

/** Bandın hücre satırı: etiket "poz kodu · alan adı". */
interface CellError {
  label: string;
  message: string;
}

// Alan adları doğrulama mesajlarındaki başlıklarla (`validate.ts`) aynıdır.
const FIELD_LABEL: Record<InlineCellField, string> = {
  code: "Poz No",
  description: "Poz Adı",
  unit: "Birim",
  quantity: "Miktar",
  unitPrice: "Birim Fiyat",
};

function cellLabel(code: string, field: InlineCellField): string {
  return `${code} · ${FIELD_LABEL[field]}`;
}

function cellKey(itemId: string, field: InlineCellField): string {
  return `${itemId}:${field}`;
}

function serverValueOf(item: CellItem, field: InlineCellField): string | null {
  return item[SERVER_FIELD[field]];
}

/**
 * Birim seçicisinin seçenekleri. Kalemin MEVCUT birimi `UNIT_OPTIONS`ta yoksa
 * (eski/serbest metin) ayrı bir seçenek olarak eklenir — yoksa seçici değeri
 * sessizce kaybeder ve blur'da yanlış birim yazılırdı.
 */
function unitChoices(currentUnit: string): readonly string[] {
  return dedupeUnits([...UNIT_OPTIONS, currentUnit]);
}

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
  isCreating,
  saveError,
  addedNotice = null,
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
  // Uçuştaki PATCH'lerin hücre anahtarları (`kalemId:alan`). Yalnız O hücre
  // kilitlenir; komşu hücreler açık kalır (Tab akışı + farklı alana paralel PATCH).
  const [pendingCells, setPendingCells] = useState<ReadonlySet<string>>(new Set());
  // Koruma bayrağı yeniden-girişte (kuyruktaki seçim) bayat kapanıştan değil
  // buradan okunur; `pendingCells` yalnız GÖRÜNÜM içindir.
  const pendingRef = useRef(new Set<string>());
  // Uçuşta seçilen birim ("son seçim kazanır"): hücre anahtarı → değer.
  const queuedRef = useRef(new Map<string, string>());
  // Uçuş bitince TAZE kalemi okumak için (kapanıştaki `item` bayattır).
  const latestItemsRef = useRef<CellItem[]>([]);
  latestItemsRef.current = (groups ?? []).flatMap((group) => group.items);
  // Hücre hataları: anahtar `kalemId:alan`. Başka hücrenin kaydı/hatası bir
  // hücrenin hatasını SİLMEZ; yalnız o hücrenin kendi başarısı/yeni sonucu siler.
  const [cellErrors, setCellErrors] = useState<Readonly<Record<string, CellError>>>({});

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

  function setCellPending(key: string, isPending: boolean) {
    if (isPending) pendingRef.current.add(key);
    else pendingRef.current.delete(key);
    setPendingCells(new Set(pendingRef.current));
  }

  function setCellError(key: string, error: CellError | null) {
    setCellErrors((prev) => {
      if (error === null) {
        if (!(key in prev)) return prev;
        return Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key));
      }
      return { ...prev, [key]: error };
    });
  }

  /**
   * Hücre kaydetme (odak çıkışı; birim seçicide değişim anı).
   * - `noop`: taslak temizlenir, hücrenin eski hatası silinir (no 52).
   * - `error` (istemci kısıt ihlali): taslak temizlenir, hücre sunucu değerine
   *   döner ve sebep O HÜCRENİN hatası olarak basılır.
   * - `patch`: taslak uçuş boyunca GÖRÜNÜR kalır (sunucu değeri tazelenene dek
   *   eski değere sıçrama olmasın); bitince temizlenir — hatada hücre sunucu
   *   değerine döner ve sunucu mesajı hücre hatası olur, başarıda hata silinir.
   * - Uçuştaki hücrede (yalnız birim seçici ulaşır) seçim "son seçim" olarak
   *   tutulur ve gösterilir; uçuş bitince sunucudan farklıysa TEK ek istek gider.
   */
  async function commitCell(
    // 🔴 KAPSAM MASKESİ (2026-09-19): metraj/fiyat `null` gelebilir; gösterim
    //    `trQuantityInputValue`/`trPriceInputValue` ile "" olur, kaydetme kararı ise `commitInlineCell`
    //    içinde ham metinle verilir.
    item: CellItem,
    field: InlineCellField,
    // Seçici değişiminde yeni değer taslağa YAZILMADAN doğrudan verilir.
    valueOverride?: string,
  ) {
    const key = cellKey(item.id, field);
    if (pendingRef.current.has(key)) {
      if (valueOverride !== undefined) {
        queuedRef.current.set(key, valueOverride);
        setDraft(item.id, { [field]: valueOverride });
      }
      return;
    }
    const draft = valueOverride ?? drafts[item.id]?.[field];
    const result = commitInlineCell(field, draft, serverValueOf(item, field));
    if (result.kind !== "patch") clearDraft(item.id, field);
    if (result.kind === "noop") {
      setCellError(key, null);
      return;
    }
    if (result.kind === "error") {
      setCellError(key, { label: cellLabel(item.code, field), message: result.message });
      return;
    }
    setDraft(item.id, { [field]: draft });
    setCellPending(key, true);
    const failure = await onCommitItem(item.id, result.body);
    setCellError(key, failure === null ? null : { label: cellLabel(item.code, field), message: failure });
    setCellPending(key, false);
    const queued = queuedRef.current.get(key);
    queuedRef.current.delete(key);
    const fresh = latestItemsRef.current.find((candidate) => candidate.id === item.id);
    if (queued !== undefined && fresh) {
      await commitCell(fresh, field, queued);
      return;
    }
    clearDraft(item.id, field);
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
    // 🔴 K1/K7 · miktar ve birim fiyat HAM metinle doğrulanır (T30: "28.500" = 28500, "1,5" = 1,5;
    // belirsiz nokta reddedilir) ve gövdeye `buildEmployerItemBody` içinde okunmuş hâliyle girer.
    const values = {
      ...newRow,
      groupId: group.id,
      groupName: "",
      sortOrder: "",
    };
    const problem = validateEmployerItem(values);
    if (problem) {
      setClientError(problem.message);
      return;
    }
    setClientError(null);
    const body = buildEmployerItemBody(values, nextSortOrder(group.items.map((item) => item.sort_order)));
    if (await onCreateItem(body)) closeAddRow();
  }

  // Bant: hücre hataları (her biri hücre etiketli) + yeni-satır istemci hatası
  // + yeni-satır oluşturma hatası. Hiçbiri ötekini ezmez.
  const errorLines: ReadonlyArray<{ label: string | null; message: string }> = [
    ...Object.values(cellErrors),
    ...(clientError ? [{ label: null, message: clientError }] : []),
    ...(saveError ? [{ label: null, message: saveError }] : []),
  ];

  return (
    <section className="ecd-items" aria-labelledby="ecd-items-title">
      {/* POZ 70-72 başlık şeridi + POZ ekranına GÖRÜNÜR giriş (E14'te karşılığı
          YOK; her rotanın görünür bir girişi olmalı — rapor edildi). */}
      <div className="ecd-items__head">
        <span className="ecd-items__head-title" id="ecd-items-title">
          Poz Listesi
        </span>
        {addedNotice !== null && (
          <span className="ecd-items__added" role="status" data-testid="ecd-added-notice">
            {addedNotice}
          </span>
        )}
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

      {errorLines.length > 0 && (
        <div className="ecd-items__notice ecd-items__notice--error" data-testid="ecd-items-error">
          {errorLines.map((line) => (
            <span
              className="ecd-items__error-line"
              data-testid="ecd-items-error-line"
              key={`${line.label ?? ""}|${line.message}`}
            >
              {line.label && <strong>{line.label}: </strong>}
              <span data-testid="ecd-items-error-message">{line.message}</span>
            </span>
          ))}
        </div>
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
                  isCreating={isCreating}
                  pendingCells={pendingCells}
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
  isCreating: boolean;
  isAdding: boolean;
  newRow: NewRowValues;
  onDraft: (itemId: string, patch: InlineRowDraft) => void;
  onCommitCell: (
    // 🔴 KAPSAM MASKESİ (2026-09-19): metraj/fiyat `null` gelebilir; gösterim
    //    `trQuantityInputValue`/`trPriceInputValue` ile "" olur, kaydetme kararı ise `commitInlineCell`
    //    içinde ham metinle verilir.
    item: CellItem,
    field: InlineCellField,
    valueOverride?: string,
  ) => Promise<void>;
  pendingCells: ReadonlySet<string>;
  onOpenAddRow: () => void;
  onChangeNewRow: (patch: Partial<NewRowValues>) => void;
  onCancelAddRow: () => void;
  onSubmitNewRow: () => void;
}

function GroupRows({
  group,
  drafts,
  isCreating,
  pendingCells,
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
            <td className="ecd-items__td ecd-items__td--text-input">
              <Input
                size="row"
                maxLength={MAX_LENGTH.code}
                className="ecd-items__cell-input ecd-items__cell-input--code"
                aria-label={`${item.code} poz no`}
                disabled={pendingCells.has(cellKey(item.id, "code"))}
                value={draft.code ?? item.code}
                onChange={(event) => onDraft(item.id, { code: event.target.value })}
                onBlur={() => onCommitCell(item, "code")}
              />
              {/* KAT-F2.3 · T47: Bakanlık poz no'su salt okuma alt satır (anlık görüntü) */}
              <SourceCodeSub
                code={sourceCodeLabel(item)}
                data-testid={`ecd-source-code-${item.id}`}
              />
            </td>
            <td className="ecd-items__td ecd-items__td--text-input">
              <Input
                size="row"
                maxLength={MAX_LENGTH.description}
                className="ecd-items__cell-input ecd-items__cell-input--name"
                title={item.description}
                aria-label={`${item.code} poz adı`}
                disabled={pendingCells.has(cellKey(item.id, "description"))}
                value={draft.description ?? item.description}
                onChange={(event) => onDraft(item.id, { description: event.target.value })}
                onBlur={() => onCommitCell(item, "description")}
              />
            </td>
            <td className="ecd-items__td ecd-items__td--text-input ecd-items__td--text-input-narrow">
              <Select
                size="row"
                className="ecd-items__cell-input ecd-items__cell-input--unit"
                aria-label={`${item.code} birimi`}
                // Odaktaki seçiciyi `disabled` yapmak odağı <body>'ye düşürürdü:
                // uçuşta seçim "son seçim" olarak tutulur ve gösterilir (uçuş
                // bitince tek ek istek); uçuş işareti `aria-busy` (CSS'te soluk).
                aria-busy={pendingCells.has(cellKey(item.id, "unit")) || undefined}
                value={selectedUnit(unitChoices(item.unit), draft.unit ?? item.unit)}
                // Seçici: değişiklik ANINDA kaydolur (taslak + blur beklenmez).
                // Blur'da taslak yoktur → ikinci istek ATILMAZ.
                onChange={(event) => onCommitCell(item, "unit", event.target.value)}
              >
                {unitChoices(item.unit).map((unit) => (
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
                // 🔴 `min` yalnız TARAYICI ipucudur; gerçek korkuluk
                // `commitInlineCell`dedir (yapıştırma/otomatik doldurma bu
                // özniteliği atlar). `type="number"` DEĞİLDİR (no 51): Türkçe
                // klavyenin virgülünü tarayıcı sessizce ""a indirger.
                min={0}
                className="ecd-items__cell-input"
                aria-label={`${item.code} birim fiyatı`}
                disabled={pendingCells.has(cellKey(item.id, "unitPrice"))}
                value={draft.unitPrice ?? trPriceInputValue(item.unit_price)}
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
                disabled={pendingCells.has(cellKey(item.id, "quantity"))}
                value={draft.quantity ?? trQuantityInputValue(item.quantity)}
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
              className="ecd-items__cell-input ecd-items__cell-input--code"
              aria-label="Yeni poz no"
              placeholder={EMPLOYER_ITEM_TEXT.codePlaceholder}
              disabled={isCreating}
              value={newRow.code}
              onChange={(event) => onChangeNewRow({ code: event.target.value })}
            />
          </td>
          <td className="ecd-items__td ecd-items__td--input">
            <Input
              size="row"
              maxLength={MAX_LENGTH.description}
              className="ecd-items__cell-input ecd-items__cell-input--name"
              aria-label="Yeni poz adı"
              disabled={isCreating}
              value={newRow.description}
              onChange={(event) => onChangeNewRow({ description: event.target.value })}
            />
          </td>
          <td className="ecd-items__td ecd-items__td--input">
            <Select
              size="row"
              className="ecd-items__cell-input ecd-items__cell-input--unit"
              aria-label="Yeni poz birimi"
              disabled={isCreating}
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
              disabled={isCreating}
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
              disabled={isCreating}
              value={newRow.quantity}
              onChange={(event) => onChangeNewRow({ quantity: event.target.value })}
            />
          </td>
          <td className="ecd-items__td ecd-items__td--actions" colSpan={2}>
            <Button
              variant="primary"
              className="ecd-items__row-submit"
              disabled={isCreating}
              onClick={onSubmitNewRow}
              data-testid="ecd-new-row-submit"
            >
              {INLINE_ADD_SUBMIT_LABEL}
            </Button>
            <Button
              variant="ghost"
              className="ecd-items__row-cancel"
              disabled={isCreating}
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
              disabled={isCreating}
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
