<p align="center">
  <img src="public/assets/Techvisory_Logo.png" alt="Techvisory" height="60">
</p>

# Integration Suite Checker

Ein kleines, kostenloses Tool, das sich mit mehreren **SAP Integration
Suite**-Tenants verbindet, alle Packages und Integration-Artefakte als
Baum darstellt und markiert, **was nicht deployed ist** oder **wo die
deployte Version vom aktuellen Design abweicht**. Werden mehrere Tenants
gleichzeitig ausgewählt, vergleicht das Tool Deploymentstatus und
Versionen tenantübergreifend (z. B. DEV vs. QAS vs. PRD).

Es läuft lokal als kleiner Node.js-Server (siehe [Warum ein lokaler
Server?](#warum-ein-lokaler-server)) – die Zugangsdaten (Service Keys)
bleiben dabei immer auf dem eigenen Rechner, siehe [Sicherheitshinweis
zu Service Keys](#sicherheitshinweis-zu-service-keys).

## Schnellstart

1. [Node.js](https://nodejs.org/) (Version 18 oder neuer) installieren,
   falls noch nicht vorhanden.
2. Ordner mit den Dateien herunterladen/entpacken und im Terminal
   dorthin wechseln.
3. Abhängigkeiten installieren:
   ```bash
   npm install
   ```
4. Mindestens einen Tenant einrichten (siehe [Tenant
   hinzufügen](#tenant-hinzufügen)).
5. Server starten:
   ```bash
   npm start
   ```
6. Im Browser **http://localhost:3450** öffnen.

## Tenant hinzufügen

Für jeden SAP Integration Suite Tenant wird im BTP Cockpit ein
**Service Key** für einen Service-Instance-Bindung der *Process
Integration Runtime* (bzw. je nach Landschaft *Cloud Integration API*)
benötigt – das ist dieselbe API, die auch die [Cloud Integration API /
CloudIntegrationAPI](https://api.sap.com/package/CloudIntegrationAPI/overview)
im SAP API Business Hub beschreibt.

1. Im BTP Cockpit unter *Instances and Subscriptions* (Cloud Foundry:
   *Service Marketplace* → *Process Integration Runtime*) eine neue
   Serviceinstanz mit Plan **`api`** anlegen. **Wichtig:** Im Schritt
   *Specify parameters* Rollen einfügen, sonst bekommt der OAuth-Client
   standardmässig nur Zugriff auf die Runtime-APIs
   (`IntegrationRuntimeArtifacts`) und dieses Tool schlägt beim Laden
   der Packages mit **HTTP 403 Forbidden** auf
   `IntegrationPackages`/`IntegrationDesigntimeArtifacts` fehl. Da
   dieses Tool ausschliesslich lesend zugreift (siehe [Zugriffsumfang
   dieses Tools](#zugriffsumfang-dieses-tools)), reichen dafür rein
   lesende Rollen, ganz ohne Administrator-/Entwickler-Sammelrolle:
   ```json
   {
     "roles": [
       "WorkspacePackagesRead",
       "CatalogPackagesRead",
       "CatalogPackageArtifactsRead"
     ]
   }
   ```
   Diese drei sind aus der [offiziellen SAP-Rollenliste für diesen
   Service Key](https://blogs.sap.com/2021/07/13/using-cloud-integration-apis-with-tools-on-cloud-foundry-creating-a-service-key/)
   und der [Tasks-and-Permissions-Tabelle](https://help.sap.com/docs/integration-suite/sap-integration-suite/tasks-and-permissions-556d5575d4b0483e85d4f3251f21d0ec)
   als "View packages"/"View package artifacts" beschrieben. Da SAP die
   genaue Zuordnung Rolle → OData-Entität nicht dokumentiert, wurde das
   noch nicht live gegen einen Tenant verifiziert – falls es damit
   weiterhin 403 gibt, schrittweise erweitern:
   1. `AuthGroup_IntegrationDeveloper` alleine probieren (weiterhin ohne
      `AuthGroup_Administrator`),
   2. erst falls auch das nicht reicht, das Rollenpaar aus der
      [SAP-Standard-Anleitung](https://help.sap.com/docs/integration-suite/sap-integration-suite/setting-up-oauth-for-cloud-integration-in-cloud-foundry)
      verwenden:
      ```json
      {
        "roles": [
          "AuthGroup_IntegrationDeveloper",
          "AuthGroup_Administrator"
        ]
      }
      ```
   Falls eine bestehende Instanz mit den falschen/zu wenig Rollen
   angelegt wurde, am einfachsten eine neue Instanz mit den passenden
   Parametern anlegen und davon einen Service Key ziehen (Rollen lassen
   sich nachträglich nicht bearbeiten).

   Danach für die Instanz unter *Service Keys* → *Create Service Key*
   den Service Key erzeugen.
2. Im Ordner [`config/tenants/`](config/tenants/) eine neue Datei
   anlegen, z. B. `dev.tenant.json` (der Dateiname ohne Endung wird
   intern als Tenant-Id verwendet, muss also eindeutig sein).
3. Den heruntergeladenen Service Key **1:1 hineinkopieren** – ohne ihn
   anzupassen. SAP liefert ihn je nach Service/Plan in leicht
   unterschiedlicher Form aus (Feld `oauth` oder `uaa`, API-Basis-URL
   mal auf oberster Ebene, mal im OAuth-Block) – beide Varianten werden
   automatisch erkannt.
4. Optional oben in der Datei einen `_meta`-Block für Anzeigename und
   Farbe ergänzen:
   ```json
   {
     "_meta": { "name": "DEV", "color": "#1B7A3D" },
     "oauth": { "...": "... 1:1 aus dem Service Key ..." }
   }
   ```
   Ohne `_meta` wird der Dateiname als Anzeigename und eine automatisch
   zugewiese Farbe verwendet. Alle Felder, die mit `_` beginnen, werden
   ignoriert und nie an SAP geschickt – siehe das kommentierte Beispiel
   in [`example.tenant.json`](config/tenants/example.tenant.json).
5. Server neu starten (bzw. bei laufendem Server auf **⟳ Aktualisieren**
   klicken) – der Tenant erscheint automatisch in der Tenant-Leiste.

Für weitere Tenants Schritt 2–5 wiederholen.

> Wer Metadaten und Service Key bewusst strikt trennen möchte, kann
> alternativ auch schreiben: `{ "name": "...", "color": "...",
> "serviceKey": { ...Service Key... } }` – beide Formate werden
> unterstützt.

## Zugriffsumfang dieses Tools

Dieses Tool greift **ausschliesslich lesend** auf die Cloud Integration
API zu – es gibt im gesamten Code keinen einzigen schreibenden Aufruf
(kein Deploy/Undeploy, kein Anlegen/Ändern/Löschen von Packages oder
Artefakten). Konkret werden pro Tenant genau zwei HTTP-`GET`-Aufrufe
gemacht (siehe [`server/sapClient.js`](server/sapClient.js)):

- `GET /api/v1/IntegrationPackages?$expand=IntegrationDesigntimeArtifacts`
- `GET /api/v1/IntegrationRuntimeArtifacts`

Der einzige `POST`-Aufruf im ganzen Tool ist der Standard-OAuth2-Login
gegen die `tokenurl` des Service Keys – das ist kein SAP-Content-
Endpunkt, sondern nur der Token-Austausch, den jeder OAuth2-Client
machen muss. Der Service Key sollte deshalb bewusst mit möglichst
schwachen, rein lesenden Rollen erstellt werden (siehe [Tenant
hinzufügen](#tenant-hinzufügen)) statt mit
Administrator-/Entwickler-Sammelrollen.

## Sicherheitshinweis zu Service Keys

Service Keys enthalten ein OAuth-Client-Secret mit Zugriff auf den
jeweiligen Tenant. Die Dateien in `config/tenants/*.json` sind deshalb
über [`.gitignore`](.gitignore) bewusst vom Repository ausgeschlossen
(ausgenommen die anonyme `example.tenant.json`) und sollten **nie**
committet, per Mail verschickt oder anderswo abgelegt werden. Sie
verlassen den eigenen Rechner auch beim normalen Betrieb nicht: Das
Tool tauscht den Service Key serverseitig gegen ein kurzlebiges
OAuth-Token und schickt nur dieses Token an SAP – niemals Client-Id
oder Secret direkt an den Browser.

## Warum ein lokaler Server?

Anders als z. B. der [SAP
Favoriten-Manager](https://github.com/emmeneggerdani/Techvisory_SAP_Favorites_Manager)
lässt sich dieses Tool nicht rein im Browser per `index.html`
betreiben: SAP Integration Suite verlangt einen OAuth2-Client-Credentials-Flow
mit einem Client-Secret, das nicht im Browser landen darf, und die
API erlaubt in der Regel keine direkten Cross-Origin-Aufrufe aus dem
Browser. Der lokale Node.js-Server übernimmt deshalb Login und
API-Zugriff und liefert dem Browser nur die aufbereiteten
Statusinformationen.

## Was man damit sieht

- **Baum-Ansicht** (ein Tenant ausgewählt): alle Packages mit ihren
  Artefakten – Integration Flows, Message Mappings, Value Mappings und
  Script Collections –, je Artefakt die aktuelle Design-Version, die
  deployte Version sowie ein Status-Badge.
- **Vergleichsansicht** (mehrere Tenants ausgewählt): eine Tabelle mit
  einer Spalte je Tenant – zeigt auf einen Blick, ob ein Artefakt in
  allen Tenants gleich deployed ist, wo Versionen auseinanderlaufen
  oder wo ein Artefakt in einem Tenant noch gar nicht vorhanden ist.
- **Suche** über Package-/Artefaktname und Filter **„nur
  Auffälligkeiten“**, um schnell nur die problematischen Artefakte zu
  sehen.
- **Direktlink ins Design** (↗ neben Package und im Detail-Panel eines
  Artefakts): öffnet das Package bzw. das ausgewählte Artefakt direkt
  im Design-Bereich der SAP-Web-UI.

### Aktuelle Prüfungen

| Badge | Bedeutung |
|---|---|
| 🔴 Nicht deployed | Design-Artefakt existiert, wurde aber noch nie deployed. |
| 🟠 Abweichende Version | Deployte Version ≠ aktuelle Design-Version. |
| 🔴 Laufzeitstatus ERROR/STOPPED | Artefakt ist deployed, die Runtime meldet aber einen Fehler-/Stopp-Status. |
| 🟢 OK | Deployed und auf dem aktuellen Stand. |

## Lizenz

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
– vollständiger Text in [`LICENSE.md`](LICENSE.md).

Kurz zusammengefasst: frei nutzbar, veränderbar und weitergebbar für
**nicht-kommerzielle Zwecke**; kein Verkauf, keine kostenpflichtige
Bereitstellung. Die Software wird **ohne jede Gewährleistung** zur
Verfügung gestellt – Nutzung auf eigenes Risiko.

## Änderungsprotokoll

**1.0.0**
- Erste veröffentlichte Version.

---

## Für Entwickler:innen

Die folgenden Abschnitte sind für alle interessant, die selbst am Code
weiterarbeiten oder weitere Prüffunktionen ergänzen möchten. Zum reinen
Benutzen des Tools ist das nicht nötig.

### Projektstruktur

```
Techvisory_IntegrationSuite_Checker/
├── server.js                 Express-Server, Routen, statisches Ausliefern von public/
├── server/
│   ├── config.js             Lädt Tenant-Konfigurationen aus config/tenants/*.json
│   ├── sapClient.js          OAuth2-Token-Handling & Aufrufe der Cloud Integration API
│   ├── tenantStatus.js       Führt Design- und Laufzeitdaten eines Tenants zusammen
│   └── checks.js             Prüffunktionen (siehe unten) – hier neue Prüfungen ergänzen
├── config/
│   └── tenants/
│       ├── example.tenant.json   Vorlage, im Repo enthalten
│       └── *.tenant.json         Echte Tenants, per .gitignore ausgeschlossen
└── public/                   Frontend (statisches HTML/CSS/Vanilla-JS)
    ├── index.html
    ├── css/styles.css
    ├── js/
    │   ├── api.js             Fetch-Wrapper für die Backend-Routen
    │   ├── render.js          Rendering (Baum, Vergleichstabelle, Detail-Panel)
    │   └── main.js            Zustand & Verdrahtung (Tenant-Auswahl, Suche, Filter)
    └── assets/                Logo/Favicon (Techvisory-Branding)
```

Das Frontend ist bewusst ohne Build-Schritt und ohne Frontend-Framework
gehalten (klassische `<script>`-Einbindung, keine ES-Module/Bundler) –
gleicher Ansatz wie bei den anderen Techvisory-Tools.

### Backend-Routen

- `GET /api/tenants` – konfigurierte Tenants (Id, Name, Farbe), ohne
  jegliche Zugangsdaten.
- `GET /api/tenants/:id/status` – Packages, Artefakte, Design-/Laufzeitversionen
  und Prüfergebnisse für einen Tenant. Bei Verbindungs- oder
  Konfigurationsfehlern liefert die Route `{ error: "..." }` statt eines
  HTTP-Fehlercodes, damit das Frontend den Fehler pro Tenant anzeigen
  kann, ohne die Ansicht anderer Tenants zu blockieren.

### SAP-API-Zugriff

Basiert auf der [Cloud Integration API
(CloudIntegrationAPI)](https://api.sap.com/package/CloudIntegrationAPI/overview)
aus dem SAP API Business Hub:

- `GET /api/v1/IntegrationPackages` liefert alle Packages. `$expand`
  und `$select` werden auf dieser Entität nicht unterstützt (SAP
  antwortet mit HTTP 501 "Not implemented") – die Design-time-Artefakte
  eines Packages werden deshalb pro Package und pro Artefakttyp separat
  über den Navigationspfad
  `IntegrationPackages('Id')/<Typ>DesigntimeArtifacts` abgefragt
  (`IntegrationDesigntimeArtifacts` für Integration Flows,
  `MessageMappingDesigntimeArtifacts`, `ValueMappingDesigntimeArtifacts`,
  `ScriptCollectionDesigntimeArtifacts`), mit maximal 6 gleichzeitigen
  Requests (siehe `server/sapClient.js#fetchDesigntimePackages` und
  `ARTIFACT_KINDS`). Weitere Artefakttypen lassen sich dort durch einen
  zusätzlichen Eintrag ergänzen.
- `GET /api/v1/IntegrationRuntimeArtifacts` liefert alle aktuell
  deployten Artefakte inkl. Version und Laufzeitstatus (siehe
  `server/sapClient.js#fetchRuntimeArtifacts`); `$select` funktioniert
  hier, im Gegensatz zu `IntegrationPackages`, problemlos.
- Beide Seiten werden pro Tenant per `Id` zusammengeführt
  (`server/tenantStatus.js`); das OAuth2-Token wird pro Tenant
  zwischengespeichert und erst kurz vor Ablauf erneuert.

### Direktlinks ins Design

`server/sapClient.js#buildArtifactDesignUrl`/`buildPackageDesignUrl`
bauen aus der API-Basis-URL den Link zum jeweiligen Package/Artefakt im
Design-Bereich der Web-UI: `https://<tenant>.integrationsuite.cfapps.<region>.hana.ondemand.com/shell/design/contentpackage/<PackageId>/<Typ-Segment>/<ArtifactId>`.
Der Host wird dabei aus der API-URL abgeleitet (gleiche Tenant-Subdomain
und Region, aber fixes `integrationsuite`-Segment statt des API-Knotens,
z. B. `it-cpi022`) – schlägt das Muster nicht zu, liefert die Funktion
`null` und der Link wird im Frontend einfach weggelassen, statt eine
falsche URL zu zeigen. Die Segmente `integrationflows` und
`messagemappings` sind an einem echten Tenant verifiziert;
`valuemappings` und `scriptcollections` folgen konsequent demselben
Schema, sind aber nicht einzeln nachgeprüft – bei Bedarf einfach in
`ARTIFACT_KINDS` korrigieren.

Die Anmeldung erfolgt über OAuth2 Client Credentials gegen die
`tokenurl` aus dem Service Key. Da SAP je nach Service/Plan
unterschiedliche Feldnamen im Service Key verwendet (`oauth.*` oder
`uaa.*`, API-Basis-URL auf oberster Ebene oder im OAuth-Block),
normalisiert `server/config.js#extractCredentials` beide Varianten.
`server/config.js#normalizeTenantFile` erlaubt ausserdem, den Service
Key entweder 1:1 (mit optionalem `_meta`-Block) oder als expliziten
`serviceKey`-Wrapper in die Tenant-Datei zu schreiben.

### Weitere Prüffunktionen ergänzen

Jede Prüfung ist eine einzelne Funktion in
[`server/checks.js`](server/checks.js), die den zusammengeführten
Artefakt-Kontext (Design- und Laufzeitdaten) bekommt und entweder `null`
oder ein Finding `{ key, severity, label }` zurückgibt. Neue Prüfungen
lassen sich als weitere Funktion ergänzen und in das `CHECKS`-Array
aufnehmen – z. B. für Dinge wie "Sender-/Empfänger-Konfiguration zeigt
auf DEV-Endpunkt im PROD-Tenant" oder "Artefakt seit X Tagen nicht mehr
deployed". `severity` ist `'ok'`, `'warn'` oder `'error'` und bestimmt
Badge-Farbe sowie das Icon im Baum.

### Bekannte Einschränkungen

- Es werden maximal 500 Packages bzw. 500 Runtime-Artefakte pro Tenant
  abgefragt (kein Nachladen weiterer Seiten). Für die allermeisten
  Tenants ausreichend; bei sehr grossen Landschaften ggf. `$top` in
  `server/sapClient.js` erhöhen oder Paging ergänzen.
- Die Vergleichsansicht führt Artefakte tenantübergreifend über ihre
  `Id` zusammen. Das funktioniert zuverlässig, wenn Packages per
  Content-Transport zwischen den Tenants bewegt wurden (Ids bleiben
  dabei gleich); manuell in jedem Tenant einzeln neu angelegte
  Artefakte mit demselben Namen aber unterschiedlicher Id werden nicht
  als "gleiches" Artefakt erkannt.
- Es wird nur die jeweils **aktive** Design-Version berücksichtigt,
  keine Entwürfe/Draft-Versionen.
