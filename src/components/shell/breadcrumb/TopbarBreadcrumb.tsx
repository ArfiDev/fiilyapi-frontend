"use client";

/**
 * F-KIRINTI → SEKME-F1.7a · üst çubuk yol göstergesi + geri tuşu.
 *
 * KULLANICI KARARI (SEKME-F1.7a): önceki "kırıntı içeriğe iner" kararı GERİ
 * ALINDI — "üstteki gibi kalsın, sekmeler onun yanına gelsin". Kırıntı
 * main'deki (5fc3a54) `TopbarBreadcrumb` görünümüne ve davranışına DÖNER:
 * logo | KIRINTI | sekme şeridi | eylemler. K2/K3/K6/K7 kanonları ve ← geri
 * tuşu `trail.ts`ten AYNEN devralınır — bu dosya yalnız DOM'u kurar.
 *
 * 🔴 main'in aksine tek bir davranış GERİ GELMEDİ: main'de kırıntı HER
 * rotada (ör. kök `/`, tek parçalı modül kökleri) basılıyordu — kullanıcı
 * kararı bunu AYNEN korur ("main davranışı KORUNUR — tek parçalıda da
 * basılır"). Önceki `PageBreadcrumb`in "tek parçalıysa hiç basma" ve
 * "/ayarlar altında basma" kuralları İÇERİK satırına aitti, o bileşenle
 * BİRLİKTE kalktı.
 *
 * ─── /ayarlar altında NEDEN ÖZEL BİR DALLANMA YOK ────────────────────────
 * `route-tree.ts`in kök çocuğu `ayarlar` KENDİ alt ağacını (her ayarlar
 * sayfası için `label`/`href`) zaten taşıyor — `buildTrail("/ayarlar/
 * kullanicilar", …)` doğrudan `["Ayarlar", "Kullanıcılar"]` üretir. İkinci
 * bir kaynak (`settingsLabelForPath`) İCAT EDİLMEDİ: aynı bilginin iki yerde
 * yaşaması bir gün birbirinden SESSİZCE ayrışabilirdi (bkz. `settings-nav-
 * config.ts`teki grup/emoji listesi zaten ayrı bir kaynak — kırıntı ona
 * ihtiyaç duymuyor).
 *
 * ─── Genişlik: ESNEMEZ + max-width (`topbar.css`) ────────────────────────
 * Kırıntı artık `flex: 1` DEĞİL (o alan sekme şeridine ait) — `flex-shrink:
 * 0` ve sabit bir `max-width` taşır, uzun parçalar KENDİ içinde `ellipsis`
 * ile kısalır (aşağıdaki `CrumbText` her parçaya tam adı `title` olarak
 * basar). Gerekçe ve ölçüm `topbar.css`te.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { backTarget, buildTrail, routeKeysOf, type Crumb } from "./trail";
import { useCrumbNames } from "./useCrumbNames";

function CrumbText({ crumb }: { crumb: Crumb }) {
  if (!crumb.pending) return <>{crumb.label}</>;
  // K6 — ad gelene kadar YALAN SÖYLEME: ham UUID/slug yerine yer tutucu.
  // Yedek etiket ("Şantiye") ekran okuyucuya `sr-only` ile okunur; shimmer
  // yalnız görsel bir yer tutucudur.
  return (
    <span className="topbar-crumbs__pending" data-testid="crumb-pending">
      <span className="sr-only">{crumb.label}</span>
    </span>
  );
}

export function TopbarBreadcrumb() {
  // `usePathname` App Router'da her zaman string döner; savunma yalnız
  // bileşenin router dışında (test/hikaye) render edilmesi içindir.
  const pathname = usePathname() ?? "/";
  const keys = routeKeysOf(pathname);
  const names = useCrumbNames(keys);
  const trail = buildTrail(pathname, names);
  const back = backTarget(trail);

  return (
    <nav className="topbar-crumbs" aria-label="Yol göstergesi">
      {back?.href !== undefined && (
        <Link
          href={back.href}
          className="topbar-crumbs__back"
          data-testid="topbar-back"
          // Hedefin adı hemen sağdaki kırıntı parçasında zaten yazılı; tuş
          // onu tekrarlamaz ama erişilebilir ad ve ipucu ONU söyler.
          aria-label={`${back.label} sayfasına dön`}
          title={`${back.label} sayfasına dön`}
        >
          <span aria-hidden="true">←</span>
        </Link>
      )}
      <ol className="topbar-crumbs__list" data-testid="topbar-crumbs">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          // Tam ad daralmış (ellipsis) parçada `title` tooltip'iyle okunur;
          // iskelet hâlindeyken (`pending`) henüz bir "tam ad" yoktur.
          const fullName = crumb.pending ? undefined : crumb.label;
          return (
            <li key={crumb.href ?? `crumb-${index}`} className="topbar-crumbs__item">
              {index > 0 && (
                <span className="topbar-crumbs__sep" aria-hidden="true">
                  /
                </span>
              )}
              {isLast || crumb.href === undefined ? (
                // K3 — SON parça bağlantı değildir (mockup 40).
                //
                // 🔴 `aria-current="page"` BİLEREK BASILMAZ (K7 canonu). W3C
                // APG'nin kırıntı örneği onu son parçaya koyar, ama BU depoda
                // yazılı ve gerekçeli bir karar var: sayfada TAM BİR
                // `aria-current` bulunur ve o da kabuk menüsündedir —
                // *"ikincisi ekran okuyucuya İKİ SAYFA derdi"*
                // (`financial-statements.spec.ts` K7 bekçileri). En yakın
                // emsal birebir aynı şekle sahip: Mali Tablolar'ın segment
                // şeridi de bir yol göstergesidir ve "bulunulan" öğesine
                // `aria-current` SÜRMEZ. İki trail bileşeninin farklı
                // davranması tek başına bir kusur olurdu.
                <span className="topbar-crumbs__current" title={fullName}>
                  <CrumbText crumb={crumb} />
                </span>
              ) : (
                <Link href={crumb.href} className="topbar-crumbs__link" title={fullName}>
                  <CrumbText crumb={crumb} />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
