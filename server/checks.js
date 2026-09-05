// Jede Prüffunktion bekommt den zusammengeführten Artefakt-Kontext (Design-
// und Laufzeitdaten) und gibt entweder ein Finding oder null zurück.
// Weitere Prüfungen können hier einfach als zusätzliche Funktion ergänzt
// und unten in CHECKS aufgenommen werden.

function notDeployed(ctx) {
  if (ctx.runtimeVersion) return null;
  return {
    key: 'not-deployed',
    severity: 'error',
    label: 'Nicht deployed',
  };
}

function versionMismatch(ctx) {
  if (!ctx.runtimeVersion) return null;
  if (ctx.runtimeVersion === ctx.designVersion) return null;
  return {
    key: 'version-mismatch',
    severity: 'warn',
    label: `Abweichende Version (Design ${ctx.designVersion} / Deployed ${ctx.runtimeVersion})`,
  };
}

function runtimeError(ctx) {
  if (!ctx.status) return null;
  if (!['ERROR', 'STOPPED'].includes(ctx.status)) return null;
  return {
    key: 'runtime-error',
    severity: 'error',
    label: `Laufzeitstatus ${ctx.status}`,
  };
}

const CHECKS = [notDeployed, versionMismatch, runtimeError];

function runChecks(ctx) {
  return CHECKS.map((check) => check(ctx)).filter(Boolean);
}

/** Höchste Schwere aus einer Liste von Findings ableiten, fürs Badge im Baum. */
function worstSeverity(findings) {
  if (findings.some((f) => f.severity === 'error')) return 'error';
  if (findings.some((f) => f.severity === 'warn')) return 'warn';
  return 'ok';
}

module.exports = { runChecks, worstSeverity };
