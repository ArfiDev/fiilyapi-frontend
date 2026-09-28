"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { timesheetWeekQuery, type TimesheetCode } from "@/lib/api/hooks/useTimesheet";
import { useSaveTimesheetWeek } from "@/lib/api/hooks/useTimesheetMutations";
import { downloadTimesheetExport } from "@/lib/api/timesheet-client";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { isoWeekDates, mondayOfIsoWeek, shiftIsoWeek, type TimesheetIsoWeek } from "./iso-week";
import { buildCopyPreviousWeekDraft } from "./timesheet-copy";
import {
  buildWeekSaveBody,
  EMPTY_TIMESHEET_DRAFT,
  resolveCellSectionId,
  timesheetDraftKey,
  type TimesheetDraft,
  type TimesheetDraftCell,
} from "./timesheet-draft";
import {
  timesheetExportErrorMessage,
  timesheetLockConflictLocks,
  timesheetSaveErrorMessage,
} from "./timesheet-errors";
import {
  discardLockedDraft,
  lockConflictText,
  lockedCopyNotice,
  type TimesheetDayLock,
} from "./timesheet-lock";
import type { TimesheetSourcedCell } from "./week-derive";

export type TimesheetSaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "failed"; readonly message: string }
  /**
   * PLN-F2.4 · kilit 409'u (§3.14 P4, mockup (e)): kilitli günlerin taslağı
   * atıldı, kilitsiz günlerinki korundu. Metin `lockConflictText`ten.
   */
  | { readonly kind: "locked"; readonly title: string; readonly body: string };

export type TimesheetCopyState =
  | { readonly kind: "idle" }
  | { readonly kind: "copying" }
  | {
      readonly kind: "copied";
      readonly cellCount: number;
      /** Mockup (b) — kilitli gün atlandıysa bildirim; yoksa `null`. */
      readonly lockNotice: string | null;
    }
  | { readonly kind: "failed"; readonly message: string };

export interface TimesheetWeekEditorHandle {
  readonly draft: TimesheetDraft;
  readonly dirtyKeys: ReadonlySet<string>;
  readonly isDirty: boolean;
  readonly commitHours: (
    allCells: readonly TimesheetSourcedCell[],
    personnelId: string,
    workDate: string,
    hours: string | null,
  ) => void;
  readonly commitCode: (
    allCells: readonly TimesheetSourcedCell[],
    personnelId: string,
    workDate: string,
    code: TimesheetCode | null,
  ) => void;
  readonly save: (allCells: readonly TimesheetSourcedCell[]) => Promise<void>;
  readonly saveState: TimesheetSaveState;
  /** `lockedDays`: bu haftanın KİLİTLİ günleri — kopya onları ATLAR (§3.14 P2). */
  readonly copyPreviousWeek: (
    allCells: readonly TimesheetSourcedCell[],
    lockedDays: ReadonlySet<string>,
  ) => Promise<void>;
  readonly copyState: TimesheetCopyState;
  readonly exportExcel: (year: number, month: number) => Promise<void>;
  readonly isExporting: boolean;
  readonly exportError: string | null;
  /**
   * Kilit 409'unun getirdiği günler (bu şantiye+hafta kapsamında). Ekran
   * bunları sunucunun `locked_days`iyle BİRLEŞTİRİR — gün, yeniden yükleme
   * beklemeden salt okunur olur (§3.14 P4).
   */
  readonly conflictLocks: readonly TimesheetDayLock[];
}

export interface UseTimesheetWeekEditorInput {
  siteId: string;
  week: TimesheetIsoWeek;
  /** Aktif bölüm filtresi — YALNIZ YENİ hücrenin bölümünü belirler. */
  sectionId: string | null;
}

/**
 * Haftalık puantajın düzenleme + kaydetme + kopyalama + dışa aktarma kolu.
 *
 * ⚠️ `save` gövdeyi ÇAĞIRANDAN gelen `allCells` üzerinden kurar — yani
 * `TimesheetWeekDerived.allCells` (şantiyenin o haftaya ait süzgeçsiz TAM
 * kümesi + taslak). Süzülmüş `rows` bu yola HİÇ girmez; girseydi bölüm
 * filtresi açıkken kaydeden kullanıcı diğer bölümlerin haftasını silerdi.
 */
export function useTimesheetWeekEditor({
  siteId,
  week,
  sectionId,
}: UseTimesheetWeekEditorInput): TimesheetWeekEditorHandle {
  const queryClient = useQueryClient();
  const saveMutation = useSaveTimesheetWeek(siteId, {
    isoYear: week.isoYear,
    isoWeek: week.isoWeek,
  });
  const [exportState, setExportState] = useState<{ isExporting: boolean; error: string | null }>({
    isExporting: false,
    error: null,
  });

  /**
   * Taslak, ait olduğu KAPSAMLA saklanır: şantiye ya da hafta değişince render
   * sırasında düşer. Efektle sıfırlamak bir kare boyunca BAŞKA haftanın
   * taslağını gösterirdi — ve o taslak kaydedilirse backend 422 verirdi
   * (hücre istenen haftanın dışında).
   */
  const scope = `${siteId}|${week.isoYear}|${week.isoWeek}`;
  const [stored, setStored] = useState<{ scope: string; draft: TimesheetDraft }>({
    scope,
    draft: EMPTY_TIMESHEET_DRAFT,
  });
  const draft = stored.scope === scope ? stored.draft : EMPTY_TIMESHEET_DRAFT;
  // Kilit 409'unun günleri taslakla AYNI kapsam kuralıyla saklanır.
  const [storedLocks, setStoredLocks] = useState<{
    scope: string;
    locks: readonly TimesheetDayLock[];
  }>({ scope, locks: [] });
  const conflictLocks = storedLocks.scope === scope ? storedLocks.locks : NO_LOCKS;
  /**
   * Kaydetme durumu (özellikle "locked" hata bandı) da taslak/kilitlerle AYNI
   * kapsam kuralıyla saklanır: şantiye ya da hafta değişince bant düşer.
   * Aksi hâlde bir haftada oluşan kilit hatası, kullanıcı başka haftaya
   * geçtiğinde de görünmeye devam ederdi (madde 6).
   */
  const [storedSaveState, setStoredSaveState] = useState<{
    scope: string;
    state: TimesheetSaveState;
  }>({ scope, state: { kind: "idle" } });
  const saveState = storedSaveState.scope === scope ? storedSaveState.state : IDLE_SAVE_STATE;
  const setSaveState = useCallback(
    (state: TimesheetSaveState) => {
      setStoredSaveState({ scope, state });
    },
    [scope],
  );
  /**
   * "Önceki Haftayı Kopyala" bildirimi (`copied`/`failed`) de AYNI kapsam
   * kuralıyla saklanır: şantiye ya da hafta değişince bant düşer. Aksi hâlde
   * bir haftada oluşan "kopyalandı"/hata bildirimi, kullanıcı başka haftaya
   * geçtiğinde de görünmeye devam ederdi (madde 6, `copyState` kısmı).
   */
  const [storedCopyState, setStoredCopyState] = useState<{
    scope: string;
    state: TimesheetCopyState;
  }>({ scope, state: { kind: "idle" } });
  const copyState = storedCopyState.scope === scope ? storedCopyState.state : IDLE_COPY_STATE;
  const setCopyState = useCallback(
    (state: TimesheetCopyState) => {
      setStoredCopyState({ scope, state });
    },
    [scope],
  );
  const dirtyKeys = useMemo(() => new Set(Object.keys(draft)), [draft]);

  const writeDraft = useCallback(
    (entries: Record<string, TimesheetDraftCell | null>) => {
      setStored((previous) => ({
        scope,
        draft: { ...(previous.scope === scope ? previous.draft : {}), ...entries },
      }));
      setSaveState({ kind: "idle" });
    },
    [scope, setSaveState],
  );

  const commitHours = useCallback(
    (
      allCells: readonly TimesheetSourcedCell[],
      personnelId: string,
      workDate: string,
      hours: string | null,
    ) => {
      writeDraft({
        [timesheetDraftKey(personnelId, workDate)]: {
          hours,
          // 🔴 SAAT XOR KOD: saat yazmak kodu DÜŞÜRÜR.
          code: null,
          sectionId: resolveCellSectionId(allCells, personnelId, workDate, sectionId),
        },
      });
    },
    [sectionId, writeDraft],
  );

  const commitCode = useCallback(
    (
      allCells: readonly TimesheetSourcedCell[],
      personnelId: string,
      workDate: string,
      code: TimesheetCode | null,
    ) => {
      writeDraft({
        [timesheetDraftKey(personnelId, workDate)]: {
          // Kod seçmek saati DÜŞÜRÜR; "Saate dön" (code === null) hücreyi boşaltır.
          hours: null,
          code,
          sectionId: resolveCellSectionId(allCells, personnelId, workDate, sectionId),
        },
      });
    },
    [sectionId, writeDraft],
  );

  const save = useCallback(
    async (allCells: readonly TimesheetSourcedCell[]) => {
      setSaveState({ kind: "saving" });
      try {
        await saveMutation.mutateAsync(buildWeekSaveBody(allCells));
        // Taslak ancak sunucu YAZDIKTAN sonra düşer; hata hâlinde kullanıcı
        // yazdıklarını kaybetmez.
        setStored({ scope, draft: EMPTY_TIMESHEET_DRAFT });
        setSaveState({ kind: "saved" });
      } catch (error) {
        const locks = timesheetLockConflictLocks(error);
        if (locks === null) {
          setSaveState({ kind: "failed", message: timesheetSaveErrorMessage(error) });
          return;
        }
        // §3.14 P4 — kilitli günlerin taslağı ATILIR (hücre sunucu değerine
        // döner), kilitsiz günlerin taslağı KORUNUR; kullanıcı yeniden gönderir.
        const lockedSet = new Set(locks.map((lock) => lock.day));
        const { discardedDays } = discardLockedDraft(draft, lockedSet);
        setStored((previous) => ({
          scope,
          draft: discardLockedDraft(
            previous.scope === scope ? previous.draft : EMPTY_TIMESHEET_DRAFT,
            lockedSet,
          ).draft,
        }));
        setStoredLocks((previous) => ({
          scope,
          locks: [...(previous.scope === scope ? previous.locks : []), ...locks],
        }));
        // Atılan gün yoksa (taslakta kilitli gün yoktu) 409'un günleri söylenir.
        const discardedSet = new Set(discardedDays);
        const reported = discardedDays.length > 0
          ? locks.filter((lock) => discardedSet.has(lock.day))
          : locks;
        setSaveState({ kind: "locked", ...lockConflictText(reported) });
        // Sunucunun `locked_days`i esas: hafta yeniden çekilir.
        void queryClient.invalidateQueries({
          queryKey: timesheetWeekQuery(siteId, week).queryKey,
        });
      }
    },
    [draft, queryClient, saveMutation, scope, setSaveState, siteId, week],
  );

  /**
   * "Önceki Haftayı Kopyala" (E5 75) — İSTEMCİ TARAFINDADIR (uç docstring'i).
   *
   * Bir önceki ISO haftası AYNI uçtan (süzgeçsiz) çekilir ve hücreler AYNI
   * HAFTA GÜNÜNE taşınır. Sonuç TASLAĞA yazılır, doğrudan kaydedilmez:
   * kullanıcı kaydetmeden önce ne geleceğini görür ve vazgeçebilir.
   *
   * 🔴 KOPYA DEĞİŞTİRMEDİR: bu haftanın var olan hücreleri, önceki haftada
   * karşılığı OLMAYAN günlerde de TEMİZLENİR — aksi hâlde "geçen haftanın
   * aynısı" düğmesi iki haftanın KARIŞIMINI üretirdi ve kullanıcı hangi
   * sayının nereden geldiğini bilemezdi.
   */
  const copyPreviousWeek = useCallback(
    async (allCells: readonly TimesheetSourcedCell[], lockedDays: ReadonlySet<string>) => {
      setCopyState({ kind: "copying" });
      try {
        const previous = shiftIsoWeek(week, -1);
        const data = await queryClient.fetchQuery(timesheetWeekQuery(siteId, previous));
        const { entries, cellCount } = buildCopyPreviousWeekDraft({
          allCells,
          previous: data,
          targetMonday: mondayOfIsoWeek(week.isoYear, week.isoWeek),
          lockedDays,
        });
        writeDraft(entries);
        setCopyState({
          kind: "copied",
          cellCount,
          lockNotice: lockedCopyNotice({
            lockedDays: [...lockedDays],
            weekDays: isoWeekDates(week),
            sourceIsoWeek: previous.isoWeek,
          }),
        });
      } catch (error) {
        setCopyState({ kind: "failed", message: timesheetSaveErrorMessage(error) });
      }
    },
    [queryClient, setCopyState, siteId, week, writeDraft],
  );

  const exportExcel = useCallback(
    async (year: number, month: number) => {
      setExportState({ isExporting: true, error: null });
      try {
        // ⚠️ K2'NİN İSTİSNASI: dosyayı SUNUCU üretir, bu yüzden bölüm süzgeci
        // SUNUCUYA geçirilir — dosya ekranda görülenle aynı kapsamı taşısın.
        // (Kaydetmede bunun tam TERSİ geçerlidir.)
        // 🔴 Dışa aktarım AYLIKTIR (uç `export.xlsx?year&month`); ay bilgisi
        // hafta yanıtının `month_year`/`month_month` alanlarından gelir.
        await downloadTimesheetExport(siteId, {
          year,
          month,
          ...(sectionId !== null ? { sectionId } : {}),
        });
        setExportState({ isExporting: false, error: null });
      } catch (error) {
        setExportState({ isExporting: false, error: timesheetExportErrorMessage(error) });
      }
    },
    [sectionId, siteId],
  );

  useUnsavedChanges(dirtyKeys.size > 0, "Puantaj");

  return {
    draft,
    dirtyKeys,
    isDirty: dirtyKeys.size > 0,
    commitHours,
    commitCode,
    save,
    saveState,
    copyPreviousWeek,
    copyState,
    exportExcel,
    isExporting: exportState.isExporting,
    exportError: exportState.error,
    conflictLocks,
  };
}

const NO_LOCKS: readonly TimesheetDayLock[] = [];
const IDLE_SAVE_STATE: TimesheetSaveState = { kind: "idle" };
const IDLE_COPY_STATE: TimesheetCopyState = { kind: "idle" };
