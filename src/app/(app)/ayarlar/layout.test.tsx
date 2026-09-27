import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import AyarlarLayout from "./layout";

/**
 * SEKME-F1.7a · K12 — `SettingsBreadcrumb` KALKTI: Ayarlar artık kendi
 * içerik-içi kırıntısını basmaz (kırıntı `TopbarBreadcrumb`e taşındı, bkz.
 * `TopbarBreadcrumb.test.tsx`teki "/ayarlar altında" bloğu) ve global
 * topbar'ı ÖRTEN `position:fixed` bir şerit GERİ GELMEZ.
 */
vi.mock("@/components/settings/shell/SettingsSidebar", () => ({
  SettingsSidebar: () => <div data-testid="fake-settings-sidebar" />,
}));

describe("AyarlarLayout — SettingsBreadcrumb kalktı (K12)", () => {
  it("`.ayarlar-content` içinde İKİNCİ bir kırıntı/gezinme satırı YOK", () => {
    // Mutasyon (M4): içeriğe `<nav aria-label="Yol göstergesi" />` geri koy
    // → bu iddia kırmızı olur.
    render(
      <AyarlarLayout>
        <div data-testid="fake-page-content">içerik</div>
      </AyarlarLayout>,
    );
    const content = screen.getByTestId("fake-page-content").closest(".ayarlar-content");
    expect(content).not.toBeNull();
    expect(content?.querySelector('nav[aria-label="Yol göstergesi"]')).toBeNull();
    expect(content?.querySelector(".settings-breadcrumb")).toBeNull();
  });
});
