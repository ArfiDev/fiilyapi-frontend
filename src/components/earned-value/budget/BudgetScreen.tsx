"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { ErrorCard, Skeleton, SkeletonRows } from "@/components/earned-value/common/state";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useEvDisciplines } from "@/lib/api/hooks/useEvDisciplines";
import {
  useEvBudget,
  useEvBudgetPreview,
  useEvBudgetRevisions,
  useEvRevisionDiff,
} from "@/lib/api/hooks/useEvBudget";
import type { EvBudgetView, EvRevisionOut } from "@/lib/api/models";

import { BudgetHeader, type BudgetLinks } from "./BudgetHeader";
import { BudgetStepper } from "./BudgetStepper";
import {
  disciplineOptionsFromCompany,
  disciplineOptionsFromView,
  mergeDisciplineOptions,
  type DisciplineOption,
} from "./budget-tree";
import { DiffPanel } from "./DiffPanel";
import { diffByLeaf, diffSummary } from "./diff-rows";
import { freezeBlockers, stepSubtitles, type BudgetStep } from "./freeze-findings";
import { FreezeStep, type FrozenInfo } from "./FreezeStep";
import { PreviewStep } from "./PreviewStep";
import { RatesStep } from "./RatesStep";
import { budgetAccess, screenState } from "./revision-state";
import { RevisionNotice } from "./RevisionNotice";
import { ScheduleStep } from "./ScheduleStep";
import { useBudgetActions, useBudgetUrlState } from "./useBudgetScreenHooks";
import "./budget.css";
import "./budget-rates.css";
import "./budget-steps.css";

export interface BudgetScreenProps {
  /** Kanonik şantiye UUID'si; çözülene kadar boş. */
  siteId: string;
  links: BudgetLinks;
  /** Kök ikizde şantiye seçici. */
  picker?: ReactNode;
  /** B1-12: şantiye tamamlanmış → bütçe salt okunur (`BudgetView.editable` bunu yansıtmaz). */
  siteCompleted: boolean;
}

/** BÜT:498-505 — içerlekli ağaç iskeleti. */
function BudgetSkeleton() {
  return (
    <Skeleton label="Bütçe yükleniyor" className="ev-budget-card ev-budget-skeleton">
      <SkeletonRows columns="60px 1fr 50px 60px" count={4} primaryColumn={1} depths={[0, 1, 2, 2]} primaryWidths={["100%", "70%", "80%", "60%"]} density="sm" />
    </Skeleton>
  );
}

/** Adam-Saat Bütçesi ekranı — veri durumu kapısı (yükleniyor · hata · yüklendi). */
export function BudgetScreen({ siteId, links, picker, siteCompleted }: BudgetScreenProps) {
  const url = useBudgetUrlState();
  const budget = useEvBudget(siteId, url.revisionId);
  const revisions = useEvBudgetRevisions(siteId);

  if (budget.isError) {
    return (
      <div className="ev-budget">
        {picker}
        <ErrorCard
          title="İş kalemleri alınamadı"
          description="BOQ senkronizasyonu başarısız. Girilen oranlar taslakta korunuyor."
          onRetry={() => void budget.refetch()}
          retrying={budget.isFetching}
        />
      </div>
    );
  }
  if (!budget.data) {
    return (
      <div className="ev-budget">
        {picker}
        <BudgetSkeleton />
      </div>
    );
  }
  return (
    <LoadedBudget
      siteId={siteId}
      view={budget.data}
      revisions={revisions.data ?? []}
      links={links}
      picker={picker}
      siteCompleted={siteCompleted}
      url={url}
    />
  );
}

interface LoadedBudgetProps {
  siteId: string;
  view: EvBudgetView;
  revisions: readonly EvRevisionOut[];
  links: BudgetLinks;
  picker?: ReactNode;
  siteCompleted: boolean;
  url: ReturnType<typeof useBudgetUrlState>;
}

function diffAvailableFor(view: EvBudgetView, revisions: readonly EvRevisionOut[]): boolean {
  const current = view.revision;
  return current !== null && revisions.some((r) => r.status !== "draft" && r.id !== current.id && r.number < current.number);
}

/** Yüklenmiş ekranın türetilmiş durumu + eylemleri (izin, revizyon hâli, fark, önizleme). */
function useLoadedModel({ siteId, view, revisions, siteCompleted, url }: LoadedBudgetProps) {
  const permission = useModulePermission("earned_value");
  const access = budgetAccess(permission.level);
  const state = screenState(view, access, revisions, siteCompleted);
  const actions = useBudgetActions(siteId);
  const [showDiff, setShowDiff] = useState(false);
  const [frozenInfo, setFrozenInfo] = useState<FrozenInfo | null>(null);
  const diffAvailable = diffAvailableFor(view, revisions);
  const revisionId = view.revision?.id ?? null;
  const diff = useEvRevisionDiff(siteId, revisionId, diffAvailable && (showDiff || url.step === 4));
  const preview = useEvBudgetPreview(siteId, revisionId, url.step >= 3);
  // M1 seçicisi ŞİRKET listesini sunar (yeni şantiyede ağaçta hiç disiplin yokken de);
  // liste alınamazsa bütçe yanıtındaki alt küme yedektir.
  const company = useEvDisciplines();
  const options = useMemo(
    () => mergeDisciplineOptions(disciplineOptionsFromView(view), company.data ? disciplineOptionsFromCompany(company.data) : undefined),
    [view, company.data],
  );
  const openDraft = async () => {
    if (await actions.openDraft()) url.update({ revisionId: null });
  };
  const freeze: FreezeProps = {
    canApprove: access.canApprove,
    blockers: freezeBlockers(view, state.mode),
    diff: diff.data ? diffSummary(diff.data) : null,
    preview: preview.data,
    frozenInfo,
    onFrozen: (info) => {
      setFrozenInfo(info);
      setShowDiff(false);
      url.update({ revisionId: null });
    },
    onDraftDeleted: () => {
      actions.showFlash("Taslak silindi.");
      url.update({ revisionId: null, step: 1 });
    },
  };
  const diffShown = showDiff && diffAvailable ? (diff.data ?? null) : null;
  return { state, actions, showDiff, setShowDiff, diffAvailable, diffShown, preview, options, openDraft, freeze };
}

function LoadedBudget(props: LoadedBudgetProps) {
  const { siteId, view, revisions, links, picker, url } = props;
  const m = useLoadedModel(props);
  const goStep = (step: BudgetStep) => url.update({ step });
  return (
    <div className="ev-budget">
      <BudgetHeader
        view={view}
        revisions={revisions}
        state={m.state}
        links={links}
        picker={picker}
        showDiff={m.showDiff}
        diffAvailable={m.diffAvailable}
        onToggleDiff={m.setShowDiff}
        onSelectRevision={(rev) => url.update({ revisionId: rev.status === "draft" ? null : rev.id })}
        onOpenDraft={() => void m.openDraft()}
      />
      <BudgetStepper step={url.step} subtitles={stepSubtitles(view, m.state.mode, m.freeze.blockers)} frozen={m.state.mode === "active"} onStep={goStep} />
      <RevisionNotice
        view={view}
        state={m.state}
        onBackToDraft={() => url.update({ revisionId: null })}
        onBackToActive={() => url.update({ revisionId: m.state.active?.id ?? null })}
        onOpenDraft={() => void m.openDraft()}
        openingDraft={m.actions.isOpeningDraft}
      />
      {m.diffShown && <DiffPanel diff={m.diffShown} />}
      {view.totals.item_count === 0 ? (
        <EmptyBoq href={links.boq} />
      ) : (
        <StepContent
          step={url.step}
          siteId={siteId}
          view={view}
          state={m.state}
          actions={m.actions}
          links={links}
          diffMarks={m.diffShown ? diffByLeaf(m.diffShown) : null}
          options={m.options}
          onStep={goStep}
          freeze={m.freeze}
          preview={m.preview}
        />
      )}
    </div>
  );
}

type FreezeProps = Omit<React.ComponentProps<typeof FreezeStep>, "view" | "state" | "actions" | "onStep">;

type StepContentProps = {
  step: BudgetStep;
  siteId: string;
  view: EvBudgetView;
  state: ReturnType<typeof screenState>;
  actions: ReturnType<typeof useBudgetActions>;
  links: BudgetLinks;
  diffMarks: ReturnType<typeof diffByLeaf> | null;
  options: readonly DisciplineOption[];
  onStep: (step: BudgetStep) => void;
  freeze: FreezeProps;
  preview: ReturnType<typeof useEvBudgetPreview>;
};

function StepContent(props: StepContentProps) {
  const { step, siteId, view, state, actions, onStep } = props;
  if (step === 2) {
    return <ScheduleStep siteId={siteId} view={view} state={state} actions={actions} sectionsHref={props.links.sections} onStep={onStep} />;
  }
  if (step === 3) return <PreviewStep preview={props.preview} revisionNumber={view.revision?.number ?? null} onStep={onStep} />;
  if (step === 4) {
    return <FreezeStep key={view.revision?.id ?? "none"} view={view} state={state} actions={actions} onStep={onStep} {...props.freeze} />;
  }
  return (
    <RatesStep
      siteId={siteId}
      view={view}
      state={state}
      actions={actions}
      diffMarks={props.diffMarks}
      disciplineOptions={props.options}
      links={props.links}
      onNext={() => onStep(2)}
    />
  );
}

/** BÜT:473-480 — BOQ boş hâli. */
function EmptyBoq({ href }: { href: string | null }) {
  // Disiplini atanmış kullanıcıda backend süzmesi kalemleri boşaltabilir (DSC-F1.3).
  const scope = useDisciplineScope();
  if (scope.isRestricted) {
    return (
      <section className="ev-budget-card ev-budget-empty" aria-label="İş kalemi yok">
        <RestrictedEmptyNotice names={scope.names} />
      </section>
    );
  }
  return (
    <section className="ev-budget-card ev-budget-empty" aria-label="İş kalemi yok">
      <div className="ev-budget-empty__box">
        <span className="ev-budget-empty__icon" aria-hidden="true" />
        <p className="ev-budget-empty__title">Bu şantiyede henüz iş kalemi yok</p>
        {href && (
          <Link href={href} className="ev-budget-empty__link">
            Önce İş Kalemleri&apos;ni girin →
          </Link>
        )}
      </div>
    </section>
  );
}
