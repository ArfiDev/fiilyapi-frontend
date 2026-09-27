import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectCard } from "./ProjectCard";
import { EMPTY_CELL } from "@/lib/format";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

type Project = DeepScale<components["schemas"]["DashboardProjectCard"]>;

/**
 * KAPSAM MASKESİ — gösterge panelinin proje kartı.
 *
 * 🔴 ÖLÇÜLMÜŞ KUSUR (2026-09-20). `accounting` rolü tohumda
 * `dashboard = view/finance` taşır; maske OPERASYONEL kovayı düşürür ve
 * `DashboardProjectCard.progress_pct` HER kartta `null` döner (backend'de
 * uçtan uca ölçüldü: `tests/modules/test_kapsam_maskesi_uctan_uca_dashboard.py`).
 *
 * Kartın METNİ dürüsttü (`formatPercent(null)` → "— tamamlandı") ama bir satır
 * yukarıdaki ÇUBUK biçimlendiriciyi ATLAYIP ham aritmetik yapıyordu:
 *
 *     style={{ width: `${Math.min(Number(project.progress_pct), 100)}%` }}
 *
 * `Number(null)` **0**'dır. Yani muhasebe rolünde her proje "hiç ilerlememiş"
 * gibi çizilmiş bir çubuk görüyordu — `Number(null) === 0` kalıntısının bu
 * depoda ölçülmüş dördüncü hâli ("✓ 0 dağıtıldı" · "₺ 0" · "- —" kardeşleri).
 *
 * 🔴 KANON HAZIR VE BAŞKA YERDE YAZILI: `SiteHeroBar` aynı soruyu
 * *"Yer tutucuyken mini çubuk çizilmez, sahte %0 izlenimi verilmez (spec §7.1)"*
 * diye yanıtlar. Bu kart o kanonun dışında kalmıştı; burada ona çekilir.
 *
 * 🔴 SIFIR MASKELENMİŞ DEĞİLDİR: gerçek `"0.00"` ilerleme DOĞRU bir cevaptır ve
 * çubuk o hâlde ÇİZİLMEYE devam eder (boş ama var). İkinci test tam olarak bunu
 * bekçiler — yoksa "çubuğu hiç çizme" gibi aşırı bir onarım da yeşil kalırdı.
 */

function project(progressPct: string | null): Project {
  return {
    id: "p-dash-1",
    code: "DASH-1",
    name: "Bahçelievler Konutları",
    status: "active",
    budget: "12500000.00",
    progress_pct: progressPct,
  } as Project;
}

function bar(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".dash-project__fill");
}

describe("gösterge paneli proje kartı · maskelenmiş ilerleme", () => {
  it("maskeli `progress_pct` için ÇUBUK ÇİZİLMEZ (sahte %0 yok)", () => {
    const { container } = render(<ProjectCard project={project(null)} />);

    expect(bar(container)).toBeNull();
  });

  it("maskeli `progress_pct` metni yine dürüst kalır", () => {
    render(<ProjectCard project={project(null)} />);

    expect(screen.getByText(`${EMPTY_CELL} tamamlandı`)).toBeInTheDocument();
  });

  it("🔴 POZİTİF KONTROL — GERÇEK %0 hâlâ çizilir (sıfır maskelenmiş değildir)", () => {
    const { container } = render(<ProjectCard project={project("0.00")} />);

    const fill = bar(container);
    expect(fill).not.toBeNull();
    expect(fill!.style.width).toBe("0%");
  });

  it("🔴 POZİTİF KONTROL — gerçek ilerleme yüzdesi çubuğa geçer", () => {
    const { container } = render(<ProjectCard project={project("37.50")} />);

    expect(bar(container)!.style.width).toBe("37.5%");
  });
});
