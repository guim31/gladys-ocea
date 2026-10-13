# OCEA Smart Building

Liest die Zähler deiner Wohnung aus dem **OCEA Smart Building
Bewohnerportal** (<https://espace-resident.ocea-sb.com>) aus: Kaltwasser,
Warmwasser und Heizung, wenn die Zähler deines Gebäudes von OCEA aus der
Ferne abgelesen werden.

> **Keine Verbindung zu OCEA Smart Building.** OCEA bietet keine öffentliche
> API an: Die Integration liest das Portal so, wie es dein Browser tut, und
> kann aufhören zu funktionieren, wenn OCEA es ändert.
>
> **Ohne Konto entwickelt: Rückmeldungen willkommen.** Erzähl uns im
> Gladys-Forum, was du siehst, besonders wenn deine Heizung über
> Heizkostenverteiler gemessen wird.

## Was du bekommst

Ein Gerät pro Wohnung deines Kontos (mehrere, wenn du mehrere hast), mit
einer Funktion pro Medium, das das Portal anzeigt:

| Funktion                     | Einheit      | Hinweise                                    |
| ---------------------------- | ------------ | ------------------------------------------- |
| Kaltwasser                   | m³           | kumulierter Zählerstand                     |
| Warmwasser                   | m³           | kumulierter Zählerstand                     |
| Heizung (Energie)            | kWh          | mit einem Wärmemengenzähler (CETC)          |
| Heizung (Verteilereinheiten) | ohne Einheit | mit Heizkostenverteilern an den Heizkörpern |

**Wärmemengenzähler oder Heizkostenverteiler?** Ein Wärmemengenzähler (CETC)
misst die Energie, die die Wohnung erhält, in kWh. Heizkostenverteiler, einer
pro Heizkörper, messen keine Energie, sondern zählen **Einheiten**, die nur
angeben, welcher Anteil der Heizkostenrechnung des Gebäudes auf die Wohnung
entfällt. Die Integration zeigt die Verteilereinheiten deshalb als einfachen
Zähler ohne Einheit an, niemals in kWh.

## Konfiguration

1. Öffne den Tab **Konfiguration** der Integration.
2. Gib die **E-Mail-Adresse** und das **Passwort** deines OCEA-Bewohnerportals
   ein. Deine Wohnungen werden über das Konto gefunden.
3. Stelle bei Bedarf das **Ableseintervall** (standardmäßig 6 Stunden, 1 bis 24) und die **Sprache** der Zählernamen ein.
4. Klicke auf **Konfiguration speichern**, öffne dann den Tab **Entdecken**
   und füge deine Wohnung mit **Zu Gladys hinzufügen** hinzu.

Die Schaltfläche **Verbindung testen und jetzt ablesen** verbindet sich sofort
mit OCEA und zeigt die Anzahl der gefundenen Wohnungen und Zähler an.

## Ablesehäufigkeit

OCEA-Zähler senden ihren Zählerstand einmal oder einige Male pro Tag. Die
Integration liest das Portal **standardmäßig alle 6 Stunden**, höchstens
einmal pro Stunde: Häufigeres Lesen bringt keine frischeren Daten und belastet
nur das Portal. Die letzte Ablesung wird gespeichert: Ein Neustart von Gladys
liest OCEA erst nach Ablauf des Intervalls erneut. Ein unveränderter Wert wird
trotzdem mindestens alle 12 Stunden erneut an Gladys gesendet, damit nie
„Kein aktueller Wert“ angezeigt wird.

## Diagramme und Energieüberwachung

- **Wasser**: Der Zählerstand jedes Zählers wird im Verlauf der Funktion
  gespeichert und im Diagramm des Geräts angezeigt.
- **Heizung in kWh (CETC)**: Der Zählerstand ist der eines Energiezählers,
  den die Energieüberwachung von Gladys selbst in einen Verbrauch pro halbe
  Stunde und in Kosten umrechnet. Gladys ordnet einen neuen Energiezählerstand
  **deinem Hauptstromzähler** unter (sofern einer festgelegt ist): Setze in
  **Integrationen → Energieüberwachung** den Heizungszählerstand auf **kein
  übergeordnetes Gerät (Wurzel)**, sonst zählt deine Heizung zu deinem Strom.
  Da der Zählerstand nur alle paar Stunden eintrifft, fällt der Verbrauch
  dieser Stunden in eine einzige halbe Stunde.
- **Heizung in Verteilereinheiten**: nur ein Verlaufsdiagramm des Zählers.
  Diese Einheiten sind keine Energie und gehen nicht in die
  Energieüberwachung ein.

## Dashboard-Widget

Das Widget **OCEA-Verbrauch** zeigt für die gewählte Wohnung den Verbrauch
des laufenden Monats pro Medium. Er wird von der Integration aus den
abgelesenen Zählerständen berechnet: Der erste Monat zählt erst ab der ersten
Ablesung, und das Widget zeigt an, seit wann es zählt.

## Grenzen

- Nur das, was das Dashboard des Portals zeigt: ein Wert pro Medium, keine
  Details pro Heizkörper oder pro Zähler, keine Warnungen.
- Die Ablesungen haben die Verzögerung derer von OCEA (oft der Vortag).
- Die Integration wurde ohne Konto entwickelt: Besonders der Fall der
  Heizkostenverteiler beruht auf Annahmen. Deine Rückmeldungen helfen.

## Datenschutz

E-Mail-Adresse und Passwort bleiben in der Konfiguration von Gladys. Die
Integration speichert das OCEA-Sitzungstoken und die letzten Ablesungen in
ihrem Volume `/data` und schreibt nie Zugangsdaten oder Token in ihre
Protokolle.

## Bei Problemen

- **„OCEA hat die E-Mail-Adresse oder das Passwort abgelehnt“**: Prüfe sie
  im Portal und speichere sie dann erneut. Die Integration versucht es bis
  dahin nicht mehr, damit dein Konto nie gesperrt wird.
- **„Das OCEA-Portal hat nicht geantwortet“**: OCEA ist vielleicht in
  Wartung. Die Integration versucht es in 30 Minuten erneut.
- Öffne den Tab **Protokolle** der Integration, um zu sehen, was passiert ist.
  Eine normale Ablesung schreibt dort nichts: Nur der Start, die Verbindung zu
  OCEA, Fehler (eine Zeile, wenn sie auftreten, eine, wenn alles wieder
  funktioniert) und deine Aktionen erscheinen.
