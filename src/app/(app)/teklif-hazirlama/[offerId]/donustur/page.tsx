import { notFound } from "next/navigation";

// TKL-F5.1 · YER TUTUCU: kırıntı ağacı ⟺ dosya sistemi bekçisi (trail.test.ts) her ağaç düğümü için bir
// `page.tsx` ister. Ekran TKL-F5.3'te gelir ve bu dosyayı DEĞİŞTİRİR; o zamana dek hiçbir bağlantı buraya gitmez.
export default function TeklifDonusturPage(): never {
  notFound();
}
