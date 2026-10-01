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
  guncellendi: "2026-10-01 20:55",
  gorevler: [
    {
      kod: "BLF",
      acilim: "Bölüm Formu",
      aciklama:
        "Bölüm Bedeli iş kalemlerinden hesaplanır (elle giriş ve zorunluluk kalkar); bölüm tipi şirket geneli listeye yeni tip eklenebilir.",
      durum: "bitti",
      spec: "BOLUM-FORMU-SPEC.md",
      dilimler: [
        { kod: "B1", aciklama: "Bedel türev + bölüm tipi tablosu (migration) + 409 mevcut tip", durum: "bitti", hat: "backend", pr: "backend #152" },
        { kod: "F1", aciklama: "Form: bedel kilitli kutu, + Yeni tip ekle", durum: "bitti", hat: "frontend", pr: "frontend #158" },
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
        { kod: "B1", aciklama: "Önizleme ucu + tek istekte kayıt + Bölümsüz satır açığı", durum: "devam", hat: "backend", pr: "backend #153 (hazır, bekliyor)", bagimlilik: "F1 ile art arda merge" },
        { kod: "B1.1", aciklama: "Kayıtsız günde puantaj ekibi önizlemede gelir", durum: "devam", hat: "backend", pr: "#153'e ek" },
        { kod: "F1", aciklama: "Bölüm seçilince kalemler gelir, tek kayıt (plan onaylı; sözleşme + saf katman bitti, ekran yapılıyor)", durum: "devam", hat: "frontend" },
      ],
      kararlar: [
        "Önizleme + tek kayıt; seçim kayıt açmaz.",
        "Bölüm seçilince yalnız o bölüme dağıtılmış kalemler.",
        "Bölüm seçilmezse tamamen dağıtılmış kalem, dağıtıldığı her bölüm için satır alır.",
        "Bölümsüz satırın başlık bölümüne sayılması olduğu gibi kalır.",
      ],
    },
    {
      kod: "TKL",
      acilim: "İş Kalemi Kataloğu + Teklif Hazırlama",
      aciklama:
        "Katalogdan tıklayıp kalem ekleme; yan menüde Teklif Hazırlama (revizyon, PDF/Excel, kâr/gider, KDV, koşullar); kazanılan teklif projeye dönüşür.",
      durum: "devam",
      spec: "TEKLIF-KATALOG-HAZIRLIK.md",
      dilimler: [
        { kod: "P0", aciklama: "Mimari plan: katalog yeri, veri modeli, son fiyat, dönüştürme, dilimler", durum: "bitti", hat: "backend" },
        { kod: "B1", aciklama: "Katalog ana modüle taşınır (veritabanı değişmez)", durum: "devam", hat: "backend" },
        { kod: "B2", aciklama: "Poz no (MIM-0001, otomatik) + referans fiyat + katalog uçları", durum: "sirada", hat: "backend", bagimlilik: "B1" },
        { kod: "F1", aciklama: "İş Kalemi Kataloğu ekranı", durum: "sirada", hat: "frontend", bagimlilik: "B2" },
        { kod: "B3 / F2", aciklama: "Sözleşmeye katalogdan çoklu seçimle poz ekleme + son fiyat", durum: "sirada", hat: "backend", bagimlilik: "B2" },
        { kod: "B4 / F3", aciklama: "Teklif çekirdeği + Liste / Yeni / Detay ekranları", durum: "sirada", hat: "backend", bagimlilik: "B3" },
        { kod: "B5 / F4", aciklama: "Şablonlar, Excel, PDF (yazdırma görünümü)", durum: "sirada", hat: "backend", bagimlilik: "B4" },
        { kod: "B6 / F5", aciklama: "Kazanılan teklifi projeye dönüştürme + adam-saat Rev.0", durum: "sirada", hat: "backend", bagimlilik: "B4" },
      ],
      kararlar: [
        "Veri düzeyinde tek katalog; Planlama'da fiyatsız Birim Oran Kataloğu, teklif/sözleşmede fiyatlı İş Kalemi Kataloğu.",
        "Poz no zorunlu, şirket genelinde tekil; referans fiyat + son fiyat (sözleşme, teklif, satınalma, hakediş).",
        "Teklifte adam-saat düzenlenebilir; dönüştürülünce projenin adam-saat bütçesinde Rev.0 olur.",
        "Kâr/gider teklif geneli + kalemde; teklif B.F. girilince kâr geri hesaplanır; fiyat farkı koşulu; şablonlar.",
        "Çoklu seçici ve PDF mevcut ekranlardan türetilir, onaya sunulur.",
        "Kazanıldı ile dönüştürme ayrı; gruplar sözleşmeye taşınır; durum revizyon başına.",
        "Poz no: disiplin kodu + 4 hane (MIM-0001), otomatik sıradaki; disiplin kodu değişirse yeniden numaralanır; mevcut 28 kaleme otomatik numara.",
      ],
    },
    {
      kod: "TMP",
      acilim: "Test Geçici Dizini",
      aciklama: "Paralel test koşuları aynı geçici dizini paylaşıp birbirinin dosyalarını siliyordu (bugünkü kararsız test kırmızılarının kökü).",
      durum: "bitti",
      spec: "-",
      dilimler: [{ kod: "B1", aciklama: "Koşu başına ayrı geçici dizin", durum: "bitti", hat: "backend", pr: "backend #154" }],
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
