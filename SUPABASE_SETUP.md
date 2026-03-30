# Supabase Setup für Overlay-Synchronisierung

Damit Overlays (Icons + Anfahrt-Linien) für alle Nutzer live synchronisiert werden, wird ein externes Backend benötigt.

## 1) Tabelle anlegen

In Supabase SQL Editor ausführen:

```sql
create table if not exists public.standort_overlays (
  standort_nummer text primary key,
  features jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
```

## 2) Realtime aktivieren

- In Supabase: `Database -> Replication`
- Tabelle `standort_overlays` für Realtime freischalten

## 3) RLS (Row Level Security)

Für offene Team-Bearbeitung (ohne Login) im internen Umfeld:

```sql
alter table public.standort_overlays enable row level security;

create policy "public read overlays"
on public.standort_overlays
for select
using (true);

create policy "public write overlays"
on public.standort_overlays
for insert
with check (true);

create policy "public update overlays"
on public.standort_overlays
for update
using (true)
with check (true);
```

Hinweis: Für produktive öffentliche Seiten besser Auth/rollenbasierte Policies verwenden.

## 4) Frontend konfigurieren

In `js/app.js`:

```js
window.__SUPABASE_CONFIG__ = {
  url: 'https://<project-ref>.supabase.co',
  anonKey: '<public-anon-key>',
  table: 'standort_overlays'
};
```

## 5) Ergebnis

- Ohne Supabase: lokale Synchronisierung über Browser-Speicher
- Mit Supabase: zentrale Speicherung + Realtime-Updates für alle Nutzer
