"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button, Input } from "@/components/ui";
import { SettingsCard } from "@/components/settings/primitives/SettingsCard";
import { UserAvatar } from "@/components/settings/primitives/UserAvatar";
import { RolePill } from "@/components/settings/primitives/RolePill";
import { StatusBadge } from "@/components/settings/StatusBadge";
import { useUsers, PAGE_SIZE } from "@/lib/api/hooks/useUsers";
import { useRoles } from "@/lib/api/hooks/useRoles";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { UserAccessModal } from "./UserAccessModal";
import { USERS_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { isForbidden } from "@/lib/api/unwrap";
import { cx } from "@/lib/cx";
import type { RoleResponse, UserResponse } from "@/lib/api/models";
import "@/components/settings/settings.css";
import "./users-screen.css";
import { routes } from "@/lib/routes";

// Ayarlar ana ekranı sekme şeridi — yalnız bu ekranda (mockup Ayarlar.dc.html §70-75);
// diğer Ayarlar alt sayfaları (Rol Yönetimi, Sayfa İzinleri, Şirket...) kendi sub-header'ına
// sahip, bu şeridi tekrar etmiyor.
const SETTINGS_TABS = [
  { href: routes.settings.users(), label: "Kullanıcılar" },
  { href: routes.settings.roles(), label: "Rol Yönetimi" },
  { href: routes.settings.permissionMatrix(), label: "Sayfa İzinleri" },
  { href: routes.settings.company(), label: "Şirket" },
] as const;

/** Arama kutusuna yazma ile sunucu isteği arasındaki bekleme (ms). */
const SEARCH_DEBOUNCE_MS = 300;

type ModalState = { type: "create" } | { type: "edit"; user: UserResponse } | null;

function role(roles: RoleResponse[] | undefined, roleId: string): RoleResponse | undefined {
  return roles?.find((r) => r.id === roleId);
}

function pageFromParams(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/** "Projeler" sütunu: tüm projeler → mavi rozet, değilse "N proje" (mockup Durum 1). */
function ProjectCountCell({ user }: { user: UserResponse }) {
  if (user.all_projects) return <span className="users-badge-all">Tüm projeler</span>;
  return <span className="users-cell-access">{user.project_count} proje</span>;
}

export function UsersScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const page = pageFromParams(searchParams.get("sayfa"));
  const offset = (page - 1) * PAGE_SIZE;

  // IZN-B3 · Arama SUNUCUDA (`GET /users?q=`): ad, e-posta ve ana rol adı; yazma `useDebouncedValue` ile sakinleşir.
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS);
  const usersQuery = useUsers({ limit: PAGE_SIZE, offset, q: debouncedSearch });
  const rolesQuery = useRoles();
  // IZN-F2.x · ekle/düzenle (rol, proje ekibi, disiplin dahil) = ayarlar.kullanicilar Düzenler; grant yoksa görünür.
  const canEditUsers = useButtonGate({ pages: USERS_EDIT, need: "edit", fallback: true });

  const [modal, setModal] = useState<ModalState>(null);

  const total = usersQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function goToPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("sayfa", String(next));
    router.push(`${pathname}?${params.toString()}`);
  }
  function handleSearchChange(value: string) {
    setSearchInput(value);
    // Yeni arama her zaman ilk sayfadan başlar (eski sayfa ofseti sonuçları atlatır).
    if (page !== 1) goToPage(1);
  }

  useEffect(() => {
    if (usersQuery.data && page > pageCount) goToPage(pageCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageCount, usersQuery.data]);

  if (usersQuery.isLoading) return <p className="settings-note">Yükleniyor…</p>;
  if (isForbidden(usersQuery.error)) return <AccessDenied />;
  if (usersQuery.isError || !usersQuery.data)
    return <p className="settings-note settings-note--error">Kullanıcılar yüklenemedi.</p>;
  if (page > pageCount) return null;

  const items = usersQuery.data.items;

  return (
    <>
      <nav className="settings-tabs" aria-label="Ayarlar sekmeleri">
        {SETTINGS_TABS.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cx("settings-tabs__item", isActive && "settings-tabs__item--active")}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Mockup (TASLAK) üst bilgi kutusu — modeli bir bakışta anlatır. */}
      <div className="users-info">
        <p>
          <b>Kişi yalnız ekibinde olduğu projeleri görür.</b>
        </p>
        <p>
          Rol <b>proje başınadır</b>: proje içi sayfalar o projedeki rolle, şirket geneli sayfalar (Muhasebe, İK,
          Ayarlar vb.) <b>ana rolle</b> açılır.
        </p>
        <p>
          Disiplin isteğe bağlıdır ve proje başınadır. Kullanıcı silme yalnız <b>Sistem Yöneticisi</b>&apos;ndedir.
        </p>
      </div>

      <SettingsCard
        title="Kullanıcı Listesi"
        count={`${total} kullanıcı`}
        bodyPad="flush"
        actions={
          <>
            <span className="users-search">
              <span aria-hidden="true">🔍</span>
              <Input
                type="search"
                placeholder="Ad, e-posta veya rol ara..."
                aria-label="Kullanıcı ara"
                value={searchInput}
                onChange={(event) => handleSearchChange(event.target.value)}
              />
            </span>
            {canEditUsers && (
              <Button variant="primary" size="sm" onClick={() => setModal({ type: "create" })}>
                + Kullanıcı Ekle
              </Button>
            )}
          </>
        }
      >
        <table className="users-table">
          <thead>
            <tr>
              <th>Ad Soyad</th>
              <th>E-posta</th>
              <th className="users-table__center">Ana rol</th>
              <th>Projeler</th>
              <th className="users-table__center">Durum</th>
              <th aria-label="İşlemler" />
            </tr>
          </thead>
          <tbody>
            {items.map((user) => {
              const r = role(rolesQuery.data, user.role_id);
              return (
                <tr key={user.id}>
                  <td>
                    <div className="users-cell-user">
                      <UserAvatar roleKey={r?.key ?? ""} name={user.full_name} />
                      <div>
                        <div className="users-cell-user__name">{user.full_name}</div>
                        <div className="users-cell-user__sub">{user.title}</div>
                      </div>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td className="users-table__center">{r ? <RolePill roleKey={r.key} name={r.name} /> : "—"}</td>
                  <td>
                    <ProjectCountCell user={user} />
                  </td>
                  <td className="users-table__center">
                    <StatusBadge status={user.status} />
                  </td>
                  <td className="users-table__center">
                    {canEditUsers && (
                      <button className="users-edit" onClick={() => setModal({ type: "edit", user })}>
                        Düzenle
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 && <p className="settings-note users-empty">Aramanıza uyan kullanıcı yok.</p>}
      </SettingsCard>

      {pageCount > 1 && (
        <div className="users-pager">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
            Önceki
          </Button>
          <span className="users-pager__label">
            Sayfa {page} / {pageCount}
          </span>
          <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => goToPage(page + 1)}>
            Sonraki
          </Button>
        </div>
      )}

      {modal?.type === "create" && <UserAccessModal onClose={() => setModal(null)} />}
      {modal?.type === "edit" && <UserAccessModal user={modal.user} onClose={() => setModal(null)} />}
    </>
  );
}
