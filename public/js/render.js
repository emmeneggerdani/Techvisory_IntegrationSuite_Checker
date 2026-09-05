const Render = (() => {
  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function matches(term, ...fields) {
    if (!term) return true;
    const t = term.toLowerCase();
    return fields.some((f) => String(f ?? '').toLowerCase().includes(t));
  }

  const TYPE_ICONS = {
    INTEGRATION_FLOW: '🔀',
    MESSAGE_MAPPING: '🗺️',
    VALUE_MAPPING: '🔢',
    SCRIPT_COLLECTION: '📜',
  };
  function artifactIcon(type) {
    return TYPE_ICONS[type] || '⚙';
  }

  function badge(severity, label) {
    const cls = severity === 'error' ? 'error' : severity === 'warn' ? 'warn' : severity === 'ok' ? 'ok' : 'muted';
    return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
  }

  // ---- Tenant-Leiste ----

  function renderTenantBar(el, tenants, selectedIds) {
    if (!tenants.length) {
      el.innerHTML = `<span class="tenant-empty-hint">Kein Tenant konfiguriert – siehe README, Abschnitt „Tenant hinzufügen" (Ordner <code>config/tenants/</code>).</span>`;
      return;
    }
    el.innerHTML = tenants.map((t) => {
      const checked = selectedIds.has(t.id);
      const errorClass = t.configError ? ' has-error' : '';
      const title = t.configError ? `Konfigurationsfehler: ${escapeHtml(t.configError)}` : '';
      return `
        <label class="tenant-chip${checked ? ' checked' : ''}${errorClass}" title="${title}">
          <input type="checkbox" data-tenant="${escapeHtml(t.id)}" ${checked ? 'checked' : ''}>
          <span class="dot" style="background:${escapeHtml(t.color)}"></span>
          ${escapeHtml(t.name)}
        </label>`;
    }).join('');
  }

  // ---- Baum-Ansicht (ein Tenant) ----

  function filterTree(packages, term, issuesOnly) {
    return packages
      .map((pkg) => {
        const artifacts = pkg.artifacts.filter((art) => {
          if (issuesOnly && art.severity === 'ok') return false;
          if (term && !matches(term, art.name, art.id) && !matches(term, pkg.name, pkg.id)) return false;
          return true;
        });
        return { ...pkg, artifacts };
      })
      .filter((pkg) => pkg.artifacts.length > 0);
  }

  function renderTree(el, tenant, status, opts, callbacks) {
    if (status.error) {
      el.innerHTML = `<div class="status-line warn" style="margin:14px;">${escapeHtml(status.error)}</div>`;
      return;
    }
    if (!status.packages) {
      el.innerHTML = `<div class="empty-hint">Lade Packages von ${escapeHtml(tenant.name)}…</div>`;
      return;
    }

    const packages = filterTree(status.packages, opts.term, opts.issuesOnly);
    if (!packages.length) {
      el.innerHTML = `<div class="empty-hint">Keine Packages/Artefakte gefunden.</div>`;
      return;
    }

    el.innerHTML = packages.map((pkg) => renderPackageNode(pkg, opts)).join('');

    el.querySelectorAll('.twisty[data-pkg]').forEach((twisty) => {
      twisty.addEventListener('click', (e) => {
        e.stopPropagation();
        callbacks.onToggle(twisty.dataset.pkg);
      });
    });
    el.querySelectorAll('.node[data-pkg]:not([data-art])').forEach((node) => {
      node.addEventListener('click', () => callbacks.onToggle(node.dataset.pkg));
    });
    el.querySelectorAll('.node[data-art]').forEach((node) => {
      node.addEventListener('click', () => callbacks.onSelectArtifact(node.dataset.pkg, node.dataset.art));
    });
  }

  function renderPackageNode(pkg, opts) {
    const expanded = opts.expanded.has(pkg.id);
    const issueCount = pkg.artifacts.filter((a) => a.severity !== 'ok').length;
    const countBadge = issueCount > 0 ? badge('error', `${issueCount}`) : '';
    return `
      <div class="pkg-block">
        <div class="node" data-pkg="${escapeHtml(pkg.id)}">
          <span class="twisty" data-pkg="${escapeHtml(pkg.id)}">${expanded ? '▾' : '▸'}</span>
          <span class="icon">📦</span>
          <span class="name">${escapeHtml(pkg.name)}</span>
          <span class="extra">${pkg.artifacts.length} Artefakt(e)</span>
          ${countBadge}
          ${pkg.designUrl ? `<a class="design-link" href="${escapeHtml(pkg.designUrl)}" target="_blank" rel="noopener noreferrer" title="Package im Design öffnen" onclick="event.stopPropagation()">↗</a>` : ''}
        </div>
        ${expanded ? `<div class="children">${pkg.artifacts.map((a) => renderArtifactNode(pkg, a, opts)).join('')}</div>` : ''}
      </div>`;
  }

  function renderArtifactNode(pkg, art, opts) {
    const selected = opts.selected && opts.selected.packageId === pkg.id && opts.selected.artifactId === art.id;
    const statusBadge = art.findings.length
      ? art.findings.map((f) => badge(f.severity, f.label)).join(' ')
      : badge('ok', 'OK');
    return `
      <div class="node${selected ? ' selected' : ''}" data-pkg="${escapeHtml(pkg.id)}" data-art="${escapeHtml(art.id)}">
        <span class="icon">${artifactIcon(art.type)}</span>
        <span class="name">${escapeHtml(art.name)}</span>
        <span class="extra">${escapeHtml(art.designVersion)}</span>
        ${statusBadge}
      </div>`;
  }

  // ---- Detail-Panel ----

  function renderDetail(el, tenant, pkg, art) {
    if (!art) {
      el.innerHTML = `<div class="placeholder">Artefakt im Baum anklicken für Details.</div>`;
      return;
    }
    const findingsHtml = art.findings.length
      ? `<ul class="finding-list">${art.findings.map((f) => `<li>${badge(f.severity, f.label)}</li>`).join('')}</ul>`
      : `<div class="status-line ok">Keine Auffälligkeiten – deployt und aktuell.</div>`;

    el.innerHTML = `
      <h2>Artefakt</h2>
      <div class="detail-card">
        <div class="detail-title">${artifactIcon(art.type)} ${escapeHtml(art.name)}</div>
        <div class="detail-meta">Id: ${escapeHtml(art.id)}</div>
        <div class="detail-meta">Package: ${escapeHtml(pkg.name)}</div>
        <div class="detail-meta">Tenant: ${escapeHtml(tenant.name)}</div>
        ${art.designUrl ? `<div class="detail-meta"><a class="detail-link" href="${escapeHtml(art.designUrl)}" target="_blank" rel="noopener noreferrer">Im Design öffnen ↗</a></div>` : ''}
      </div>
      <h3>Versionen</h3>
      <div class="detail-row"><span class="label">Design (aktuell)</span><span class="value">${escapeHtml(art.designVersion)}</span></div>
      <div class="detail-row"><span class="label">Deployed</span><span class="value">${escapeHtml(art.runtimeVersion || '–')}</span></div>
      <div class="detail-row"><span class="label">Laufzeitstatus</span><span class="value">${escapeHtml(art.status || '–')}</span></div>
      <div class="detail-row"><span class="label">Deployed by</span><span class="value">${escapeHtml(art.deployedBy || '–')}</span></div>
      <div class="detail-row"><span class="label">Deployed on</span><span class="value">${art.deployedOn ? new Date(art.deployedOn).toLocaleString('de-CH') : '–'}</span></div>
      <h3 style="margin-top:16px;">Prüfergebnis</h3>
      ${findingsHtml}
    `;
  }

  // ---- Vergleichsansicht (mehrere Tenants) ----

  function buildUnion(entries) {
    const packages = new Map();
    for (const { status } of entries) {
      if (!status || !status.packages) continue;
      for (const pkg of status.packages) {
        if (!packages.has(pkg.id)) packages.set(pkg.id, { id: pkg.id, name: pkg.name, artifacts: new Map() });
        const p = packages.get(pkg.id);
        for (const art of pkg.artifacts) {
          if (!p.artifacts.has(art.id)) p.artifacts.set(art.id, { id: art.id, name: art.name });
        }
      }
    }
    return packages;
  }

  function lookupArtifact(status, pkgId, artId) {
    if (!status || !status.packages) return undefined;
    const pkg = status.packages.find((p) => p.id === pkgId);
    if (!pkg) return null; // Package im Tenant nicht vorhanden
    const art = pkg.artifacts.find((a) => a.id === artId);
    return art || null; // Artefakt im Tenant nicht vorhanden
  }

  function renderCompare(el, entries, opts) {
    const failedTenants = entries.filter((e) => e.status && e.status.error);
    const unionPackages = Array.from(buildUnion(entries).values()).sort((a, b) => a.name.localeCompare(b.name));

    const rows = [];
    for (const pkg of unionPackages) {
      const artifacts = Array.from(pkg.artifacts.values()).sort((a, b) => a.name.localeCompare(b.name));
      const visibleArtifacts = artifacts.filter((art) => {
        if (opts.term && !matches(opts.term, art.name, art.id) && !matches(opts.term, pkg.name, pkg.id)) return false;
        if (opts.issuesOnly) {
          const anyIssue = entries.some((e) => {
            const found = lookupArtifact(e.status, pkg.id, art.id);
            return found && found.severity && found.severity !== 'ok';
          });
          if (!anyIssue) return false;
        }
        return true;
      });
      if (!visibleArtifacts.length) continue;

      rows.push(`<tr class="pkg-row"><td colspan="${entries.length + 1}">📦 ${escapeHtml(pkg.name)}</td></tr>`);
      for (const art of visibleArtifacts) {
        const cells = entries.map((e) => {
          const found = lookupArtifact(e.status, pkg.id, art.id);
          if (e.status && e.status.error) return `<td class="cell-na" title="${escapeHtml(e.status.error)}">Fehler</td>`;
          if (found === null) return `<td class="cell-na">nicht vorhanden</td>`;
          if (found === undefined) return `<td class="cell-na">–</td>`;
          const statusBadge = found.findings.length
            ? found.findings.map((f) => badge(f.severity, f.label)).join(' ')
            : badge('ok', 'OK');
          return `<td>${statusBadge}<div class="cell-version">Design ${escapeHtml(found.designVersion)} · Deployed ${escapeHtml(found.runtimeVersion || '–')}</div></td>`;
        }).join('');
        rows.push(`<tr><td class="art-name">${escapeHtml(art.name)}</td>${cells}</tr>`);
      }
    }

    const failedNote = failedTenants.length
      ? `<div class="status-line warn" style="margin:10px 14px 0;">${failedTenants.map((e) => `${escapeHtml(e.tenant.name)}: ${escapeHtml(e.status.error)}`).join(' · ')}</div>`
      : '';

    if (!rows.length) {
      el.innerHTML = `${failedNote}<div class="empty-hint">Keine Packages/Artefakte gefunden.</div>`;
      return;
    }

    el.innerHTML = `
      ${failedNote}
      <table class="compare">
        <thead>
          <tr>
            <th>Artefakt</th>
            ${entries.map((e) => `<th>${escapeHtml(e.tenant.name)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rows.join('')}</tbody>
      </table>`;
  }

  return { renderTenantBar, renderTree, renderDetail, renderCompare };
})();
