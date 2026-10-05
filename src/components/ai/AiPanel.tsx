"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Textarea } from "@/components/ui";
import { SparkleIcon } from "@/components/ui/icons";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { useSession } from "@/components/shell/SessionProvider";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { AI_VIEW, PROJECTS_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { useProjects, PROJECT_LIST_MAX_LIMIT } from "@/lib/api/hooks/useProjects";
import { useSites } from "@/lib/api/hooks/useSites";
import {
  useAiConversation,
  useAiConversations,
} from "@/lib/api/hooks/useAiConversations";
import {
  AiChatError,
  streamAiChat,
  type AiBaglantiKalemi,
  type AiBlok,
  type AiEvent,
} from "@/lib/api/ai-chat-client";
import { AiBlockList } from "./AiBlocks";
import { AiContextPanel, type AiAcilanKayit } from "./AiContextPanel";
import { AiHistory } from "./AiHistory";
import {
  AiAssistantMessage,
  AiFeedbackBar,
  AiTypingIndicator,
  AiUserMessage,
  AiWelcome,
  saatDamgasi,
  sureMetni,
} from "./AiMessage";
import { AiToolTrace } from "./AiToolTrace";
import { AttachIcon, SendIcon } from "./AiIcons";
import { ekranSebebi, ekranYolu } from "./ai-screen-routes";
import "./ai-panel.css";

/**
 * FİİL AI paneli — `projedesign/AI Chat.dc.html` (397 satır) birebir.
 *
 * ## Mockup'ın kendi üst barı BASILMAZ (K4)
 *
 * Mockup 29-51 kendi üst barını çizer (`FİİL` logosu · `FİİL AI` kimliği ·
 * `● Çevrimiçi` · `← Panele Dön` · avatar). Kabuk canon'u (F3 Topbar) kazanır
 * ve o bar basılmaz — logo, geri tuşu ve avatar zaten kabukta var.
 *
 * 🔴 **AMA AI KİMLİK ŞERİDİ KAYBOLMAZ.** AI-1'de o şerit hiçbir yere
 * taşınmamıştı; yalnız `aria-label` olarak vardı, yani **gözle görünmüyordu**.
 * Mockup'ın "FİİL AI · Proje verilerinize bağlı · Çevrimiçi" üçlüsü orta
 * sütunun başına, mesaj alanının üstüne taşındı. SAPMA + GEREKÇE: bar kabukla
 * çakışırdı, kimlik şeridi çakışmaz ve kullanıcıya "hangi asistandayım, veriye
 * bağlı mı" sorusunu cevaplar.
 *
 * 🔴 `● Çevrimiçi` noktasındaki U+25CF glifi alt küme dışıdır
 * (`symbol-subset-guard`); nokta bir CSS dairesidir, bir karakter değil.
 */

const PERMISSION_MODULE = "ai";

/** Mockup 340-346 — composer üstündeki dört öneri çipi. */
const ONERI_CIPLERI: readonly string[] = [
  "Nakit akışı nasıl?",
  "Bu hafta ne planlandı?",
  "Gecikmiş tahsilatlar",
  "Proje marj karşılaştır",
];

/**
 * Araç adı → "yazıyor" etiketi (mockup 328).
 *
 * 🔴 Sabit bir cümle YAZILMAZ: "Hakediş verileri okunuyor…" stok sorgusunda da
 * çıkar ve ekran yalan söyler. Tanınmayan araç için genel ama DÜRÜST bir cümle.
 */
const ARAC_ETIKETLERI: Record<string, string> = {
  projeleri_listele: "Proje verileri okunuyor…",
  onay_kutum: "Onay kutunuz okunuyor…",
  puantaj_haftasi: "Puantaj verileri okunuyor…",
  gosterge_ozeti: "Gösterge paneli verileri okunuyor…",
  yetkilerim: "Yetkileriniz okunuyor…",
  navigate_to: "Uygun ekran aranıyor…",
};

const VARSAYILAN_ETIKET = "Yanıt hazırlanıyor…";

/** Araç adı → "Erişilen Veriler" rozeti (mockup 123-129). */
const ARAC_VERI_KUMESI: Record<string, string> = {
  projeleri_listele: "Projeler",
  onay_kutum: "Onaylar",
  puantaj_haftasi: "Puantaj",
  gosterge_ozeti: "Gösterge Paneli",
  yetkilerim: "Yetkiler",
  navigate_to: "Ekranlar",
};

export interface AiIz {
  cagriId: string;
  aracAdi: string;
  sonuc?: Extract<AiEvent, { tip: "arac_sonuc" }>;
}

export interface Tur {
  soru: string;
  soruDamgasi: string;
  metin: string;
  izler: AiIz[];
  bloklar: AiBlok[];
  hata: string | null;
  reddetme: string | null;
  bitti: boolean;
  /** 🔴 `bitti` ile `filtrelendi` AYRI TUTULUR (§5-30). */
  sebep: string | null;
  cevapDamgasi: string | null;
  sureMs: number | null;
}

export function bosTur(soru: string, damga: string): Tur {
  return {
    soru,
    soruDamgasi: damga,
    metin: "",
    izler: [],
    bloklar: [],
    hata: null,
    reddetme: null,
    bitti: false,
    sebep: null,
    cevapDamgasi: null,
    sureMs: null,
  };
}

/** Olayı tur durumuna uygular — saf fonksiyon, ayrıca test edilir. */
export function turaUygula(tur: Tur, olay: AiEvent): Tur {
  switch (olay.tip) {
    case "metin":
      return { ...tur, metin: tur.metin + olay.metin };
    case "arac_basladi":
      return { ...tur, izler: [...tur.izler, { cagriId: olay.cagri_id, aracAdi: olay.arac_adi }] };
    case "arac_sonuc":
      return {
        ...tur,
        izler: tur.izler.map((iz) =>
          iz.cagriId === olay.cagri_id && iz.sonuc === undefined ? { ...iz, sonuc: olay } : iz,
        ),
      };
    case "yapisal_blok":
      // 🔴 K1: bloklar araç sonucundan gelir; model metninden PARSE EDİLMEZ.
      return { ...tur, bloklar: [...tur.bloklar, ...olay.bloklar] };
    case "reddetme":
      return { ...tur, reddetme: olay.metin };
    case "hata":
      return { ...tur, hata: olay.mesaj };
    case "tur_bitti":
      return { ...tur, bitti: true, sebep: olay.sebep };
    default:
      return tur;
  }
}

/** Turun bitiş sebebini kullanıcıya dönük cümleye çevirir (§5-30). */
export const SEBEP_CUMLELERI: Record<string, string> = {
  kesildi: "⚠️ Yanıt tamamlanmadan kesildi; aşağıdaki cevap EKSİKTİR.",
  filtrelendi: "⚠️ Yanıt içerik süzgecine takıldı; gösterilen kısım eksik olabilir.",
  duraklatildi: "⚠️ Tur askıya alındı; yanıt tamamlanmadı.",
  reddetme: "Model bu isteği yanıtlamadı. Bu bir sistem hatası değildir.",
};

/** Kaynak/aksiyon bloklarından "Bu Sohbette Açılanlar" listesini türetir. */
export function acilanlariTurets(bloklar: readonly AiBlok[]): AiAcilanKayit[] {
  const gorulen = new Map<string, AiAcilanKayit>();
  const ekle = (k: AiBaglantiKalemi) => {
    if (gorulen.has(k.etiket)) return;
    gorulen.set(k.etiket, {
      etiket: k.etiket,
      yol: ekranYolu(k.ekran),
      sebep: ekranSebebi(k.ekran),
    });
  };
  for (const b of bloklar) {
    if (b.tip === "kaynak") b.kalemler.forEach(ekle);
  }
  return [...gorulen.values()];
}

export function AiPanel() {
  const permission = useModulePermission(PERMISSION_MODULE);
  const canViewAi = useButtonGate({ pages: AI_VIEW, need: "view", fallback: permission.canView });
  const projePermission = useModulePermission("projects");
  const canViewProjects = useButtonGate({ pages: PROJECTS_VIEW, need: "view", fallback: projePermission.canView });
  const { me } = useSession();
  const [girdi, setGirdi] = useState("");
  const [turlar, setTurlar] = useState<Tur[]>([]);
  const [akiyor, setAkiyor] = useState(false);
  const [aktifSohbet, setAktifSohbet] = useState<string | null>(null);
  const [seciliProje, setSeciliProje] = useState<string | null>(null);
  const [seciliSantiye, setSeciliSantiye] = useState<string | null>(null);
  const iptalRef = useRef<AbortController | null>(null);

  const sohbetler = useAiConversations();
  const gecmisSohbet = useAiConversation(turlar.length === 0 ? aktifSohbet : null);
  // 🔴 KAYIT NO 22 — üçlü işleç eskiden yalnız süzgeci/limiti değiştiriyordu,
  // sorguyu KAPATMIYORDU: `canView=false` olan kullanıcıda da `GET /projects`
  // ağa çıkıyordu (yalnız limitsiz). `enabled` KOŞULSUZ kapı olmalı.
  const projeler = useProjects({
    limit: PROJECT_LIST_MAX_LIMIT,
    offset: 0,
    enabled: canViewProjects,
  });

  /**
   * AI-BAĞLAM · ETKİN kapsam. Seçim durumu ile etkin kapsam AYNI ŞEY DEĞİLDİR:
   * kullanıcı hiçbir şey seçmemişken de panel ilk projeyi/şantiyeyi gösterir ve
   * `POST /ai/chat` gövdesine BU kimlikler biner. Hesap panelin İÇİNDE
   * kalsaydı, ekranda görünen kapsam ile isteğe binen kapsam ayrışabilirdi —
   * panel "A-Blok" yazarken model başka bir şantiyeye bakardı.
   */
  const projeListesi = projeler.data?.items ?? [];
  const etkinProje =
    projeListesi.find((p) => p.id === seciliProje) ?? projeListesi[0] ?? null;

  // `projectId` boşsa hook AĞA ÇIKMAZ (`sitesQueryOptions`in boş-id kapısı).
  const santiyeler = useSites(etkinProje?.id ?? "");
  const santiyeListesi = santiyeler.data?.items ?? [];
  /**
   * 🔴 Proje değişince şantiye seçimi SIFIRLANMAZ, ÇÖZÜLEMEZ: eski projenin
   * kimliği yeni listede bulunmaz ve arama `[0]`a düşer. `useEffect` ile
   * sıfırlamak, bir kare boyunca "yeni projenin listesi + eski projenin
   * şantiyesi" gibi imkânsız bir ara durum bırakırdı.
   */
  const etkinSantiye =
    santiyeListesi.find((s) => s.id === seciliSantiye) ?? santiyeListesi[0] ?? null;

  useEffect(() => () => iptalRef.current?.abort(), []);

  const adSoyad = (me as { full_name?: string } | null)?.full_name ?? null;

  const gonder = useCallback(
    async (mesaj: string) => {
      const kirpilmis = mesaj.trim();
      if (kirpilmis.length === 0 || akiyor) return;
      setGirdi("");
      setAkiyor(true);
      const basladi = Date.now();
      const yeni = bosTur(kirpilmis, saatDamgasi(new Date()));
      setTurlar((onceki) => [...onceki, yeni]);
      const indeks = turlar.length;
      const controller = new AbortController();
      iptalRef.current = controller;
      const guncelle = (donustur: (t: Tur) => Tur) =>
        setTurlar((onceki) => onceki.map((t, i) => (i === indeks ? donustur(t) : t)));
      try {
        for await (const olay of streamAiChat(kirpilmis, {
          signal: controller.signal,
          conversationId: aktifSohbet,
          // 🔴 Panelin GÖSTERDİĞİ kapsam ile isteğe binen kapsam aynı iki
          // değişkendir; ekran bir şey gösterip model başkasını göremez.
          projectId: etkinProje?.id ?? null,
          siteId: etkinSantiye?.id ?? null,
        })) {
          guncelle((t) => turaUygula(t, olay));
        }
      } catch (err) {
        // 🔴 Backend'in DÜRÜST metni ("sağlayıcı yapılandırılmadı") olduğu gibi
        // basılır; "sistem hatası" diye ezilmez.
        const mesajMetni =
          err instanceof AiChatError
            ? err.detail
            : "AI asistanına ulaşılamadı. Lütfen yeniden deneyin.";
        guncelle((t) => ({ ...t, hata: mesajMetni }));
      } finally {
        guncelle((t) => ({
          ...t,
          cevapDamgasi: saatDamgasi(new Date()),
          sureMs: Date.now() - basladi,
        }));
        setAkiyor(false);
        // Yeni sohbet açıldıysa kimliğini listeden öğreniriz (akış taşımaz).
        void sohbetler.refetch();
      }
    },
    [akiyor, aktifSohbet, turlar.length, sohbetler, etkinProje, etkinSantiye],
  );

  const yeniSohbet = useCallback(() => {
    iptalRef.current?.abort();
    setTurlar([]);
    setGirdi("");
    setAkiyor(false);
    setAktifSohbet(null);
  }, []);

  const sohbetSec = useCallback((id: string) => {
    iptalRef.current?.abort();
    setTurlar([]);
    setGirdi("");
    setAkiyor(false);
    setAktifSohbet(id);
  }, []);

  const sonTur = turlar[turlar.length - 1] ?? null;
  const kosanArac = sonTur?.izler.find((iz) => iz.sonuc === undefined) ?? null;
  const yaziyorEtiketi = kosanArac
    ? (ARAC_ETIKETLERI[kosanArac.aracAdi] ?? VARSAYILAN_ETIKET)
    : VARSAYILAN_ETIKET;

  const erisilenVeriler = useMemo(() => {
    const kume = new Set<string>();
    for (const t of turlar) {
      for (const iz of t.izler) {
        const ad = ARAC_VERI_KUMESI[iz.aracAdi];
        if (ad) kume.add(ad);
      }
    }
    return [...kume];
  }, [turlar]);

  const acilanlar = useMemo(
    () => acilanlariTurets(turlar.flatMap((t) => t.bloklar)),
    [turlar],
  );

  if (!canViewAi) return <AccessDenied />;

  const gecmisGovde = gecmisSohbet.data;
  // 🔴 TEK tarih yeri: sol sütunun gün gruplaması ile sağ sütunun dönemi AYNI
  // ana bakar. İki ayrı `new Date()` gece yarısını iki farklı güne düşürebilir.
  const simdi = new Date();

  return (
    <div className="ai-panel">
      <AiHistory
        sohbetler={sohbetler.data?.items ?? []}
        aktifId={aktifSohbet}
        yukleniyor={sohbetler.isLoading}
        simdi={simdi}
        erisilenVeriler={erisilenVeriler}
        onYeniSohbet={yeniSohbet}
        onSec={sohbetSec}
      />

      <section className="ai-main" aria-label="FİİL AI Asistanı">
        {/* K4 — mockup 36-45'in AI kimlik şeridi, kabuk barının İÇİNE değil
            ekranın içine taşındı. */}
        <header className="ai-ident">
          <span className="ai-ident__badge" aria-hidden="true">
            <SparkleIcon width={14} height={14} />
          </span>
          <span className="ai-ident__text">
            <span className="ai-ident__title">FİİL AI</span>
            <span className="ai-ident__sub">Proje verilerinize bağlı</span>
          </span>
          <span className="ai-ident__online">
            <span className="ai-ident__dot" aria-hidden="true" />
            Çevrimiçi
          </span>
        </header>

        <div className="ai-messages">
          <div className="ai-messages__col">
            {turlar.length === 0 && aktifSohbet === null ? (
              <AiWelcome adSoyad={adSoyad} />
            ) : null}

            {/* 🔴 A3'ün DÜRÜST bedeli: geçmiş sohbette kartlar YOKTUR ve bu
                sessizce boş kart basılarak değil, YAZILARAK bildirilir. */}
            {turlar.length === 0 && gecmisGovde ? (
              <>
                <div className="ai-notice ai-notice--info" role="status">
                  {gecmisGovde.bloklar_saklanmadi_notu}
                </div>
                {gecmisGovde.messages.map((m) =>
                  m.role === "kullanici" ? (
                    <AiUserMessage
                      key={m.id}
                      metin={m.content}
                      adSoyad={adSoyad}
                      damga={saatDamgasi(new Date(m.created_at))}
                    />
                  ) : (
                    <AiAssistantMessage
                      key={m.id}
                      metin={m.content}
                      altBilgi={
                        <AiFeedbackBar
                          damga={saatDamgasi(new Date(m.created_at))}
                          sure={sureMetni(m.duration_ms)}
                          metin={m.content}
                        />
                      }
                    >
                      {m.tool_names.length > 0 ? (
                        <div className="ai-traces">
                          {m.tool_names.map((ad, i) => (
                            <p key={`${m.id}-${i}`} className="ai-trace ai-trace--notr">
                              <code className="ai-trace__name">{ad}</code>
                              <span className="ai-trace__state">
                                {m.tool_states[i] ?? "bilinmiyor"}
                              </span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                      {m.finish_reason && SEBEP_CUMLELERI[m.finish_reason] ? (
                        <p className="ai-notice ai-notice--warn" role="status">
                          {SEBEP_CUMLELERI[m.finish_reason]}
                        </p>
                      ) : null}
                    </AiAssistantMessage>
                  ),
                )}
              </>
            ) : null}

            {turlar.map((tur, i) => (
              <div key={`${i}-${tur.soruDamgasi}`} className="ai-turn">
                <AiUserMessage metin={tur.soru} adSoyad={adSoyad} damga={tur.soruDamgasi} />
                {tur.izler.length > 0 ||
                tur.metin.length > 0 ||
                tur.bloklar.length > 0 ||
                tur.bitti ? (
                  <AiAssistantMessage
                    metin={tur.metin}
                    altBilgi={
                      tur.bitti ? (
                        <AiFeedbackBar
                          damga={tur.cevapDamgasi}
                          sure={sureMetni(tur.sureMs)}
                          metin={tur.metin}
                        />
                      ) : null
                    }
                  >
                    <div className="ai-traces">
                      {tur.izler.map((iz) => (
                        <AiToolTrace key={iz.cagriId} aracAdi={iz.aracAdi} sonuc={iz.sonuc} />
                      ))}
                    </div>
                    <AiBlockList bloklar={tur.bloklar} />
                    {tur.sebep && SEBEP_CUMLELERI[tur.sebep] ? (
                      <p className="ai-notice ai-notice--warn" role="status">
                        {SEBEP_CUMLELERI[tur.sebep]}
                      </p>
                    ) : null}
                  </AiAssistantMessage>
                ) : null}
                {tur.reddetme !== null ? (
                  <div className="ai-notice ai-notice--refusal" role="status">
                    {tur.reddetme}
                  </div>
                ) : null}
                {tur.hata !== null ? (
                  <div className="ai-notice ai-notice--error" role="status">
                    {tur.hata}
                  </div>
                ) : null}
              </div>
            ))}

            {akiyor && (sonTur?.metin.length ?? 0) === 0 ? (
              <AiTypingIndicator etiket={yaziyorEtiketi} />
            ) : null}
          </div>
        </div>

        <form
          className="ai-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void gonder(girdi);
          }}
        >
          <div className="ai-composer__col">
            {/* Mockup 340-346 — öneri çipleri. */}
            <div className="ai-suggest">
              {ONERI_CIPLERI.map((soru) => (
                <Button
                  key={soru}
                  variant="ghost"
                  size="sm"
                  className="ai-suggest__btn"
                  disabled={akiyor}
                  onClick={() => void gonder(soru)}
                >
                  {soru}
                </Button>
              ))}
            </div>

            <div className="ai-composer__box">
              <Textarea
                aria-label="FİİL AI'ya sorun"
                placeholder="FİİL AI'ya sorun…"
                className="ai-composer__input"
                rows={1}
                maxLength={4000}
                value={girdi}
                disabled={akiyor}
                onChange={(event) => setGirdi(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void gonder(girdi);
                  }
                }}
              />
              <div className="ai-composer__actions">
                {/* K3: mockup'ta VAR, bağlanmadı → silinmez, devre dışı + sebep. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ai-composer__attach"
                  disabled
                  aria-disabled="true"
                  title="Dosya eklemek bu sürümde kapalı."
                  aria-label="Dosya ekle (bu sürümde kapalı)"
                >
                  <AttachIcon />
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="ai-composer__send"
                  disabled={akiyor}
                  aria-label="Gönder"
                >
                  <SendIcon />
                </Button>
              </div>
            </div>
            <p className="ai-composer__hint">
              FİİL AI sisteminizin gerçek verilerini okur · Kritik kararlarda kaynağı doğrulayın
            </p>
          </div>
        </form>
      </section>

      <AiContextPanel
        projeler={projeListesi}
        seciliProje={etkinProje}
        santiyeler={santiyeListesi}
        seciliSantiye={etkinSantiye}
        santiyelerYukleniyor={santiyeler.isLoading}
        projeYetkisiVar={canViewProjects}
        akiyor={akiyor}
        simdi={simdi}
        acilanlar={acilanlar}
        onProjeSec={setSeciliProje}
        onSantiyeSec={setSeciliSantiye}
        onHizliAnaliz={(soru) => void gonder(soru)}
      />
    </div>
  );
}
