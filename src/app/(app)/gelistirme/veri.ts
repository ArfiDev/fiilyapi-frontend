// GLS-F1 GEÇİCİ — içeriği CEO elle günceller (spec: GELISTIRME-SAYFASI-SPEC.md).
// İçerikte SIR YAZILMAZ: veri JS paketinde durur, gizlilik kozmetiktir.

export type Durum = "devam" | "sirada" | "beklemede" | "bitti";
export type Hat = "backend" | "frontend";

export type Dilim = {
  kod: string;
  aciklama: string;
  durum: Durum;
  hat: Hat;
  bagimlilik?: string;
  pr?: string;
};

export type Gorev = {
  kod: string;
  acilim: string;
  aciklama: string;
  durum: Durum;
  spec: string;
  dilimler: Dilim[];
  kararlar: string[];
};

export type Bekleyen = { kod: string; acilim: string; aciklama: string; kararlar: string[] };
export type SoruBekleyen = { baslik: string; aciklama: string };

export type GelistirmeVerisi = {
  guncellendi: string;
  gorevler: Gorev[];
  bekleyenler: Bekleyen[];
  sorular: SoruBekleyen[];
};

export const VERI: GelistirmeVerisi = {
  guncellendi: "2026-10-01 12:20",
  gorevler: [
    {
      kod: "BDG",
      acilim: "Bölüm Dağılımı",
      aciklama:
        "Şantiyenin iş kalemleri bölümlere tek ekrandan dağıtılır (kalem x bölüm matrisi). Sözleşmedeki Poz Dağılımı ekranından türetilir.",
      durum: "devam",
      spec: "BOLUM-DAGILIMI-SPEC.md",
      dilimler: [
        { kod: "B1", aciklama: "Matris okuma + birleştirme kaydı ucu", durum: "devam", hat: "backend", pr: "backend #150 (CI)" },
        { kod: "F1", aciklama: "Bölüm Dağılımı ekranı (Kalanı buraya dağıt dahil)", durum: "sirada", hat: "frontend", bagimlilik: "B1 merge bekler" },
      ],
      kararlar: [
        "Mockup yok, sözleşme Poz Dağılımı ekranından birebir türetilir.",
        "Giriş: İş Kalemleri başlığındaki Bölüm Dağılımı düğmesi; yan menü öğesi yok.",
        "Atanmamış miktar yalnız uyarıdır, kısmi dağıtım serbesttir.",
        "Uyarı kalem listesiyle yazılır; atanmamış rozeti kırmızı.",
      ],
    },
    {
      kod: "SZK",
      acilim: "Sözleşme Kalemi",
      aciklama:
        "Sözleşmeye bağlı şantiye kaleminde poz no, tarif, birim ve birim fiyat kilitlenir; yalnız sözleşmeden düzenlenir.",
      durum: "devam",
      spec: "SOZLESME-KALEM-KILIDI-SPEC.md",
      dilimler: [
        { kod: "F1", aciklama: "Sözleşme tablosunda poz no, tarif, birim satır içi düzenleme", durum: "devam", hat: "frontend", pr: "frontend #148 (CI)" },
        { kod: "B1", aciklama: "Şantiye kaleminde sözleşme alanları kilidi", durum: "sirada", hat: "backend", bagimlilik: "BDG-B1 merge bekler" },
        { kod: "F2", aciklama: "Şantiye formunda kilit gösterimi", durum: "sirada", hat: "frontend", bagimlilik: "B1 merge bekler" },
      ],
      kararlar: [
        "Şantiyede açık kalanlar: miktar (kota), grup, sıra.",
        "Sözleşmede olmayan şantiye kalemi serbest düzenlenir.",
      ],
    },
    {
      kod: "BLF",
      acilim: "Bölüm Formu",
      aciklama:
        "Bölüm Bedeli iş kalemlerinden hesaplanır (elle giriş ve zorunluluk kalkar); bölüm tipi şirket geneli listeye yeni tip eklenebilir.",
      durum: "devam",
      spec: "BOLUM-FORMU-SPEC.md",
      dilimler: [
        { kod: "B1", aciklama: "Bedel zorunluluğu kalkar + bölüm tipi tablosu (migration)", durum: "devam", hat: "backend" },
        { kod: "F1", aciklama: "Form: bedel salt okunur, + Yeni tip ekle", durum: "sirada", hat: "frontend", bagimlilik: "B1 merge bekler" },
      ],
      kararlar: ["Bölüm tipi zorunlu kalır.", "Yazım farkıyla kopya tip engellenir."],
    },
    {
      kod: "GRP",
      acilim: "Günlük Rapor",
      aciklama: "Günlük İlerleme Raporunda uzun kalem adı taşması ve takvimde ay ileri tuşunun takvimi kapatması.",
      durum: "devam",
      spec: "-",
      dilimler: [
        { kod: "F1", aciklama: "Ad sarılır; takvim seçimi yalnız gerçek seçimde işlenir", durum: "devam", hat: "frontend", pr: "frontend #147 (CI)" },
      ],
      kararlar: ["Canlıya çıkınca kullanıcı takvimi elle dener."],
    },
    {
      kod: "GLS",
      acilim: "Geliştirme Sayfası",
      aciklama: "Bu sayfa. Geçicidir, iş bitince tamamen silinir.",
      durum: "devam",
      spec: "GELISTIRME-SAYFASI-SPEC.md",
      dilimler: [{ kod: "F1", aciklama: "Sayfa + yan menü öğesi (yalnız sistem yöneticisi)", durum: "devam", hat: "frontend" }],
      kararlar: ["Backend yok; içeriği CEO elle günceller."],
    },
    {
      kod: "DTI",
      acilim: "Tarih Girişi",
      aciklama: "Formlardaki tarih alanında takvimde ay gezinirken ara tarihler forma yazılıyor.",
      durum: "sirada",
      spec: "-",
      dilimler: [{ kod: "F1", aciklama: "Tarih seçimi yalnız gerçek seçimde işlenir", durum: "sirada", hat: "frontend" }],
      kararlar: [],
    },
    {
      kod: "KDG",
      acilim: "Kalanı Dağıt",
      aciklama:
        "Poz Dağılımı ve Bölüm Dağılımı ekranlarında her kolonda Kalanı buraya dağıt düğmesi; tek şantiyede tümünü dağıtır.",
      durum: "sirada",
      spec: "BOLUM-DAGILIMI-SPEC.md (K7)",
      dilimler: [{ kod: "F1", aciklama: "Sözleşme Poz Dağılımı ekranına düğme", durum: "sirada", hat: "frontend" }],
      kararlar: [
        "Düğme yalnız hücreleri doldurur, kayıt Dağılımı Kaydet ile.",
        "Kalan rozeti ekrandaki değerlerle anında güncellenir.",
      ],
    },
  ],
  bekleyenler: [
    {
      kod: "GKS",
      acilim: "Günlük Kayıt Satırları",
      aciklama:
        "Günlük kayıtta bölüm seçilince o bölümün kalemleri kaydetmeden gelir; Taslak Kaydet başlık ve satırları tek seferde yazar.",
      kararlar: [
        "Önizleme + tek kayıt; seçim kayıt açmaz.",
        "Bölüm seçilince yalnız o bölüme dağıtılmış kalemler.",
        "Backend sırası: SZK-B1 sonrası.",
      ],
    },
    {
      kod: "DSC-B6 / F3",
      acilim: "Disiplin Kapsamı kapanışı",
      aciklama: "Beklemede (kullanıcı kararı). Servislerde kapsam parametresi zorunlu olacak; hakediş menüsü kısıtlıya gizlenecek.",
      kararlar: ["Şimdilik bekliyor, tekrar dönülecek."],
    },
  ],
  sorular: [
    { baslik: "Poz kodu kâhini (KARARLAR-BEKLEYEN 14)", aciklama: "Kısıtlı kullanıcının poz kodundan başka disiplin kaleminin varlığını sezebilmesi kabul edilsin mi?" },
    { baslik: "Mockup dışı metinler (KARARLAR-BEKLEYEN 15)", aciklama: "Disiplin kapsamı turunda CEO'nun verdiği metin ve gösterim kararlarının onayı." },
    { baslik: "Mobil davranış (KARARLAR-BEKLEYEN 13)", aciklama: "Dar ekranda kabuk davranışı. Kullanıcı: en son yapılacak." },
  ],
};
