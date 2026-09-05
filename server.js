const path = require('path');
const express = require('express');
const { loadTenants } = require('./server/config');
const { getTenantStatus } = require('./server/tenantStatus');

const app = express();
const PORT = process.env.PORT || 3450;

function findTenant(id) {
  return loadTenants().find((t) => t.id === id);
}

app.get('/api/tenants', (req, res) => {
  const tenants = loadTenants().map(({ id, name, color, configError }) => ({
    id,
    name,
    color,
    configError,
  }));
  res.json(tenants);
});

app.get('/api/tenants/:id/status', async (req, res) => {
  const tenant = findTenant(req.params.id);
  if (!tenant) {
    return res.status(404).json({ error: `Tenant "${req.params.id}" nicht gefunden.` });
  }
  if (tenant.configError) {
    return res.status(200).json({
      tenantId: tenant.id,
      tenantName: tenant.name,
      error: `Konfigurationsfehler: ${tenant.configError}`,
    });
  }

  try {
    const status = await getTenantStatus(tenant);
    res.json(status);
  } catch (err) {
    res.status(200).json({
      tenantId: tenant.id,
      tenantName: tenant.name,
      error: err.message,
    });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Techvisory IntegrationSuite Checker läuft auf http://localhost:${PORT}`);
});
