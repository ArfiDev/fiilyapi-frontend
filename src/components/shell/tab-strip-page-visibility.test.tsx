import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useSession } from "@/components/shell/SessionProvider";
import { meFixture, pageGrant } from "@/lib/auth/page-grants.testkit";
import { ProjectDetailTabs } from "../project-detail/ProjectDetailTabs";
import { SectionDetailTabs } from "../section-detail/SectionDetailTabs";
import { SiteDetailTabs } from "../site-detail/SiteDetailTabs";

vi.mock("@/components/shell/SessionProvider", () => ({ useSession: vi.fn() }));

/**
 * IZN-F3.2 · proje içi sekme şeritlerinin görünürlüğü PROJE ROLÜNÜN sayfa izninden gelir:
 * grant "none" → sekme gizli; grant yok → görünür (IZN-F1 menü kuralı); ana rol kararı YALNIZ
 * kişi o projenin ekibinde değilse (ya da all_projects) geçerlidir.
 */
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_PROJECT_ID = "99999999-9999-9999-9999-999999999999";
const SITE_ID = "44444444-4444-4444-4444-444444444444";

function session(options: Parameters<typeof meFixture>[0]) {
  vi.mocked(useSession).mockReturnValue({ me: meFixture(options), isLoading: false } as ReturnType<typeof useSession>);
}

/** Ana rol HER ŞEYİ görür; proje rolü hakediş + belge sekmelerini kapatır. */
const MEMBER = {
  pages: { "proje.isveren_hakedis": pageGrant("edit"), "proje.belgeler": pageGrant("edit") },
  projects: [{ project_id: PROJECT_ID, role_key: "site_chief" }],
  rolePages: {
    site_chief: {
      "proje.isveren_hakedis": pageGrant("none"),
      "proje.belgeler": pageGrant("none"),
      "santiye.hakedisler": pageGrant("none"),
      "santiye.belgeler": pageGrant("view"),
      "bolum.hakedis": pageGrant("none"),
    },
  },
} as const;

describe("proje içi sekme şeritleri · sayfa izni görünürlüğü", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ProjectDetailTabs: proje rolünde 'none' olan sekme gizlenir, grant'ı olmayan görünür", () => {
    session(MEMBER);
    render(<ProjectDetailTabs projectKey={PROJECT_ID} projectId={PROJECT_ID} activePath="/x" projectType="taahhut" />);
    expect(screen.queryByRole("link", { name: "İşveren Hakediş" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Belgeler" })).not.toBeInTheDocument();
    // Grant'ı hiç olmayan sekmeler görünür kalır.
    expect(screen.getByRole("link", { name: "Şantiyeler" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Taşeron Hakediş" })).toBeInTheDocument();
  });

  it("ProjectDetailTabs: kişi başka projenin ekibindeyse ANA ROL geçerli (sekmeler açık)", () => {
    session(MEMBER);
    render(
      <ProjectDetailTabs projectKey={OTHER_PROJECT_ID} projectId={OTHER_PROJECT_ID} activePath="/x" projectType="taahhut" />,
    );
    expect(screen.getByRole("link", { name: "İşveren Hakediş" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Belgeler" })).toBeInTheDocument();
  });

  it("ProjectDetailTabs: all_projects iken proje satırı yok sayılır (ana rol)", () => {
    session({ ...MEMBER, allProjects: true });
    render(<ProjectDetailTabs projectKey={PROJECT_ID} projectId={PROJECT_ID} activePath="/x" projectType="taahhut" />);
    expect(screen.getByRole("link", { name: "İşveren Hakediş" })).toBeInTheDocument();
  });

  it("ProjectDetailTabs: oturum yokken (yükleniyor) tüm sekmeler görünür", () => {
    vi.mocked(useSession).mockReturnValue({ me: null, isLoading: true } as ReturnType<typeof useSession>);
    render(<ProjectDetailTabs projectKey={PROJECT_ID} projectId={PROJECT_ID} activePath="/x" projectType="taahhut" />);
    expect(screen.getByRole("link", { name: "Belgeler" })).toBeInTheDocument();
  });

  it("SiteDetailTabs: şantiye sekmeleri aynı kuralla süzülür; 'view' görünür", () => {
    session(MEMBER);
    render(<SiteDetailTabs projectKey={PROJECT_ID} siteKey={SITE_ID} activePath="/x" />);
    expect(screen.queryByRole("tab", { name: "Hakedişler" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Belgeler" })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
  });

  it("SiteDetailTabs: adres anahtarı SLUG ise kimlik önbellekteki şantiye yanıtından çözülür (yeni istek YOK)", () => {
    session(MEMBER);
    const client = new QueryClient();
    client.setQueryData(["site", "ana-santiye", "kule-a"], { id: SITE_ID, project: { id: PROJECT_ID } });
    render(
      <QueryClientProvider client={client}>
        <SiteDetailTabs projectKey="kule-a" siteKey="ana-santiye" activePath="/x" />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("tab", { name: "Hakedişler" })).not.toBeInTheDocument();
  });

  it("SiteDetailTabs: slug çözülemezse ANA ROL (sekmeler açık, güvenli düşüş)", () => {
    session(MEMBER);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SiteDetailTabs projectKey="kule-a" siteKey="ana-santiye" activePath="/x" />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("tab", { name: "Hakedişler" })).toBeInTheDocument();
  });

  it("SectionDetailTabs: gizli sekme düşer ama KALAN sekmelerin sırası (index) korunur", () => {
    session(MEMBER);
    const onSelect = vi.fn();
    render(<SectionDetailTabs projectKey={PROJECT_ID} siteKey={SITE_ID} activeIndex={0} onSelect={onSelect} />);
    expect(screen.queryByRole("tab", { name: "Hakediş" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "İş Kalemleri",
      "İşçiler & Puantaj",
      "Malzeme",
      "Günlük Kayıt",
    ]);
    // "Günlük Kayıt" özgün sırası 4 — tıklanınca özgün index gider.
    screen.getByRole("tab", { name: "Günlük Kayıt" }).click();
    expect(onSelect).toHaveBeenCalledWith(4);
  });
});
