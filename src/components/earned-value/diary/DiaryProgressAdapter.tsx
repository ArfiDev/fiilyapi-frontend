"use client";

/**
 * ═══ PLANLAMA ↔ GÜNLÜK KAYIT ADAPTÖRÜ — TEK İŞARETLİ DOSYA (spec §2.7) ═══
 *
 * PLANLAMA-SPEC §2.7: "Kaçınılmaz iki temas (günlük Gönder kontrolü, günlük
 * ekranındaki dağıtım bölümü) tek, işaretli bir adaptör dosyasında toplanır."
 * Frontend'de o dosya BUDUR. Çekirdek günlük ekranı (`components/site-diary/**`)
 * planlama kodunu IMPORT ETMEZ; iki taraf yalnız `diary-extension.ts`teki
 * tiplerle konuşur:
 *
 *   çekirdek (`DiaryEntryScreen`) ──onExtensionContext(ctx)──▶ bu adaptör
 *   çekirdek ◀──────────── extension: DiaryExtension ───────── bu adaptör
 *
 * Adaptör çekirdeğin rota sarmalayıcısını SARAR: bağlamı state'e alır,
 * planlama hook'larıyla yuvaları doldurur (Saat Dağıtımı + Gönder kontrol
 * çubuğu, Gönder kapısı, miktar tablosu ek kolonları, "Gün n · Hn", kilit
 * bandı) ve `extension` olarak geri verir. Şantiyede aktif baseline yoksa
 * uzantı VERİLMEZ — çekirdek bugünkü gibi çalışır (B2-3).
 *
 * Modül müşteride kurulu değilse iki rota sayfası bu dosya yerine çekirdek
 * sarmalayıcıyı basar; başka hiçbir yer değişmez.
 *
 * Mockup: `Şantiye - Günlük Kayıt (İlerleme).dc.html` (İ) + `(Ek Formlar)`.
 */
import { useState, type ReactElement } from "react";
import { useParams } from "next/navigation";

import type { DiaryExtensionContext, DiaryExtensionProps } from "@/components/site-diary/diary-extension";
import { GeneralSiteDiaryView } from "@/components/site-diary/GeneralSiteDiaryView";
import { SiteDiaryEntryView } from "@/components/site-diary/SiteDiaryEntryView";

import { useDiaryProgressExtension } from "./useDiaryProgressExtension";
import "./diary-progress.css";

interface DiaryProgressAdapterProps {
  render: (props: DiaryExtensionProps) => ReactElement;
  /** IZN-F3.2b · Şantiye rotasının proje adres anahtarı (kök günlükte yok). */
  projectKey?: string;
}

function DiaryProgressAdapter({ render, projectKey }: DiaryProgressAdapterProps) {
  const [context, setContext] = useState<DiaryExtensionContext | null>(null);
  const extension = useDiaryProgressExtension(context, projectKey);
  // `extension === undefined` → çekirdek uzantısız (bugünkü) davranışta kalır.
  return render({ extension, onExtensionContext: setContext });
}

/** Şantiye rotası — `/projeler/[projectId]/santiyeler/[siteId]/gunluk-kayit`. */
export function SiteDiaryProgressView() {
  const { projectId: projectKey } = useParams<{ projectId: string }>();
  return <DiaryProgressAdapter projectKey={projectKey} render={(props) => <SiteDiaryEntryView {...props} />} />;
}

/** Kök ikiz — `/gunluk-kayit?site=` (E7 kabuğu, şantiye seçici). */
export function GeneralDiaryProgressView() {
  return <DiaryProgressAdapter render={(props) => <GeneralSiteDiaryView {...props} />} />;
}
