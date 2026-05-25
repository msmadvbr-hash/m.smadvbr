/* ═══════════════════════════════════════════════════════════════════════════
   MOTOR DE PRAZOS PROCESSUAIS — M&SM Advocacia
   ───────────────────────────────────────────────────────────────────────────
   Calcula data fatal a partir da data de intimação e da peça processual.
   Considera:
     - dias úteis (CPC art. 219) vs. dias corridos
     - feriados nacionais/estaduais/municipais (catalogos.js · FERIADOS)
     - recesso forense (20/12 a 20/01 — CNJ Res. 244/2016)
     - dobro de prazo para Fazenda Pública (CPC art. 183)
     - exclusão do dia do início, inclusão do dia do vencimento (CPC art. 224)
     - prorrogação para o próximo dia útil se vencer em feriado/fim de semana
   ═══════════════════════════════════════════════════════════════════════════ */

function isFeriado(date) {
  const iso = date.toISOString().slice(0,10);
  return window.CATALOGOS.FERIADOS.includes(iso);
}

function isDiaUtil(date) {
  const dow = date.getDay(); // 0 dom, 6 sab
  if (dow === 0 || dow === 6) return false;
  if (isFeriado(date)) return false;
  if (window.CATALOGOS.emRecessoForense(date)) return false;
  return true;
}

function proximoDiaUtil(date) {
  const d = new Date(date);
  while (!isDiaUtil(d)) d.setDate(d.getDate() + 1);
  return d;
}

/* ── CÁLCULO PRINCIPAL ─────────────────────────────────────────────────── */
function calcularPrazo({ dataIntimacao, pecaCodigo, fazendaPublica = false }) {
  if (!dataIntimacao || !pecaCodigo) return null;
  const peca = window.CATALOGOS.PECAS.find(p => p.codigo === pecaCodigo);
  if (!peca) return null;

  let dias = peca.dias;
  const aplicouDobro = fazendaPublica && peca.dobro_fazenda;
  if (aplicouDobro) dias *= 2;

  // Início: dia útil seguinte à intimação (CPC art. 224, §3º)
  let d = new Date(dataIntimacao + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  while (!isDiaUtil(d)) d.setDate(d.getDate() + 1);

  // Contagem
  if (peca.contagem === 'uteis') {
    let restantes = dias - 1; // já contamos o 1º dia
    while (restantes > 0) {
      d.setDate(d.getDate() + 1);
      if (isDiaUtil(d)) restantes--;
    }
  } else {
    d.setDate(d.getDate() + (dias - 1));
    // Prorrogação para o próximo dia útil se cair em fim de semana/feriado
    while (!isDiaUtil(d)) d.setDate(d.getDate() + 1);
  }

  return {
    dataFatal: d.toISOString().slice(0,10),
    diasAplicados: dias,
    contagem: peca.contagem,
    aplicouDobro,
    pecaNome: peca.nome,
    memoria:
      `Peça: ${peca.nome}\n` +
      `Prazo legal: ${peca.dias} dia(s) ${peca.contagem}\n` +
      (aplicouDobro ? `Dobro Fazenda Pública (art. 183 CPC): aplicado → ${dias} dia(s)\n` : '') +
      `Data da intimação: ${fmtDateBR(dataIntimacao)}\n` +
      `Data fatal: ${fmtDateBR(d.toISOString().slice(0,10))}`,
  };
}

/* ── DIAS RESTANTES ATÉ HOJE ──────────────────────────────────────────── */
function diasRestantes(dataFatal) {
  if (!dataFatal) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const fatal = new Date(dataFatal + 'T00:00:00');
  return Math.ceil((fatal - hoje) / 86400000);
}

function fmtDateBR(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
}

window.PRAZOS = { calcularPrazo, diasRestantes, isDiaUtil, proximoDiaUtil };
