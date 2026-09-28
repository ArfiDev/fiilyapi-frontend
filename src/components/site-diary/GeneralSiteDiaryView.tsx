"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/select/Select";
import { useSiteOptions } from "@/lib/api/hooks/useSiteOptions";

import type { DiaryExtensionProps } from "./diary-extension";
import { DiaryEntryScreen } from "./SiteDiaryEntryView";
import "./site-diary.css";

/**
 * Genel "Günlük Kayıt" — rota `/gunluk-kayit`, kabuk sol menüsündeki `Saha`
 * grubunun öğesi (kullanıcı kararı 2026-09-05).
 *
 * ═══ MOCKUP TEMELİ ═══
 * `Ekran 7 - Şantiye Günlüğü Girişi.dc.html` (E7). E7, günlük kayıt ekranını
 * ANA KABUKTA çizer: sol menü tam kabuk menüsüdür (E7 30-60) ve şantiye
 * DRILL sekme şeridi (`SiteDetailTabs`) YOKTUR — şantiye kapsamlı ikizi
 * `Şantiye - Günlük Kayıt.dc.html` (GK) o şeridi çizer. Yani "ekranın ana
 * kabukta yaşaması" uydurma DEĞİL, ölçülmüş mockup gerçeğidir.
 *
 * 🔴 E7'DE ŞANTİYE SEÇİCİ YOKTUR — ölçüldü: dosyadaki tek `<select>` hava
 * durumudur (E7 85-90). E7 şantiyeyi bir GERİ BAĞLANTIYLA taşır
 * ("← A-Blok Şantiyesi · Günlük Kayıt"), yani kullanıcının bir şantiyeden
 * geldiğini varsayar. Sol menüden gelindiğinde böyle bir bağlam YOKTUR.
 * Seçici bu boşluğu kapatır ve `Ekran 5 - Puantaj.dc.html`ten (E5 96) BİREBİR
 * alınmıştır: E5, `/puantaj`ın genel hâlidir ve şantiyeyi aynı sorunla aynı
 * çözümle taşır. `useSiteOptions` zaten "genel puantajın şantiye seçicisi"
 * olarak yazılmıştı — burada ikinci çağıranını buldu.
 *
 * DURUM URL'DE (`?site=`) — `GeneralTimesheetView` ile AYNI anahtar; bağlantı
 * paylaşılabilir olsun. Yol elle KURULMAZ (URL-1): `usePathname()` üzerine
 * yalnız sorgu yazılır.
 *
 * ⚠️ MOCKUP'IN CEVAPLAMADIĞI TEK NOKTA — MOD ANAHTARI. Ortak gövdedeki
 * `DiaryModeSwitch` (GK164-168) üç görünüm taşır. Aktif olan ("Kayıt Gir")
 * zaten BAĞLANTI DEĞİLDİR (`DiaryModeSwitch`: aktif öğe `<span>`), yani kök
 * rotada kullanıcıyı bir yere savurmaz. Diğer ikisi ("Planlama" ·
 * "Hakediş Özeti") SEÇİLİ ŞANTİYENİN şantiye kapsamlı rotalarına gider —
 * o iki ekranın kök ikizi YOKTUR ve bu dilimde YAZILMADI. Davranış kasıtlı
 * ve tutarlıdır (şantiyeni seç → o şantiyenin planlamasına in), ama
 * mockup'tan gelmez: E7 mod anahtarını HİÇ çizmez. Kök ikizleri istenirse
 * AYRI bir dilimdir.
 */
export function GeneralSiteDiaryView({ extension, onExtensionContext }: DiaryExtensionProps = {}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const siteOptions = useSiteOptions();
  // Seçili şantiye URL'den; yoksa ilk seçenek (E5 deseni — mockup seçiciyi HER
  // ZAMAN dolu çizer, boş bir seçici uydurulmaz).
  const siteParam = searchParams.get("site");
  const selected =
    siteOptions.options.find((option) => option.siteId === siteParam) ??
    siteOptions.options[0];

  function pushSite(siteId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("site", siteId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  /**
   * 🔴 ADRES ile EKRAN ÇELİŞMEZ. `?site=` yokken ya da TANINMAYAN bir değer
   * taşırken (elle yazılmış / bayat bağlantı) ekran ilk seçeneğe düşer; URL
   * düzeltilmezse kullanıcı `s-9` yazan bir adresi paylaşır ama karşı taraf
   * BAŞKA bir şantiye görür. Bu yüzden çözülen şantiye URL'e geri yazılır.
   *
   * ⚠️ `/puantaj` İKİZİNDEN BİLEREK AYRILIYOR ve sebebi YAPISAL:
   * `GeneralTimesheetView` `?site=`i HAM kullanır (`siteParam ?? ilk`), çünkü
   * ortak gövdesine yalnız `siteId` geçer. Günlük kayıt ekranı AYRICA
   * `projectId` ister (`useSite` kapsamı + `base` bağlantıları) ve o yalnız
   * seçenek listesinden gelir; ham bir değerle `base`
   * `/projeler//santiyeler/s-9` gibi ÇİFT SLAŞLI bozuk bir yol kurardı.
   * Yani doğrulama burada tercih değil ZORUNLULUK — hizalama da onun bedeli.
   */
  useEffect(() => {
    if (selected === undefined) return; // seçenek yok — URL'e uydurma yazılmaz
    if (siteParam === selected.siteId) return; // zaten hizalı
    pushSite(selected.siteId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.siteId, siteParam]);

  return (
    <DiaryEntryScreen
      /**
       * 🔴🔴 ÇAPRAZ-ŞANTİYE VERİ BULAŞMASI BEKÇİSİ — `key` DEKORATİF DEĞİL.
       *
       * Şantiye kapsamlı ikizde bu sınıf YAPISAL OLARAK imkânsızdı: şantiye
       * değişmek ROTA değişmek demekti, Next bileşeni yeniden monte ediyordu.
       * Kök rotada şantiye bir SORGU parametresidir — bileşen monteli kalır.
       *
       * `DiaryEntryScreen`in tohumlama anahtarı ŞANTİYE TAŞIMAZ
       * (`seedKey = entry ? "entry:<id>" : "new:<activeDate>"`)
       * ve etkisi `seeded.key === seedKey` iken (yalnız aynı kaydın sunucu
       * sürümü değiştiyse TEMİZ formu hizalayıp) erken döner.
       * Yani şantiye değişip TARİH aynı kalınca ve iki şantiyede de o gün
       * kayıt yokken anahtar DEĞİŞMEZ → form olduğu gibi kalır: önceki
       * şantiyenin notu, miktarları ve `sectionId`si yeni şantiyenin POST
       * gövdesine sızar. `sectionId` başka bir şantiyenin (hatta başka bir
       * PROJENİN) bölümüdür ve seçicide GÖRÜNMEZ — kullanıcı gönderdiği
       * değeri göremez.
       *
       * `key` şantiyeye bağlandığı için React alt ağacı SÖKÜP yeniden kurar:
       * `useState` başlatıcıları yeniden koşar, yani `activeDate` de bugüne
       * döner. `seedKey`e `siteId` eklemek notu temizlerdi ama `activeDate`i
       * ve diğer yerel durumu ELDE TUTARDI — bu yüzden `key` seçildi.
       */
      key={selected?.siteId ?? ""}
      // 🔴 Seçenekler KANONİK UUID taşır (`useSiteOptions`), slug değil — bu
      // rotada okunur bir slug'ı taşıyan bir YOL segmenti zaten yoktur, yani
      // `SiteDetailTabs`in slug koruma gerekçesi burada geçerli DEĞİLDİR.
      projectKey={selected?.projectId ?? ""}
      siteKey={selected?.siteId ?? ""}
      extension={extension}
      onExtensionContext={onExtensionContext}
      chrome={
        <div className="diary__site-picker">
          <Select
            aria-label="Şantiye"
            value={selected?.siteId ?? ""}
            disabled={siteOptions.options.length === 0}
            onChange={(event) => pushSite(event.target.value)}
          >
            {siteOptions.options.length === 0 && (
              <option value="">
                {siteOptions.isLoading ? "Yükleniyor…" : "Şantiye yok"}
              </option>
            )}
            {siteOptions.options.map((option) => (
              <option key={option.siteId} value={option.siteId}>
                {option.label}
              </option>
            ))}
          </Select>
          {/* Boş gövdenin nedeni HER ZAMAN yazılır — sessiz boş ekran yok. */}
          {siteOptions.options.length === 0 && !siteOptions.isLoading && (
            <p className="diary__site-picker-empty">
              {siteOptions.isError
                ? "Şantiye listesi yüklenemedi."
                : "Kayıt girilebilecek şantiye bulunmuyor."}
            </p>
          )}
        </div>
      }
    />
  );
}
