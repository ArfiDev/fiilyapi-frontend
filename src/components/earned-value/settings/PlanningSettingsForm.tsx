"use client";

import { useEffect, useMemo, useState } from "react";

import { ErrorCard, ReadOnlyStrip } from "@/components/earned-value/common/state";
import { useBoq } from "@/lib/api/hooks/useBoq";
import {
  useSaveEvSettings,
  type EvSiteGroup,
  type EvSiteOption,
} from "@/lib/api/hooks/useEvSettings";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { EvSettingsRead } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { CalendarCard } from "./CalendarCard";
import { HolidaysCard } from "./HolidaysCard";
import { PacalMetricsCard } from "./PacalMetricsCard";
import { PfBandsCard } from "./PfBandsCard";
import { SaveBar, type SaveBarState } from "./SaveBar";
import { SiteSelect } from "./SiteSelect";
import { ToleranceCard } from "./ToleranceCard";
import { UnsavedChangesModal } from "./UnsavedChangesModal";
import {
  buildSavePayload,
  changedSections,
  draftFromSettings,
  nextDraftKey,
  pfBandSettingsFromDraft,
  validateDraft,
  type SettingsDraft,
} from "./settings-form";

/** Ek:499 — "Kaydedildi …" metninin çubukta kalma süresi. */
const SAVED_TOAST_MS = 2600;

/** Ek:489 — salt okunur şeridinin iki metni (F0-8 tamamlanmış · B1-8 yetki). */
const READ_ONLY_COMPLETED = "Tamamlanmış şantiye · ayarlar salt okunur. Şantiye seçici açık kalır.";
const READ_ONLY_PERMISSION =
  "Planlama ayarlarını değiştirmek için Planlama (earned_value) modülünde taslak yetkisi gerekir. Şantiye seçici açık kalır.";

export interface PlanningSettingsFormProps {
  site: EvSiteOption;
  siteGroups: readonly EvSiteGroup[];
  siteOptions: readonly EvSiteOption[];
  settings: EvSettingsRead;
  /** `earned_value` ≥ draft (B1-8). */
  canEdit: boolean;
  onSiteChange: (siteId: string) => void;
}

/**
 * Yüklenmiş ayarlar üstündeki düzenleme formu — şantiye başına MONTE edilir
 * (çağıran `key={siteId}` verir: şantiye değişince taslak sızmaz).
 *
 * Taslak `useState` başlatıcısıyla KURULUR (efektle doldurulmaz). Sunucu değeri
 * sonradan değişirse (arka plan tazelemesi) ve taslak TEMİZSE render sırasında
 * senkronlanır (`useSyncedFieldState` kanonu); kirli taslak ezilmez.
 */
export function PlanningSettingsForm({
  site,
  siteGroups,
  siteOptions,
  settings,
  canEdit,
  onSiteChange,
}: PlanningSettingsFormProps) {
  const readOnly = !canEdit || site.isCompleted;
  const [baseline, setBaseline] = useState<SettingsDraft>(() => draftFromSettings(settings));
  const [draft, setDraft] = useState<SettingsDraft>(baseline);
  const [syncedSettings, setSyncedSettings] = useState(settings);
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [pendingSite, setPendingSite] = useState<EvSiteOption | null>(null);
  const [today] = useState(() => new Date());

  const save = useSaveEvSettings(site.siteId);
  const boq = useBoq(site.siteId);
  const boqItems = useMemo(
    () => (boq.data?.groups ?? []).flatMap((group) => group.items),
    [boq.data],
  );

  const sections = changedSections(baseline, draft);
  useUnsavedChanges(sections.length > 0, "Planlama ayarları");
  if (settings !== syncedSettings) {
    setSyncedSettings(settings);
    if (sections.length === 0) {
      const next = draftFromSettings(settings);
      setBaseline(next);
      setDraft(next);
    }
  }

  useEffect(() => {
    if (!isSavedToast) return;
    const timer = setTimeout(() => setIsSavedToast(false), SAVED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [isSavedToast]);

  const validation = useMemo(() => validateDraft(draft), [draft]);

  function update(patch: Partial<SettingsDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setIsSavedToast(false);
  }

  function updateBands(kind: "daily" | "weekly", field: string, text: string) {
    setDraft((current) => ({
      ...current,
      bands: { ...current.bands, [kind]: { ...current.bands[kind], [field]: text } },
    }));
    setIsSavedToast(false);
  }

  function handleSave() {
    if (readOnly || validation.hasErrors || sections.length === 0) return;
    setSaveError(null);
    save.mutate(buildSavePayload(draft), {
      onSuccess: (saved) => {
        const next = draftFromSettings(saved);
        setSyncedSettings(saved);
        setBaseline(next);
        setDraft(next);
        setIsSavedToast(true);
      },
      onError: (error) => setSaveError(error),
    });
  }

  function handleReset() {
    setDraft(baseline);
    setSaveError(null);
  }

  function requestSite(siteId: string) {
    if (siteId === site.siteId) return;
    const target = siteOptions.find((option) => option.siteId === siteId);
    if (target === undefined) return;
    // Ek:474 `pick` — değişiklik varsa ve düzenlenebilirse önce uyarı.
    if (sections.length > 0 && !readOnly) {
      setPendingSite(target);
      return;
    }
    onSiteChange(siteId);
  }

  const barState: SaveBarState = isSavedToast
    ? "saved"
    : validation.hasErrors
      ? "invalid"
      : sections.length > 0
        ? "dirty"
        : "clean";

  return (
    <>
      <SiteSelect
        groups={siteGroups}
        value={site.siteId}
        onSelect={requestSite}
        isLoading={false}
        isError={false}
      />
      {readOnly && (
        // Ek:95-104 — "Düzenleme görünümüne dön" düğmesi YOK (Ek:489 roExit yalnız demo).
        <ReadOnlyStrip variant="banner" lead="Salt okunur.">
          {site.isCompleted ? READ_ONLY_COMPLETED : READ_ONLY_PERMISSION}
        </ReadOnlyStrip>
      )}
      {saveError != null && (
        // K24 — AYP kayıt hatası çizilmemiş hâldir; ortak hâl kartı.
        <ErrorCard
          title="Ayarlar kaydedilemedi"
          description={backendErrorMessage(saveError)}
          onRetry={handleSave}
          retrying={save.isPending}
        />
      )}
      {/* Ek:107 — kart ızgarası */}
      <div className="ev-settings__grid">
        <CalendarCard
          weekStartDow={draft.weekStartDow}
          weeklyOffDays={draft.weeklyOffDays}
          standardDailyHours={draft.standardDailyHours}
          hoursInvalid={validation.standardDailyHours}
          offDaysInvalid={validation.weeklyOffDays}
          disabled={readOnly}
          today={today}
          onWeekStartChange={(weekStartDow) => update({ weekStartDow })}
          onOffDaysChange={(weeklyOffDays) => update({ weeklyOffDays })}
          onHoursChange={(standardDailyHours) => update({ standardDailyHours })}
        />
        <HolidaysCard
          holidays={draft.holidays}
          weeklyOffDays={draft.weeklyOffDays}
          invalidKeys={validation.invalidHolidayKeys}
          disabled={readOnly}
          onChange={(key, patch) =>
            update({
              holidays: draft.holidays.map((holiday) =>
                holiday.key === key ? { ...holiday, ...patch } : holiday,
              ),
            })
          }
          onRemove={(key) =>
            update({ holidays: draft.holidays.filter((holiday) => holiday.key !== key) })
          }
          onAdd={() =>
            update({
              holidays: [...draft.holidays, { key: nextDraftKey("holiday"), dates: "", note: "" }],
            })
          }
        />
        <ToleranceCard
          tolerancePoints={draft.tolerancePoints}
          invalid={validation.tolerancePoints}
          disabled={readOnly}
          onChange={(tolerancePoints) => update({ tolerancePoints })}
        />
        <PfBandsCard
          bands={draft.bands}
          validation={validation}
          dailySettings={pfBandSettingsFromDraft(draft, "daily")}
          weeklySettings={pfBandSettingsFromDraft(draft, "weekly")}
          disabled={readOnly}
          onDailyChange={(field, text) => updateBands("daily", field, text)}
          onWeeklyChange={(field, text) => updateBands("weekly", field, text)}
        />
        <PacalMetricsCard
          metrics={draft.metrics}
          boqItems={boqItems}
          disabled={readOnly}
          onChange={(metrics) => update({ metrics })}
        />
      </div>
      {!readOnly && (
        <SaveBar
          state={barState}
          siteName={site.siteName}
          changeCount={sections.length}
          isSaving={save.isPending}
          onReset={handleReset}
          onSave={handleSave}
        />
      )}
      {pendingSite && (
        <UnsavedChangesModal
          fromSiteName={site.siteName}
          toSiteName={pendingSite.siteName}
          sections={sections}
          onCancel={() => setPendingSite(null)}
          onDiscard={() => {
            const target = pendingSite.siteId;
            setPendingSite(null);
            onSiteChange(target);
          }}
        />
      )}
    </>
  );
}
