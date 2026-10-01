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
  guncellendi: "2026-10-01 13:40",
  gorevler: [
    {
      kod: "SZK",
      acilim: "Sözleşme Kalemi",
      aciklama:
        "Sözleşmeye bağlı şantiye kaleminde poz no, tarif, birim ve birim fiyat kilitlenir; yalnız sözleşmeden düzenlenir.",
      durum: "devam",
      spec: "SOZLESME-KALEM-KILIDI-SPEC.md",
      dilimler: [
        { kod: "F1", aciklama: "Sözleşme tablosunda poz no, tarif, birim satır içi düzenleme", durum: "bitti", hat: "frontend", pr: "frontend #148" },
        { kod: "B1", aciklama: "Şantiye kaleminde sözleşme alanları kilidi + sayı sınırları", durum: "devam", hat: "backend", pr: "backend #151 (CI)" },
        { kod: "F2", aciklama: "Şantiye formunda kilit gösterimi", durum: "sirada", hat: "frontend", bagimlilik: "B1 merge bekler" },
      ],
      kararlar: [
        "Şantiyede açık kalanlar: miktar (kota), grup, sıra.",
        "Sözleşmede olmayan şantiye kalemi serbest düzenlenir.",
        "Kilitli alan aynı değerle gelirse kabul, farklıysa ret.",
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
        { kod: "B1", aciklama: "Bedel zorunluluğu kalkar + bölüm tipi tablosu (migration)", durum: "devam", hat: "backend", pr: "backend #152", bagimlilik: "F1 ile birlikte merge edilir" },
        { kod: "F1", aciklama: "Form: bedel kilitli kutu, + Yeni tip ekle", durum: "devam", hat: "frontend" },
      ],
      kararlar: [
        "Bölüm tipi zorunlu kalır; yayındaki bölümde boşaltılamaz.",
        "Yazım farkıyla kopya tip engellenir.",
        "+ Yeni tip ekle, + Yeni Grup deseninde.",
      ],
    },
    {
      kod: "GKS",
      acilim: "Günlük Kayıt Satırları",
      aciklama:
        "Günlük kayıtta bölüm seçilince o bölümün kalemleri kaydetmeden gelir; Taslak Kaydet başlık ve satırları tek seferde yazar.",
      durum: "devam",
      spec: "GUNLUK-KAYIT-ONIZLEME-SPEC.md",
      dilimler: [
        { kod: "B1", aciklama: "Önizleme ucu + tek istekte kayıt + Bölümsüz satır açığı", durum: "devam", hat: "backend" },
        { kod: "F1", aciklama: "Bölüm seçilince kalemler gelir, tek kayıt", durum: "sirada", hat: "frontend", bagimlilik: "B1 merge bekler" },
      ],
      kararlar: [
        "Önizleme + tek kayıt; seçim kayıt açmaz.",
        "Bölüm seçilince yalnız o bölüme dağıtılmış kalemler.",
        "Bölüm seçilmezse tamamen dağıtılmış kalem, dağıtıldığı her bölüm için satır alır.",
      ],
    },
    {
      kod: "FLK",
      acilim: "Sekme Şeridi",
      aciklama: "Aktif sekme sonradan genişleyince şerit yeniden kaydırılmıyordu; görsel testi de kararsızdı.",
      durum: "devam",
      spec: "-",
      dilimler: [{ kod: "F1", aciklama: "Şerit yeniden kaydırma + test bekçisi", durum: "devam", hat: "frontend" }],
      kararlar: [],
    },
    {
      kod: "BDG",
      acilim: "Bölüm Dağılımı",
      aciklama: "Şantiyenin iş kalemleri bölümlere tek ekrandan dağıtılır (kalem x bölüm matrisi).",
      durum: "bitti",
      spec: "BOLUM-DAGILIMI-SPEC.md",
      dilimler: [
        { kod: "B1", aciklama: "Matris okuma + birleştirme kaydı ucu", durum: "bitti", hat: "backend", pr: "backend #150" },
        { kod: "F1", aciklama: "Bölüm Dağılımı ekranı", durum: "bitti", hat: "frontend", pr: "frontend #154" },
      ],
      kararlar: ["Giriş: İş Kalemleri başlığındaki Bölüm Dağılımı düğmesi.", "Atanmamış miktar yalnız uyarıdır."],
    },
    {
      kod: "KDG",
      acilim: "Kalanı Dağıt",
      aciklama: "Poz Dağılımı ve Bölüm Dağılımı ekranlarında her kolonda Kalanı buraya dağıt düğmesi.",
      durum: "bitti",
      spec: "BOLUM-DAGILIMI-SPEC.md (K7)",
      dilimler: [{ kod: "F1", aciklama: "Sözleşme Poz Dağılımı ekranına düğme", durum: "bitti", hat: "frontend", pr: "frontend #151" }],
      kararlar: ["Düğme yalnız hücreleri doldurur, kayıt Dağılımı Kaydet ile."],
    },
    {
      kod: "YZD",
      acilim: "Yazdırma",
      aciklama: "Yazdırırken yan menü, üst bar ve sekmeler basılmaz; günlük rapor yazdırma görünümüne geçer.",
      durum: "bitti",
      spec: "-",
      dilimler: [{ kod: "F1", aciklama: "Kabuk düzeyinde yazdırma kuralı", durum: "bitti", hat: "frontend", pr: "frontend #153" }],
      kararlar: [],
    },
    {
      kod: "GRP / DTI",
      acilim: "Günlük Rapor + Tarih Girişi",
      aciklama: "Rapor ad taşması, takvimde ay ileri tuşu ve formlarda ara tarih sızması.",
      durum: "bitti",
      spec: "-",
      dilimler: [
        { kod: "GRP-F1", aciklama: "Ad sarılır; takvim seçimi yalnız gerçek seçimde", durum: "bitti", hat: "frontend", pr: "frontend #147" },
        { kod: "DTI-F1", aciklama: "Formlarda tarih alanı aynı onarım", durum: "bitti", hat: "frontend", pr: "frontend #150" },
      ],
      kararlar: ["Takvim kullanıcı tarafından canlıda doğrulandı."],
    },
    {
      kod: "GLS",
      acilim: "Geliştirme Sayfası",
      aciklama: "Bu sayfa. Geçicidir, iş bitince tamamen silinir.",
      durum: "bitti",
      spec: "GELISTIRME-SAYFASI-SPEC.md",
      dilimler: [{ kod: "F1", aciklama: "Sayfa + yan menü öğesi (yalnız sistem yöneticisi)", durum: "bitti", hat: "frontend", pr: "frontend #149" }],
      kararlar: ["Backend yok; içeriği CEO elle günceller."],
    },
  ],
  bekleyenler: [
    {
      kod: "TKL",
      acilim: "İş Kalemi Kataloğu + Teklif Hazırlama",
      aciklama: "Katalogdan kalem seçerek sözleşme ve teklif; yan menüde Teklif Hazırlama. Yeni session işi, mockup bekleniyor.",
      kararlar: [
        "Tek katalog (Birim Oran Kataloğu genişler); planlamada fiyat, teklifte adam-saat görünür.",
        "Poz no zorunlu; referans fiyat + son fiyat önerisi.",
        "Teklif: revizyon, PDF/Excel, kâr/gider, KDV ve koşullar.",
        "Kazanılınca düzenlenebilir dönüştürmeyle proje + sözleşme.",
      ],
    },
    {
      kod: "DSC-B6 / F3",
      acilim: "Disiplin Kapsamı kapanışı",
      aciklama: "Beklemede (kullanıcı kararı).",
      kararlar: ["Şimdilik bekliyor, tekrar dönülecek."],
    },
  ],
  sorular: [
    { baslik: "TKL mockup'ları", aciklama: "Teklif listesi, detay, katalogdan seçici, katalog yönetimi, dönüştürme, PDF (promptlar TKL-MOCKUP-PROMPTLARI.md)." },
    { baslik: "Poz kodu kâhini (KARARLAR-BEKLEYEN 14)", aciklama: "Kısıtlı kullanıcının poz kodundan başka disiplin kaleminin varlığını sezebilmesi kabul edilsin mi?" },
    { baslik: "Mockup dışı metinler (KARARLAR-BEKLEYEN 15)", aciklama: "Disiplin kapsamı turunda CEO'nun verdiği metin ve gösterim kararlarının onayı." },
    { baslik: "Mobil davranış (KARARLAR-BEKLEYEN 13)", aciklama: "Dar ekranda kabuk davranışı. Kullanıcı: en son yapılacak." },
  ],
};
