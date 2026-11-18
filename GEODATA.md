# Geodaten-Overlays

Die Karte bietet amtliche Geodaten für Baden-Württemberg und Rheinland-Pfalz. Die Ebenen liegen unter **Kartenebenen** (Ebenen-Symbol oben rechts) in den Kategorien **Kataster & Grenzen**, **Gelände & Luftbild**, **Wetter & Infrastruktur** und **Luftfahrt & Zonen**.

## Ebenen

| Menüpunkt | Inhalt | Baden-Württemberg | Rheinland-Pfalz |
|---|---|---|---|
| Flurstücke (ALKIS) | Flurstücksgrenzen, -nummern und Lagebezeichnungen | LGL-BW WMS | LVermGeoRP WMS |
| Schummerung | Relief-/Geländeschummerung | LGL-BW WMS | LVermGeoRP WMS |
| Luftbild (DOP20) | Amtliches Luftbild | LGL-BW WMS | LVermGeoRP WMS |

Weitere Ebenen: DWD-Warnzonen, Regenradar, Richtfunkstrecken und DiPUL-Flugzonen.

## Automatische Landesauswahl

Für jede Geodaten-Ebene wird nur der Landesdienst geladen, dessen Bundesland im aktuellen Kartenausschnitt sichtbar ist. Beim Verschieben oder Zoomen wird der Anbieter automatisch gewechselt. An der Landesgrenze können beide Dienste gleichzeitig aktiv sein; außerhalb der Abdeckung wird nichts geladen.

Die Auswahl wird in `localStorage` unter `activeOverlayLayers` gespeichert. Alte getrennte Einträge wie `Flurstücke BW (ALKIS)` werden automatisch auf die gemeinsamen Menüpunkte migriert.

## Kartenklick und Standort-Popup

Bei aktivem **Flurstücke (ALKIS)** oder **Luftbild (DOP20)** öffnet ein Klick auf die Karte ein kompaktes Popup:

- Kopfzeile mit Koordinaten und Schließen-Schaltfläche
- Flurstück: Kennzeichen, Nummer, Flur, Gemarkung, Gemeinde, Fläche und – in RLP – die tatsächliche Nutzung
- Luftbild: Befliegungsdatum im Format `TT.MM.JJJJ`
- Kopier-Buttons für Flurstücksnummer und -kennzeichen
- Aktionen: Koordinaten kopieren, in Google Maps öffnen

Das Popup bleibt beim Öffnen im sichtbaren Kartenbereich, blockiert aber nicht das Ziehen der Karte oder die Standortsuche.

### Baden-Württemberg

Die Flurstücksabfrage läuft über den öffentlichen LGL-BW WFS (`nora:v_al_flurstueck`). Es wird eine 1-m-Box um den Klickpunkt geladen; anschließend wird clientseitig per Point-in-Polygon genau das Flurstück ausgewählt, dessen Polygon den Klickpunkt enthält. Das verhindert falsche Nachbarflurstücke an Grenzen.

### Rheinland-Pfalz

Die Flurstücksabfrage läuft über WMS GetFeatureInfo (`Flurstueck`) mit Viewport-BBOX, Kartenpixel und `FEATURE_COUNT=1`. Die Anzeige kombiniert `Flurstueck,Lagebezeichnungen`; schwarze Linien und Beschriftungen werden per CSS gold/orange eingefärbt, damit sie auch im Dark Mode sichtbar sind.

## Datenquellen und Lizenz

- **LGL-BW:** WMS/WFS, Datenlizenz Deutschland – Namensnennung 2.0 (`dl-de/by-2-0`), Attribution `© LGL BW (dl-de/by-2-0)`.
- **LVermGeoRP:** WMS, `dl-de/by-2-0`, Attribution `© GeoBasis-DE / LVermGeoRP (dl-de/by-2-0)`.

Die Dienste sind öffentlich und benötigen keinen API-Key. Weitere Lizenzhinweise stehen in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Hinweise

- Die RLP-Auskunftsdienste können gelegentlich einige Sekunden brauchen; Teilergebnisse werden sofort angezeigt.
- Die DOP-Aktualität wird nur für die Ermittlung des Befliegungsdatums abgefragt und nicht als eigenes Overlay angezeigt.
- Es gibt keine separaten Legenden-Schaltflächen mehr; die Darstellung ist direkt an den Diensten orientiert.
