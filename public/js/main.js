(() => {
  const STORAGE_KEY = 'ischeck_selected_tenants';

  const state = {
    tenants: [],
    selected: new Set(),
    statusByTenant: new Map(), // tenantId -> status object
    expanded: new Set(), // package ids, aufgeklappt (nur Baum-Ansicht)
    selectedArtifact: null, // { packageId, artifactId } – nur Baum-Ansicht
    term: '',
    issuesOnly: false,
  };

  const el = {
    tenantBar: document.getElementById('tenant-bar'),
    treePanel: document.getElementById('tree-panel'),
    sideContent: document.getElementById('side-content'),
    footer: document.getElementById('footer-msg'),
    fetchedInfo: document.getElementById('fetched-info'),
    search: document.getElementById('search-input'),
    issuesOnly: document.getElementById('filter-issues-only'),
    btnRefresh: document.getElementById('btn-refresh'),
    btnExpandAll: document.getElementById('btn-expand-all'),
    btnCollapseAll: document.getElementById('btn-collapse-all'),
    btnSearchClear: document.getElementById('btn-search-clear'),
    btnInfo: document.getElementById('btn-info'),
    btnInfoClose: document.getElementById('btn-info-close'),
    infoOverlay: document.getElementById('info-overlay'),
  };

  function loadSelectionFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch (e) { /* ignorieren, kein Blocker */ }
    return null;
  }

  function saveSelectionToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(state.selected)));
    } catch (e) { /* localStorage evtl. nicht verfügbar */ }
  }

  async function loadTenantData(tenantId) {
    state.statusByTenant.set(tenantId, {}); // markiert "lädt"
    renderAll();
    try {
      const status = await Api.getTenantStatus(tenantId);
      state.statusByTenant.set(tenantId, status);
    } catch (err) {
      state.statusByTenant.set(tenantId, { error: err.message });
    }
    renderAll();
  }

  function refreshSelected() {
    state.selected.forEach((id) => loadTenantData(id));
  }

  function renderTenantBar() {
    Render.renderTenantBar(el.tenantBar, state.tenants, state.selected);
    el.tenantBar.querySelectorAll('input[data-tenant]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.tenant;
        if (cb.checked) {
          state.selected.add(id);
          if (!state.statusByTenant.has(id)) loadTenantData(id);
        } else {
          state.selected.delete(id);
        }
        saveSelectionToStorage();
        renderAll();
      });
    });
  }

  function renderMain() {
    const ids = Array.from(state.selected);
    const opts = { term: state.term.trim(), issuesOnly: state.issuesOnly };

    if (ids.length === 0) {
      el.treePanel.innerHTML = `<div class="empty-hint">Tenant links auswählen, um Packages und Artefakte zu laden.</div>`;
      el.sideContent.innerHTML = `<div class="placeholder">Artefakt im Baum anklicken für Details.</div>`;
      el.fetchedInfo.textContent = '';
      return;
    }

    if (ids.length === 1) {
      const tenant = state.tenants.find((t) => t.id === ids[0]);
      const status = state.statusByTenant.get(ids[0]) || {};
      Render.renderTree(el.treePanel, tenant, status, { ...opts, expanded: state.expanded, selected: state.selectedArtifact }, {
        onToggle: (pkgId) => {
          if (state.expanded.has(pkgId)) state.expanded.delete(pkgId); else state.expanded.add(pkgId);
          renderMain();
        },
        onSelectArtifact: (pkgId, artId) => {
          state.selectedArtifact = { packageId: pkgId, artifactId: artId };
          renderMain();
        },
      });

      let pkg = null, art = null;
      if (state.selectedArtifact && status.packages) {
        pkg = status.packages.find((p) => p.id === state.selectedArtifact.packageId);
        art = pkg && pkg.artifacts.find((a) => a.id === state.selectedArtifact.artifactId);
      }
      Render.renderDetail(el.sideContent, tenant, pkg, art);
      el.fetchedInfo.textContent = status.fetchedAt ? `Stand: ${new Date(status.fetchedAt).toLocaleString('de-CH')}` : '';
      return;
    }

    // Vergleichsansicht: mehrere Tenants gleichzeitig ausgewählt
    const entries = ids.map((id) => ({
      tenant: state.tenants.find((t) => t.id === id),
      status: state.statusByTenant.get(id) || {},
    }));
    Render.renderCompare(el.treePanel, entries, opts);
    el.sideContent.innerHTML = `<div class="placeholder">Vergleichsansicht für ${ids.length} Tenants. Für Detailinfos einzelnen Tenant auswählen.</div>`;
    const latest = entries.map((e) => e.status.fetchedAt).filter(Boolean).sort().pop();
    el.fetchedInfo.textContent = latest ? `Stand: ${new Date(latest).toLocaleString('de-CH')}` : '';
  }

  function renderAll() {
    renderTenantBar();
    renderMain();
    updateFooter();
  }

  function updateFooter() {
    if (!state.tenants.length) {
      el.footer.textContent = 'Kein Tenant konfiguriert – siehe README.';
      return;
    }
    if (!state.selected.size) {
      el.footer.textContent = 'Kein Tenant ausgewählt.';
      return;
    }
    el.footer.textContent = state.selected.size === 1
      ? `1 Tenant ausgewählt.`
      : `${state.selected.size} Tenants ausgewählt – Vergleichsansicht aktiv.`;
  }

  function wireStaticControls() {
    el.btnRefresh.addEventListener('click', refreshSelected);
    el.btnExpandAll.addEventListener('click', () => {
      const status = state.statusByTenant.get(Array.from(state.selected)[0]);
      if (status && status.packages) status.packages.forEach((p) => state.expanded.add(p.id));
      renderMain();
    });
    el.btnCollapseAll.addEventListener('click', () => {
      state.expanded.clear();
      renderMain();
    });
    el.search.addEventListener('input', () => {
      state.term = el.search.value;
      renderMain();
    });
    el.btnSearchClear.addEventListener('click', () => {
      el.search.value = '';
      state.term = '';
      renderMain();
    });
    el.issuesOnly.addEventListener('change', () => {
      state.issuesOnly = el.issuesOnly.checked;
      renderMain();
    });
    el.btnInfo.addEventListener('click', () => { el.infoOverlay.hidden = false; });
    el.btnInfoClose.addEventListener('click', () => { el.infoOverlay.hidden = true; });
    el.infoOverlay.addEventListener('click', (e) => { if (e.target === el.infoOverlay) el.infoOverlay.hidden = true; });
  }

  async function init() {
    wireStaticControls();
    try {
      state.tenants = await Api.getTenants();
    } catch (err) {
      el.footer.textContent = `Fehler beim Laden der Tenant-Liste: ${err.message}`;
      return;
    }

    const stored = loadSelectionFromStorage();
    if (stored && state.tenants.some((t) => stored.has(t.id))) {
      state.selected = new Set(Array.from(stored).filter((id) => state.tenants.some((t) => t.id === id)));
    } else if (state.tenants.length === 1) {
      state.selected = new Set([state.tenants[0].id]);
    }

    renderAll();
    state.selected.forEach((id) => loadTenantData(id));
  }

  init();
})();
