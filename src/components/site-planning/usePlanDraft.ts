"use client";

import { useEffect, useReducer, useRef, type Dispatch } from "react";

import type { SitePlanWeek } from "@/lib/api/hooks/useSitePlan";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { emptyPlanDraft, isPlanDraftDirty, type PlanDraft } from "./plan-draft";
import { planDraftReducer, type PlanDraftAction } from "./plan-draft-reducer";

export interface PlanDraftHandle {
  readonly draft: PlanDraft;
  readonly dispatch: Dispatch<PlanDraftAction>;
  readonly isDirty: boolean;
}

/**
 * Sunucu verisi + yerel taslağın birlikte yaşaması (F-PL T3).
 *
 * KURAL: taslak, KİRLİ DEĞİLKEN her yeni sunucu yanıtından yeniden kurulur
 * (hafta değişimi, kaydetme sonrası invalidate, arka plan tazelemesi). Kirliyken
 * KURULMAZ — kullanıcının yazdığı üstüne yazılamaz. Kaydetme başarılı olunca
 * kirlilik düşer, bir sonraki yanıt taslağı sunucu gerçeğiyle eşitler.
 */
export function usePlanDraft(plan: SitePlanWeek | undefined, weekStart: string): PlanDraftHandle {
  const [draft, dispatch] = useReducer(planDraftReducer, weekStart, emptyPlanDraft);
  // Taslağın kurulduğu KAYNAK yanıt. Kimlik karşılaştırması, aynı yanıt için
  // effect'in kendini tetiklemesini keser (sonsuz reset döngüsü tuzağı).
  const sourceRef = useRef<SitePlanWeek | null>(null);

  useEffect(() => {
    if (plan === undefined || plan === sourceRef.current) return;
    // Hafta değiştiyse kirlilik KORUNMAZ: hücreler hafta kapsamlıdır, başka
    // haftanın taslağını yeni haftanın ızgarasında tutmak yanlış veri gösterir
    // (ve o gövde 422 alırdı).
    const isSameWeek = plan.week_start === draft.weekStart;
    if (isSameWeek && isPlanDraftDirty(draft)) return;
    sourceRef.current = plan;
    dispatch({ type: "reset", plan });
  }, [plan, draft]);

  useUnsavedChanges(isPlanDraftDirty(draft), "Şantiye planlaması");

  return { draft, dispatch, isDirty: isPlanDraftDirty(draft) };
}
