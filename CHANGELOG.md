# Changelog

Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

---

## v0.30 - 2026-04-10

### Neu
- **Benutzername-System**: Beim ersten Besuch wird nach einem Spitzname gefragt, der für Zuordnungen gespeichert wird (änderbar über Einstellungen → „Name ändern")
- **Admin-Benutzername**: Nach der Admin-Anmeldung wird ebenfalls nach einem Namen gefragt, der bei Bearbeitungen angezeigt wird
- **Stationskennblatt-Button**: Neuer Button im Dashboard neben „Tagebuch", öffnet das Stationskennblatt (Link wird automatisch aus dem Tagebuch-Link abgeleitet)
- **Neue Stationsfelder**: Standortkürzel, Betreiber (SWR / SMS / DFMG / BR / SR / ORF / Swisscom / Sonstige), DFMG-ID (nur sichtbar wenn Betreiber = DFMG), PV Standortpate, PV Vertretung, IFS Standortpate
- **Richtfunkverbindungen**: Stationen können bidirektional miteinander verknüpft werden; Verknüpfung wird automatisch auf beiden Seiten gespeichert; im Dashboard als klickbare Chips angezeigt
- **Richtfunkstrecken-Overlay**: Neues Overlay „Richtfunkstrecken" zeigt gestrichelte Linien zwischen verknüpften Stationen auf der Karte
- **Bearbeitungen-Tab (Admin)**: Neuer Tab im Adminbereich listet alle Bearbeitungen (Standorte, Fahrtanweisungen, Overlays) mit Bearbeiternamen und Zeitstempel
- **Fahrtanweisung im Standort-Editor (Admin)**: Fahrtanweisungen können direkt im Standort-Bearbeitungsformular eingesehen und geändert werden; automatische Versionierung (bis zu 10 Einträge)

### Geändert
- **Admin-Panel**: Fahrtanweisungen-Tab entfernt (Inhalt jetzt im Standort-Editor und Bearbeitungen-Tab)
- **Bearbeitungs-Zuordnung**: Fahrtanweisungen, Overlays und Standort-Bearbeitungen zeigen jetzt den eingetragenen Namen anstelle einer internen ID

### Entfernt
- **Blitzortung**: Blitzortung-Kartenebene entfernt (Kachel-Server nicht mehr verfügbar); bestehende Einstellungen werden automatisch bereinigt

## v0.20 - 2026-04-09

### Neu
- DIPUL/DFS Drohnenflugkarte hinzugefügt > Overlay Menü

## v0.10 - 2026-04-09

### Neu
- Hello World, ab hier sollen die Versionen dokumentiert werden!
- Changelog implementiert