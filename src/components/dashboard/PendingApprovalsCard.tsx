import Link from "next/link";

import type { components } from "@/lib/api/schema";

import { CardEmptyState } from "./CardEmptyState";
import "./dashboard.css";
import { routes } from "@/lib/routes";
import type { DeepScale } from "@/lib/api/scale";

type Placeholder = DeepScale<components["schemas"]["PendingApprovalsPlaceholder"]>;

export function PendingApprovalsCard({ data }: { data: Placeholder }) {
  // items semada opsiyonel (backend bos listede alani atlayabilir).
  const items = data.items ?? [];

  // 🔴 `data.available`e DALLANILMAZ. Rozet count'a, govde ise `available`a
  // bagliydi; backend gercek count'u DOLU, `items`i BILEREK BOS dondurdugu
  // icin kart ayni anda hem "3" hem "Onay bekleyen kayit yok" basiyordu.
  // Ustelik `available: false` + count>0 gelirse ayni yalan geri gelir.
  // Tek olcut: `data.count` ve `items.length`.
  let body;
  if (items.length > 0) {
    // Mockup satir 309-331: dolu liste (309 sutun sarmalayici gap:10px,
    // 310-316 satir kutusu).
    body = (
      <ul className="dash-list">
        {items.map((item) => (
          <li key={item} className="dash-list__row">
            {item}
          </li>
        ))}
      </ul>
    );
  } else if (data.count > 0) {
    // Sayac var ama satirlar gelmiyor: kullaniciyi kaydin durdugu yere
    // (`/onay-kutusu`) gonderen tek satir. Kutu mockup satir 310'un AYNI
    // kutusudur (`.dash-list__row`); baslik 312 (13/500), alt satir 313
    // (11px, #94a3b8, margin-top:2px).
    // 🔴 Metin UYDURULMADI, kanondan olculdu: "Onay Kutusu" =
    // `shell/nav-config.ts:35` + `approvals/ApprovalsView.tsx:31`
    // (`PAGE_TITLE`) + `projedesign/Onay Kutusu.dc.html:28`;
    // "{count} bekleyen" = `projedesign/Onay Kutusu.dc.html:32`.
    // Mockup bu HALI cizmiyor (yalniz dolu listeyi cizer) — WORKFLOW.md §3
    // "backend'in vermedigi alan -> zarif dusus + kullaniciya bildirim".
    body = (
      <div className="dash-list">
        <Link className="dash-list__row dash-list__row--link" href={routes.approvalInbox()}>
          <span className="dash-list__row-title">Onay Kutusu</span>
          <span className="dash-list__row-meta">{data.count} bekleyen</span>
        </Link>
      </div>
    );
  } else {
    // count == 0: gercekten bos. `pending_module` gerekcesi BASILMAZ — modul
    // canli (`/onay-kutusu`), gerekce bayat olurdu.
    body = <CardEmptyState title="Onay bekleyen kayıt yok" />;
  }

  return (
    <section className="dash-card dash-list-card">
      <h2 className="dash-list-card__title">
        Onay Bekleyenler
        {data.count > 0 && (
          <span className="dash-list-card__badge" data-testid="dash-approvals-badge">
            {data.count}
          </span>
        )}
      </h2>
      {body}
    </section>
  );
}
