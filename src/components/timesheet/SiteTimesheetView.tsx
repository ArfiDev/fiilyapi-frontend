"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { Select } from "@/components/ui/select/Select";
import { useSiteSections } from "@/lib/api/hooks/useSiteSections";
import { useSite } from "@/lib/api/hooks/useSites";
import { PERSONNEL_EDIT, TIMESHEET_EDIT, TIMESHEET_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { routes } from "@/lib/routes";

import { AddPersonnelLink } from "./AddPersonnelLink";
import { timesheetEmptyMessage } from "./GeneralTimesheetView";
import { currentIsoWeek, parseIsoWeek, shiftIsoWeek, type TimesheetIsoWeek } from "./iso-week";
import { TimesheetSummaryStrip } from "./TimesheetSummaryStrip";
import { TimesheetWeekScreen } from "./TimesheetWeekScreen";
import "@/components/site-detail/site-detail.css";
import "@/components/site-diary/site-diary-summary.css";
import "./timesheet.css";

/** ŞP 99 — "Tüm Bölümler" seçeneğinin URL/`<option>` değeri. */
const ALL_SECTIONS = "";

/**
 * Şantiye › Puantaj sekmesi — mockup `Şantiye - Puantaj.dc.html` (ŞP).
 * Rota `.../santiyeler/[siteId]/puantaj`. Sayfa KENDİ LAYOUT'UNU KURMAZ —
 * drill sidebar `[projectId]/layout.tsx`ten gelir (F-PL/F-SD deseni).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴🔴 ONAYLI SAPMA — MOCKUP'IN GÜN-KODU TASARIMI UYGULANMAZ 🔴🔴
 * (kullanıcı kararı 2026-08-28, yönetim emriyle kayda geçti)
 *
 * `Şantiye - Puantaj.dc.html` (`330dfd8`) bu ekranı GÜN KODU matrisi çizer:
 * Ç · İ · T · FM · G rozetleri, "adam/gün" toplamları, `4+`/`3G` ayak
 * işaretleri. Bu tasarım YENİ SÖZLEŞME ALTINDA UYGULANAMAZ: puantaj gün
 * kodundan adam-SAATE geçti ve `worked`/`overtime` enum üyeleri UÇTAN KALKTI
 * (`TimesheetCode` artık yalnız `leave` · `holiday` · `temporary_duty`).
 * Mockup'ın çizdiği rozetlerin ikisi ARTIK VERİDE YOKTUR.
 *
 * KARAR: ŞP salt-okunur YAPILMADI ve yeteneği KALDIRILMADI — E5'in HAFTALIK
 * SAAT çekirdeği (`TimesheetWeekScreen`) buraya da uygulandı. İki ekran
 * çekirdek olarak İKİZDİR; ŞP, E5'in şantiyeye sabitlenmiş + bölüm süzgeçli
 * hâlidir. ŞP'nin KENDİ yetenekleri KORUNDU: bölüm süzgeci · özet şeridi ·
 * drill kenar çubuğu · Excel dışa aktarımı · YAZMA YETKİSİ.
 *
 * ⚠️ SONRAKİ TUR "mockup gün kodu çiziyor" diye BU KARARI GERİ ALMASIN.
 * Emsal biçim: `financial-statements/BalanceSheetView.tsx` (`7f3a8ae`).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ ŞEF KARARI K2 (haftaya taşındı) — bölüm filtresi (ŞP 99) İSTEMCİ
 * TARAFINDA süzer: `GET .../timesheet/week` HER ZAMAN SÜZGEÇSİZ çekilir,
 * süzgeç yalnız görünüme uygulanır. Gerekçe: `PUT` HAFTA+şantiye kapsamında
 * DEĞİŞTİRMEDİR ve gövde her zaman şantiyenin O HAFTAYA AİT TAM hücre kümesi
 * olmalıdır; süzgeçli küme gönderilirse diğer bölümlerin o haftaki kayıtları
 * SİLİNİR. Kapsam AY DEĞİL HAFTADIR — ayın öbür haftaları etkilenmez.
 * Excel dışa aktarımı bunun İSTİSNASIDIR (sunucu üretir, `section_id` oraya
 * geçer).
 */
export function SiteTimesheetView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  // 🔴 URL-3 — rota parametreleri "slug VEYA UUID"dur; ADRES anahtarlaridir.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();

  const canAddPersonnel = useButtonGate({
    pages: PERSONNEL_EDIT,
    need: "edit",
    projectId: projectKey,
  });
  // IZN-F2.x · puantaj kaydet = saha/santiye.puantaj Düzenler; personel ekle = ik.* Düzenler.
  const canEditTimesheet = useButtonGate({ pages: TIMESHEET_EDIT, need: "edit", projectId: projectKey });
  // IZN-F5-ön · görüntüleme kapısı = puantaj sayfaları Görür (VEYA); grant yoksa modül izni.
  const canViewTimesheet = useButtonGate({ pages: TIMESHEET_VIEW_PAGES, need: "view", projectId: projectKey });

  const week = parseIsoWeek(searchParams.get("iso_year"), searchParams.get("iso_week"));
  const sectionParam = searchParams.get("section") ?? ALL_SECTIONS;
  const sectionId = sectionParam === ALL_SECTIONS ? null : sectionParam;

  // Başlık için — drill kabuğu aynı anahtarı zaten çektiğinden ikinci bir ağ
  // isteği oluşmaz (React Query önbelleği).
  const siteQuery = useSite(siteKey, { project: projectKey });
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI. Slug'i kabul eden TEK santiye ucu
  // yukaridakidir; asagidaki uclarin HEPSI UUID bekler. Santiye yaniti hem
  // kendi `id`sini hem PROJESININ `id`sini tasir, yani ikinci bir istek YOK.
  // Cozulene kadar bos string gider ve hook'lar kendi `enabled` kapilarinda durur.
  const siteId = siteQuery.data?.id ?? "";
  const sectionsQuery = useSiteSections(siteId);

  if (!canViewTimesheet) return <AccessDenied />;

  const site = siteQuery.data;
  const sections = sectionsQuery.data?.items ?? [];
  const activeSectionName = sections.find((section) => section.id === sectionId)?.name;

  // Personel formundan bu sekmeye (aynı hafta + bölüm süzgeci) dönülür.
  const currentQuery = searchParams.toString();
  const returnTo = currentQuery.length > 0 ? `${pathname}?${currentQuery}` : pathname;

  function pushParams(next: { section?: string; week?: TimesheetIsoWeek }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.section !== undefined) {
      if (next.section === ALL_SECTIONS) params.delete("section");
      else params.set("section", next.section);
    }
    if (next.week !== undefined) {
      params.set("iso_year", String(next.week.isoYear));
      params.set("iso_week", String(next.week.isoWeek));
    }
    const query = params.toString();
    router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <TimesheetWeekScreen
      className="ts ts--site"
      siteId={siteId}
      week={week}
      sectionId={sectionId}
      canWrite={canEditTimesheet}
      canAddPersonnel={canAddPersonnel}
      returnTo={returnTo}
      onShiftWeek={(delta) => pushParams({ week: shiftIsoWeek(week, delta) })}
      onSelectWeek={(next) => pushParams({ week: next })}
      onCurrentWeek={() => pushParams({ week: currentIsoWeek() })}
      isCurrentWeek={isSameWeek(week, currentIsoWeek())}
      // ŞP mockup'ında meslek/tür/taşeron süzgeci YOKTUR — uydurulmaz.
      showRowFilters={false}
      // ŞP 100 — Excel KORUNUR (onaylı sapmanın parçası).
      showExport
      header={
        <>
          {/* ŞP 79-86 — sekme şeridi tek kaynaktan */}
          <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={pathname} />
          {/* ŞP 88-93 */}
          <div className="ts__head">
            <div>
              {/* ŞP 90 — şantiye adı yüklenene kadar uydurulmaz */}
              <h1 className="ts__title ts__title--site">
                {site ? `${site.name} — Puantaj` : "Puantaj"}
              </h1>
              <p className="ts__subtitle">
                {site ? `${site.project.name} · ` : ""}Haftalık giriş · saat bazlı
              </p>
            </div>
            <div className="ts__head-actions">
              {canAddPersonnel && <AddPersonnelLink returnTo={returnTo} />}
            </div>
          </div>
        </>
      }
      controls={
        <>
          {/* ŞP 99 — bölüm filtresi; GET'e GEÇMEZ (K2) */}
          <Select
            aria-label="Bölüm"
            value={sectionParam}
            onChange={(event) => pushParams({ section: event.target.value })}
          >
            <option value={ALL_SECTIONS}>Tüm Bölümler</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </Select>
          {sectionsQuery.isError && (
            <span className="ts__message">
              Bölüm listesi yüklenemedi — filtre yalnız “Tüm Bölümler” gösteriyor.
            </span>
          )}
        </>
      }
      // ŞP 116-120 — bölüm özet şeridi KORUNUR (onaylı sapmanın parçası).
      cardHeader={(view) => (
        <TimesheetSummaryStrip
          title={activeSectionName ?? "Tüm Bölümler"}
          workerCount={view.workerCount}
          totalHours={view.totalHours}
        />
      )}
      emptyMessage={(isLoading, isError) => timesheetEmptyMessage(isLoading, isError, siteId)}
      // PLN-F3.0 · kilit bandı/popover'ı → bu şantiyenin günlük kaydı, KİLİDİN
      // GÜNÜNE `?tarih=` ile (rota anahtarlarıyla).
      diaryHref={(day) => routes.projects.sites.diary({ projectId: projectKey, siteId: siteKey, date: day })}
    />
  );
}

function isSameWeek(a: TimesheetIsoWeek, b: TimesheetIsoWeek): boolean {
  return a.isoYear === b.isoYear && a.isoWeek === b.isoWeek;
}
