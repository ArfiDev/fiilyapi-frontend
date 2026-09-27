import type { components } from "@/lib/api/schema";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { maskeli } from "@/lib/masked";

import "./dashboard.css";
import type { DeepScale, WithPlainProgressPct } from "@/lib/api/scale";

type Project = WithPlainProgressPct<DeepScale<components["schemas"]["DashboardProjectCard"]>>;

// Mockup Ekran 1'de yalnizca Aktif/Beklemede var; Tamamlandi rozeti
// "Ekran 4 - Projeler.dc.html" satir 273'ten alindi (spec §3.4).
const STATUS_LABELS: Record<Project["status"], string> = {
  planning: "Planlama",
  active: "Aktif",
  on_hold: "Beklemede",
  completed: "Tamamlandı",
};

export function ProjectCard({ project }: { project: Project }) {
  return (
    <article className={`dash-project dash-project--${project.status}`}>
      <p className="dash-project__status">
        <span className="dash-project__dot" aria-hidden="true" />
        {STATUS_LABELS[project.status]}
      </p>
      <h3 className="dash-project__name">{project.name}</h3>
      <p className="dash-project__value">{formatCompactCurrency(project.budget)}</p>
      <p className="dash-project__value-label">Bütçe</p>
      {/* 🔴 MASKELİ İLERLEME ÇUBUK ÇİZDİRMEZ (ölçülmüş kusur, 2026-09-20).
          `dashboard = view/finance` olan rolde (muhasebe) maske OPERASYONEL
          kovayı düşürür ve `progress_pct` `null` gelir. Burada eskiden
          `Math.min(Number(project.progress_pct), 100)` vardı: `Number(null)`
          **0**'dır, yani biçimlendirici "—" yazarken çubuk "hiç ilerlememiş"
          diye çiziliyordu — ekranın iki yarısı aynı olgu için farklı şey
          söylüyordu.

          Çubuk BOŞ çizilseydi de yetmezdi: boş çubuk GERÇEK %0'dan ayırt
          edilemez. Kanon `SiteHeroBar`da yazılı — *"yer tutucuyken mini çubuk
          ÇİZİLMEZ, sahte %0 izlenimi verilmez"* (spec §7.1) — ve burada ona
          uyulur. Bekçisi: `ProjectCard.masked.test.tsx`. */}
      {!maskeli(project.progress_pct) && (
        <div className="dash-bar dash-bar--project">
          <div
            className="dash-bar__fill dash-project__fill"
            style={{ width: `${Math.min(Number(project.progress_pct), 100)}%` }}
          />
        </div>
      )}
      <p className="dash-project__progress">
        {formatPercent(project.progress_pct)} tamamlandı
      </p>
    </article>
  );
}
