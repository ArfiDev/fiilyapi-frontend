"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { navGroupHeadingFor } from "@/components/shell/nav-config";
import { routes } from "@/lib/routes";
import { Select } from "@/components/ui/select/Select";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PERSONNEL_EDIT, TIMESHEET_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { AddPersonnelLink } from "./AddPersonnelLink";
import { currentIsoWeek, parseIsoWeek, shiftIsoWeek, type TimesheetIsoWeek } from "./iso-week";
import { TimesheetWeekScreen } from "./TimesheetWeekScreen";
import "@/components/site-diary/site-diary-summary.css";
import "./timesheet.css";

/**
 * Ekran 5 · Genel Puantaj — mockup `Ekran 5 - Puantaj.dc.html` (E5, kanonik,
 * `5f3a944`). Parantez/yorum içindeki sayılar o dosyanın SATIR numaralarıdır.
 *
 * Rota `/puantaj` — ana kabuğun altındadır.
 *
 * 🔴 EKRAN HAFTALIKTIR (PUAN-SAAT): giriş birimi adam-SAATtir, gün kodu değil.
 * Ortak gövde `TimesheetWeekScreen`dedir — bu dosya YALNIZ kabuğu (başlık,
 * şantiye seçici, URL durumu) verir.
 *
 * HAFTA + ŞANTİYE URL'DEDİR (`?site=&iso_year=&iso_week=`) — bağlantı
 * paylaşılabilir olsun (F-PL `?week=` deseni). Mockup'ın "13 – 19 Temmuz 2026"
 * sabiti KOPYALANMAZ (tarih artefaktı istisnası): varsayılan içinde bulunulan
 * gerçek haftadır.
 */
export function GeneralTimesheetView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const permission = useModulePermission("timesheet");
  // "Personel Ekle" girişi AYRI modülün (personnel) yetkisine bağlı: puantaj
  // yazabilen herkes personel kartı açamaz. İzinsizde HİÇ basılmaz.
  const personnelPermission = useModulePermission("personnel");
  const canAddPersonnel = useButtonGate({
    pages: PERSONNEL_EDIT,
    need: "edit",
    fallback: hasAtLeast(personnelPermission.level, "full"),
  });
  // IZN-F2.x · puantaj kaydet = saha/santiye.puantaj Düzenler; personel ekle = ik.* Düzenler.
  const canEditTimesheet = useButtonGate({ pages: TIMESHEET_EDIT, need: "edit", fallback: permission.canWrite });

  const week = parseIsoWeek(searchParams.get("iso_year"), searchParams.get("iso_week"));
  const siteOptions = useSiteOptions();
  // Seçili şantiye URL'den; yoksa ilk seçenek (mockup seçiciyi HER ZAMAN dolu
  // çizer — boş bir seçici uydurulmaz).
  const siteParam = searchParams.get("site");
  const selectedSiteId = siteParam ?? siteOptions.options[0]?.siteId ?? "";
  // PLN-F3.0 · kilit bandının "Günlük kaydına git →" hedefi: seçili şantiyenin
  // günlük rotası, KİLİDİN GÜNÜNE `?tarih=` ile. Seçenek listesinde yoksa
  // (yükleniyor / erişim dışı) `null`.
  const selectedOption = siteOptions.options.find((option) => option.siteId === selectedSiteId);
  const diaryHref = selectedOption
    ? (day: string) =>
        routes.projects.sites.diary({
          projectId: selectedOption.projectId,
          siteId: selectedOption.siteId,
          date: day,
        })
    : null;

  if (!permission.canView) return <AccessDenied />;

  const query = searchParams.toString();
  const returnTo = query.length > 0 ? `${pathname}?${query}` : pathname;

  function pushParams(next: { site?: string; week?: TimesheetIsoWeek }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.site !== undefined) params.set("site", next.site);
    if (next.week !== undefined) {
      params.set("iso_year", String(next.week.isoYear));
      params.set("iso_week", String(next.week.isoWeek));
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <TimesheetWeekScreen
      className="ts ts--general"
      siteId={selectedSiteId}
      week={week}
      // E5'te bölüm süzgeci YOKTUR — yeni hücre bölümsüz açılır.
      sectionId={null}
      canWrite={canEditTimesheet}
      canAddPersonnel={canAddPersonnel}
      returnTo={returnTo}
      onShiftWeek={(delta) => pushParams({ week: shiftIsoWeek(week, delta) })}
      onSelectWeek={(next) => pushParams({ week: next })}
      onCurrentWeek={() => pushParams({ week: currentIsoWeek() })}
      isCurrentWeek={isSameWeek(week, currentIsoWeek())}
      showRowFilters
      header={
        <>
          {/* E5 62 */}
          <p className="ts__eyebrow">{navGroupHeadingFor(routes.timesheet())}</p>
          {/* E5 63-73 */}
          <div className="ts__head">
            <div>
              <h1 className="ts__title">Puantaj</h1>
              {/* E5 68 — sabitler SÖZLEŞMEDEN gelir, ortak gövdedeki bilgi
                  şeridi (`.ts-info`) yazar; başlıkta tekrarlanmaz. */}
              <p className="ts__subtitle">Haftalık giriş · saat bazlı</p>
            </div>
            <div className="ts__head-actions">
              {/* Mockup'ta YOK; spec §4 S2(a) onaylı türetimi. */}
              {canAddPersonnel && <AddPersonnelLink returnTo={returnTo} />}
            </div>
          </div>
        </>
      }
      controls={
        /* E5 98 — şantiye seçici */
        <Select
          aria-label="Şantiye"
          value={selectedSiteId}
          disabled={siteOptions.options.length === 0}
          onChange={(event) => pushParams({ site: event.target.value })}
        >
          {siteOptions.options.length === 0 && (
            <option value="">{siteOptions.isLoading ? "Yükleniyor…" : "Şantiye yok"}</option>
          )}
          {siteOptions.options.map((option) => (
            <option key={option.siteId} value={option.siteId}>
              {option.label}
            </option>
          ))}
        </Select>
      }
      emptyMessage={(isLoading, isError) =>
        timesheetEmptyMessage(isLoading, isError, selectedSiteId)
      }
      diaryHref={diaryHref}
    />
  );
}

function isSameWeek(a: TimesheetIsoWeek, b: TimesheetIsoWeek): boolean {
  return a.isoYear === b.isoYear && a.isoWeek === b.isoWeek;
}

/** Boş gövdenin nedeni HER ZAMAN yazılır — sessiz boş tablo yok. */
export function timesheetEmptyMessage(
  isLoading: boolean,
  isError: boolean,
  siteId: string,
): string {
  if (siteId.length === 0) return "Şantiye seçin.";
  if (isError) return "Puantaj haftası yüklenemedi.";
  if (isLoading) return "Yükleniyor…";
  return "Bu hafta için puantaj kaydı ve aktif personel bulunmuyor.";
}
