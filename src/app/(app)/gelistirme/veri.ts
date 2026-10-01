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
  guncellendi: "2026-10-01 19:40",
  gorevler: [
    {
      kod: "BLF",
      acilim: "Bölüm Formu",
      aciklama:
        "Bölüm Bedeli iş kalemlerinden hesaplanır (elle giriş ve zorunluluk kalkar); bölüm tipi şirket geneli listeye yeni tip eklenebilir.",
      durum: "devam",
      spec: "BOLUM-FORMU-SPEC.md",
      dilimler: [
        { kod: "B1", aciklama: "Bedel türev + bölüm tipi tablosu (migration) + 409 mevcut tip", durum: "devam", hat: "backend", pr: "backend #152 (CI)", bagimlilik: "F1 ile art arda merge" },
        { kod: "F1", aciklama: "Form: bedel kilitli kutu, + Yeni tip ekle", durum: "devam", hat: "frontend", pr: "frontend #158 (CI)", bagimlilik: "B1 ile art arda merge" },
      ],
      kararlar: [
        "Bölüm tipi zorunlu kalır; yayındaki bölümde boşaltılamaz.",
        "Yazım farkıyla kopya tip engellenir.",
        "+ Yeni tip ekle, + Yeni Grup deseninde; bedel kilitli kutu + açıklama.",
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
        { kod: "B1", aciklama: "Önizleme ucu + tek istekte kayıt + Bölümsüz satır açığı", durum: "devam", hat: "backend", pr: "backend #153", bagimlilik: "F1 ile art arda merge" },
        { kod: "F1", aciklama: "Bölüm seçilince kalemler gelir, tek kayıt", durum: "devam", hat: "frontend" },
      ],
      kararlar: [
        "Önizleme + tek kayıt; seçim kayıt açmaz.",
        "Bölüm seçilince yalnız o bölüme dağıtılmış kalemler.",
        "Bölüm seçilmezse tamamen dağıtılmış kalem, dağıtıldığı her bölüm için satır alır.",
        "Bölümsüz satırın başlık bölümüne sayılması olduğu gibi kalır.",
      ],
    },
    {
      kod: "TMP",
      acilim: "Test Geçici Dizini",
      aciklama: "Paralel test koşuları aynı geçici dizini paylaşıp birbirinin dosyalarını siliyordu (bugünkü kararsız test kırmızılarının kökü).",
      durum: "devam",
      spec: "-",
      dilimler: [{ kod: "B1", aciklama: "Koşu başına ayrı geçici dizin", durum: "devam", hat: "backend" }],
      kararlar: [],
    },
    {
      kod: "SZK",
      acilim: "Sözleşme Kalemi",
      aciklama: "Sözleşmeye bağlı şantiye kaleminde poz no, tarif, birim ve birim fiyat kilitli; yalnız sözleşmeden düzenlenir.",
      durum: "bitti",
      spec: "SOZLESME-KALEM-KILIDI-SPEC.md",
      dilimler: [
        { kod: "F1", aciklama: "Sözleşme tablosunda satır içi düzenleme", durum: "bitti", hat: "frontend", pr: "frontend #148" },
        { kod: "B1", aciklama: "Alan kilidi + sayı sınırları", durum: "bitti", hat: "backend", pr: "backend #151" },
        { kod: "F2", aciklama: "Şantiye formunda kilit gösterimi + hane sınırı", durum: "bitti", hat: "frontend", pr: "frontend #157" },
      ],
      kararlar: ["Şantiyede açık kalanlar: miktar (kota), grup, sıra."],
    },
    {
      kod: "FLK",
      acilim: "Sekme Şeridi",
      aciklama: "Aktif sekmenin kapatma düğmesi kırpık kalıyordu; görsel test kararsızdı.",
      durum: "bitti",
      spec: "-",
      dilimler: [{ kod: "F1", aciklama: "Şerit sekmeyi düğmesiyle birlikte gösterir", durum: "bitti", hat: "frontend", pr: "frontend #156" }],
      kararlar: [],
    },
    {
      kod: "BDG",
      acilim: "Bölüm Dağılımı",
      aciklama: "Şantiyenin iş kalemleri bölümlere tek ekrandan dağıtılır (kalem x bölüm matrisi).",
      durum: "bitti",
      spec: "BOLUM-DAGILIMI-SPEC.md",
      dilimler: [
        { kod: "B1", aciklama: "Matris okuma + kayıt ucu", durum: "bitti", hat: "backend", pr: "backend #150" },
        { kod: "F1", aciklama: "Bölüm Dağılımı ekranı", durum: "bitti", hat: "frontend", pr: "frontend #154" },
      ],
      kararlar: [],
    },
    {
      kod: "KDG / YZD / GRP / DTI / GLS",
      acilim: "Bugün biten küçük işler",
      aciklama: "Kalanı buraya dağıt, yazdırmada kabuk gizli, rapor ad taşması ve takvim, form tarih alanı, bu sayfa.",
      durum: "bitti",
      spec: "-",
      dilimler: [
        { kod: "KDG-F1", aciklama: "Kalanı buraya dağıt", durum: "bitti", hat: "frontend", pr: "frontend #151" },
        { kod: "YZD-F1", aciklama: "Yazdırmada yan menü ve üst bar basılmaz", durum: "bitti", hat: "frontend", pr: "frontend #153" },
        { kod: "GRP-F1", aciklama: "Rapor ad taşması + takvim", durum: "bitti", hat: "frontend", pr: "frontend #147" },
        { kod: "DTI-F1", aciklama: "Form tarih alanı", durum: "bitti", hat: "frontend", pr: "frontend #150" },
        { kod: "GLS-F1", aciklama: "Geliştirme sayfası", durum: "bitti", hat: "frontend", pr: "frontend #149" },
      ],
      kararlar: [],
    },
  ],
  bekleyenler: [
    {
      kod: "TKL",
      acilim: "İş Kalemi Kataloğu + Teklif Hazırlama",
      aciklama: "Mockup'lar geldi (Liste, Yeni, Detay, Şablonlar, Dönüştür, Katalog); inceleniyor. Uygulama yeni session'da.",
      kararlar: [
        "Tek katalog; planlamada fiyat, teklifte adam-saat görünür.",
        "Poz no zorunlu; referans fiyat + son fiyat önerisi.",
        "Teklif: revizyon, PDF/Excel, kâr/gider, KDV ve koşullar.",
        "Kazanılınca düzenlenebilir dönüştürmeyle proje + sözleşme.",
      ],
    },
    {
      kod: "BOQ-E2E",
      acilim: "İş kalemi düzenleme testi",
      aciklama: "Şantiye iş kalemi düzenleme formunun uçtan uca testi yok; küçük iş.",
      kararlar: [],
    },
    {
      kod: "DSC-B6 / F3",
      acilim: "Disiplin Kapsamı kapanışı",
      aciklama: "Beklemede (kullanıcı kararı).",
      kararlar: ["Şimdilik bekliyor, tekrar dönülecek."],
    },
  ],
  sorular: [
    { baslik: "Poz kodu kâhini (KARARLAR-BEKLEYEN 14)", aciklama: "Kısıtlı kullanıcının poz kodundan başka disiplin kaleminin varlığını sezebilmesi kabul edilsin mi?" },
    { baslik: "Mockup dışı metinler (KARARLAR-BEKLEYEN 15)", aciklama: "Disiplin kapsamı turunda CEO'nun verdiği metin ve gösterim kararlarının onayı." },
    { baslik: "Mobil davranış (KARARLAR-BEKLEYEN 13)", aciklama: "Dar ekranda kabuk davranışı. Kullanıcı: en son yapılacak." },
  ],
};
