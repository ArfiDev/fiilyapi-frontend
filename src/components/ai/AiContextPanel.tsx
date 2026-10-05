"use client";

import Link from "next/link";
import { Button, Select } from "@/components/ui";
import { currentPeriod } from "@/components/timesheet/month";
import { formatMonthName, formatPercent } from "@/lib/format";
import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { countCell, metricCell, type PlaceholderCell } from "@/lib/placeholder-cell";
import type { ProjectListItem } from "@/lib/api/hooks/useProjects";
import type { SiteListItem } from "@/lib/api/hooks/useSites";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { physicalLabel } from "@/lib/auth/physicalLabel";
import "./ai-panel.css";

/**
 * Sağ sütun — *Sohbet Bağlamı* · *Hızlı Analizler* · *Bu Sohbette Açılanlar*
 * (mockup 366-395).
 *
 * ## AI-BAĞLAM · panel SÜS olmaktan çıktı
 *
 * Mockup bu kartı **şantiye kapsamlı** çizer (*Güneşkent Konut · 📍 A-Blok
 * Şantiyesi · Dönem · İlerleme · Aktif işçi*); kod yalnız **proje** seçtiriyor
 * ve üç satırın üçü de yalan söylüyordu. Kaskad artık **proje → şantiye**dir ve
 * seçilen kapsam `POST /ai/chat` gövdesiyle **modele ve araçlara** gider.
 *
 * ## 🔴 ÜÇ SAYININ KAYNAĞI ÖLÇÜLDÜ — hepsi ŞANTİYE KARTINDAN
 *
 * Görev emri üçünü `GET /sites/{site_id}/timesheet/week`ten istiyordu. Ölçüm o
 * tarifi çürüttü ve emrin kendi *"K-BAYAT GEREKÇE"* notu bu ölçümü zaten
 * istiyordu:
 *
 * `SiteCard` (`GET /projects/{project_id}/sites` — kaskadın **zaten çektiği**
 * yanıt) İKİ sayıyı da ZORUNLU alan olarak taşır:
 *   · `worker_count` → `CountPlaceholder`, backend'de T4'te BAĞLANDI
 *     (`sites/service/presenters.py::_worker_count`). Kaynağı
 *     `timesheet/counts.py::by_site`: **içinde bulunulan ayda** puantaj kaydı
 *     olan DISTINCT personel. O modülün docstring'i sayacın mockup karşılığını
 *     ADIYLA yazar: *"ŞP 118 · 48 işçi"* — bu panelin *"Aktif işçi: 48"*
 *     satırıyla AYNI sayıdır.
 *   · `progress_pct` → `MetricPlaceholder`, **ILR-1'de bağlandı** (2026-08-27);
 *     kaynağı gönderilmiş şantiye günlüğü, **izne duyarlı** (`restricted()`).
 *
 * Haftalık uç yerine bu kaynağın seçilmesinin ÜÇ ölçülmüş sebebi var:
 *   1. **Ayrışma riski.** Haftalık `worker_count` ile şantiye kartının aylık
 *      `worker_count`u AYNI şantiye için FARKLI iki sayıdır; kullanıcı iki
 *      ekranda iki "aktif işçi" görürdü. `counts.py` modül notu tam olarak bu
 *      sınıfı önlemek için yazılmış: *"iki ayrı sayım mantığı zamanla ayrışır"*.
 *   2. **Mockup.** Mockup dönemi AY yazar (*"Temmuz 2026"*). Sayının dönemi de
 *      ay olunca etiket ile sayı AYNI şeyi söyler; haftalık uçta panel "36.
 *      hafta" yazıp altında aylık olmayan bir sayı basardı.
 *   3. **Bedel.** Haftalık uç bir hafta boyunca KİŞİ BAŞI matris döndürür
 *      (`rows` · `day_totals` · `month_weeks`); tek bir sayı için ikinci ve ağır
 *      bir istek açardı. Bu kaynak **zaten elimizde**.
 *
 * ## 🔴 `%0` NEREDEN GELİYORDU — fosil sütun
 *
 * Panel ilerlemeyi `ProjectListItem.progress_pct`ten okuyordu. O alan zarf
 * DEĞİL düz bir `Decimal`dir ve **ölü bir sütundur**: `projects.progress_pct`e
 * yazan HİÇBİR uygulama kodu yoktur (`ProjectCreate`/`ProjectUpdate` alanı
 * taşımaz), bekçisi `test_projects_progress_pct_sutununun_YAZMA_YOLU_YOKTUR`.
 * Kullanıcının açtığı her projede kalıcı olarak `0`. Yani ekrandaki *"%0"* bir
 * ölçüm değil, **düzeltilmesi imkânsız bir uydurmaydı** — okuma buradan
 * tamamen kaldırıldı.
 *
 * ## 🔴 "bağlanmadı" metinleri KALDIRILDI
 *
 * Eski `BAGLANMADI_DONEM` / `BAGLANMADI_ISCI` sabitleri *"parametresiz bir
 * kaynağı yoktur"* diyordu; ölçüm bunu çürüttü (yukarıya bakınız). Şantiye
 * seçilmemişken basılan metin artık DURUMU tarif eder — *"Şantiye seçin"* —,
 * bir eksikliği değil.
 */

/** Şantiye seçilmeden üç satırın da söyleyebileceği TEK dürüst cümle. */
const SANTIYE_SECIN = "Şantiye seçin";

/**
 * Şantiye seçilmemişken satırın `title`ı. "bağlanmadı" DEĞİL: veri bağlıdır,
 * eksik olan KAPSAMDIR.
 */
const SANTIYE_SECIN_SEBEBI =
  "Bu üç sayı şantiye kapsamlıdır; yukarıdaki seçiciden bir şantiye seçin.";

/** `Dönem` satırının `title`ı — sayının hangi pencereyi ölçtüğünü söyler. */
const DONEM_SEBEBI =
  "Aktif işçi sayısı bu ayın puantaj kayıtlarından gelir; dönem içinde bulunulan aydır.";

/** Mockup 384-390 — beş hızlı analiz çipi (başlık + alt metin). */
export const HIZLI_ANALIZLER: readonly { simge: string; baslik: string; alt: string; soru: string }[] =
  [
    {
      simge: "📊",
      baslik: "Hakediş Özeti",
      alt: "Bu ayın tablosu",
      soru: "Bu ayki hakediş özetini göster.",
    },
    {
      simge: "⚠️",
      baslik: "Risk Taraması",
      alt: "Stok, gecikme, nakit",
      soru: "Şu anki riskleri tara: stok, gecikme ve nakit akışı.",
    },
    {
      simge: "💰",
      baslik: "Kâr Analizi",
      alt: "Proje bazlı marj",
      soru: "Projelerin marjını karşılaştır.",
    },
    {
      simge: "📅",
      baslik: "Haftalık Plan",
      alt: "Ekip ve makine",
      soru: "Bu hafta ne planlandı? Ekip ve makine dağılımını göster.",
    },
    {
      simge: "🧾",
      baslik: "Fatura Kontrolü",
      alt: "Eşleşmeyen kalemler",
      soru: "Eşleşmeyen fatura kalemlerini listele.",
    },
  ];

export interface AiAcilanKayit {
  etiket: string;
  yol: string | null;
  sebep: string;
}

export interface AiContextPanelProps {
  projeler: readonly ProjectListItem[];
  seciliProje: ProjectListItem | null;
  /** Etkin projenin şantiyeleri. Proje yoksa BOŞ — hook ağa çıkmaz. */
  santiyeler: readonly SiteListItem[];
  seciliSantiye: SiteListItem | null;
  /** Şantiye listesi hâlâ yolda — "şantiye yok" demek YANLIŞ olurdu. */
  santiyelerYukleniyor: boolean;
  projeYetkisiVar: boolean;
  akiyor: boolean;
  /**
   * 🔴 Saat DIŞARIDAN gelir. Bileşenin içinde `new Date()` çağırmak hem
   * `product-date-inventory` kaydını büyütür hem de görsel kadrajın
   * `page.clock.setFixedTime` dondurmasını bileşen düzeyinde test edilemez
   * kılardı (`AiHistory`nin `simdi` propu ile aynı gerekçe).
   */
  simdi: Date;
  /** "Bu Sohbette Açılanlar" — bu turda gerçekten üretilen derin bağlantılar. */
  acilanlar: readonly AiAcilanKayit[];
  onProjeSec: (id: string) => void;
  onSantiyeSec: (id: string) => void;
  onHizliAnaliz: (soru: string) => void;
}

/**
 * Bir zarf hücresini `<dd>`ye çevirir.
 *
 * 🔴 `pending` hâlde SAYI BASILMAZ: `metricCell`/`countCell` boş zarfta
 * `text: null` döndürür ve buraya "—" düşer. `%0` gibi yetkili görünen bir
 * sayı üretmenin yolu yoktur — zarfın üç hâli tek yerden okunur (K-ZARF).
 */
function ZarfSatiri({
  etiket,
  hucre,
  testId,
  vurgulu = false,
}: {
  etiket: string;
  hucre: PlaceholderCell;
  testId: string;
  /** Mockup'ta MAVİ basılan tek satır "İlerleme"dir (371-373). */
  vurgulu?: boolean;
}) {
  return (
    <div className="ai-context__row">
      <dt>{etiket}</dt>
      {hucre.text === null ? (
        <dd className="ai-context__pending" data-testid={testId} title={hucre.hint}>
          —
          {hucre.isHidden && <HiddenMark />}
        </dd>
      ) : (
        <dd
          className={vurgulu ? "ai-context__strong" : "ai-context__value"}
          data-testid={testId}
        >
          {hucre.text}
        </dd>
      )}
    </div>
  );
}

/** Şantiye seçilmemişken basılan satır — bir sayı değil, bir YÖNERGE. */
function KapsamSatiri({ etiket }: { etiket: string }) {
  return (
    <div className="ai-context__row">
      <dt>{etiket}</dt>
      <dd className="ai-context__pending" title={SANTIYE_SECIN_SEBEBI}>
        {SANTIYE_SECIN}
      </dd>
    </div>
  );
}

export function AiContextPanel({
  projeler,
  seciliProje,
  santiyeler,
  seciliSantiye,
  santiyelerYukleniyor,
  projeYetkisiVar,
  akiyor,
  simdi,
  acilanlar,
  onProjeSec,
  onSantiyeSec,
  onHizliAnaliz,
}: AiContextPanelProps) {
  const { isRestricted } = useDisciplineScope();
  // 🔴 Mockup'ın "Temmuz 2026" sabiti KOPYALANMAZ, TÜRETİLİR: ay adı
  // `formatMonthName` tek kaynağından, dönem `currentPeriod` tek kaynağından
  // (`timesheet/month.ts` — sayının sunucudaki dönem kuralının, yani
  // `timesheet/counts.py::current_period`in birebir ikizi).
  const donem = currentPeriod(simdi);
  const donemMetni = `${formatMonthName(donem.month)} ${donem.year}`;

  return (
    <aside className="ai-context" aria-label="Sohbet bağlamı">
      <h2 className="ai-context__heading">Sohbet Bağlamı</h2>
      <div className="ai-context__card">
        {!projeYetkisiVar ? (
          <p className="ai-context__reason">
            Proje bağlamını görmek için <strong>Projeler</strong> yetkisi gerekiyor. Bu bir
            sistem hatası değildir.
          </p>
        ) : seciliProje === null ? (
          <p className="ai-context__reason">
            Kapsamınızda görünen bir proje yok. Bu, hiç proje olmadığı anlamına gelmez.
          </p>
        ) : (
          <>
            <p className="ai-context__project">{seciliProje.name}</p>
            {/* Mockup 368: "📍 A-Blok Şantiyesi" — burada PROJE KODU değil
                ŞANTİYE ADI durur. Eski kod projenin `code`unu basıyordu. */}
            {/* 🔴 `data-testid`: şantiye ADI hem burada hem seçicinin
                `<option>`unda geçer; metinle sorgulamak İKİ eşleşme bulur ve
                testi kırılgan yapar. Kimlik, iddianın hangi yüzeye ait
                olduğunu belirsizlikten çıkarır. */}
            <p className="ai-context__site" data-testid="ai-baglam-santiye">
              <span aria-hidden="true">📍</span>{" "}
              {seciliSantiye ? seciliSantiye.name : SANTIYE_SECIN}
            </p>
            <dl className="ai-context__rows">
              {seciliSantiye === null ? (
                <>
                  <KapsamSatiri etiket="Dönem" />
                  <KapsamSatiri etiket="İlerleme" />
                  <KapsamSatiri etiket="Aktif işçi" />
                </>
              ) : (
                <>
                  <div className="ai-context__row">
                    <dt>Dönem</dt>
                    <dd
                      className="ai-context__value"
                      data-testid="ai-baglam-donem"
                      title={DONEM_SEBEBI}
                    >
                      {donemMetni}
                    </dd>
                  </div>
                  <ZarfSatiri
                    etiket={physicalLabel("İlerleme", isRestricted)}
                    testId="ai-baglam-ilerleme"
                    vurgulu
                    hucre={metricCell(seciliSantiye.progress_pct, formatPercent)}
                  />
                  <ZarfSatiri
                    etiket="Aktif işçi"
                    testId="ai-baglam-isci"
                    hucre={countCell(seciliSantiye.worker_count, (n) => String(n))}
                  />
                </>
              )}
            </dl>
          </>
        )}

        {/* Mockup 379 "Bağlamı Değiştir" DÜZ bir düğmedir ve neyin
            değiştiğini söylemez. SAPMA + GEREKÇE: iki açılır seçici basılır —
            kapsam iki katmanlıdır (proje → şantiye) ve tek bir düğme, hangi
            katmanın değiştiğini kullanıcıya sormadan çözemezdi.
            🔴 Ham `<select>` YASAK; `ui/` primitive'i. */}
        {projeYetkisiVar && projeler.length > 0 ? (
          <>
            <Select
              className="ai-context__switch"
              aria-label="Bağlamı Değiştir"
              value={seciliProje?.id ?? ""}
              onChange={(e) => onProjeSec(e.target.value)}
            >
              {projeler.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {/* 🔴 Şantiyesi olmayan proje için BOŞ bir seçici basılmaz: boş
                açılır kutu "seçenek yok" demez, "yükleniyor" sanılır. */}
            {santiyeler.length > 0 ? (
              <Select
                className="ai-context__switch"
                aria-label="Şantiye Seç"
                value={seciliSantiye?.id ?? ""}
                onChange={(e) => onSantiyeSec(e.target.value)}
              >
                {santiyeler.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            ) : santiyelerYukleniyor ? null : (
              <p className="ai-context__reason">Bu projede görünen bir şantiye yok.</p>
            )}
          </>
        ) : null}
      </div>

      <h2 className="ai-context__heading">Hızlı Analizler</h2>
      <div className="ai-context__chips">
        {HIZLI_ANALIZLER.map((c) => (
          <Button
            key={c.baslik}
            variant="ghost"
            className="ai-chip"
            disabled={akiyor}
            onClick={() => onHizliAnaliz(c.soru)}
          >
            <span className="ai-chip__icon" aria-hidden="true">
              {c.simge}
            </span>
            <span className="ai-chip__body">
              <span className="ai-chip__title">{c.baslik}</span>
              <span className="ai-chip__sub">{c.alt}</span>
            </span>
          </Button>
        ))}
      </div>

      <h2 className="ai-context__heading">Bu Sohbette Açılanlar</h2>
      <div className="ai-context__opened">
        {acilanlar.length === 0 ? (
          // 🔴 Mockup'ta dolu görünen bu liste SAHTE VERİYLE doldurulmaz:
          // içeriği turun GERÇEKTEN ürettiği kaynaklardan gelir.
          <p className="ai-context__reason">
            Henüz bir kaynak açılmadı. Bir soru sorduğunuzda AI&apos;ın okuduğu ekranlar burada
            listelenir.
          </p>
        ) : (
          acilanlar.map((a) =>
            a.yol === null ? (
              <button
                key={a.etiket}
                type="button"
                className="ai-opened ai-opened--disabled"
                disabled
                title={a.sebep}
              >
                {a.etiket}
              </button>
            ) : (
              <Link key={a.etiket} href={a.yol} className="ai-opened">
                {a.etiket}
              </Link>
            ),
          )
        )}
      </div>
    </aside>
  );
}
