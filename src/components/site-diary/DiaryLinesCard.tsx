"use client";

import { useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { formatCurrencyPrecise } from "@/lib/format";
import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";

import type { DiaryPreviewStatus } from "./useDiaryPreview";
import type { DiaryItemMeta, DiaryLineColumns, DiaryLineRef } from "./diary-extension";
import type { DiaryItemGroup, DiaryLeafRow, DiaryTreeSection } from "./diary-lines-tree";
import { DiaryItemHeaderRow, DiaryLeafRowView } from "./DiaryLineRows";
import { DiaryLineRemoveModal } from "./DiaryLineRemoveModal";
import { DiarySectionPicker } from "./DiarySectionPicker";
import type { DiaryAddedLine, DiaryFormState } from "./form-state";
import "./site-diary-progress.css";

export interface DiaryLinesCardProps {
  /** Kayıt henüz açılmadıysa `undefined` — ağaç önizleme iskeletinden gelir (GKS-F1.3). */
  entry: SiteDiaryEntryDetail | undefined;
  /** Tfoot "Bugünkü Hakediş Katkısı": kayıtta `entry.lines_total`, önizlemede `skeleton.lines_total`. */
  linesTotal?: string;
  /** Önizleme sorgusunun durumu (kayıt yokken); verilmezse hazır sayılır. */
  previewStatus?: DiaryPreviewStatus;
  onRetryPreview?: () => void;
  /** Kayıtsız günde bölüm seçili (Ü1: o bölüme tahsisli kalem yoksa tahsis yönlendirmesi). */
  hasSection?: boolean;
  /** Kalem ağacı (`buildDiaryLineTree`). */
  groups: readonly DiaryItemGroup[];
  sections: readonly DiaryTreeSection[];
  form: DiaryFormState;
  onQuantityChange: (key: string, value: string) => void;
  onOverrunReasonChange: (key: string, value: string) => void;
  onAddLines: (lines: DiaryAddedLine[]) => void;
  onRemoveLine: (key: string) => void;
  /** Salt-okunur (izin yok / gönderilmiş / kilitli). */
  disabled: boolean;
  /** Kilitli gün — Bugün düz metin, "+ Bölüm" ve × gizli (Ek Formlar hâl d). */
  isLocked: boolean;
  /** Satır ekle/kaldır yüzeyi (G10: `site_diary` yazma; gönderim/kilit yok). */
  canEditRows: boolean;
  /** BOQ okuması başarısız — satırı olmayan kalemler gösterilemiyor. */
  isBoqUnavailable: boolean;
  /** Kaydedilmemiş değişiklik var mı — türev sütunları için görünür uyarı. */
  isDirty: boolean;
  /** İ:259 "Hakediş Durumu →". */
  paymentsHref: string;
  /** Şantiyenin İş Kalemleri sayfası (seçicideki tahsis bağlantısı); yoksa `null`. */
  boqHref: string | null;
  /** Uzantının ek kolonları (planlama: "Bugün kaz. a-s" · "PF"). */
  lineColumns?: DiaryLineColumns | null;
  /** Uzantıya verilen satır referansları — `renderCells` girdisi. */
  lineRefs: ReadonlyMap<string, DiaryLineRef>;
  /** Kalem düzeyi planlama bilgisi (G9 dolaylı kalem · İ:225 etiket). */
  itemMeta?: DiaryItemMeta | null;
}

/** Çekirdek kolonlar: Kalem · Birim · Bugün · Kümülatif · Planlı · Kalan · Hakediş ₺ · (×). */
const CORE_COLUMN_COUNT = 8;

function isAddExhausted(group: DiaryItemGroup, sections: readonly DiaryTreeSection[]): boolean {
  const present = new Set(group.leaves.map((leaf) => leaf.sectionId));
  return group.hasUnsectioned && sections.every((section) => present.has(section.id));
}

/**
 * İ:209-261 + Ek Formlar M1–M4 · "📋 Yapılan Miktarlar" kartı (PLN-F2.2).
 *
 * G1 ağaç: kalem başlık satırı (G2 toplamları) → Bölümsüz (önce) ve bölüm
 * satırları. "+ Bölüm" seçicisi (M1), satır kaldırma (M2 · G3 · G6), aşım alt
 * satırı + gerekçe (M4). 🔴 K16: "Hakediş ₺" kolonu ve "Bugünkü Hakediş
 * Katkısı" tfoot'u KALIR — tutarlar YANITTAN okunur, istemci hesaplamaz.
 * Kümülatif/Kalan G8 önizlemesidir; kayıttan sonra backend esastır.
 */
export function DiaryLinesCard({
  entry,
  linesTotal,
  previewStatus = "ready",
  onRetryPreview,
  hasSection = false,
  groups,
  sections,
  form,
  onQuantityChange,
  onOverrunReasonChange,
  onAddLines,
  onRemoveLine,
  disabled,
  isLocked,
  canEditRows,
  isBoqUnavailable,
  isDirty,
  paymentsHref,
  boqHref,
  lineColumns,
  lineRefs,
  itemMeta,
}: DiaryLinesCardProps) {
  const isIndirect = (itemId: string | null) => itemId !== null && (itemMeta?.indirectItemIds?.has(itemId) ?? false);
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{ group: DiaryItemGroup; leaf: DiaryLeafRow } | null>(null);
  const extraHeaders = lineColumns?.headers ?? [];
  const columnCount = CORE_COLUMN_COUNT + extraHeaders.length;
  const hasRows = groups.length > 0;
  const isPreview = entry === undefined;
  const isPreviewPending = isPreview && previewStatus !== "ready";
  const hasLeaves = groups.some((group) => group.leaves.length > 0);
  const isSectionEmpty = isPreview && hasSection && !hasLeaves && !isPreviewPending;
  const scope = useDisciplineScope();
  const canMutateRows = canEditRows && !disabled && !isLocked;

  function handleRemove(group: DiaryItemGroup, leaf: DiaryLeafRow) {
    // M2(a): miktarı boş satır onaysız kalkar; miktar girilmişse onay modalı.
    const hasQuantity = leaf.todayValue !== null && Number(leaf.todayValue) > 0;
    if (hasQuantity && !leaf.isAdded) {
      setPendingRemoval({ group, leaf });
      return;
    }
    onRemoveLine(leaf.key);
  }

  const showTable = !isPreviewPending && hasRows;
  const emptyState = isPreviewPending ? (
    // Ü11 · önizleme gelmeden satır uydurulmaz.
    previewStatus === "error" ? (
      <div className="diary__error">
        <div className="diary__error-reasons">
          <span>İş kalemleri yüklenemedi</span>
        </div>
        <Button variant="ghost" size="sm" className="diary__error-action" onClick={onRetryPreview}>
          Tekrar dene
        </Button>
      </div>
    ) : (
      <p className="diary-lines__empty">İş kalemleri yükleniyor…</p>
    )
  ) : !hasRows && scope.isRestricted ? (
    // Disiplini atanmış kullanıcıda backend süzmesi kalemleri boşaltabilir
    // (DSC-F1.3); kayıt ya da önizleme tamamen boşsa ortak kısıtlı bildirim.
    <RestrictedEmptyNotice names={scope.names} />
  ) : isSectionEmpty ? (
    // Ü1 · seçili bölüme tahsisli kalem yok. BOQ başlıkları (varsa) aşağıda
    // kalır: "+ Bölüm" yolunun tek girişi (Ü2).
    <>
      <p className="diary-lines__empty">Bu bölüme tahsis edilmiş iş kalemi yok.</p>
      {boqHref !== null && (
        <Link href={boqHref} className="diary-picker__allocate">
          İş Kalemleri&apos;nde tahsis et →
        </Link>
      )}
    </>
  ) : !hasRows ? (
    // Dürüst boş durum: sahte satır uydurulmaz.
    <p className="diary-lines__empty">
      Bu şantiyede sözleşme BOQ pozu tanımlı değil — iş kalemi satırı üretilemedi.
    </p>
  ) : null;

  return (
    <section className="diary-card" aria-labelledby="diary-lines-title">
      <div className="diary-card__head">
        <div>
          <h2 className="diary-card__title" id="diary-lines-title">
            📋 Yapılan Miktarlar
          </h2>
          {/* Uzantı `caption` (İ:213) alt başlığın TAMAMIdır — verilirse çekirdek
              metni basılmaz (PLN-F2.5e · karar 3). */}
          <p className="diary-card__subtitle">
            {lineColumns?.caption ?? "Kalem × bölüm · girişler otomatik olarak aylık hakedişe işlenir"}
          </p>
        </div>
        <Badge variant="primary" className="diary-lines__badge">
          Sözleşme BOQ&apos;a bağlı
        </Badge>
      </div>

      {emptyState}

      {showTable && (
        <div className="diary-lines__scroll">
          <table className="diary-lines diary-lines--tree">
            <thead>
              <tr>
                <th scope="col" className="diary-lines__col-item">
                  Kalem / Bölüm
                </th>
                <th scope="col" className="diary-lines__col-unit">
                  Birim
                </th>
                <th scope="col" className="diary-lines__col-today">
                  Bugün
                </th>
                <th scope="col" className="diary-lines__col-cumulative">
                  Kümülatif
                </th>
                <th scope="col" className="diary-lines__col-num">
                  Planlı
                </th>
                <th scope="col" className="diary-lines__col-num">
                  Kalan
                </th>
                {extraHeaders.map((header) => (
                  <th
                    key={header.key}
                    scope="col"
                    className={header.align === "left" ? "diary-lines__col-ext" : "diary-lines__col-ext diary-lines__col-num"}
                  >
                    {header.label}
                  </th>
                ))}
                <th scope="col" className="diary-lines__col-amount">
                  Hakediş ₺
                </th>
                <th scope="col" className="diary-lines__col-remove">
                  <span className="diary-lines__sr">Satır işlemleri</span>
                </th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key} className="diary-lines__group">
                {!group.isOrphan && (
                  <DiaryItemHeaderRow
                    group={group}
                    // G9: dolaylı ("Tüm şantiye") kalemde "+ Bölüm" YOK.
                    canAddSection={canMutateRows && !isIndirect(group.boqItemId)}
                    isAddExhausted={isAddExhausted(group, sections)}
                    onOpenPicker={() => setPickerItemId(group.key)}
                    extraColumnCount={extraHeaders.length}
                    extraCells={
                      lineColumns?.renderItemCells && group.boqItemId !== null
                        ? lineColumns.renderItemCells(group.boqItemId)
                        : null
                    }
                    itemTag={
                      itemMeta?.renderItemTag && group.boqItemId !== null
                        ? itemMeta.renderItemTag(group.boqItemId)
                        : undefined
                    }
                    picker={
                      pickerItemId === group.key ? (
                        <DiarySectionPicker
                          group={group}
                          sections={sections}
                          boqHref={boqHref}
                          onClose={() => setPickerItemId(null)}
                          onConfirm={(lines) => {
                            onAddLines(lines);
                            setPickerItemId(null);
                          }}
                        />
                      ) : null
                    }
                  />
                )}
                {!group.isOrphan && group.leaves.length === 0 && (
                  <tr className="diary-lines__hint-row">
                    <td colSpan={columnCount}>
                      {group.unallocatedQuantity !== null && Number(group.unallocatedQuantity) === 0
                        ? "tamamen tahsisli · iskelet yok"
                        : "bu kayıtta satırı yok"}
                    </td>
                  </tr>
                )}
                {group.leaves.map((leaf) => {
                  const ref = lineRefs.get(leaf.key);
                  return (
                    <DiaryLeafRowView
                      key={leaf.key}
                      group={group}
                      leaf={leaf}
                      disabled={disabled}
                      isLocked={isLocked}
                      canRemove={canMutateRows}
                      onQuantityChange={onQuantityChange}
                      onOverrunReasonChange={onOverrunReasonChange}
                      onRemove={(row) => handleRemove(group, row)}
                      overrunReason={form.overrunReasons[leaf.key] ?? ""}
                      extraCells={
                        lineColumns && ref ? lineColumns.renderCells(ref) : extraHeaders.map(() => null)
                      }
                      columnCount={columnCount}
                      isIndirect={isIndirect(group.boqItemId)}
                      isPreview={isPreview}
                      subRow={lineColumns?.renderSubRow && ref ? lineColumns.renderSubRow(ref) : null}
                    />
                  );
                })}
              </tbody>
            ))}
            <tfoot>
              {lineColumns?.footer && (
                <tr className="diary-lines__ext-footer">
                  <td colSpan={columnCount}>{lineColumns.footer}</td>
                </tr>
              )}
              {/* K16 · GK255-258 — Hakediş katkısı KALIR. */}
              <tr className="diary-lines__total-row">
                <td colSpan={columnCount - 2}>Bugünkü Hakediş Katkısı</td>
                <td className="diary-lines__total-amount">{formatCurrencyPrecise(linesTotal ?? entry?.lines_total ?? "0")}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {isBoqUnavailable && hasRows && (
        <p className="diary__notice">
          Sözleşme BOQ&apos;u okunamadı — satırı olmayan kalemler ve kalem sırası gösterilemiyor; kayıttaki
          satırlar basılıyor.
        </p>
      )}

      {isDirty && hasRows && (
        <p className="diary__notice">
          Kaydedilmemiş değişiklik var. “Kümülatif” ve “Kalan” yazdıkça önizlenir; “Hakediş ₺” ve günlük
          toplam sunucudan gelen türevlerdir, kayıttan sonra güncellenir.
        </p>
      )}

      {(entry?.dropped_orphan_count ?? 0) > 0 && (
        <p className="diary__notice">
          Sözleşme BOQ&apos;undan kaldırılan {entry?.dropped_orphan_count} poz bu kayıttan düşürüldü.
        </p>
      )}

      {/* İ:256-260 — bilgi kutusu + "Hakediş Durumu →" */}
      <div className="diary-lines__info">
        <span className="diary-lines__info-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        {/* İ:258'deki "İşveren Hakedişi #5" SABİT bir numaradır; hangi hakedişe
            işleneceğini veren bir uç yok — numara UYDURULMAZ (zarif düşüş). */}
        <span className="diary-lines__info-text">
          Bu miktarlar ay sonunda <strong>işveren hakedişine</strong> ve ilgili{" "}
          <strong>taşeron hakedişlerine</strong> de işlenir.
        </span>
        <Link href={paymentsHref} className="diary-lines__info-link">
          Hakediş Durumu →
        </Link>
      </div>

      {pendingRemoval && (
        <DiaryLineRemoveModal
          group={pendingRemoval.group}
          leaf={pendingRemoval.leaf}
          entryDate={form.entryDate}
          onClose={() => setPendingRemoval(null)}
          onConfirm={() => {
            onRemoveLine(pendingRemoval.leaf.key);
            setPendingRemoval(null);
          }}
        />
      )}
    </section>
  );
}
