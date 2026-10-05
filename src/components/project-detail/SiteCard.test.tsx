import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteCard } from "./SiteCard";
import type { SiteListItem } from "@/lib/api/hooks/useSites";
import { SITE_CONTRACT_DEFAULTS } from "@/lib/api/hooks/site-fixtures";

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

const ACTIVE_SITE: SiteListItem = {
  ...SITE_CONTRACT_DEFAULTS,
  id: "22222222-2222-2222-2222-222222222222",
  code: "A-BLOK",
  name: "A-Blok Şantiyesi",
  status: "active",
  address: "Kuyubaşı Mah.",
  city: "Ankara",
  city_inherited: false,
  site_manager_name: "S. Öztürk",
  start_date: "2025-03-01",
  end_date: "2026-12-31",
  delivery_date: null,
  remaining_days: 157,
  section_count: 5,
  worker_count: { available: false, count: null, pending_module: "timesheet" },
  progress_pct: { available: false, value: null, pending_module: "progress_payments" },
};

const COMPLETED_SITE: SiteListItem = {
  ...SITE_CONTRACT_DEFAULTS,
  ...ACTIVE_SITE,
  id: "33333333-3333-3333-3333-333333333333",
  name: "B-Blok Şantiyesi",
  status: "completed",
  site_manager_name: "K. Arslan",
  end_date: null,
  delivery_date: "2026-05-01",
  remaining_days: null,
};

describe("SiteCard — aktif varyant (spec §4.3)", () => {
  it("ad, alt satir ve Aktif rozetini basar", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    expect(screen.getByRole("heading", { level: 3, name: "A-Blok Şantiyesi" })).toBeInTheDocument();
    expect(screen.getByText("Kuyubaşı Mah. · Şantiye Şefi: S. Öztürk")).toBeInTheDocument();
    expect(screen.getByText("Aktif")).toBeInTheDocument();
  });

  it("Kalan Gün gercek veriden pozitif basar", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    expect(screen.getByText("157")).toBeInTheDocument();
    expect(screen.getByText("Kalan Gün")).toBeInTheDocument();
  });

  it("4 cip basar: Is Kalemleri, Isveren Hak., Taseron Hak., Detay", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    expect(screen.getByRole("link", { name: /İş Kalemleri/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /İşveren Hak\./ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Taşeron Hak\./ })).toBeInTheDocument();
    const detay = screen.getByRole("link", { name: /Detay/ });
    expect(detay).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${ACTIVE_SITE.id}`,
    );
  });

  // 🔴 F-BLMPOZ — canli kusurun DAVRANISSAL bekcisi. Eski hedefler proje
  // seviyesindeydi (`/projeler/{id}/is-kalemleri`) ve diskte YOKTU; kullanici
  // 404 aliyordu. Rota VARLIGINI `site-card-chip-routes.contract.test.ts`
  // diskten olcer; burasi ciplerin SANTIYE kimligini tasidigini olcer.
  it("her cip SANTIYE kapsamli hedefe gider (site.id href'te YASAR)", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    const siteBase = `/projeler/${PROJECT_ID}/santiyeler/${ACTIVE_SITE.id}`;
    expect(screen.getByRole("link", { name: /İş Kalemleri/ })).toHaveAttribute(
      "href",
      `${siteBase}/is-kalemleri`,
    );
    expect(screen.getByRole("link", { name: /İşveren Hak\./ })).toHaveAttribute(
      "href",
      `${siteBase}/hakedisler`,
    );
    expect(screen.getByRole("link", { name: /Taşeron Hak\./ })).toHaveAttribute(
      "href",
      `${siteBase}/hakedisler`,
    );
    // Karsit kanit: eski (404 veren) proje seviyeli hedeflerden HICBIRI kalmadi.
    for (const chip of screen.getAllByRole("link")) {
      const href = chip.getAttribute("href") ?? "";
      expect(href.startsWith(siteBase)).toBe(true);
    }
  });

  // Bayat ipucu bekcisi: dort cip de artik gercek rotaya gidiyor, "yakinda"
  // yalani basilmaz.
  it("hicbir cip 'Bu bolum yakinda' ipucu tasimaz", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    for (const chip of screen.getAllByRole("link")) {
      expect(chip).not.toHaveAttribute("title");
    }
  });
});

describe("SiteCard — on_hold rozeti (kod inceleme bulgusu)", () => {
  it("Beklemede rozeti kendi sinifini tasir, aktif (yesil) sinifina dusmez", () => {
    const onHoldSite: SiteListItem = { ...ACTIVE_SITE, status: "on_hold" };
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={onHoldSite} />);
    const badge = screen.getByText("Beklemede");
    expect(badge.className).toContain("site-card__status--pending");
    expect(badge.className).not.toContain("site-card__status--active");
  });
});

describe("SiteCard — tamamlanmis varyant (spec §4.3)", () => {
  it("Tamamlandi rozetini basar", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={COMPLETED_SITE} />);
    expect(screen.getByText("Tamamlandı")).toBeInTheDocument();
  });

  it("ucuncu hucrede Teslim + tarihi basar, Kalan Gun basmaz", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={COMPLETED_SITE} />);
    expect(screen.getByText("Teslim")).toBeInTheDocument();
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.queryByText("Kalan Gün")).not.toBeInTheDocument();
  });

  it("3 cip basar (Taseron Hak. yok), Isveren Hak. yerine Final Hakedis gorunur", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={COMPLETED_SITE} />);
    expect(screen.getByRole("link", { name: /İş Kalemleri/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Final Hakediş/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Taşeron Hak\./ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /İşveren Hak\./ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Final Hakediş/ })).toHaveAttribute(
      "href",
      `/projeler/${PROJECT_ID}/santiyeler/${COMPLETED_SITE.id}/hakedisler`,
    );
  });
});

describe("SiteCard — yer tutucu hucreler (spec §7.1)", () => {
  it("Isci ve Ilerleme yer tutucuysa '—' basar ve title'da aciklama verir", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    const worker = screen.getByTitle("Puantaj verisi bu yüzeye henüz bağlanmadı");
    expect(worker).toHaveTextContent("—");
    const progress = screen.getByTitle("Hakediş verisi bu yüzeye henüz bağlanmadı");
    expect(progress).toHaveTextContent("—");
  });

  // 🔴 ÜÇÜNCÜ HÂL (K-ZARF, src/lib/placeholder-cell.ts:14-20).
  // `available:false` + `pending_module:null` = ROLÜN İZNİ YOK (backend
  // `restricted()`, app/modules/projects/schemas.py:131-146 — o fabrika
  // `MetricPlaceholder` döndürür ve `pending_module` TAŞIMAZ; şantiye
  // kartında bu hâle düşebilen alan `progress_pct`tir, `worker_count`un
  // `CountPlaceholder` sözleşmesinde `pending_module` zorunludur).
  // O hâlde `pendingModuleLabel(null)`ın döndürdüğü "İlgili modülle birlikte
  // gelir" cümlesi YALANDIR — modül vardır, izin yoktur. Aynı ekranın alt
  // şeridi (SiteTotalsStrip) bunu doğru yapıyor; kart da title basmamalı.
  it("UCUNCU HAL: Ilerleme available:false + pending_module null → '—' + gizli ipucu (modül gerekçesi YOK)", () => {
    const restricted: SiteListItem = {
      ...ACTIVE_SITE,
      progress_pct: { available: false, value: null, pending_module: null },
    };
    const { container } = render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={restricted} />);

    const progress = container.querySelector(".site-card__kpi-value--progress");
    expect(progress).not.toBeNull();
    expect(progress).toHaveTextContent("—");
    expect(progress?.className).toContain("site-card__kpi-value--pending");
    expect(progress).toHaveAttribute("title", "Bu bilgi rolünüz için gizli");

    // KARŞIT KANIT: 2. hâl (gerekçe BİLİNİYOR) ipucunu vermeye DEVAM eder.
    expect(screen.getByTitle("Puantaj verisi bu yüzeye henüz bağlanmadı")).toHaveTextContent("—");

    // Yalan cumle EKRANDA HICBIR YERDE olmamali.
    expect(screen.queryByTitle("İlgili modülle birlikte gelir")).not.toBeInTheDocument();
  });

  it("Ilerleme yer tutucuyken cubuk cizilmez (sahte %0 verilmez)", () => {
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    expect(screen.queryByTestId("site-card-progress-fill")).not.toBeInTheDocument();
  });

  it("Ilerleme gercek veriyse cubuk cizilir", () => {
    const withProgress: SiteListItem = {
      ...ACTIVE_SITE,
      progress_pct: { available: true, value: "75", pending_module: "" },
    };
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={withProgress} />);
    expect(screen.getByTestId("site-card-progress-fill")).toBeInTheDocument();
    expect(screen.getByText("%75")).toBeInTheDocument();
  });
});

describe("SiteCard — gecikmis teslim (spec §7.5)", () => {
  it("remaining_days negatifse kirmizi 'X gun gecikme' basar", () => {
    const delayed: SiteListItem = { ...ACTIVE_SITE, remaining_days: -12 };
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={delayed} />);
    const value = screen.getByText("12 gün gecikme");
    expect(value.className).toContain("site-card__kpi-value--delay");
  });
});

// Davranissal klavye odak testi (kod inceleme bulgusu duzeltmesi — Task 12 takibi):
// css.test.ts yalniz CSS metnini dogrular; gercek odaklanabilirlik/Tab sirasi
// jsdom + Testing Library ile burada dogrulanir.
describe("SiteCard — kart cipleri klavyeyle odaklanabilir ve Tab sirasindadir (davranissal)", () => {
  it("4 cip de sirayla Tab ile odaklanir", async () => {
    const user = userEvent.setup();
    render(<SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />);
    const chips = screen.getAllByRole("link");
    expect(chips).toHaveLength(4);

    for (const chip of chips) {
      await user.tab();
      expect(chip).toHaveFocus();
    }
  });
});

// Kayıt 198 — kaynak düzeyi bekçi: `is-kalemleri`/`hakedisler` son ekleri
// ELLE yazılmaz, `routes.ts`teki kanonik kurucular (`boq`/`progressPayments`)
// kullanılır. Davranışsal testler href'in DOĞRU olduğunu ölçer ama href'i
// elle kurup aynı dizeyi üretmek de o testleri geçer — bu eşdeğer mutant
// yalnız kaynak metninde yakalanabilir.
describe("SiteCard — çip hedefleri kanonik kurucudan gelir (kaynak düzeyi)", () => {
  it("`is-kalemleri`/`hakedisler` segmentleri chipsFor içinde ELLE kurulmaz", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(
      path.resolve(process.cwd(), "src/components/project-detail/SiteCard.tsx"),
      "utf8",
    );
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(code).not.toMatch(/\$\{siteBase\}\/is-kalemleri/);
    expect(code).not.toMatch(/\$\{siteBase\}\/hakedisler/);
    expect(source).toMatch(/routes\.projects\.sites\.boq\(/);
    expect(source).toMatch(/routes\.projects\.sites\.progressPayments\(/);
  });
});

// Kayıt 201 — şerit/ilerleme çubuğu proje TÜRÜNE göre boyanır. Önceden
// `projectType` prop olarak TAŞINMIYORDU, ayrım yapısal olarak imkânsızdı.
describe("SiteCard — kart şeridi proje türüne göre sınıf taşır (kayıt 201)", () => {
  it("taahhütte site-card--taahhut sınıfı basılır", () => {
    const { container } = render(
      <SiteCard projectKey={PROJECT_ID} projectType="taahhut" site={ACTIVE_SITE} />,
    );
    expect(container.querySelector(".site-card")).toHaveClass("site-card--taahhut");
  });

  it("kendi yatırımda site-card--kendi_yatirim sınıfı basılır", () => {
    const { container } = render(
      <SiteCard projectKey={PROJECT_ID} projectType="kendi_yatirim" site={ACTIVE_SITE} />,
    );
    expect(container.querySelector(".site-card")).toHaveClass("site-card--kendi_yatirim");
  });

  it("kat karşılığında site-card--kat_karsiligi sınıfı basılır", () => {
    const { container } = render(
      <SiteCard projectKey={PROJECT_ID} projectType="kat_karsiligi" site={ACTIVE_SITE} />,
    );
    expect(container.querySelector(".site-card")).toHaveClass("site-card--kat_karsiligi");
  });
});
