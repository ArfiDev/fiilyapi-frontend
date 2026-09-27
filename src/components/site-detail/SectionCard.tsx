import Link from "next/link";

import { cx } from "@/lib/cx";
import { formatCompactCurrency, formatMonthYear, formatPercent } from "@/lib/format";
import { pendingModuleHint, type PendingModuleKey } from "@/lib/pending-modules";
import { SECTION_STATUS_CLASS_SUFFIX, SECTION_STATUS_LABELS } from "@/lib/section-labels";
import type { components } from "@/lib/api/schema";
import { routes, routeKeyOf } from "@/lib/routes";
import type { DeepScale } from "@/lib/api/scale";

export type SectionResponse = DeepScale<components["schemas"]["SectionResponse"]>;
type SectionStatus = SectionResponse["status"];
type CountPlaceholder = DeepScale<components["schemas"]["CountPlaceholder"]>;
type MetricPlaceholder = DeepScale<components["schemas"]["MetricPlaceholder"]>;

// Yer tutucu "gercek deger tasiyor mu?" — `available` TEK BASINA yetmez:
// available: true + deger null gelirse hucre bos kalirdi (kod inceleme
// bulgusu). SiteCard/SiteHeroBar ile ayni kural: bayrak VE deger.
function hasRealValue(placeholder: AnyPlaceholder): boolean {
  const raw = placeholder.count ?? placeholder.value;
  return placeholder.available && raw !== null && raw !== undefined;
}

// Iki yer tutucu seklinin ortak okuma yuzeyi: sayaclar `count`, tutar/yuzde
// `value` tasir.
type AnyPlaceholder = {
  available: boolean;
  count?: number | null;
  value?: string | null;
  pending_module?: PendingModuleKey;
};

export interface SectionCardProps {
  /** ADRESTEKI proje/santiye anahtarlari (slug VEYA UUID) — bkz. `SiteDetailTabs`. */
  projectKey: string;
  siteKey: string;
  section: SectionResponse;
}

// Durum etiketleri mockup'tan birebir (spec §5.4). `on_hold` F-P6 T2'de
// GERÇEK tasarımını aldı — metni `section-labels.ts`teki tek kaynaktan gelir
// (Bölüm Detay hero rozetiyle PAYLAŞILIR, artık `planned` kopyası DEĞİL).
// Diğer üç durumun kart-özel (daha uzun) metni burada kalır — o metinler
// yalnız bu listede kullanılır, T2 hero'da kısa biçim basılır.
const STATUS_LABELS: Record<SectionStatus, string> = {
  completed: "Tamamlandı",
  active: "Aktif — Devam Ediyor",
  planned: "Planlandı",
  on_hold: SECTION_STATUS_LABELS.on_hold,
};

// Durum -> sınıf eki TEK KAYNAKTAN gelir (`SECTION_STATUS_CLASS_SUFFIX`,
// SectionDetailView ile PAYLAŞILIR). Dört ayrı Record'a "on_hold: planned"
// kopyalamak yerine tek haritadan türetilir (kod inceleme bulgusu düzeltmesi,
// F-P6 T2).
function statusClass(prefix: string, status: SectionStatus): string {
  return `${prefix}--${SECTION_STATUS_CLASS_SUFFIX[status]}`;
}

// Metrik etiketleri duruma gore degisir — mockup KAZANIR (spec §5.4 sabit
// dortluyu yaziyordu, mockup ise satir bazinda farkli etiket basiyor):
//   tamamlandi (satir 178, 215) "Bölüm Bedeli" · (182, 219) "İşçi (zirve)"
//   aktif      (satir 252)      "Bölüm Bedeli" · (256)      "Aktif İşçi"
//   planlandi  (satir 288, 324) "Tahmini Bedel" · (292, 328) "Planlanan İşçi"
// "İlerleme" (168/205/242/279/315) ve "İş Kalemleri" (173/210/247/284/320)
// her durumda AYNI kalir — bu yuzden sabit metin olarak basilir.
const STATUS_BUDGET_LABEL: Record<SectionStatus, string> = {
  completed: "Bölüm Bedeli",
  active: "Bölüm Bedeli",
  planned: "Tahmini Bedel",
  on_hold: "Tahmini Bedel",
};

const STATUS_WORKER_LABEL: Record<SectionStatus, string> = {
  completed: "İşçi (zirve)",
  active: "Aktif İşçi",
  planned: "Planlanan İşçi",
  on_hold: "Planlanan İşçi",
};

// "Planlanan İşçi" etiketini tasiyan durumlar — hucrenin KAYNAGI da burada
// belirlenir. Etiket ile kaynagin ayni yerden turemesi, ikisinin zamanla
// ayrismasini (ör. "Planlanan İşçi" yazip AKTIF isci sayisi basmak) engeller.
const PLANNED_WORKER_STATUSES: ReadonlySet<SectionStatus> = new Set<SectionStatus>(
  (Object.keys(STATUS_WORKER_LABEL) as SectionStatus[]).filter(
    (status) => STATUS_WORKER_LABEL[status] === "Planlanan İşçi",
  ),
);

// Yer tutucu metrik hucresi — duzeni korur, "—" basar, title'da aciklama verir
// (spec §7.1, SiteHeroBar/SiteCard'daki PlaceholderValue deseniyle ayni).
function PlaceholderValue({ valueClassName, pendingModule }: { valueClassName: string; pendingModule: PendingModuleKey }) {
  return (
    <div className={cx(valueClassName, "section-card__metric-value--pending")} title={pendingModuleHint(pendingModule)}>
      —
    </div>
  );
}

// "Nis 2025 – Tem 2025 · Sorumlu: M. Arslan" — tek ay araligiysa tek kez basilir,
// sorumlu yoksa "Atanmadı" (mockup Bölüm 5 deseni).
function sectionMeta(section: SectionResponse): string {
  const parts: string[] = [];
  const start = section.start_date ? formatMonthYear(section.start_date) : null;
  const end = section.end_date ? formatMonthYear(section.end_date) : null;
  if (start && end) {
    parts.push(start === end ? start : `${start} – ${end}`);
  } else if (start ?? end) {
    parts.push((start ?? end) as string);
  }
  parts.push(section.manager_name ? `Sorumlu: ${section.manager_name}` : "Atanmadı");
  return parts.join(" · ");
}

interface MetricCellProps {
  label: string;
  valueClassName?: string;
  placeholder: CountPlaceholder | MetricPlaceholder;
  children: React.ReactNode;
}

function MetricCell({ label, valueClassName = "section-card__metric-value", placeholder, children }: MetricCellProps) {
  return (
    <div className="section-card__metric">
      <div className="section-card__metric-label">{label}</div>
      {hasRealValue(placeholder) ? (
        <div className={valueClassName}>{children}</div>
      ) : (
        <PlaceholderValue valueClassName={valueClassName} pendingModule={placeholder.pending_module} />
      )}
    </div>
  );
}

const BOQ_NOTE_TITLE = "İş kalemi tahsislerinden türeyen tutar (miktar × birim fiyat)";

// ── "Bölüm Bedeli" hucresi — IKI ADAY, IKISI DE BASILIR ────────────────────
//
// 🔴 URUN KARARI (yonetim, 2026-08-27). `SectionResponse` bu turdan itibaren
// AYNI kutuya aday IKI alan tasiyor ve `Section` docstring'i (P6 §7 S2a) ikisinin
// AYRI KOLON oldugunu, birinin digerinin YERINE GECMEDIGINI soyluyor:
//   · `budget_amount` — ELLE GIRILEN bedel (bolum formundan). ASIL degerdir.
//   · `budget`        — BOQ tahsislerinden TUREYEN tutar (BLM-SAY):
//                       Σ(bolume tahsis edilen miktar × pozun birim fiyati).
// Birini secip digerini gizlemek, kullanicinin elle girdigi bedelin BOQ'dan
// ayristigini EKRANDAN OKUYAMAMASI demekti. Bu yuzden kutu iki satirlidir:
// ust satir `budget_amount`, alt satir "BOQ: …". Ayrismayi ekran SAKLAMAZ.
//
// ⚠️ MOCKUP SAPMASI: `Şantiye Detay.dc.html:178-179` bu kutuda TEK satir cizer
// ("₺1,84M"); alt satir mockup'ta YOKTUR. Sapma bilinclidir ve raporlandi.
// Alt satirin bicimi mockup'in KOMSU kutusundaki not satirindan alinmistir
// (`:175` "Tümü tamamlandı" — 11px, `margin-top:2px`), yani kart icinde yeni bir
// tipografi ICAT EDILMEDI.
//
// `budget_amount` `null` iken sahte sifir basilmaz — SectionHeroCard'daki
// `BudgetCell` ile AYNI davranis: "—" basilir ve GEREKCE VERILMEZ (2026-09-20;
// eski ortak baslik "Bölüm bedeli girilmemiş" idi ve maskeli rolde YALANDI).
function BudgetMetricCell({
  label,
  budgetAmount,
  boqBudget,
}: {
  label: string;
  budgetAmount: SectionResponse["budget_amount"];
  boqBudget: SectionResponse["budget"];
}) {
  const moneyClass = "section-card__metric-value section-card__metric-value--money";
  const isManualReal = budgetAmount !== null && budgetAmount !== undefined;
  // 🔴 K-MKD3: "satir yok" ≠ "deger 0" ≠ "henuz bilinmiyor". BOQ tarafinda
  // tahsisi olmayan bolum `available: true` + `"0.00"` doner ve bu YER TUTUCU
  // DEGILDIR — "BOQ: ₺ 0" DOGRU bir cumledir. Bu yuzden `available` bayragina
  // bakilir, `pending_module`un varligina DEGIL (dolu `MetricPlaceholder`
  // zaten `pending_module` TASIYAMAZ — `CountPlaceholder`in TERSI kural).
  const isBoqReal = hasRealValue(boqBudget);
  return (
    <div className="section-card__metric">
      <div className="section-card__metric-label">{label}</div>
      {isManualReal ? (
        <div className={moneyClass}>{formatCompactCurrency(budgetAmount)}</div>
      ) : (
        // 🔴 GEREKÇE YAZILMAZ (2026-09-20). Eskiden burada
        // `title="Bölüm bedeli girilmemiş"` vardı; bu bir İDDİADIR ve ekranın
        // onu kanıtlayacak bilgisi YOKTUR: `budget_amount` null gelmesinin iki
        // sebebi var (girilmemiş · KAPSAM MASKESİ düşürmüş) ve `/auth/me` yükü
        // kapsam taşımadığı için ikisi istemcide ayırt EDİLEMEZ. `sites =
        // view/limited` olan rol (şantiye şefi) gerçek bir bedeli "girilmemiş"
        // diye okuyordu. Kanon: gerekçe ancak KANITLIYSA basılır
        // (`contract-progress.ts::isProvenZeroAmount` emsali).
        <div className={cx(moneyClass, "section-card__metric-value--pending")}>—</div>
      )}
      {isBoqReal ? (
        <div className="section-card__metric-note" title={BOQ_NOTE_TITLE}>
          {`BOQ: ${formatCompactCurrency(boqBudget.value ?? 0)}`}
        </div>
      ) : (
        <div
          className={cx("section-card__metric-note", "section-card__metric-note--pending")}
          title={pendingModuleHint(boqBudget.pending_module)}
        >
          BOQ: —
        </div>
      )}
    </div>
  );
}

// ── "Planlanan İşçi" hucresi ───────────────────────────────────────────────
//
// `planned_worker_count` DUZ bir sayidir (zarf DEGIL): "girilmemis" tek hâli
// `null`dur, "hangi modul gelince dolacak" sorusu YOKTUR. Bu yuzden
// `MetricCell`in zarf yolundan gecmez.
function PlannedWorkerCell({
  label,
  plannedWorkerCount,
}: {
  label: string;
  plannedWorkerCount: SectionResponse["planned_worker_count"];
}) {
  const isReal = plannedWorkerCount !== null && plannedWorkerCount !== undefined;
  return (
    <div className="section-card__metric">
      <div className="section-card__metric-label">{label}</div>
      {isReal ? (
        <div className="section-card__metric-value">{plannedWorkerCount}</div>
      ) : (
        <div
          className="section-card__metric-value section-card__metric-value--pending"
          title="Planlanan işçi sayısı girilmemiş"
        >
          —
        </div>
      )}
    </div>
  );
}

// "İlerleme" hucresi mockup'ta her durumda mini bir cubuk cizer (satir 170,
// 207, 244, 281, 317). Yer tutucuyken sahte %0 izlenimi vermemek icin dolgu
// basilmaz, yalniz bos iz birakilir (spec §7.1, SiteHeroBar/SiteCard ile ayni
// desen). Gercek deger geldiginde renk semasi duruma gore degisir (kod
// inceleme bulgusu — ilk surumde her zaman "aktif/mavi" semasi sabitti):
// tamamlandi=yesil, aktif=mavi, planlandi=notr gri (mockup satir 169-170,
// 206-207, 243-244, 280-281, 316-317). Yer tutucuyken durum rengi
// uygulanmaz — bilinmeyen bir degere yanlislikla yesil/mavi boyamamak icin.
function ProgressMetricCell({
  progress,
  status,
}: {
  progress: SectionResponse["progress_pct"];
  status: SectionStatus;
}) {
  const isReal = hasRealValue(progress);
  const progressClass = isReal ? statusClass("section-card__metric-progress", status) : undefined;
  return (
    <div className="section-card__metric">
      <div className="section-card__metric-label">İlerleme</div>
      {isReal ? (
        <div
          className={cx(
            "section-card__metric-value",
            "section-card__metric-value--progress",
            progressClass,
          )}
        >
          {/* FAZ 2d: `.value` artık Percent marka'lı — kaçış YOK. */}
          {formatPercent(progress.value ?? "0")}
        </div>
      ) : (
        <PlaceholderValue
          valueClassName="section-card__metric-value section-card__metric-value--progress"
          pendingModule={progress.pending_module}
        />
      )}
      <div
        className={cx("section-card__metric-track", progressClass)}
        data-testid="section-card-progress-track"
      >
        {isReal && (
          <div
            className={cx("section-card__metric-track-fill", progressClass)}
            data-testid="section-card-progress-fill"
            style={{ width: `${Math.min(Number(progress.value), 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}

// Bölüm kartı (spec §5.4, mockup Şantiye Detay.dc.html satır 153+). Dört metrik
// (İlerleme · İş Kalemleri · bedel · işçi — son ikisinin etiketi VE bedel/işçi
// hücrelerinin KAYNAĞI duruma gore degisir, bkz. STATUS_BUDGET_LABEL/
// STATUS_WORKER_LABEL/PLANNED_WORKER_STATUSES).
//
// 🔴 F-BLMKART (2026-08-27) — kullanicinin canlida bildirdigi "dort alan da bos"
// kusuru burada kapandi. Onceki surumde DORDU DE yer tutucuydu; backend BLM-SAY
// (`1def2b9`) ile:
//   · `boq_item_count` · `budget` yer tutucu OLMAKTAN CIKTI (BOQ tahsis turevi),
//   · `budget_amount` · `planned_worker_count` LISTE yanitina EKLENDI
//     (deger zaten vardi, uc dondurmuyordu — kusurun gercek sebebi buydu).
// ⛔ `progress_pct` HÂLÂ YER TUTUCUDUR ve bilerek oyle birakildi: besleyen taraf
// (`boq.schemas` `BoqItemResponse.progress_pct`) da yer tutucu, burada bir yuzde
// uretmek onu ICAT etmek olurdu. "İlerleme" sutunu DURUST BOS kalir.
//
// "3 gecikme riski" satiri KASITLI olarak basilmaz (spec §7.2) — backend bu
// alani hic dondurmuyor.
//
// F-P6 T2: Bölüm Detay ekranı artık GERÇEK olduğu için kart her durumda ORAYA
// linklenir (task-2-brief.md "SectionCard güncellemesi") — önceki "planned ->
// devre dışı Düzenle" placeholder'ı kaldırıldı (T3 ayrı bir düzenleme rotası
// açacak, kart eylemi yalnız DETAYA gider).
export function SectionCard({ projectKey, siteKey, section }: SectionCardProps) {
  const isPlanned = section.status === "planned";
  // Bolume GIRIS baglantisi: bolumun okunur anahtari KAYITTAN gelir
  // (`SectionResponse.slug`, URL-2). `slug` NULLABLE — `routeKeyOf` duser.
  const detayHref = routes.projects.sites.sections.detail({
    projectId: projectKey,
    siteId: siteKey,
    sectionId: routeKeyOf(section),
  });

  return (
    <div className={cx("section-card", statusClass("section-card", section.status))}>
      <div
        className={cx("section-card__strip", statusClass("section-card__strip", section.status))}
        aria-hidden="true"
      />
      <div className="section-card__body">
        <div>
          <div className="section-card__name-row">
            <span className={cx("section-card__name", isPlanned && "section-card__name--muted")}>
              {section.name}
            </span>
            <span className={cx("section-card__status", statusClass("section-card__status", section.status))}>
              {STATUS_LABELS[section.status]}
            </span>
          </div>
          <div className="section-card__meta">{sectionMeta(section)}</div>
        </div>

        <ProgressMetricCell progress={section.progress_pct} status={section.status} />

        {/* "İş Kalemleri" — TEK SAYI basilir (yonetim karari, 2026-08-27).
            🔴 MOCKUP SAPMASI: mockup bu kutuya KESIR yazar — `Şantiye Detay.dc.html:174`
            "14 / 14", `:211` "22 / 22", `:248` "16 / 26", `:285` "0 / 18",
            `:321` "0 / 6" — yani TAMAMLANAN / TOPLAM. Backend yalnizca PAYDAYI
            uretebiliyor: `boq_item_count` = "bu bolume EN AZ BIR tahsis satiri
            dusmus FARKLI poz" sayisi (`backend/app/modules/boq/counts.py`).
            PAYIN KAYNAGI REPODA YOKTUR — `boq_item_section_allocations`ta
            "tamamlandi" bayragi yok, gerceklesen taraf (`progress_pct`) hâlâ yer
            tutucu. Pay UYDURULMADI: "26 is kalemi" DOGRU bir cumledir, "16 / 26"
            olurdu ki 16'nin arkasinda hicbir olcum yok.
            Mockup'in alt satirlari ("Tümü tamamlandı" `:175`/`:212` / "3 gecikme riski"
            `:249`) de ayni sebeple basilmaz (spec §7.2, onceden alinmis karar).
            🔴 K-MKD3: tahsisi olmayan bolum `available: true` + `count: 0` doner
            ve bu YER TUTUCU DEGILDIR — "0" basilir, "—" YANLIS olurdu. */}
        <MetricCell label="İş Kalemleri" placeholder={section.boq_item_count}>
          {section.boq_item_count.count}
        </MetricCell>

        <BudgetMetricCell
          label={STATUS_BUDGET_LABEL[section.status]}
          budgetAmount={section.budget_amount}
          boqBudget={section.budget}
        />

        {/* Isci hucresinin KAYNAGI etiketiyle birlikte degisir
            (STATUS_WORKER_LABEL ile AYNI dallanma, tek yerde tutulur):
            · "Aktif İşçi" / "İşçi (zirve)" → `worker_count` (puantaj turevi zarf)
            · "Planlanan İşçi"              → `planned_worker_count` (kayitli kolon)
            Planlanmis bir bolumde "aktif isci" sayisini basmak, is baslamamis bir
            bolum icin puantaj sayisi gostermek olurdu. */}
        {PLANNED_WORKER_STATUSES.has(section.status) ? (
          <PlannedWorkerCell
            label={STATUS_WORKER_LABEL[section.status]}
            plannedWorkerCount={section.planned_worker_count}
          />
        ) : (
          <MetricCell label={STATUS_WORKER_LABEL[section.status]} placeholder={section.worker_count}>
            {section.worker_count.count}
          </MetricCell>
        )}

        <div className="section-card__action">
          <Link
            href={detayHref}
            className={cx(
              "section-card__action-btn",
              section.status === "active"
                ? "section-card__action-btn--solid"
                : "section-card__action-btn--ghost",
            )}
          >
            Detay →
          </Link>
        </div>
      </div>
    </div>
  );
}
