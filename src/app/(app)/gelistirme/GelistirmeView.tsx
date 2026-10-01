"use client";

// GLS-F1 GEÇİCİ — yalnız system_admin görür; diğer roller AccessDenied alır.
import { useSession } from "@/components/shell/SessionProvider";
import { AccessDenied } from "@/components/settings/AccessDenied";
import "@/components/settings/settings.css";
import { Badge, Card } from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";
import { beklemedeGorevler, kuyrukOzeti, siraliGorevler } from "./derive";
import type { KuyrukSatiri } from "./derive";
import { canSeeGelistirme } from "./erisim";
import type { Durum, Gorev, GelistirmeVerisi, Hat } from "./veri";
import "./gelistirme.css";

const DURUM_ROZET: Record<Durum, { label: string; variant: BadgeVariant }> = {
  devam: { label: "Devam", variant: "primary" },
  sirada: { label: "Sırada", variant: "neutral" },
  beklemede: { label: "Beklemede", variant: "warning" },
  bitti: { label: "Bitti", variant: "success" },
};

function DurumRozeti({ durum }: { durum: Durum }) {
  const { label, variant } = DURUM_ROZET[durum];
  return <Badge variant={variant}>{label}</Badge>;
}

function Bos({ metin }: { metin: string }) {
  return <p className="gls-empty">{metin}</p>;
}

function KuyrukSutunu({ baslik, satirlar }: { baslik: string; satirlar: KuyrukSatiri[] }) {
  return (
    <Card title={baslik}>
      {satirlar.length === 0 ? (
        <Bos metin="Kuyrukta iş yok." />
      ) : (
        <ol className="gls-queue">
          {satirlar.map(({ gorevKod, dilim }) => (
            <li key={`${gorevKod}-${dilim.kod}`} className="gls-queue__row">
              <span className="gls-code">
                {gorevKod} {dilim.kod}
              </span>
              <span className="gls-queue__text">{dilim.aciklama}</span>
              <DurumRozeti durum={dilim.durum} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function GorevKarti({ gorev }: { gorev: Gorev }) {
  return (
    <Card
      title={
        <span className="gls-task-title">
          <span className="gls-code">{gorev.kod}</span> {gorev.acilim}
        </span>
      }
      actions={<DurumRozeti durum={gorev.durum} />}
      data-testid={`gorev-${gorev.kod}`}
    >
      <p className="gls-task-desc">{gorev.aciklama}</p>
      {gorev.dilimler.length === 0 ? (
        <Bos metin="Dilim yok." />
      ) : (
        <table className="gls-table">
          <caption className="sr-only">{gorev.kod} dilimleri</caption>
          <thead>
            <tr>
              <th scope="col">Kod</th>
              <th scope="col">Açıklama</th>
              <th scope="col">Hat</th>
              <th scope="col">Bağımlılık</th>
              <th scope="col">Durum</th>
            </tr>
          </thead>
          <tbody>
            {gorev.dilimler.map((dilim) => (
              <tr key={dilim.kod}>
                <td className="gls-code">{dilim.kod}</td>
                <td>{dilim.aciklama}</td>
                <td>{dilim.hat}</td>
                <td>{dilim.bagimlilik ?? "—"}</td>
                <td>
                  <DurumRozeti durum={dilim.durum} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {gorev.kararlar.length > 0 && (
        <>
          <h4 className="gls-sub">Kararlar</h4>
          <ul className="gls-list">
            {gorev.kararlar.map((karar) => (
              <li key={karar}>{karar}</li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Bolum({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <section className="gls-section" aria-label={baslik}>
      <h2 className="gls-h2">{baslik}</h2>
      {children}
    </section>
  );
}

const HATLAR: ReadonlyArray<{ hat: Hat; baslik: string }> = [
  { hat: "backend", baslik: "Backend sırası" },
  { hat: "frontend", baslik: "Frontend sırası" },
];

export function GelistirmeIcerik({ veri }: { veri: GelistirmeVerisi }) {
  const gorevler = siraliGorevler(veri.gorevler);
  const beklemede = beklemedeGorevler(veri.gorevler);
  return (
    <div className="gls">
      <h1 className="gls-h1">Geliştirme</h1>
      <p className="gls-updated">Son güncelleme: {veri.guncellendi}</p>

      <div className="gls-queues">
        {HATLAR.map(({ hat, baslik }) => (
          <KuyrukSutunu key={hat} baslik={baslik} satirlar={kuyrukOzeti(veri.gorevler, hat)} />
        ))}
      </div>

      <Bolum baslik="Görevler">
        {gorevler.length === 0 ? <Bos metin="Görev yok." /> : gorevler.map((g) => <GorevKarti key={g.kod} gorev={g} />)}
      </Bolum>

      <Bolum baslik="Kararı alınmış, başlamamış">
        {veri.bekleyenler.length === 0 ? (
          <Bos metin="Kararı alınmış, başlamamış iş yok." />
        ) : (
          veri.bekleyenler.map((b) => (
            <Card key={b.kod} title={`${b.kod} · ${b.acilim}`}>
              <p className="gls-task-desc">{b.aciklama}</p>
              <ul className="gls-list">
                {b.kararlar.map((karar) => (
                  <li key={karar}>{karar}</li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </Bolum>

      <Bolum baslik="Beklemede">
        {beklemede.length === 0 ? <Bos metin="Beklemede iş yok." /> : beklemede.map((g) => <GorevKarti key={g.kod} gorev={g} />)}
      </Bolum>

      <Bolum baslik="Senden karar bekleyen">
        {veri.sorular.length === 0 ? (
          <Bos metin="Karar bekleyen soru yok." />
        ) : (
          veri.sorular.map((s) => (
            <Card key={s.baslik} title={s.baslik}>
              <p className="gls-task-desc">{s.aciklama}</p>
            </Card>
          ))
        )}
      </Bolum>
    </div>
  );
}

// Veri PROP olarak gelir (page.tsx gerçek VERI'yi geçer): görünüm testleri günlük değişen içeriğe bağlanmaz.
export function GelistirmeView({ veri }: { veri: GelistirmeVerisi }) {
  const { me, isLoading } = useSession();
  if (isLoading) return null;
  if (!canSeeGelistirme(me)) return <AccessDenied />;
  return <GelistirmeIcerik veri={veri} />;
}
