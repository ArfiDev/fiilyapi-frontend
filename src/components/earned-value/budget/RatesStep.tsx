"use client";

import { useMemo, useState } from "react";

import { TreeTable } from "@/components/earned-value/common/tree-table/TreeTable";
import { initialExpanded } from "@/components/earned-value/common/tree-table/tree-rows";
import type { EvBudgetView } from "@/lib/api/models";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";

import { formatRateInput, leafLabel, parseRateInput } from "./budget-format";
import {
  budgetNodes,
  indexLeaves,
  leafPatchFor,
  rateCommit,
  type BudgetNode,
  type DisciplineOption,
  type GroupOut,
  type ItemOut,
  type LeafEntry,
  type LeafOut,
} from "./budget-tree";
import type { LeafDiffMark } from "./diff-rows";
import { BudgetFlash } from "./BudgetFlash";
import { budgetRowAfter, budgetRowClass, budgetRowLabel, ratesColumns, type RatesColumnsContext } from "./rates-columns";
import type { BudgetLinks } from "./BudgetHeader";
import { RatesFooter } from "./RatesFooter";
import { BulkRateBar, RatesToolbar } from "./RatesToolbar";
import type { ScreenState } from "./revision-state";
import type { PickedSuggestion } from "./RateCell";
import type { BudgetActions } from "./useBudgetScreenHooks";

interface RatesStepProps {
  siteId: string;
  view: EvBudgetView;
  state: ScreenState;
  actions: BudgetActions;
  diffMarks: ReadonlyMap<string, LeafDiffMark> | null;
  disciplineOptions: readonly DisciplineOption[];
  links: BudgetLinks;
  onNext: () => void;
}

const WINDOW_CODES = new Set(["missing_window", "no_working_day"]);
const NAME_PREVIEW = 3;

function findingIds(view: EvBudgetView, codes: ReadonlySet<string>): Set<string> {
  return new Set(view.freeze_blockers.filter((f) => codes.has(f.code)).flatMap((f) => f.node_ids));
}

/** Yaprak → pencere engel kodu (M4 alt satırının metni koda göre değişir). */
function findingCodes(view: EvBudgetView, codes: ReadonlySet<string>): Map<string, string> {
  return new Map(
    view.freeze_blockers.filter((f) => codes.has(f.code)).flatMap((f) => f.node_ids.map((id) => [id, f.code] as const)),
  );
}

function selectedEntries(selected: ReadonlySet<string>, index: ReadonlyMap<string, LeafEntry>): LeafEntry[] {
  return [...selected].map((id) => index.get(id)).filter((e): e is LeafEntry => e !== undefined);
}

function previewNames(entries: readonly LeafEntry[]): string {
  const names = entries.slice(0, NAME_PREVIEW).map((e) => `${e.item.description} · ${leafLabel(e.leaf)}`);
  return names.join(", ") + (entries.length > NAME_PREVIEW ? " …" : "");
}

/** Kapalı düğüm kümesi saklanır: yeni gelen dallar (eşleme sonrası) AÇIK doğar. */
function useCollapsed(nodes: readonly BudgetNode[]) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const all = initialExpanded(nodes, "all");
  const expanded = new Set([...all].filter((id) => !collapsed.has(id)));
  const onExpandedChange = (next: Set<string>) => setCollapsed(new Set([...all].filter((id) => !next.has(id))));
  return { expanded, onExpandedChange };
}

/** Tablo bağlamı: süzgeç, açık düğümler, seçim, öneri popover'ı ve hücre eylemleri. */
function useRatesModel({ siteId, view, state, actions, diffMarks, disciplineOptions, links }: RatesStepProps) {
  const [filter, setFilter] = useState({ query: "", onlyEmpty: false });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [openSuggestion, setOpenSuggestion] = useState<string | null>(null);
  const nodes = useMemo(() => budgetNodes(view, filter), [view, filter]);
  const index = useMemo(() => indexLeaves(view), [view]);
  const tree = useCollapsed(nodes);
  const isDraft = state.mode === "draft";
  const entries = selectedEntries(selected, index);
  const bulk = useBulkRate(entries, actions, () => setSelected(new Set()));
  const ctx: RatesColumnsContext = {
    siteId,
    editable: state.editable,
    diffMarks,
    disciplineOptions,
    blockingGroupIds: isDraft ? findingIds(view, new Set(["disciplineless_group"])) : new Set<string>(),
    windowlessLeafIds: isDraft ? findingCodes(view, WINDOW_CODES) : new Map<string, string>(),
    boqHref: links.boq,
    sectionsHref: links.sections,
    openSuggestion,
    setOpenSuggestion,
    ...rateHandlers({ actions, setOpenSuggestion, disciplineOptions }),
  };
  return { filter, setFilter, selected, setSelected, nodes, tree, entries, bulk, ctx };
}

/** Adım 1 · Oranlar — Adam-Saat Bütçesi.dc.html:177-280 (+ Ek Formlar M1, M2, M4). */
export function RatesStep(props: RatesStepProps) {
  const { view, state, actions } = props;
  const { filter, setFilter, selected, setSelected, nodes, tree, entries, bulk, ctx } = useRatesModel(props);
  // SO-57: uç kısıtlıya 403 → düğme kısıtlı kullanıcıda GİZLİ.
  const isRestricted = useDisciplineScope().isRestricted;
  const toggleBulk = () => bulk.setBulk((b) => ({ ...b, open: !b.open }));
  return (
    <section className="ev-budget-card" aria-label="Adım 1 · Oranlar">
      <RatesToolbar
        showActions={!state.hideActions}
        editable={state.editable}
        filling={actions.isFilling}
        selectedCount={entries.length}
        bulkOpen={bulk.bulk.open}
        query={filter.query}
        onlyEmpty={filter.onlyEmpty}
        onSuggestAll={() => void actions.fillFromCatalog()}
        showFillFromContract={!isRestricted}
        fillingFromContract={actions.isFillingFromContract}
        onFillFromContract={() => void actions.fillFromContract()}
        onToggleBulk={toggleBulk}
        onQuery={(query) => setFilter((f) => ({ ...f, query }))}
        onToggleEmpty={() => setFilter((f) => ({ ...f, onlyEmpty: !f.onlyEmpty }))}
      />
      {bulk.bulk.open && entries.length > 0 && state.editable && <OpenBulkBar entries={entries} bulk={bulk} />}
      <BudgetFlash flash={actions.flash} />
      <div className="ev-budget-table-scroll">
        <TreeTable
          nodes={nodes}
          columns={ratesColumns(ctx)}
          getLabel={budgetRowLabel}
          variant="budget"
          ariaLabel="Adam-saat bütçe ağacı"
          emptyText="Aramaya uyan kalem yok."
          className="ev-budget-table"
          expanded={tree.expanded}
          onExpandedChange={tree.onExpandedChange}
          selectable={state.editable}
          selected={selected}
          onSelectedChange={setSelected}
          rowClassName={(node) => budgetRowClass(node, ctx)}
          renderRowAfter={(node) => budgetRowAfter(node, ctx)}
        />
      </div>
      <RatesFooter view={view} disciplinelessCount={ctx.blockingGroupIds.size} onNext={props.onNext} />
    </section>
  );
}

function OpenBulkBar({ entries, bulk }: { entries: readonly LeafEntry[]; bulk: ReturnType<typeof useBulkRate> }) {
  return (
    <BulkRateBar
      count={entries.length}
      names={previewNames(entries)}
      value={bulk.bulk.value}
      onValue={(value) => bulk.setBulk((b) => ({ ...b, value }))}
      onApply={() => void bulk.applyBulk()}
      onCancel={() => bulk.setBulk({ open: false, value: "" })}
    />
  );
}

/** BÜT:666 `applyBulk` — seçili yapraklara tek oran, kaynak "manual". */
function useBulkRate(entries: readonly LeafEntry[], actions: BudgetActions, clearSelection: () => void) {
  const [bulk, setBulk] = useState({ open: false, value: "" });
  async function applyBulk() {
    const parsed = parseRateInput(bulk.value);
    if (parsed.kind !== "value") {
      actions.showFlash("Geçerli bir oran girin.", "danger");
      return;
    }
    const patches = entries.map((e) => leafPatchFor(e.leaf, { unit_mhr: parsed.value, rate_source: "manual" }));
    const done = await actions.saveLeaves(patches, `${patches.length} satıra ${formatRateInput(parsed.value)} a-s/birim atandı`);
    if (done) {
      clearSelection();
      setBulk({ open: false, value: "" });
    }
  }
  return { bulk, setBulk, applyBulk };
}

interface RateHandlerDeps {
  actions: BudgetActions;
  setOpenSuggestion: (id: string | null) => void;
  disciplineOptions: readonly DisciplineOption[];
}

/** Hücre eylemleri → PATCH/PUT; bildirim metinleri mockup'tan (BÜT:666-667, Ek M1 b). */
function rateHandlers({ actions, setOpenSuggestion, disciplineOptions }: RateHandlerDeps) {
  return {
    onCommitRate: (leaf: LeafOut, raw: string) => {
      const commit = rateCommit(leaf, raw);
      if (commit.kind === "invalid") actions.showFlash(`Geçersiz oran: "${raw.trim()}"`, "danger");
      if (commit.kind === "patch") void actions.saveLeaves([commit.patch]);
    },
    /**
     * CEO m: ÖNCE yaprak oranı (kaynak = seçilen öneri), SONRA — yalnız KATALOG
     * seçiminde ve bağ farklıysa — L3 `catalog_item_id` bağı (B1-4). Oran
     * yazılamazsa bağ isteği ATILMAZ. Geçmiş önerisi bağ kurmaz.
     */
    onUseSuggestion: async (leaf: LeafOut, item: ItemOut, picked: PickedSuggestion) => {
      setOpenSuggestion(null);
      const saved = await actions.saveLeaves([leafPatchFor(leaf, { unit_mhr: picked.rate, rate_source: picked.source })]);
      if (!saved || picked.source !== "catalog" || item.catalog_item_id === picked.catalogItemId) return;
      await actions.linkCatalog(item.item_id, picked.catalogItemId);
    },
    onMapGroup: async (group: GroupOut, disciplineId: string | null) => {
      const next = await actions.mapGroup(group.group_id, disciplineId);
      if (!next) return;
      const name = disciplineId === null ? "Disiplinsiz" : (disciplineOptions.find((o) => o.id === disciplineId)?.name ?? "");
      const left = next.disciplines.find((d) => d.discipline_id === null)?.groups.length ?? 0;
      const verb = disciplineId === null ? "eşleme kaldırıldı" : "eşlendi";
      actions.showFlash(`${group.name} → ${name} ${verb}` + (left > 0 ? ` · Disiplinsiz'de ${left} grup kaldı` : ""));
    },
    onItemPatch: (item: { item_id: string }, patch: Parameters<BudgetActions["patchItem"]>[1]) =>
      void actions.patchItem(item.item_id, patch),
    onLeafPatch: (patch: Parameters<BudgetActions["saveLeaves"]>[0][number]) => void actions.saveLeaves([patch]),
  };
}
