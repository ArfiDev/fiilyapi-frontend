"use client";

import type { TreeTableColumn } from "@/components/earned-value/common/tree-table/TreeTable";
import { formatPercent01 } from "@/lib/earned-value";
import { EMPTY_CELL, formatQuantity } from "@/lib/format";
import type { EvItemPatch, EvLeafPatch } from "@/lib/api/hooks/useEvBudgetMutations";
import { cx } from "@/lib/cx";

import { AssignmentPicker, GroupDisciplinePicker, LeafOverrideBadge, type AssignmentOption } from "./AssignmentCells";
import { formatDateShort, formatMhr, leafLabel } from "./budget-format";
import {
  itemContractorPatch,
  leafContractorPatch,
  leafDirectPatch,
  type BudgetNode,
  type BudgetRow,
  type ContractorType,
  type DisciplineOption,
  type DisciplineOut,
  type GroupOut,
  type ItemOut,
  type LeafOut,
} from "./budget-tree";
import type { LeafDiffMark } from "./diff-rows";
import { RateCell, type PickedSuggestion } from "./RateCell";
import { WindowlessNotice } from "./WindowlessNotice";

/**
 * Adım 1 ağaç tablosunun 10 veri kolonu — Adam-Saat Bütçesi.dc.html:207-219
 * (başlıklar) ve :606-640 (satır içerikleri). Seçim kolonu `TreeTable`
 * `selectable`ından gelir. Satır türüne göre çizim bu dosyada; eylemler
 * `RatesColumnsContext` ile ekrandan gelir.
 */

export interface RatesColumnsContext {
  siteId: string;
  editable: boolean;
  diffMarks: ReadonlyMap<string, LeafDiffMark> | null;
  disciplineOptions: readonly DisciplineOption[];
  /** Dondurmayı engelleyen disiplinsiz grup düğümleri (`freeze_blockers`). */
  blockingGroupIds: ReadonlySet<string>;
  /** Penceresi çıkmayan yaprak → engel kodu (`missing_window` | `no_working_day`). */
  windowlessLeafIds: ReadonlyMap<string, string>;
  /** M4 alt satırı bağlantıları (gerçek rotalar; şantiye çözülmediyse null). */
  boqHref: string | null;
  sectionsHref: string | null;
  openSuggestion: string | null;
  setOpenSuggestion: (leafId: string | null) => void;
  onCommitRate: (leaf: LeafOut, raw: string) => void;
  onUseSuggestion: (leaf: LeafOut, item: ItemOut, picked: PickedSuggestion) => void;
  onMapGroup: (group: GroupOut, disciplineId: string | null) => void;
  onItemPatch: (item: ItemOut, patch: EvItemPatch) => void;
  onLeafPatch: (patch: EvLeafPatch) => void;
}

type DirectValue = "direct" | "indirect";

const SOURCE_BADGE = {
  catalog: { label: "Katalog", tone: "catalog" },
  history: { label: "Geçmiş gerç. ort.", tone: "history" },
  manual: { label: "Elle", tone: "manual" },
  offer: { label: "Teklif", tone: "manual" },
} as const;

const DIRECT_OPTIONS: readonly AssignmentOption<DirectValue>[] = [
  { value: "direct", label: "Doğrudan", sub: "Bütçe ve eğriye girer", tone: "direct" },
  { value: "indirect", label: "Dolaylı", sub: "Bütçe dışı · oranı hesaplanır (K3)", tone: "indirect" },
];

function contractorOptions(discipline: DisciplineOut, item?: ItemOut): AssignmentOption<ContractorType>[] {
  const inherited = item ? item.leaves.filter((l) => l.contractor_source === "inherited").length : 0;
  const sub = (value: ContractorType) =>
    discipline.default_contractor_type === value
      ? `${discipline.name ?? "Disiplinsiz"} varsayılanı`
      : `${inherited} yaprak bu değeri miras alır`;
  return [
    { value: "own", label: "Kendi", sub: sub("own"), tone: "own" },
    { value: "subcon", label: "Taşeron", sub: sub("subcon"), tone: "subcon" },
  ];
}

const toDirect = (value: boolean): DirectValue => (value ? "direct" : "indirect");

function isAllIndirect(discipline: DisciplineOut): boolean {
  const items = discipline.groups.flatMap((g) => g.items);
  return items.length > 0 && items.every((i) => !i.is_direct);
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: "override" }) {
  return <span className={cx("ev-budget-tag", tone && `ev-budget-tag--${tone}`)}>{children}</span>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={cx("ev-budget-src", `ev-budget-src--${tone}`)}>{children}</span>;
}

function leafNameExtras(leaf: LeafOut, ctx: RatesColumnsContext) {
  const extras: React.ReactNode[] = [];
  if (leaf.section_id === null && leaf.window_start && leaf.window_end) {
    extras.push(<Tag key="w">{`kalan · pencere ${formatDateShort(leaf.window_start).slice(0, 5)}–${formatDateShort(leaf.window_end).slice(0, 5)}`}</Tag>);
  }
  if (ctx.windowlessLeafIds.has(leaf.id)) extras.push(<Badge key="nw" tone="danger">Pencere yok</Badge>);
  if (leaf.contractor_source === "override" || leaf.is_direct_source === "override") {
    extras.push(<Tag key="o" tone="override">ezildi</Tag>);
  }
  return extras;
}

function renderName(row: BudgetRow, ctx: RatesColumnsContext) {
  switch (row.kind) {
    case "discipline":
      return (
        <>
          <span className="ev-budget-name">{row.discipline.name ?? "Disiplinsiz"}</span>
          {row.discipline.discipline_id === null && <Tag>{`${row.discipline.groups.length} grup eşlenmemiş`}</Tag>}
        </>
      );
    case "group":
      return (
        <>
          <span className="ev-budget-name">{row.group.name}</span>
          <Tag>alt grup</Tag>
        </>
      );
    case "item":
      return (
        <>
          <span className="ev-budget-name">{row.item.description}</span>
          <Tag>iş tipi</Tag>
        </>
      );
    case "leaf":
      return (
        <>
          <span className="ev-budget-name ev-budget-name--leaf">{leafLabel(row.leaf)}</span>
          {leafNameExtras(row.leaf, ctx)}
        </>
      );
  }
}

function renderQty(row: BudgetRow, ctx: RatesColumnsContext) {
  if (row.kind === "item") {
    return (
      <span className="ev-budget-qty">
        <span className="ev-budget-boq">BOQ</span>
        {formatQuantity(row.item.planned_qty)}
      </span>
    );
  }
  if (row.kind !== "leaf") return null;
  const mark = ctx.diffMarks?.get(row.leaf.id);
  return (
    <span className={cx("ev-budget-qty", mark?.qtyChanged && "ev-budget-changed")}>
      <span className="ev-budget-boq">{row.leaf.section_id === null ? "KALAN" : "BOQ"}</span>
      {mark?.qtyChanged && <span className="ev-budget-old">{mark.oldQtyShort}</span>}
      {formatQuantity(row.leaf.planned_qty)}
    </span>
  );
}

function renderRate(row: BudgetRow, ctx: RatesColumnsContext) {
  if (row.kind === "group") {
    const current = ctx.disciplineOptions.find((o) => o.id === row.group.discipline_id) ?? null;
    return (
      <GroupDisciplinePicker
        groupName={row.group.name}
        current={current}
        options={ctx.disciplineOptions}
        editable={ctx.editable}
        onPick={(id) => ctx.onMapGroup(row.group, id)}
      />
    );
  }
  if (row.kind !== "leaf") return null;
  const { leaf, item } = row;
  const mark = ctx.diffMarks?.get(leaf.id);
  return (
    <span className={cx(mark?.rateChanged && "ev-budget-changed")}>
      <RateCell
        siteId={ctx.siteId}
        item={item}
        leaf={leaf}
        editable={ctx.editable}
        mark={mark}
        suggestionOpen={ctx.openSuggestion === leaf.id}
        onOpenSuggestion={() => ctx.setOpenSuggestion(leaf.id)}
        onCloseSuggestion={() => ctx.setOpenSuggestion(null)}
        onCommit={(raw) => ctx.onCommitRate(leaf, raw)}
        onUseSuggestion={(picked) => ctx.onUseSuggestion(leaf, item, picked)}
      />
    </span>
  );
}

function renderSource(row: BudgetRow, ctx: RatesColumnsContext) {
  if (row.kind === "leaf") {
    if (row.leaf.unit_mhr === null) return <Badge tone="danger">Oran girilmedi</Badge>;
    const source = row.leaf.rate_source ? SOURCE_BADGE[row.leaf.rate_source] : null;
    return source ? <Badge tone={source.tone}>{source.label}</Badge> : <span className="ev-budget-subtle">{EMPTY_CELL}</span>;
  }
  if (row.kind === "discipline" && row.discipline.discipline_id === null) {
    const blocking = row.discipline.groups.filter((g) => ctx.blockingGroupIds.has(g.id)).length;
    if (blocking > 0) return <Badge tone="danger">{`Dondurma engeli · ${blocking} grup`}</Badge>;
  }
  return <span className="ev-budget-subtle">{EMPTY_CELL}</span>;
}

/** Ek Formlar M1 (a): disiplinsiz grubun engel rozeti Kendi/Taş. + Doğr./Dol. kolonlarını (span 2) kaplar. */
function renderGroupFinding(group: GroupOut, ctx: RatesColumnsContext) {
  if (group.discipline_id !== null) return null;
  return ctx.blockingGroupIds.has(group.id) ? (
    <Badge tone="danger">Engel · doğrudan bütçeli</Badge>
  ) : (
    <Badge tone="manual">Yalnız dolaylı · engel değil</Badge>
  );
}

function renderOwn(row: BudgetRow, ctx: RatesColumnsContext) {
  if (row.kind === "group") return renderGroupFinding(row.group, ctx);
  if (row.kind === "item") {
    return (
      <AssignmentPicker
        ariaLabel={`${row.item.description} Kendi/Taşeron`}
        value={row.item.contractor_type}
        options={contractorOptions(row.discipline, row.item)}
        editable={ctx.editable}
        onPick={(value) => ctx.onItemPatch(row.item, itemContractorPatch(row.discipline, value))}
      />
    );
  }
  if (row.kind !== "leaf") return null;
  return (
    <LeafOverrideBadge
      title={`${row.item.description} · ${leafLabel(row.leaf)} · Kendi/Taşeron`}
      value={row.leaf.contractor_type}
      itemValue={row.item.contractor_type}
      overridden={row.leaf.contractor_source === "override"}
      options={contractorOptions(row.discipline)}
      editable={ctx.editable}
      onPick={(value) => ctx.onLeafPatch(leafContractorPatch(row.item, row.leaf, value))}
    />
  );
}

function renderDirect(row: BudgetRow, ctx: RatesColumnsContext) {
  if (row.kind === "discipline") {
    return isAllIndirect(row.discipline) ? <span className="ev-budget-chip ev-budget-chip--indirect">Dolaylı</span> : null;
  }
  if (row.kind === "item") {
    return (
      <AssignmentPicker
        ariaLabel={`${row.item.description} Doğrudan/Dolaylı`}
        value={toDirect(row.item.is_direct)}
        options={DIRECT_OPTIONS}
        editable={ctx.editable}
        onPick={(value) => ctx.onItemPatch(row.item, { is_direct: value === "direct" })}
      />
    );
  }
  if (row.kind !== "leaf") return null;
  return (
    <LeafOverrideBadge
      title={`${row.item.description} · ${leafLabel(row.leaf)} · Doğrudan/Dolaylı`}
      value={toDirect(row.leaf.is_direct)}
      itemValue={toDirect(row.item.is_direct)}
      overridden={row.leaf.is_direct_source === "override"}
      options={DIRECT_OPTIONS}
      editable={ctx.editable}
      onPick={(value) => ctx.onLeafPatch(leafDirectPatch(row.item, row.leaf, value === "direct"))}
    />
  );
}

function renderBudget(row: BudgetRow) {
  if (row.kind === "leaf") {
    const empty = row.leaf.unit_mhr === null;
    return (
      <span className={cx((empty || !row.leaf.is_direct) && "ev-budget-subtle")}>
        {empty ? EMPTY_CELL : formatMhr(row.leaf.budget_mhr)}
      </span>
    );
  }
  const node = row.kind === "discipline" ? row.discipline : row.kind === "group" ? row.group : row.item;
  const offBudget = Number(node.direct_budget_mhr) === 0 && Number(node.budget_mhr) > 0;
  return <span className={cx(offBudget && "ev-budget-subtle")}>{formatMhr(node.budget_mhr)}</span>;
}

function renderShare(row: BudgetRow) {
  switch (row.kind) {
    case "discipline":
      return isAllIndirect(row.discipline) ? "bütçe dışı" : formatPercent01(row.discipline.share);
    case "group":
      return Number(row.group.direct_budget_mhr) > 0 ? formatPercent01(row.group.share) : EMPTY_CELL;
    case "item":
      return row.item.is_direct ? formatPercent01(row.item.share) : EMPTY_CELL;
    case "leaf":
      return row.leaf.is_direct && row.leaf.unit_mhr !== null ? formatPercent01(row.leaf.share) : EMPTY_CELL;
  }
}

/**
 * Kod kolonu. Grup ve yaprak için backend henüz kod taşımıyor → `EMPTY_CELL`
 * (uydurma ayraç basılmaz). GroupOut.code / LeafOut.section_code B3 ile gelir
 * (CEO kararı o), F2.1/F3.1 devrinde bağlanır.
 */
function renderCode(row: BudgetRow) {
  if (row.kind === "discipline") return row.discipline.code ?? EMPTY_CELL;
  if (row.kind === "item") return row.item.code;
  return EMPTY_CELL;
}

/** Ek Formlar M1 (a): grup satırında seçici ve engel rozeti ikişer kolon kaplar (TreeTable `colSpan`). */
const groupSpan = (node: BudgetNode) => (node.data.kind === "group" ? 2 : 1);

export function ratesColumns(ctx: RatesColumnsContext): TreeTableColumn<BudgetRow>[] {
  const r = (fn: (row: BudgetRow) => React.ReactNode) => (node: BudgetNode) => fn(node.data);
  return [
    { key: "code", header: "Kod", mono: true, className: "ev-budget-col-code", render: r(renderCode) },
    { key: "name", header: "Ad", tree: true, className: "ev-budget-col-name", render: r((row) => renderName(row, ctx)) },
    { key: "unit", header: "Birim", className: "ev-budget-col-unit", render: r((row) => (row.kind === "item" || row.kind === "leaf" ? row.item.uom : null)) },
    { key: "qty", header: "Planlı miktar", align: "right", mono: true, className: "ev-budget-col-qty", render: r((row) => renderQty(row, ctx)) },
    { key: "rate", header: "Birim oran a-s", align: "right", className: "ev-budget-col-rate", colSpan: groupSpan, render: r((row) => renderRate(row, ctx)) },
    { key: "source", header: "Oran kaynağı", className: "ev-budget-col-source", render: r((row) => renderSource(row, ctx)) },
    { key: "own", header: "Kendi/Taş.", className: "ev-budget-col-own", colSpan: groupSpan, render: r((row) => renderOwn(row, ctx)) },
    { key: "direct", header: "Doğr./Dol.", className: "ev-budget-col-dir", render: r((row) => renderDirect(row, ctx)) },
    { key: "budget", header: "Bütçe a-s", align: "right", mono: true, className: "ev-budget-col-budget", render: r(renderBudget) },
    { key: "share", header: "Pay %", align: "right", mono: true, className: "ev-budget-col-share", render: r(renderShare) },
  ];
}

export function budgetRowLabel(node: BudgetNode): string {
  const row = node.data;
  if (row.kind === "discipline") return row.discipline.name ?? "Disiplinsiz";
  if (row.kind === "group") return row.group.name;
  if (row.kind === "item") return row.item.description;
  return `${row.item.description} · ${leafLabel(row.leaf)}`;
}

export function budgetRowClass(node: BudgetNode, ctx: Pick<RatesColumnsContext, "blockingGroupIds" | "windowlessLeafIds" | "openSuggestion">): string | undefined {
  const row = node.data;
  if (row.kind === "leaf") {
    return cx(
      row.leaf.unit_mhr === null && "ev-budget-row--empty",
      ctx.windowlessLeafIds.has(row.leaf.id) && "ev-budget-row--error",
      ctx.openSuggestion === row.leaf.id && "ev-budget-row--raised",
    ) || undefined;
  }
  if (row.kind === "discipline" && row.discipline.discipline_id === null) {
    return row.discipline.groups.some((g) => ctx.blockingGroupIds.has(g.id)) ? "ev-budget-row--error" : undefined;
  }
  return undefined;
}

/** M4 alt satırı (TreeTable `renderRowAfter`): penceresi çıkmayan yaprağın altında. */
export function budgetRowAfter(node: BudgetNode, ctx: Pick<RatesColumnsContext, "windowlessLeafIds" | "boqHref" | "sectionsHref">) {
  const row = node.data;
  if (row.kind !== "leaf") return null;
  const code = ctx.windowlessLeafIds.get(row.leaf.id);
  if (code === undefined) return null;
  return (
    <WindowlessNotice
      disciplineName={row.discipline.name}
      code={code}
      boqHref={ctx.boqHref}
      sectionName={row.leaf.section_name}
      sectionsHref={ctx.sectionsHref}
    />
  );
}
