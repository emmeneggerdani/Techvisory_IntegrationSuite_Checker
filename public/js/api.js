const Api = {
  async getTenants() {
    const res = await fetch('/api/tenants');
    if (!res.ok) throw new Error('Tenant-Liste konnte nicht geladen werden.');
    return res.json();
  },

  async getTenantStatus(id) {
    const res = await fetch(`/api/tenants/${encodeURIComponent(id)}/status`);
    if (!res.ok) throw new Error(`Status für Tenant "${id}" konnte nicht geladen werden.`);
    return res.json();
  },
};
