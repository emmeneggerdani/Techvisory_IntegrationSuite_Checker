const { fetchDesigntimePackages, fetchRuntimeArtifacts, buildArtifactDesignUrl, buildPackageDesignUrl } = require('./sapClient');
const { runChecks, worstSeverity } = require('./checks');

/** Holt Design- und Laufzeitstand eines Tenants und führt alle Prüfungen aus. */
async function getTenantStatus(tenant) {
  const [packages, runtimeById] = await Promise.all([
    fetchDesigntimePackages(tenant),
    fetchRuntimeArtifacts(tenant),
  ]);

  const enrichedPackages = packages.map((pkg) => ({
    ...pkg,
    designUrl: buildPackageDesignUrl(tenant, pkg.id),
    artifacts: pkg.artifacts.map((art) => {
      const runtime = runtimeById.get(art.id) || {};
      const ctx = { ...art, ...runtime };
      const findings = runChecks(ctx);
      return {
        ...art,
        runtimeVersion: runtime.runtimeVersion || null,
        status: runtime.status || null,
        deployedBy: runtime.deployedBy || null,
        deployedOn: runtime.deployedOn || null,
        designUrl: buildArtifactDesignUrl(tenant, pkg.id, art),
        findings,
        severity: worstSeverity(findings),
      };
    }),
  }));

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    fetchedAt: new Date().toISOString(),
    packages: enrichedPackages,
  };
}

module.exports = { getTenantStatus };
