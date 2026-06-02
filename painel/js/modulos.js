/* ═══════════════════════════════════════════════════════════════════════════
   MÓDULOS DO PAINEL — M&SM Advocacia
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

if (!window.APP || !window.CATALOGOS) {
  document.body.innerHTML =
    '<div style="padding:2rem;font-family:sans-serif;color:#c0392b">' +
    '<h2>Erro ao iniciar o painel</h2>' +
    '<p>Algum arquivo de script não carregou. Abra o console (F12) e veja o que falhou.</p>' +
    '<p><a href="../index.html">← Voltar ao login</a></p></div>';
  throw new Error('Bootstrap incompleto: window.APP ou window.CATALOGOS ausentes.');
}

const { sb, diffDias, fmtDate, fmtBRL, setDate,
        badgeHtml, statusBadge, escHtml, toast, filterTable,
        v, vd, vn, vi, set } = window.APP;
const { TIPOS_ACAO, DOCS_POR_KIT, TIPOS_SAL_MAT, COMARCAS_CE, VARAS_FORTALEZA, VARAS_TRF5_CE } = window.CATALOGOS;

let currentUser = null;   // populado pela inicialização no fim do arquivo

async function logout() {
  await sb.auth.signOut();
  window.location.replace('../index.html');
}
window.logout = logout;

/* ── NAVEGAÇÃO ────────────────────────────────────────────────────────── */
const titles = {
  dashboard:  'Dashboard · Prazos Próximos',
  clientes:   'Cadastro de Clientes',
  'proc-adm': 'Processos Administrativos · INSS',
  'proc-jud': 'Processos Judiciais · INSS',
  'sal-mat':  'Salário-Maternidade',
  'aux-doenca':'Auxílio-Doença · INSS',
  'bpc':      'BPC / LOAS · INSS',
  'recursos': 'Recursos · Administrativos e Judiciais',
  'aux-mor':  'Médicos Residentes · Auxílio-Moradia',
  'prazos-aux':'Prazos Judiciais · Auxílio-Moradia',
  'prazos-civel':'Prazos Judiciais · Cível',
  'prazos-saude':'Prazos Judiciais · Saúde',
  cobrancas:  'Cobranças / Honorários',
  faturamento:'Faturamento Mensal',
  civel:      'Ações Cíveis',
  familia:    'Família e Sucessões',
  consumidor: 'Consumidor',
  saude:      'Direito à Saúde',
};

function showModule(mod) {
  document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.module === mod);
  });
  const alvo = document.getElementById('mod-' + mod);
  if (alvo) alvo.classList.add('active');
  const t = titles[mod] || mod;
  const parts = t.split('·');
  const pageTitle = document.getElementById('page-title');
  if (pageTitle) {
    pageTitle.innerHTML = parts.length > 1
      ? escHtml(parts[0]) + '·<span>' + escHtml(parts[1]) + '</span>'
      : escHtml(t);
  }
  loadModule(mod);
}
window.showModule = showModule;

const loaded = {};
function loadModule(mod) {
  if (loaded[mod]) return;
  loaded[mod] = true;
  switch(mod) {
    case 'dashboard':  /* tratado por extras.js → loadDashboardCategorizado */ break;
    case 'proc-adm':   loadAdm(); break;
    case 'proc-jud':   loadJud(); break;
    case 'sal-mat':    loadSal(); break;
    case 'aux-mor':    loadAux(); break;
    case 'prazos-aux': loadPraz(); break;
    case 'cobrancas':  loadCob(); break;
    case 'civel':      loadGen('CIVEL'); break;
    case 'familia':    loadGen('FAMILIA'); break;
    case 'consumidor': loadGen('CONSUMIDOR'); break;
    case 'saude':      loadGen('SAUDE'); break;
    // novos módulos (clientes, aux-doenca, bpc, recursos, prazos-civel, prazos-saude)
    // são tratados pelo hook em extras.js → window.showModule
  }
}
window.__loaded__ = loaded;
window.__loadModule__ = loadModule;

/* ── DASHBOARD — implementado em extras.js (loadDashboardCategorizado) ── */

/* ── PROCESSOS ADMINISTRATIVOS ────────────────────────────────────────── */
let admData = [];
async function loadAdm() {
  // VIEW unificada: Adm INSS + Sal-Mat + Aux-Doença + BPC (natureza administrativa)
  const [adm, sal, axd, bpc] = await Promise.all([
    sb.from('processos_administrativos').select('*').order('prazo_analise_inss', { ascending: true, nullsFirst: false }),
    sb.from('salario_maternidade').select('*').order('prazo_analise_inss', { ascending: true, nullsFirst: false }),
    sb.from('auxilio_doenca').select('*').eq('natureza','administrativo').order('prazo_analise_inss', { ascending: true, nullsFirst: false }),
    sb.from('bpc_loas').select('*').eq('natureza','administrativo').order('prazo_analise_inss', { ascending: true, nullsFirst: false }),
  ]);
  const todos = [
    ...(adm.data||[]).map(r => ({ ...r, _origem:'adm' })),
    ...(sal.data||[]).map(r => ({ ...r, _origem:'sal', tipo_beneficio:'Salário-Maternidade' })),
    ...(axd.data||[]).map(r => ({ ...r, _origem:'axd', tipo_beneficio:'Auxílio-Doença' })),
    ...(bpc.data||[]).map(r => ({ ...r, _origem:'bpc', tipo_beneficio:`BPC/LOAS${r.modalidade ? ' · '+r.modalidade : ''}` })),
  ];
  admData = todos;
  renderAdm();
}
function renderAdm() {
  const tbody = document.getElementById('adm-body');
  if (!admData.length) { tbody.innerHTML = '<tr><td colspan="12" class="empty-state">Nenhum processo cadastrado ainda.</td></tr>'; return; }
  const LABEL_ORIG = { adm:'', sal:' · ✏️ Sal-Mat', axd:' · ✏️ Aux-Doença', bpc:' · ✏️ BPC' };
  tbody.innerHTML = admData.map(r => {
    const prazo = r.prazo_recurso || r.proximo_prazo || r.prazo_analise_inss;
    const dias = diffDias(prazo);
    const origemTipo = r._origem || 'adm';
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)} ${escHtml(r.numero_beneficio)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}${r.numero_beneficio ? '<br><small style="color:var(--texto-suave)">NB: '+escHtml(r.numero_beneficio)+'</small>' : ''}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${escHtml(r.tipo_beneficio)||'—'}<small style="color:var(--texto-suave)">${LABEL_ORIG[origemTipo]||''}</small></td>
      <td>${fmtDate(r.data_protocolo)}</td>
      <td>${fmtDate(r.prazo_analise_inss)}</td>
      <td>${statusBadge(r.resultado_pedido)}</td>
      <td>${fmtDate(prazo)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('${origemTipo}','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('${origemTipo}','${r.id}')">Del</button>
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
  const { data, error } = await sb.from('salario_maternidade').select('*').order('prazo_analise_inss', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar.', true); return; }
  salData = data || []; renderSal();
}
function renderSal() {
  const tbody = document.getElementById('sal-body');
  if (!salData.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Nenhum registro cadastrado ainda.</td></tr>'; return; }
  tbody.innerHTML = salData.map(r => {
    const prazo = r.prazo_recurso || r.prazo_analise_inss;
    const dias = diffDias(prazo);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${fmtDate(r.data_protocolo)}</td>
      <td>${fmtDate(r.prazo_analise_inss)}</td>
      <td>${statusBadge(r.resultado_pedido)}</td>
      <td>${fmtBRL(r.valor_mensal_beneficio)}</td>
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
  const { data, error } = await sb.from('prazos_judiciais_auxilio').select('*')
    .or('escopo.is.null,escopo.eq.AUX_MORADIA')
    .order('proximo_prazo', { ascending: true, nullsFirst: false });
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
  const modalEl = document.getElementById(`modal-${type}`);
  modalEl.classList.add('open');
  // Reseta data-* atributos auxiliares (ex: escopo do prazos)
  if (type === 'praz') delete modalEl.dataset.escopo;
  // Configurações específicas pós-abertura
  if (type === 'aux') initAuxModal();
  if (type === 'sal') initSalModal();
  if (type === 'praz') initPrazModal();
  if (type === 'adm') initAdmModal();
  if (type === 'cob') initCobModal();
  if (type === 'axd' && window.MODULOS) {
    window.MODULOS.atualizarNaturezaAxd();
    window.MODULOS.atualizarDecisaoAxd();
  }
  if (type === 'bpc' && window.MODULOS) {
    window.MODULOS.atualizarNaturezaBpc();
    window.MODULOS.atualizarDecisaoBpc();
  }
  if (type === 'rec' && window.MODULOS) {
    window.MODULOS.atualizarModalidadeRec();
  }
  // Atualiza datalist de clientes ao abrir qualquer modal
  if (window.MODULOS?.popularDatalists) window.MODULOS.popularDatalists();
  // Carrega médicos para o modal de prazos
  if (type === 'praz' && window.MODULOS?.carregarMedicos) window.MODULOS.carregarMedicos();
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
    praz:'Novo Prazo Judicial', cob:'Nova Cobrança / Honorário',
    cli:'Novo Cliente', axd:'Novo Auxílio-Doença', bpc:'Novo BPC / LOAS',
    rec:'Novo Recurso',
  };
  return titles[t];
}

function clearForm(type) {
  const form = document.getElementById('form-' + type);
  if (form) form.reset();
  const idEl = document.getElementById(type + '-id');
  if (idEl) idEl.value = '';
  // Limpa hidden cliente_id se existir
  const ci = document.getElementById(type + '-cliente-id'); if (ci) ci.value = '';
  // limpa previews
  ['aux-calc-preview','sal-calc-preview','praz-prazo-preview','adm-prazo-preview',
   'aux-prazo-preview','gen-prazo-preview','gen-calc-preview',
   'aux-docs-list','sal-docs-list','praz-docs-list','adm-docs-list','gen-docs-list',
   'cob-calc-preview','sal-guias-container','rec-busca-resultado',
   'adm-prazo-info','adm-honor-preview','axd-honor-preview'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '';
  });
  // reset comp-list (auxílio)
  const comp = document.getElementById('aux-comp-list');
  if (comp) comp.innerHTML = '';
  // Esconde linhas condicionais para começar limpo
  ['adm-row-recurso','adm-row-parcelas','adm-row-valor',
   'sal-row-prevpgto','sal-row-recurso',
   'axd-row-recurso','axd-row-judicial','axd-row-judicial-2',
   'bpc-row-recurso','bpc-row-judicial','bpc-row-judicial-2',
   'jud-row-parcelas','jud-row-valor-mensal',
   'rec-row-judicial','rec-row-judicial-2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  });
  // Reativa as linhas que devem ficar visíveis por padrão
  ['adm-row-prevpgto','bpc-row-prevpgto'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = '';
  });
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
  // Popula dropdown de tipos dinamicamente
  const selTipo = document.getElementById('sal-tipo');
  selTipo.innerHTML = '<option value="">— Selecione o tipo —</option>' +
    TIPOS_SAL_MAT.map(t => `<option value="${t.codigo}">${escHtml(t.nome)}</option>`).join('');

  const inputValor    = document.getElementById('sal-valor');
  const inputParcelas = document.getElementById('sal-parcelas-qtd');
  const rowParcelas   = document.getElementById('sal-parcelas-row');

  function recalc() {
    const t = TIPOS_SAL_MAT.find(x => x.codigo === selTipo.value);
    const isProrrog = t?.parcelas_var;
    rowParcelas.style.display = isProrrog ? '' : 'none';

    // Se tipo NÃO é prorrogação, força parcelas = 4 (padrão)
    if (!isProrrog && (!inputParcelas.value || inputParcelas.value === '')) {
      inputParcelas.value = t?.parcelas || 4;
    }

    if (t) {
      const id = document.getElementById('sal-id').value || 'novo';
      window.UI._ultimoKit = t.docs; window.UI._ultimoContainer = 'sal-docs-list';
      carregarDocsELoad('sal', id, t.docs, 'sal-docs-list');
    }
    // Cálculo automático de honorários (via MODULOS)
    if (window.MODULOS?.recalcHonorariosSalMat) window.MODULOS.recalcHonorariosSalMat();
    // Re-renderiza o controle de parcelas do benefício quando o número muda
    if (window.MODULOS?.renderParcelasBeneficio) window.MODULOS.renderParcelasBeneficio({});
  }

  selTipo.onchange    = recalc;
  inputValor.oninput  = recalc;
  inputParcelas.oninput = recalc;

  // docs (kit default genérico até o tipo ser escolhido)
  const id = document.getElementById('sal-id').value || 'novo';
  window.UI._ultimoKit = 'SAL_MAT'; window.UI._ultimoContainer = 'sal-docs-list';
  carregarDocsELoad('sal', id, 'SAL_MAT', 'sal-docs-list');

  // Renderiza blocos de guia vazios (3) — preenchidos no editRecord se houver dados
  if (window.MODULOS?.renderGuiasSalMat) window.MODULOS.renderGuiasSalMat([]);
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

  // Upsert cliente central (exceto para 'cli' que já é o próprio cliente)
  if (type !== 'cli' && window.MODULOS?.upsertClienteDoFormulario) {
    try { await window.MODULOS.upsertClienteDoFormulario(type); } catch(e) { console.warn(e); }
  }

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

  // Salário-maternidade: persistir as guias (até 3) e as parcelas de cobrança
  if (type === 'sal' && novoId) {
    if (window.MODULOS?.coletarGuiasSalMat) {
      const guias = window.MODULOS.coletarGuiasSalMat();
      await window.MODULOS.salvarGuiasSalMat(novoId, guias);
    }
    if (window.MODULOS?.persistirParcelasCobrancaSalMat) {
      await window.MODULOS.persistirParcelasCobrancaSalMat(novoId, {
        cliente_id: payload.cliente_id, nome_cliente: payload.nome_cliente,
        cpf: payload.cpf, numero_processo: payload.numero_processo,
      });
    }
  }

  // Persistir documentos pendentes do registro novo
  if (novoId && window.UI?.persistirDocsPendentes) {
    const containerMap = { adm:'adm-docs-list', sal:'sal-docs-list', aux:'aux-docs-list',
                            praz:'praz-docs-list', gen:'gen-docs-list' };
    const cont = containerMap[type];
    if (cont) await window.UI.persistirDocsPendentes(type, novoId, cont);
  }

  // Se fase = "Recurso interposto", cria automaticamente entrada na aba Recursos
  if (novoId && ['adm','sal','axd','bpc'].includes(type)
      && window.MODULOS?.sincronizarRecursoAutomatico) {
    await window.MODULOS.sincronizarRecursoAutomatico(type, novoId, payload);
  }

  // Auto-criação de cobrança (ações com benefício/valor conhecido)
  if (novoId && !id && window.MODULOS?.criarCobrancaAutomatica) {
    await tentarCriarCobranca(type, novoId, payload);
  }

  toast(id ? 'Registro atualizado!' : 'Registro criado!');
  closeModal(type);
  // Invalida caches; o módulo ativo é re-renderizado.
  Object.keys(loaded).forEach(k => loaded[k] = false);
  const ativo = document.querySelector('.nav-item.active')?.dataset.module;
  if (ativo && typeof window.showModule === 'function') window.showModule(ativo);
}
window.saveRecord = saveRecord;

async function tentarCriarCobranca(type, novoId, payload) {
  // 'sal' tem fluxo dedicado (persistirParcelasCobrancaSalMat) → ignora aqui
  if (type === 'sal') return;
  const mapa = {
    aux: () => ({
      origem_tipo:'aux', origem_id:novoId,
      nome_cliente:payload.nome_medico, cpf:payload.cpf,
      tipo_beneficio:'Auxílio-Moradia',
      valor_acao:payload.valor_acao_calculado,
      numero_processo:payload.numero_processo,
    }),
    axd: () => ({
      origem_tipo:'axd', origem_id:novoId,
      cliente_id:payload.cliente_id, nome_cliente:payload.nome_cliente, cpf:payload.cpf,
      tipo_beneficio:'Auxílio-Doença',
      valor_mensal:payload.valor_mensal_beneficio,
      qtd_parcelas:payload.qtd_parcelas_deferidas,
      indeterminado:payload.tempo_indeterminado,
      numero_processo:payload.numero_processo,
    }),
    bpc: () => ({
      origem_tipo:'bpc', origem_id:novoId,
      cliente_id:payload.cliente_id, nome_cliente:payload.nome_cliente, cpf:payload.cpf,
      tipo_beneficio:'BPC/LOAS',
      valor_mensal:payload.valor_mensal_beneficio,
      qtd_parcelas:12,
      numero_processo:payload.numero_processo,
    }),
    gen: () => ({
      origem_tipo:'gen', origem_id:novoId,
      cliente_id:payload.cliente_id, nome_cliente:payload.nome_cliente, cpf:payload.cpf,
      tipo_beneficio:payload.tipo_acao || payload.area,
      valor_acao:payload.valor_causa,
      numero_processo:payload.numero_processo,
    }),
    jud: () => ({
      origem_tipo:'jud', origem_id:novoId,
      cliente_id:payload.cliente_id, nome_cliente:payload.nome_cliente, cpf:payload.cpf,
      tipo_beneficio:payload.tipo_beneficio,
      valor_acao:payload.valor_acao,
      valor_mensal:payload.valor_mensal_beneficio,
      qtd_parcelas:payload.qtd_parcelas_deferidas,
      indeterminado:payload.tempo_indeterminado,
      numero_processo:payload.numero_processo,
    }),
  };
  const fn = mapa[type]; if (!fn) return;
  try { await window.MODULOS.criarCobrancaAutomatica(fn()); } catch(e) { console.warn(e); }
}

function tableFor(t) {
  return { adm:'processos_administrativos', jud:'processos_judiciais_inss',
    sal:'salario_maternidade', aux:'auxilio_moradia',
    praz:'prazos_judiciais_auxilio', cob:'controle_cobrancas',
    cli:'clientes', axd:'auxilio_doenca', bpc:'bpc_loas', rec:'recursos' }[t];
}
function moduleFor(t) {
  return { adm:'proc-adm', jud:'proc-jud', sal:'sal-mat',
    aux:'aux-mor', praz:'prazos-aux', cob:'cobrancas',
    cli:'clientes', axd:'aux-doenca', bpc:'bpc', rec:'recursos' }[t];
}

function buildPayload(type) {
  switch(type) {
    case 'adm': {
      const nome = v('adm-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      const tipo = v('adm-tipo');
      const dias = window.CATALOGOS.diasAnaliseINSS(tipo);
      return { numero_processo:v('adm-numero'), numero_proc_judicial:v('adm-proc-jud'),
        nome_cliente:nome, cpf:v('adm-cpf'), tipo_beneficio:tipo,
        cliente_id:v('adm-cliente-id'),
        numero_beneficio:v('adm-nb'),
        processo_judicial_numero:v('adm-proc-jud'),
        motivo_indeferimento:v('adm-motivo-indef'),
        data_protocolo:vd('adm-protocolo'),
        prazo_analise_inss:vd('adm-prazo-analise'),
        dias_prazo_analise:dias,
        resultado_pedido:v('adm-resultado'),
        data_decisao:vd('adm-data-decisao'),
        data_prev_pagamento:vd('adm-prev-pgto'),
        prazo_recurso:vd('adm-prazo-recurso'),
        qtd_parcelas_deferidas:vi('adm-qtd-parc'),
        tempo_indeterminado:document.getElementById('adm-indeterminado')?.checked || false,
        valor_mensal_beneficio:vn('adm-valor-mensal'),
        fase_atual:v('adm-fase'),
        proximo_prazo:vd('adm-prazo'), tipo_prazo:v('adm-tipo-prazo'),
        status:v('adm-status'),
        docs_recebidos:vi('adm-docs-rec'), observacoes:v('adm-obs') };
    }
    case 'jud': {
      const nome = v('jud-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      const parteContraria = v('jud-parte-contraria');
      if (!parteContraria) { toast('Parte contrária é obrigatória.', true); return null; }
      return { numero_processo:v('jud-numero'), numero_proc_adm:v('jud-proc-adm'),
        nome_cliente:nome, cpf:v('jud-cpf'), tipo_beneficio:v('jud-tipo'),
        cliente_id:v('jud-cliente-id'),
        numero_beneficio:v('jud-nb'),
        motivo_indeferimento_adm:document.getElementById('jud-adm-info')?.dataset?.motivo || null,
        parte_contraria:parteContraria,
        valor_acao:vn('jud-valor-acao'),
        qtd_parcelas_deferidas:vi('jud-qtd-parc'),
        tempo_indeterminado:document.getElementById('jud-indeterminado')?.checked || false,
        valor_mensal_beneficio:vn('jud-valor-mensal'),
        vara_tribunal:v('jud-vara'), juiz:v('jud-juiz'), fase_atual:v('jud-fase'),
        data_proxima_audiencia:vd('jud-data-prazo'), tipo_prazo:v('jud-tipo-prazo'),
        status:v('jud-status'), observacoes:v('jud-obs') };
    }
    case 'sal': {
      const nome = v('sal-nome');
      if (!nome) { toast('Nome da cliente é obrigatório.', true); return null; }
      const codTipo = v('sal-tipo');
      const tipoSel = document.getElementById('sal-tipo')?.selectedOptions[0]?.text || null;
      const parcelas = window.MODULOS?.coletarParcelasSalMat?.() || {};
      return { numero_processo:v('sal-numero'), nome_cliente:nome, cpf:v('sal-cpf'),
        cliente_id:v('sal-cliente-id'),
        numero_beneficio:v('sal-nb'),
        dpp:vd('sal-dpp'),
        tipo_salario_mat:tipoSel, tipo_salario_mat_codigo:codTipo,
        qtd_parcelas_efetivas:vi('sal-parcelas-qtd'),
        prorrog_periodo:v('sal-prorrog-periodo'),
        valor_mensal_beneficio:vn('sal-valor'),
        data_protocolo:vd('sal-data-protocolo'),
        prazo_analise_inss:vd('sal-prazo-analise'),
        resultado_pedido:v('sal-resultado'),
        data_decisao:vd('sal-data-decisao'),
        data_prev_pagamento:vd('sal-prev-pgto'),
        data_inicio_pagamento:vd('sal-data-inicio-pgto'),
        prazo_recurso:vd('sal-prazo-recurso'),
        motivo_indeferimento:v('sal-motivo-indef'),
        processo_judicial_numero:v('sal-proc-judicial'),
        forma_pagamento_honor:v('sal-forma-pgto'),
        honorario_total:vn('sal-honor-total'),
        data_cobranca:vd('sal-data-cob'),
        status_honorario:v('sal-status-honor'),
        observacoes:v('sal-obs'),
        ...parcelas };
    }
    case 'cli': {
      const nome = v('cli-nome');
      if (!nome) { toast('Nome é obrigatório.', true); return null; }
      return { nome, cpf:v('cli-cpf'), rg:v('cli-rg'),
        data_nascimento:vd('cli-nasc'),
        telefone:v('cli-telefone'), email:v('cli-email'),
        endereco:v('cli-endereco'), observacoes:v('cli-obs') };
    }
    case 'axd': {
      const nome = v('axd-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      return { numero_processo:v('axd-numero'), nome_cliente:nome, cpf:v('axd-cpf'),
        cliente_id:v('axd-cliente-id'),
        numero_beneficio:v('axd-nb'),
        processo_judicial_numero:v('axd-proc-judicial'),
        motivo_indeferimento:v('axd-motivo-indef'),
        natureza:v('axd-natureza') || 'administrativo',
        data_protocolo:vd('axd-data-protocolo'),
        prazo_analise_inss:vd('axd-prazo-analise'),
        resultado_pedido:v('axd-resultado'),
        data_decisao:vd('axd-data-decisao'),
        data_prev_pagamento:vd('axd-prev-pgto'),
        prazo_recurso:vd('axd-prazo-recurso'),
        valor_mensal_beneficio:vn('axd-valor-mensal'),
        qtd_parcelas_deferidas:vi('axd-qtd-parc'),
        tempo_indeterminado:document.getElementById('axd-indeterminado')?.checked || false,
        vara_tribunal:v('axd-vara'), parte_contraria:v('axd-parte-contraria'),
        valor_acao:vn('axd-valor-acao'), fase_atual:v('axd-fase'),
        proximo_prazo:vd('axd-proximo-prazo'), tipo_prazo:v('axd-tipo-prazo'),
        status:v('axd-status'), observacoes:v('axd-obs') };
    }
    case 'bpc': {
      const nome = v('bpc-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      return { numero_processo:v('bpc-numero'), nome_cliente:nome, cpf:v('bpc-cpf'),
        cliente_id:v('bpc-cliente-id'),
        numero_beneficio:v('bpc-nb'),
        processo_judicial_numero:v('bpc-proc-judicial'),
        motivo_indeferimento:v('bpc-motivo-indef'),
        modalidade:v('bpc-modalidade'),
        natureza:v('bpc-natureza') || 'administrativo',
        data_protocolo:vd('bpc-data-protocolo'),
        prazo_analise_inss:vd('bpc-prazo-analise'),
        resultado_pedido:v('bpc-resultado'),
        data_decisao:vd('bpc-data-decisao'),
        data_prev_pagamento:vd('bpc-prev-pgto'),
        prazo_recurso:vd('bpc-prazo-recurso'),
        valor_mensal_beneficio:vn('bpc-valor-mensal'),
        meses_atrasados:vi('bpc-meses-atrasados'),
        vara_tribunal:v('bpc-vara'), parte_contraria:v('bpc-parte-contraria'),
        valor_acao:vn('bpc-valor-acao'), fase_atual:v('bpc-fase'),
        proximo_prazo:vd('bpc-proximo-prazo'), tipo_prazo:v('bpc-tipo-prazo'),
        status:v('bpc-status'), observacoes:v('bpc-obs') };
    }
    case 'rec': {
      const nome = v('rec-nome');
      if (!nome) { toast('Nome do cliente é obrigatório.', true); return null; }
      const modal = v('rec-modalidade');
      if (!modal) { toast('Selecione a modalidade (recurso adm ou processo judicial).', true); return null; }
      return { nome_cliente:nome, cpf:v('rec-cpf'),
        cliente_id:v('rec-cliente-id'),
        origem_tipo:v('rec-origem-tipo') || 'manual',
        origem_id:v('rec-origem-id') || null,
        numero_requerimento:v('rec-num-req'),
        numero_processo:v('rec-numero'),
        tipo_beneficio:v('rec-tipo-beneficio'),
        modalidade:modal,
        data_protocolo:vd('rec-data-protocolo'),
        prazo_resposta:vd('rec-prazo-resposta'),
        data_decisao:vd('rec-data-decisao'),
        resultado:v('rec-resultado'),
        vara_tribunal:v('rec-vara'), parte_contraria:v('rec-parte-contraria'),
        valor_acao:vn('rec-valor-acao'), fase_atual:v('rec-fase'),
        proximo_prazo:vd('rec-proximo-prazo'), tipo_prazo:v('rec-tipo-prazo'),
        status:v('rec-status'), observacoes:v('rec-obs') };
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
        cliente_id:v('aux-cliente-id'),
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
      const escopo = document.getElementById('modal-praz')?.dataset?.escopo || null;
      const medicoId = v('praz-medico-id');
      return { numero_processo:v('praz-numero'), cliente_medico:nome, cpf:v('praz-cpf'),
        area:v('praz-area'),
        escopo:escopo,
        // Vínculo com médico cadastrado em "Médicos Residentes"
        origem_tipo: medicoId ? 'aux' : null,
        origem_id:   medicoId || null,
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
async function editRecord(type, id) {
  const dataMap = { adm: admData, jud: judData, sal: salData, aux: auxData,
                    praz: prazData, cob: cobData,
                    axd: window.MODULOS?.axdData?.() || [],
                    bpc: window.MODULOS?.bpcData?.() || [],
                    rec: window.MODULOS?.recData?.() || [] };
  let rec = dataMap[type].find(r => r.id === id);
  // Fallback: busca do DB (caso editado via aba unificada de Adm)
  if (!rec) {
    const tbl = tableFor(type);
    if (!tbl) return;
    const { data, error } = await sb.from(tbl).select('*').eq('id', id).single();
    if (error || !data) { toast('Não foi possível carregar o registro.', true); return; }
    rec = data;
  }
  // Limpa estado anterior (campos + linhas condicionais) antes de preencher
  clearForm(type);
  document.getElementById(`modal-${type}-title`).textContent = 'Editar Registro';
  document.getElementById(`modal-${type}`).classList.add('open');
  // espera o modal aparecer para inicializar campos especiais
  setTimeout(() => {
    // Os modais com dropdown dinâmico precisam inicializar ANTES do fillForm
    if (type === 'sal') initSalModal();
    if (type === 'cob') initCobModal();
    if (type === 'adm') initAdmModal();

    fillForm(type, rec);

    // Dispara handlers após o preenchimento para refletir o estado
    if (type === 'sal') {
      document.getElementById('sal-tipo').dispatchEvent(new Event('change'));
      document.getElementById('sal-valor').dispatchEvent(new Event('input'));
    }
    if (type === 'aux')  initAuxModalAfterFill(rec);
    if (type === 'praz') initPrazModalAfterFill(rec);
  }, 0);
}
window.editRecord = editRecord;

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
      set('adm-numero', r.numero_processo); set('adm-proc-jud', r.processo_judicial_numero || r.numero_proc_judicial);
      set('adm-nome', r.nome_cliente); set('adm-cpf', r.cpf);
      set('adm-cliente-id', r.cliente_id);
      set('adm-nb', r.numero_beneficio);
      set('adm-motivo-indef', r.motivo_indeferimento);
      set('adm-tipo', r.tipo_beneficio); set('adm-protocolo', r.data_protocolo?.slice(0,10));
      set('adm-prazo-analise', r.prazo_analise_inss?.slice(0,10));
      set('adm-resultado', r.resultado_pedido);
      set('adm-data-decisao', r.data_decisao?.slice(0,10));
      set('adm-prev-pgto', r.data_prev_pagamento?.slice(0,10));
      set('adm-prazo-recurso', r.prazo_recurso?.slice(0,10));
      set('adm-qtd-parc', r.qtd_parcelas_deferidas);
      if (r.tempo_indeterminado) document.getElementById('adm-indeterminado').checked = true;
      set('adm-valor-mensal', r.valor_mensal_beneficio);
      set('adm-fase', r.fase_atual); set('adm-prazo', r.proximo_prazo?.slice(0,10));
      set('adm-tipo-prazo', r.tipo_prazo);
      set('adm-status', r.status); set('adm-docs-rec', r.docs_recebidos);
      set('adm-obs', r.observacoes);
      // recarrega comportamentos condicionais
      if (window.MODULOS) {
        window.MODULOS.recalcPrazoAdm(); window.MODULOS.atualizarDecisaoAdm();
        window.MODULOS.atualizarParcelasAdm();
      }
      break;
    case 'jud':
      set('jud-numero', r.numero_processo); set('jud-proc-adm', r.numero_proc_adm);
      set('jud-nome', r.nome_cliente); set('jud-cpf', r.cpf);
      set('jud-cliente-id', r.cliente_id);
      set('jud-nb', r.numero_beneficio);
      set('jud-parte-contraria', r.parte_contraria);
      set('jud-tipo', r.tipo_beneficio); set('jud-vara', r.vara_tribunal);
      set('jud-juiz', r.juiz); set('jud-fase', r.fase_atual);
      set('jud-valor-acao', r.valor_acao);
      set('jud-qtd-parc', r.qtd_parcelas_deferidas);
      if (r.tempo_indeterminado) document.getElementById('jud-indeterminado').checked = true;
      set('jud-valor-mensal', r.valor_mensal_beneficio);
      set('jud-data-prazo', r.data_proxima_audiencia?.slice(0,10));
      set('jud-tipo-prazo', r.tipo_prazo);
      set('jud-status', r.status); set('jud-obs', r.observacoes);
      if (window.MODULOS) window.MODULOS.atualizarParcelasJud();
      break;
    case 'sal':
      set('sal-numero', r.numero_processo); set('sal-nome', r.nome_cliente);
      set('sal-cpf', r.cpf); set('sal-dpp', r.dpp?.slice(0,10));
      set('sal-cliente-id', r.cliente_id);
      set('sal-nb', r.numero_beneficio);
      set('sal-tipo', r.tipo_salario_mat_codigo || '');
      set('sal-valor', r.valor_mensal_beneficio);
      set('sal-parcelas-qtd', r.qtd_parcelas_efetivas);
      set('sal-prorrog-periodo', r.prorrog_periodo);
      set('sal-data-protocolo', r.data_protocolo?.slice(0,10));
      set('sal-prazo-analise', r.prazo_analise_inss?.slice(0,10));
      set('sal-resultado', r.resultado_pedido);
      set('sal-data-decisao', r.data_decisao?.slice(0,10));
      set('sal-prev-pgto', r.data_prev_pagamento?.slice(0,10));
      set('sal-data-inicio-pgto', r.data_inicio_pagamento?.slice(0,10));
      set('sal-prazo-recurso', r.prazo_recurso?.slice(0,10));
      set('sal-motivo-indef', r.motivo_indeferimento);
      set('sal-proc-judicial', r.processo_judicial_numero);
      set('sal-forma-pgto', r.forma_pagamento_honor || '30% sobre cada parcela');
      set('sal-honor-total', r.honorario_total);
      set('sal-data-cob', r.data_cobranca?.slice(0,10));
      set('sal-status-honor', r.status_honorario); set('sal-obs', r.observacoes);
      if (window.MODULOS) {
        window.MODULOS.recalcPrazoSalMat(); window.MODULOS.atualizarDecisaoSalMat();
        window.MODULOS.renderParcelasBeneficio(r);
        window.MODULOS.recalcHonorariosSalMat();
        window.MODULOS.carregarGuiasSalMat(r.id).then(g => window.MODULOS.renderGuiasSalMat(g));
      }
      break;
    case 'cli':
      set('cli-nome', r.nome); set('cli-cpf', r.cpf); set('cli-rg', r.rg);
      set('cli-nasc', r.data_nascimento?.slice(0,10));
      set('cli-telefone', r.telefone); set('cli-email', r.email);
      set('cli-endereco', r.endereco); set('cli-obs', r.observacoes);
      break;
    case 'axd':
      set('axd-numero', r.numero_processo); set('axd-nome', r.nome_cliente);
      set('axd-cpf', r.cpf); set('axd-cliente-id', r.cliente_id);
      set('axd-nb', r.numero_beneficio);
      set('axd-proc-judicial', r.processo_judicial_numero);
      set('axd-motivo-indef', r.motivo_indeferimento);
      set('axd-natureza', r.natureza || 'administrativo');
      set('axd-data-protocolo', r.data_protocolo?.slice(0,10));
      set('axd-prazo-analise', r.prazo_analise_inss?.slice(0,10));
      set('axd-resultado', r.resultado_pedido);
      set('axd-data-decisao', r.data_decisao?.slice(0,10));
      set('axd-prev-pgto', r.data_prev_pagamento?.slice(0,10));
      set('axd-prazo-recurso', r.prazo_recurso?.slice(0,10));
      set('axd-valor-mensal', r.valor_mensal_beneficio);
      set('axd-qtd-parc', r.qtd_parcelas_deferidas);
      if (r.tempo_indeterminado) document.getElementById('axd-indeterminado').checked = true;
      set('axd-vara', r.vara_tribunal); set('axd-parte-contraria', r.parte_contraria);
      set('axd-valor-acao', r.valor_acao); set('axd-fase', r.fase_atual);
      set('axd-proximo-prazo', r.proximo_prazo?.slice(0,10));
      set('axd-tipo-prazo', r.tipo_prazo);
      set('axd-status', r.status); set('axd-obs', r.observacoes);
      if (window.MODULOS) {
        window.MODULOS.atualizarNaturezaAxd(); window.MODULOS.atualizarDecisaoAxd();
        window.MODULOS.atualizarHonorAxd();
      }
      break;
    case 'bpc':
      set('bpc-numero', r.numero_processo); set('bpc-nome', r.nome_cliente);
      set('bpc-cpf', r.cpf); set('bpc-cliente-id', r.cliente_id);
      set('bpc-nb', r.numero_beneficio);
      set('bpc-proc-judicial', r.processo_judicial_numero);
      set('bpc-motivo-indef', r.motivo_indeferimento);
      set('bpc-modalidade', r.modalidade); set('bpc-natureza', r.natureza || 'administrativo');
      set('bpc-data-protocolo', r.data_protocolo?.slice(0,10));
      set('bpc-prazo-analise', r.prazo_analise_inss?.slice(0,10));
      set('bpc-resultado', r.resultado_pedido);
      set('bpc-data-decisao', r.data_decisao?.slice(0,10));
      set('bpc-prev-pgto', r.data_prev_pagamento?.slice(0,10));
      set('bpc-prazo-recurso', r.prazo_recurso?.slice(0,10));
      set('bpc-valor-mensal', r.valor_mensal_beneficio);
      set('bpc-meses-atrasados', r.meses_atrasados);
      set('bpc-vara', r.vara_tribunal); set('bpc-parte-contraria', r.parte_contraria);
      set('bpc-valor-acao', r.valor_acao); set('bpc-fase', r.fase_atual);
      set('bpc-proximo-prazo', r.proximo_prazo?.slice(0,10));
      set('bpc-tipo-prazo', r.tipo_prazo);
      set('bpc-status', r.status); set('bpc-obs', r.observacoes);
      if (window.MODULOS) { window.MODULOS.atualizarNaturezaBpc(); window.MODULOS.atualizarDecisaoBpc(); }
      break;
    case 'rec':
      set('rec-origem-tipo', r.origem_tipo); set('rec-origem-id', r.origem_id);
      set('rec-cliente-id', r.cliente_id);
      set('rec-num-req', r.numero_requerimento); set('rec-numero', r.numero_processo);
      set('rec-nome', r.nome_cliente); set('rec-cpf', r.cpf);
      set('rec-tipo-beneficio', r.tipo_beneficio); set('rec-modalidade', r.modalidade);
      set('rec-data-protocolo', r.data_protocolo?.slice(0,10));
      set('rec-prazo-resposta', r.prazo_resposta?.slice(0,10));
      set('rec-data-decisao', r.data_decisao?.slice(0,10));
      set('rec-resultado', r.resultado);
      set('rec-vara', r.vara_tribunal); set('rec-parte-contraria', r.parte_contraria);
      set('rec-valor-acao', r.valor_acao); set('rec-fase', r.fase_atual);
      set('rec-proximo-prazo', r.proximo_prazo?.slice(0,10));
      set('rec-tipo-prazo', r.tipo_prazo);
      set('rec-status', r.status); set('rec-obs', r.observacoes);
      if (window.MODULOS) window.MODULOS.atualizarModalidadeRec();
      break;
    case 'aux':
      set('aux-nome', r.nome_medico); set('aux-cpf', r.cpf);
      set('aux-cliente-id', r.cliente_id);
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
  Object.keys(loaded).forEach(k => loaded[k] = false);
  const ativo = document.querySelector('.nav-item.active')?.dataset.module;
  if (ativo && typeof window.showModule === 'function') window.showModule(ativo);
}
window.deleteRecord = deleteRecord;

/* ── FILTER ──────────────────────────────────────────────────────────── */
window.filterTable = filterTable;

/* ═══════════════════════════════════════════════════════════════════════
   MÓDULO GENÉRICO: Cível / Família / Consumidor / Saúde
   ───────────────────────────────────────────────────────────────────────
   Compartilha a mesma tabela Supabase (acoes_genericas) com campo "area"
   que diferencia os 4 módulos.
   ═══════════════════════════════════════════════════════════════════════ */
const genCache = { CIVEL: [], FAMILIA: [], CONSUMIDOR: [], SAUDE: [] };

const AREA_TO_MODULE = {
  CIVEL: 'civel', FAMILIA: 'familia',
  CONSUMIDOR: 'consumidor', SAUDE: 'saude',
};
const AREA_TO_TBODY = {
  CIVEL: 'civel-body', FAMILIA: 'familia-body',
  CONSUMIDOR: 'consumidor-body', SAUDE: 'saude-body',
};
const AREA_TO_TITULO = {
  CIVEL: 'Nova Ação Cível',
  FAMILIA: 'Nova Ação · Família e Sucessões',
  CONSUMIDOR: 'Nova Ação · Consumidor',
  SAUDE: 'Nova Ação · Direito à Saúde',
};

async function loadGen(area) {
  const { data, error } = await sb.from('acoes_genericas').select('*')
    .eq('area', area).order('proximo_prazo', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar ' + area + '.', true); return; }
  genCache[area] = data || [];
  renderGen(area);
}

function renderGen(area) {
  const tbody = document.getElementById(AREA_TO_TBODY[area]);
  const lista = genCache[area];
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-state">Nenhuma ação cadastrada ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(r => {
    const dias = diffDias(r.proximo_prazo);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)} ${escHtml(r.vara_tribunal)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.parte_contraria)||'—'}</td>
      <td>${escHtml(r.tipo_acao)||'—'}</td>
      <td>${escHtml(r.comarca||'')}${r.vara_tribunal ? ' · '+escHtml(r.vara_tribunal):''}</td>
      <td>${escHtml(r.fase_atual)||'—'}</td>
      <td>${fmtBRL(r.honorarios_contratuais)}</td>
      <td>${fmtDate(r.proximo_prazo)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editAcaoGen('${area}','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAcaoGen('${area}','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function openAcaoGen(area) {
  document.getElementById('form-gen').reset();
  document.getElementById('gen-id').value = '';
  document.getElementById('gen-area').value = area;
  document.getElementById('modal-gen-title').textContent = AREA_TO_TITULO[area];
  document.getElementById('gen-docs-list').innerHTML = '';
  document.getElementById('gen-calc-preview').innerHTML =
    '<em style="color:var(--texto-suave)">Digite o valor da causa para ver o cálculo.</em>';
  document.getElementById('gen-prazo-preview').innerHTML = '';
  document.getElementById('modal-gen').classList.add('open');
  setTimeout(() => initGenModal(area), 0);
}
window.openAcaoGen = openAcaoGen;

function initGenModal(area) {
  // Tipos de ação da área
  const selTipo = document.getElementById('gen-tipo-acao');
  const tipos = TIPOS_ACAO[area] || [];
  selTipo.innerHTML = '<option value="">— Selecione o tipo de ação —</option>' +
    tipos.map(t => `<option value="${t.codigo}">${escHtml(t.nome)}</option>`).join('');

  const selFase = document.getElementById('gen-fase');
  selFase.innerHTML = '<option value="">— Selecione o tipo primeiro —</option>';

  selTipo.onchange = () => {
    const tipo = tipos.find(t => t.codigo === selTipo.value);
    if (!tipo) { selFase.innerHTML = '<option value="">—</option>'; return; }
    // Fases conforme rito
    const fases = window.CATALOGOS.FASES_POR_RITO[tipo.rito] || [];
    selFase.innerHTML = '<option value="">— Selecione a fase —</option>' +
      fases.map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`).join('');
    // Docs sugeridos
    const id = document.getElementById('gen-id').value || 'novo';
    window.UI._ultimoKit = tipo.docs; window.UI._ultimoContainer = 'gen-docs-list';
    carregarDocsELoad('gen', id, tipo.docs, 'gen-docs-list');
  };

  // Comarcas + varas (datalist)
  document.getElementById('lista-comarcas-ce').innerHTML =
    COMARCAS_CE.map(c => `<option value="${escHtml(c)}">`).join('');
  document.getElementById('lista-varas').innerHTML =
    [...VARAS_FORTALEZA, ...VARAS_TRF5_CE].map(v => `<option value="${escHtml(v)}">`).join('');

  // Peças (prazo)
  window.UI.popularPecas(document.getElementById('gen-peca'));
  ['gen-data-intim','gen-peca','gen-fazenda'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => window.UI.calcularEMostrarPrazo({
      dataIntimacaoId:'gen-data-intim', pecaId:'gen-peca',
      fazendaId:'gen-fazenda', outputId:'gen-prazo-preview',
      dataFatalId:'gen-prazo',
    });
  });

  // Calculadora honorários
  const recalc = () => {
    const base = parseFloat(document.getElementById('gen-valor-causa').value || 0);
    const pct  = parseFloat(document.getElementById('gen-pct-honor').value || 0) / 100;
    if (!base || !pct) { document.getElementById('gen-calc-preview').innerHTML = ''; return; }
    const honor = base * pct;
    document.getElementById('gen-calc-preview').innerHTML =
      `Valor da causa: ${window.CALC.fmt(base)} × ${(pct*100).toFixed(2)}%<br>` +
      `<span class="destaque">Honorários sugeridos: ${window.CALC.fmt(honor)}</span>`;
    if (!document.getElementById('gen-honor-contr').value) {
      set('gen-honor-contr', honor.toFixed(2));
    }
  };
  ['gen-valor-causa','gen-pct-honor'].forEach(id => {
    document.getElementById(id).oninput = recalc;
  });
}

async function saveAcaoGen() {
  const id   = document.getElementById('gen-id').value;
  const area = document.getElementById('gen-area').value;
  const nome = v('gen-nome');
  if (!nome) { toast('Nome do cliente é obrigatório.', true); return; }
  const parteContraria = v('gen-parte-contraria');
  if (!parteContraria) { toast('Parte contrária é obrigatória.', true); return; }

  // Upsert cliente central
  let clienteId = v('gen-cliente-id');
  if (window.MODULOS?.upsertClienteDoFormulario) {
    try { clienteId = await window.MODULOS.upsertClienteDoFormulario('gen'); } catch(e) { console.warn(e); }
  }

  const selTipo = document.getElementById('gen-tipo-acao');
  const payload = {
    area,
    cliente_id: clienteId,
    nome_cliente: nome,
    cpf: v('gen-cpf'),
    telefone: v('gen-telefone'),
    email: v('gen-email'),
    endereco_cliente: v('gen-endereco'),
    parte_contraria: v('gen-parte-contraria'),
    parte_contraria_doc: v('gen-pc-doc'),
    parte_contraria_endereco: v('gen-pc-endereco'),
    numero_processo: v('gen-numero'),
    status: v('gen-status'),
    observacoes: v('gen-obs'),
    tipo_acao_codigo: v('gen-tipo-acao'),
    tipo_acao: selTipo.selectedOptions[0]?.text || null,
    fase_atual: v('gen-fase'),
    data_distribuicao: vd('gen-data-dist'),
    data_citacao: vd('gen-data-citac'),
    comarca: v('gen-comarca'),
    vara_tribunal: v('gen-vara'),
    juiz: v('gen-juiz'),
    fazenda_publica: document.getElementById('gen-fazenda')?.checked || false,
    valor_causa: vn('gen-valor-causa'),
    pct_honorarios: vn('gen-pct-honor'),
    honorarios_contratuais: vn('gen-honor-contr'),
    honorarios_sucumbenciais: vn('gen-honor-suc'),
    data_intimacao: vd('gen-data-intim'),
    peca_codigo: v('gen-peca'),
    proximo_prazo: vd('gen-prazo'),
    tipo_prazo: v('gen-tipo-prazo'),
  };

  let err, novoId = id;
  if (id) {
    ({ error: err } = await sb.from('acoes_genericas').update(payload).eq('id', id));
  } else {
    const { data, error } = await sb.from('acoes_genericas').insert(payload).select('id').single();
    err = error;
    if (data) novoId = data.id;
  }
  if (err) { toast('Erro ao salvar: ' + err.message, true); return; }

  // Auto-cobrança ao criar
  if (novoId && !id && window.MODULOS?.criarCobrancaAutomatica) {
    try {
      await window.MODULOS.criarCobrancaAutomatica({
        origem_tipo:'gen', origem_id:novoId,
        cliente_id:clienteId, nome_cliente:nome, cpf:v('gen-cpf'),
        tipo_beneficio: payload.tipo_acao || area,
        valor_acao: payload.valor_causa,
        numero_processo: payload.numero_processo,
      });
    } catch(e) { console.warn(e); }
  }

  toast(id ? 'Registro atualizado!' : 'Registro criado!');
  closeModal('gen');
  Object.keys(loaded).forEach(k => loaded[k] = false);
  const ativo = document.querySelector('.nav-item.active')?.dataset.module;
  if (ativo && typeof window.showModule === 'function') window.showModule(ativo);
}
window.saveAcaoGen = saveAcaoGen;

function editAcaoGen(area, id) {
  const rec = (genCache[area] || []).find(r => r.id === id);
  if (!rec) return;
  document.getElementById('form-gen').reset();
  document.getElementById('gen-id').value = id;
  document.getElementById('gen-area').value = area;
  document.getElementById('modal-gen-title').textContent = 'Editar Ação';
  document.getElementById('modal-gen').classList.add('open');

  set('gen-nome', rec.nome_cliente); set('gen-cpf', rec.cpf);
  set('gen-telefone', rec.telefone); set('gen-email', rec.email);
  set('gen-endereco', rec.endereco_cliente);
  set('gen-parte-contraria', rec.parte_contraria);
  set('gen-pc-doc', rec.parte_contraria_doc);
  set('gen-pc-endereco', rec.parte_contraria_endereco);
  set('gen-numero', rec.numero_processo);
  set('gen-status', rec.status); set('gen-obs', rec.observacoes);
  set('gen-comarca', rec.comarca); set('gen-vara', rec.vara_tribunal);
  set('gen-juiz', rec.juiz);
  if (rec.fazenda_publica) document.getElementById('gen-fazenda').checked = true;
  set('gen-valor-causa', rec.valor_causa); set('gen-pct-honor', rec.pct_honorarios || 30);
  set('gen-honor-contr', rec.honorarios_contratuais);
  set('gen-honor-suc', rec.honorarios_sucumbenciais);
  set('gen-data-intim', rec.data_intimacao?.slice(0,10));
  set('gen-prazo', rec.proximo_prazo?.slice(0,10));
  set('gen-tipo-prazo', rec.tipo_prazo);
  set('gen-data-dist', rec.data_distribuicao?.slice(0,10));
  set('gen-data-citac', rec.data_citacao?.slice(0,10));

  setTimeout(() => {
    initGenModal(area);
    const selTipo = document.getElementById('gen-tipo-acao');
    selTipo.value = rec.tipo_acao_codigo || '';
    selTipo.onchange();  // dispara cascata para popular fase e docs
    document.getElementById('gen-fase').value = rec.fase_atual || '';
    if (rec.peca_codigo) document.getElementById('gen-peca').value = rec.peca_codigo;
  }, 0);
}
window.editAcaoGen = editAcaoGen;

async function deleteAcaoGen(area, id) {
  if (!confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
  const { error } = await sb.from('acoes_genericas').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', true); return; }
  toast('Registro excluído.');
  Object.keys(loaded).forEach(k => loaded[k] = false);
  const ativo = document.querySelector('.nav-item.active')?.dataset.module;
  if (ativo && typeof window.showModule === 'function') window.showModule(ativo);
}
window.deleteAcaoGen = deleteAcaoGen;

/* ── FECHAR MODAL CLICANDO FORA ──────────────────────────────────────── */
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

/* ═══════════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO — fica no FIM da IIFE para garantir que todas as funções
   e constantes (especialmente `loaded` e `loadModule`) já existam quando
   o dashboard for carregado. Evita ReferenceError de TDZ.
   ═══════════════════════════════════════════════════════════════════════ */
function inicializar(session) {
  currentUser = session?.user || null;
  const emailEl = document.getElementById('user-email');
  if (emailEl && currentUser) emailEl.textContent = currentUser.email;
  setDate();
  // Adia para o próximo tick — assim o extras.js já reescreveu window.showModule
  // e o dashboard categorizado é chamado corretamente no primeiro load.
  setTimeout(() => {
    if (typeof window.showModule === 'function') window.showModule('dashboard');
    else loadModule('dashboard');
  }, 0);
}
window.__inicializar__ = inicializar;

if (window.__SESSION__?.user) {
  inicializar(window.__SESSION__);
} else {
  (async () => {
    const { data } = await sb.auth.getSession();
    if (!data.session) { window.location.replace('../index.html'); return; }
    inicializar(data.session);
  })();
}

})();
