"use client";

import { ErrorCard } from "@/components/earned-value/common/state";
import type { DiaryDetailContext, DiaryDetailExtension } from "@/components/site-diary-detail/detail-extension";
import { useEvBudget, useEvBudgetRevisions } from "@/lib/api/hooks/useEvBudget";
import { useEvCodeTree, useEvDay } from "@/lib/api/hooks/useEvDay";
import { useEvSettings } from "@/lib/api/hooks/useEvSettings";
import type { EvSettingsRead } from "@/lib/api/models";
import { BackendError } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EV_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { DEFAULT_PF_BANDS, type PfBandSettings } from "@/lib/earned-value";

import { buildCodeIndex } from "../diary/code-tree";
import { activeRevisionId, buildItemFacts } from "../diary/item-meta";
import { buildDetailExtension, PlanningHiddenNotice } from "./detail-extension-builder";

/** Şantiyede planlama YOK sayılan yanıtlar: görünmüyor (404) / baseline yok (409) → uzantı yok (hâl h). */
const ABSENT_STATUSES = new Set([404, 409]);
/** Planlama izni yok (hâl i) — yalnız şerit. */
const FORBIDDEN_STATUS = 403;

/**
 * DET-1.3 · Çekirdeğin bildirdiği bağlamdan (`onExtensionContext`) detay
 * yuvalarını kurar (emsal: `diary/useDiaryProgressExtension`).
 *
 *   - bağlam yok / baseline yok / gün 404-409 → `undefined` (çekirdek kartlar tam);
 *   - `earned_value` izni `none` ya da gün 403 → yalnız "Planlama sütunları gizli" şeridi;
 *   - gün başka hatayla düşerse → yalnız Saat Dağıtımı yerinde küçük hata kartı (hâl g);
 *   - aksi hâlde kolonlar + KPI'lar + "Gün n · Hn" + Saat Dağıtımı özeti.
 */
export function useDiaryDetailExtension(ctx: DiaryDetailContext | null): DiaryDetailExtension | undefined {
  const evPermission = useModulePermission("earned_value");
  const canViewEv = useButtonGate({ pages: EV_VIEW, need: "view", fallback: evPermission.canView });
  const siteId = canViewEv ? (ctx?.siteId ?? "") : "";
  const day = ctx?.day ?? "";
  const dayQuery = useEvDay(siteId, day);
  const hasBaseline = dayQuery.data?.has_baseline === true;
  const activeSite = hasBaseline ? siteId : "";
  const codeTree = useEvCodeTree(activeSite, hasBaseline);
  const settings = useEvSettings(activeSite);
  // Kalem kendi/taşeron etiketi (İ:225) → AKTİF baseline'ın bütçe görünümü.
  const activeRevision = activeRevisionId(useEvBudgetRevisions(activeSite).data);
  const budget = useEvBudget(activeRevision === null ? "" : activeSite, activeRevision);

  if (ctx === null) return undefined;
  if (!canViewEv) return { linesNotice: <PlanningHiddenNotice /> };
  if (dayQuery.isError) {
    const status = dayQuery.error instanceof BackendError ? dayQuery.error.status : null;
    if (status === FORBIDDEN_STATUS) return { linesNotice: <PlanningHiddenNotice /> };
    if (status !== null && ABSENT_STATUSES.has(status)) return undefined;
    return { fullWidthBlock: <DayLoadError onRetry={() => void dayQuery.refetch()} retrying={dayQuery.isFetching} /> };
  }
  if (dayQuery.data === undefined || !hasBaseline) return undefined;
  return buildDetailExtension({
    ctx,
    view: dayQuery.data,
    index: buildCodeIndex(codeTree.data ?? []),
    bands: bandsFrom(settings.data),
    itemFacts: buildItemFacts(budget.data),
  });
}

/** Şantiyenin PF eşikleri (Ayarlar > Planlama); gelmediyse varsayılan bantlar. */
function bandsFrom(settings: EvSettingsRead | undefined): PfBandSettings {
  if (settings === undefined) return DEFAULT_PF_BANDS;
  const { daily, weekly } = settings.pf_bands;
  return {
    daily: { redBelow: daily.red_below, greenFrom: daily.green_from, highAbove: daily.high_above },
    weekly: { redBelow: weekly.red_below, greenFrom: weekly.green_from },
  };
}

/** Hâl (g) — sayfa açılır; planlama kartı yerinde küçük hata kartı. */
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
