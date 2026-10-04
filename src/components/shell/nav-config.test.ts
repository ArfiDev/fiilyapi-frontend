import { describe, expect, it } from "vitest";
import { activeNavHref, NAV_GROUPS, moduleNameForSlug } from "./nav-config";
import { buildRouteTree, COMING_SOON_PARENT_HREFS, resolveHrefIn } from "./route-tree.testkit";

describe("NAV_GROUPS", () => {
  // 🔴 F-NAVSAHA · KULLANICI KARARI 2026-09-05 — `Saha & İK` İKİYE ayrıldı,
  // grup sayısı 4 → 5. `toHaveLength` SİLİNMEDİ, yeni beklenti TAM BAŞLIK
  // DİZİSİYLE yazıldı: sıra da iddianın parçasıdır (`Saha` eski `Saha & İK`ın
  // yerini alır, `İK` hemen ardına girer).
  // PLN-F1 · K21 — `Planlama` grubu mockup'taki yerine (Saha & İK ile
  // Stok & Satınalma arası → kodda İK ile Stok arası) girer: 5 → 6.
  // NAV-F1 · KARARLAR.md b1974d8 — Planlama'nın altına "Teklif ve Sözleşmeler"; eski grup "Mali": 6 → 7.
  it("7 grup icerir (canon + PLN-F1 Planlama + NAV-F1 Teklif ve Sözleşmeler)", () => {
    expect(NAV_GROUPS).toHaveLength(7);
    expect(NAV_GROUPS.map((g) => g.heading)).toEqual([
      "Genel",
      "Saha",
      "İK",
      "Planlama",
      "Teklif ve Sözleşmeler",
      "Stok & Satınalma",
      "Mali",
    ]);
  });

  // 🔴 §3.10 F0-10 + PLN-F1.3 §0-B: nav öğesi EKRANIYLA gelir (sahte/işlevsiz
  // öğe konmaz). PLN-F3.6b'de Panel · Günlük İlerleme Raporu · Haftalık QURR
  // eklendi — K21 sırasında (Panel · Bütçe · Günlük Rapor · QURR · Katalog),
  // beşi de artık GERÇEK ekranlara düşer.
  // NAV-F2: K21 beşlisinin ardına "Disiplin Yönetimi" (gerçek `/planlama/disiplin-yonetimi` sayfası).
  it("Planlama grubu K21 besligi + Disiplin Yonetimi'ni tasir (NAV-F2; İş Kalemi Kataloğu NAV-F1 ile taşındı)", () => {
    const planning = NAV_GROUPS.find((g) => g.heading === "Planlama");
    expect(planning!.items.map((i) => i.label)).toEqual([
      "Planlama Paneli",
      "Adam-Saat Bütçesi",
      "Günlük İlerleme Raporu",
      "Haftalık QURR",
      "Birim Oran Kataloğu",
      "Disiplin Yönetimi",
    ]);
    expect(planning!.items[5].href).toBe("/planlama/disiplin-yonetimi");
    const tree = buildRouteTree();
    for (const item of planning!.items) {
      expect(resolveHrefIn(tree, item.href, false), item.href).toEqual({ kind: "static" });
    }
  });

  // 🔴 Kullanıcının saydığı KAPSAM — grup başlıkları doğru olup öğeler yanlış
  // yerde dursaydı yukarıdaki iddia yeşil kalırdı. `İK`nın TEK öğeli olması
  // ("ik'da SADECE personel olsun") ve `Saha`nın üçlüsü ayrıca kilitlenir.
  it("Saha ve İK gruplarinin ogeleri kullanicinin saydigi sirada (2026-09-05)", () => {
    const saha = NAV_GROUPS.find((g) => g.heading === "Saha");
    expect(saha!.items.map((i) => i.label)).toEqual([
      "Puantaj",
      "Makine & Ekipman",
      "Günlük Kayıt",
    ]);
    const ik = NAV_GROUPS.find((g) => g.heading === "İK");
    expect(ik!.items.map((i) => i.label)).toEqual(["Personel"]);
  });

  // 🔴 `Günlük Kayıt` bu dilimde ComingSoon'dan GERÇEK rotaya döndü. Yukarıdaki
  // href-geçerlilik döngüsü catch-all'ı da geçerli saydığı için (yazılmamış
  // modüller adına doğru davranış) YAZILMIŞ öğe AYRICA sınanır: `/gunluk-kayit`
  // klasörü silinirse kullanıcı menüden tıklayıp sessizce "yakında" görmez.
  it("'Günlük Kayıt' /gunluk-kayit statik rotasina duser (catch-all DEGIL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Günlük Kayıt");
    expect(item?.href).toBe("/gunluk-kayit");
    expect(resolveHrefIn(buildRouteTree(), item!.href, false)).toEqual({ kind: "static" });
  });
  it("her ogenin label, href ve Icon'u vardir", () => {
    for (const g of NAV_GROUPS) {
      for (const item of g.items) {
        expect(item.label).toBeTruthy();
        expect(item.href.startsWith("/")).toBe(true);
        expect(typeof item.Icon).toBe("function");
      }
    }
  });
  it("hrefler benzersizdir", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  /**
   * 🔴 KULLANICI KARARI 2026-08-27 — Mali Tablolar'ın drill sidebar'ı
   * kaldırıldı; artık ÜÇ mali tablo ekranında da GÖRÜNEN sol menü BUDUR.
   * Bu yüzden `Mali Tablolar` girdisinin üç yolda da aktif kalması artık
   * kullanıcının GÖRDÜĞÜ davranıştır: `isActivePath`in prefix kuralı `exact`e
   * dönerse yapraklarda hiçbir menü öğesi yanmaz.
   */
  it("🔴 Mali Tablolar girdisi UC YOLDA DA aktiftir (yapraklar dahil)", () => {
    for (const pathname of [
      "/mali-tablolar",
      "/mali-tablolar/bilanco",
      "/mali-tablolar/nakit-akisi",
    ]) {
      expect(activeNavHref(pathname)).toBe("/mali-tablolar");
    }
  });
  it("Gosterge Paneli / rotasina gider", () => {
    const dash = NAV_GROUPS[0].items[0];
    expect(dash.label).toBe("Gösterge Paneli");
    expect(dash.href).toBe("/");
  });
  // 🔴 F-UNIT1 T4 — `Çek & Ödeme` mockup'ta Hazine'nin HEMEN ARDINDADIR
  // (`Fatura Yönetimi.dc.html` 43-45: 🏦 Hazine → 💳 Çek & Ödeme → 📊 Mali
  // Tablolar). Sıra kayarsa ekran hâlâ erişilebilir olur ama mockup'ın
  // çizdiği yerde durmaz.
  it("cek-odeme kalemi hazine ile hakedisler arasindadir (mockup sirasi)", () => {
    const mali = NAV_GROUPS.find((g) => g.heading === "Mali");
    const labels = mali!.items.map((i) => i.label);
    expect(labels.indexOf("Çek & Ödeme")).toBe(labels.indexOf("Hazine") + 1);
  });

  // 🔴 NAV-F1 (KARARLAR.md b1974d8) — "Teklif ve Sözleşmeler" = Teklif Hazırlama · Sözleşmeler ·
  // İş Kalemi Kataloğu (bu sırayla); adresler DEĞİŞMEDİ, hepsi GERÇEK rotaya düşer.
  // NAV-F2: Teklif Hazırlama'nın HEMEN ALTINA "Teklif Şablonları" (sekme şeridinden menüye taşındı).
  it("'Teklif ve Sözleşmeler' grubu dort ogeyi karar sirasinda tasir, adresler degismez", () => {
    const group = NAV_GROUPS.find((g) => g.heading === "Teklif ve Sözleşmeler");
    expect(group!.items.map((i) => i.label)).toEqual([
      "Teklif Hazırlama",
      "Teklif Şablonları",
      "Sözleşmeler",
      "İş Kalemi Kataloğu",
    ]);
    expect(group!.items[0].href).toBe("/teklif-hazirlama");
    expect(group!.items[1].href).toBe("/teklif-hazirlama/sablonlar");
    expect(group!.items[3].href).toBe("/planlama/is-kalemi-katalogu");
    for (const item of group!.items) {
      expect(resolveHrefIn(buildRouteTree(), item.href, false), item.href).toEqual({ kind: "static" });
    }
  });

  it("'Mali' grubu kalan ogeleri ayni sirada tasir (NAV-F1)", () => {
    const mali = NAV_GROUPS.find((g) => g.heading === "Mali");
    expect(mali!.items.map((i) => i.label)).toEqual([
      "Satış Yönetimi",
      "Muhasebe",
      "Fatura Yönetimi",
      "Hazine",
      "Çek & Ödeme",
      "Hakedişler",
      "Mali Tablolar",
      "Bordro",
      "Şirket Varlıkları",
      "Belge Arşivi",
    ]);
  });

  it("sirket varliklari kalemi bordro ile belge arsivi arasindadir", () => {
    const mali = NAV_GROUPS.find((g) => g.heading === "Mali");
    const labels = mali!.items.map((i) => i.label);
    expect(labels.indexOf("Şirket Varlıkları")).toBe(labels.indexOf("Bordro") + 1);
    expect(labels.indexOf("Belge Arşivi")).toBe(labels.indexOf("Şirket Varlıkları") + 1);
  });
});

describe("moduleNameForSlug", () => {
  it("bilinen slug'i modul adina cevirir", () => {
    expect(moduleNameForSlug("projeler")).toBe("Projeler");
    expect(moduleNameForSlug("mali-tablolar")).toBe("Mali Tablolar");
  });
  it("bilinmeyen slug'i baslik-case fallback yapar", () => {
    expect(moduleNameForSlug("bilinmeyen-modul")).toBe("Bilinmeyen Modul");
  });
});

// Kırık link koruması (F-TH dersi) — drill nav'la AYNI yardımcıyı kullanır:
// href'ler dosya sistemindeki GERÇEK rotalarla karşılaştırılır, elle yazılmış
// bir listeyle değil.
describe("NAV_GROUPS — href geçerliliği (kırık link koruması)", () => {
  const ROUTE_TREE = buildRouteTree();

  it("route ağacı okunur (sağlık kontrolü)", () => {
    expect(ROUTE_TREE.literalChildren.has("projeler")).toBe(true);
  });

  it("her nav href'i gerçek bir sayfaya ya da catch-all'a düşer (dinamik yutma YOK)", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (COMING_SOON_PARENT_HREFS.has(item.href)) continue;
        const result = resolveHrefIn(ROUTE_TREE, item.href, false);
        expect(
          result.kind === "static" || result.kind === "catch-all",
          `Nav öğesi "${item.label}" (href="${item.href}") geçersiz: ${JSON.stringify(result)}`,
        ).toBe(true);
      }
    }
  });

  // F-BC T4: "Belge Arşivi" artık GERÇEK bir rotadır. Yukarıdaki döngü
  // catch-all'ı da geçerli saydığından (henüz yazılmamış modüller için doğru
  // davranış) YAZILMIŞ öğe AYRICA sınanır: rota klasörü silinir/yeniden
  // adlandırılırsa bu test kırılır, kullanıcı sessizce "yakında" görmez.
  it("'Belge Arşivi' /belgeler statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Belge Arşivi");
    expect(item?.href).toBe("/belgeler");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // F-ST T2: "Stok & Depo" artık GERÇEK bir rotadır (`/stok`). Yukarıdaki
  // döngü catch-all'ı da geçerli saydığı için YAZILMIŞ öğe AYRICA sınanır:
  // rota klasörü silinir/yeniden adlandırılırsa bu test kırılır, kullanıcı
  // sessizce "yakında" görmez.
  it("'Stok & Depo' /stok statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Stok & Depo");
    expect(item?.href).toBe("/stok");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // F-P8 T2: "Satış Yönetimi" GERÇEK bir rotadır (`/satis`) — SY 40'taki
  // mockup öğesinin kabuk karşılığı. Catch-all'a düşerse kullanıcı sessizce
  // "yakında" ekranı görür; bu test onu kırmızıya çevirir.
  it("'Satış Yönetimi' /satis statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Satış Yönetimi");
    expect(item?.href).toBe("/satis");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // F-SA T2: "Satınalma & Teklif" GERÇEK bir rotadır (`/satinalma`). Nav'a
  // YENİ ÖĞE EKLENMEDİ — öğe (ve href'i) F3 kabuk canon'undan beri duruyordu,
  // yalnız hedefi ComingSoon'dan gerçek sayfaya döndü. Bu test o dönüşü
  // kilitler: rota klasörü silinirse kullanıcı sessizce "yakında" görmez.
  it("'Satınalma & Teklif' /satinalma statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find(
      (i) => i.label === "Satınalma & Teklif",
    );
    expect(item?.href).toBe("/satinalma");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // F-MU1 T2: `/muhasebe` GERÇEK sayfa oldu (E8 · Yevmiye Defteri) — bu satır
  // artık "henüz yazılmamış" kontrol grubu DEĞİL, `/satinalma` ile aynı
  // dönüşün kilididir: rota klasörü silinirse kullanıcı sessizce "yakında"
  // görmez.
  it("'Muhasebe' /muhasebe statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Muhasebe");
    expect(item?.href).toBe("/muhasebe");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // 🔴 F-MT T2: iddia SİLİNMEDİ, YENİ GERÇEĞE TAŞINDI (F-MU2 kanonu). Yukarıdaki
  // notun kendi öngördüğü "kasıtlı bakım noktası" geldi: `/mali-tablolar`
  // GERÇEK bir sayfa oldu. Zorunluydu — `/mali-tablolar/bilanco` yazılınca
  // `mali-tablolar` klasörü doğdu ve kök yol catch-all'ın kapsamından çıkıp
  // `not-found`a (gerçek 404) düşüyordu.
  it("'Mali Tablolar' /mali-tablolar statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Mali Tablolar");
    expect(item?.href).toBe("/mali-tablolar");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // 🔴 F-BOR T5 (K1) · `/mali-tablolar` ile BİREBİR aynı tuzak: `bordro/`
  // klasörü bu dilimde doğdu (`/bordro`, `/bordro/gecmis`, `/bordro/sgk`) ve
  // kök yol `[...slug]` catch-all'ının kapsamından ÇIKTI. Kök `/bordro` gerçek
  // bir `page.tsx` olmasaydı sidebar linki `not-found`a (gerçek 404) düşerdi.
  it("'Bordro' /bordro statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Bordro");
    expect(item?.href).toBe("/bordro");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // 🔴 F-UNIT1 T4 · ÖLÜ EKRAN. `/hazine/cek-senet` (E10) sayfası, görünümü,
  // testi ve görsel kareleri vardı ama repoda ona giden HİÇBİR `Link`/`push`
  // yoktu — ekran yalnız elle URL yazılarak açılıyordu. Nav öğesi eklendi;
  // bu iddia rotanın GERÇEK olduğunu kilitler. Ayrıca kabuk nav'ındaki İLK
  // İKİ SEGMENTLİ href budur: `resolveHrefIn` derinlik hatası yaparsa
  // (`/muhasebe/olmayan` negatif iddiasının ikizi) burada kırmızıya döner.
  it("'Çek & Ödeme' /hazine/cek-senet statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Çek & Ödeme");
    expect(item?.href).toBe("/hazine/cek-senet");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // 🔴 F-OK T6 · Onay Kutusu ekranı BU dilimde yazılır (`/onay-kutusu`). Nav
  // öğesi (ve href'i) F3 kabuk canon'undan beri duruyordu — `nav-config.ts`
  // DEĞİŞMEDİ, yalnız hedefi ComingSoon'dan gerçek sayfaya döner. Rota klasörü
  // (`src/app/(app)/onay-kutusu/`) bu iddiadan SONRAKİ bir görevde doğar; o
  // klasör yoksa bu iddia BEKLENEN ŞEKİLDE kırmızıdır — bekçi zayıflatılmaz.
  it("'Onay Kutusu' /onay-kutusu statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Onay Kutusu");
    expect(item?.href).toBe("/onay-kutusu");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // 🔴 F-RAPOR · `/raporlar` bu dilimde GERÇEK bir sayfa oldu (mockup
  // `Raporlar.dc.html` · rapor KATALOĞU). Nav öğesi (ve href'i) F3 kabuk
  // canon'undan beri duruyordu — `nav-config.ts` DEĞİŞMEDİ, yalnız hedefi
  // ComingSoon'dan gerçek sayfaya döndü. Kusur ÖLÜ LİNKti: kullanıcı menüden
  // tıklayıp "yakında" görüyordu. Rota klasörü silinirse bu iddia kırmızıya
  // döner (`/belgeler`, `/stok`, `/satis`, `/onay-kutusu` emsalleri).
  it("'Raporlar' /raporlar statik rotasına düşer (catch-all DEĞİL)", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.label === "Raporlar");
    expect(item?.href).toBe("/raporlar");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "static" });
  });

  // 🔴 POZİTİF KONTROL — yukarıdaki iddia, `resolveHrefIn` her şeye
  // `{kind:"static"}` döndürecek şekilde bozulsa da yeşil kalırdı. Kabuk
  // nav'ında catch-all'a düşen ÖĞE hâlâ vardır ve o hâlâ ComingSoon'a düşer:
  // yazılmamış bir rota "yakında" göstermeye DEVAM eder.
  it("hâlâ yazılmamış 'Şirket Varlıkları' catch-all'a DÜŞER", () => {
    const item = NAV_GROUPS.flatMap((g) => g.items).find(
      (i) => i.label === "Şirket Varlıkları",
    );
    expect(item?.href).toBe("/sirket-varliklari");
    expect(resolveHrefIn(ROUTE_TREE, item!.href, false)).toEqual({ kind: "catch-all" });
  });

  // 🔴 KONTROL GRUBU. Yukarıdaki iddiaların HEPSİ `resolveHrefIn`in POZİTİF
  // yolunu sınar; dosyada hiç NEGATİF örnek kalmazsa `resolveHrefIn` her şeye
  // `{kind:"static"}` döndürecek şekilde bozulsa bile testlerin TAMAMI yeşil
  // kalırdı. Kontrol artık YAZILMAMIŞ BİR EKRANA bağlı DEĞİLDİR (o bağ her
  // yeni dilimde kopuyordu): uydurma bir yol kullanılır ve o yol tanım gereği
  // hiçbir zaman statik olmaz.
  //
  // 🔴 F-MT T4 · SEÇİMİN GEREKÇESİ ÖLÇÜLDÜ VE KAYDA GEÇTİ. Alternatif,
  // kontrolü HÂLÂ yazılmamış GERÇEK bir nav öğesine bağlamaktı; o gün öyle
  // DÖRT öğe vardı (`/onay-kutusu`, `/raporlar`, `/bordro`,
  // `/sirket-varliklari`), yani "aday yok" değildi.
  // 🔴 F-BOR T5 (K10) · o liste ARTIK BAYAT: `/bordro` bu dilimde statik rota
  // oldu (yukarıdaki iddia) ve catch-all çözümleyen nav öğeleri ÜÇE düştü —
  // `/onay-kutusu`, `/raporlar`, `/sirket-varliklari`. Bu tam olarak aşağıda
  // anlatılan aşınmadır ve uydurma yol seçiminin gerekçesini güçlendirir. Yine de
  // UYDURMA yol tercih edilir: gerçek bir öğeye bağlanan kontrol, o ekran
  // yazıldığı gün kırılır ve dilim dilim taşınmak zorunda kalır (bu dosyada
  // tam olarak bu oldu). Uydurma yolun koruma gücü ÖLÇÜLDÜ: `resolveHrefIn`
  // her çağrıda `{kind:"static"}` döndürecek şekilde sabitlendiğinde YALNIZ
  // bu test kırmızıya döner. Gerçek bir öğeye bağlamak aynı kod yolunu sınar,
  // fazladan hiçbir şey kanıtlamaz — ikisini birden tutmak yalnız bakım
  // maliyetini geri getirirdi.
  //
  // 🔴 F-OK T6 · o liste de ARTIK BAYAT: `/onay-kutusu` bu dilimde statik
  // rotaya taşındı (yukarıdaki "Onay Kutusu" iddiası) ve catch-all çözümleyen
  // nav öğeleri İKİYE düştü — `/raporlar`, `/sirket-varliklari`. Aşınma
  // sürüyor; UYDURMA yol seçiminin gerekçesi bir kez daha doğrulandı.
  // 🔴 F-RAPOR · aşınmanın son adımı: `/raporlar` da statik rota oldu ve
  // catch-all çözümleyen nav öğesi BİRE düştü (`/sirket-varliklari`, yukarıda
  // pozitif kontrol olarak iddia edilir). O da yazıldığı gün GERÇEK bir öğeye
  // bağlı hiçbir kontrol grubu kalmayacaktı — uydurma yol o yüzden seçilmişti.
  it("kontrol grubu: var olmayan bir yol catch-all'a düşer (NEGATİF yol)", () => {
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.href === "/boyle-bir-rota-yok")).toBe(
      false,
    );
    expect(resolveHrefIn(ROUTE_TREE, "/boyle-bir-rota-yok", false)).toEqual({
      kind: "catch-all",
    });
  });

  // 🔴 F-TB2 T1: `[...slug]` YALNIZ kökte (`src/app/(app)/[...slug]`) var —
  // `buildRouteTree` onu bilerek ağaca dahil ETMEZ (dosya başındaki yorum),
  // yani `resolveHrefIn` içindeki eşleşmesi "kökte tanımlıymış gibi" örtük
  // varsayılır. `/muhasebe` GERÇEK bir literal klasördür ve segment 0'ı
  // tüketir; altında `olmayan` diye bir alt sayfa/dinamik/catch-all klasörü
  // YOK. Gerçek Next bu yolda 404 verir. Eski `resolveHrefIn` derinlik
  // gözetmeden HER eşleşme başarısızlığında catch-all döndürüyordu — bu
  // segment-1 kaybını da (yanlışlıkla) "geçerli" sayıyordu.
  it("'/muhasebe/olmayan' segment 1'de kaybolur → not-found (catch-all DEĞİL)", () => {
    expect(resolveHrefIn(ROUTE_TREE, "/muhasebe/olmayan", false)).toEqual({
      kind: "not-found",
    });
  });
});

/**
 * 🔴 F-UNIT1 T4 · ÇİFT AKTİFLİK BEKÇİSİ.
 *
 * `Çek & Ödeme` kabuk nav'ının İLK iç içe href'idir (`/hazine/cek-senet`,
 * `/hazine`in altı). `isActivePath` bir PREFİX kuralı olduğu için o yolda
 * `Hazine` de eşleşir; satır başına `isActivePath` çağıran eski sidebar İKİ
 * öğeyi birden yakar ve aynı `<nav>` içinde İKİ `aria-current="page"` basardı
 * (Muhasebe drill-in nav'ının `exact` bayrağıyla çözdüğü F-SD T7 tuzağı).
 */
describe("activeNavHref — en uzun eşleşme kazanır", () => {
  it("/hazine/cek-senet yolunda YALNIZ alt öğe aktiftir (üst öğe DEĞİL)", () => {
    expect(activeNavHref("/hazine/cek-senet")).toBe("/hazine/cek-senet");
  });

  it("NAV-F2: /teklif-hazirlama/sablonlar yolunda YALNIZ Teklif Şablonları aktiftir; teklif detayı Teklif Hazırlama'da kalır", () => {
    expect(activeNavHref("/teklif-hazirlama/sablonlar")).toBe("/teklif-hazirlama/sablonlar");
    expect(activeNavHref("/teklif-hazirlama/o-1")).toBe("/teklif-hazirlama");
  });

  it("/hazine kökünde üst öğe aktiftir", () => {
    expect(activeNavHref("/hazine")).toBe("/hazine");
  });

  // Nav'da karşılığı OLMAYAN bir alt rota üst öğeyi aktif TUTAR — `exact`
  // bayrağı yerine uzunluk kuralı seçilmesinin nedeni budur.
  it("nav'da karşılığı olmayan alt rota üst öğeyi aktif tutar", () => {
    expect(activeNavHref("/projeler/p-1")).toBe("/projeler");
  });

  it("kök yol yalnız TAM eşleşmede aktiftir", () => {
    expect(activeNavHref("/")).toBe("/");
    expect(activeNavHref("/projeler")).toBe("/projeler");
  });

  it("hiçbir nav öğesine düşmeyen yolda hiçbiri aktif değildir", () => {
    expect(activeNavHref("/boyle-bir-rota-yok")).toBeUndefined();
  });

  // Bütünsel bekçi: HİÇBİR yolda birden fazla öğe aktif olamaz.
  it("her nav yolunda AYNI ANDA yalnız tek öğe aktiftir", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const href of hrefs) {
      const matches = hrefs.filter((candidate) => activeNavHref(href) === candidate);
      expect(matches, `"${href}" yolunda aktif öğe sayısı`).toHaveLength(1);
      expect(activeNavHref(href)).toBe(href);
    }
  });
});
