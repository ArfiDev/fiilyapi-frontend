"use client";

import { useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { DiaryModeSwitch } from "@/components/site-diary/DiaryModeSwitch";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { Button } from "@/components/ui/button/Button";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSitePlan } from "@/lib/api/hooks/useSitePlan";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { SITE_DIARY_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { planSectionsState } from "./plan-sections";
import { PlanAddRowButton } from "./PlanAddRowButton";
import { PlanGoalsCard } from "./PlanGoalsCard";
import { PlanGrid } from "./PlanGrid";
import { PlanMaterialsCard } from "./PlanMaterialsCard";
import { PlanSaveStatus } from "./PlanSaveStatus";
import { PlanViewModeNotice, PlanViewModeSwitch } from "./PlanViewModeSwitch";
import { PlanWeekNav } from "./PlanWeekNav";
import { usePlanDraft } from "./usePlanDraft";
import { usePlanSave } from "./usePlanSave";
import { addDaysIso, resolveWeekStart, weekEndOf } from "./week";
import "@/components/site-detail/site-detail.css";
import "@/components/site-diary/site-diary.css";
import "./site-planning.css";
import { routes } from "@/lib/routes";

/**
 * Şantiye Planlama ekranı — mockup `Şantiye - Planlama.dc.html` (P, kanonik).
 * Parantez/yorum içindeki sayılar o dosyanın SATIR numaralarıdır.
 *
 * Rota: `.../santiyeler/[siteId]/gunluk-kayit/planlama`. Sayfa KENDİ
 * LAYOUT'UNU KURMAZ — drill sidebar `[projectId]/layout.tsx`ten gelir
 * (`gunluk-kayit/ozet` ile birebir aynı desen).
 *
 * DÜZENLEME (F-PL T3): ızgara/hedefler/sprint YEREL TASLAKTA (`usePlanDraft`)
 * yaşar, "Kaydet" dört PUT'u SIRALI yazar (`usePlanSave`). Yazma izni olmayan
 * kullanıcıda tüm giriş yüzeyleri GİZLENMEZ, devre-dışı basılır.
 *
 * ONAYLI SAPMA (kabuk): P'nin kendi sol menüsü "Planlama"yı ayrı bir sidebar
 * öğesi yapar; bu repoda şantiyenin 7 sekmesi tek kaynaktır (F3/F-SD kanonu)
 * ve Planlama, "Günlük Kayıt" sekmesinin bir alt görünümüdür — kardeşi
 * "Hakediş Özeti" gibi. Bu yüzden sekme şeridi korunur, mod anahtarı ikisini
 * birbirine bağlar.
 *
 * Hafta durumu URL'dedir (`?week=YYYY-MM-DD`) — bağlantı paylaşılabilir olsun;
 * parametresiz varsayılan İÇİNDE BULUNULAN haftadır (mockup'ın "21 – 27
 * Temmuz 2026" sabiti kopyalanmaz — tarih artefaktı istisnası).
 */
export function SitePlanningView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 🔴 URL-3 — rota parametreleri "slug VEYA UUID"dur; ADRES anahtarlaridir.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();

  const permission = useModulePermission("site_diary");
  // IZN-F2.x · plan kaydet = santiye.gunluk_planlama/günlük kayıt Düzenler (VEYA).
  const canWritePlan = useButtonGate({ pages: SITE_DIARY_EDIT, need: "edit", fallback: permission.canWrite });
  const weekStart = resolveWeekStart(searchParams.get("week"));
  // 🔴 URL-3 — bu ekranin cozumleme kaynagi YOKTU (tek `useSite` cagirmayan
  // santiye ekraniydi). Slug'li adreste `useSitePlan`/`useSiteSections`/dort
  // PUT'un HEPSI UUID bekledigi icin anahtar burada cozulmek ZORUNDA.
  // Ek istek degil, onbellek paylasimi: ayni anahtar santiye detayindan
  // zaten cekilmis olur.
  const siteQuery = useSite(siteKey, { project: projectKey });
  const siteId = siteQuery.data?.id ?? "";
  const planQuery = useSitePlan(siteId, weekStart);
  // Bölüm listesi ızgaradan DEĞİL şantiyeden gelir: ızgaranın grupları yalnız
  // mevcut satırlardan türer, henüz satırı olmayan bölüm orada görünmez (T5).
  const sectionsQuery = useSiteSections(siteId);
  // Taslak/kaydetme hook'ları erken dönüşlerin ÜSTÜNDE: kanca sırası her
  // render'da aynı kalmalı (izin dalı hook atlatamaz).
  const { draft, dispatch, isDirty } = usePlanDraft(planQuery.data, weekStart);
  const saveHandle = usePlanSave(siteId, weekStart, dispatch);
  // Onay bekleyen hafta kaydırması (gün farkı); `null` = bekleyen yok.
  const [pendingWeekShift, setPendingWeekShift] = useState<number | null>(null);

  if (!permission.canView) return <AccessDenied />;
  if (isForbidden(planQuery.error) || isForbidden(siteQuery.error)) return <AccessDenied />;
  // 🔴 Şantiye çözülemezse (404/ağ) `siteId` boş kalır ve `planQuery`/
  // `sectionsQuery` `enabled:false` ile sessizce idle'da durur — hiçbir hata
  // basılmadan boş ızgara görünürdü. planQuery kontrolünden ÖNCE kontrol
  // edilir, yoksa siteId boşken bu dal hiç tetiklenmez.
  if (siteQuery.isError) return <p className="plan__message">Şantiye yüklenemedi</p>;

  const plan = planQuery.data;
  const base = routes.projects.sites.detail({ projectId: projectKey, siteId: siteKey });
  const canSave = canWritePlan && isDirty && !saveHandle.isSaving;
  const sections = planSectionsState(
    sectionsQuery.data,
    sectionsQuery.isLoading,
    sectionsQuery.isError,
  );

  /** `‹`/`›` — hafta URL'de taşınır; `replace` geçmişi hafta hafta şişirmez. */
  function shiftWeek(deltaDays: number) {
    router.replace(`${pathname}?week=${addDaysIso(weekStart, deltaDays)}`, { scroll: false });
  }

  /**
   * KORKULUK: hafta değişince `usePlanDraft` taslağı BİLEREK sıfırlar (hücreler
   * hafta kapsamlıdır); yani kirli taslakla hafta kaydırmak kaydedilmemiş işi
   * ATAR. Kayıp sessiz olamaz — kirliyken önce onay istenir, reddedilirse
   * `router.replace` HİÇ çağrılmaz. Temiz taslakta kapı yoktur.
   */
  function handleShiftWeek(deltaDays: number) {
    if (isDirty) {
      setPendingWeekShift(deltaDays);
      return;
    }
    shiftWeek(deltaDays);
  }

  return (
    <div className="plan">
      {/* Şantiye sekme barı — sıra `SiteDetailTabs` tek kaynağından. `activePath`
          TAM DİZE karşılaştırır, o yüzden planlama son ekli `pathname` DEĞİL
          "Günlük Kayıt" sekmesinin href'iyle aynı temel yol geçilir (bkz.
          SiteDiarySummaryView). */}
      <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={`${base}/gunluk-kayit`} />

      {/* P80-84 */}
      <DiaryModeSwitch
        active="planning"
        entryHref={`${base}/gunluk-kayit`}
        planningHref={`${base}/gunluk-kayit/planlama`}
        summaryHref={`${base}/gunluk-kayit/ozet`}
      />

      {/* P86-99 — başlık + görünüm kipi + Kaydet */}
      <div className="plan__head">
        <div>
          {/* P88 */}
          <h1 className="plan__title">
            Planlama{plan ? ` — ${plan.site_name} Şantiyesi` : ""}
          </h1>
          {/* P89 */}
          <p className="plan__subtitle">
            Haftalık &amp; aylık iş planı{plan ? ` · ${plan.project_name}` : ""}
          </p>
        </div>
        <div className="plan__head-actions">
          <PlanViewModeSwitch />
          {/* P97 — dört PUT'u SIRALI yazar. Salt-okur kullanıcıda buton
              GİZLENMEZ, devre-dışı basılır (üst kural); değişiklik yokken de
              devre-dışıdır: kirli olmayan bölüme istek atmak gereksiz replace
              riskidir. */}
          <Button disabled={!canSave} onClick={() => void saveHandle.save(draft)}>
            Kaydet
          </Button>
        </div>
      </div>

      <PlanViewModeNotice />
      <PlanSaveStatus
        steps={saveHandle.steps}
        isSaving={saveHandle.isSaving}
        hasFailure={saveHandle.hasFailure}
        onRetry={() => void saveHandle.save(draft)}
      />

      {/* P102-181 — ızgara kartı */}
      <section className="plan-card plan-card--grid" aria-label="Haftalık plan ızgarası">
        <PlanWeekNav
          weekStart={weekStart}
          weekEnd={plan?.week_end ?? weekEndOf(weekStart)}
          // Sprint adı TASLAKTAN okunur: düzenleme "Kaydet"ten önce görünür.
          sprintName={draft.sprintName}
          canWrite={canWritePlan}
          onShiftWeek={handleShiftWeek}
          onChangeSprintName={(name) => dispatch({ type: "setSprintName", name })}
        />

        {planQuery.isError && (
          <p className="plan__message">Planlama ızgarası yüklenemedi.</p>
        )}
        {!planQuery.isError && planQuery.isLoading && (
          <p className="plan__message">Yükleniyor…</p>
        )}
        {/* BOŞ IZGARA (T5 bulgusu): grup yokken "+ Satır" yalnız grup
            başlığında dursaydı hiçbir yerde olmazdı — yani plan SIFIRDAN hiç
            kurulamazdı. Boş-durum metni KALIR, girişi yanına konur. Sentetik
            başlangıç: tür "Ekip", bölüm "Bölümsüz"; ikisi de popover'da
            değiştirilebilir. */}
        {!planQuery.isError && !planQuery.isLoading && plan && draft.groups.length === 0 && (
          <div className="plan__empty">
            <p className="plan__message">Bu hafta için plan satırı eklenmemiş.</p>
            <PlanAddRowButton
              defaultKind="crew"
              defaultSectionId={null}
              sections={sections}
              canWrite={canWritePlan}
              onAdd={(row) => dispatch({ type: "addRow", row })}
            />
          </div>
        )}
        {!planQuery.isError && !planQuery.isLoading && plan && draft.groups.length > 0 && (
          <PlanGrid
            days={plan.days}
            draft={draft}
            sections={sections}
            canWrite={canWritePlan}
            dispatch={dispatch}
          />
        )}
      </section>

      {pendingWeekShift !== null && (
        <ConfirmDialog
          title="Kaydedilmemiş değişiklikler"
          message="Bu haftanın planında kaydedilmemiş değişiklikler var. Hafta değiştirirseniz bu değişiklikler kaybolur."
          confirmLabel="Değişiklikleri at"
          danger
          onConfirm={() => {
            setPendingWeekShift(null);
            shiftWeek(pendingWeekShift);
          }}
          onClose={() => setPendingWeekShift(null)}
        />
      )}

      {/* P184-228 — alt iki kart */}
      <div className="plan__bottom">
        <PlanMaterialsCard />
        <PlanGoalsCard goals={draft.goals} canWrite={canWritePlan} dispatch={dispatch} />
      </div>
    </div>
  );
}
