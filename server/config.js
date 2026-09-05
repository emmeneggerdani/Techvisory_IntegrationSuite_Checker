const fs = require('fs');
const path = require('path');

const TENANTS_DIR = path.join(__dirname, '..', 'config', 'tenants');

// Deterministische Farbpalette für Tenants ohne explizite Farbe (_meta.color).
const PALETTE = ['#1B7A3D', '#B4232C', '#B8860B', '#2C6E9E', '#7B3E57', '#5B6B79'];
function colorForId(id) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

/**
 * Liest eine Tenant-Datei ein. Unterstützt zwei Formate:
 *  1) Der von SAP BTP heruntergeladene Service Key wird 1:1 in die Datei
 *     kopiert (keine Anpassung nötig). Optional kann ein "_meta"-Block mit
 *     "name"/"color" ergänzt werden; alle Top-Level-Felder, die mit "_"
 *     beginnen, werden ignoriert und nicht als Teil des Service Keys
 *     an SAP geschickt.
 *  2) Ein Wrapper-Objekt { name, color, serviceKey: { ...Service Key... } },
 *     falls man Metadaten und Service Key bewusst trennen möchte.
 */
function normalizeTenantFile(raw, id) {
  if (raw.serviceKey) {
    return {
      name: raw.name || id,
      color: raw.color || colorForId(id),
      serviceKey: raw.serviceKey,
    };
  }

  const meta = raw._meta || {};
  const serviceKey = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('_')) serviceKey[key] = value;
  }
  return {
    name: meta.name || id,
    color: meta.color || colorForId(id),
    serviceKey,
  };
}

/**
 * Normalisiert die unterschiedlichen Service-Key-Formate, die SAP BTP je nach
 * Service/Plan für die Cloud Integration API ausgibt: Der OAuth-Teil kann
 * unter "oauth" oder "uaa" liegen, und die API-Basis-URL steht je nach
 * Variante entweder auf oberster Ebene ("url") oder direkt im OAuth-Block
 * ("oauth.url"/"uaa.url" ist dann bereits die API-Basis, nicht die
 * Auth-Basis).
 */
function extractCredentials(serviceKey) {
  const oauth = serviceKey.oauth || serviceKey.uaa || {};
  const clientid = oauth.clientid;
  const clientsecret = oauth.clientsecret;

  const topLevelApiUrl = serviceKey.url;
  const apiUrl = topLevelApiUrl || oauth.url;

  let tokenurl = oauth.tokenurl;
  if (!tokenurl && topLevelApiUrl && oauth.url) {
    // Klassische Variante ohne explizite tokenurl: oauth/uaa.url ist hier die Auth-Basis.
    tokenurl = `${oauth.url}/oauth/token`;
  }

  const missing = ['clientid', 'clientsecret', 'tokenurl', 'apiUrl'].filter(
    (key) => !{ clientid, clientsecret, tokenurl, apiUrl }[key]
  );
  if (missing.length) {
    throw new Error(`Service Key unvollständig, es fehlen: ${missing.join(', ')}`);
  }
  return { clientid, clientsecret, tokenurl, apiUrl };
}

function loadTenants() {
  if (!fs.existsSync(TENANTS_DIR)) return [];

  return fs
    .readdirSync(TENANTS_DIR)
    .filter((file) => file.endsWith('.tenant.json') && file !== 'example.tenant.json')
    .map((file) => {
      const id = file.replace(/\.tenant\.json$/, '');
      const filePath = path.join(TENANTS_DIR, file);
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const { name, color, serviceKey } = normalizeTenantFile(raw, id);
        const credentials = extractCredentials(serviceKey);
        return { id, name, color, credentials, configError: null };
      } catch (err) {
        return {
          id,
          name: id,
          color: '#B4232C',
          credentials: null,
          configError: err.message,
        };
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { loadTenants, TENANTS_DIR };
