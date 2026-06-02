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

  // 1. Tenta achar no cache local
  if (cpf) {
    const exist = clientesCache.find(c => c.cpf === cpf);
    if (exist) {
      set(prefix + '-cliente-id', exist.id);
      return exist.id;
    }
  }

  // 2. Tenta inserir; se falhar por UNIQUE, faz SELECT pelo CPF
  const payload = {
    nome, cpf,
    telefone: v(prefix + '-telefone'),
    email:    v(prefix + '-email'),
    endereco: v(prefix + '-endereco'),
  };
  const { data, error } = await sb.from('clientes').insert(payload).select('id').single();

  if (!error && data) {
    set(prefix + '-cliente-id', data.id);
    await carregarClientes();
    return data.id;
  }

  // 3. Se erro de duplicidade, busca cliente existente pelo CPF
  if (error && cpf) {
    const { data: found } = await sb.from('clientes').select('id').eq('cpf', cpf).limit(1);
    if (found && found.length) {
      set(prefix + '-cliente-id', found[0].id);
      await carregarClientes();
      return found[0].id;
    }
  }

  console.warn('upsertClienteDoFormulario: não foi possível vincular cliente:', error?.message);
  return null;
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
        <select class="btn btn-secondary btn-sm" onchange="window.MODULOS.iniciarProcessoParaCliente('${c.id}', this.value); this.value='';" style="width: auto; padding: 4px 8px; text-transform: none;">
          <option value="">➕ Iniciar Caso</option>
          <option value="adm">Proc. Administrativo</option>
          <option value="jud">Proc. Judicial</option>
          <option value="sal">Salário-Maternidade</option>
          <option value="axd">Auxílio-Doença</option>
          <option value="bpc">BPC / LOAS</option>
        </select>
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
  // Limpa o formulário antes de preencher (evita resíduo entre edições)
  const form = document.getElementById('form-cli');
  if (form) form.reset();
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

  // Sugere aba específica se houver
  const sugestaoEl = document.getElementById('adm-sugestao-especifica');
  if (sugestaoEl) {
    let sugestao = '';
    if (tipoLower.includes('maternidade')) sugestao = 'Salário-Maternidade';
    else if (ehAuxDoenca) sugestao = 'Auxílio-Doença';
    else if (tipoLower.includes('bpc') || tipoLower.includes('loas')) sugestao = 'BPC / LOAS';
    if (sugestao) {
      sugestaoEl.innerHTML = `💡 Este tipo tem aba dedicada com controle mais completo — recomendamos cadastrar em <strong>${sugestao}</strong> (você pode fechar este modal e usar a aba específica). Salvar aqui também funciona, mas você terá menos campos.`;
      sugestaoEl.style.display = '';
    } else {
      sugestaoEl.style.display = 'none';
    }
  }
}

function atualizarDecisaoAdm() {
  const result = v('adm-resultado');
  const dataDec = vd('adm-data-decisao');
  const rowRec  = document.getElementById('adm-row-recurso');
  const rowPgto = document.getElementById('adm-row-prevpgto');
  const rowMot  = document.getElementById('adm-row-motivo-indef');
  if (rowRec)  rowRec.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowPgto) rowPgto.style.display = (result === 'Deferido')   ? '' : 'none';
  if (rowMot)  rowMot.style.display  = (result === 'Indeferido') ? '' : 'none';
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
  const rowRec  = document.getElementById('sal-row-recurso');
  const rowPgto = document.getElementById('sal-row-prevpgto');
  const rowMot  = document.getElementById('sal-motivo-indef-row');
  if (rowRec)  rowRec.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowPgto) rowPgto.style.display = (result === 'Deferido')   ? '' : 'none';
  if (rowMot)  rowMot.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (result === 'Indeferido' && dataDec) {
    set('sal-prazo-recurso', window.PRAZOS.somarDias(dataDec, 30));
  }
  // Quando deferido, mostra o controle das 4 parcelas
  if (result === 'Deferido' && !document.getElementById('sal-parc1-data')) {
    renderParcelasBeneficio({});
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
      <div class="guia-block">
        <div>Guia ${i}</div>
        <input type="hidden" data-guia-id="${i}" value="${g.id || ''}">
        <div class="form-row">
          <div class="form-group"><label>Status da guia</label>
            <select data-guia-status="${i}">
              <option value="A Gerar"  ${g.status_guia==='A Gerar'  ? 'selected':''}>📝 A Gerar (preciso emitir)</option>
              <option value="Pendente" ${g.status_guia==='Pendente' ? 'selected':''}>⏳ Pendente (emitida, aguardando pagamento)</option>
              <option value="Pago"     ${g.status_guia==='Pago'     ? 'selected':''}>✅ Pago</option>
              <option value="Atrasado" ${g.status_guia==='Atrasado' ? 'selected':''}>🔴 Atrasado</option>
            </select>
          </div>
          <div class="form-group"><label>Competência (MM/AAAA)</label>
            <input type="text" data-guia-comp="${i}" placeholder="MM/AAAA" value="${escHtml(g.competencia||'')}"
                   oninput="window.MODULOS.vencimentoAutoGuia(${i})">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Vencimento <small style="color:var(--texto-suave); font-weight:400">(auto: dia 15 do mês seguinte)</small></label>
            <input type="date" data-guia-venc="${i}" value="${g.data_vencimento?.slice(0,10) || ''}">
          </div>
          <div class="form-group"><label>Nº da Guia</label>
            <input type="text" data-guia-numero="${i}" placeholder="Preencher após emitir" value="${escHtml(g.numero_guia||'')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Valor (R$)</label>
            <input type="number" step="0.01" data-guia-valor="${i}" value="${g.valor_guia||''}">
          </div>
          <div class="form-group"><label>Data do Pagamento (quando paga)</label>
            <input type="date" data-guia-pago="${i}" value="${g.data_pagamento?.slice(0,10) || ''}">
          </div>
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

/* Quando o usuário digita a competência MM/AAAA, preenche vencimento = dia 15 do mês seguinte */
function vencimentoAutoGuia(i) {
  const compInp = document.querySelector(`[data-guia-comp="${i}"]`);
  const vencInp = document.querySelector(`[data-guia-venc="${i}"]`);
  if (!compInp || !vencInp) return;
  const val = (compInp.value || '').trim();
  // aceita "MM/AAAA" ou "M/AAAA"
  const m = val.match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return;
  let mes = parseInt(m[1], 10);
  let ano = parseInt(m[2], 10);
  if (mes < 1 || mes > 12) return;
  // próximo mês:
  mes += 1;
  if (mes > 12) { mes = 1; ano += 1; }
  const mm = String(mes).padStart(2, '0');
  // Se vencimento ainda não foi manualmente alterado, sobrescreve
  vencInp.value = `${ano}-${mm}-15`;
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

/* ── CÁLCULO AUTOMÁTICO DE HONORÁRIOS — SAL-MAT ───────────────────────── */
function recalcHonorariosSalMat() {
  const valor = vn('sal-valor');
  const parcelas = (vi('sal-parcelas-qtd') || 4); // 4 padrão; prorrogação pode variar
  const forma = v('sal-forma-pgto') || '30% sobre cada parcela';
  if (!valor) {
    set('sal-honor-total', '');
    document.getElementById('sal-calc-preview').innerHTML =
      '<em style="color:var(--texto-suave)">Preencha o valor mensal na aba "Dados".</em>';
    return;
  }
  let honorTotal;
  if (forma === '1ª parcela integral') {
    honorTotal = valor;
  } else {
    honorTotal = valor * parcelas * 0.30;
  }
  set('sal-honor-total', honorTotal.toFixed(2));
  const fmt = window.CALC.fmt;
  let memo;
  if (forma === '1ª parcela integral') {
    memo = `Forma: <strong>1ª parcela integral</strong><br>` +
           `Valor mensal: ${fmt(valor)}<br>` +
           `<span class="destaque">Honorário total: ${fmt(honorTotal)}</span> (uma única cobrança)`;
  } else {
    const porParcela = valor * 0.30;
    memo = `Forma: <strong>30% sobre cada parcela</strong><br>` +
           `${parcelas} parcela(s) × ${fmt(valor)} × 30% = ${fmt(porParcela)}/mês<br>` +
           `<span class="destaque">Honorário total: ${fmt(honorTotal)} em ${parcelas} cobranças</span>`;
  }
  document.getElementById('sal-calc-preview').innerHTML = memo;
}

/* ── CONTROLE DAS 4 PARCELAS DO BENEFÍCIO ──────────────────────────────── */
function renderParcelasBeneficio(rec = {}) {
  const container = document.getElementById('sal-parcelas-controle');
  if (!container) return;
  const parcelasQtd = parseInt(document.getElementById('sal-parcelas-qtd')?.value || 4, 10) || 4;
  let html = '';
  for (let i = 1; i <= Math.min(parcelasQtd, 4); i++) {
    const dataKey = `parc${i}_data`, statusKey = `parc${i}_status`;
    const data = rec[dataKey] ? rec[dataKey].slice(0,10) : '';
    const status = rec[statusKey] || 'A receber';
    html += `
      <div class="form-group">
        <label>${i}ª parcela</label>
        <input type="date" id="sal-parc${i}-data" value="${data}">
        <select id="sal-parc${i}-status" style="margin-top:.4rem">
          <option ${status==='A receber' ? 'selected':''}>A receber</option>
          <option ${status==='Recebida'  ? 'selected':''}>Recebida</option>
          <option ${status==='Atrasada'  ? 'selected':''}>Atrasada</option>
        </select>
      </div>`;
  }
  container.innerHTML = html;
}

/* Quando o user informa a data de início efetivo do pagamento, preenche as 4 parcelas mensais */
function atualizarParcelasSalMat() {
  const inicio = vd('sal-data-inicio-pgto');
  if (!inicio) return;
  // Garante que o controle das parcelas já foi renderizado
  if (!document.getElementById('sal-parc1-data')) renderParcelasBeneficio({});
  const base = new Date(inicio + 'T00:00:00');
  for (let i = 1; i <= 4; i++) {
    const d = new Date(base); d.setMonth(d.getMonth() + (i - 1));
    const inp = document.getElementById(`sal-parc${i}-data`);
    if (inp && !inp.value) inp.value = d.toISOString().slice(0, 10);
  }
}

function coletarParcelasSalMat() {
  const out = {};
  for (let i = 1; i <= 4; i++) {
    const data = document.getElementById(`sal-parc${i}-data`)?.value || null;
    const status = document.getElementById(`sal-parc${i}-status`)?.value || null;
    out[`parc${i}_data`] = data;
    out[`parc${i}_status`] = status;
  }
  return out;
}

/* ── GERAÇÃO DE PARCELAS DE COBRANÇA (honorários) ─────────────────────── */
function gerarParcelasCobrancaSalMat() {
  const valor = vn('sal-valor');
  const parcelas = (vi('sal-parcelas-qtd') || 4);
  const forma = v('sal-forma-pgto') || '30% sobre cada parcela';
  const dataInicial = vd('sal-data-cob');
  const out = document.getElementById('sal-parcelas-cobranca-preview');
  if (!out) return;
  if (!valor || !dataInicial) {
    out.innerHTML = '<em style="color:var(--texto-suave)">Informe o valor mensal e a data inicial de cobrança.</em>';
    return;
  }
  const fmt = window.CALC.fmt;
  let lista;
  if (forma === '1ª parcela integral') {
    lista = [{ numero: 1, data: dataInicial, valor: valor, descricao: '1ª parcela integral' }];
  } else {
    const porParcela = valor * 0.30;
    lista = Array.from({ length: parcelas }, (_, i) => {
      const d = new Date(dataInicial + 'T00:00:00');
      d.setMonth(d.getMonth() + i);
      return { numero: i + 1, data: d.toISOString().slice(0, 10), valor: porParcela,
               descricao: `Parcela ${i + 1}/${parcelas}` };
    });
  }
  out.innerHTML = `
    <div style="background:rgba(184,145,74,.06); border:1px solid rgba(184,145,74,.2); border-radius:6px; padding:.7rem 1rem;">
      <strong>Parcelas de cobrança que serão geradas ao salvar:</strong>
      <table style="width:100%; margin-top:.5rem; font-size:.85rem">
        <thead><tr><th style="text-align:left">#</th><th>Data</th><th style="text-align:right">Valor</th><th>Descrição</th></tr></thead>
        <tbody>
          ${lista.map(p => `
            <tr><td>${p.numero}</td><td>${new Date(p.data+'T00:00:00').toLocaleDateString('pt-BR')}</td>
                <td style="text-align:right">${fmt(p.valor)}</td><td>${p.descricao}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
  // Armazena temporariamente para uso no save
  window._parcelasCobrancaPendente = lista;
}

/* Persiste as parcelas geradas na tabela controle_cobrancas (chamado pelo saveRecord do 'sal') */
async function persistirParcelasCobrancaSalMat(salMatId, dadosCliente) {
  const lista = window._parcelasCobrancaPendente;
  if (!lista || !lista.length || !salMatId) return;
  const forma = v('sal-forma-pgto') || '30% sobre cada parcela';
  const grupoId = crypto.randomUUID ? crypto.randomUUID() :
                  ('grp-' + Date.now() + '-' + Math.random().toString(36).slice(2,8));
  // Remove cobranças anteriores deste mesmo registro (idempotente em re-salvamentos)
  await sb.from('controle_cobrancas').delete().eq('origem_tipo','sal').eq('origem_id', salMatId);
  const payload = lista.map(p => ({
    cliente_id: dadosCliente.cliente_id,
    origem_tipo: 'sal', origem_id: salMatId, grupo_cobranca_id: grupoId,
    nome_cliente: dadosCliente.nome_cliente, cpf: dadosCliente.cpf,
    numero_processo: dadosCliente.numero_processo,
    tipo_beneficio: 'Salário-Maternidade',
    valor_parcela: p.valor,
    numero_parcela: p.numero,
    qtd_parcelas_total: lista.length,
    qtd_parcelas: lista.length,
    data_cobranca: p.data,
    data_limite_pgto: p.data,
    mes_referencia: p.data.slice(0,7),  // AAAA-MM
    forma_pagamento: forma,
    categoria: 'honorário',
    status: 'Pendente',
    honorarios_totais: lista.reduce((s, x) => s + x.valor, 0),
  }));
  const { error } = await sb.from('controle_cobrancas').insert(payload);
  if (error) console.warn('Erro ao persistir parcelas de cobrança:', error.message);
  window._parcelasCobrancaPendente = null;
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
        ${r.resultado_pedido === 'Indeferido' ? `
          <button class="btn btn-primary btn-sm" style="background:#8c7b65; border-color:#8c7b65;" onclick="window.MODULOS.ajuizarDeRow('axd','${r.id}')">⚖️ Ajuizar</button>
          <button class="btn btn-secondary btn-sm" style="color:var(--accent-primary); border-color:var(--border);" onclick="window.MODULOS.criarRecursoDeRow('axd','${r.id}')">📤 Recurso</button>
        ` : ''}
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
  const rowMot  = document.getElementById('axd-row-motivo-indef');
  const rowPgto = document.getElementById('axd-row-prevpgto');
  if (rowRec)  rowRec.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowMot)  rowMot.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowPgto) rowPgto.style.display = (result === 'Deferido')   ? '' : 'none';
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
        ${r.resultado_pedido === 'Indeferido' ? `
          <button class="btn btn-primary btn-sm" style="background:#8c7b65; border-color:#8c7b65;" onclick="window.MODULOS.ajuizarDeRow('bpc','${r.id}')">⚖️ Ajuizar</button>
          <button class="btn btn-secondary btn-sm" style="color:var(--accent-primary); border-color:var(--border);" onclick="window.MODULOS.criarRecursoDeRow('bpc','${r.id}')">📤 Recurso</button>
        ` : ''}
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
  const rowMot  = document.getElementById('bpc-row-motivo-indef');
  if (rowRec)  rowRec.style.display  = (result === 'Indeferido') ? '' : 'none';
  if (rowPgto) rowPgto.style.display = (result === 'Deferido')   ? '' : 'none';
  if (rowMot)  rowMot.style.display  = (result === 'Indeferido') ? '' : 'none';
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

/* ── PROCESSO JUDICIAL INSS — auto-fill via número do administrativo ──── */
async function lookupAdmDoJud(numProcJud) {
  if (!numProcJud || numProcJud.length < 5) return;
  // Procura em todas as tabelas administrativas se algum tem processo_judicial_numero igual
  const tabelas = [
    { tbl:'processos_administrativos', label:'Administrativo INSS' },
    { tbl:'salario_maternidade',       label:'Salário-Maternidade' },
    { tbl:'auxilio_doenca',            label:'Auxílio-Doença' },
    { tbl:'bpc_loas',                  label:'BPC/LOAS' },
  ];
  let encontrado = null;
  for (const { tbl, label } of tabelas) {
    const { data } = await sb.from(tbl).select('*')
      .eq('processo_judicial_numero', numProcJud).limit(1);
    if (data && data.length) { encontrado = { ...data[0], _label: label }; break; }
  }
  // Se não achou, tenta também pelo numero_proc_judicial (campo legado em adm)
  if (!encontrado) {
    const { data } = await sb.from('processos_administrativos').select('*')
      .eq('numero_proc_judicial', numProcJud).limit(1);
    if (data && data.length) encontrado = { ...data[0], _label: 'Administrativo INSS' };
  }
  const card = document.getElementById('jud-adm-info');
  if (!card) return;
  if (!encontrado) { card.style.display = 'none'; card.innerHTML = ''; return; }

  // Auto-preenche campos visíveis se vazios
  const safeSet = (id, val) => { const el = document.getElementById(id); if (el && !el.value && val) el.value = val; };
  safeSet('jud-nome',          encontrado.nome_cliente);
  safeSet('jud-cpf',           encontrado.cpf);
  safeSet('jud-proc-adm',      encontrado.numero_processo);
  safeSet('jud-nb',            encontrado.numero_beneficio);
  safeSet('jud-tipo',          encontrado.tipo_beneficio);
  if (encontrado.cliente_id) safeSet('jud-cliente-id', encontrado.cliente_id);

  // Guarda motivo no card para inclusão no payload
  card.dataset.motivo = encontrado.motivo_indeferimento || '';

  card.innerHTML = `
    <div style="font-weight:600; color:var(--caramelo,#b8914a); margin-bottom:.3rem">
      📎 Dados puxados do Processo Administrativo (${escHtml(encontrado._label)})
    </div>
    <div><strong>Cliente:</strong> ${escHtml(encontrado.nome_cliente)} · <strong>CPF:</strong> ${escHtml(encontrado.cpf||'—')}</div>
    <div><strong>Nº Protocolo Adm.:</strong> ${escHtml(encontrado.numero_processo||'—')}
         · <strong>NB:</strong> ${escHtml(encontrado.numero_beneficio||'—')}</div>
    <div><strong>Tipo benefício:</strong> ${escHtml(encontrado.tipo_beneficio||'—')}</div>
    <div><strong>Data protocolo:</strong> ${fmtDate(encontrado.data_protocolo)}
         · <strong>Data indeferimento:</strong> ${fmtDate(encontrado.data_decisao)}</div>
    ${encontrado.motivo_indeferimento ? `<div style="margin-top:.3rem"><strong>Motivo do indeferimento:</strong> ${escHtml(encontrado.motivo_indeferimento)}</div>` : ''}
  `;
  card.style.display = '';
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

/* ── BUSCA AUTOMÁTICA DE PROCESSO ADM PARA JUDICIAL ─────────────────────── */
async function lookupAdmDoJud(numJud) {
  if (!numJud) return;
  numJud = numJud.trim();

  // Tenta encontrar em processos_administrativos, auxilio_doenca, bpc_loas ou salario_maternidade
  let admRec = null;
  let origemTipo = '';

  // 1. processos_administrativos
  const res1 = await sb.from('processos_administrativos').select('*')
    .or(`processo_judicial_numero.eq."${numJud}",numero_proc_judicial.eq."${numJud}"`)
    .limit(1);
  if (res1.data && res1.data.length) {
    admRec = res1.data[0];
    origemTipo = 'adm';
  }

  // 2. salario_maternidade
  if (!admRec) {
    const res2 = await sb.from('salario_maternidade').select('*')
      .eq('processo_judicial_numero', numJud)
      .limit(1);
    if (res2.data && res2.data.length) {
      admRec = res2.data[0];
      origemTipo = 'sal';
    }
  }

  // 3. auxilio_doenca
  if (!admRec) {
    const res3 = await sb.from('auxilio_doenca').select('*')
      .eq('processo_judicial_numero', numJud)
      .limit(1);
    if (res3.data && res3.data.length) {
      admRec = res3.data[0];
      origemTipo = 'axd';
    }
  }

  // 4. bpc_loas
  if (!admRec) {
    const res4 = await sb.from('bpc_loas').select('*')
      .eq('processo_judicial_numero', numJud)
      .limit(1);
    if (res4.data && res4.data.length) {
      admRec = res4.data[0];
      origemTipo = 'bpc';
    }
  }

  // Se não achar por número do processo judicial, tenta buscar pelo CPF ou NB que já estejam no form judicial
  if (!admRec) {
    const cpf = v('jud-cpf');
    const nb = v('jud-nb');
    if (cpf || nb) {
      let queryParts = [];
      if (cpf) queryParts.push(`cpf.eq."${cpf}"`);
      if (nb) queryParts.push(`numero_beneficio.eq."${nb}"`);
      
      const resCpf = await sb.from('processos_administrativos').select('*')
        .or(queryParts.join(','))
        .limit(1);
      if (resCpf.data && resCpf.data.length) {
        admRec = resCpf.data[0];
        origemTipo = 'adm';
      }
    }
  }

  if (admRec) {
    // Auto-preenche os campos do formulário judicial
    set('jud-proc-adm', admRec.numero_processo || '');
    if (admRec.numero_beneficio) set('jud-nb', admRec.numero_beneficio);
    if (admRec.cliente_id) set('jud-cliente-id', admRec.cliente_id);
    if (admRec.nome_cliente) set('jud-nome', admRec.nome_cliente);
    if (admRec.cpf) set('jud-cpf', admRec.cpf);

    let tipoBeneficio = admRec.tipo_beneficio || '';
    if (origemTipo === 'sal') tipoBeneficio = 'Salário-Maternidade';
    if (origemTipo === 'axd') tipoBeneficio = 'Auxílio-Doença';
    if (origemTipo === 'bpc') tipoBeneficio = 'BPC/LOAS';

    if (tipoBeneficio) {
      set('jud-tipo', tipoBeneficio);
      atualizarParcelasJud();
    }

    const obsEl = document.getElementById('jud-obs');
    if (obsEl && !obsEl.value) {
      obsEl.value = `Histórico fático importado do Processo Administrativo (${admRec.numero_processo || 'Sem nº'}):\n` +
                    `- Resultado Adm: ${admRec.resultado_pedido || 'Aguardando'}\n` +
                    `- Motivo Indeferimento: ${admRec.motivo_indeferimento || '—'}\n` +
                    `Observações Adm: ${admRec.observacoes || '—'}`;
    }

    // Mostra o card informativo
    const infoEl = document.getElementById('jud-adm-info');
    if (infoEl) {
      infoEl.style.display = 'block';
      const badgeClass = admRec.resultado_pedido === 'Deferido' ? 'badge-verde' : (admRec.resultado_pedido === 'Indeferido' ? 'badge-vermelho' : 'badge-amarelo');
      infoEl.innerHTML = `
        <strong>✓ Processo Administrativo Vinculado Detectado</strong><br>
        Protocolo: <strong>${admRec.numero_processo || '—'}</strong> | NB: <strong>${admRec.numero_beneficio || '—'}</strong><br>
        Benefício: ${tipoBeneficio}<br>
        Resultado Administrativo: <span class="badge ${badgeClass}">${admRec.resultado_pedido || 'Aguardando'}</span><br>
        ${admRec.motivo_indeferimento ? `Motivo Indeferimento: <em>${admRec.motivo_indeferimento}</em>` : ''}
      `;
    }

    // Pendência de cópia de documentos
    window._docLinkPending = { deTipo: origemTipo, deId: admRec.id };

    toast('Dados do Processo Administrativo vinculados com sucesso!');
  }
}

async function copiarDocumentosVinculados(deTipo, deId, paraTipo, paraId) {
  try {
    const { data: docs, error } = await sb.from('documentos_processo')
      .select('*')
      .eq('processo_tipo', deTipo)
      .eq('processo_id', deId);
    if (error || !docs || !docs.length) return;

    for (const d of docs) {
      const payload = {
        processo_tipo: paraTipo,
        processo_id: paraId,
        nome: d.nome,
        status: d.status,
        observacao: d.observacao,
        uploaded_at: d.uploaded_at,
        storage_path: d.storage_path
      };
      await sb.from('documentos_processo').insert(payload);
    }
  } catch(e) {
    console.error('Erro ao copiar documentos vinculados:', e);
  }
}
window.copiarDocumentosVinculados = copiarDocumentosVinculados;

async function ajuizarDeRow(origemTipo, id) {
  let tab = '';
  if (origemTipo === 'adm') tab = 'processos_administrativos';
  else if (origemTipo === 'sal') tab = 'salario_maternidade';
  else if (origemTipo === 'axd') tab = 'auxilio_doenca';
  else if (origemTipo === 'bpc') tab = 'bpc_loas';
  if (!tab) return;

  const { data, error } = await sb.from(tab).select('*').eq('id', id).single();
  if (error || !data) {
    toast('Erro ao buscar dados do processo administrativo.', true);
    return;
  }

  if (typeof window.openModal === 'function') {
    window.openModal('jud');
  } else {
    document.getElementById('modal-jud')?.classList.add('open');
  }

  const safeSet = (fieldId, val) => { const el = document.getElementById(fieldId); if (el) el.value = val || ''; };
  safeSet('jud-nome', data.nome_cliente);
  safeSet('jud-cpf', data.cpf);
  safeSet('jud-nb', data.numero_beneficio);
  safeSet('jud-proc-adm', data.numero_processo);
  
  let tipoBeneficio = data.tipo_beneficio || '';
  if (origemTipo === 'sal') tipoBeneficio = 'Salário-Maternidade';
  else if (origemTipo === 'axd') tipoBeneficio = 'Auxílio-Doença';
  else if (origemTipo === 'bpc') tipoBeneficio = 'BPC/LOAS';
  safeSet('jud-tipo', tipoBeneficio);
  
  if (data.cliente_id) safeSet('jud-cliente-id', data.cliente_id);
  
  const obsEl = document.getElementById('jud-obs');
  if (obsEl) {
    obsEl.value = `Ajuizamento automático a partir do Processo Administrativo (${data.numero_processo || 'Sem nº'}):\n` +
                  `- Resultado Adm: ${data.resultado_pedido || 'Aguardando'}\n` +
                  `- Motivo Indeferimento: ${data.motivo_indeferimento || '—'}\n` +
                  `Observações Adm: ${data.observacoes || '—'}`;
  }

  if (typeof window.MODULOS.atualizarParcelasJud === 'function') {
    window.MODULOS.atualizarParcelasJud();
  }

  const infoEl = document.getElementById('jud-adm-info');
  if (infoEl) {
    infoEl.style.display = 'block';
    const badgeClass = data.resultado_pedido === 'Deferido' ? 'badge-verde' : (data.resultado_pedido === 'Indeferido' ? 'badge-vermelho' : 'badge-amarelo');
    infoEl.innerHTML = `
      <strong>✓ Processo Administrativo Vinculado Detectado</strong><br>
      Protocolo: <strong>${data.numero_processo || '—'}</strong> | NB: <strong>${data.numero_beneficio || '—'}</strong><br>
      Benefício: ${tipoBeneficio}<br>
      Resultado Administrativo: <span class="badge ${badgeClass}">${data.resultado_pedido || 'Aguardando'}</span><br>
      ${data.motivo_indeferimento ? `Motivo Indeferimento: <em>${data.motivo_indeferimento}</em>` : ''}
    `;
  }

  window._docLinkPending = { deTipo: origemTipo, deId: id };
  toast('Dados administrativos vinculados ao novo processo judicial!');
}
window.ajuizarDeRow = ajuizarDeRow;

async function ajuizarAcaoDe(prefix) {
  const id = v(prefix + '-id');
  if (!id) {
    toast('Salve o registro administrativo antes de ajuizar a ação.', true);
    return;
  }
  if (typeof window.closeModal === 'function') {
    window.closeModal(prefix);
  } else {
    document.getElementById('modal-' + prefix)?.classList.remove('open');
  }
  await ajuizarDeRow(prefix, id);
}
window.ajuizarAcaoDe = ajuizarAcaoDe;

async function iniciarProcessoParaCliente(clienteId, tipo) {
  if (!tipo) return;
  const cli = clientesCache.find(c => c.id === clienteId);
  if (!cli) {
    toast('Cliente não encontrado.', true);
    return;
  }

  if (typeof window.openModal === 'function') {
    window.openModal(tipo);
  } else {
    document.getElementById('modal-' + tipo)?.classList.add('open');
  }

  const safeSet = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  safeSet(tipo + '-cliente-id', cli.id);
  safeSet(tipo + '-nome', cli.nome);
  safeSet(tipo + '-cpf', cli.cpf || '');
  safeSet(tipo + '-cli-busca', `${cli.nome}${cli.cpf ? ' · ' + cli.cpf : ''}`);

  toast(`Novo caso de ${tipo.toUpperCase()} iniciado para ${cli.nome}!`);
}
window.iniciarProcessoParaCliente = iniciarProcessoParaCliente;

async function criarRecursoDeRow(prefix, id) {
  let tab = '';
  if (prefix === 'adm') tab = 'processos_administrativos';
  else if (prefix === 'sal') tab = 'salario_maternidade';
  else if (prefix === 'axd') tab = 'auxilio_doenca';
  else if (prefix === 'bpc') tab = 'bpc_loas';
  if (!tab) return;

  const { data, error } = await sb.from(tab).select('*').eq('id', id).single();
  if (error || !data) {
    toast('Erro ao buscar dados do processo administrativo.', true);
    return;
  }

  if (typeof window.openModal === 'function') {
    window.openModal('rec');
  } else {
    document.getElementById('modal-rec')?.classList.add('open');
  }
  document.getElementById('form-rec').reset();

  const safeSet = (fieldId, val) => { const el = document.getElementById(fieldId); if (el) el.value = val || ''; };
  safeSet('rec-id', '');
  safeSet('rec-origem-tipo', prefix);
  safeSet('rec-origem-id', id);
  safeSet('rec-num-req', data.numero_processo);
  safeSet('rec-nome', data.nome_cliente);
  safeSet('rec-cpf', data.cpf || '');

  const tipoBenef = (prefix === 'sal') ? 'Salário-Maternidade'
                  : (prefix === 'axd') ? 'Auxílio-Doença'
                  : (prefix === 'bpc') ? 'BPC/LOAS'
                  : data.tipo_beneficio || '';
  safeSet('rec-tipo-beneficio', tipoBenef);
  if (data.cliente_id) safeSet('rec-cliente-id', data.cliente_id);

  safeSet('rec-modalidade', 'Recurso Administrativo');
  if (window.MODULOS && typeof window.MODULOS.atualizarModalidadeRec === 'function') {
    window.MODULOS.atualizarModalidadeRec();
  }

  if (data.data_decisao) {
    safeSet('rec-data-protocolo', data.data_decisao.slice(0, 10));
    if (window.MODULOS && typeof window.MODULOS.recalcPrazoRec === 'function') {
      window.MODULOS.recalcPrazoRec();
    }
  }

  const buscaRes = document.getElementById('rec-busca-resultado');
  if (buscaRes) buscaRes.innerHTML = '<span style="color:var(--verde)">✓ Vinculado ao processo original.</span>';
  document.getElementById('modal-rec-title').textContent = 'Novo Recurso vinculado';

  toast('Recurso administrativo iniciado com os dados importados!');
}
window.criarRecursoDeRow = criarRecursoDeRow;

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
  const r1 = document.getElementById('rec-row-judicial');
  const r2 = document.getElementById('rec-row-judicial-2');
  if (r1) r1.style.display = ehJud ? '' : 'none';
  if (r2) r2.style.display = ehJud ? '' : 'none';
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
  // Mapeia tipo de benefício corretamente conforme origem
  // (em 'sal', sal-tipo guarda CÓDIGO da modalidade do sal-mat, não o tipo de benefício)
  const tipoBenef = (prefix === 'sal') ? 'Salário-Maternidade'
                  : (prefix === 'axd') ? 'Auxílio-Doença'
                  : (prefix === 'bpc') ? 'BPC/LOAS'
                  : v(prefix + '-tipo') || '';
  set('rec-tipo-beneficio', tipoBenef);
  set('rec-cliente-id', v(prefix + '-cliente-id'));
  // Sugere modalidade padrão: Recurso Administrativo (mais comum como próxima etapa)
  set('rec-modalidade', 'Recurso Administrativo');
  atualizarModalidadeRec();
  // Tenta usar a data da decisão do registro de origem como data de protocolo do recurso
  const dataDecisao = vd(prefix + '-data-decisao');
  if (dataDecisao) {
    set('rec-data-protocolo', dataDecisao);
    recalcPrazoRec();
  }
  // Reset card/preview e linhas condicionais
  set('rec-busca-req', '');
  const buscaRes = document.getElementById('rec-busca-resultado');
  if (buscaRes) buscaRes.innerHTML = '<span style="color:var(--verde)">✓ Pré-vinculado ao registro atual.</span>';
  document.getElementById('modal-rec-title').textContent = 'Novo Recurso vinculado';
}

/* ── INSTÂNCIAS GLOBAIS DE GRÁFICOS (CHART.JS) ─────────────────────────── */
let dashboardPrazosChart = null;
let faturamentoTotalChart = null;
let faturamentoSplitChart = null;

// Cache local de dados do dashboard para filtragem instantânea sem nova requisição
let dashboardDataCache = null;
let currentDashboardFilter = null; // 'venc' | 'urg' | 'ate' | 'ok' | null

function renderDashboardPrazosChart(venc, urg, ate, ok) {
  const canvas = document.getElementById('chart-dashboard-prazos');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;

  if (typeof Chart === 'undefined') {
    if (canvas.parentNode) {
      canvas.parentNode.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.8rem;color:var(--texto-suave);text-align:center;padding:1rem;border:1px dashed rgba(184,145,74,0.3);border-radius:8px;font-family:Lato,sans-serif;">⚠️ Gráficos indisponíveis (Chart.js não carregado)</div>';
    }
    return;
  }

  if (dashboardPrazosChart) {
    dashboardPrazosChart.destroy();
  }
  dashboardPrazosChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Vencidos', 'Urgentes (≤3 dias)', 'Atenção (≤7 dias)', 'No Prazo'],
      datasets: [{
        data: [venc, urg, ate, ok],
        backgroundColor: [
          '#c0392b', // vermelho elegante
          '#d35400', // laranja elegante
          '#f1c40f', // amarelo elegante
          '#27ae60'  // verde elegante
        ],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { family: 'Plus Jakarta Sans', size: 11 },
            color: '#665f55',
            boxWidth: 12
          }
        }
      },
      cutout: '65%',
      onClick: (evt, activeElements) => {
        if (activeElements.length > 0) {
          const firstPoint = activeElements[0];
          const label = dashboardPrazosChart.data.labels[firstPoint.index];
          if (typeof window.filtrarTabelasDashboardPorStatus === 'function') {
            window.filtrarTabelasDashboardPorStatus(label);
          }
        }
      }
    }
  });
}

function renderFaturamentoCharts(mesesData, sortedMeses) {
  const canvasTotal = document.getElementById('chart-faturamento-total');
  const canvasSplit = document.getElementById('chart-faturamento-split');
  const ctxTotal = canvasTotal?.getContext('2d');
  const ctxSplit = canvasSplit?.getContext('2d');
  if (!ctxTotal && !ctxSplit) return;

  if (typeof Chart === 'undefined') {
    if (canvasTotal && canvasTotal.parentNode) {
      canvasTotal.parentNode.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.8rem;color:var(--text-secondary);text-align:center;padding:1rem;border:1px dashed var(--border);border-radius:8px;">⚠️ Gráfico indisponível (Chart.js não carregado)</div>';
    }
    if (canvasSplit && canvasSplit.parentNode) {
      canvasSplit.parentNode.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:0.8rem;color:var(--text-secondary);text-align:center;padding:1rem;border:1px dashed var(--border);border-radius:8px;">⚠️ Gráfico indisponível (Chart.js não carregado)</div>';
    }
    return;
  }

  const nomeMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const labels = sortedMeses.map(m => {
    const mesNum = parseInt(m.slice(5, 7), 10);
    return nomeMeses[mesNum - 1];
  });

  const recebidos = sortedMeses.map(m => mesesData[m].recebido);
  const pendentes = sortedMeses.map(m => mesesData[m].total - mesesData[m].recebido);

  const totalRecebido = recebidos.reduce((a, b) => a + b, 0);
  const totalPendente = pendentes.reduce((a, b) => a + b, 0);

  if (ctxTotal) {
    if (faturamentoTotalChart) faturamentoTotalChart.destroy();
    faturamentoTotalChart = new Chart(ctxTotal, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Recebido',
            data: recebidos,
            backgroundColor: '#27ae60',
            borderRadius: 4
          },
          {
            label: 'Pendente',
            data: pendentes,
            backgroundColor: '#f1c40f',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#665f55' }
          }
        },
        scales: {
          x: { 
            stacked: true, 
            grid: { display: false },
            ticks: { color: '#665f55', font: { family: 'Plus Jakarta Sans', size: 11 } }
          },
          y: { 
            stacked: true, 
            grid: { color: 'rgba(140, 123, 101, 0.12)' },
            ticks: { 
              color: '#665f55', 
              font: { family: 'Plus Jakarta Sans', size: 11 },
              callback: value => 'R$ ' + value.toLocaleString('pt-BR') 
            } 
          }
        }
      }
    });
  }

  if (ctxSplit) {
    if (faturamentoSplitChart) faturamentoSplitChart.destroy();
    const totalGeral = totalRecebido + totalPendente;
    const shareVandressa = totalGeral / 2;
    const shareThaynar = totalGeral / 2;

    faturamentoSplitChart = new Chart(ctxSplit, {
      type: 'pie',
      data: {
        labels: ['Vandressa (50%)', 'Thaynar (50%)'],
        datasets: [{
          data: [shareVandressa, shareThaynar],
          backgroundColor: ['#9c7c4f', '#665f55'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { font: { family: 'Plus Jakarta Sans', size: 11 }, color: '#665f55' }
          },
          tooltip: {
            callbacks: {
              label: context => {
                const val = context.raw || 0;
                return context.label + ': ' + val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              }
            }
          }
        }
      }
    });
  }
}

/* ── FILTRAGEM DINÂMICA DO DASHBOARD POR STATUS ────────────────────────── */
function filtrarTabelasDashboardPorStatus(statusLabel) {
  const map = {
    'Vencidos': 'venc',
    'Urgentes (≤3 dias)': 'urg',
    'Atenção (≤7 dias)': 'ate',
    'No Prazo': 'ok'
  };

  const filterKey = map[statusLabel];
  if (!filterKey) return;

  if (currentDashboardFilter === filterKey) {
    currentDashboardFilter = null; // desmarca se clicar no mesmo
  } else {
    currentDashboardFilter = filterKey;
  }

  // Atualiza badge de filtro ativo no UI
  const infoEl = document.getElementById('dash-filtro-info');
  const nomeEl = document.getElementById('dash-filtro-nome');
  if (infoEl && nomeEl) {
    if (currentDashboardFilter) {
      infoEl.style.display = 'inline-block';
      nomeEl.textContent = statusLabel.split(' ')[0]; // pega só 'Vencidos', 'Urgentes', etc.
    } else {
      infoEl.style.display = 'none';
    }
  }

  renderDashboardComDadosCache();
}
window.filtrarTabelasDashboardPorStatus = filtrarTabelasDashboardPorStatus;

window.limparDashboardFiltro = function() {
  currentDashboardFilter = null;
  const infoEl = document.getElementById('dash-filtro-info');
  if (infoEl) infoEl.style.display = 'none';
  renderDashboardComDadosCache();
};

function renderDashboardComDadosCache() {
  if (!dashboardDataCache) return;

  const { guiasItens, cobrItens, judItens, admItens } = dashboardDataCache;

  let filteredGuias = guiasItens.filter(r => r.dias !== null && r.dias <= 60);
  let filteredCobr = cobrItens.filter(r => r.dias !== null && r.dias <= 60);
  let filteredJud = judItens.filter(r => r.dias !== null && r.dias <= 30);
  let filteredAdm = admItens.filter(r => r.dias !== null && r.dias <= 60);

  if (currentDashboardFilter) {
    const filterFn = r => {
      if (r.dias === null) return false;
      if (currentDashboardFilter === 'venc') return r.dias < 0;
      if (currentDashboardFilter === 'urg') return r.dias >= 0 && r.dias <= 3;
      if (currentDashboardFilter === 'ate') return r.dias > 3 && r.dias <= 7;
      if (currentDashboardFilter === 'ok') return r.dias > 7;
      return true;
    };
    filteredGuias = filteredGuias.filter(filterFn);
    filteredCobr = filteredCobr.filter(filterFn);
    filteredJud = filteredJud.filter(filterFn);
    filteredAdm = filteredAdm.filter(filterFn);
  }

  // Render tabelas
  renderDashTabela('dash-guias-body', filteredGuias, row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td>${escHtml(row.competencia)||'—'}</td><td>${escHtml(row.numero)||'—'}</td>
        <td>${fmtDate(row.prazo)}</td><td>${row.dias} dias</td>
        <td>${statusBadge(row.status)}</td></tr>`,
    'Nenhuma guia pendente ✓');

  renderDashTabela('dash-cobr-body', filteredCobr, row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td>${escHtml(row.origem)}</td><td>${row.parcela||'—'}</td>
        <td>${fmtBRL(row.valor)}</td><td>${fmtDate(row.prazo)}</td>
        <td>${row.dias} dias</td><td>${statusBadge(row.status)}</td></tr>`,
    'Nenhuma cobrança em aberto ✓');

  renderDashTabela('dash-jud-body', filteredJud, row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td><span class="badge badge-azul">${escHtml(row.modulo)}</span></td>
        <td>${escHtml(row.tipo)}</td><td>${fmtDate(row.prazo)}</td>
        <td>${row.dias} dias</td><td>${statusBadge(row.status)}</td></tr>`,
    'Nenhum prazo judicial nos próximos 30 dias ✓');

  renderDashTabela('dash-adm-body', filteredAdm, row => `
    <tr><td>${badgeHtml(row.dias)}</td><td>${escHtml(row.nome)}</td>
        <td>${escHtml(row.beneficio)}</td><td>${escHtml(row.etapa)}</td>
        <td>${fmtDate(row.prazo)}</td><td>${row.dias} dias</td>
        <td>${statusBadge(row.status)}</td></tr>`,
    'Nenhum prazo administrativo próximo ✓');
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

  // Render donut chart para prazos
  renderDashboardPrazosChart(venc, urg, ate, ok);

  // Salva no cache local para filtragem instantânea sem nova requisição
  dashboardDataCache = { guiasItens, cobrItens, judItens, admItens };

  // Renderiza tabelas de acordo com filtro atual
  renderDashboardComDadosCache();
}

function set_text(id, val) {
  const el = document.getElementById(id); if (el) el.textContent = val;
}
function renderDashTabela(tbodyId, itens, rowFn, emptyMsg) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  if (!itens.length) {
    // Calcula colspan dinamicamente a partir do <thead>
    const ncols = tbody.closest('table')?.querySelectorAll('thead th')?.length || 8;
    tbody.innerHTML = `<tr><td colspan="${ncols}" class="empty-state">${emptyMsg}</td></tr>`;
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

/* ── MÉDICOS RESIDENTES ↔ PRAZOS JUDICIAIS AUX-MORADIA ─────────────────── */
let _medicosCache = [];
async function carregarMedicos() {
  const { data, error } = await sb.from('auxilio_moradia').select('*').order('nome_medico');
  if (error) { console.error('Erro ao carregar médicos:', error); return; }
  _medicosCache = data || [];

  // Popula o <select> de médicos (substitui o input freeform anterior)
  const sel = document.getElementById('praz-busca-medico');
  if (sel) {
    if (!_medicosCache.length) {
      sel.innerHTML = '<option value="">— Nenhum médico cadastrado em Médicos Residentes —</option>';
    } else {
      sel.innerHTML = '<option value="">— Selecione um médico já cadastrado —</option>' +
        _medicosCache.map(m =>
          `<option value="${escHtml(m.id)}">${escHtml(m.nome_medico)}${m.crm ? ' · CRM '+escHtml(m.crm) : ''}${m.hospital ? ' · '+escHtml(m.hospital) : ''}</option>`
        ).join('');
    }
  }

  // Também mantém o datalist (legado) caso esteja no DOM
  const dl = document.getElementById('lista-medicos-praz');
  if (dl) {
    dl.innerHTML = _medicosCache.map(m =>
      `<option value="${escHtml(m.nome_medico)}">`).join('');
  }
}

/* Chamada pelo onchange do <select id="praz-busca-medico"> — recebe o ID do médico */
async function aplicarMedicoSelecionado(idMedico) {
  if (!idMedico) {
    set('praz-medico-id', '');
    return;
  }
  const med = _medicosCache.find(m => m.id === idMedico);
  if (!med) { toast('Médico não encontrado no cache.', true); return; }

  // Garante que os selects de área/tipo/fase estão populados ANTES de setar valores
  const selArea = document.getElementById('praz-area');
  const selTipo = document.getElementById('praz-tipo-acao-sel');
  const selFase = document.getElementById('praz-fase-sel');

  if (window.UI?.popularAreas && selArea) window.UI.popularAreas(selArea);
  if (med.area) { selArea.value = med.area; }
  if (window.UI?.popularTiposAcao && selTipo) window.UI.popularTiposAcao(selTipo, med.area || '');
  if (med.tipo_acao_codigo) { selTipo.value = med.tipo_acao_codigo; }
  if (window.UI?.popularFases && selFase) window.UI.popularFases(selFase, med.area || '', med.tipo_acao_codigo || '');
  if (med.fase_processo) { selFase.value = med.fase_processo; }

  // Preenche os campos principais
  set('praz-medico-id', med.id);
  set('praz-cliente', med.nome_medico);
  set('praz-cpf', med.cpf || '');
  set('praz-numero', med.numero_processo || '');
  if (med.juiz) set('praz-juiz', med.juiz);

  toast(`✓ Dados de ${med.nome_medico} preenchidos.`);
}

/* ── SINCRONIZAÇÃO RECURSO INTERPOSTO ─────────────────────────────────── */
/* Quando a fase do adm/axd/bpc/sal vira "Recurso interposto", cria automática
   uma entrada na tabela `recursos` (idempotente: 1 por origem). */
async function sincronizarRecursoAutomatico(origemTipo, origemId, payload) {
  const fase = (payload.fase_atual || '').toLowerCase();
  if (!fase.includes('recurso interposto')) return;
  // Já existe recurso vinculado? não duplica.
  const { data: existe } = await sb.from('recursos').select('id')
    .eq('origem_tipo', origemTipo).eq('origem_id', origemId).limit(1);
  if (existe && existe.length) return;
  await sb.from('recursos').insert({
    origem_tipo: origemTipo, origem_id: origemId,
    cliente_id: payload.cliente_id,
    numero_requerimento: payload.numero_processo,
    nome_cliente: payload.nome_cliente,
    cpf: payload.cpf,
    tipo_beneficio: payload.tipo_beneficio || (
      origemTipo === 'sal' ? 'Salário-Maternidade' :
      origemTipo === 'axd' ? 'Auxílio-Doença' :
      origemTipo === 'bpc' ? 'BPC/LOAS' : null
    ),
    modalidade: 'Recurso Administrativo',
    data_protocolo: payload.data_decisao || null,  // recurso protocolado a partir da decisão
    prazo_resposta: payload.prazo_recurso || null,
    fase_atual: 'Aguardando análise CRPS',
    proximo_prazo: payload.prazo_recurso || null,
    tipo_prazo: 'Recurso administrativo (CRPS)',
    status: 'Em andamento',
    resultado: 'Aguardando',
  });
}

/* ── PRAZOS JUDICIAIS POR ESCOPO ───────────────────────────────────────── */
function openPrazoEscopo(escopo) {
  window.openModal('praz');
  // O buildPayload do 'praz' lê de modal-praz.dataset.escopo
  document.getElementById('modal-praz').dataset.escopo = escopo;
  // Mostra "Buscar Médico" apenas para Auxílio-Moradia
  const row = document.getElementById('praz-busca-medico-row');
  if (row) row.style.display = (escopo === 'AUX_MORADIA') ? '' : 'none';
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

/* ── FATURAMENTO MENSAL (50/50 Vandressa + Thaynar) ────────────────────── */
async function loadFaturamento() {
  // Popula seletor de anos
  const selAno = document.getElementById('fat-ano');
  if (selAno && !selAno.options.length) {
    const anoAtual = new Date().getFullYear();
    let html = '';
    for (let a = anoAtual - 1; a <= anoAtual + 2; a++) {
      html += `<option value="${a}" ${a === anoAtual ? 'selected':''}>${a}</option>`;
    }
    selAno.innerHTML = html;
  }
  const ano = parseInt(selAno?.value || new Date().getFullYear(), 10);

  const { data, error } = await sb.from('controle_cobrancas')
    .select('mes_referencia,data_limite_pgto,data_recebimento,valor_parcela,valor_recebido,status,nome_cliente,tipo_beneficio')
    .eq('categoria', 'honorário');
  if (error) { toast('Erro ao carregar faturamento.', true); return; }

  // Agrupa por mês (AAAA-MM): usa mes_referencia se houver, senão data_limite_pgto
  const meses = {};
  (data || []).forEach(c => {
    let mes = c.mes_referencia;
    if (!mes && c.data_limite_pgto) mes = c.data_limite_pgto.slice(0, 7);
    if (!mes) return;
    if (!mes.startsWith(String(ano))) return;
    if (!meses[mes]) meses[mes] = { total: 0, recebido: 0, count: 0 };
    const valor = Number(c.valor_parcela || 0);
    const rec   = Number(c.valor_recebido || 0);
    meses[mes].total += valor;
    meses[mes].recebido += rec;
    meses[mes].count += 1;
  });

  // Render
  const nomeMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const sortedMeses = Object.keys(meses).sort();
  const tbody = document.getElementById('fat-body');
  if (!sortedMeses.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">Nenhuma cobrança registrada para ${ano}.</td></tr>`;
  } else {
    tbody.innerHTML = sortedMeses.map(mes => {
      const m = meses[mes];
      const mesNum = parseInt(mes.slice(5, 7), 10);
      const pendente = m.total - m.recebido;
      const metade = m.total / 2;
      return `<tr>
        <td><strong>${nomeMeses[mesNum-1]} / ${mes.slice(0,4)}</strong></td>
        <td>${fmtBRL(m.total)}</td>
        <td>${fmtBRL(metade)}</td>
        <td>${fmtBRL(metade)}</td>
        <td style="color:var(--verde)">${fmtBRL(m.recebido)}</td>
        <td style="color:${pendente > 0 ? 'var(--vermelho)' : 'var(--texto-suave)'}">${fmtBRL(pendente)}</td>
        <td>${m.count}</td>
      </tr>`;
    }).join('');
  }

  // Totais do ano
  const totalAno = Object.values(meses).reduce((s, m) => s + m.total, 0);
  const recAno   = Object.values(meses).reduce((s, m) => s + m.recebido, 0);
  const pendAno  = totalAno - recAno;
  document.getElementById('fat-ano-total').textContent     = fmtBRL(recAno);
  document.getElementById('fat-ano-pendente').textContent  = fmtBRL(pendAno);
  document.getElementById('fat-ano-vandressa').textContent = fmtBRL(totalAno / 2);
  document.getElementById('fat-ano-thaynar').textContent   = fmtBRL(totalAno / 2);

  // Renderizar gráficos de faturamento e divisão
  renderFaturamentoCharts(meses, sortedMeses);
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
  if (mod === 'faturamento')  loadFaturamento();
  if (mod === 'dashboard')    loadDashboardCategorizado();
};

/* ── EXPORT ────────────────────────────────────────────────────────────── */
window.MODULOS = {
  carregarClientes, popularDatalists, aplicarClienteSelecionado, upsertClienteDoFormulario,
  recalcPrazoAdm, atualizarDecisaoAdm, atualizarParcelasAdm,
  recalcPrazoSalMat, atualizarDecisaoSalMat,
  renderGuiasSalMat, coletarGuiasSalMat, salvarGuiasSalMat, carregarGuiasSalMat,
  vencimentoAutoGuia, recalcHonorariosSalMat,
  renderParcelasBeneficio, atualizarParcelasSalMat, coletarParcelasSalMat,
  gerarParcelasCobrancaSalMat, persistirParcelasCobrancaSalMat,
  recalcPrazoAxd, atualizarDecisaoAxd, atualizarNaturezaAxd, atualizarHonorAxd, loadAxd, axdData: () => axdData,
  recalcPrazoBpc, atualizarDecisaoBpc, atualizarNaturezaBpc, loadBpc, bpcData: () => bpcData,
  atualizarParcelasJud, lookupAdmDoJud,
  loadRec, recData: () => recData, recalcPrazoRec, atualizarModalidadeRec, buscarRequerimento,
  selecionarRequerimento, criarRecursoDe, ajuizarDeRow, ajuizarAcaoDe,
  iniciarProcessoParaCliente, criarRecursoDeRow,
  loadDashboardCategorizado, criarCobrancaAutomatica, sincronizarRecursoAutomatico,
  carregarMedicos, aplicarMedicoSelecionado, loadFaturamento,
  loadPrazosFiltrado, loadClientesModule,
};

/* ── BOOT — popula datalist de clientes assim que carrega ─────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', carregarClientes);
} else {
  carregarClientes();
}

})();
