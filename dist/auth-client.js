(() => {
  const sessionKey = 'mf_auth_user_v1';
  const logoutKey = 'mf_auth_logged_out_v1';
  const sessionLifetime = 12 * 60 * 60 * 1000;

  function readSavedSession() {
    try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); }
    catch { return null; }
  }
  function setMessage(message) {
    const el = document.getElementById('loginError');
    if (el) el.textContent = message || '';
  }
  function applyUser(user, verifiedAt = Date.now()) {
    window.currentUser = user;
    if (typeof window.configurePurchaseAccess === 'function') window.configurePurchaseAccess();
    window.purchaseRequestRows = [];
    localStorage.setItem(sessionKey, JSON.stringify({ user, verifiedAt }));
    document.getElementById('loginScreen').hidden = true;
    document.getElementById('authIdentity').hidden = false;
    document.getElementById('authIdentity').textContent = `${user.nome} • ${user.role === 'admin' ? 'Administrador' : 'Usuário'}`;
    document.getElementById('logoutButton').hidden = false;
    const admin = user.role === 'admin';
    const normalizedName = String(user.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const isKevin = admin && (user.accountKey === 'kevin' || String(user.username || '').toLowerCase() === 'kevin01' || normalizedName.startsWith('kevin'));
    ['headerBackup', 'headerRestore'].forEach(id => { document.getElementById(id).hidden = !admin; });
    document.getElementById('headerExport').hidden = !admin;
    document.getElementById('appSettingsMenuButton').hidden = !isKevin;
    const requester = document.getElementById('purchaseRequester');
    if (requester) { requester.value = user.nome; requester.readOnly = true; }
    document.body.dataset.role = user.role;
    window.dispatchEvent(new Event('mf:authenticated'));
  }
  window.refreshAuthenticatedUser = user => applyUser(user);
  function showLogin(message = '') {
    window.currentUser = null;
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('authIdentity').hidden = true;
    document.getElementById('logoutButton').hidden = true;
    document.body.dataset.role = '';
    setMessage(message);
  }

  window.submitLogin = async event => {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage('Validando acesso…');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.');
      document.getElementById('loginPassword').value = '';
      localStorage.removeItem(logoutKey);
      applyUser(result.user);
    } catch (error) {
      setMessage(error.message === 'Failed to fetch' ? 'Servidor indisponível. Conecte-se ao servidor para entrar.' : error.message);
    } finally { button.disabled = false; }
  };

  window.logoutApp = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { }
    localStorage.removeItem(sessionKey);
    localStorage.setItem(logoutKey, '1');
    showLogin('Sessão encerrada.');
  };

  async function restoreSession() {
    if (window.location.protocol === 'file:' || ['localhost','127.0.0.1'].includes(window.location.hostname) || new URLSearchParams(window.location.search).has('sem-login')) {
      applyUser({ username: 'kevin01', nome: 'Kevin', role: 'admin', accountKey: 'kevin' });
      return;
    }
    if (localStorage.getItem(logoutKey)) { showLogin(); return; }
    const saved = readSavedSession();
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (response.ok) {
        const result = await response.json();
        applyUser(result.user);
        return;
      }
      if (response.status === 401) {
        localStorage.removeItem(sessionKey);
        showLogin();
        return;
      }
    } catch { }
    if (saved?.user && Date.now() - saved.verifiedAt < sessionLifetime) applyUser(saved.user, saved.verifiedAt);
    else showLogin('Conecte-se ao servidor para validar seu acesso.');
  }

  async function refreshProfile() {
    if (!navigator.onLine || !window.currentUser) return;
    try {
      const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (response.status === 401) { window.dispatchEvent(new Event('mf:session-expired')); return; }
      if (!response.ok) return;
      const { user } = await response.json();
      const current = window.currentUser;
      if (user && (user.nome !== current.nome || user.username !== current.username || user.accountKey !== current.accountKey)) applyUser(user);
    } catch { }
  }

  window.addEventListener('load', restoreSession);
  window.addEventListener('online', restoreSession);
  window.setInterval(refreshProfile, 15000);
  window.addEventListener('mf:session-expired', () => {
    localStorage.removeItem(sessionKey);
    localStorage.removeItem(logoutKey);
    showLogin('Sua sessão expirou. Entre novamente.');
  });
})();
