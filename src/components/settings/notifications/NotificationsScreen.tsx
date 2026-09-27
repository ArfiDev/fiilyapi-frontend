"use client";

import { useEffect, useState } from "react";
import { Button, Checkbox } from "@/components/ui";
import { SettingsCard } from "@/components/settings/primitives/SettingsCard";
import { useNotificationPrefs, useUpdateNotificationPrefs } from "@/lib/api/hooks/useNotificationPrefs";
import { groupNotifications, NOTIF_EVENT_DISPLAY } from "./notification-groups";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { isForbidden } from "@/lib/api/unwrap";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { NotificationPrefItem } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";
import "./notifications-screen.css";

type Channel = "email" | "in_app" | "sms";

const CHANNEL_LABEL: Record<Channel, string> = { email: "E-posta", in_app: "Uygulama", sms: "SMS" };
const CHANNELS: Channel[] = ["email", "in_app", "sms"];

export function NotificationsScreen() {
  const query = useNotificationPrefs();
  const update = useUpdateNotificationPrefs();
  const [items, setItems] = useState<NotificationPrefItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  // SEKME-F1.3b · dirty (tercih 2), taban `items`i dolduran AYNI efektte
  // alınır. 🔴 ASYNC TABAN: `baseline` `null` iken dirty FALSE. Kayıt
  // başarısında `useUpdateNotificationPrefs` `NOTIF_QUERY_KEY`i geçersiz
  // kılıyor — `query.data` yenilenince efekt `baseline`ı da hizalar
  // (dolaylı sıfırlama).
  const [baseline, setBaseline] = useState<NotificationPrefItem[] | null>(null);
  const isDirty = baseline !== null && JSON.stringify(items) !== JSON.stringify(baseline);
  useUnsavedChanges(isDirty, "Bildirim ayarları");

  useEffect(() => {
    if (query.data) {
      setItems(query.data);
      setBaseline(query.data);
    }
  }, [query.data]);

  if (query.isLoading) return <p className="settings-note">Yükleniyor…</p>;
  if (isForbidden(query.error)) return <AccessDenied />;
  if (query.isError) return <p className="settings-note settings-note--error">Bildirim ayarları yüklenemedi.</p>;

  const toggle = (key: string, ch: Channel) =>
    setItems((prev) => prev.map((it) => (it.event_key === key ? { ...it, [ch]: !it[ch] } : it)));

  const save = () =>
    update.mutate(
      { items: items.map(({ event_key, email, in_app, sms }) => ({ event_key, email, in_app, sms })) },
      { onError: (e) => setErr(backendErrorMessage(e)) },
    );

  const grouped = groupNotifications(items);

  return (
    <>
      <div className="notif-stack">
        {grouped.map((g) => (
          <SettingsCard key={g.heading} bodyPad="flush">
            <div className="notif-card__head">
              <span aria-hidden="true">{g.emoji}</span> {g.heading}
            </div>
            <div className="notif-card__rows">
              {g.items.map((it) => {
                const display = NOTIF_EVENT_DISPLAY[it.event_key];
                const name = display?.name ?? it.label;
                const desc = display?.desc ?? "";
                return (
                  <div key={it.event_key} className="notif-row">
                    <div>
                      <div className="notif-row__name">{name}</div>
                      {desc && <div className="notif-row__desc">{desc}</div>}
                    </div>
                    <div className="notif-row__channels">
                      {CHANNELS.map((ch) => (
                        <label key={ch} className="notif-channel">
                          <Checkbox checked={it[ch]} onChange={() => toggle(it.event_key, ch)} /> {CHANNEL_LABEL[ch]}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </SettingsCard>
        ))}
      </div>
      {err && <p className="settings-note settings-note--error">{err}</p>}
      <div className="notif-actions">
        <Button variant="primary" onClick={save} disabled={update.isPending}>
          Kaydet
        </Button>
      </div>
    </>
  );
}
