/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULOS DO PAINEL — M&SM Advocacia
   ═══════════════════════════════════════════════════════════════════════════ */

const { sb, diffDias, fmtDate, fmtBRL, setDate,
        badgeHtml, statusBadge, escHtml, toast, filterTable,
        v, vd, vn, vi, set } = window.APP;
const { TIPOS_ACAO, DOCS_POR_KIT } = window.CATALOGOS;

/* ── AUTH GUARD ───────────────────────────────────────────────────────── */
let currentUser = null;
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) { window.location.href = '../index.html'; return; }
  currentUser = data.session.user;
  document.getElementById('user-email').textContent = currentUser.email;
  setDate();
  loadModule('dashboard');
})();

async function logout() {
  await sb.auth.signOut();
  window.location.href = '../index.html';
}
window.logout = logout;

/* ── NAVEGAÇÃO ────────────────────────────────────────────────────────── */
const titles = {
  dashboard:  'Dashboard · Prazos Próximos',
  'proc-adm': 'Processos Administrativos · INSS',
  'proc-jud': 'Processos Judiciais · INSS',
  'sal-mat':  'Salário-Maternidade',
  'aux-mor':  'Médicos Residentes · Auxílio-Moradia',
  'prazos-aux':'Prazos Judiciais · Auxílio-Moradia',
  cobrancas:  'Cobranças / Honorários',
};

function showModule(mod) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('mod-' + mod).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.getAttribute('onclick')?.includes(`'${mod}'`)) n.classList.add('active');
  });
  const t = titles[mod] || mod;
  const parts = t.split('·');
  document.getElementById('page-title').innerHTML =
    parts.length > 1
      ? escHtml(parts[0]) + '·<span>' + escHtml(parts[1]) + '</span>'
      : escHtml(t);
  loadModule(mod);
}
window.showModule = showModule;

const loaded = {};
function loadModule(mod) {
  if (loaded[mod]) return;
  loaded[mod] = true;
  switch(mod) {
    case 'dashboard':  loadDashboard(); break;
    case 'proc-adm':   loadAdm(); break;
    case 'proc-jud':   loadJud(); break;
    case 'sal-mat':    loadSal(); break;
    case 'aux-mor':    loadAux(); break;
    case 'prazos-aux': loadPraz(); break;
    case 'cobrancas':  loadCob(); break;
  }
}

/* ── DASHBOARD ────────────────────────────────────────────────────────── */
async function loadDashboard() {
  const [adm, jud, aux, sal, praz] = await Promise.all([
    sb.from('processos_administrativos').select('nome_cliente,proximo_prazo,status'),
    sb.from('processos_judiciais_inss').select('nome_cliente,data_proxima_audiencia,status'),
    sb.from('auxilio_moradia').select('nome_medico,proximo_prazo,status'),
    sb.from('salario_maternidade').select('nome_cliente,data_limite_pagamento,status_guia'),
    sb.from('prazos_judiciais_auxilio').select('cliente_medico,proximo_prazo,status'),
  ]);
  const allPrazos = [
    ...(adm.data||[]).map(r=>({ nome:r.nome_cliente, prazo:r.proximo_prazo, modulo:'Adm. INSS', status:r.status })),
    ...(jud.data||[]).map(r=>({ nome:r.nome_cliente, prazo:r.data_proxima_audiencia, modulo:'Jud. INSS', status:r.status })),
    ...(aux.data||[]).map(r=>({ nome:r.nome_medico, prazo:r.proximo_prazo, modulo:'Aux. Moradia', status:r.status })),
    ...(sal.data||[]).map(r=>({ nome:r.nome_cliente, prazo:r.data_limite_pagamento, modulo:'Sal. Mat.', status:r.status_guia })),
    ...(praz.data||[]).map(r=>({ nome:r.cliente_medico, prazo:r.proximo_prazo, modulo:'Prazos Aux.', status:r.status })),
  ].map(r => ({ ...r, dias: diffDias(r.prazo) }))
   .filter(r => r.prazo)
   .sort((a,b) => (a.dias??9999)-(b.dias??9999));

  let venc=0, urg=0, ate=0, ok=0;
  allPrazos.forEach(r => {
    if (r.dias < 0) venc++;
    else if (r.dias <= 3) urg++;
    else if (r.dias <= 7) ate++;
    else ok++;
  });

  document.getElementById('dash-vencidos').textContent = venc;
  document.getElementById('dash-urgentes').textContent = urg;
  document.getElementById('dash-atencao').textContent  = ate;
  document.getElementById('dash-ok').textContent       = ok;
  document.getElementById('dash-total').textContent    = allPrazos.length;

  const prox30 = allPrazos.filter(r => r.dias !== null && r.dias <= 30);
  const tbody = document.getElementById('dash-table-body');
  if (!prox30.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum prazo nos próximos 30 dias ✓</td></tr>';
    return;
  }
  tbody.innerHTML = prox30.map(r => `
    <tr>
      <td>${badgeHtml(r.dias)}</td>
      <td>${escHtml(r.nome)}</td>
      <td><span class="badge badge-azul">${escHtml(r.modulo)}</span></td>
      <td>${fmtDate(r.prazo)}</td>
      <td>${r.dias < 0 ? '<strong style="color:var(--vermelho)">'+r.dias+' dias</strong>' : r.dias + ' dias'}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('');
}

/* ── PROCESSOS ADMINISTRATIVOS ────────────────────────────────────────── */
let admData = [];
async function loadAdm() {
  const { data, error } = await sb.from('processos_administrativos').select('*').order('proximo_prazo', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar processos administrativos.', true); return; }
  admData = data || []; renderAdm();
}
function renderAdm() {
  const tbody = document.getElementById('adm-body');
  if (!admData.length) { tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Nenhum processo cadastrado ainda.</td></tr>'; return; }
  tbody.innerHTML = admData.map(r => {
    const dias = diffDias(r.proximo_prazo);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${escHtml(r.tipo_beneficio)||'—'}</td>
      <td>${escHtml(r.fase_atual)||'—'}</td>
      <td>${fmtDate(r.proximo_prazo)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('adm','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('adm','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── PROCESSOS JUDICIAIS INSS ─────────────────────────────────────────── */
let judData = [];
async function loadJud() {
  const { data, error } = await sb.from('processos_judiciais_inss').select('*').order('data_proxima_audiencia', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar.', true); return; }
  judData = data || []; renderJud();
}
function renderJud() {
  const tbody = document.getElementById('jud-body');
  if (!judData.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Nenhum processo cadastrado ainda.</td></tr>'; return; }
  tbody.innerHTML = judData.map(r => {
    const dias = diffDias(r.data_proxima_audiencia);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${escHtml(r.tipo_beneficio)||'—'}</td>
      <td>${escHtml(r.vara_tribunal)||'—'}</td>
      <td>${escHtml(r.fase_atual)||'—'}</td>
      <td>${fmtDate(r.data_proxima_audiencia)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('jud','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('jud','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── SALÁRIO-MATERNIDADE ──────────────────────────────────────────────── */
let salData = [];
async function loadSal() {
  const { data, error } = await sb.from('salario_maternidade').select('*').order('data_limite_pagamento', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar.', true); return; }
  salData = data || []; renderSal();
}
function renderSal() {
  const tbody = document.getElementById('sal-body');
  if (!salData.length) { tbody.innerHTML = '<tr><td colspan="13" class="empty-state">Nenhum registro cadastrado ainda.</td></tr>'; return; }
  tbody.innerHTML = salData.map(r => {
    const dias = diffDias(r.data_limite_pagamento);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${fmtDate(r.dpp)}</td>
      <td>${escHtml(r.tipo_salario_mat)||'—'}</td>
      <td>${fmtBRL(r.valor_mensal_beneficio)}</td>
      <td>${fmtDate(r.data_limite_pagamento)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status_guia)}</td>
      <td>${fmtBRL(r.honorario_total)}</td>
      <td>${statusBadge(r.status_honorario)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('sal','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('sal','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── AUXÍLIO-MORADIA ──────────────────────────────────────────────────── */
let auxData = [];
async function loadAux() {
  const { data, error } = await sb.from('auxilio_moradia').select('*').order('proximo_prazo', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar.', true); return; }
  auxData = data || []; renderAux();
}
function renderAux() {
  const tbody = document.getElementById('aux-body');
  if (!auxData.length) { tbody.innerHTML = '<tr><td colspan="12" class="empty-state">Nenhum médico cadastrado ainda.</td></tr>'; return; }
  tbody.innerHTML = auxData.map(r => {
    const dias = diffDias(r.proximo_prazo);
    return `<tr data-search="${escHtml(r.nome_medico)} ${escHtml(r.cpf)} ${escHtml(r.crm)} ${escHtml(r.hospital)}">
      <td>${badgeHtml(dias)}</td>
      <td><strong>${escHtml(r.nome_medico)}</strong></td>
      <td>${escHtml(r.crm)||'—'}</td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${escHtml(r.hospital)||'—'}</td>
      <td>${escHtml(r.tipo_acao)||'—'}</td>
      <td>${escHtml(r.fase_processo)||'—'}</td>
      <td>${fmtBRL(r.honorarios_calculado)}</td>
      <td>${fmtDate(r.proximo_prazo)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('aux','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('aux','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── PRAZOS JUDICIAIS AUXÍLIO ─────────────────────────────────────────── */
let prazData = [];
async function loadPraz() {
  const { data, error } = await sb.from('prazos_judiciais_auxilio').select('*').order('proximo_prazo', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar.', true); return; }
  prazData = data || []; renderPraz();
}
function renderPraz() {
  const tbody = document.getElementById('praz-body');
  if (!prazData.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Nenhum prazo cadastrado ainda.</td></tr>'; return; }
  tbody.innerHTML = prazData.map(r => {
    const dias = diffDias(r.proximo_prazo);
    let priCls = 'cinza';
    if (r.prioridade === 'Alta') priCls = 'vermelho';
    else if (r.prioridade === 'Média') priCls = 'amarelo';
    else if (r.prioridade === 'Baixa') priCls = 'verde';
    return `<tr data-search="${escHtml(r.cliente_medico)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.cliente_medico)}</strong></td>
      <td>${escHtml(r.tipo_acao)||'—'}</td>
      <td>${escHtml(r.vara_tribunal)||'—'}</td>
      <td>${escHtml(r.fase_atual)||'—'}</td>
      <td>${fmtDate(r.proximo_prazo)}</td>
      <td>${escHtml(r.peca_sugerida)||'—'}</td>
      <td>${r.prioridade ? '<span class="badge badge-'+priCls+'">'+escHtml(r.prioridade)+'</span>' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('praz','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('praz','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── COBRANÇAS ────────────────────────────────────────────────────────── */
let cobData = [];
async function loadCob() {
  const { data, error } = await sb.from('controle_cobrancas').select('*').order('data_limite_pgto', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar.', true); return; }
  cobData = data || []; renderCob();
}
function renderCob() {
  const tbody = document.getElementById('cob-body');
  if (!cobData.length) { tbody.innerHTML = '<tr><td colspan="14" class="empty-state">Nenhuma cobrança cadastrada ainda.</td></tr>'; return; }
  tbody.innerHTML = cobData.map(r => {
    const dias = diffDias(r.data_limite_pgto);
    const saldo = (r.valor_parcela || 0) - (r.valor_recebido || 0);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${escHtml(r.tipo_beneficio)||'—'}</td>
      <td>${fmtBRL(r.honorarios_totais)}</td>
      <td>${r.numero_parcela||'—'}</td>
      <td>${fmtBRL(r.valor_parcela)}</td>
      <td>${fmtDate(r.data_cobranca)}</td>
      <td>${fmtDate(r.data_limite_pgto)}</td>
      <td>${fmtBRL(r.valor_recebido)}</td>
      <td style="font-weight:400;color:${saldo > 0 ? 'var(--vermelho)' : 'var(--verde)'}">${fmtBRL(saldo)}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('cob','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('cob','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

/* ── MODAL: OPEN / CLOSE ──────────────────────────────────────────────── */
function openModal(type) {
  clearForm(type);
  document.getElementById(`modal-${type}-title`).textContent = getNewTitle(type);
  document.getElementById(`modal-${type}`).classList.add('open');
  // Configurações específicas pós-abertura
  if (type === 'aux') initAuxModal();
  if (type === 'sal') initSalModal();
  if (type === 'praz') initPrazModal();
  if (type === 'adm') initAdmModal();
  if (type === 'cob') initCobModal();
}
window.openModal = openModal;

function closeModal(type) {
  document.getElementById(`modal-${type}`).classList.remove('open');
}
window.closeModal = closeModal;

function getNewTitle(t) {
  const titles = {
    adm:'Novo Processo Administrativo', jud:'Novo Processo Judicial INSS',
    sal:'Nova — Salário-Maternidade', aux:'Novo Médico — Auxílio-Moradia',
    praz:'Novo Prazo Judicial — Auxílio-Moradia', cob:'Nova Cobrança / Honorário',
  };
  return titles[t];
}

function clearForm(type) {
  document.getElementById('form-' + type).reset();
  document.getElementById(type + '-id').value = '';
  // limpa previews
  ['aux-calc-preview','sal-calc-preview','praz-prazo-preview','adm-prazo-preview',
   'aux-docs-list','sal-docs-list','praz-docs-list','adm-docs-list','cob-calc-preview']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  // reset comp-list (auxílio)
  const comp = document.getElementById('aux-comp-list');
  if (comp) comp.innerHTML = '';
}

/* ── INIT MODAL: AUXÍLIO-MORADIA ──────────────────────────────────────── */
function initAuxModal() {
  const selArea = document.getElementById('aux-area');
  const selTipo = document.getElementById('aux-tipo-acao');
  const selFase = document.getElementById('aux-fase');

  window.UI.popularAreas(selArea, ['AUX_TJCE','AUX_TRF5']);
  window.UI.popularTiposAcao(selTipo, '');
  window.UI.popularFases(selFase, '', '');

  selArea.onchange = () => {
    window.UI.popularTiposAcao(selTipo, selArea.value);
    window.UI.popularFases(selFase, '', '');
    renderAuxDocs();
  };
  selTipo.onchange = () => {
    window.UI.popularFases(selFase, selArea.value, selTipo.value);
    renderAuxDocs();
  };

  window.UI.popularPecas(document.getElementById('aux-peca'));

  // calc helpers
  ['aux-data-intim','aux-peca','aux-fazenda'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () =>
      window.UI.calcularEMostrarPrazo({
        dataIntimacaoId:'aux-data-intim', pecaId:'aux-peca',
        fazendaId:'aux-fazenda', outputId:'aux-prazo-preview',
        dataFatalId:'aux-prazo',
      }));
  });

  // adiciona primeira linha de competência (se vazia)
  if (!document.querySelectorAll('#aux-comp-list .comp-row').length) addCompRow();
}

function renderAuxDocs() {
  const selArea = document.getElementById('aux-area');
  const selTipo = document.getElementById('aux-tipo-acao');
  if (!selArea.value || !selTipo.value) {
    document.getElementById('aux-docs-list').innerHTML =
      '<div class="empty-state" style="padding:1rem">Selecione a área e o tipo de ação para ver os documentos sugeridos.</div>';
    return;
  }
  const tipo = (TIPOS_ACAO[selArea.value] || []).find(t => t.codigo === selTipo.value);
  if (!tipo) return;
  const kit = tipo.docs;
  const id = document.getElementById('aux-id').value || 'novo';
  window.UI._ultimoKit = kit; window.UI._ultimoContainer = 'aux-docs-list';
  carregarDocsELoad('aux', id, kit, 'aux-docs-list');
}

async function carregarDocsELoad(processoTipo, processoId, kit, containerId) {
  if (processoId === 'novo') {
    // ainda não foi salvo — mostra checklist sem persistência
    window.UI.renderChecklistDocs(containerId, kit, processoTipo, processoId, []);
    return;
  }
  const salvos = await window.UI.carregarDocs(processoTipo, processoId);
  window.UI.renderChecklistDocs(containerId, kit, processoTipo, processoId, salvos);
}

/* ── COMPETÊNCIAS (linhas de bolsa para Aux-Moradia) ──────────────────── */
function addCompRow(inicio='', fim='', valor='') {
  const lista = document.getElementById('aux-comp-list');
  const idx = lista.children.length;
  const div = document.createElement('div');
  div.className = 'comp-row';
  div.innerHTML = `
    <div class="form-group">
      <label>Início (MM/AAAA)</label>
      <input type="month" class="comp-inicio" value="${inicio}">
    </div>
    <div class="form-group">
      <label>Fim (MM/AAAA)</label>
      <input type="month" class="comp-fim" value="${fim}">
    </div>
    <div class="form-group">
      <label>Bolsa mensal (R$)</label>
      <input type="number" class="comp-valor" step="0.01" value="${valor}">
    </div>
    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove(); recalcAuxMoradia();">✕</button>
  `;
  lista.appendChild(div);
  ['comp-inicio','comp-fim','comp-valor'].forEach(cls =>
    div.querySelector('.'+cls).addEventListener('change', recalcAuxMoradia));
  recalcAuxMoradia();
}
window.addCompRow = addCompRow;

function recalcAuxMoradia() {
  const linhas = document.querySelectorAll('#aux-comp-list .comp-row');
  const competencias = Array.from(linhas).map(r => ({
    inicio: r.querySelector('.comp-inicio').value,
    fim:    r.querySelector('.comp-fim').value,
    valor:  parseFloat(r.querySelector('.comp-valor').value || 0),
  })).filter(c => c.inicio && c.fim && c.valor > 0);

  if (!competencias.length) {
    document.getElementById('aux-calc-preview').innerHTML =
      '<em style="color:var(--texto-suave)">Adicione ao menos uma competência para calcular.</em>';
    return;
  }
  const r = window.CALC.calcAuxMoradia(competencias);
  document.getElementById('aux-calc-preview').innerHTML =
    r.memoria.replace(/\n/g,'<br>') +
    `<span class="destaque">Honorários: ${window.CALC.fmt(r.honorarios)}</span>`;

  // popula campos hidden
  set('aux-valor-acao', r.valorAcao.toFixed(2));
  set('aux-honor-calc', r.honorarios.toFixed(2));
  set('aux-total-bolsa', r.base.toFixed(2));
}
window.recalcAuxMoradia = recalcAuxMoradia;

/* ── INIT MODAL: SALÁRIO-MATERNIDADE ──────────────────────────────────── */
function initSalModal() {
  const v = document.getElementById('sal-valor');
  v.oninput = () => {
    const val = parseFloat(v.value || 0);
    if (val <= 0) { document.getElementById('sal-calc-preview').innerHTML = ''; return; }
    const r = window.CALC.calcSalarioMaternidade(val);
    document.getElementById('sal-calc-preview').innerHTML =
      r.memoria.replace(/\n/g,'<br>') +
      `<span class="destaque">Honorários: ${window.CALC.fmt(r.honorarios)}</span>`;
    set('sal-honor-total', r.honorarios.toFixed(2));
  };
  // docs
  const id = document.getElementById('sal-id').value || 'novo';
  window.UI._ultimoKit = 'SAL_MAT'; window.UI._ultimoContainer = 'sal-docs-list';
  carregarDocsELoad('sal', id, 'SAL_MAT', 'sal-docs-list');
}

/* ── INIT MODAL: PRAZOS JUDICIAIS AUXÍLIO ─────────────────────────────── */
function initPrazModal() {
  const selArea = document.getElementById('praz-area');
  const selTipo = document.getElementById('praz-tipo-acao-sel');
  const selFase = document.getElementById('praz-fase-sel');
  window.UI.popularAreas(selArea);
  window.UI.popularTiposAcao(selTipo, '');
  window.UI.popularFases(selFase, '', '');
  selArea.onchange = () => { window.UI.popularTiposAcao(selTipo, selArea.value); window.UI.popularFases(selFase, '', ''); renderPrazDocs(); };
  selTipo.onchange = () => { window.UI.popularFases(selFase, selArea.value, selTipo.value); renderPrazDocs(); };

  window.UI.popularPecas(document.getElementById('praz-peca-sel'));
  ['praz-data-intim','praz-peca-sel','praz-fazenda'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () =>
      window.UI.calcularEMostrarPrazo({
        dataIntimacaoId:'praz-data-intim', pecaId:'praz-peca-sel',
        fazendaId:'praz-fazenda', outputId:'praz-prazo-preview',
        dataFatalId:'praz-prazo',
      }));
  });
}
function renderPrazDocs() {
  const selArea = document.getElementById('praz-area');
  const selTipo = document.getElementById('praz-tipo-acao-sel');
  if (!selArea.value || !selTipo.value) {
    document.getElementById('praz-docs-list').innerHTML =
      '<div class="empty-state" style="padding:1rem">Selecione área e tipo de ação para ver os documentos sugeridos.</div>';
    return;
  }
  const tipo = (TIPOS_ACAO[selArea.value] || []).find(t => t.codigo === selTipo.value);
  if (!tipo) return;
  const kit = tipo.docs;
  const id = document.getElementById('praz-id').value || 'novo';
  window.UI._ultimoKit = kit; window.UI._ultimoContainer = 'praz-docs-list';
  carregarDocsELoad('praz', id, kit, 'praz-docs-list');
}

/* ── INIT MODAL: PROC. ADMINISTRATIVOS ────────────────────────────────── */
function initAdmModal() {
  const id = document.getElementById('adm-id').value || 'novo';
  window.UI._ultimoKit = 'ADM_INSS'; window.UI._ultimoContainer = 'adm-docs-list';
  carregarDocsELoad('adm', id, 'ADM_INSS', 'adm-docs-list');
}

/* ── INIT MODAL: COBRANÇAS ────────────────────────────────────────────── */
function initCobModal() {
  // calculadora genérica: valor base × % honorários
  const recalc = () => {
    const base = parseFloat(document.getElementById('cob-valor-mensal')?.value || 0);
    const qtd  = parseInt(document.getElementById('cob-qtd-parc')?.value || 1, 10);
    const total = base * qtd;
    const honor = total * 0.30;
    const el = document.getElementById('cob-calc-preview');
    if (el) el.innerHTML =
      `Valor mensal: ${window.CALC.fmt(base)} × ${qtd} parcelas = ${window.CALC.fmt(total)}<br>` +
      `<span class="destaque">Honorários sugeridos (30%): ${window.CALC.fmt(honor)}</span>`;
    if (!document.getElementById('cob-honor-total').value) {
      set('cob-honor-total', honor.toFixed(2));
    }
  };
  ['cob-valor-mensal','cob-qtd-parc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', recalc);
  });
}

/* ── SALVAR ───────────────────────────────────────────────────────────── */
async function saveRecord(type) {
  const id = document.getElementById(type + '-id').value;
  const payload = buildPayload(type);
  if (!payload) return;

  let err, novoId = id;
  if (id) {
    ({ error: err } = await sb.from(tableFor(type)).update(payload).eq('id', id));
  } else {
    const { data, error } = await sb.from(tableFor(type)).insert(payload).select('id').single();
    err = error;
    if (data) novoId = data.id;
  }
  if (err) { toast('Erro ao salvar: ' + err.message, true); return; }
  toast(id ? 'Registro atualizado!' : 'Registro criado!');
  closeModal(type);
  loaded[moduleFor(type)] = false;
  loadModule(moduleFor(type));
  if (loaded['dashboard']) { loaded['dashboard'] = false; loadModule('dashboard'); }
}
window.saveRecord = saveRecord;

function tableFor(t) {
  return { adm:'processos_administrativos', jud:'processos_judiciais_inss',
    sal:'salario_maternidade', aux:'auxilio_moradia',
    praz:'prazos_judiciais_auxilio', cob:'controle_cobrancas' }[t];
}
function moduleFor(t) {
  return { adm:'proc-adm', jud:'proc-jud', sal:'sal-mat',
    aux:'aux-mor', praz:'prazos-aux', cob:'cobrancas' }[t];
}

function buildPayload(type) {
  switch(type) {
    case 'adm': {
      const nome = v('adm-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      return { numero_processo:v('adm-numero'), numero_proc_judicial:v('adm-proc-jud'),
        nome_cliente:nome, cpf:v('adm-cpf'), tipo_beneficio:v('adm-tipo'),
        data_protocolo:vd('adm-protocolo'), fase_atual:v('adm-fase'),
        proximo_prazo:vd('adm-prazo'), tipo_prazo:v('adm-tipo-prazo'),
        prazo_boleto:vd('adm-boleto'), status:v('adm-status'),
        docs_recebidos:vi('adm-docs-rec'), observacoes:v('adm-obs') };
    }
    case 'jud': {
      const nome = v('jud-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      return { numero_processo:v('jud-numero'), numero_proc_adm:v('jud-proc-adm'),
        nome_cliente:nome, cpf:v('jud-cpf'), tipo_beneficio:v('jud-tipo'),
        vara_tribunal:v('jud-vara'), juiz:v('jud-juiz'), fase_atual:v('jud-fase'),
        data_proxima_audiencia:vd('jud-data-prazo'), tipo_prazo:v('jud-tipo-prazo'),
        prazo_boleto:vd('jud-boleto'), status:v('jud-status'), observacoes:v('jud-obs') };
    }
    case 'sal': {
      const nome = v('sal-nome');
      if (!nome) { toast('Nome da cliente é obrigatório.', true); return null; }
      return { numero_processo:v('sal-numero'), nome_cliente:nome, cpf:v('sal-cpf'),
        dpp:vd('sal-dpp'), tipo_salario_mat:v('sal-tipo'),
        valor_mensal_beneficio:vn('sal-valor'), numero_guia:v('sal-guia'),
        competencia_guia:v('sal-competencia'), data_limite_pagamento:vd('sal-data-limite'),
        status_guia:v('sal-status-guia'), data_pgto_guia:vd('sal-data-pgto'),
        honorario_total:vn('sal-honor-total'), numero_parcela:vi('sal-parcela-num'),
        valor_parcela:vn('sal-parcela-valor'), data_cobranca:vd('sal-data-cob'),
        data_recebimento:vd('sal-data-rec'), status_honorario:v('sal-status-honor'),
        observacoes:v('sal-obs') };
    }
    case 'aux': {
      const nome = v('aux-nome');
      if (!nome) { toast('Nome do médico é obrigatório.', true); return null; }
      // recolhe competências
      const linhas = document.querySelectorAll('#aux-comp-list .comp-row');
      const comps = Array.from(linhas).map(r => ({
        inicio: r.querySelector('.comp-inicio').value || null,
        fim:    r.querySelector('.comp-fim').value || null,
        valor:  parseFloat(r.querySelector('.comp-valor').value) || 0,
      })).filter(c => c.inicio && c.fim);

      return { nome_medico:nome, cpf:v('aux-cpf'), crm:v('aux-crm'), rqe:v('aux-rqe'),
        telefone:v('aux-telefone'), email:v('aux-email'), hospital:v('aux-hospital'),
        numero_processo:v('aux-processo'),
        area:v('aux-area'), tipo_acao_codigo:v('aux-tipo-acao'),
        tipo_acao:document.getElementById('aux-tipo-acao').selectedOptions[0]?.text || null,
        fase_processo:v('aux-fase'),
        proximo_prazo:vd('aux-prazo'), tipo_prazo:v('aux-tipo-prazo'),
        data_intimacao:vd('aux-data-intim'), peca_codigo:v('aux-peca'),
        fazenda_publica:document.getElementById('aux-fazenda')?.checked || false,
        competencias:comps.length ? comps : null,
        total_bolsa:vn('aux-total-bolsa'),
        valor_acao_calculado:vn('aux-valor-acao'),
        honorarios_calculado:vn('aux-honor-calc'),
        status:v('aux-status'), observacoes:v('aux-obs') };
    }
    case 'praz': {
      const nome = v('praz-cliente');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      return { numero_processo:v('praz-numero'), cliente_medico:nome, cpf:v('praz-cpf'),
        area:v('praz-area'),
        tipo_acao_codigo:v('praz-tipo-acao-sel'),
        tipo_acao:document.getElementById('praz-tipo-acao-sel')?.selectedOptions[0]?.text || null,
        vara_tribunal:v('praz-vara'), juiz:v('praz-juiz'),
        fase_atual:v('praz-fase-sel'),
        data_intimacao:vd('praz-data-intim'), peca_codigo:v('praz-peca-sel'),
        fazenda_publica:document.getElementById('praz-fazenda')?.checked || false,
        proximo_prazo:vd('praz-prazo'), tipo_prazo:v('praz-tipo-prazo'),
        peca_sugerida:document.getElementById('praz-peca-sel')?.selectedOptions[0]?.text || null,
        prioridade:v('praz-prioridade'), status:v('praz-status'), observacoes:v('praz-obs') };
    }
    case 'cob': {
      const nome = v('cob-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      return { numero_processo:v('cob-numero'), nome_cliente:nome, cpf:v('cob-cpf'),
        tipo_beneficio:v('cob-tipo'), valor_mensal_beneficio:vn('cob-valor-mensal'),
        qtd_parcelas:vi('cob-qtd-parc'), honorarios_totais:vn('cob-honor-total'),
        numero_parcela:vi('cob-parcela-num'), valor_parcela:vn('cob-parcela-valor'),
        data_cobranca:vd('cob-data-cob'), data_limite_pgto:vd('cob-data-limite'),
        data_recebimento:vd('cob-data-rec'), valor_recebido:vn('cob-valor-rec'),
        status:v('cob-status'), observacoes:v('cob-obs') };
    }
  }
}

/* ── EDITAR ───────────────────────────────────────────────────────────── */
function editRecord(type, id) {
  const dataMap = { adm: admData, jud: judData, sal: salData, aux: auxData, praz: prazData, cob: cobData };
  const rec = dataMap[type].find(r => r.id === id);
  if (!rec) return;
  document.getElementById(`modal-${type}-title`).textContent = 'Editar Registro';
  document.getElementById(`modal-${type}`).classList.add('open');
  // espera o modal aparecer para inicializar campos especiais
  setTimeout(() => {
    fillForm(type, rec);
    // re-inicializa após preencher
    if (type === 'aux') initAuxModalAfterFill(rec);
    if (type === 'sal') { initSalModal(); recalcSal(rec.valor_mensal_beneficio); }
    if (type === 'praz') initPrazModalAfterFill(rec);
    if (type === 'adm') initAdmModal();
    if (type === 'cob') initCobModal();
  }, 0);
}
window.editRecord = editRecord;

function recalcSal(v) {
  if (!v) return;
  const r = window.CALC.calcSalarioMaternidade(v);
  document.getElementById('sal-calc-preview').innerHTML =
    r.memoria.replace(/\n/g,'<br>') +
    `<span class="destaque">Honorários: ${window.CALC.fmt(r.honorarios)}</span>`;
}

function initAuxModalAfterFill(rec) {
  const selArea = document.getElementById('aux-area');
  const selTipo = document.getElementById('aux-tipo-acao');
  const selFase = document.getElementById('aux-fase');
  window.UI.popularAreas(selArea, ['AUX_TJCE','AUX_TRF5']);
  selArea.value = rec.area || '';
  window.UI.popularTiposAcao(selTipo, selArea.value);
  selTipo.value = rec.tipo_acao_codigo || '';
  window.UI.popularFases(selFase, selArea.value, selTipo.value);
  selFase.value = rec.fase_processo || '';

  selArea.onchange = () => { window.UI.popularTiposAcao(selTipo, selArea.value); window.UI.popularFases(selFase, '', ''); renderAuxDocs(); };
  selTipo.onchange = () => { window.UI.popularFases(selFase, selArea.value, selTipo.value); renderAuxDocs(); };

  window.UI.popularPecas(document.getElementById('aux-peca'));
  if (rec.peca_codigo) document.getElementById('aux-peca').value = rec.peca_codigo;
  if (rec.fazenda_publica) document.getElementById('aux-fazenda').checked = true;

  ['aux-data-intim','aux-peca','aux-fazenda'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => window.UI.calcularEMostrarPrazo({
      dataIntimacaoId:'aux-data-intim', pecaId:'aux-peca',
      fazendaId:'aux-fazenda', outputId:'aux-prazo-preview',
      dataFatalId:'aux-prazo',
    });
  });

  // restaura competências
  document.getElementById('aux-comp-list').innerHTML = '';
  const comps = rec.competencias || [];
  if (comps.length) comps.forEach(c => addCompRow(c.inicio, c.fim, c.valor));
  else addCompRow();
  recalcAuxMoradia();
  renderAuxDocs();
}

function initPrazModalAfterFill(rec) {
  const selArea = document.getElementById('praz-area');
  const selTipo = document.getElementById('praz-tipo-acao-sel');
  const selFase = document.getElementById('praz-fase-sel');
  window.UI.popularAreas(selArea);
  selArea.value = rec.area || '';
  window.UI.popularTiposAcao(selTipo, selArea.value);
  selTipo.value = rec.tipo_acao_codigo || '';
  window.UI.popularFases(selFase, selArea.value, selTipo.value);
  selFase.value = rec.fase_atual || '';

  selArea.onchange = () => { window.UI.popularTiposAcao(selTipo, selArea.value); window.UI.popularFases(selFase, '', ''); renderPrazDocs(); };
  selTipo.onchange = () => { window.UI.popularFases(selFase, selArea.value, selTipo.value); renderPrazDocs(); };

  window.UI.popularPecas(document.getElementById('praz-peca-sel'));
  if (rec.peca_codigo) document.getElementById('praz-peca-sel').value = rec.peca_codigo;
  if (rec.fazenda_publica) document.getElementById('praz-fazenda').checked = true;
  renderPrazDocs();
}

function fillForm(type, r) {
  set(type + '-id', r.id);
  switch(type) {
    case 'adm':
      set('adm-numero', r.numero_processo); set('adm-proc-jud', r.numero_proc_judicial);
      set('adm-nome', r.nome_cliente); set('adm-cpf', r.cpf);
      set('adm-tipo', r.tipo_beneficio); set('adm-protocolo', r.data_protocolo?.slice(0,10));
      set('adm-fase', r.fase_atual); set('adm-prazo', r.proximo_prazo?.slice(0,10));
      set('adm-tipo-prazo', r.tipo_prazo); set('adm-boleto', r.prazo_boleto?.slice(0,10));
      set('adm-status', r.status); set('adm-docs-rec', r.docs_recebidos);
      set('adm-obs', r.observacoes); break;
    case 'jud':
      set('jud-numero', r.numero_processo); set('jud-proc-adm', r.numero_proc_adm);
      set('jud-nome', r.nome_cliente); set('jud-cpf', r.cpf);
      set('jud-tipo', r.tipo_beneficio); set('jud-vara', r.vara_tribunal);
      set('jud-juiz', r.juiz); set('jud-fase', r.fase_atual);
      set('jud-data-prazo', r.data_proxima_audiencia?.slice(0,10));
      set('jud-tipo-prazo', r.tipo_prazo); set('jud-boleto', r.prazo_boleto?.slice(0,10));
      set('jud-status', r.status); set('jud-obs', r.observacoes); break;
    case 'sal':
      set('sal-numero', r.numero_processo); set('sal-nome', r.nome_cliente);
      set('sal-cpf', r.cpf); set('sal-dpp', r.dpp?.slice(0,10));
      set('sal-tipo', r.tipo_salario_mat); set('sal-valor', r.valor_mensal_beneficio);
      set('sal-guia', r.numero_guia); set('sal-competencia', r.competencia_guia);
      set('sal-data-limite', r.data_limite_pagamento?.slice(0,10));
      set('sal-status-guia', r.status_guia); set('sal-data-pgto', r.data_pgto_guia?.slice(0,10));
      set('sal-honor-total', r.honorario_total); set('sal-parcela-num', r.numero_parcela);
      set('sal-parcela-valor', r.valor_parcela); set('sal-data-cob', r.data_cobranca?.slice(0,10));
      set('sal-data-rec', r.data_recebimento?.slice(0,10));
      set('sal-status-honor', r.status_honorario); set('sal-obs', r.observacoes); break;
    case 'aux':
      set('aux-nome', r.nome_medico); set('aux-cpf', r.cpf);
      set('aux-crm', r.crm); set('aux-rqe', r.rqe);
      set('aux-telefone', r.telefone); set('aux-email', r.email);
      set('aux-hospital', r.hospital); set('aux-processo', r.numero_processo);
      set('aux-prazo', r.proximo_prazo?.slice(0,10));
      set('aux-tipo-prazo', r.tipo_prazo); set('aux-status', r.status);
      set('aux-obs', r.observacoes);
      set('aux-data-intim', r.data_intimacao?.slice(0,10));
      set('aux-valor-acao', r.valor_acao_calculado);
      set('aux-honor-calc', r.honorarios_calculado);
      set('aux-total-bolsa', r.total_bolsa);
      break;
    case 'praz':
      set('praz-numero', r.numero_processo); set('praz-cliente', r.cliente_medico);
      set('praz-cpf', r.cpf);
      set('praz-vara', r.vara_tribunal); set('praz-juiz', r.juiz);
      set('praz-prazo', r.proximo_prazo?.slice(0,10));
      set('praz-tipo-prazo', r.tipo_prazo);
      set('praz-prioridade', r.prioridade); set('praz-status', r.status);
      set('praz-obs', r.observacoes);
      set('praz-data-intim', r.data_intimacao?.slice(0,10));
      break;
    case 'cob':
      set('cob-numero', r.numero_processo); set('cob-nome', r.nome_cliente);
      set('cob-cpf', r.cpf); set('cob-tipo', r.tipo_beneficio);
      set('cob-valor-mensal', r.valor_mensal_beneficio); set('cob-qtd-parc', r.qtd_parcelas);
      set('cob-honor-total', r.honorarios_totais); set('cob-parcela-num', r.numero_parcela);
      set('cob-parcela-valor', r.valor_parcela); set('cob-data-cob', r.data_cobranca?.slice(0,10));
      set('cob-data-limite', r.data_limite_pgto?.slice(0,10));
      set('cob-data-rec', r.data_recebimento?.slice(0,10));
      set('cob-valor-rec', r.valor_recebido); set('cob-status', r.status);
      set('cob-obs', r.observacoes); break;
  }
}

/* ── DELETAR ──────────────────────────────────────────────────────────── */
async function deleteRecord(type, id) {
  if (!confirm('Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.')) return;
  const { error } = await sb.from(tableFor(type)).delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', true); return; }
  toast('Registro excluído.');
  loaded[moduleFor(type)] = false;
  loadModule(moduleFor(type));
  loaded['dashboard'] = false;
  loadModule('dashboard');
}
window.deleteRecord = deleteRecord;

/* ── FILTER ──────────────────────────────────────────────────────────── */
window.filterTable = filterTable;

/* ── FECHAR MODAL CLICANDO FORA ──────────────────────────────────────── */
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});
