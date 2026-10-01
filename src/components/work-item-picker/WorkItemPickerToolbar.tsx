"use client";

import { MAX_LENGTH, NEW_GROUP_OPTION } from "@/components/contract-item-form/constants";
import { Checkbox, Input, Select } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";
import type { WorkDisciplineRead } from "@/lib/api/models";

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
  onHideInContract: (value: boolean) => void;
  groupOptions: readonly GroupOption[];
  groupValue: string;
  onGroup: (value: string) => void;
  newGroupName: string;
  onNewGroupName: (value: string) => void;
  selectedCount: number;
  visibleCount: number;
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
  onHideInContract,
  groupOptions,
  groupValue,
  onGroup,
  newGroupName,
  onNewGroupName,
  selectedCount,
  visibleCount,
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
          label="Sözleşmede olanları gizle"
          disabled={isDisabled}
        />
      </div>
      <div className="wip-toolbar__row">
        <span className="wip-toolbar__label">Eklenecek grup</span>
        <Select aria-label="Grup" value={groupValue} onChange={(event) => onGroup(event.target.value)} disabled={isDisabled}>
          {groupOptions.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
          <option value={NEW_GROUP_OPTION}>+ Yeni Grup</option>
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
          {` poz seçili · ${visibleCount} poz listede`}
        </span>
      </div>
    </div>
  );
}
