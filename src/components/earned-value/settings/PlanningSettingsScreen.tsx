"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SettingsHeader } from "@/components/settings/shell/SettingsHeader";
import { ErrorCard, Skeleton, SkeletonBlock } from "@/components/earned-value/common/state";
import { useEvSettings, useEvSiteOptions } from "@/lib/api/hooks/useEvSettings";
import { isLoaded } from "@/lib/api/query-state";
import { isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EV_SETTINGS_EDIT, EV_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { PlanningSettingsForm } from "./PlanningSettingsForm";
import { SiteSelect } from "./SiteSelect";
import "./planning-settings.css";

/**
 * PLN-F1.4 · Ayarlar > Planlama — `projedesign/Ayarlar - Planlama.dc.html`
 * (AYP) + `Ayarlar - Planlama (Ek).dc.html` (Ek; §3.10 düzeltmeleri uygulanmış).
 * SORU kutusu, TÜRETİLMİŞ bandı, varyant/"Göster" düğmeleri ve Roller kartı
 * (K17) uygulamaya GİRMEZ; tatil kural oluşturucusu yok (S5).
 *
 * K1: ayarlar ŞANTİYE kapsamlıdır; sayfa kendi seçicisini taşır, seçim
 * `?site=` (`GeneralSiteDiaryView` deseni: yol elle kurulmaz, çözülen şantiye
 * adrese geri yazılır). İzin: `earned_value` ≥ draft düzenler, view salt okur
 * (B1-8); tamamlanmış şantiye yetkiden bağımsız salt okunur (F0-8).
 */
const SITE_PARAM = "site";
/** İskelet: kart ızgarası (Ek:107) yerinde dört boş kart. */
const SKELETON_CARD_HEIGHT = 220;
const SKELETON_CARD_COUNT = 4;

function SettingsSkeleton() {
  return (
    <Skeleton label="Planlama ayarları yükleniyor" className="ev-settings__grid">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <SkeletonBlock key={index} height={SKELETON_CARD_HEIGHT} variant="outlined" />
      ))}
    </Skeleton>
  );
}

export function PlanningSettingsScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const permission = useModulePermission("earned_value");
  const canViewEv = useButtonGate({ pages: EV_VIEW, need: "view", fallback: permission.level !== "none" });
  // IZN-F2.x · planlama ayarı kaydet = ayarlar.planlama/adam-saat bütçesi Düzenler (VEYA).
  const canEditSettings = useButtonGate({ pages: EV_SETTINGS_EDIT, need: "edit", fallback: hasAtLeast(permission.level, "draft") });
  const siteOptions = useEvSiteOptions();

  // Seçili şantiye URL'den; yoksa (ya da tanınmıyorsa) ilk DEVAM EDEN şantiye —
  // tamamlanmış şantiye salt okunur açılır (F0-8), varsayılan olarak seçilmez.
  const siteParam = searchParams.get(SITE_PARAM);
  const selected =
    siteOptions.options.find((option) => option.siteId === siteParam) ??
    siteOptions.options.find((option) => !option.isCompleted) ??
    siteOptions.options[0];
  const siteId = selected?.siteId ?? "";

  const settingsQuery = useEvSettings(siteId);

  function pushSite(nextSiteId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(SITE_PARAM, nextSiteId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Adres ile ekran çelişmez: çözülen şantiye `?site=`e geri yazılır
  // (`GeneralSiteDiaryView` kanonu — paylaşılan bağlantı aynı şantiyeyi açar).
  useEffect(() => {
    if (selected === undefined || siteParam === selected.siteId) return;
    pushSite(selected.siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.siteId, siteParam]);

  const header = (
    <SettingsHeader
      title="Planlama Ayarları"
      subtitle="Adam-saat planlama ve ilerleme modülünün şantiye takvimi, eşikleri ve paçal metrikleri"
    />
  );

  if (!canViewEv || isForbidden(settingsQuery.error)) {
    return (
      <div className="ev-settings">
        {header}
        <AccessDenied />
      </div>
    );
  }

  const plainSelect = (
    <SiteSelect
      groups={siteOptions.groups}
      value={siteId}
      onSelect={pushSite}
      isLoading={siteOptions.isLoading}
      isError={siteOptions.isError}
    />
  );

  function body() {
    if (selected === undefined) {
      return siteOptions.isLoading ? <SettingsSkeleton /> : plainSelect;
    }
    if (settingsQuery.isError) {
      return (
        <>
          {plainSelect}
          <ErrorCard
            title="Planlama ayarları yüklenemedi"
            description="Şantiyenin takvim, eşik ve paçal ayarları alınamadı."
            onRetry={() => void settingsQuery.refetch()}
            retrying={settingsQuery.isFetching}
          />
        </>
      );
    }
    if (!isLoaded(settingsQuery) || settingsQuery.data === undefined) {
      return (
        <>
          {plainSelect}
          <SettingsSkeleton />
        </>
      );
    }
    return (
      <PlanningSettingsForm
        key={selected.siteId}
        site={selected}
        siteGroups={siteOptions.groups}
        siteOptions={siteOptions.options}
        settings={settingsQuery.data}
        canEdit={canEditSettings}
        onSiteChange={pushSite}
      />
    );
  }

  return (
    <div className="ev-settings">
      {header}
      {body()}
    </div>
  );
}
