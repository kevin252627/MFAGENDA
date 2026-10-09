(() => {
  const request = async (url, options = {}) => {
    const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    if (response.status === 401) window.dispatchEvent(new Event('mf:session-expired'));
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response.json();
  };
  const inventoryKey = unit => unit === 'filial' ? 'mf_alocacao_filial_v1' : 'mf_alocacao_v1';
  const countKey = unit => `mf_contagem_${unit}_v1`;
  const pendingKey = 'mf_prisma_pending_v1';
  const id = row => `${row.codigo}\\u0000${row.item}`;
  let syncRunning = false;
  let retrySync = true;
  let syncTimer = null;
  let refreshRunning = false;
  const isAdmin = () => window.currentUser?.role === 'admin';
  const hasSyncablePending = () => Object.values(readPending()).some(entry => {
    if (entry.type === 'counts') return true;
    if (entry.type === 'purchases') return entry.unit === window.currentUser?.id;
    if (entry.type === 'purchaseDeletes') return entry.unit === window.currentUser?.id;
    return true;
  });

  function setSyncStatus(message, color = '#c9dcf7') {
    const el = document.getElementById('syncStatus');
    if (el) { el.textContent = `● ${message}`; el.style.color = color; }
  }
  function readPending() {
    try { return JSON.parse(localStorage.getItem(pendingKey) || '{}'); }
    catch { return {}; }
  }
  function enqueue(type, unit, items) {
    const pending = readPending();
    const key = `${type}_${unit}`;
    const merged = type === 'purchases' || type === 'purchaseDeletes' || type === 'inventoryDeletes'
      ? [...(pending[key]?.items || []), ...items].filter((row, index, all) => all.findIndex(item => (item.id || `${item.codigo || ''}\u0000${item.item || ''}`) === (row.id || `${row.codigo || ''}\u0000${row.item || ''}`)) === index)
      : items;
    pending[key] = { type, unit, items: merged, updatedAt: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    try { localStorage.setItem(pendingKey, JSON.stringify(pending)); }
    catch (error) {
      try {
        localStorage.removeItem("mf_autosave_v2_snapshot");
        localStorage.setItem(pendingKey, JSON.stringify(pending));
      } catch { setSyncStatus("Armazenamento local cheio; tentando manter a alteração no servidor", "#ffd166"); }
    }
    setSyncStatus('Alterações salvas neste dispositivo; aguardando sincronização');
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncPending, 400);
  }
  async function syncPending() {
    if (syncRunning) return;
    if (!window.currentUser) return;
    if (!navigator.onLine) {
      setSyncStatus('Offline; alterações salvas neste dispositivo', '#ffd166');
      return;
    }
    syncRunning = true;
    setSyncStatus('Conectando ao servidor…');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try { await request('/api/health', { signal: controller.signal }); }
      finally { clearTimeout(timeout); }

      for (const unit of ['matriz', 'filial']) {
        await migrateLocalInventory(unit);
        await migrateLocalCounts(unit);
      }

      let pending = readPending();
      const pendingEntries = Object.entries(pending).sort(([, a], [, b]) => Number(b.type === 'inventoryDeletes') - Number(a.type === 'inventoryDeletes'));
      for (const [key, entry] of pendingEntries) {
        if (entry.type === 'inventoryDeletes' && !isAdmin()) continue;
        if (entry.type === 'purchases' && entry.unit !== window.currentUser.id) continue;
        if (entry.type === 'purchaseDeletes' && entry.unit !== window.currentUser.id) continue;
        if (entry.type === 'purchases') {
          await request('/api/purchase-requests', { method: 'POST', body: JSON.stringify({ items: entry.items }) });
        } else if (entry.type === 'purchaseDeletes') {
          for (const row of entry.items) await request(`/api/purchase-requests/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
        } else if (entry.type === 'inventoryDeletes') {
          for (const row of entry.items) await request(`/api/inventory/${encodeURIComponent(entry.unit)}/products/remove`, { method: 'DELETE', body: JSON.stringify(row) });
        } else {
          const endpoint = entry.type === 'inventory' ? 'inventory' : 'counts';
          await request(`/api/${endpoint}/${entry.unit}`, { method: 'PUT', body: JSON.stringify({ items: entry.items }) });
        }
        pending = readPending();
        if (pending[key]?.updatedAt === entry.updatedAt) {
          delete pending[key];
      try { localStorage.setItem(pendingKey, JSON.stringify(pending)); }
      catch { try { localStorage.removeItem("mf_autosave_v2_snapshot"); localStorage.setItem(pendingKey, JSON.stringify(pending)); } catch { setSyncStatus("Alteração salva no servidor; liberando espaço local", "#ffd166"); } }
        }
      }
      retrySync = false;
      setSyncStatus('Online • dados sincronizados', '#8af0b2');
      loadInventory(currentTab).catch(() => { retrySync = true; });
      loadCounts(countLocation).catch(() => { retrySync = true; });
      if (typeof window.loadPurchaseRequests === 'function') window.loadPurchaseRequests();
    } catch {
      retrySync = true;
      setSyncStatus(navigator.onLine ? 'Servidor indisponível; alterações salvas neste dispositivo' : 'Offline; alterações salvas neste dispositivo', '#ffd166');
    } finally {
      syncRunning = false;
      if (hasSyncablePending() && navigator.onLine) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(syncPending, 3000);
      }
    }
  }
  function normalizeInventory(unit, saved) {
    const source = unit === 'matriz' ? original : originalFilial;
    const sourceById = new Map(source.map(row => [id(row), row]));
    return saved.map(row => ({ ...(sourceById.get(id(row)) || {}), ...row }));
  }
  function normalizeCounts(unit, inventory, saved) {
    const savedById = new Map();
    saved.forEach(row => {
      const key = id(row);
      if (!savedById.has(key)) savedById.set(key, []);
      savedById.get(key).push(row);
    });
    const rows = inventory.map(row => {
      const matches = savedById.get(id(row));
      return matches?.length ? matches.shift() : { codigo: row.codigo, item: row.item, sistema: 0, contagem: '' };
    });
    return rows;
  }

  async function migrateLocalInventory(unit) {
    const flag = `mf_prisma_inventory_migrated_${unit}_v1`;
    if (localStorage.getItem(flag)) return;
    // Never let a new device replace data already shared by the server with its local snapshot.
    const shared = await request(`/api/inventory/${unit}`);
    if (shared.length) {
      localStorage.setItem(flag, '1');
      return;
    }
    const saved = JSON.parse(localStorage.getItem(inventoryKey(unit)) || 'null');
    if (!Array.isArray(saved)) {
      localStorage.setItem(flag, '1');
      return;
    }
    const source = unit === 'matriz' ? original : originalFilial;
    const other = unit === 'matriz' ? originalFilial : original;
    const sourceIds = new Set(source.map(id));
    const otherIds = new Set(other.map(id));
    const savedById = new Map(saved.map(row => [id(row), row]));
    const items = source.map(row => ({ ...row, ...(savedById.get(id(row)) || {}) }));
    savedById.forEach((row, key) => { if (!sourceIds.has(key) && !otherIds.has(key)) items.push(row); });
    await request(`/api/inventory/${unit}`, { method: 'PUT', body: JSON.stringify({ items }) });
    localStorage.setItem(flag, '1');
  }
  async function migrateLocalCounts(unit) {
    const flag = `mf_prisma_counts_migrated_${unit}_v1`;
    if (localStorage.getItem(flag)) return;
    const shared = await request(`/api/counts/${unit}`);
    if (shared.some(row => row.contagem !== '' || Number(row.sistema) !== 0)) {
      localStorage.setItem(flag, '1');
      return;
    }
    const saved = JSON.parse(localStorage.getItem(countKey(unit)) || 'null');
    if (!Array.isArray(saved) || !saved.length) {
      localStorage.setItem(flag, '1');
      return;
    }
    const other = unit === 'matriz' ? originalFilial : original;
    const current = unit === 'matriz' ? original : originalFilial;
    const currentIds = new Set(current.map(id));
    const otherIds = new Set(other.map(id));
    const items = saved.filter(row => currentIds.has(id(row)) || !otherIds.has(id(row)));
    await request(`/api/counts/${unit}`, { method: 'PUT', body: JSON.stringify({ items }) });
    localStorage.setItem(flag, '1');
  }
  async function loadInventory(unit) {
    await migrateLocalInventory(unit);
    const storedItems = await request(`/api/inventory/${unit}`);
    if (unit !== currentTab) return;
    const items = normalizeInventory(unit, storedItems);
    const needsRepair = items.length !== storedItems.length || items.some((row, index) => row.codigo !== storedItems[index]?.codigo || row.item !== storedItems[index]?.item || row.prateleira !== storedItems[index]?.prateleira);
    data = items.map(({ codigo, item, prateleira }) => ({ codigo, item, prateleira: prateleira || '' }));
    localStorage.setItem(inventoryKey(unit), JSON.stringify(data));
    render();
    if (needsRepair) enqueue('inventory', unit, data);
  }
  async function loadCounts(unit) {
    await migrateLocalCounts(unit);
    const [storedInventory, storedCounts] = await Promise.all([
      request(`/api/inventory/${unit}`),
      request(`/api/counts/${unit}`)
    ]);
    const inventory = normalizeInventory(unit, storedInventory);
    const items = normalizeCounts(unit, inventory, storedCounts);
    if (unit !== countLocation) return;
    const inventoryChanged = inventory.length !== storedInventory.length || inventory.some((row, index) => row.codigo !== storedInventory[index]?.codigo || row.item !== storedInventory[index]?.item || row.prateleira !== storedInventory[index]?.prateleira);
    if (inventoryChanged) enqueue('inventory', unit, inventory);
    localStorage.setItem(inventoryKey(unit), JSON.stringify(inventory));
    localStorage.setItem(countKey(unit), JSON.stringify(items));
    renderCount();
    const countsChanged = items.length !== storedCounts.length || items.some((row, index) => row.codigo !== storedCounts[index]?.codigo || row.item !== storedCounts[index]?.item || row.sistema !== storedCounts[index]?.sistema || row.contagem !== storedCounts[index]?.contagem);
    if (countsChanged) enqueue('counts', unit, items);
  }

  async function refreshSharedData() {
    if (!window.currentUser || !navigator.onLine || refreshRunning || hasSyncablePending()) return;
    refreshRunning = true;
    try {
      const tasks = [loadInventory(currentTab)];
      tasks.push(loadCounts(countLocation));
      if (document.getElementById('purchaseView')?.classList.contains('show') && typeof window.loadPurchaseRequests === 'function') tasks.push(window.loadPurchaseRequests());
      await Promise.all(tasks);
    } catch {
      retrySync = true;
    } finally {
      refreshRunning = false;
    }
  }

  const originalSwitchTab = window.switchTab;
  window.switchTab = function(unit) {
    originalSwitchTab(unit);
    loadInventory(unit).catch(() => {});
  };
  const originalPersist = window.persist;
  window.persist = function() {
    originalPersist();
    enqueue('inventory', currentTab, data);
  };
  const originalReset = window.resetData;
  window.resetData = function() {
    originalReset();
    setTimeout(() => enqueue('inventory', currentTab, data), 0);
  };
  const originalSwitchCount = window.switchCountLocation;
  window.switchCountLocation = function(unit) {
    originalSwitchCount(unit);
    loadCounts(unit).catch(() => {});
  };
  const originalSetCounts = window.setCounts;
  window.setCounts = function(items) {
    originalSetCounts(items);
    const unit = countLocation;
    enqueue('counts', unit, items);
  };
  window.addEventListener('online', syncPending);
  window.addEventListener('offline', () => setSyncStatus('Offline; alterações salvas neste dispositivo', '#ffd166'));
  window.addEventListener('storage', event => {
    if (event.key === pendingKey && navigator.onLine) syncPending();
  });
  window.addEventListener('load', () => {
    syncPending().finally(() => {
      loadInventory(currentTab).catch(() => { retrySync = true; });
      loadCounts(countLocation).catch(() => { retrySync = true; });
    });
    setInterval(() => {
      if (retrySync || hasSyncablePending()) syncPending();
      else refreshSharedData();
    }, 5000);
  });
  window.addEventListener('mf:authenticated', () => {
    syncPending().finally(() => {
      loadInventory(currentTab).catch(() => { retrySync = true; });
      loadCounts(countLocation).catch(() => { retrySync = true; });
      if (typeof window.loadPurchaseRequests === 'function') window.loadPurchaseRequests();
    });
  });
  window.queuePurchaseRequests = items => enqueue('purchases', window.currentUser?.id || 'guest', items);
  window.queuePurchaseDeletions = ids => enqueue('purchaseDeletes', window.currentUser?.id || 'guest', ids.map(id => ({ id })));
  window.queueInventoryDeletion = (unit, product, remainingItems) => {
    enqueue('inventoryDeletes', unit, [{ codigo: product.codigo, item: product.item }]);
    enqueue('inventory', unit, remainingItems);
  };
  window.saveInventoryOnline = async (unit, items) => {
    if (!navigator.onLine || !window.currentUser) return false;
    for (let attempt = 0; syncRunning && attempt < 120; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
    if (syncRunning) throw new Error('A sincronização anterior ainda está em andamento.');
    clearTimeout(syncTimer);
    syncTimer = null;
    await request(`/api/inventory/${encodeURIComponent(unit)}`, { method: 'PUT', body: JSON.stringify({ items }) });
    const pending = readPending();
    const key = `inventory_${unit}`;
    if (pending[key]?.type === 'inventory' && JSON.stringify(pending[key].items) === JSON.stringify(items)) {
      delete pending[key];
      try { localStorage.setItem(pendingKey, JSON.stringify(pending)); }
      catch { try { localStorage.removeItem("mf_autosave_v2_snapshot"); localStorage.setItem(pendingKey, JSON.stringify(pending)); } catch { setSyncStatus("Alteração salva no servidor; liberando espaço local", "#ffd166"); } }
    }
    retrySync = Object.keys(readPending()).length > 0;
    setSyncStatus('Online • dados sincronizados', '#8af0b2');
    if (hasSyncablePending()) syncPending();
    return true;
  };
  window.persistInventoryUnit = async (unit, items) => {
    localStorage.setItem(inventoryKey(unit), JSON.stringify(items));
    if (navigator.onLine && window.currentUser) {
      try { return await window.saveInventoryOnline(unit, items); }
      catch { enqueue('inventory', unit, items); return false; }
    }
    enqueue('inventory', unit, items);
    return false;
  };
  window.flushCountSync = async unit => {
    if (!window.currentUser || !navigator.onLine) return false;
    const keys = [`counts_${unit}`, `inventory_${unit}`];
    for (let attempt = 0; attempt < 120; attempt++) {
      const pending = readPending();
      if (keys.every(key => !pending[key])) return true;
      if (!syncRunning) await syncPending();
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const pending = readPending();
    return keys.every(key => !pending[key]);
  };
  window.syncNow = syncPending;
  window.addEventListener('focus', refreshSharedData);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshSharedData();
  });
})();
