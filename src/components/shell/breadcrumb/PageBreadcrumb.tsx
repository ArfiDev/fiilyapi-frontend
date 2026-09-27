"use client";

/**
 * F-KIRINTI → SEKME-F1.2 · içerik alanı yol göstergesi + geri tuşu.
 *
 * KARARLAR §1.10: üst çubuktaki (topbar) yer ileride çalışma sekmelerine
 * bırakıldı; kırıntı KABUK DÜZEYİNDE tek satıra indi ve artık
 * `AppShell`in `<main className="app-content">` içinde, `StaleBuildBanner`in
 * ALTINDA ve sayfa içeriğinden (`{children}`) ÖNCE basılır. Konum değişti,
 * DAVRANIŞ değişmedi: K2/K3/K6/K7 kanonları ve geri tuşu (←) `trail.ts`ten
 * AYNEN devralınır — bu dosya yalnız DOM'u kurar.
 *
 * 🔴 Kırıntı TEK PARÇALIYSA (`/`, modül kökleri, ComingSoon) satır HİÇ
 * BASILMAZ (null döner) — ekranların kendi başlık-üstü satırları (ör.
 * Gösterge Paneli'nin "Sistem Yöneticisi Görünümü · 2 Aktif Proje" satırı)
 * zaten var, boş bir kırıntı kutusu onların ÜSTÜNE gereksiz bir boşluk
 * eklerdi.
 *
 * 🔴 `/ayarlar` altında BASILMAZ: Ayarlar kendi kırıntısını basar
 * (`SettingsBreadcrumb`, SEKME-F1.2 ile o da içeriğe indi). İki kırıntı üst
 * üste binmez diye burada, mimarinin en dar noktasında (tek bileşen, tek
 * erken dönüş) dışlanıyor — `AppShell` ya da `route-tree.ts`e bir "ayarlar
 * mı" bayrağı eklemek, kararı kırıntı DIŞINDAKİ bir dosyaya taşır ve
 * `PageBreadcrumb`i tek başına okuyan biri neden basılmadığını göremez.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isActivePath } from "@/lib/shell/isActive";
import { routes } from "@/lib/routes";
import { backTarget, buildTrail, routeKeysOf, type Crumb } from "./trail";
import { useCrumbNames } from "./useCrumbNames";
import "./page-breadcrumb.css";

// 🔴 `internal-url-guard.test.ts` elle kurulmuş uygulama içi URL'e izin
// vermez — önek de `routes.ts`ten TÜRER, ikinci bir kaynak açılmaz.
const SETTINGS_PATH_PREFIX = routes.settings.root();

function CrumbText({ crumb }: { crumb: Crumb }) {
  if (!crumb.pending) return <>{crumb.label}</>;
  // K6 — ad gelene kadar YALAN SÖYLEME: ham UUID/slug yerine yer tutucu.
  // Yedek etiket ("Şantiye") ekran okuyucuya `sr-only` ile okunur; shimmer
  // yalnız görsel bir yer tutucudur.
  return (
    <span className="page-crumbs__pending" data-testid="crumb-pending">
      <span className="sr-only">{crumb.label}</span>
    </span>
  );
}

export function PageBreadcrumb() {
  // `usePathname` App Router'da her zaman string döner; savunma yalnız
  // bileşenin router dışında (test/hikaye) render edilmesi içindir.
  const pathname = usePathname() ?? "/";
  const keys = routeKeysOf(pathname);
  const names = useCrumbNames(keys);
  const trail = buildTrail(pathname, names);
  const back = backTarget(trail);

  // Ayarlar kendi kırıntısını basar (bkz. dosya başı gerekçe) — ikinci kırıntı
  // YOK. `startsWith` DEĞİL `isActivePath`: önek ("/ayarlarX/...") "/ayarlar"
  // ile başlar ama Ayarlar ALTINDA değildir (D6, SEKME-F1.2-FIX) — depo
  // genelinde aktif eşleştirme burada da tek kaynaktan (`isActive.ts`) gelir.
  if (isActivePath(pathname, SETTINGS_PATH_PREFIX)) return null;
  // Tek parçalı kırıntı (kök, modül kökü, ComingSoon) HİÇ BASILMAZ.
  if (trail.length === 1) return null;

  return (
    <nav className="page-crumbs" aria-label="Yol göstergesi">
      {back?.href !== undefined && (
        <Link
          href={back.href}
          className="page-crumbs__back"
          data-testid="page-back"
          // Hedefin adı hemen sağdaki kırıntıda yazılı; tuş onu tekrarlamaz
          // ama erişilebilir ad ve ipucu ONU söyler.
          aria-label={`${back.label} sayfasına dön`}
          title={`${back.label} sayfasına dön`}
        >
          <span aria-hidden="true">←</span>
        </Link>
      )}
      <ol className="page-crumbs__list" data-testid="page-crumbs">
        {trail.map((crumb, index) => {
          const isLast = index === trail.length - 1;
          return (
            <li key={crumb.href ?? `crumb-${index}`} className="page-crumbs__item">
              {index > 0 && (
                <span className="page-crumbs__sep" aria-hidden="true">
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
                //
                // Kararı değiştirmek K7'yi ve beş e2e bekçisini birden
                // oynatır — bu dilimin kapsamı DEĞİL, yönetime rapor edildi.
                <span className="page-crumbs__current">
                  <CrumbText crumb={crumb} />
                </span>
              ) : (
                <Link href={crumb.href} className="page-crumbs__link">
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
