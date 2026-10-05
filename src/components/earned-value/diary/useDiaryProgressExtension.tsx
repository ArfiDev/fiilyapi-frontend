"use client";

import type { UseQueryResult } from "@tanstack/react-query";

import { ErrorCard } from "@/components/earned-value/common/state";
import type { DiaryCoreActions, DiaryExtension, DiaryExtensionContext } from "@/components/site-diary/diary-extension";
import { useEvBudget, useEvBudgetRevisions } from "@/lib/api/hooks/useEvBudget";
import { useEvCodeTree, useEvDay } from "@/lib/api/hooks/useEvDay";
import { useSaveDayAllocation } from "@/lib/api/hooks/useEvDayMutations";
import { useEvSettings } from "@/lib/api/hooks/useEvSettings";
import { useSite } from "@/lib/api/hooks/useSites";
import type { EvAllocationSave, EvCodeNode, EvDayView } from "@/lib/api/models";
import { BackendError } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EV_BUDGET_EDIT, EV_UNLOCK_APPROVE, SITE_DIARY_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { bandsFromSettings, type PfBandSettings } from "@/lib/earned-value";
import { routes } from "@/lib/routes";

import { buildAllocationBody, stripValues } from "./allocation-model";
import { saveAllocationIfDirty } from "./before-save";
import { ForemanBand } from "./ForemanBand";
import { buildCodeIndex } from "./code-tree";
import { DayLockBanner } from "./DayLockBanner";
import { HourAllocationBlock } from "./HourAllocationBlock";
import { formatDayWeek } from "./day-header";
import { activeRevisionId, buildItemFacts, type ItemFacts } from "./item-meta";
import { buildLineColumns } from "./line-columns";
import { buildSubmitState, resolveAllocationAccess, type AllocationAccess } from "./submit-checks";
import { useAllocationDraft, type AllocationDraftApi } from "./useAllocationDraft";
import { useEvDayFreshness } from "./useEvDayFreshness";

/** Şantiyede planlama YOK sayılan yanıtlar: görünmüyor (404) / baseline yok (409). */
const ABSENT_STATUSES = new Set([403, 404, 409]);

/**
 * Çekirdeğin bildirdiği bağlamdan (`onExtensionContext`) planlama yuvalarını
 * kurar. EV'si olmayan şantiyede (aktif baseline yok → `has_baseline: false`,
 * ya da 404/409) `undefined` döner: çekirdek bugünkü gibi çalışır (B2-3).
 */
/**
 * `projectKey` (IZN-F3.2b · opsiyonel): şantiye rotasındaki adres anahtarı; günlük/bütçe kapıları o projedeki
 * rolden okunur. Kök (şantiyesiz) günlükte verilmez → ana rol.
 */
export function useDiaryProgressExtension(
  ctx: DiaryExtensionContext | null,
  projectKey?: string,
): DiaryExtension | undefined {
  const evPermission = useModulePermission("earned_value");
  const diaryPermission = useModulePermission("site_diary");
  // IZN-F2.x · saat dağıtımı yazma = bütçe Düzenler; Gün Kilidi Aç = bütçe/günlük rapor Onaylar;
  // günlük yazma = günlük kayıt Düzenler. Grant yoksa bugünkü seviye kararı.
  const canWriteAllocation = useButtonGate({
    pages: EV_BUDGET_EDIT,
    need: "edit",
    fallback: hasAtLeast(evPermission.level, "draft"),
    projectId: projectKey,
  });
  const canUnlockDay = useButtonGate({
    pages: EV_UNLOCK_APPROVE,
    need: "approve",
    fallback: hasAtLeast(evPermission.level, "approve"),
    projectId: projectKey,
  });
  const diaryCanWrite = useButtonGate({
    pages: SITE_DIARY_EDIT,
    need: "edit",
    fallback: diaryPermission.canWrite,
    projectId: projectKey,
  });
  const siteId = evPermission.canView ? (ctx?.siteId ?? "") : "";
  const day = ctx?.day ?? "";
  const dayQuery = useEvDay(siteId, day);
  const hasBaseline = dayQuery.data?.has_baseline === true;
  const activeSite = hasBaseline ? siteId : "";
  const codeTree = useEvCodeTree(activeSite, hasBaseline);
  const settings = useEvSettings(activeSite);
  const site = useSite(activeSite);
  // Kalem doğrudan/dolaylı + kendi/taşeron → AKTİF baseline'ın bütçe görünümü.
  const activeRevision = activeRevisionId(useEvBudgetRevisions(activeSite).data);
  const budget = useEvBudget(activeRevision === null ? "" : activeSite, activeRevision);
  const draftApi = useAllocationDraft(siteId, hasBaseline ? dayQuery.data : undefined);
  const saveAllocation = useSaveDayAllocation(siteId, day);
  useEvDayFreshness(siteId, day, ctx?.entryId ?? null, ctx?.entryStatus ?? null);

  if (ctx === null || siteId === "" || day === "") return undefined;
  if (dayQuery.isError) {
    if (dayQuery.error instanceof BackendError && ABSENT_STATUSES.has(dayQuery.error.status)) return undefined;
    return { fullWidthBlock: <DayLoadError onRetry={() => void dayQuery.refetch()} retrying={dayQuery.isFetching} /> };
  }
  if (dayQuery.data === undefined || !hasBaseline || draftApi === null) return undefined;
  return buildExtension({
    ctx,
    siteId,
    day,
    view: dayQuery.data,
    codeTree,
    bands: bandsFromSettings(settings.data),
    draftApi,
    saveAllocation: saveAllocation.mutateAsync,
    itemFacts: buildItemFacts(budget.data),
    evLevel: evPermission.level,
    diaryCanWrite,
    canWriteAllocation,
    canUnlockDay,
    isSiteCompleted: site.data?.status === "completed",
    siteName: site.data?.name ?? null,
    budgetHref: site.data ? routes.projects.sites.evBudget({ projectId: site.data.project.id, siteId: site.data.id }) : null,
  });
}

interface BuildInput {
  ctx: DiaryExtensionContext;
  siteId: string;
  day: string;
  view: EvDayView;
  codeTree: UseQueryResult<EvCodeNode[], Error>;
  bands: PfBandSettings;
  draftApi: AllocationDraftApi;
  saveAllocation: (body: EvAllocationSave) => Promise<unknown>;
  itemFacts: ItemFacts;
  evLevel: ReturnType<typeof useModulePermission>["level"];
  diaryCanWrite: boolean;
  canWriteAllocation: boolean;
  canUnlockDay: boolean;
  isSiteCompleted: boolean;
  /** Tablet şeridi (İ:529 "24.09 · A-Blok") — şantiye henüz gelmediyse `null`. */
  siteName: string | null;
  budgetHref: string | null;
}

function buildExtension(input: BuildInput): DiaryExtension {
  const { view, draftApi } = input;
  const isLocked = view.lock.locked;
  const access = resolveAllocationAccess({
    evLevel: input.evLevel,
    canWriteAllocation: input.canWriteAllocation,
    canUnlockDay: input.canUnlockDay,
    diaryCanWrite: input.diaryCanWrite,
    isLocked,
    isSiteCompleted: input.isSiteCompleted,
  });
  const strip = stripValues(view, draftApi.draft, draftApi.isDirty);
  const submitState = buildSubmitState({
    submit: view.submit,
    unallocated: strip.unallocated,
    reason: draftApi.draft.reason,
    isDirty: draftApi.isDirty,
    isLocked,
    isForeman: access.isForeman,
  });
  return {
    headerSuffix: formatDayWeek(view.day_no, view.week_no) ?? undefined,
    // Karar 5 — kilit bandı durum satırında DEĞİL, `topBanner`da tam genişlik (İ:143-149).
    lock: isLocked ? { isLocked: true } : null,
    submitGate: submitState.gate,
    topBanner: topBannerFor(input, access),
    // S1 — çekirdeğin tek kayıt düğmesi önce dağıtımı yazar; hata çekirdek kaydını durdurur.
    onBeforeSave: () => saveAllocationIfDirty({ ...beforeSaveInput(input), canEdit: access.canEdit }),
    lineColumns: lineColumnsFor(input),
    itemMeta: {
      indirectItemIds: input.itemFacts.indirectItemIds,
      renderItemTag: (boqItemId) => input.itemFacts.contractorLabel(boqItemId),
    },
    // Karar 6 — fonksiyon: bloktaki "Gönder" düğmeleri çekirdeğin akışını çağırır.
    fullWidthBlock: (actions: DiaryCoreActions) => (
      <HourAllocationBlock
        siteId={input.siteId}
        day={input.day}
        view={view}
        codeTree={input.codeTree}
        bands={input.bands}
        access={access}
        draft={draftApi.draft}
        isDirty={draftApi.isDirty}
        invalidCount={draftApi.invalidCount}
        onDraftChange={draftApi.update}
        submitState={submitState}
        siteName={input.siteName}
        coreActions={actions}
      />
    ),
  };
}

/**
 * S3 · `topBanner` — İ:143-155 sırası: önce kilit bandı, sonra formen bandı.
 * Formen bandı kilitli günde zaten kapalıdır (`showForemanBand`), yani ikisi
 * birlikte basılmaz.
 */
function topBannerFor(input: BuildInput, access: AllocationAccess) {
  const { view } = input;
  if (view.lock.locked) {
    return <DayLockBanner siteId={input.siteId} day={input.day} lock={view.lock} canUnlock={access.canUnlock} />;
  }
  return access.showForemanBand ? <ForemanBand /> : undefined;
}

function beforeSaveInput({ draftApi, view, saveAllocation }: BuildInput) {
  return {
    isDirty: draftApi.isDirty,
    invalidCount: draftApi.invalidCount,
    buildBody: () => buildAllocationBody(draftApi.draft, view.rows),
    save: saveAllocation,
  };
}

function lineColumnsFor(input: BuildInput) {
  return buildLineColumns({
    lines: input.ctx.lines,
    progress: input.view.progress,
    index: buildCodeIndex(input.codeTree.data ?? []),
    bands: input.bands,
    budgetHref: input.budgetHref,
    revisionNumber: input.view.revision_number,
  });
}

/** K24 — ortak hâl kartı; sessiz boş blok yok. */
function DayLoadError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <ErrorCard
      title="Saat dağıtımı yüklenemedi"
      description="Planlama verisi alınamadı; günlük kaydı etkilenmez."
      onRetry={onRetry}
      retrying={retrying}
    />
  );
}
