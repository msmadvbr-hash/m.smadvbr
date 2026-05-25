/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENTES DE UI INTELIGENTES — M&SM Advocacia
   ───────────────────────────────────────────────────────────────────────────
   - Cascata: Área → Tipo de Ação → Fase
   - Checklist de documentos (com persistência em documentos_processo)
   - Calculadora embutida (preview de honorários ao vivo)
   - Calculador de prazos por peça
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const { sb, escHtml, fmtBRL, toast, set, vd, vn, v } = window.APP;
const { AREAS, TIPOS_ACAO, FASES_POR_RITO, DOCS_POR_KIT, PECAS } = window.CATALOGOS;

/* ── DROPDOWN: ÁREA ───────────────────────────────────────────────────── */
function popularAreas(selectEl, areasFiltro) {
  selectEl.innerHTML = '<option value="">— Selecione a área —</option>' +
    AREAS.filter(a => !areasFiltro || areasFiltro.includes(a.codigo))
         .map(a => `<option value="${a.codigo}">${escHtml(a.nome)}</option>`).join('');
}

/* ── DROPDOWN: TIPO DE AÇÃO (depende de área) ─────────────────────────── */
function popularTiposAcao(selectEl, areaCodigo) {
  if (!areaCodigo) {
    selectEl.innerHTML = '<option value="">— Selecione a área primeiro —</option>';
    selectEl.disabled = true;
    return;
  }
  const lista = TIPOS_ACAO[areaCodigo] || [];
  selectEl.innerHTML = '<option value="">— Selecione o tipo de ação —</option>' +
    lista.map(t => `<option value="${t.codigo}">${escHtml(t.nome)}</option>`).join('');
  selectEl.disabled = false;
}

/* ── DROPDOWN: FASE (depende de tipo de ação → rito) ───────────────────── */
function popularFases(selectEl, areaCodigo, tipoCodigo) {
  if (!areaCodigo || !tipoCodigo) {
    selectEl.innerHTML = '<option value="">— Selecione o tipo primeiro —</option>';
    return;
  }
  const tipo = (TIPOS_ACAO[areaCodigo] || []).find(t => t.codigo === tipoCodigo);
  if (!tipo) { selectEl.innerHTML = '<option value="">—</option>'; return; }
  const fases = FASES_POR_RITO[tipo.rito] || [];
  selectEl.innerHTML = '<option value="">— Selecione a fase —</option>' +
    fases.map(f => `<option value="${escHtml(f)}">${escHtml(f)}</option>`).join('');
}

/* ── DROPDOWN: PEÇA (filtro por rito) ─────────────────────────────────── */
function popularPecas(selectEl) {
  selectEl.innerHTML = '<option value="">— Selecione a peça —</option>' +
    PECAS.map(p => `<option value="${p.codigo}">${escHtml(p.nome)} (${p.dias} d ${p.contagem})</option>`).join('');
}

/* ── CHECKLIST DE DOCUMENTOS ──────────────────────────────────────────── */
let _docsCache = {}; // chave: `${tipo}:${id}` → array de docs

async function carregarDocs(processoTipo, processoId) {
  const key = `${processoTipo}:${processoId}`;
  const { data, error } = await sb.from('documentos_processo')
    .select('*').eq('processo_tipo', processoTipo).eq('processo_id', processoId);
  if (error) { console.error(error); return []; }
  _docsCache[key] = data || [];
  return _docsCache[key];
}

function renderChecklistDocs(containerId, kit, processoTipo, processoId, salvos = []) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const docsKit = DOCS_POR_KIT[kit] || [];
  const isNovo = (processoId === 'novo' || !processoId);

  // mescla: doc do kit + doc personalizado já salvo que não está no kit
  const extras = salvos.filter(s => !docsKit.includes(s.nome));
  const todos = [
    ...docsKit.map(nome => ({ nome, salvo: salvos.find(s => s.nome === nome) })),
    ...extras.map(s => ({ nome: s.nome, salvo: s, extra: true })),
  ];

  const totalOk       = salvos.filter(s => s.status === 'OK').length;
  const totalFaltante = salvos.filter(s => s.status === 'FALTANTE').length;
  const totalNa       = salvos.filter(s => s.status === 'NA').length;
  const totalGeral    = todos.length;

  const avisoNovo = isNovo
    ? `<div style="background:rgba(241,196,15,.15); border-left:3px solid #c9a300; padding:.7rem 1rem; margin-bottom:.6rem; font-size:.82rem">
         ⚠️ <strong>Salve o registro primeiro</strong> (botão Salvar no rodapé) para começar a marcar
         o status dos documentos. Esta é apenas a lista sugerida.
       </div>` : '';

  container.innerHTML = `
    ${avisoNovo}
    <div class="docs-progress">
      <span>📋 Total: <strong>${totalGeral}</strong></span>
      <span>✅ OK: <strong>${totalOk}</strong></span>
      <span>❌ Faltante: <strong>${totalFaltante}</strong></span>
      <span>➖ N/A: <strong>${totalNa}</strong></span>
    </div>
    <ul class="docs-list">
      ${todos.map((d) => {
        const st = d.salvo?.status || '';
        return `
        <li>
          <span>${escHtml(d.nome)}${d.extra ? ' <em style="color:var(--texto-suave);font-size:.7rem">(extra)</em>' : ''}</span>
          <select class="doc-status ${st.toLowerCase()}" data-nome="${escHtml(d.nome)}"
                  ${isNovo ? 'disabled' : ''}
                  onchange="window.UI.atualizarStatusDoc('${processoTipo}','${processoId}', this)">
            <option value=""         ${st===''         ?'selected':''}>— status —</option>
            <option value="OK"       ${st==='OK'       ?'selected':''}>OK</option>
            <option value="FALTANTE" ${st==='FALTANTE' ?'selected':''}>FALTANTE</option>
            <option value="NA"       ${st==='NA'       ?'selected':''}>N/A</option>
          </select>
          <button class="btn btn-secondary btn-sm" type="button" ${isNovo ? 'disabled' : ''}
                  onclick="window.UI.editarObs('${processoTipo}','${processoId}','${escHtml(d.nome)}')">
            📝
          </button>
        </li>`;
      }).join('')}
    </ul>
    ${isNovo ? '' : `
    <div style="margin-top:.8rem; display:flex; gap:.5rem;">
      <input type="text" id="${containerId}-novo-doc" placeholder="+ Adicionar documento personalizado"
             style="flex:1; border:1px solid rgba(184,145,74,.35); padding:8px 10px;">
      <button class="btn btn-secondary btn-sm" type="button"
              onclick="window.UI.adicionarDocExtra('${containerId}','${processoTipo}','${processoId}')">Adicionar</button>
    </div>`}`;
}

async function atualizarStatusDoc(processoTipo, processoId, selectEl) {
  const nome = selectEl.dataset.nome;
  const status = selectEl.value;
  selectEl.className = `doc-status ${status.toLowerCase()}`;

  const payload = { processo_tipo: processoTipo, processo_id: processoId, nome, status: status || null };
  // upsert por (processo_tipo, processo_id, nome)
  const { error } = await sb.from('documentos_processo').upsert(payload, { onConflict: 'processo_tipo,processo_id,nome' });
  if (error) { toast('Erro ao salvar status do doc.', true); console.error(error); }
}

async function editarObs(processoTipo, processoId, nome) {
  const obs = prompt('Observação para "' + nome + '":');
  if (obs === null) return;
  const { error } = await sb.from('documentos_processo')
    .upsert({ processo_tipo: processoTipo, processo_id: processoId, nome, observacao: obs },
            { onConflict: 'processo_tipo,processo_id,nome' });
  if (error) toast('Erro.', true); else toast('Observação salva.');
}

async function adicionarDocExtra(containerId, processoTipo, processoId) {
  const inp = document.getElementById(containerId + '-novo-doc');
  const nome = inp.value.trim();
  if (!nome) return;
  const { error } = await sb.from('documentos_processo')
    .insert({ processo_tipo: processoTipo, processo_id: processoId, nome, status: 'FALTANTE' });
  if (error) { toast('Erro ao adicionar.', true); return; }
  inp.value = '';
  // recarrega o checklist
  const salvos = await carregarDocs(processoTipo, processoId);
  // detecta o kit a partir do select aberto (heurística simples: usa o último kit que foi renderizado)
  if (window.UI._ultimoKit && window.UI._ultimoContainer === containerId) {
    renderChecklistDocs(containerId, window.UI._ultimoKit, processoTipo, processoId, salvos);
  }
}

/* ── PREVIEW DE CÁLCULO (chama as funções de calculadoras.js) ─────────── */
function renderCalcPreview(containerId, html) {
  const el = document.getElementById(containerId);
  if (el) el.innerHTML = html;
}

/* ── PREVIEW DE PRAZO (peça → data fatal) ─────────────────────────────── */
function calcularEMostrarPrazo({ dataIntimacaoId, pecaId, fazendaId, outputId, dataFatalId }) {
  const dataIntimacao = vd(dataIntimacaoId);
  const pecaCodigo    = v(pecaId);
  const fazenda       = document.getElementById(fazendaId)?.checked || false;

  if (!dataIntimacao || !pecaCodigo) {
    const el = document.getElementById(outputId);
    if (el) el.innerHTML = '<em style="color:var(--texto-suave)">Preencha a data de intimação e a peça para calcular o prazo.</em>';
    return;
  }
  const res = window.PRAZOS.calcularPrazo({ dataIntimacao, pecaCodigo, fazendaPublica: fazenda });
  if (!res) return;

  document.getElementById(outputId).innerHTML = `
    <div class="prazo-helper">
      <div><strong>📅 Data fatal: ${new Date(res.dataFatal+'T00:00:00').toLocaleDateString('pt-BR')}</strong></div>
      <div style="white-space:pre-line; margin-top:.4rem; font-size:.78rem; color:var(--texto-suave)">${res.memoria}</div>
    </div>`;

  if (dataFatalId) {
    const el = document.getElementById(dataFatalId);
    if (el) el.value = res.dataFatal;
  }
}

/* ── TABS ────────────────────────────────────────────────────────────── */
function ativarTab(tabsContainerId, paneClass, tabIndex) {
  const tabs = document.querySelectorAll('#' + tabsContainerId + ' .tab');
  const panes = document.querySelectorAll('.' + paneClass);
  tabs.forEach((t,i) => t.classList.toggle('active', i === tabIndex));
  panes.forEach((p,i) => p.classList.toggle('active', i === tabIndex));
}

/* ── EXPORT ──────────────────────────────────────────────────────────── */
window.UI = {
  popularAreas, popularTiposAcao, popularFases, popularPecas,
  carregarDocs, renderChecklistDocs, atualizarStatusDoc, editarObs, adicionarDocExtra,
  renderCalcPreview, calcularEMostrarPrazo, ativarTab,
  _ultimoKit: null, _ultimoContainer: null,
};

})();
