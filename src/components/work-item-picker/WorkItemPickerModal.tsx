"use client";

import { useMemo, useState } from "react";

import { nextSortOrder } from "@/components/contract-item-form/build-body";
import { NEW_GROUP_OPTION } from "@/components/contract-item-form/constants";
import { Modal } from "@/components/settings/Modal";
import { ListIcon } from "@/components/ui/icons";
import { useCatalogDisciplines, useCatalogItems } from "@/lib/api/hooks/useCatalogItems";
import type { EmployerContractItemsBulkCreateRequest } from "@/lib/api/hooks/useContractMutations";
import type { EmployerContractItemsResponse } from "@/lib/api/hooks/useContract";
import { isForbidden } from "@/lib/api/unwrap";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { EMPTY_CELL } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import { formatPrice, sortByPozNo } from "@/components/work-item-catalog/work-item-model";

import {
  buildBulkBody,
  buildPickerRows,
  filterRows,
  groupByDiscipline,
  MAX_BULK_ITEMS,
  resolveSelection,
  setQuantity,
  setUnitPrice,
  toggleRow,
  toggleRows,
  totalAmount,
  type PickerInputs,
  type PickerRow,
} from "./picker-model";
import { WorkItemPickerFooter } from "./WorkItemPickerFooter";
import { WorkItemPickerTable, type PickerEmptyReason } from "./WorkItemPickerTable";
import { WorkItemPickerToolbar } from "./WorkItemPickerToolbar";
import "./work-item-picker.css";

type ContractGroups = EmployerContractItemsResponse["groups"];
type BulkBody = EmployerContractItemsBulkCreateRequest;

/** ÜS-F2-2 / ÜS-F2-3 (SABAH ONAYI varsayılanları). */
const TITLE = "Katalogdan Poz Ekle";
const SUBTITLE = "İş Kalemi Kataloğu'ndan işveren sözleşmesine poz ekle";
const NOTE_LEAD = "Poz no, tanım ve birim katalogdan kopyalanır.";
const NOTE_REST =
  " Sözleşmede sonradan değiştirilebilir, katalog değişmez — birim fiyat son fiyattan, yoksa referans fiyattan önerilir.";
const UNSAVED_LABEL = "Katalogdan poz seçimi";
const MAX_ITEMS_MESSAGE = `Tek seferde en fazla ${MAX_BULK_ITEMS} poz eklenebilir`;
const GROUP_NAME_MESSAGE = "Yeni grup için ad girin";
const NO_FILTER = "";

/**
 * F2.4'ün işleyeceği gönderim: yeni grup gerekiyorsa önce `newGroup` açılır, sonra
 * `buildBody(grupId)` ile TEK toplu istek gider (hep-ya-hiç). Mevcut grupta `body` hazırdır.
 */
export interface PickerSubmission {
  /** Eklenecek poz sayısı. */
  count: number;
  /** Mevcut grup seçiliyse hazır gövde; yeni grupta null. */
  body: BulkBody | null;
  /** Yeni grup seçiliyse açılacak grup (`sortOrder` = mevcut en büyük + 1). */
  newGroup: { name: string; sortOrder: number } | null;
  buildBody: (groupId: string) => BulkBody;
}

export interface WorkItemPickerModalProps {
  /** Alt metinde başa eklenir (ÜS-F2-2). */
  projectName?: string;
  /** Sözleşmenin grupları + kalemleri: hedef grup seçeneği ve "sözleşmede var" tespiti. */
  groups: ContractGroups;
  onSubmit: (submission: PickerSubmission) => void;
  onClose: () => void;
  isSubmitting: boolean;
  /** Sunucu hatası metni (bantta AYNEN basılır; seçim korunur). */
  submitError: string | null;
  /** Yeni grup açıldı ama toplu istek düştü: o grup seçili kalır, ikinci grup açılmaz (§2.5). */
  createdGroup?: { id: string; name: string } | null;
  /** Verilirse altbilgide "Katalogda yok mu? Elle poz ekle" (ÜS-F2-1). */
  onManualAdd?: () => void;
}

/** ÜS-F2-19: varsayılan hedef = sort_order'ı en büyük grup; grupsuz sözleşmede "+ Yeni Grup". */
function defaultGroupId(groups: ContractGroups): string {
  const last = groups.reduce<ContractGroups[number] | null>(
    (best, group) => (best === null || group.sort_order >= best.sort_order ? group : best),
    null,
  );
  return last === null ? NEW_GROUP_OPTION : last.id;
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
 * "Katalogdan Poz Ekle" çoklu seçici (PS `Form - Poz Secici` türetmesi, TKL-F2-PLAN §1).
 * Miktar ve birim fiyat SEÇİCİDE girilir (backend ikisini zorunlu tutar); gövde `picker-model`
 * saf kurucusundan çıkar. Sözleşme ekranına bağlama F2.4'tedir — bu bileşen yalnız
 * `onSubmit(submission)` verir.
 */
export function WorkItemPickerModal({
  projectName,
  groups,
  onSubmit,
  onClose,
  isSubmitting,
  submitError,
  createdGroup = null,
  onManualAdd,
}: WorkItemPickerModalProps) {
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
    () => buildPickerRows(sortByPozNo(itemsQuery.data ?? []), groups),
    [itemsQuery.data, groups],
  );
  const visible = useMemo(
    () => filterRows(rows, { query, disciplineId: disciplineId === NO_FILTER ? null : disciplineId, hideInContract }),
    [rows, query, disciplineId, hideInContract],
  );
  const sections = useMemo(() => groupByDiscipline(visible, disciplines), [visible, disciplines]);
  const resolution = useMemo(() => resolveSelection(rows, inputs), [rows, inputs]);

  // Açılmış grup varken ve "+ Yeni Grup" seçiliyken hedef o gruptur (ikinci grup açılmaz).
  const targetGroup = createdGroup !== null && groupChoice === NEW_GROUP_OPTION ? createdGroup.id : groupChoice;
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

  const isDirty =
    newGroupName.trim() !== "" || [...inputs.values()].some((input) => input.selected || input.quantity.trim() !== "");
  useUnsavedChanges(isDirty, UNSAVED_LABEL);

  const { entries, problems, selectedCount } = resolution;
  const isGroupNameMissing = isNewGroup && newGroupName.trim() === "";
  const bandLines = [
    ...(submitError === null ? [] : [submitError]),
    ...(selectedCount > MAX_BULK_ITEMS ? [MAX_ITEMS_MESSAGE] : []),
    ...(problems[0] === undefined
      ? []
      : [
          `${problems.length} pozda eksik ya da hatalı değer var`,
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

  function handleToggleAll() {
    updateInputs((current) => toggleRows(current, selectableVisible, !isAllChecked));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const baseSortOrder = nextSortOrder(
      (groups.find((group) => group.id === targetGroup)?.items ?? []).map((item) => item.sort_order),
    );
    const buildBody = (groupId: string): BulkBody => buildBulkBody(entries, groupId, isNewGroup ? 0 : baseSortOrder);
    onSubmit({
      count: entries.length,
      body: isNewGroup ? null : buildBody(targetGroup),
      newGroup: isNewGroup
        ? { name: newGroupName.trim(), sortOrder: nextSortOrder(groups.map((group) => group.sort_order)) }
        : null,
      buildBody,
    });
  }

  const subtitle = projectName === undefined ? SUBTITLE : `${projectName} · ${SUBTITLE}`;
  const totalText = entries.length > 0 ? `₺${formatPrice(totalAmount(entries))}` : EMPTY_CELL;

  return (
    <Modal
      title={TITLE}
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
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
          onSubmit={handleSubmit}
          onCancel={onClose}
          onManualAdd={onManualAdd}
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
        onHideInContract={setHideInContract}
        groupOptions={groupOptions}
        groupValue={targetGroup}
        onGroup={setGroupChoice}
        newGroupName={newGroupName}
        onNewGroupName={setNewGroupName}
        selectedCount={selectedCount}
        visibleCount={visible.length}
        isDisabled={isSubmitting}
      />
      <p className="wip-note">
        <strong>{NOTE_LEAD}</strong>
        {NOTE_REST}
      </p>
      <WorkItemPickerTable
        sections={sections}
        inputs={inputs}
        entries={entries}
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

function noop(): void {
  // Gönderim sürerken Modal kapatma istekleri (Esc, ×, arka plan) yok sayılır.
}
