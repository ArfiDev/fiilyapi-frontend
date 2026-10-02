"use client";

import { MAX_LENGTH, NEW_GROUP_OPTION } from "@/components/contract-item-form/constants";
import { Checkbox, Input, Select } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";
import type { WorkDisciplineRead } from "@/lib/api/models";

import type { PickerWords } from "./picker-rules";

export interface GroupOption {
  id: string;
  name: string;
}

export interface WorkItemPickerToolbarProps {
  query: string;
  onQuery: (value: string) => void;
  disciplines: readonly WorkDisciplineRead[];
  /** "" = "Tüm disiplinler". */
  disciplineId: string;
  onDiscipline: (value: string) => void;
  hideInContract: boolean;
  /** "Sözleşmede olanları gizle" · "Teklifte olanları gizle". */
  hideLabel: string;
  onHideInContract: (value: boolean) => void;
  groupOptions: readonly GroupOption[];
  groupValue: string;
  /** false = bu denemede grup ZATEN açıldı: "+ Yeni Grup" seçeneği yok (ikinci grup açılmaz, §2.5). */
  canCreateGroup: boolean;
  onGroup: (value: string) => void;
  newGroupName: string;
  onNewGroupName: (value: string) => void;
  selectedCount: number;
  visibleCount: number;
  /** Nesne adı (poz / kalem): sayaç metni. */
  words: PickerWords;
  isDisabled: boolean;
}

/** PS:67-77 + plan §1.4: arama · disiplin süzgeci · "Sözleşmede olanları gizle" · hedef grup · sayaç. */
export function WorkItemPickerToolbar({
  query,
  onQuery,
  disciplines,
  disciplineId,
  onDiscipline,
  hideInContract,
  hideLabel,
  onHideInContract,
  groupOptions,
  groupValue,
  canCreateGroup,
  onGroup,
  newGroupName,
  onNewGroupName,
  selectedCount,
  visibleCount,
  words,
  isDisabled,
}: WorkItemPickerToolbarProps) {
  return (
    <div className="wip-toolbar">
      <div className="wip-toolbar__row">
        <Input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Poz no veya tanımda ara..."
          aria-label="Poz no veya tanımda ara"
          leftIcon={<SearchIcon width={13} height={13} />}
          wrapperClassName="wip-toolbar__search"
          disabled={isDisabled}
        />
        <Select
          aria-label="Disiplin"
          value={disciplineId}
          onChange={(event) => onDiscipline(event.target.value)}
          disabled={isDisabled}
        >
          <option value="">Tüm disiplinler</option>
          {disciplines.map((discipline) => (
            <option key={discipline.id} value={discipline.id}>
              {`${discipline.code} · ${discipline.name}`}
            </option>
          ))}
        </Select>
        <Checkbox
          checked={hideInContract}
          onChange={(event) => onHideInContract(event.target.checked)}
          label={hideLabel}
          disabled={isDisabled}
        />
      </div>
      <div className="wip-toolbar__row">
        <span className="wip-toolbar__label">Eklenecek grup</span>
        <Select aria-label="Grup" value={groupValue} onChange={(event) => onGroup(event.target.value)} disabled={isDisabled}>
          {/* GECE KURALI: `selectOnly` hedef grubu kayıpken seçim boş görünür (sessiz geri düşme yok). */}
          {groupValue === "" && (
            <option value="" disabled>
              Grup seçin
            </option>
          )}
          {groupOptions.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
          {canCreateGroup && <option value={NEW_GROUP_OPTION}>+ Yeni Grup</option>}
        </Select>
        {groupValue === NEW_GROUP_OPTION && (
          <Input
            value={newGroupName}
            onChange={(event) => onNewGroupName(event.target.value)}
            placeholder="Yeni grubun adı"
            aria-label="Grup Adı"
            maxLength={MAX_LENGTH.groupName}
            disabled={isDisabled}
          />
        )}
        <span className="wip-toolbar__count" data-testid="wip-count">
          <strong>{selectedCount}</strong>
          {` ${words.noun} seçili · ${visibleCount} ${words.noun} listede`}
        </span>
      </div>
    </div>
  );
}
