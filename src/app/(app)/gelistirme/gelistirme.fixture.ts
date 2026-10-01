// GLS-F1 GEÇİCİ — test fikstürü; gerçek veri.ts'den BAĞIMSIZ, sabit.
import type { GelistirmeVerisi } from "./veri";

export const FIKSTUR: GelistirmeVerisi = {
  guncellendi: "2000-01-02 03:04",
  gorevler: [
    { kod: "GBT", acilim: "Biten Gorev", aciklama: "bitti aciklama", durum: "bitti", spec: "", dilimler: [], kararlar: [] },
    {
      kod: "GSR",
      acilim: "Siradaki Gorev",
      aciklama: "sirada aciklama",
      durum: "sirada",
      spec: "",
      dilimler: [
        { kod: "B1", aciklama: "sirada backend dilimi", durum: "sirada", hat: "backend" },
        { kod: "F1", aciklama: "sirada frontend dilimi", durum: "sirada", hat: "frontend" },
      ],
      kararlar: [],
    },
    {
      kod: "GDV",
      acilim: "Devam Gorev",
      aciklama: "devam aciklama",
      durum: "devam",
      spec: "",
      dilimler: [
        { kod: "B1", aciklama: "devam backend dilimi", durum: "devam", hat: "backend" },
        { kod: "F1", aciklama: "devam frontend dilimi", durum: "sirada", hat: "frontend", bagimlilik: "B1 merge bekler" },
      ],
      kararlar: ["devam karari bir"],
    },
    {
      kod: "GBK",
      acilim: "Bekleyen Gorev",
      aciklama: "beklemede aciklama",
      durum: "beklemede",
      spec: "",
      dilimler: [{ kod: "B1", aciklama: "beklemede dilim", durum: "sirada", hat: "backend" }],
      kararlar: [],
    },
  ],
  bekleyenler: [{ kod: "BKL", acilim: "Baslamamis Is", aciklama: "baslamamis aciklama", kararlar: ["baslamamis karari"] }],
  sorular: [{ baslik: "Fikstur sorusu", aciklama: "soru aciklama" }],
};

export const BOS_FIKSTUR: GelistirmeVerisi = { guncellendi: "-", gorevler: [], bekleyenler: [], sorular: [] };
