/* ═══════════════════════════════════════════════════════════════════════════
   EXTRAS — M&SM Advocacia (Melhorias v2)
   ───────────────────────────────────────────────────────────────────────────
   - Clientes (cadastro central + autocomplete cross-módulo)
   - Auxílio-Doença, BPC, Recursos (novos módulos)
   - Guias múltiplas de salário-maternidade
   - Dashboard categorizado (guias, cobranças, prazos jud/adm)
   - Auto-criação de cobranças
   - Fluxo deferimento/indeferimento + prazos automáticos
   - Prazos judiciais cross-área (Cível, Saúde)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

if (!window.APP || !window.CATALOGOS) return;

const { sb, diffDias, fmtDate, fmtBRL, badgeHtml, statusBadge, escHtml, toast,
        filterTable, v, vd, vn, vi, set } = window.APP;
const { PRAZOS_ANALISE_INSS, diasAnaliseINSS } = window.CATALOGOS;

/* ── CACHE DE CLIENTES ──────────────────────────────────────────────────── */
let clientesCache = [];
async function carregarClientes() {
  const { data, error } = await sb.from('clientes').select('*').order('nome');
  if (error) { console.error(error); return []; }
  clientesCache = data || [];
  popularDatalists();
  return clientesCache;
}

function popularDatalists() {
  const html = clientesCache.map(c =>
    `<option value="${escHtml(c.nome)}${c.cpf ? ' · ' + escHtml(c.cpf) : ''}">`).join('');
  ['adm','sal','jud','gen','axd','bpc','rec','aux'].forEach(prefix => {
    const dl = document.getElementById('lista-clientes-' + prefix);
    if (dl) dl.innerHTML = html;
  });
}

function aplicarClienteSelecionado(prefix, valor) {
  if (!valor) return;
  const partes = valor.split('·').map(s => s.trim());
  const nome = partes[0];
  const cpf  = partes[1];
  const cli = clientesCache.find(c =>
    (c.nome === nome) || (cpf && c.cpf === cpf));
  if (!cli) return;
  set(prefix + '-cliente-id', cli.id);
  const nomeField = document.getElementById(prefix + '-nome');
  const cpfField  = document.getElementById(prefix + '-cpf');
  if (nomeField) nomeField.value = cli.nome;
  if (cpfField && cli.cpf) cpfField.value = cli.cpf;
}

async function upsertClienteDoFormulario(prefix) {
  const clienteIdAtual = v(prefix + '-cliente-id');
  if (clienteIdAtual) return clienteIdAtual;
  const nome = v(prefix + '-nome');
  const cpf  = v(prefix + '-cpf');
  if (!nome) return null;
  if (cpf) {
    const exist = clientesCache.find(c => c.cpf === cpf);
    if (exist) {
      set(prefix + '-cliente-id', exist.id);
      return exist.id;
    }
  }
  const { data, error } = await sb.from('clientes').insert({
    nome, cpf,
    telefone: v(prefix + '-telefone'),
    email:    v(prefix + '-email'),
    endereco: v(prefix + '-endereco'),
  }).select('id').single();
  if (error) { console.warn('cliente já existe ou erro:', error.message); return null; }
  set(prefix + '-cliente-id', data.id);
  await carregarClientes();
  return data.id;
}

/* ── CADASTRO DE CLIENTES (módulo) ─────────────────────────────────────── */
async function loadClientesModule() {
  await carregarClientes();
  const tbody = document.getElementById('cli-body');
  if (!tbody) return;
  if (!clientesCache.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhum cliente cadastrado.</td></tr>';
    return;
  }
  const contagens = await contarProcessosPorCliente();
  tbody.innerHTML = clientesCache.map(c => `
    <tr data-search="${escHtml(c.nome)} ${escHtml(c.cpf)} ${escHtml(c.telefone)}">
      <td><strong>${escHtml(c.nome)}</strong></td>
      <td>${escHtml(c.cpf)||'—'}</td>
      <td>${escHtml(c.telefone)||'—'}</td>
      <td>${escHtml(c.email)||'—'}</td>
      <td>${contagens[c.id] || 0}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editCliente('${c.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCliente('${c.id}')">Del</button>
      </td>
    </tr>`).join('');
}

async function contarProcessosPorCliente() {
  const tables = ['processos_administrativos','processos_judiciais_inss',
    'salario_maternidade','acoes_genericas','auxilio_moradia',
    'auxilio_doenca','bpc_loas','recursos'];
  const contagens = {};
  for (const tbl of tables) {
    const { data } = await sb.from(tbl).select('cliente_id').not('cliente_id','is',null);
    (data || []).forEach(r => { contagens[r.cliente_id] = (contagens[r.cliente_id]||0) + 1; });
  }
  return contagens;
}

function editCliente(id) {
  const c = clientesCache.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-cli-title').textContent = 'Editar Cliente';
  document.getElementById('modal-cli').classList.add('open');
  set('cli-id', c.id); set('cli-nome', c.nome); set('cli-cpf', c.cpf);
  set('cli-rg', c.rg); set('cli-nasc', c.data_nascimento?.slice(0,10));
  set('cli-telefone', c.telefone); set('cli-email', c.email);
  set('cli-endereco', c.endereco); set('cli-obs', c.observacoes);
}
window.editCliente = editCliente;

async function deleteCliente(id) {
  if (!confirm('Excluir este cliente? Os processos vinculados manterão o nome, mas perderão o vínculo.')) return;
  const { error } = await sb.from('clientes').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, true); return; }
  toast('Cliente excluído.');
  await loadClientesModule();
}
window.deleteCliente = deleteCliente;

/* ── PRAZO ADM (data_protocolo + N dias por tipo de benefício) ─────────── */
function recalcPrazoAdm() {
  const tipo = v('adm-tipo');
  const protocolo = vd('adm-protocolo');
  const dias = diasAnaliseINSS(tipo);
  const info = document.getElementById('adm-prazo-info');
  if (info) info.textContent = tipo ? ` (${dias} dias após protocolo)` : '';
  if (protocolo && dias) {
    set('adm-prazo-analise', window.PRAZOS.somarDias(protocolo, dias));
  }
  // mostra/esconde linhas de parcelas conforme tipo
  const tipoLower = (tipo||'').toLowerCase();
  const ehAuxDoenca = tipoLower.includes('auxílio') && (tipoLower.includes('incapacidade') || tipoLower.includes('doença'));
  const rowParc = document.getElementById('adm-row-parcelas');
  const rowVal  = document.getElementById('adm-row-valor');
  if (rowParc) rowParc.style.display = ehAuxDoenca ? '' : 'none';
  if (rowVal)  rowVal.style.display  = ehAuxDoenca ? '' : 'none';
}

function atualizarDecisaoAdm() {
  const result = v('adm-resultado');
  const dataDec = vd('adm-data-decisao');
  const rowRec = document.getElementById('adm-row-recurso');
  const rowPgto = document.getElementById('adm-row-prevpgto');
  if (rowRec)  rowRec.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowPgto) rowPgto.style.display = (result === 'Deferido') ? '' : '';
  if (result === 'Indeferido' && dataDec) {
    set('adm-prazo-recurso', window.PRAZOS.somarDias(dataDec, 30));
  }
}

function atualizarParcelasAdm() {
  const indet = document.getElementById('adm-indeterminado')?.checked;
  const parcInp = document.getElementById('adm-qtd-parc');
  if (parcInp) parcInp.disabled = indet;
  // preview de honorários
  const valor = vn('adm-valor-mensal');
  const qtd = indet ? 12 : (vi('adm-qtd-parc') || 0);
  if (valor && qtd) {
    const honor = valor * qtd * 0.30;
    set('adm-honor-preview', honor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) +
      (indet ? ' (estimativa 12 meses)' : ''));
  } else {
    set('adm-honor-preview', '');
  }
}

/* ── PRAZO SAL-MAT (data_protocolo + 30 dias) ──────────────────────────── */
function recalcPrazoSalMat() {
  const protocolo = vd('sal-data-protocolo');
  if (protocolo) set('sal-prazo-analise', window.PRAZOS.somarDias(protocolo, 30));
}

function atualizarDecisaoSalMat() {
  const result = v('sal-resultado');
  const dataDec = vd('sal-data-decisao');
  const rowRec = document.getElementById('sal-row-recurso');
  const rowPgto = document.getElementById('sal-row-prevpgto');
  if (rowRec)  rowRec.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowPgto) rowPgto.style.display = (result === 'Deferido')   ? '' : 'none';
  if (result === 'Indeferido' && dataDec) {
    set('sal-prazo-recurso', window.PRAZOS.somarDias(dataDec, 30));
  }
}

/* ── GUIAS DO SAL-MAT (até 3) ──────────────────────────────────────────── */
function renderGuiasSalMat(guias = []) {
  const container = document.getElementById('sal-guias-container');
  if (!container) return;
  let html = '';
  for (let i = 1; i <= 3; i++) {
    const g = guias.find(x => x.ordem === i) || {};
    html += `
      <div class="guia-block" style="border:1px solid rgba(184,145,74,.25); padding:.8rem 1rem; border-radius:6px; margin-bottom:.7rem;">
        <div style="font-weight:600; margin-bottom:.5rem;">Guia ${i}</div>
        <input type="hidden" data-guia-id="${i}" value="${g.id || ''}">
        <div class="form-row">
          <div class="form-group"><label>Nº Guia</label><input type="text" data-guia-numero="${i}" value="${escHtml(g.numero_guia||'')}"></div>
          <div class="form-group"><label>Competência (MM/AAAA)</label><input type="text" data-guia-comp="${i}" placeholder="MM/AAAA" value="${escHtml(g.competencia||'')}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Vencimento</label><input type="date" data-guia-venc="${i}" value="${g.data_vencimento?.slice(0,10) || ''}"></div>
          <div class="form-group"><label>Valor (R$)</label><input type="number" step="0.01" data-guia-valor="${i}" value="${g.valor_guia||''}"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Status</label>
            <select data-guia-status="${i}">
              <option ${g.status_guia==='Pendente' ? 'selected':''}>Pendente</option>
              <option ${g.status_guia==='Pago'     ? 'selected':''}>Pago</option>
              <option ${g.status_guia==='Atrasado' ? 'selected':''}>Atrasado</option>
            </select>
          </div>
          <div class="form-group"><label>Data Pagamento</label><input type="date" data-guia-pago="${i}" value="${g.data_pagamento?.slice(0,10) || ''}"></div>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

function coletarGuiasSalMat() {
  const arr = [];
  for (let i = 1; i <= 3; i++) {
    const numero = document.querySelector(`[data-guia-numero="${i}"]`)?.value?.trim();
    const comp   = document.querySelector(`[data-guia-comp="${i}"]`)?.value?.trim();
    const venc   = document.querySelector(`[data-guia-venc="${i}"]`)?.value;
    const valor  = document.querySelector(`[data-guia-valor="${i}"]`)?.value;
    const status = document.querySelector(`[data-guia-status="${i}"]`)?.value;
    const pago   = document.querySelector(`[data-guia-pago="${i}"]`)?.value;
    if (numero || comp || venc || valor) {
      arr.push({
        ordem: i, numero_guia: numero || null, competencia: comp || null,
        data_vencimento: venc || null, valor_guia: valor ? Number(valor) : null,
        status_guia: status || 'Pendente', data_pagamento: pago || null,
      });
    }
  }
  return arr;
}

async function salvarGuiasSalMat(salMatId, guias) {
  if (!salMatId) return;
  await sb.from('guias_sal_mat').delete().eq('sal_mat_id', salMatId);
  if (!guias.length) return;
  const payload = guias.map(g => ({ ...g, sal_mat_id: salMatId }));
  const { error } = await sb.from('guias_sal_mat').insert(payload);
  if (error) console.warn('Erro ao salvar guias:', error.message);
}

async function carregarGuiasSalMat(salMatId) {
  if (!salMatId) return [];
  const { data } = await sb.from('guias_sal_mat').select('*').eq('sal_mat_id', salMatId).order('ordem');
  return data || [];
}

/* ── AUX-DOENÇA ────────────────────────────────────────────────────────── */
let axdData = [];
async function loadAxd() {
  const { data, error } = await sb.from('auxilio_doenca').select('*').order('proximo_prazo', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar auxílio-doença.', true); return; }
  axdData = data || []; renderAxd();
}
function renderAxd() {
  const tbody = document.getElementById('axd-body');
  if (!tbody) return;
  if (!axdData.length) { tbody.innerHTML = '<tr><td colspan="13" class="empty-state">Nenhum registro.</td></tr>'; return; }
  tbody.innerHTML = axdData.map(r => {
    const dias = diffDias(r.proximo_prazo);
    const parcelasTxt = r.tempo_indeterminado ? 'Indeterminado' : (r.qtd_parcelas_deferidas || '—');
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${escHtml(r.natureza)||'—'}</td>
      <td>${fmtDate(r.data_protocolo)}</td>
      <td>${fmtDate(r.prazo_analise_inss)}</td>
      <td>${statusBadge(r.resultado_pedido)}</td>
      <td>${parcelasTxt}</td>
      <td>${fmtDate(r.proximo_prazo)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('axd','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('axd','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function recalcPrazoAxd() {
  const protocolo = vd('axd-data-protocolo');
  if (protocolo) set('axd-prazo-analise', window.PRAZOS.somarDias(protocolo, 45));
}

function atualizarDecisaoAxd() {
  const result = v('axd-resultado');
  const dataDec = vd('axd-data-decisao');
  const rowRec  = document.getElementById('axd-row-recurso');
  if (rowRec) rowRec.style.display = (result === 'Indeferido') ? '' : 'none';
  if (result === 'Indeferido' && dataDec) {
    set('axd-prazo-recurso', window.PRAZOS.somarDias(dataDec, 30));
  }
}

function atualizarNaturezaAxd() {
  const nat = v('axd-natureza');
  const jud1 = document.getElementById('axd-row-judicial');
  const jud2 = document.getElementById('axd-row-judicial-2');
  if (jud1) jud1.style.display = (nat === 'judicial') ? '' : 'none';
  if (jud2) jud2.style.display = (nat === 'judicial') ? '' : 'none';
}

function atualizarHonorAxd() {
  const valor = vn('axd-valor-mensal');
  const indet = document.getElementById('axd-indeterminado')?.checked;
  const qtd   = indet ? 12 : (vi('axd-qtd-parc') || 0);
  if (valor && qtd) {
    const honor = valor * qtd * 0.30;
    set('axd-honor-preview', honor.toLocaleString('pt-BR', { style:'currency', currency:'BRL' }) +
      (indet ? ' (estimativa 12 meses)' : ''));
  } else {
    set('axd-honor-preview', '');
  }
  const parcInp = document.getElementById('axd-qtd-parc');
  if (parcInp) parcInp.disabled = indet;
}

/* ── BPC ───────────────────────────────────────────────────────────────── */
let bpcData = [];
async function loadBpc() {
  const { data, error } = await sb.from('bpc_loas').select('*').order('proximo_prazo', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar BPC.', true); return; }
  bpcData = data || []; renderBpc();
}
function renderBpc() {
  const tbody = document.getElementById('bpc-body');
  if (!tbody) return;
  if (!bpcData.length) { tbody.innerHTML = '<tr><td colspan="13" class="empty-state">Nenhum BPC cadastrado.</td></tr>'; return; }
  tbody.innerHTML = bpcData.map(r => {
    const dias = diffDias(r.proximo_prazo);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.numero_processo)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.cpf)||'—'}</td>
      <td>${escHtml(r.modalidade)||'—'}</td>
      <td>${escHtml(r.natureza)||'—'}</td>
      <td>${fmtDate(r.data_protocolo)}</td>
      <td>${fmtDate(r.prazo_analise_inss)}</td>
      <td>${statusBadge(r.resultado_pedido)}</td>
      <td>${fmtDate(r.proximo_prazo)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('bpc','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('bpc','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function recalcPrazoBpc() {
  const protocolo = vd('bpc-data-protocolo');
  if (protocolo) set('bpc-prazo-analise', window.PRAZOS.somarDias(protocolo, 90));
}

function atualizarDecisaoBpc() {
  const result = v('bpc-resultado');
  const dataDec = vd('bpc-data-decisao');
  const rowRec  = document.getElementById('bpc-row-recurso');
  const rowPgto = document.getElementById('bpc-row-prevpgto');
  if (rowRec)  rowRec.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowPgto) rowPgto.style.display = (result === 'Deferido')   ? '' : 'none';
  if (result === 'Indeferido' && dataDec) {
    set('bpc-prazo-recurso', window.PRAZOS.somarDias(dataDec, 30));
  }
}

function atualizarNaturezaBpc() {
  const nat = v('bpc-natureza');
  const jud1 = document.getElementById('bpc-row-judicial');
  const jud2 = document.getElementById('bpc-row-judicial-2');
  if (jud1) jud1.style.display = (nat === 'judicial') ? '' : 'none';
  if (jud2) jud2.style.display = (nat === 'judicial') ? '' : 'none';
}

/* ── PROCESSO JUDICIAL INSS — parcelas conforme tipo ───────────────────── */
function atualizarParcelasJud() {
  const tipo = (v('jud-tipo') || '').toLowerCase();
  const ehAuxDoenca = tipo.includes('auxílio') && (tipo.includes('incapacidade') || tipo.includes('doença'));
  const rowParc = document.getElementById('jud-row-parcelas');
  const rowVal  = document.getElementById('jud-row-valor-mensal');
  if (rowParc) rowParc.style.display = ehAuxDoenca ? '' : 'none';
  if (rowVal)  rowVal.style.display  = ehAuxDoenca ? '' : 'none';
}

/* ── RECURSOS ──────────────────────────────────────────────────────────── */
let recData = [];
async function loadRec() {
  const { data, error } = await sb.from('recursos').select('*').order('proximo_prazo', { ascending: true, nullsFirst: false });
  if (error) { toast('Erro ao carregar recursos.', true); return; }
  recData = data || []; renderRec();
}
function renderRec() {
  const tbody = document.getElementById('rec-body');
  if (!tbody) return;
  if (!recData.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Nenhum recurso cadastrado.</td></tr>'; return; }
  tbody.innerHTML = recData.map(r => {
    const dias = diffDias(r.proximo_prazo);
    return `<tr data-search="${escHtml(r.nome_cliente)} ${escHtml(r.cpf)} ${escHtml(r.numero_requerimento)} ${escHtml(r.numero_processo)}">
      <td>${badgeHtml(dias)}</td>
      <td>${escHtml(r.modalidade)||'—'}</td>
      <td>${escHtml(r.numero_requerimento)||'—'}</td>
      <td><strong>${escHtml(r.nome_cliente)}</strong></td>
      <td>${escHtml(r.tipo_beneficio)||'—'}</td>
      <td>${fmtDate(r.data_protocolo)}</td>
      <td>${statusBadge(r.resultado)}</td>
      <td>${fmtDate(r.proximo_prazo)}</td>
      <td>${dias !== null ? dias + ' dias' : '—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="editRecord('rec','${r.id}')">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteRecord('rec','${r.id}')">Del</button>
      </td>
    </tr>`;
  }).join('');
}

function recalcPrazoRec() {
  const protocolo = vd('rec-data-protocolo');
  const modal = v('rec-modalidade');
  if (!protocolo) return;
  // Recurso administrativo CRPS: 30 dias corridos
  // Processo judicial: prazo fica em aberto (depende da fase)
  if (modal === 'Recurso Administrativo') {
    set('rec-prazo-resposta', window.PRAZOS.somarDias(protocolo, 30));
  }
}

function atualizarModalidadeRec() {
  const modal = v('rec-modalidade');
  const ehJud = (modal === 'Processo Judicial');
  document.getElementById('rec-row-judicial').style.display = ehJud ? '' : 'none';
  document.getElementById('rec-row-judicial-2').style.display = ehJud ? '' : 'none';
  recalcPrazoRec();
}

let _buscaCache = {};
async function buscarRequerimento(termo) {
  const out = document.getElementById('rec-busca-resultado');
  if (!out) return;
  if (!termo || termo.length < 3) { out.innerHTML = ''; return; }
  const tabelas = [
    { tbl: 'processos_administrativos', tipo: 'adm', label: 'Proc. Administrativo INSS' },
    { tbl: 'salario_maternidade',       tipo: 'sal', label: 'Salário-Maternidade' },
    { tbl: 'auxilio_doenca',            tipo: 'axd', label: 'Auxílio-Doença' },
    { tbl: 'bpc_loas',                  tipo: 'bpc', label: 'BPC/LOAS' },
    { tbl: 'processos_judiciais_inss',  tipo: 'jud', label: 'Proc. Judicial INSS' },
  ];
  const achados = [];
  for (const { tbl, tipo, label } of tabelas) {
    const sel = tbl === 'salario_maternidade'
      ? 'id,numero_processo,nome_cliente,cpf,cliente_id'
      : 'id,numero_processo,nome_cliente,cpf,tipo_beneficio,cliente_id';
    const { data } = await sb.from(tbl).select(sel)
      .ilike('numero_processo', '%' + termo + '%').limit(3);
    (data || []).forEach(r => achados.push({ ...r, _tipo: tipo, _label: label,
      tipo_beneficio: r.tipo_beneficio || (tbl === 'salario_maternidade' ? 'Salário-Maternidade' :
                                           tbl === 'auxilio_doenca'      ? 'Auxílio-Doença'      :
                                           tbl === 'bpc_loas'            ? 'BPC/LOAS'            : null) }));
  }
  if (!achados.length) { out.innerHTML = '<em>Nenhum requerimento encontrado.</em>'; return; }
  _buscaCache = {};
  out.innerHTML = achados.map((r, i) => {
    const key = `req_${i}`;
    _buscaCache[key] = r;
    return `<div class="rec-busca-item" data-key="${key}" style="cursor:pointer; padding:.4rem .5rem; border:1px solid rgba(184,145,74,.25); margin-top:.3rem; border-radius:4px; background:#fff;">
       <strong>${escHtml(r._label)}</strong> · ${escHtml(r.numero_processo||'—')} · ${escHtml(r.nome_cliente)}
     </div>`;
  }).join('');
  out.querySelectorAll('.rec-busca-item').forEach(div => {
    div.addEventListener('click', () => {
      const r = _buscaCache[div.dataset.key];
      if (r) selecionarRequerimento(r._tipo, r.id, r);
    });
  });
}

function selecionarRequerimento(tipo, id, dados) {
  set('rec-origem-tipo', tipo);
  set('rec-origem-id',   id);
  set('rec-num-req', dados.numero_processo);
  set('rec-nome',    dados.nome_cliente);
  set('rec-cpf',     dados.cpf);
  set('rec-tipo-beneficio', dados.tipo_beneficio);
  if (dados.cliente_id) set('rec-cliente-id', dados.cliente_id);
  document.getElementById('rec-busca-resultado').innerHTML =
    '<span style="color:var(--verde)">✓ Requerimento vinculado.</span>';
}

function criarRecursoDe(prefix) {
  // Abre o modal de recurso preenchido com os dados do registro atual
  const id = v(prefix + '-id');
  if (!id) { toast('Salve o registro antes de criar um recurso.', true); return; }
  document.getElementById('modal-' + prefix)?.classList.remove('open');
  document.getElementById('modal-rec').classList.add('open');
  document.getElementById('form-rec').reset();
  set('rec-id', '');
  set('rec-origem-tipo', prefix);
  set('rec-origem-id', id);
  set('rec-num-req',  v(prefix + '-numero'));
  set('rec-nome',     v(prefix + '-nome'));
  set('rec-cpf',      v(prefix + '-cpf'));
  set('rec-tipo-beneficio', v(prefix + '-tipo') || (prefix === 'sal' ? 'Salário-Maternidade' :
                                                    prefix === 'axd' ? 'Auxílio-Doença' :
                                                    prefix === 'bpc' ? 'BPC/LOAS' : ''));
  set('rec-cliente-id', v(prefix + '-cliente-id'));
  document.getElementById('modal-rec-title').textContent = 'Novo Recurso vinculado';
}

/* ── DASHBOARD CATEGORIZADO ────────────────────────────────────────────── */
async function loadDashboardCategorizado() {
  const [adm, jud, aux, sal, praz, gen, axd, bpc, rec, cobr, guias] = await Promise.all([
    sb.from('processos_administrativos').select('id,nome_cliente,proximo_prazo,prazo_analise_inss,prazo_recurso,resultado_pedido,tipo_beneficio,status'),
    sb.from('processos_judiciais_inss').select('id,nome_cliente,data_proxima_audiencia,tipo_prazo,status,tipo_beneficio'),
    sb.from('auxilio_moradia').select('id,nome_medico,proximo_prazo,status'),
    sb.from('salario_maternidade').select('id,nome_cliente,prazo_analise_inss,prazo_recurso,resultado_pedido,status_guia'),
    sb.from('prazos_judiciais_auxilio').select('id,cliente_medico,proximo_prazo,status,tipo_acao,peca_sugerida,escopo'),
    sb.from('acoes_genericas').select('id,nome_cliente,proximo_prazo,status,area,tipo_acao'),
    sb.from('auxilio_doenca').select('id,nome_cliente,proximo_prazo,prazo_analise_inss,prazo_recurso,resultado_pedido,natureza,status'),
    sb.from('bpc_loas').select('id,nome_cliente,proximo_prazo,prazo_analise_inss,prazo_recurso,resultado_pedido,natureza,status'),
    sb.from('recursos').select('id,nome_cliente,proximo_prazo,prazo_resposta,modalidade,status,tipo_beneficio'),
    sb.from('controle_cobrancas').select('id,nome_cliente,tipo_beneficio,numero_parcela,valor_parcela,data_limite_pgto,status,origem_tipo'),
    sb.from('guias_sal_mat').select('id,ordem,competencia,numero_guia,data_vencimento,status_guia,sal_mat_id'),
  ]);

  // Mapeia nome do cliente do sal_mat para suas guias
  const salById = {};
  (sal.data || []).forEach(s => { salById[s.id] = s.nome_cliente; });

  // ── 1) Guias INSS
  const guiasItens = (guias.data || []).map(g => ({
    nome: salById[g.sal_mat_id] || '—',
    prazo: g.data_vencimento,
    competencia: g.competencia,
    numero: g.numero_guia,
    status: g.status_guia,
  })).filter(g => g.prazo).map(g => ({ ...g, dias: diffDias(g.prazo) }))
     .sort((a,b) => (a.dias??9999)-(b.dias??9999));

  // ── 2) Cobranças de honorários
  const cobrItens = (cobr.data || []).filter(c => c.data_limite_pgto && c.status !== '🟢 Pago' && c.status !== 'Pago')
    .map(c => ({
      nome: c.nome_cliente, origem: c.tipo_beneficio || c.origem_tipo || '—',
      parcela: c.numero_parcela, valor: c.valor_parcela,
      prazo: c.data_limite_pgto, status: c.status,
      dias: diffDias(c.data_limite_pgto),
    })).sort((a,b) => (a.dias??9999)-(b.dias??9999));

  // ── 3) Prazos JUDICIAIS (jud INSS + aux moradia + prazos_jud + ações genéricas + axd/bpc judiciais + recursos judiciais)
  const judItens = [
    ...(jud.data||[]).map(r => ({ nome:r.nome_cliente, modulo:'Jud. INSS', tipo:r.tipo_prazo||r.tipo_beneficio||'—', prazo:r.data_proxima_audiencia, status:r.status })),
    ...(aux.data||[]).map(r => ({ nome:r.nome_medico, modulo:'Aux. Moradia', tipo:'—', prazo:r.proximo_prazo, status:r.status })),
    ...(praz.data||[]).map(r => ({ nome:r.cliente_medico, modulo:r.escopo || 'Prazos Jud.', tipo:r.peca_sugerida||r.tipo_acao||'—', prazo:r.proximo_prazo, status:r.status })),
    ...(gen.data||[]).map(r => ({ nome:r.nome_cliente, modulo:r.area||'—', tipo:r.tipo_acao||'—', prazo:r.proximo_prazo, status:r.status })),
    ...(axd.data||[]).filter(r=>r.natureza==='judicial').map(r => ({ nome:r.nome_cliente, modulo:'Aux-Doença Jud.', tipo:'—', prazo:r.proximo_prazo, status:r.status })),
    ...(bpc.data||[]).filter(r=>r.natureza==='judicial').map(r => ({ nome:r.nome_cliente, modulo:'BPC Jud.', tipo:'—', prazo:r.proximo_prazo, status:r.status })),
    ...(rec.data||[]).filter(r=>r.modalidade==='Processo Judicial').map(r => ({ nome:r.nome_cliente, modulo:'Recurso Jud.', tipo:r.tipo_beneficio||'—', prazo:r.proximo_prazo, status:r.status })),
  ].filter(r => r.prazo).map(r => ({ ...r, dias: diffDias(r.prazo) }))
   .sort((a,b) => (a.dias??9999)-(b.dias??9999));

  // ── 4) Prazos ADMINISTRATIVOS (adm INSS + sal-mat + axd/bpc adm + recursos adm)
  const admItens = [
    ...(adm.data||[]).map(r => ({ nome:r.nome_cliente, beneficio:r.tipo_beneficio||'—', etapa:r.resultado_pedido||'Análise INSS', prazo:r.prazo_recurso || r.prazo_analise_inss || r.proximo_prazo, status:r.status })),
    ...(sal.data||[]).map(r => ({ nome:r.nome_cliente, beneficio:'Salário-Maternidade', etapa:r.resultado_pedido||'Análise INSS', prazo:r.prazo_recurso || r.prazo_analise_inss, status:r.status_guia })),
    ...(axd.data||[]).filter(r=>r.natureza==='administrativo').map(r => ({ nome:r.nome_cliente, beneficio:'Auxílio-Doença', etapa:r.resultado_pedido||'Análise INSS', prazo:r.prazo_recurso || r.prazo_analise_inss || r.proximo_prazo, status:r.status })),
    ...(bpc.data||[]).filter(r=>r.natureza==='administrativo').map(r => ({ nome:r.nome_cliente, beneficio:'BPC/LOAS', etapa:r.resultado_pedido||'Análise INSS', prazo:r.prazo_recurso || r.prazo_analise_inss || r.proximo_prazo, status:r.status })),
    ...(rec.data||[]).filter(r=>r.modalidade==='Recurso Administrativo').map(r => ({ nome:r.nome_cliente, beneficio:r.tipo_beneficio||'—', etapa:'Recurso CRPS', prazo:r.proximo_prazo || r.prazo_resposta, status:r.status })),
  ].filter(r => r.prazo).map(r => ({ ...r, dias: diffDias(r.prazo) }))
   .sort((a,b) => (a.dias??9999)-(b.dias??9999));

  // Contadores agregados
  const todos = [...guiasItens, ...cobrItens, ...judItens, ...admItens];
  let venc=0, urg=0, ate=0, ok=0;
  todos.forEach(r => {
    if (r.dias < 0) venc++;
    else if (r.dias <= 3) urg++;
    else if (r.dias <= 7) ate++;
    else ok++;
  });
  set_text('dash-vencidos', venc);
  set_text('dash-urgentes', urg);
  set_text('dash-atencao',  ate);
  set_text('dash-ok',       ok);
  set_text('dash-total',    todos.length);

  // Render tabelas
  renderDashTabela('dash-guias-body', guiasItens.filter(r => r.dias !== null && r.dias <= 60), row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td>${escHtml(row.competencia)||'—'}</td><td>${escHtml(row.numero)||'—'}</td>
        <td>${fmtDate(row.prazo)}</td><td>${row.dias} dias</td>
        <td>${statusBadge(row.status)}</td></tr>`,
    'Nenhuma guia pendente ✓');

  renderDashTabela('dash-cobr-body', cobrItens.filter(r => r.dias !== null && r.dias <= 60), row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td>${escHtml(row.origem)}</td><td>${row.parcela||'—'}</td>
        <td>${fmtBRL(row.valor)}</td><td>${fmtDate(row.prazo)}</td>
        <td>${row.dias} dias</td><td>${statusBadge(row.status)}</td></tr>`,
    'Nenhuma cobrança em aberto ✓');

  renderDashTabela('dash-jud-body', judItens.filter(r => r.dias !== null && r.dias <= 30), row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td><span class="badge badge-azul">${escHtml(row.modulo)}</span></td>
        <td>${escHtml(row.tipo)}</td><td>${fmtDate(row.prazo)}</td>
        <td>${row.dias} dias</td><td>${statusBadge(row.status)}</td></tr>`,
    'Nenhum prazo judicial nos próximos 30 dias ✓');

  renderDashTabela('dash-adm-body', admItens.filter(r => r.dias !== null && r.dias <= 60), row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td>${escHtml(row.beneficio)}</td><td>${escHtml(row.etapa)}</td>
        <td>${fmtDate(row.prazo)}</td><td>${row.dias} dias</td>
        <td>${statusBadge(row.status)}</td></tr>`,
    'Nenhum prazo administrativo próximo ✓');
}

function set_text(id, val) {
  const el = document.getElementById(id); if (el) el.textContent = val;
}
function renderDashTabela(tbodyId, itens, rowFn, emptyMsg) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!itens.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${emptyMsg}</td></tr>`;
    return;
  }
  tbody.innerHTML = itens.map(rowFn).join('');
}

/* ── AUTO-CRIAÇÃO DE COBRANÇAS ─────────────────────────────────────────── */
async function criarCobrancaAutomatica({ origem_tipo, origem_id, cliente_id, nome_cliente, cpf,
  tipo_beneficio, valor_mensal, qtd_parcelas, indeterminado, valor_acao,
  forma_pagamento, numero_processo }) {

  // Já existe cobrança vinculada? não duplica.
  const { data: exist } = await sb.from('controle_cobrancas').select('id')
    .eq('origem_tipo', origem_tipo).eq('origem_id', origem_id).limit(1);
  if (exist && exist.length) return;

  let honor = 0;
  const tipo = (tipo_beneficio || '').toLowerCase();

  if (tipo.includes('salário-maternidade')) {
    const base = (valor_mensal || 0) * 4;
    if (forma_pagamento === '1ª parcela integral') {
      honor = valor_mensal || 0;
    } else {
      honor = base * 0.30;
    }
  } else if (tipo.includes('auxílio') && (tipo.includes('incapacidade') || tipo.includes('doença'))) {
    const n = indeterminado ? 12 : (qtd_parcelas || 1);
    honor = (valor_mensal || 0) * n * 0.30;
  } else if (tipo.includes('moradia')) {
    honor = (valor_acao || 0) * 0.30;
  } else {
    honor = (valor_acao || 0) * 0.30;
  }

  if (!honor) return;

  await sb.from('controle_cobrancas').insert({
    cliente_id, origem_tipo, origem_id,
    nome_cliente, cpf, numero_processo,
    tipo_beneficio,
    valor_mensal_beneficio: valor_mensal,
    qtd_parcelas: indeterminado ? null : qtd_parcelas,
    honorarios_totais: honor,
    forma_pagamento,
    categoria: 'honorário',
    status: 'Pendente',
  });
}

/* ── PRAZOS JUDICIAIS POR ESCOPO ───────────────────────────────────────── */
function openPrazoEscopo(escopo) {
  window.openModal('praz');
  set('praz-escopo', escopo);
  // adiciona campo escopo via dataset
  document.getElementById('modal-praz').dataset.escopo = escopo;
}
window.openPrazoEscopo = openPrazoEscopo;

async function loadPrazosFiltrado(escopoTabela, escopo) {
  // escopo: 'CIVEL' (engloba CIVEL/FAMILIA/CONSUMIDOR) ou 'SAUDE'
  const { data } = await sb.from('prazos_judiciais_auxilio').select('*')
    .or(escopo === 'CIVEL'
      ? 'escopo.eq.CIVEL,escopo.eq.FAMILIA,escopo.eq.CONSUMIDOR'
      : 'escopo.eq.' + escopo)
    .order('proximo_prazo', { ascending: true, nullsFirst: false });
  const tbody = document.getElementById(escopoTabela);
  if (!tbody) return;
  const lista = data || [];
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-state">Nenhum prazo cadastrado.</td></tr>'; return; }
  tbody.innerHTML = lista.map(r => {
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

/* ── HOOK: showModule → carrega os módulos novos ───────────────────────── */
const origShowModule = window.showModule;
window.showModule = function (mod) {
  if (typeof origShowModule === 'function') origShowModule(mod);
  // Trata os módulos novos
  if (mod === 'clientes')     loadClientesModule();
  if (mod === 'aux-doenca')   loadAxd();
  if (mod === 'bpc')          loadBpc();
  if (mod === 'recursos')     loadRec();
  if (mod === 'prazos-civel') loadPrazosFiltrado('praz-civel-body', 'CIVEL');
  if (mod === 'prazos-saude') loadPrazosFiltrado('praz-saude-body', 'SAUDE');
  if (mod === 'dashboard')    loadDashboardCategorizado();
};

/* ── EXPORT ────────────────────────────────────────────────────────────── */
window.MODULOS = {
  carregarClientes, popularDatalists, aplicarClienteSelecionado, upsertClienteDoFormulario,
  recalcPrazoAdm, atualizarDecisaoAdm, atualizarParcelasAdm,
  recalcPrazoSalMat, atualizarDecisaoSalMat,
  renderGuiasSalMat, coletarGuiasSalMat, salvarGuiasSalMat, carregarGuiasSalMat,
  recalcPrazoAxd, atualizarDecisaoAxd, atualizarNaturezaAxd, atualizarHonorAxd, loadAxd, axdData: () => axdData,
  recalcPrazoBpc, atualizarDecisaoBpc, atualizarNaturezaBpc, loadBpc, bpcData: () => bpcData,
  atualizarParcelasJud,
  loadRec, recData: () => recData, recalcPrazoRec, atualizarModalidadeRec, buscarRequerimento,
  selecionarRequerimento, criarRecursoDe,
  loadDashboardCategorizado, criarCobrancaAutomatica,
  loadPrazosFiltrado, loadClientesModule,
};

/* ── BOOT — popula datalist de clientes assim que carrega ─────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', carregarClientes);
} else {
  carregarClientes();
}

})();
