/* ═══════════════════════════════════════════════════════════════════════════
   CALCULADORAS DE HONORÁRIOS — M&SM Advocacia
   ───────────────────────────────────────────────────────────────────────────
   Todas retornam: { base, valorAcao, honorarios, memoria }
   - base       : valor base que serve de referência (total de bolsa, total
                  do benefício, atrasados, etc.)
   - valorAcao  : valor da ação propriamente dita (quando aplicável)
   - honorarios : valor total dos honorários contratuais
   - memoria    : string descrevendo a memória de cálculo
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const PCT_VALOR_ACAO  = 0.30;  // 30% do total da bolsa → valor da ação (Aux-Moradia)
const PCT_HONORARIOS  = 0.30;  // 30% de honorários sobre o valor da ação

/* ── Aux-Moradia Médico Residente ───────────────────────────────────────
   total_bolsa = Σ (bolsa_mensal_i × meses_i)
   valor_acao  = 30% × total_bolsa
   honorarios  = 30% × valor_acao   (= 9% da bolsa total)              */
function calcAuxMoradia(competencias) {
  // competencias: [{ inicio:'YYYY-MM', fim:'YYYY-MM', valor:Number }, ...]
  // ou modo simples: { dataInicio, dataFim, valorMensal }
  let total = 0;
  const itens = [];

  for (const c of competencias) {
    const meses = mesesEntre(c.inicio, c.fim);
    const sub = meses * Number(c.valor || 0);
    total += sub;
    itens.push(`  ${c.inicio} → ${c.fim} (${meses} meses) × ${fmt(c.valor)} = ${fmt(sub)}`);
  }

  const valorAcao  = total * PCT_VALOR_ACAO;
  const honorarios = valorAcao * PCT_HONORARIOS;

  return {
    base: total,
    valorAcao,
    honorarios,
    memoria:
      `Total da bolsa acumulada: ${fmt(total)}\n` +
      itens.join('\n') +
      `\nValor da ação (30% do total): ${fmt(valorAcao)}` +
      `\nHonorários (30% do valor da ação): ${fmt(honorarios)}`,
  };
}

/* ── Salário-Maternidade ─────────────────────────────────────────────────
   total = valor_mensal × parcelas (padrão 4; em prorrogação, customizado)
   honor = 30% × total                                                  */
function calcSalarioMaternidade(valorMensal, parcelas = 4) {
  const v = Number(valorMensal || 0);
  const p = Number(parcelas || 4);
  const total = v * p;
  const honorarios = total * PCT_HONORARIOS;
  return {
    base: total,
    valorAcao: total,
    honorarios,
    parcelas: p,
    memoria:
      `Valor mensal do benefício: ${fmt(v)}\n` +
      `${p} parcela(s) → total do benefício: ${fmt(total)}\n` +
      `Honorários (30% sobre o total): ${fmt(honorarios)}`,
  };
}

/* ── Auxílio por Incapacidade Temporária ─────────────────────────────────
   total = valor_mensal × meses_recebidos
   honor = 30% × total                                                  */
function calcAuxIncapacidade(valorMensal, mesesRecebidos) {
  const v = Number(valorMensal || 0);
  const n = Number(mesesRecebidos || 0);
  const total = v * n;
  const honorarios = total * PCT_HONORARIOS;
  return {
    base: total,
    valorAcao: total,
    honorarios,
    memoria:
      `Valor mensal: ${fmt(v)} × ${n} meses = ${fmt(total)}\n` +
      `Honorários (30% sobre o total recebido): ${fmt(honorarios)}`,
  };
}

/* ── BPC/LOAS ────────────────────────────────────────────────────────────
   honor_atrasados = 30% × (meses_atrasados × salario_minimo)
   honor_vincendos = 30% × (12 × salario_minimo)
   honor_total     = atrasados + vincendos                              */
function calcBPC(mesesAtrasados, salarioMinimo) {
  const sm = Number(salarioMinimo || 0);
  const m  = Number(mesesAtrasados || 0);

  const atrasados        = m * sm;
  const honorAtrasados   = atrasados * PCT_HONORARIOS;
  const vincendos        = 12 * sm;
  const honorVincendos   = vincendos * PCT_HONORARIOS;
  const honorarios       = honorAtrasados + honorVincendos;

  return {
    base: atrasados + vincendos,
    valorAcao: atrasados + vincendos,
    honorarios,
    detalhe: { honorAtrasados, honorVincendos, atrasados, vincendos },
    memoria:
      `Salário mínimo de referência: ${fmt(sm)}\n` +
      `Atrasados (${m} meses × SM): ${fmt(atrasados)}\n` +
      `  Honorários sobre atrasados (30%): ${fmt(honorAtrasados)}\n` +
      `Vincendos (12 × SM): ${fmt(vincendos)}\n` +
      `  Honorários sobre vincendos (30%): ${fmt(honorVincendos)}\n` +
      `Honorários TOTAIS: ${fmt(honorarios)}`,
  };
}

/* ── Calculadora genérica (% sobre valor) ────────────────────────────── */
function calcGenerico(valorBase, pctHonorarios) {
  const base = Number(valorBase || 0);
  const pct  = Number(pctHonorarios || 0) / 100;
  const honorarios = base * pct;
  return {
    base, valorAcao: base, honorarios,
    memoria: `Base: ${fmt(base)} × ${(pct*100).toFixed(2)}% = ${fmt(honorarios)}`,
  };
}

/* ── HELPERS ──────────────────────────────────────────────────────────── */
function mesesEntre(yyyymmIni, yyyymmFim) {
  if (!yyyymmIni || !yyyymmFim) return 0;
  const [ai, mi] = yyyymmIni.split('-').map(Number);
  const [af, mf] = yyyymmFim.split('-').map(Number);
  const total = (af - ai) * 12 + (mf - mi) + 1;
  return total > 0 ? total : 0;
}

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

window.CALC = {
  calcAuxMoradia, calcSalarioMaternidade, calcAuxIncapacidade,
  calcBPC, calcGenerico, mesesEntre, fmt,
  PCT_VALOR_ACAO, PCT_HONORARIOS,
};

})();
