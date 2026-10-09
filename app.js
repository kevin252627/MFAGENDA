const STORAGE_KEY = 'maira-management-v1';

const icons = { clients: '♙', stock: '▦', agenda: '▤' };
const initialData = {
  clients: [
    { id: 'c1', name: 'Camila Rodrigues', phone: '(11) 99934-8210', email: 'camila.r@email.com', since: '2026-04-12', notes: '' },
    { id: 'c2', name: 'Isabela Martins', phone: '(11) 99781-3045', email: 'isabela.m@email.com', since: '2026-03-28', notes: '' },
    { id: 'c3', name: 'Mariana Costa', phone: '(11) 99124-6673', email: 'mariana.c@email.com', since: '2026-02-17', notes: '' },
    { id: 'c4', name: 'Laura Fernandes', phone: '(11) 98930-1157', email: 'laura.f@email.com', since: '2026-01-09', notes: '' }
  ],
  stock: [
    { id: 's1', name: 'Óleo essencial de lavanda', category: 'Óleos e essências', quantity: 3, minimum: 5, price: 42.9, unit: 'un.' },
    { id: 's2', name: 'Máscara hidratante', category: 'Tratamentos', quantity: 8, minimum: 3, price: 68, unit: 'un.' },
    { id: 's3', name: 'Creme nutritivo', category: 'Cuidados pessoais', quantity: 2, minimum: 4, price: 56.5, unit: 'un.' },
    { id: 's4', name: 'Óleo de amêndoas', category: 'Óleos e essências', quantity: 12, minimum: 4, price: 35, unit: 'un.' }
  ],
  appointments: [
    { id: 'a1', clientId: 'c1', service: 'Limpeza de pele', date: localDate(), time: '09:00', status: 'Confirmado', notes: '' },
    { id: 'a2', clientId: 'c2', service: 'Massagem relaxante', date: localDate(), time: '10:30', status: 'Confirmado', notes: '' },
    { id: 'a3', clientId: 'c3', service: 'Tratamento facial', date: localDate(), time: '13:00', status: 'Pendente', notes: '' },
    { id: 'a4', clientId: 'c4', service: 'Design de sobrancelhas', date: localDate(), time: '15:30', status: 'Confirmado', notes: '' }
  ]
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(initialData);
    const parsed = JSON.parse(saved);
    if (!parsed || !Array.isArray(parsed.clients) || !Array.isArray(parsed.stock) || !Array.isArray(parsed.appointments)) {
      throw new Error('O formato dos dados salvos não é válido.');
    }
    return parsed;
  } catch (error) {
    console.error('Não foi possível carregar os dados salvos.', error);
    showToast('Não foi possível carregar os dados salvos. Confira o armazenamento do navegador.');
    return structuredClone(initialData);
  }
}

let data = loadData();
let currentPage = 'inicio';
let editRecord = null;

const pageNames = { inicio: 'Início', clientes: 'Clientes', estoque: 'Estoque', agenda: 'Agenda' };
const pageConfig = {
  clientes: { collection: 'clients', title: 'clientes', heading: 'Seus clientes, sempre por perto.', singular: 'cliente', add: 'Adicionar cliente' },
  estoque: { collection: 'stock', title: 'estoque', heading: 'Tudo em seu devido lugar.', singular: 'produto', add: 'Adicionar produto' },
  agenda: { collection: 'appointments', title: 'agenda', heading: 'Um dia de cada vez.', singular: 'agendamento', add: 'Novo agendamento' }
};
const pageDetails = {
  inicio: {
    eyebrow: 'QUINTA-FEIRA, 9 DE OUTUBRO',
    title: 'Seu espaço, no seu ritmo.',
    subtitle: 'Um panorama tranquilo para começar bem o dia.'
  },
  clientes: { eyebrow: 'SEU CANTINHO DE CUIDADO', subtitle: 'Cada bom encontro começa com uma boa conexão.' },
  estoque: { eyebrow: 'CUIDANDO DOS DETALHES', subtitle: 'Acompanhe seus produtos e mantenha tudo em dia.' },
  agenda: { eyebrow: 'SEU DIA, BEM ORGANIZADO', subtitle: 'Seus horários e cada encontro, em um só lugar.' }
};

const html = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const currency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
const formatDate = (value, options = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(`${value}T12:00:00`));
};
const clientFor = (id) => data.clients.find((client) => client.id === id);
const appointmentsToday = () => data.appointments
  .filter((appointment) => appointment.date === localDate())
  .sort((a, b) => a.time.localeCompare(b.time));
const lowStock = () => data.stock.filter((product) => Number(product.quantity) <= Number(product.minimum));
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
const clientName = (appointment) => clientFor(appointment.clientId)?.name || 'Cliente não encontrado';

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.append(toast);
  window.setTimeout(() => toast.remove(), 3300);
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Não foi possível salvar os dados.', error);
    showToast('Não foi possível salvar. Verifique o espaço disponível no navegador.');
    return false;
  }
}

function navigate(page) {
  if (!pageNames[page]) return;
  currentPage = page;
  document.querySelectorAll('.page-view').forEach((section) => section.classList.toggle('active', section.id === `page-${page}`));
  document.querySelectorAll('.nav-link').forEach((link) => link.classList.toggle('active', link.dataset.page === page));
  document.getElementById('breadcrumb-page').textContent = pageNames[page];
  document.getElementById('sidebar').classList.remove('open');
  renderCurrentPage();
}

function renderWelcome(page, action = '') {
  const details = pageDetails[page];
  const heading = page === 'inicio' ? details.title : pageConfig[page].heading;
  const dateText = page === 'inicio'
    ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()
    : details.eyebrow;
  return `<div class="welcome-row">
    <div><div class="welcome-eyebrow">${html(dateText)}</div><h1>${html(heading)}</h1><p class="welcome-subtitle">${html(details.subtitle)}</p></div>
    ${action ? `<button class="button button-primary" data-action="add" data-type="${html(action)}">${html(pageConfig[action].add)} <span>+</span></button>` : ''}
  </div>`;
}

function renderAppointmentRow(appointment, index = 0) {
  const client = clientFor(appointment.clientId);
  const status = appointment.status === 'Pendente' ? 'pending' : '';
  return `<div class="appointment-row">
    <span class="appointment-time">${html(appointment.time)}</span>
    <span class="appointment-line ${['', 'purple', 'orange', ''][index % 4]}"></span>
    <div class="appointment-person"><div class="mini-avatar alt-${index % 4}">${html(initials(client?.name))}</div>
      <div class="person-info"><strong>${html(client?.name || 'Cliente não encontrado')}</strong><span>${html(appointment.service)}</span></div>
    </div>
    <span class="appointment-status ${status}">${html(appointment.status)}</span>
  </div>`;
}

function renderHome() {
  const today = appointmentsToday();
  const warnings = lowStock();
  document.getElementById('page-inicio').innerHTML = `${renderWelcome('inicio')}
    <div class="overview-grid">
      <article class="stat-card"><div class="stat-top">Clientes cadastradas <span class="stat-icon purple">${icons.clients}</span></div><div class="stat-value">${data.clients.length}</div><div class="stat-foot">Pessoas especiais por aqui</div></article>
      <article class="stat-card"><div class="stat-top">Agendamentos de hoje <span class="stat-icon green">${icons.agenda}</span></div><div class="stat-value">${today.length}</div><div class="stat-foot">${today.filter((a) => a.status === 'Confirmado').length} encontros confirmados</div></article>
      <article class="stat-card"><div class="stat-top">Produtos no estoque <span class="stat-icon orange">${icons.stock}</span></div><div class="stat-value">${data.stock.length}</div><div class="stat-foot">Produtos cadastrados</div></article>
      <article class="stat-card"><div class="stat-top">Atenção ao estoque <span class="stat-icon ${warnings.length ? 'red' : 'green'}">!</span></div><div class="stat-value">${warnings.length}</div><div class="stat-foot">${warnings.length ? 'Produtos precisam de reposição' : 'Tudo abastecido por aqui'}</div></article>
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-heading"><div><div class="panel-title"><span class="heading-glyph">◷</span> Próximos encontros</div><div class="panel-subtitle">${today.length ? 'Sua agenda de hoje, com carinho.' : 'Um bom dia para abrir novos horários.'}</div></div><button class="text-link" data-page="agenda">Ver agenda →</button></div>
        <div class="appointment-list">${today.length ? today.map(renderAppointmentRow).join('') : emptyState('Nenhum agendamento para hoje', 'Quando marcar um encontro, ele aparece aqui.')}</div>
      </section>
      <section class="panel">
        <div class="panel-heading"><div><div class="panel-title"><span class="heading-glyph">✳</span> Atalhos do dia</div><div class="panel-subtitle">O que você gostaria de organizar?</div></div></div>
        <div class="quick-actions">
          <button class="quick-action" data-action="add" data-type="clientes"><span class="quick-icon purple">${icons.clients}</span><span class="quick-info"><strong>Novo cliente</strong><span>Boas-vindas a alguém especial</span></span><span class="quick-chevron">›</span></button>
          <button class="quick-action" data-action="add" data-type="estoque"><span class="quick-icon orange">${icons.stock}</span><span class="quick-info"><strong>Adicionar produto</strong><span>Seu estoque sempre em ordem</span></span><span class="quick-chevron">›</span></button>
          <button class="quick-action" data-action="add" data-type="agenda"><span class="quick-icon">${icons.agenda}</span><span class="quick-info"><strong>Agendar horário</strong><span>Organize seu próximo encontro</span></span><span class="quick-chevron">›</span></button>
        </div>
        ${warnings.length ? `<div class="stock-alert"><span class="alert-icon">!</span><div><strong>Olho no estoque</strong><p>${warnings.map((product) => html(product.name)).join(', ')} ${warnings.length === 1 ? 'está' : 'estão'} chegando ao fim.</p><button class="text-link" data-page="estoque">Conferir estoque →</button></div></div>` : ''}
      </section>
    </div>`;
}

function emptyState(title, message) {
  return `<div class="empty-state"><strong>${html(title)}</strong>${html(message)}</div>`;
}

function renderTablePage(page) {
  const config = pageConfig[page];
  const section = document.getElementById(`page-${page}`);
  section.innerHTML = `${renderWelcome(page, page)}
    <div class="section-toolbar">
      <div><h2>${page === 'agenda' ? 'Todos os agendamentos' : page === 'estoque' ? 'Seus produtos' : 'Todos os clientes'}</h2><div class="panel-subtitle">${page === 'agenda' ? 'Confira e acompanhe seus horários.' : page === 'estoque' ? 'Um inventário simples, sempre atualizado.' : 'Suas conexões especiais, em um só lugar.'}</div></div>
      <div class="toolbar-actions">
        <label class="search-box"><span>⌕</span><input type="search" data-search="${page}" placeholder="${page === 'clientes' ? 'Buscar cliente...' : page === 'estoque' ? 'Buscar produto...' : 'Buscar agendamento...'}" aria-label="Buscar ${html(config.title)}"></label>
        ${page === 'agenda' ? `<select class="filter-select" data-filter="agenda" aria-label="Filtrar por data"><option value="todos">Todas as datas</option><option value="hoje">Hoje</option><option value="futuros">Próximos dias</option><option value="passados">Anteriores</option></select>` : ''}
      </div>
    </div>
    <section class="panel data-panel" id="table-${page}"></section>`;
  renderTableRows(page);
}

function renderTableRows(page) {
  const container = document.getElementById(`table-${page}`);
  if (!container) return;
  const query = document.querySelector(`[data-search="${page}"]`)?.value.trim().toLocaleLowerCase('pt-BR') || '';
  const dateFilter = document.querySelector('[data-filter="agenda"]')?.value || 'todos';
  const config = pageConfig[page];
  let entries = data[config.collection];

  if (page === 'clientes') {
    entries = entries.filter((client) => `${client.name} ${client.phone} ${client.email}`.toLocaleLowerCase('pt-BR').includes(query));
    container.innerHTML = entries.length ? `
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>CLIENTE</th><th>TELEFONE</th><th>E-MAIL</th><th>DESDE</th><th>AÇÕES</th></tr></thead>
      <tbody>${entries.map((client, index) => `<tr>
        <td><div class="table-person"><div class="mini-avatar alt-${index % 4}">${html(initials(client.name))}</div><div class="person-info"><strong>${html(client.name)}</strong><span>${html(client.notes || 'Cliente especial')}</span></div></div></td>
        <td>${html(client.phone)}</td><td>${html(client.email || '—')}</td><td>${html(formatDate(client.since))}</td><td>${renderActions('clientes', client.id)}</td>
      </tr>`).join('')}</tbody></table></div>${tableFooter(entries.length, 'cliente')}`
      : emptyState(query ? 'Nenhum cliente encontrado' : 'Sua lista está esperando por você', query ? 'Tente buscar por outro nome ou telefone.' : 'Cadastre seu primeiro cliente para começar.');
  } else if (page === 'estoque') {
    entries = entries.filter((product) => `${product.name} ${product.category}`.toLocaleLowerCase('pt-BR').includes(query));
    container.innerHTML = entries.length ? `
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>PRODUTO</th><th>CATEGORIA</th><th>QUANTIDADE</th><th>MÍNIMO</th><th>VALOR UNITÁRIO</th><th>AÇÕES</th></tr></thead>
      <tbody>${entries.map((product) => {
        const quantity = Number(product.quantity);
        const minimum = Number(product.minimum);
        const badge = quantity <= minimum ? (quantity === 0 ? 'danger' : 'warning') : '';
        const label = quantity === 0 ? 'Sem estoque' : quantity <= minimum ? 'Reposição' : 'Em estoque';
        return `<tr><td><div class="person-info"><strong>${html(product.name)}</strong><span>Unidade: ${html(product.unit || 'un.')}</span></div></td>
          <td>${html(product.category)}</td><td><span class="badge ${badge}">${quantity} ${html(product.unit || 'un.')} · ${label}</span></td>
          <td>${minimum} ${html(product.unit || 'un.')}</td><td>${currency(product.price)}</td><td>${renderActions('estoque', product.id)}</td></tr>`;
      }).join('')}</tbody></table></div>${tableFooter(entries.length, 'produto')}`
      : emptyState(query ? 'Nenhum produto encontrado' : 'Seu estoque está esperando por você', query ? 'Tente buscar por outro produto ou categoria.' : 'Cadastre seu primeiro produto para começar.');
  } else {
    entries = entries.filter((appointment) => {
      const date = appointment.date;
      const today = localDate();
      const matchesFilter = dateFilter === 'todos' || (dateFilter === 'hoje' && date === today)
        || (dateFilter === 'futuros' && date > today) || (dateFilter === 'passados' && date < today);
      const details = `${clientName(appointment)} ${appointment.service} ${appointment.status}`.toLocaleLowerCase('pt-BR');
      return matchesFilter && details.includes(query);
    }).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    container.innerHTML = entries.length ? `
      <div class="data-table-wrap"><table class="data-table"><thead><tr><th>CLIENTE</th><th>SERVIÇO</th><th>DATA</th><th>HORÁRIO</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
      <tbody>${entries.map((appointment, index) => {
        const badge = appointment.status === 'Pendente' ? 'warning' : appointment.status === 'Cancelado' ? 'danger' : '';
        const client = clientFor(appointment.clientId);
        return `<tr><td><div class="table-person"><div class="mini-avatar alt-${index % 4}">${html(initials(client?.name))}</div><div class="person-info"><strong>${html(client?.name || 'Cliente não encontrado')}</strong></div></div></td>
          <td>${html(appointment.service)}</td><td>${html(formatDate(appointment.date))}</td><td>${html(appointment.time)}</td>
          <td><span class="badge ${badge}">${html(appointment.status)}</span></td><td>${renderActions('agenda', appointment.id)}</td></tr>`;
      }).join('')}</tbody></table></div>${tableFooter(entries.length, 'agendamento')}`
      : emptyState(query || dateFilter !== 'todos' ? 'Nenhum horário encontrado' : 'Sua agenda está esperando por você', query || dateFilter !== 'todos' ? 'Tente alterar sua busca ou selecionar outra data.' : 'Organize seu primeiro encontro para começar.');
  }
}

function tableFooter(count, label) {
  return `<div class="table-footer"><span>${count} ${label}${count === 1 ? '' : 's'}${count === 1 ? '' : ''} encontrado${count === 1 ? '' : 's'}</span><span>Exibindo todos os registros</span></div>`;
}

function renderActions(type, id) {
  return `<div class="row-actions"><button class="small-action" data-action="edit" data-type="${type}" data-id="${html(id)}" aria-label="Editar registro">Editar</button><button class="small-action delete" data-action="delete" data-type="${type}" data-id="${html(id)}" aria-label="Excluir registro">Excluir</button></div>`;
}

function renderAgendaPage() {
  renderTablePage('agenda');
  const total = data.appointments.length;
  const confirmed = data.appointments.filter((appointment) => appointment.status === 'Confirmado').length;
  const pending = data.appointments.filter((appointment) => appointment.status === 'Pendente').length;
  document.querySelector('#page-agenda .section-toolbar').insertAdjacentHTML('beforebegin', `
    <div class="panel agenda-summary">
      <div class="agenda-summary-item"><span class="summary-dot"></span><strong>${total}</strong> agendamento${total === 1 ? '' : 's'}</div>
      <div class="agenda-summary-item"><span class="summary-dot"></span><strong>${confirmed}</strong> confirmad${confirmed === 1 ? 'o' : 'os'}</div>
      <div class="agenda-summary-item"><span class="summary-dot pending"></span><strong>${pending}</strong> pendente${pending === 1 ? '' : 's'}</div>
    </div>`);
}

function renderCurrentPage() {
  if (currentPage === 'inicio') renderHome();
  else if (currentPage === 'agenda') renderAgendaPage();
  else renderTablePage(currentPage);
  document.getElementById('customer-count').textContent = String(data.clients.length);
}

function field(label, name, type, value = '', options = {}) {
  const required = options.required !== false;
  const full = options.full ? ' full' : '';
  const attributes = `${required ? 'required' : ''} ${options.min !== undefined ? `min="${html(options.min)}"` : ''} ${options.step ? `step="${html(options.step)}"` : ''} ${options.placeholder ? `placeholder="${html(options.placeholder)}"` : ''}`;
  let control;
  if (type === 'select') {
    const choices = options.values || [];
    control = `<select name="${name}" ${required ? 'required' : ''}>${choices.map(([choice, text]) => `<option value="${html(choice)}" ${value === choice ? 'selected' : ''}>${html(text)}</option>`).join('')}</select>`;
  } else if (type === 'textarea') {
    control = `<textarea name="${name}" ${required ? 'required' : ''} ${attributes}>${html(value)}</textarea>`;
  } else {
    control = `<input name="${name}" type="${type}" value="${html(value)}" ${attributes}>`;
  }
  return `<div class="form-field${full}"><label for="field-${name}">${html(label)}</label>${control.replace(`<${type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input'}`, `<${type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input'} id="field-${name}"`)}</div>`;
}

function getFields(type, record = {}) {
  if (type === 'clientes') return [
    field('Nome completo', 'name', 'text', record.name, { full: true, placeholder: 'Ex.: Ana da Silva' }),
    field('Telefone', 'phone', 'tel', record.phone, { placeholder: '(11) 99999-9999' }),
    field('E-mail', 'email', 'email', record.email, { required: false, placeholder: 'ana@email.com' }),
    field('Data de cadastro', 'since', 'date', record.since || localDate()),
    field('Observações', 'notes', 'textarea', record.notes, { required: false, full: true, placeholder: 'Alguma anotação importante?' })
  ].join('');
  if (type === 'estoque') return [
    field('Nome do produto', 'name', 'text', record.name, { full: true, placeholder: 'Ex.: Creme hidratante' }),
    field('Categoria', 'category', 'text', record.category, { placeholder: 'Ex.: Cuidados pessoais' }),
    field('Unidade', 'unit', 'select', record.unit || 'un.', { values: [['un.', 'Unidade'], ['ml', 'Mililitros (ml)'], ['g', 'Gramas (g)'], ['cx.', 'Caixas']] }),
    field('Quantidade atual', 'quantity', 'number', record.quantity ?? 0, { min: 0, step: '1' }),
    field('Estoque mínimo', 'minimum', 'number', record.minimum ?? 1, { min: 0, step: '1' }),
    field('Valor unitário (R$)', 'price', 'number', record.price ?? 0, { min: 0, step: '0.01' })
  ].join('');
  const choices = data.clients.length
    ? data.clients.map((client) => [client.id, client.name])
    : [['', 'Cadastre um cliente primeiro']];
  return [
    field('Cliente', 'clientId', 'select', record.clientId || '', { full: true, values: [['', 'Selecione um cliente'], ...choices], required: data.clients.length > 0 }),
    field('Serviço', 'service', 'text', record.service, { full: true, placeholder: 'Ex.: Massagem relaxante' }),
    field('Data', 'date', 'date', record.date || localDate()),
    field('Horário', 'time', 'time', record.time || '09:00'),
    field('Status', 'status', 'select', record.status || 'Confirmado', { values: [['Confirmado', 'Confirmado'], ['Pendente', 'Pendente'], ['Cancelado', 'Cancelado']] }),
    field('Observações', 'notes', 'textarea', record.notes, { required: false, full: true, placeholder: 'Uma observação para este encontro' })
  ].join('');
}

function openForm(type, id = null) {
  const collection = pageConfig[type].collection;
  editRecord = { type, id };
  const record = id ? data[collection].find((entry) => entry.id === id) : null;
  const dialog = document.getElementById('form-dialog');
  document.getElementById('dialog-eyebrow').textContent = id ? 'ATUALIZAR CADASTRO' : 'NOVO CADASTRO';
  document.getElementById('dialog-title').textContent = id ? 'Editar cadastro' : pageConfig[type].add;
  document.getElementById('dialog-submit').innerHTML = `${id ? 'Salvar alterações' : 'Salvar cadastro'} <span>↗</span>`;
  document.getElementById('form-fields').innerHTML = getFields(type, record);
  document.getElementById('dialog-submit').disabled = type === 'agenda' && !data.clients.length;
  dialog.showModal();
  dialog.querySelector('input, select, textarea')?.focus();
}

function handleSave(event) {
  event.preventDefault();
  if (!editRecord) return;
  const { type, id } = editRecord;
  const collection = pageConfig[type].collection;
  const formData = new FormData(event.currentTarget);
  const record = Object.fromEntries(formData.entries());
  if (!event.currentTarget.reportValidity()) return;
  if (type === 'estoque') {
    record.quantity = Number(record.quantity);
    record.minimum = Number(record.minimum);
    record.price = Number(record.price);
  }
  if (!id) record.id = `${type[0]}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (id) {
    const index = data[collection].findIndex((entry) => entry.id === id);
    if (index < 0) {
      showToast('Este registro não foi encontrado.');
      return;
    }
    data[collection][index] = { ...data[collection][index], ...record };
  } else {
    data[collection].push(record);
  }
  if (!saveData()) return;
  document.getElementById('form-dialog').close();
  editRecord = null;
  renderCurrentPage();
  showToast(`${pageConfig[type].singular[0].toUpperCase()}${pageConfig[type].singular.slice(1)} ${id ? 'atualizado' : 'adicionado'} com sucesso.`);
}

function deleteRecord(type, id) {
  const collection = pageConfig[type].collection;
  const record = data[collection].find((entry) => entry.id === id);
  if (!record) return;
  const name = type === 'agenda' ? `${record.service} — ${clientName(record)}` : record.name;
  if (!window.confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
  const previous = data[collection];
  data[collection] = previous.filter((entry) => entry.id !== id);
  if (!saveData()) {
    data[collection] = previous;
    return;
  }
  renderCurrentPage();
  showToast(`${pageConfig[type].singular[0].toUpperCase()}${pageConfig[type].singular.slice(1)} excluído com sucesso.`);
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!target) return;
  if (target.dataset.page) {
    navigate(target.dataset.page);
    return;
  }
  if (target.dataset.action === 'add') {
    if (target.dataset.type === 'agenda' && !data.clients.length) {
      showToast('Cadastre pelo menos um cliente antes de agendar.');
      navigate('clientes');
      return;
    }
    openForm(target.dataset.type);
  } else if (target.dataset.action === 'edit') openForm(target.dataset.type, target.dataset.id);
  else if (target.dataset.action === 'delete') deleteRecord(target.dataset.type, target.dataset.id);
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-search]')) renderTableRows(event.target.dataset.search);
});
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-filter="agenda"]')) renderTableRows('agenda');
});
document.getElementById('record-form').addEventListener('submit', handleSave);
document.getElementById('dialog-close').addEventListener('click', () => document.getElementById('form-dialog').close());
document.getElementById('dialog-cancel').addEventListener('click', () => document.getElementById('form-dialog').close());
document.getElementById('mobile-menu').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') document.getElementById('sidebar').classList.remove('open');
});

renderCurrentPage();
