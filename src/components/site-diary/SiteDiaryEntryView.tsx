"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { Badge } from "@/components/ui/badge/Badge";
import { Button } from "@/components/ui/button/Button";
import { LockIcon } from "@/components/ui/icons";
import { useBoq } from "@/lib/api/hooks/useBoq";
import { useProgressPayments } from "@/lib/api/hooks/useProgressPayments";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { useSubcontractors } from "@/lib/api/hooks/useSubcontractors";
import { useSiteDiaryEntries, useSiteDiaryEntry } from "@/lib/api/hooks/useSiteDiary";
import {
  useCreateSiteDiaryEntry,
  useReopenSiteDiaryEntry,
  useSaveSiteDiaryLines,
  useSubmitSiteDiaryEntry,
  useUpdateSiteDiaryEntry,
} from "@/lib/api/hooks/useSiteDiaryMutations";
import {
  useSitePlanDaySummary,
  SITE_PLAN_DAY_SUMMARY_DEFAULT_DAYS,
} from "@/lib/api/hooks/useSitePlanDaySummary";
import { backendErrorMessage, submitBlockedReasons } from "@/lib/api/error-message";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { hasAtLeast } from "@/lib/auth/permissions";
import { useModulePermission } from "@/lib/auth/useModulePermission";

import { formatMonthName } from "@/lib/format";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { DiaryBasicInfoCard } from "./DiaryBasicInfoCard";
import { DiaryLinesCard } from "./DiaryLinesCard";
import { DiaryModeSwitch } from "./DiaryModeSwitch";
import { DiaryChiefNoteCard, DiaryWorkDoneCard } from "./DiaryNotesCards";
import { DiaryPaymentAccrualCard } from "./DiaryPaymentAccrualCard";
import { DiaryPhotosCard } from "./DiaryPhotosCard";
import { DiaryPlanPreviewCard } from "./DiaryPlanPreviewCard";
import { DiaryRecentEntriesCard } from "./DiaryRecentEntriesCard";
import { DiarySafetyCard } from "./DiarySafetyCard";
import { DiaryWorkerCountsCard } from "./DiaryWorkerCountsCard";
import { DIARY_STATUS_LABELS } from "./diary-labels";
import { diaryDayParts, isoDate, isoPeriod, parseDiaryDateParam } from "./derive";
import { computeDiaryAccrual } from "./payment-accrual";
import { buildRecentEntryRows, DIARY_RECENT_ENTRY_LIMIT } from "./recent-entries";
import { buildDiaryWorkerRows } from "./worker-counts";
import type {
  DiaryCoreActions,
  DiaryExtensionContext,
  DiaryExtensionProps,
  DiaryLineRef,
} from "./diary-extension";
import { buildDiaryExtensionContext, isSameDiaryExtensionContext } from "./diary-extension-context";
import { buildDiaryLineTree, diaryTreeLeaves } from "./diary-lines-tree";
import { boqTreeItems, siteTreeSections } from "./diary-tree-sources";
import { diaryTimesheetHref } from "./diary-timesheet-link";
import {
  addDiaryFirm,
  addDiaryLines,
  buildDiaryCreateBody,
  buildDiaryLinesBody,
  buildDiaryUpdateBody,
  diaryFormFromEntry,
  diaryWeatherError,
  emptyDiaryForm,
  invalidQuantityIds,
  invalidWorkerCountIds,
  isDiaryFormDirty,
  removeDiaryLine,
  removeDiaryWorker,
  type DiaryFormState,
} from "./form-state";
import "@/components/site-detail/site-detail.css";
import "./site-diary.css";
import "./site-diary-progress.css";
import { DIARY_DATE_PARAM, routes } from "@/lib/routes";

export interface DiaryEntryScreenProps extends DiaryExtensionProps {
  /**
   * 🔴 URL-3 — "slug VEYA UUID"; ADRES anahtarlaridir, kanonik UUID DEGIL.
   * Sayfa yolu bunlarla kurulur (`base`), yani kanonik UUID gecirilseydi
   * kullanicinin okunur adresi bir tikta UUID'ye geri duserdi.
   */
  projectKey: string;
  siteKey: string;
  /**
   * Basligin USTUNDE duran serit. Santiye rotasinda `SiteDetailTabs`
   * (GK148-155), kok rotada santiye SECICISI (E5 98 deseni) — ekranin geri
   * kalani IKISINDE DE aynidir.
   */
  chrome: React.ReactNode;
}

/**
 * ═══ IKI ROTANIN TEK ORTAK GOVDESI (F-NAVSAHA) ═══
 *
 * `TimesheetWeekScreen`in gunluk-kayit ikizi. Ayni ekran IKI kabukta yasar:
 *
 * | | `/gunluk-kayit` (E7) | `Santiye › Gunluk Kayit` (GK) |
 * |---|---|---|
 * | Santiye | secici (`?site=`) | rotadan sabit |
 * | Ust serit | secici | `SiteDetailTabs` |
 * | Kabuk | ana kabuk | drill sidebar |
 *
 * Fark KABUKTUR, hesap degil — bu yuzden form, kaydetme, 409 akisi, izin
 * dallari ve sag panel turevleri BURADA TEK YERDE durur.
 */
export function DiaryEntryScreen({
  projectKey,
  siteKey,
  chrome,
  extension,
  onExtensionContext,
}: DiaryEntryScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const siteQuery = useSite(siteKey, { project: projectKey });
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI (bkz. `routes.ts` YOL/SORGU kurali).
  const siteId = siteQuery.data?.id ?? "";
  const projectId = siteQuery.data?.project.id ?? "";
  const boqQuery = useBoq(siteId);
  const permission = useModulePermission("site_diary");

  // PLN-F3.0 · Hangi GÜNÜN kaydı düzenleniyor. İlk değer `?tarih=`den (geçersiz/
  // eksik → BUGÜN — mockup'taki sabit tarih KOPYALANMAZ, tarih artefaktı
  // istisnası spec başlığı; `useState` BAŞLATICISINDA hesaplanır, HER render'da
  // DEĞİL). Kullanıcı gün değiştirince aşağıdaki efekt URL'i günceller (diğer
  // parametreler — kök ikizde `?site=` — KORUNUR).
  //
  // 🔴 AÇILIŞTA YAZILMAZ, ama SONRA HER SAPMADA yazar (lider denetimi
  // PLN-F3.0-ek, İKİNCİ tur — ilk düzeltme "İLK DEĞERDEN sapma" diye kontrol
  // ediyordu ve şu sınıfı KAÇIRIYORDU: bugün aç → düne geç (`?tarih=dün`
  // yazılır) → TEKRAR bugüne dön — `activeDate` yine İLK DEĞERE eşit olduğu
  // için efekt SESSİZCE çıkıyor, URL `?tarih=dün`de KALIYOR; adres ile ekran
  // çelişiyordu. Doğrusu: URL'in GÜNCEL `?tarih=`i `activeDate`ten FARKLIYSA
  // yaz — "ilk değerden sapma" değil "şu an URL'de yazan DEĞERden sapma".
  //
  // ÜÇÜNCÜ tur (lider denetimi): mount-bayrağı (`hasMountedRef`) React
  // StrictMode'da (Next dev'de varsayılan) KIRILIYORDU — StrictMode efekti
  // mount→cleanup→mount sırasıyla İKİ KEZ koşturur; ikinci koşuda bayrak
  // zaten `true` olduğundan `?tarih=` YOKKEN bile açılışta yine yazılıyordu.
  // DURUMSUZ karşılaştırmaya geçildi: hiçbir `ref` YOK, yalnız "URL'in bugün
  // ANLATTIĞI gün (`parseDiaryDateParam` ile — yoksa/geçersizse BUGÜN) ekrandaki
  // ile AYNI mı" sorusu — StrictMode'un çift koşusu bu karşılaştırmayı
  // ETKİLEMEZ (idempotent).
  const [activeDate, setActiveDate] = useState<string>(() =>
    parseDiaryDateParam(searchParams.get(DIARY_DATE_PARAM)),
  );
  useEffect(() => {
    if (parseDiaryDateParam(searchParams.get(DIARY_DATE_PARAM)) === activeDate) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(DIARY_DATE_PARAM, activeDate);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate]);
  const [form, setForm] = useState<DiaryFormState>(() => emptyDiaryForm(isoDate(new Date())));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasDateConflict, setHasDateConflict] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Submit 422 `reasons[]` (F2.1 `submitBlockedReasons`) — ekranda LİSTE.
  const [submitReasons, setSubmitReasons] = useState<string[] | null>(null);

  // Gün → kayıt eşlemesi: ayın listesi çekilir, gün eşleşmesi orada aranır
  // (T3'ün "Son Kayıtlar" listesi AYNI önbellek anahtarını kullanır).
  const period = isoPeriod(activeDate);
  const entriesQuery = useSiteDiaryEntries(siteId, period);
  const matchedId =
    entriesQuery.data?.items.find((item) => item.entry_date === activeDate)?.id ?? "";
  const entryQuery = useSiteDiaryEntry(matchedId);
  const entry = matchedId === "" ? undefined : entryQuery.data;

  const planQuery = useSitePlanDaySummary(
    siteId,
    activeDate,
    SITE_PLAN_DAY_SUMMARY_DEFAULT_DAYS,
  );

  // T3 sağ paneli — "Aylık Hakediş Birikimi" (GK387-413) iki hakediş
  // listesinden türetilir. İşveren hakedişi PROJE düzeyi kayıttır (F-TH
  // kararı S4) → `site_id` süzmesi kullanılmaz; taşeron tarafı U2'de sunucuda
  // süzülür. Ay süzmesi istemcide (`computeDiaryAccrual`).
  const employerPaymentsQuery = useProgressPayments({ project_id: projectId });
  const subcontractorPayments = useSiteSubcontractorPayments(projectId, siteId);
  const paymentsPermission = useModulePermission("progress_payments");

  // PLN-F2.2 — firma adları taşeron listesinden (satır yanıtı ad taşımaz).
  // Pasif firmalar da okunur: kayıttaki eski firma satırı adsız kalmasın.
  // (PLN-F2.1b · G12: kendi ekip saati artık kayıt yanıtının
  // `own_crew_from_timesheet`idir — puantaj haftası bu ekrandan OKUNMAZ.)
  const subcontractors = useSubcontractors({ activeOnly: false });

  const createEntry = useCreateSiteDiaryEntry(siteId);
  const updateEntry = useUpdateSiteDiaryEntry(matchedId);
  const saveLines = useSaveSiteDiaryLines(matchedId);
  const submitEntry = useSubmitSiteDiaryEntry(matchedId);
  const reopenEntry = useReopenSiteDiaryEntry(matchedId);

  const isEntryLoading =
    entriesQuery.isLoading || (matchedId !== "" && entryQuery.isLoading);

  // Form tohumlama: sunucudaki kayıt DEĞİŞTİĞİNDE (id ya da updated_at) yerel
  // durum yeniden kurulur. Yükleme sürerken tohumlanmaz — yoksa liste gelince
  // kullanıcının yazdığı boş-gün formu bir kez sıfırlanırdı.
  const seedKey = entry ? `entry:${entry.id}:${entry.updated_at}` : `new:${activeDate}`;
  const seededRef = useRef<string | null>(null);
  // O4 (SEKME-F2, lider denetimi 2. tur) · kaydı OLMAYAN günün "başlangıç
  // formu" — aşağıdaki efekt gün değişiminde önceki günün YAZILMIŞ
  // (kaydedilmemiş) alanlarını KASITLI taşıdığı için (bkz. "previous.startsWith"
  // dalı), kirlilik tabanı salt `emptyDiaryForm(activeDate)` OLAMAZ — efektin
  // bu gün için ürettiği GERÇEK başlangıç değeriyle kıyaslanır, yoksa taşınan
  // alan sahte-kirli üretir. ANAHTARLI DURUMDUR (`ref` DEĞİL): D1'in kusur
  // sınıfı ("render sırasında `ref.current` okuma") burada BÜYÜMESİN diye —
  // `key` ile "bu değer HANGİ gün için üretildi" render'da GÜVENLE okunur
  // (bir `ref`in o an neyi tuttuğu render sırasında BİLİNMEZ).
  const [noEntryBaseline, setNoEntryBaseline] = useState<{
    key: string;
    form: DiaryFormState;
  } | null>(null);
  // Efekt `form`u DEPENDENCY yapmadan (döngüye girmesin diye) en güncel
  // `form`u okuyabilsin diye — `SubcontractorContractCreateView`deki
  // `loadItemsRef` deseniyle aynı. YALNIZ efekt İÇİNDE okunur, render
  // sırasında DEĞİL — D1'in kusur sınıfına girmez.
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  });
  useEffect(() => {
    if (isEntryLoading) return;
    if (seededRef.current === seedKey) return;
    const previous = seededRef.current;
    seededRef.current = seedKey;
    if (entry) {
      setForm(diaryFormFromEntry(entry));
      setNoEntryBaseline(null);
      return;
    }
    // Kayıtlı günden boş güne geçildiyse (ya da ilk yükleme) temiz form:
    // önceki günün notları yeni güne KOPYALANMAZ.
    if (previous === null || previous.startsWith("entry:")) {
      const next = emptyDiaryForm(activeDate);
      setForm(next);
      setNoEntryBaseline({ key: seedKey, form: next });
      return;
    }
    const next = {
      ...emptyDiaryForm(activeDate),
      ...formRef.current,
      entryDate: activeDate,
      quantities: {},
      overrunReasons: {},
      addedLines: [],
      removedLines: [],
      workerCounts: {},
      workerHours: {},
      addedFirms: [],
      removedWorkers: [],
    };
    setForm(next);
    setNoEntryBaseline({ key: seedKey, form: next });
  }, [seedKey, entry, activeDate, isEntryLoading]);

  // ── Kalem ağacı (G1) + uzantı bağlamı (§2.7) ──────────────────────────
  const treeSections = siteTreeSections(siteQuery.data?.sections ?? []);
  const lineTree = entry
    ? buildDiaryLineTree({
        lines: entry.lines,
        form,
        boqItems: boqTreeItems(boqQuery.data),
        sections: treeSections,
      })
    : [];
  const extensionContext = buildDiaryExtensionContext({
    siteId: siteQuery.data?.id ?? null,
    day: activeDate,
    entry,
    leaves: diaryTreeLeaves(lineTree),
  });
  // Bağlam DEĞİŞTİKÇE bildirilir; sığ eşitse tekrar çağrılmaz (her render'da değil).
  const lastContextRef = useRef<DiaryExtensionContext | null>(null);
  useEffect(() => {
    if (!onExtensionContext) return;
    if (isSameDiaryExtensionContext(lastContextRef.current, extensionContext)) return;
    lastContextRef.current = extensionContext;
    onExtensionContext(extensionContext);
  });

  // SEKME-F1.3-FIX D1 · form efektte (yukarıdaki seed effect'te) doldurulur;
  // ilk render'da entry zaten hazırken form henüz boştur (emptyDiaryForm).
  // Bu yüzden dirty ifadesi seed effect'in BU kayıt için (seedKey eşleşmesi)
  // çalışmış olmasını da şart koşar — aksi hâlde ilk commit'te boş form ≠
  // entry sahte-kirli üretip üst çubukta boşuna onay modalı açtırır.
  const isFormSeededForEntry = entry !== undefined && seededRef.current === seedKey;
  // O4 (SEKME-F2, lider denetimi 2. tur) · kaydı OLMAYAN günde de kayıt
  // izlenir: `entry === undefined` iken registry'ye HER ZAMAN `false` gitmesi,
  // o günde yazılan (ör. "Min °C") bir değerin sekme değişince UYARISIZ
  // kaybolmasına yol açıyordu. Taban `noEntryBaseline` (yukarıdaki seed
  // effect'in BU gün için ürettiği başlangıç değeri) — `seededRef` OKUNMAZ,
  // BU DAL yalnız `noEntryBaseline.key`in GÜNCEL `seedKey`e eşit olup
  // olmadığına bakar (state, render'da güvenle okunur). D1 AYRI İŞ,
  // aşağıdaki `isDirty` (satır ~314) burada DEĞİŞMEDİ.
  const registryDirty = isFormSeededForEntry
    ? isDiaryFormDirty(entry, form)
    : entry === undefined && noEntryBaseline?.key === seedKey
      ? JSON.stringify(form) !== JSON.stringify(noEntryBaseline.form)
      : false;
  useUnsavedChanges(registryDirty, "Şantiye günlüğü");

  if (!permission.canView) return <AccessDenied />;
  if (isForbidden(siteQuery.error) || isForbidden(entriesQuery.error)) return <AccessDenied />;

  const site = siteQuery.data;
  /**
   * 🔴 ŞANTİYESİZ HÂL — kök rotada GERÇEKTİR (şantiye listesi boş, ya da
   * kullanıcının erişebildiği şantiye yok). Şantiye kapsamlı rotada `siteKey`
   * bir YOL segmentidir, yani orada bu hâl OLUŞAMAZ.
   *
   * Şantiyesizken ekran YAZILAMAZ olmalı: `useSite` bile koşmaz
   * (`enabled: siteId.length > 0`), yani `POST` gövdesinin `site_id`si BOŞ
   * giderdi. Ayrıca `routes.projects.sites.*` bu hâlde `/projeler//santiyeler/`
   * gibi ÇİFT SLAŞLI bozuk bir yol kurar — mod anahtarı da bu yüzden basılmaz.
   */
  const hasSite = siteKey.length > 0;
  if (!hasSite) {
    return (
      <div className="diary">
        {chrome}
        <div className="diary__head">
          <div>
            <h1 className="diary__title">Günlük Kayıt &amp; Planlama</h1>
            <p className="diary__subtitle">
              Şantiye seçilmedi — kayıt girilebilecek bir şantiye yok.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isSubmitted = entry?.status === "submitted";
  // Uzantı yuvası `lock` (rapor onayı): kilitliyse BÜTÜN alanlar salt okunur.
  const isLocked = extension?.lock?.isLocked === true;
  // Salt-okunur görünüm: yazma izni yok, kayıt gönderilmiş ya da gün kilitli.
  const isReadOnly = !permission.canWrite || isSubmitted || isLocked;
  const canReopen = hasAtLeast(permission.level, "admin");
  const isDirty = entry ? isDiaryFormDirty(entry, form) : false;
  // Uzantı yuvası `submitGate`: `canSubmit === false` → Gönder pasif + gerekçeler EKRANDA.
  const gate = extension?.submitGate ?? null;
  const isGateClosed = gate !== null && !gate.canSubmit;
  // S4: uzantı gerekçeleri kendisi gösteriyorsa (kontrol çubuğu) çekirdek listeyi basmaz.
  const showGateReasons = gate?.showReasonsInCore !== false;
  /**
   * "Kaydet & Gönder" etkinliği — TEK türetilmiş değer (PLN-F2.5e · karar 6):
   * başlık düğmesi de, `fullWidthBlock`a verilen `canSubmit` de BUNU okur.
   */
  const canSubmit =
    permission.canWrite && !isSubmitted && entry !== undefined && !isLocked && !isGateClosed && !isSaving;
  const lineRefs = new Map<string, DiaryLineRef>(extensionContext.lines.map((line) => [line.key, line]));

  // Sağ panel türevleri — hepsi SAF fonksiyonlarda (ayrı `.ts` dosyaları),
  // bileşenin içinde hesap YOK.
  const recentRows = buildRecentEntryRows(
    entriesQuery.data?.items ?? [],
    site?.sections ?? [],
    DIARY_RECENT_ENTRY_LIMIT,
    "progress",
  );
  const workerRows = buildDiaryWorkerRows(entry?.worker_counts ?? [], form.addedFirms, form.removedWorkers);
  const firms = subcontractors.data?.items ?? [];
  const firmNameById = new Map(firms.map((firm) => [firm.id, firm.name]));
  const firmOptions = firms.filter((firm) => firm.is_active).map((firm) => ({ id: firm.id, name: firm.name }));
  // G12a — kendi ekip backend'de türetilir; kayıt yokken (ya da eski yanıtta) boş.
  const ownCrew = entry?.own_crew_from_timesheet ?? [];
  const timesheetHref = diaryTimesheetHref({ projectKey, siteKey, day: activeDate });
  const accrual = computeDiaryAccrual({
    employerItems: employerPaymentsQuery.data?.items ?? [],
    isEmployerLoading: employerPaymentsQuery.isLoading,
    isEmployerError: employerPaymentsQuery.isError,
    subcontractorItems: subcontractorPayments.items,
    isSubcontractorLoading: subcontractorPayments.isLoading,
    isSubcontractorError: subcontractorPayments.isError,
    subcontractorTruncation: subcontractorPayments.truncation,
    year: period.year,
    month: period.month,
  });

  function handleFormChange(patch: Partial<DiaryFormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
    // Kayıt YOKKEN tarih değiştirilirse aranan gün de değişir; kayıt VARKEN
    // tarih alanı kaydın taşınmasıdır (PATCH), arama günü kayıttan sonra
    // güncellenir.
    if (patch.entryDate !== undefined && !entry) setActiveDate(patch.entryDate);
  }

  function handleQuantityChange(lineKey: string, value: string) {
    setForm((prev) => ({ ...prev, quantities: { ...prev.quantities, [lineKey]: value } }));
  }

  function handleOverrunReasonChange(lineKey: string, value: string) {
    setForm((prev) => ({ ...prev, overrunReasons: { ...prev.overrunReasons, [lineKey]: value } }));
  }

  function handleWorkerCountChange(key: string, value: string) {
    setForm((prev) => ({ ...prev, workerCounts: { ...prev.workerCounts, [key]: value } }));
  }

  function handleWorkerHoursChange(key: string, value: string) {
    setForm((prev) => ({ ...prev, workerHours: { ...prev.workerHours, [key]: value } }));
  }

  /** Satır tıklanınca o günün kaydına geçilir (GK359). */
  function handleSelectDate(entryDate: string) {
    setErrorMessage(null);
    setHasDateConflict(false);
    setActiveDate(entryDate);
    setForm((prev) => ({ ...prev, entryDate }));
  }

  function reportError(error: unknown, fallback: string) {
    const reasons = submitBlockedReasons(error);
    if (reasons) {
      setSubmitReasons(reasons);
      setErrorMessage(backendErrorMessage(error, "Günlük gönderilemedi."));
      return;
    }
    if (error instanceof BackendError && error.status === 409) {
      setHasDateConflict(true);
      setErrorMessage(backendErrorMessage(error, "Bu güne ait günlük kayıt zaten var."));
      return;
    }
    setErrorMessage(backendErrorMessage(error, fallback));
  }

  /** Kaydetmeden önce görünür doğrulama; hata varsa metni basar ve `false` döner. */
  function validateForm(): boolean {
    setErrorMessage(null);
    setHasDateConflict(false);
    setSubmitReasons(null);
    const message =
      invalidQuantityIds(form).length > 0
        ? "Miktar hücrelerinde geçersiz değer var; düzeltip tekrar deneyin."
        : invalidWorkerCountIds(form).length > 0
          ? "İşçi sayısı / saat hücrelerinde geçersiz değer var; düzeltip tekrar deneyin."
          : diaryWeatherError(form);
    if (message) setErrorMessage(message);
    return message === null;
  }

  /**
   * Uzantı yuvası `onBeforeSave` (S1): çekirdek KENDİ kaydından HEMEN önce
   * uzantının kaydını (ör. saat dağıtımı) bekler. Reddedilirse çekirdek
   * hiçbir istek atmaz — yarım kayıt olmaz; hata mevcut hata bandında görünür.
   * (Uzantının 409'u "aynı gün kaydı" DEĞİLDİR — o dal burada kullanılmaz.)
   */
  async function runBeforeSave(): Promise<boolean> {
    if (!extension?.onBeforeSave) return true;
    try {
      await extension.onBeforeSave();
      return true;
    } catch (error: unknown) {
      setErrorMessage(backendErrorMessage(error, "Ek bölüm kaydedilemedi; günlük kaydedilmedi."));
      return false;
    }
  }

  /** Taslak Kaydet (E7 66) — kayıt yoksa açar, varsa başlık + satırları yazar. */
  async function handleSaveDraft() {
    if (!validateForm()) return;
    setIsSaving(true);
    if (!(await runBeforeSave())) {
      setIsSaving(false);
      return;
    }
    try {
      if (!entry) {
        const created = await createEntry.mutateAsync(buildDiaryCreateBody(form));
        setActiveDate(created.entry_date);
        return;
      }
      const updated = await updateEntry.mutateAsync(buildDiaryUpdateBody(form, entry));
      await saveLines.mutateAsync(buildDiaryLinesBody(updated, form));
      setActiveDate(updated.entry_date);
    } catch (error: unknown) {
      reportError(error, "Günlük kayıt kaydedilemedi.");
    } finally {
      setIsSaving(false);
    }
  }

  /** Kaydet & Gönder (GK169) — kaydeder, sonra `submit` ile gönderir. */
  async function handleSaveAndSubmit() {
    // Blok düğmesi de bu akışı çağırır — başlıktaki düğmeyle AYNI koşul.
    if (!canSubmit || !entry) return;
    if (!validateForm()) return;
    setIsSaving(true);
    if (!(await runBeforeSave())) {
      setIsSaving(false);
      return;
    }
    try {
      const updated = await updateEntry.mutateAsync(buildDiaryUpdateBody(form, entry));
      await saveLines.mutateAsync(buildDiaryLinesBody(updated, form));
      setActiveDate(updated.entry_date);
      await submitEntry.mutateAsync();
    } catch (error: unknown) {
      reportError(error, "Günlük kayıt gönderilemedi.");
    } finally {
      setIsSaving(false);
    }
  }

  /** Yeniden Aç (spec §2 S3) — gönderilmiş kaydı taslağa döndürür. */
  async function handleReopen() {
    if (!entry) return;
    setErrorMessage(null);
    setIsSaving(true);
    try {
      await reopenEntry.mutateAsync();
    } catch (error: unknown) {
      reportError(error, "Kayıt yeniden açılamadı.");
    } finally {
      setIsSaving(false);
    }
  }

  // Uzantı yuvası `fullWidthBlock` (karar 6): fonksiyonsa çekirdek KENDİ
  // eylemlerini verir — bloktaki "Gönder" başlıktakiyle AYNI akışı çalıştırır.
  const coreActions: DiaryCoreActions = {
    submit: () => void handleSaveAndSubmit(),
    canSubmit,
    isSaving,
  };
  const slot = extension?.fullWidthBlock;
  const fullWidthBlock = typeof slot === "function" ? slot(coreActions) : slot;
  const day = diaryDayParts(activeDate);

  return (
    <div className="diary">
      {/* Kabuğa özel üst şerit — şantiye rotasında sekme barı (GK148-155),
          kök rotada şantiye seçici. Çağıran verir. */}
      {chrome}

      {/* GK158-171 — başlık + mod anahtarı + aksiyonlar */}
      <div className="diary__head">
        <div>
          <h1 className="diary__title">Günlük Kayıt &amp; Planlama</h1>
          {/* İ:113 — "{şantiye} · {proje} · 24.09.2026 Perşembe" (seçili gün;
              karar 1, EV'siz ekranda da) + uzantı eki. */}
          <p className="diary__subtitle">
            {site ? `${site.name} · ${site.project.name} · ` : "Şantiye bilgisi yükleniyor… · "}
            <span className="diary__subtitle-date">{day.date}</span> {day.weekday}
            {/* Uzantı yuvası `headerSuffix` (ör. "Gün 142 · H21", İ:113). */}
            {extension?.headerSuffix && (
              <span className="diary__subtitle-suffix"> · {extension.headerSuffix}</span>
            )}
          </p>
        </div>
        <div className="diary__head-actions">
          <DiaryModeSwitch
            active="entry"
            entryHref={routes.projects.sites.diary({ projectId: projectKey, siteId: siteKey })}
            planningHref={routes.projects.sites.diaryPlanning({
              projectId: projectKey,
              siteId: siteKey,
            })}
            summaryHref={routes.projects.sites.diarySummary({
              projectId: projectKey,
              siteId: siteKey,
            })}
          />
          {permission.canWrite && !isSubmitted && (
            <>
              {/* E7 66 — kilitli günde yazma yok (İ:121 düğme pasif). */}
              <Button variant="secondary" disabled={isSaving || isLocked} onClick={handleSaveDraft}>
                {isSaving ? "Kaydediliyor…" : "Taslak Kaydet"}
              </Button>
              {/* GK169 — kayıt açılmadan gönderilemez (satır iskeleti sunucudan
                  gelir); buton silinmez, gerekçesiyle devre dışı kalır. Uzantı
                  ön koşulu kapalıysa da pasif — gerekçeler durum satırının
                  altında EKRANDA listelenir (title değil). */}
              <Button
                variant="success"
                disabled={!canSubmit}
                title={entry ? undefined : "Önce taslak kaydedin — iş kalemi satırları kayıt açılınca gelir"}
                onClick={handleSaveAndSubmit}
              >
                Kaydet &amp; Gönder
              </Button>
            </>
          )}
          {/* Kilitli gün yeniden açılamaz: backend geçişi kilit portuna sorar (409); İ:143-149. */}
          {isSubmitted && canReopen && !isLocked && (
            <Button variant="secondary" disabled={isSaving} onClick={handleReopen}>
              Yeniden Aç
            </Button>
          )}
        </div>
      </div>

      <div className="diary__status-row">
        {entry && (
          <Badge variant={isSubmitted ? "success" : "neutral"}>
            {DIARY_STATUS_LABELS[entry.status]}
          </Badge>
        )}
        {isSubmitted && (
          <span className="diary__status-note">
            Gönderilmiş kayıt salt-okunurdur.
            {canReopen ? " Düzenlemek için “Yeniden Aç” deyin." : ""}
          </span>
        )}
        {!permission.canWrite && (
          <span className="diary__status-note">
            Bu modülde yalnız görüntüleme yetkiniz var — form salt-okunur.
          </span>
        )}
        {/* Uzantı yuvası `lock` — bant VERİLDİYSE durum satırında (İ:143-149).
            Verilmezse kap basılmaz (karar 5: tam genişlik bant `topBanner`da);
            salt okunurluk yine `isLocked`tan gelir. */}
        {isLocked && extension?.lock?.banner && (
          <div className="diary__lock-banner" role="status">
            <LockIcon width={16} height={16} />
            <div className="diary__lock-banner-body">{extension.lock.banner}</div>
          </div>
        )}
      </div>

      {isGateClosed && gate && showGateReasons && !isSubmitted && (
        <div className="diary__gate" role="status">
          <p className="diary__gate-title">Gönderim engelli</p>
          {gate.reasons.length > 0 && (
            <ul className="diary__gate-list">
              {gate.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="diary__error" role="alert">
          <div className="diary__error-reasons">
            <span>{errorMessage}</span>
            {/* Submit 422 `reasons[]` — jenerik liste (EV'ye özgü metin yok). */}
            {submitReasons && (
              <ul>
                {submitReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
          {hasDateConflict && (
            <Button
              variant="ghost"
              size="sm"
              className="diary__error-action"
              onClick={() => {
                setHasDateConflict(false);
                setErrorMessage(null);
                void entriesQuery.refetch();
              }}
            >
              Var olan kaydı aç
            </Button>
          )}
        </div>
      )}

      {entriesQuery.isError && !errorMessage && (
        <p className="diary__error">Günlük kayıtlar yüklenemedi</p>
      )}

      {/* GK173 — sol form / sağ özet ızgarası (1fr 340px, 20px boşluk) */}
      {/* Uzantı yuvası `topBanner` (S3) — başlığın altında, kartlardan önce (İ:150-155). */}
      {extension?.topBanner && <div className="diary__top-banner">{extension.topBanner}</div>}

      <div className="diary__grid">
        <div className="diary__col diary__col--main">
          <DiaryBasicInfoCard
            form={form}
            onChange={handleFormChange}
            disabled={isReadOnly}
            sections={site?.sections ?? []}
          />
          <DiaryLinesCard
            entry={entry}
            groups={lineTree}
            sections={treeSections}
            form={form}
            onQuantityChange={handleQuantityChange}
            onOverrunReasonChange={handleOverrunReasonChange}
            onAddLines={(lines) => setForm((prev) => addDiaryLines(prev, lines))}
            onRemoveLine={(key) => setForm((prev) => removeDiaryLine(prev, key))}
            disabled={isReadOnly}
            isLocked={isLocked}
            // G10: satır ekle/kaldır `site_diary` yazma iznidir (formen dahil).
            canEditRows={permission.canWrite}
            isBoqUnavailable={boqQuery.isError}
            isDirty={isDirty}
            // Kök ikizde proje çözülmediyse bağlantı kurulmaz (çift slaşlı yol olmasın).
            boqHref={projectKey ? routes.projects.sites.boq({ projectId: projectKey, siteId: siteKey }) : null}
            lineColumns={extension?.lineColumns ?? null}
            itemMeta={extension?.itemMeta ?? null}
            lineRefs={lineRefs}
            // GK264 "Hakediş Durumu →" mockup'ta `Şantiye - Hakedişler.dc.html`e,
            // yani ŞANTİYENİN Hakedişler sekmesine gider. Spec §2 sehven
            // proje-genel `/hakedisler` yazmıştı; kullanıcı kararı (2026-08-04):
            // mockup kazanır. Aynı ekrandaki GK408 "Hakedişler →" de buraya
            // gidiyor — ekran içi tutarsızlık böylece kapandı.
            paymentsHref={routes.projects.sites.progressPayments({ projectId: projectKey, siteId: siteKey })}
          />
          <DiaryWorkDoneCard
            value={form.workDone}
            onChange={(value) => handleFormChange({ workDone: value })}
            disabled={isReadOnly}
          />
          <DiaryChiefNoteCard
            value={form.chiefNote}
            onChange={(value) => handleFormChange({ chiefNote: value })}
            disabled={isReadOnly}
          />
          <DiaryPhotosCard />
          <DiaryPlanPreviewCard
            days={planQuery.data?.days}
            isLoading={planQuery.isLoading}
            isError={planQuery.isError}
            planningHref={routes.projects.sites.diaryPlanning({ projectId: projectKey, siteId: siteKey })}
          />
        </div>

        {/* GK352-451 — sağ özet sütunu; sıra mockup'la birebir:
            Son Kayıtlar (356) · Hakediş Birikimi (387) · İşçi Dağılımı (414) ·
            İş Güvenliği (440). */}
        <div className="diary__col diary__col--side">
          <DiaryRecentEntriesCard
            rows={recentRows}
            isLoading={entriesQuery.isLoading}
            isError={entriesQuery.isError}
            activeDate={activeDate}
            onSelectDate={handleSelectDate}
            hasUnsavedChanges={isDirty}
          />
          <DiaryPaymentAccrualCard
            accrual={accrual}
            monthLabel={formatMonthName(period.month)}
            paymentsHref={routes.projects.sites.progressPayments({ projectId: projectKey, siteId: siteKey })}
            createHref={
              paymentsPermission.canWrite ? routes.progressPayments.new({ projectId }) : null
            }
          />
          <DiaryWorkerCountsCard
            rows={workerRows}
            form={form}
            onChange={handleWorkerCountChange}
            onHoursChange={handleWorkerHoursChange}
            onAddFirm={(firm) => setForm((prev) => addDiaryFirm(prev, firm))}
            onRemoveRow={(key) => setForm((prev) => removeDiaryWorker(prev, key))}
            firmOptions={firmOptions}
            firmNameById={firmNameById}
            ownCrew={ownCrew}
            timesheetHref={timesheetHref}
            disabled={isReadOnly}
            isEntryMissing={!entry}
          />
          <DiarySafetyCard form={form} onChange={handleFormChange} disabled={isReadOnly} />
        </div>
      </div>

      {/* Uzantı yuvası `fullWidthBlock` — kart ızgarasının ALTI (İ:384→386). */}
      {fullWidthBlock && <div className="diary__full-width">{fullWidthBlock}</div>}
    </div>
  );
}

/**
 * Şantiye kapsamlı "Kayıt Gir" ekranı — rota
 * `.../santiyeler/[siteId]/gunluk-kayit`, mockup `Şantiye - Günlük
 * Kayıt.dc.html` (GK).
 *
 * 🔴 F-NAVSAHA · BU BİLEŞENİN GÖRÜNEN DAVRANIŞI DEĞİŞMEDİ. Gövde
 * `DiaryEntryScreen`e taşındı (kök `/gunluk-kayit` ikizi onu paylaşsın diye);
 * burada yalnız ROTADAN OKUMA kaldı. Ayrım kasıtlı: `useParams` yalnız rota
 * altında anlamlıdır — kök rotada `{}` döner. Anahtarları prop'a çevirip
 * "yoksa useParams" gibi SESSİZ bir varsayılan bırakmak, iki kabuğun
 * ayrıştığını gizlerdi.
 */
export function SiteDiaryEntryView({ extension, onExtensionContext }: DiaryExtensionProps = {}) {
  const pathname = usePathname();
  // 🔴 URL-3 — rota parametreleri "slug VEYA UUID"dur; ADRES anahtarlaridir.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();

  return (
    <DiaryEntryScreen
      projectKey={projectKey}
      siteKey={siteKey}
      extension={extension}
      onExtensionContext={onExtensionContext}
      /* GK148-155 — şantiye sekme barı; sıra `SiteDetailTabs` tek kaynağından. */
      chrome={
        <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={pathname} />
      }
    />
  );
}
