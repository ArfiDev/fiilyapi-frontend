"use client";

import { useMemo, useState } from "react";

import { nextSortOrder } from "@/components/contract-item-form/build-body";
import { NEW_GROUP_OPTION } from "@/components/contract-item-form/constants";
import { confirmDiscardIfDirty, Modal } from "@/components/settings/Modal";
import { ListIcon } from "@/components/ui/icons";
import { useCatalogDisciplines, useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import { isForbidden } from "@/lib/api/unwrap";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { EMPTY_CELL } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { formatPrice, sortByPozNo } from "@/components/work-item-catalog/work-item-model";

import {
  buildPickerRows,
  defaultGroupId,
  filterRows,
  groupByDiscipline,
  isPickerInputsDirty,
  MAX_BULK_ITEMS,
  resolveSelection,
  resolveTargetGroup,
  setQuantity,
  setUnitPrice,
  toggleRow,
  toggleRows,
  totalAmount,
  unpricedCount,
  type PickerGroup,
  type PickerInputs,
  type PickerRow,
  type ResolvedEntry,
} from "./picker-model";
import type { PickerTarget } from "./picker-target";
import { WorkItemPickerFooter } from "./WorkItemPickerFooter";
import { WorkItemPickerTable, type PickerEmptyReason } from "./WorkItemPickerTable";
import { WorkItemPickerToolbar } from "./WorkItemPickerToolbar";
import "./work-item-picker.css";

const GROUP_NAME_MESSAGE = "Yeni grup için ad girin";
const NO_FILTER = "";

/**
 * F2.4'ün işleyeceği gönderim: yeni grup gerekiyorsa önce `newGroup` açılır, sonra
 * `buildBody(grupId)` ile TEK toplu istek gider (hep-ya-hiç). Mevcut grupta `body` hazırdır.
 */
export interface PickerSubmission<TBody> {
  /** Eklenecek poz sayısı. */
  count: number;
  /** Mevcut grup seçiliyse hazır gövde; yeni grupta null. */
  body: TBody | null;
  /** Yeni grup seçiliyse açılacak grup (`sortOrder` = mevcut en büyük + 1). */
  newGroup: { name: string; sortOrder: number } | null;
  buildBody: (groupId: string) => TBody;
}

export interface CatalogPickerModalProps<TBody> {
  /** Hedef adaptörü: metinler, fiyat kuralı, seçilemezlik gerekçesi, gövde kurucusu (`picker-target.ts`). */
  target: PickerTarget<TBody>;
  /** Alt metinde başa eklenir (ÜS-F2-2): sözleşmede proje adı, teklifte "TKL-… Rev.n". */
  projectName?: string;
  /** Hedefin grupları + kalemleri: hedef grup seçeneği ve "hedefte var" tespiti (yapısal tip). */
  groups: readonly PickerGroup[];
  onSubmit: (submission: PickerSubmission<TBody>) => void;
  onClose: () => void;
  isSubmitting: boolean;
  /** Sunucu hatası metni (bantta AYNEN basılır; seçim korunur). */
  submitError: string | null;
  /** Yeni grup açıldı ama toplu istek düştü: o grup seçili kalır, ikinci grup açılmaz (§2.5). */
  createdGroup?: { id: string; name: string } | null;
  /** Verilirse altbilgide "Katalogda yok mu? Elle poz ekle" (ÜS-F2-1). */
  onManualAdd?: () => void;
}

function emptyReasonOf(args: {
  isLoading: boolean;
  error: Error | null;
  rowCount: number;
  visibleCount: number;
  isRestricted: boolean;
}): PickerEmptyReason {
  if (args.isLoading) return "loading";
  if (args.error !== null) return isForbidden(args.error) ? "forbidden" : "error";
  if (args.rowCount === 0) return args.isRestricted ? "restricted-empty" : "catalog-empty";
  return args.visibleCount === 0 ? "no-match" : null;
}

/**
 * Katalogdan çoklu kalem seçici (PS `Form - Poz Secici` türetmesi, TKL-F2-PLAN §1). HEDEF-BAĞIMSIZ:
 * sözleşme ve teklif aynı gövdeyi `target` adaptörüyle kullanır (TKL-F3.6). Miktar ve fiyat SEÇİCİDE
 * girilir; gövde `target.buildBody`den çıkar. Bu bileşen yalnız `onSubmit(submission)` verir.
 */
export function CatalogPickerModal<TBody>({
  target,
  projectName,
  groups,
  onSubmit,
  onClose,
  isSubmitting,
  submitError,
  createdGroup = null,
  onManualAdd,
}: CatalogPickerModalProps<TBody>) {
  const itemsQuery = useCatalogItems();
  const disciplinesQuery = useCatalogDisciplines();
  const scope = useDisciplineScope();

  const [query, setQuery] = useState("");
  const [disciplineId, setDisciplineId] = useState(NO_FILTER);
  const [hideInContract, setHideInContract] = useState(true);
  const [inputs, setInputs] = useState<PickerInputs>(() => new Map());
  const [groupChoice, setGroupChoice] = useState(() => defaultGroupId(groups));
  const [newGroupName, setNewGroupName] = useState("");

  const disciplines = useMemo(() => disciplinesQuery.data ?? [], [disciplinesQuery.data]);
  const rows = useMemo(
    () => buildPickerRows(sortByPozNo(itemsQuery.data ?? []), groups, target),
    [itemsQuery.data, groups, target],
  );
  const visible = useMemo(
    () => filterRows(rows, { query, disciplineId: disciplineId === NO_FILTER ? null : disciplineId, hideInContract }),
    [rows, query, disciplineId, hideInContract],
  );
  const sections = useMemo(() => groupByDiscipline(visible, disciplines), [visible, disciplines]);
  const resolution = useMemo(() => resolveSelection(rows, inputs, target), [rows, inputs, target]);

  // Hedef grup TÜRETİLMİŞ (ORTA-2): seçili grup `groups`tan düşmüşse varsayılana döner; gösterim ve gövde aynı değer.
  // Açılmış grup varken "+ Yeni Grup" o gruba çözülür (ikinci grup açılmaz).
  const targetGroup = resolveTargetGroup(groupChoice, groups, createdGroup);
  const isNewGroup = targetGroup === NEW_GROUP_OPTION;
  const groupOptions = [
    ...[...groups].sort((a, b) => a.sort_order - b.sort_order).map((group) => ({ id: group.id, name: group.name })),
    ...(createdGroup !== null && !groups.some((group) => group.id === createdGroup.id)
      ? [{ id: createdGroup.id, name: createdGroup.name }]
      : []),
  ];

  const selectableVisible = visible.filter((row) => row.block === null);
  const selectedVisibleCount = selectableVisible.filter((row) => inputs.get(row.item.id)?.selected === true).length;
  const isAllChecked = selectableVisible.length > 0 && selectedVisibleCount === selectableVisible.length;

  const isDirty = newGroupName.trim() !== "" || isPickerInputsDirty(rows, inputs);
  useUnsavedChanges(isDirty, target.unsavedLabel);

  const { entries, problems, selectedCount } = resolution;
  const isGroupNameMissing = isNewGroup && newGroupName.trim() === "";
  const bandLines = [
    ...(submitError === null ? [] : [submitError]),
    ...(selectedCount > MAX_BULK_ITEMS ? [`Tek seferde en fazla ${MAX_BULK_ITEMS} ${target.words.noun} eklenebilir`] : []),
    ...(problems[0] === undefined
      ? []
      : [
          `${problems.length} ${target.words.locative} eksik ya da hatalı değer var`,
          `${problems[0].row.item.poz_no} ${problems[0].row.item.name} — ${problems[0].message}`,
        ]),
    ...(isGroupNameMissing && selectedCount > 0 ? [GROUP_NAME_MESSAGE] : []),
  ];
  const canSubmit =
    !isSubmitting &&
    itemsQuery.isSuccess &&
    selectedCount > 0 &&
    selectedCount <= MAX_BULK_ITEMS &&
    problems.length === 0 &&
    !isGroupNameMissing;

  function updateInputs(change: (current: PickerInputs) => PickerInputs) {
    setInputs((current) => change(current));
  }

  // Sözleşmede "Elle poz ekle" seçiciyi KAPATIR → kirli seçim Modal'ın arka plan onayıyla AYNI soruyla korunur.
  // Teklifte bağlantı katalogu YENİ sekmede açar, seçici açık kalır → onay gerekmez.
  function handleManualAdd() {
    if (onManualAdd === undefined) return;
    if (!target.manualAddClosesPicker || confirmDiscardIfDirty(isDirty)) onManualAdd();
  }

  function handleToggleAll() {
    updateInputs((current) => toggleRows(current, selectableVisible, !isAllChecked));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const baseSortOrder = nextSortOrder(
      (groups.find((group) => group.id === targetGroup)?.items ?? []).map((item) => item.sort_order),
    );
    const buildBody = (groupId: string): TBody => target.buildBody(entries, groupId, isNewGroup ? 0 : baseSortOrder);
    onSubmit({
      count: entries.length,
      body: isNewGroup ? null : buildBody(targetGroup),
      newGroup: isNewGroup
        ? { name: newGroupName.trim(), sortOrder: nextSortOrder(groups.map((group) => group.sort_order)) }
        : null,
      buildBody,
    });
  }

  const subtitle = projectName === undefined ? target.subtitle : `${projectName} · ${target.subtitle}`;
  const totalText = totalTextOf(entries);

  return (
    <Modal
      title={target.title}
      subtitle={subtitle}
      leading={
        <span className="wip-lead" aria-hidden="true">
          <ListIcon width={18} height={18} />
        </span>
      }
      className="wip-modal"
      // Gönderilirken kapatılamaz (F1 deseni); kirliyken arka plan tıklaması onay sorar.
      onClose={isSubmitting ? noop : onClose}
      isDirty={isDirty}
      footer={
        <WorkItemPickerFooter
          bandLines={bandLines}
          selectedCount={selectedCount}
          totalText={totalText}
          totalLabel={target.totalLabel}
          words={target.words}
          manualAddLabel={target.manualAddLabel}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          onCancel={onClose}
          onManualAdd={onManualAdd === undefined ? undefined : handleManualAdd}
        />
      }
    >
      <WorkItemPickerToolbar
        query={query}
        onQuery={setQuery}
        disciplines={disciplines}
        disciplineId={disciplineId}
        onDiscipline={setDisciplineId}
        hideInContract={hideInContract}
        hideLabel={target.hideLabel}
        onHideInContract={setHideInContract}
        groupOptions={groupOptions}
        groupValue={targetGroup}
        canCreateGroup={createdGroup === null}
        onGroup={setGroupChoice}
        newGroupName={newGroupName}
        onNewGroupName={setNewGroupName}
        selectedCount={selectedCount}
        visibleCount={visible.length}
        words={target.words}
        isDisabled={isSubmitting}
      />
      <p className="wip-note">
        <strong>{target.noteLead}</strong>
        {target.noteRest}
      </p>
      <WorkItemPickerTable
        sections={sections}
        inputs={inputs}
        entries={entries}
        target={target}
        emptyReason={emptyReasonOf({
          isLoading: itemsQuery.isLoading,
          error: itemsQuery.error,
          rowCount: rows.length,
          visibleCount: visible.length,
          isRestricted: scope.isRestricted,
        })}
        restrictedNames={scope.names}
        isDisabled={isSubmitting}
        header={{
          isChecked: isAllChecked,
          isIndeterminate: selectedVisibleCount > 0 && !isAllChecked,
          isDisabled: selectableVisible.length === 0,
        }}
        onToggleAll={handleToggleAll}
        onToggle={(row: PickerRow, selected: boolean) => updateInputs((current) => toggleRow(current, row, selected))}
        onQuantity={(row: PickerRow, text: string) => updateInputs((current) => setQuantity(current, row, text))}
        onUnitPrice={(row: PickerRow, text: string) => updateInputs((current) => setUnitPrice(current, row, text))}
      />
    </Modal>
  );
}

const UNPRICED_SUFFIX = "fiyatsız";

/** "₺1.234,56" ya da "—"; fiyatsız satır varsa "· N fiyatsız" eklenir (teklif: fiyatsız kalem, T31). */
function totalTextOf(entries: readonly ResolvedEntry[]): string {
  const unpriced = unpricedCount(entries);
  const base = entries.length - unpriced > 0 ? `₺${formatPrice(totalAmount(entries))}` : EMPTY_CELL;
  return unpriced > 0 ? `${base} · ${unpriced} ${UNPRICED_SUFFIX}` : base;
}

function noop(): void {
  // Gönderim sürerken Modal kapatma istekleri (Esc, ×, arka plan) yok sayılır.
}
