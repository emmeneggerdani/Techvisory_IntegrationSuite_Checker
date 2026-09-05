// Zugriff auf die SAP Cloud Integration API (Package "CloudIntegrationAPI",
// https://api.sap.com/package/CloudIntegrationAPI/overview) über OAuth2
// Client-Credentials-Flow, siehe README für Details zum Service Key.

const tokenCache = new Map(); // tenantId -> { token, expiresAt }

async function getAccessToken(tenant) {
  const cached = tokenCache.get(tenant.id);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.token;
  }

  const { clientid, clientsecret, tokenurl } = tenant.credentials;
  const basicAuth = Buffer.from(`${clientid}:${clientsecret}`).toString('base64');

  const res = await fetch(tokenurl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`OAuth-Token konnte nicht geholt werden (HTTP ${res.status})`);
  }

  const data = await res.json();
  tokenCache.set(tenant.id, {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function callApi(tenant, resourcePath) {
  const token = await getAccessToken(tenant);
  const url = `${tenant.credentials.apiUrl}${resourcePath}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SAP API antwortete mit HTTP ${res.status} für ${resourcePath}${body ? ` – ${body.slice(0, 300)}` : ''}`);
  }

  const json = await res.json();
  return json.d ? json.d.results : json.value || [];
}

/** OData-v2-String-Key escapen (einfache Anführungszeichen verdoppeln). */
function odataStringKey(value) {
  return `'${encodeURIComponent(String(value).replace(/'/g, "''"))}'`;
}

/** Läuft `items` mit maximal `limit` gleichzeitigen `worker`-Aufrufen ab. */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// Die vier Artefakttypen, die pro Package als eigene Navigationsressource
// abgefragt werden müssen (kein gemeinsames $expand möglich, siehe unten).
// "designSegment" ist das URL-Segment im Design-Bereich der Web-UI
// (.../shell/design/contentpackage/<PackageId>/<designSegment>/<ArtifactId>) –
// "integrationflows" und "messagemappings" sind an einem echten Tenant
// verifiziert, "valuemappings"/"scriptcollections" folgen konsequent demselben
// Namensschema, sind aber nicht einzeln nachgeprüft.
const ARTIFACT_KINDS = [
  { nav: 'IntegrationDesigntimeArtifacts', type: 'INTEGRATION_FLOW', designSegment: 'integrationflows' },
  { nav: 'MessageMappingDesigntimeArtifacts', type: 'MESSAGE_MAPPING', designSegment: 'messagemappings' },
  { nav: 'ValueMappingDesigntimeArtifacts', type: 'VALUE_MAPPING', designSegment: 'valuemappings' },
  { nav: 'ScriptCollectionDesigntimeArtifacts', type: 'SCRIPT_COLLECTION', designSegment: 'scriptcollections' },
];

/**
 * Alle Packages inkl. ihrer Design-time-Artefakte alle Typen (aktueller Stand
 * im Design). Die Cloud Integration API unterstützt auf IntegrationPackages
 * weder $expand noch $select (liefert HTTP 501 "Not implemented") – Artefakte
 * müssen deshalb pro Package und pro Typ einzeln über den Navigationspfad
 * IntegrationPackages('Id')/<Typ>DesigntimeArtifacts abgefragt werden.
 */
async function fetchDesigntimePackages(tenant) {
  let packages;
  try {
    packages = await callApi(tenant, '/api/v1/IntegrationPackages?$top=500');
  } catch (err) {
    throw withPermissionHint(err);
  }

  const tasks = packages.flatMap((pkg) => ARTIFACT_KINDS.map((kind) => ({ pkg, kind })));
  const results = await mapWithConcurrency(tasks, 6, async ({ pkg, kind }) => {
    const artifacts = await callApi(
      tenant,
      `/api/v1/IntegrationPackages(${odataStringKey(pkg.Id)})/${kind.nav}`
    ).catch((err) => {
      throw withPermissionHint(err);
    });
    return { pkgId: pkg.Id, kind, artifacts };
  });

  const byPkgId = new Map(
    packages.map((pkg) => [pkg.Id, { id: pkg.Id, name: pkg.Name, version: pkg.Version, artifacts: [] }])
  );
  for (const { pkgId, kind, artifacts } of results) {
    const pkgEntry = byPkgId.get(pkgId);
    for (const art of artifacts) {
      pkgEntry.artifacts.push({
        id: art.Id,
        name: art.Name,
        designVersion: art.Version,
        type: kind.type,
        designSegment: kind.designSegment,
      });
    }
  }
  return Array.from(byPkgId.values());
}

/**
 * Leitet den Hostnamen der Design-Web-UI aus der API-Basis-URL ab: Beide
 * teilen sich Tenant-Subdomain und Region, nur das Segment vor "cfapps"
 * unterscheidet sich (API-Knoten z.B. "it-cpi022" vs. fest "integrationsuite"
 * für die Web-UI). Liefert null, falls die URL nicht diesem Cloud-Foundry-
 * Schema entspricht, statt einen falschen Link zu raten.
 */
function deriveDesignBaseUrl(apiUrl) {
  try {
    const url = new URL(apiUrl);
    const parts = url.hostname.split('.');
    const cfappsIndex = parts.indexOf('cfapps');
    if (cfappsIndex <= 0) return null;
    const designHost = [parts[0], 'integrationsuite', ...parts.slice(cfappsIndex)].join('.');
    return `${url.protocol}//${designHost}`;
  } catch {
    return null;
  }
}

/** Deep-Link in den Design-Bereich der Web-UI für ein einzelnes Artefakt. */
function buildArtifactDesignUrl(tenant, packageId, artifact) {
  const base = deriveDesignBaseUrl(tenant.credentials.apiUrl);
  if (!base || !artifact.designSegment) return null;
  return `${base}/shell/design/contentpackage/${encodeURIComponent(packageId)}/${artifact.designSegment}/${encodeURIComponent(artifact.id)}`;
}

/** Deep-Link in den Design-Bereich der Web-UI für ein ganzes Package. */
function buildPackageDesignUrl(tenant, packageId) {
  const base = deriveDesignBaseUrl(tenant.credentials.apiUrl);
  if (!base) return null;
  return `${base}/shell/design/contentpackage/${encodeURIComponent(packageId)}?section=ARTIFACTS`;
}

function withPermissionHint(err) {
  if (!err.message.includes('HTTP 403')) return err;
  return new Error(
    `${err.message} — Der OAuth-Client hat vermutlich keine Design-time-Berechtigung. Die Service-Instanz ` +
      '(Plan "api") muss beim Anlegen mit passenden Lese-Rollen erstellt werden, z.B. ' +
      '{"roles":["WorkspacePackagesRead","CatalogPackagesRead","CatalogPackageArtifactsRead"]} ' +
      '(ohne Administrator-/Entwickler-Sammelrolle nötig), siehe README-Abschnitt "Tenant hinzufügen".'
  );
}

/** Alle aktuell deployten (Runtime-)Artefakte des Tenants. */
async function fetchRuntimeArtifacts(tenant) {
  const select = ['Id', 'Version', 'Type', 'Status', 'DeployedBy', 'DeployedOn'].join(',');
  const runtimeArtifacts = await callApi(tenant, `/api/v1/IntegrationRuntimeArtifacts?$select=${select}&$top=500`);

  const byId = new Map();
  for (const art of runtimeArtifacts) {
    byId.set(art.Id, {
      runtimeVersion: art.Version,
      status: art.Status,
      deployedBy: art.DeployedBy,
      deployedOn: art.DeployedOn ? parseODataDate(art.DeployedOn) : null,
      type: art.Type,
    });
  }
  return byId;
}

/** SAP OData-v2-Datumsformat "/Date(1699999999000)/" in ISO-String umwandeln. */
function parseODataDate(value) {
  const match = /\/Date\((\d+)\)\//.exec(value);
  if (!match) return value;
  return new Date(Number(match[1])).toISOString();
}

module.exports = {
  fetchDesigntimePackages,
  fetchRuntimeArtifacts,
  buildArtifactDesignUrl,
  buildPackageDesignUrl,
};
