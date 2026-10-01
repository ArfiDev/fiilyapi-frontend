import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Sidebar from "@/components/shell/Sidebar";
import { NAV_GROUPS } from "@/components/shell/nav-config";

let currentPath = "/";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => currentPath,
}));
let role = "patron";
vi.mock("@/components/shell/SessionProvider", () => ({
  useSession: () => ({ me: { full_name: "A B", role_key: role, title: "T" }, isLoading: false }),
}));

afterEach(() => {
  currentPath = "/";
  role = "patron";
});

describe("Sidebar · Geliştirme öğesi", () => {
  it("patron: oge YOK ve nav'in ilk cocugu hala ilk nav grubudur (DOM'a bir sey eklenmez)", () => {
    const { container } = render(<Sidebar />);
    expect(screen.queryByRole("link", { name: /Geliştirme/ })).not.toBeInTheDocument();
    const nav = container.querySelector(".sidebar-nav");
    expect(nav?.children).toHaveLength(NAV_GROUPS.length);
    expect(nav?.firstElementChild?.textContent).toContain(NAV_GROUPS[0]?.heading);
  });

  it("system_admin: oge EN USTTE, gruplarin onunde", () => {
    role = "system_admin";
    const { container } = render(<Sidebar />);
    const nav = container.querySelector(".sidebar-nav");
    expect(nav?.children).toHaveLength(NAV_GROUPS.length + 1);
    const first = nav?.firstElementChild as HTMLElement;
    expect(first.textContent).toBe("Geliştirme");
    expect(first.querySelector("a")).toHaveAttribute("href", "/gelistirme");
  });

  it("system_admin /gelistirme'de: oge aria-current=page ve TEK aria-current vardir", () => {
    role = "system_admin";
    currentPath = "/gelistirme";
    const { container } = render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Geliştirme/ })).toHaveAttribute("aria-current", "page");
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("system_admin baska rotada: Gelistirme aktif degildir", () => {
    role = "system_admin";
    currentPath = "/projeler";
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: /Geliştirme/ })).not.toHaveAttribute("aria-current");
  });
});
