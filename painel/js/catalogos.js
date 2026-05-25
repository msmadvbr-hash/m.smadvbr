/* ═══════════════════════════════════════════════════════════════════════════
   CATÁLOGOS JURÍDICOS — M&SM Advocacia
   ───────────────────────────────────────────────────────────────────────────
   Tipos de ação por área, fases por tipo, documentos sugeridos, peças e
   prazos legais. Espelha (de forma simplificada) o que aparece no PJe
   TJCE e TRF5 quando se cadastra uma ação.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

/* ── ÁREAS ──────────────────────────────────────────────────────────────── */
const AREAS = [
  { codigo: 'PREV_FED',  nome: 'Previdenciário · TRF5/JEF',        tribunal: 'TRF5' },
  { codigo: 'AUX_TJCE',  nome: 'Aux-Moradia Médico · TJCE',         tribunal: 'TJCE' },
  { codigo: 'AUX_TRF5',  nome: 'Aux-Moradia Médico · TRF5',         tribunal: 'TRF5' },
  { codigo: 'SAUDE',     nome: 'Direito à Saúde',                   tribunal: 'TJCE/TRF5' },
  { codigo: 'ADM_INSS',  nome: 'Administrativo · INSS',             tribunal: 'INSS' },
];

/* ── TIPOS DE AÇÃO POR ÁREA ─────────────────────────────────────────────────
   Cada tipo aponta para a sua trilha de fases (rito) e seu kit de documentos. */
const TIPOS_ACAO = {
  PREV_FED: [
    { codigo: 'AIT',       nome: 'Auxílio por Incapacidade Temporária (Doença)', rito: 'JEF',   docs: 'AIT'   },
    { codigo: 'INVALIDEZ', nome: 'Aposentadoria por Invalidez',                  rito: 'JEF',   docs: 'AIT'   },
    { codigo: 'APOS_IDADE',nome: 'Aposentadoria por Idade (Urbana/Rural/Híbrida)',rito:'JEF',   docs: 'APOS'  },
    { codigo: 'APOS_TC',   nome: 'Aposentadoria por Tempo de Contribuição',      rito: 'JEF',   docs: 'APOS'  },
    { codigo: 'APOS_ESP',  nome: 'Aposentadoria Especial',                       rito: 'JEF',   docs: 'APOS'  },
    { codigo: 'SAL_MAT',   nome: 'Salário-Maternidade',                          rito: 'JEF',   docs: 'SAL_MAT'},
    { codigo: 'PENSAO',    nome: 'Pensão por Morte',                             rito: 'JEF',   docs: 'PENSAO'},
    { codigo: 'BPC',       nome: 'BPC/LOAS (Idoso ou Deficiente)',               rito: 'JEF',   docs: 'BPC'   },
    { codigo: 'AUX_ACID',  nome: 'Auxílio-Acidente',                             rito: 'JEF',   docs: 'AIT'   },
    { codigo: 'REVISAO',   nome: 'Revisão de Benefício',                         rito: 'JEF',   docs: 'REVISAO'},
    { codigo: 'RESTAB',    nome: 'Restabelecimento de Benefício',                rito: 'JEF',   docs: 'AIT'   },
    { codigo: 'MS_FED',    nome: 'Mandado de Segurança Federal',                 rito: 'MS',    docs: 'MS'    },
  ],
  AUX_TJCE: [
    { codigo: 'COBR_EST',  nome: 'Cobrança de Aux-Moradia · Estado/Município',   rito: 'COMUM_FAZ', docs: 'AUX_MED' },
    { codigo: 'INDEN_EST', nome: 'Indenização por Danos Materiais Retroativos',  rito: 'COMUM_FAZ', docs: 'AUX_MED' },
    { codigo: 'MS_TJCE',   nome: 'Mandado de Segurança · TJCE',                  rito: 'MS',        docs: 'MS_AUX'  },
  ],
  AUX_TRF5: [
    { codigo: 'COBR_UNIAO',nome: 'Cobrança de Aux-Moradia · União/Hosp. Federal',rito: 'COMUM_FAZ', docs: 'AUX_MED' },
    { codigo: 'MS_TRF5',   nome: 'Mandado de Segurança · TRF5',                  rito: 'MS',        docs: 'MS_AUX'  },
  ],
  SAUDE: [
    { codigo: 'MEDIC',     nome: 'Fornecimento de Medicamento',                  rito: 'TUTELA',    docs: 'SAUDE'   },
    { codigo: 'TRATAM',    nome: 'Tratamento Médico / Cirurgia',                 rito: 'TUTELA',    docs: 'SAUDE'   },
    { codigo: 'UTI',       nome: 'Internação em UTI / Leito',                    rito: 'TUTELA',    docs: 'SAUDE'   },
    { codigo: 'HOMECARE',  nome: 'Custeio de Home Care',                         rito: 'TUTELA',    docs: 'SAUDE'   },
    { codigo: 'MS_SAUDE',  nome: 'Mandado de Segurança · Saúde',                 rito: 'MS',        docs: 'MS_SAUDE'},
  ],
  ADM_INSS: [
    { codigo: 'ADM_REQ',   nome: 'Requerimento Administrativo INSS',             rito: 'ADM',       docs: 'ADM_INSS'},
    { codigo: 'ADM_REC',   nome: 'Recurso CRPS / JR',                            rito: 'ADM',       docs: 'ADM_INSS'},
  ],
};

/* ── FASES PROCESSUAIS POR RITO ─────────────────────────────────────────── */
const FASES_POR_RITO = {
  JEF: [
    'Distribuído','Despacho inicial','Citação do réu','Contestação',
    'Audiência de conciliação/instrução','Especificação de provas',
    'Perícia médica designada','Laudo pericial juntado','Manifestação sobre laudo',
    'Sentença','Embargos de Declaração','Recurso Inominado',
    'Contrarrazões','Turma Recursal','Acórdão',
    'Trânsito em julgado','Cumprimento de sentença','Implantação do benefício',
    'RPV expedida','Alvará/Levantamento','Arquivado',
  ],
  COMUM_FAZ: [
    'Distribuído','Conclusos ao despacho inicial','Despacho inicial / Emenda',
    'Citação do réu','Contestação','Réplica','Especificação de provas',
    'Decisão saneadora','Audiência de instrução','Memoriais',
    'Conclusos para sentença','Sentença','Embargos de Declaração',
    'Apelação','Contrarrazões','Conclusos TJCE/TRF5','Acórdão',
    'Recurso Especial/Extraordinário','Trânsito em julgado',
    'Cumprimento de sentença','Impugnação ao cumprimento',
    'Expedição de Precatório/RPV','Alvará/Levantamento','Arquivado',
  ],
  MS: [
    'Distribuído','Análise de liminar','Liminar deferida','Liminar indeferida',
    'Notificação da autoridade coatora','Informações da autoridade (10 dias)',
    'Manifestação do MP','Sentença','Apelação / Recurso Ordinário',
    'Contrarrazões','Acórdão','Trânsito em julgado','Arquivado',
  ],
  TUTELA: [
    'Distribuído','Análise da tutela','Tutela deferida','Tutela indeferida',
    'Citação','Contestação','Réplica','Especificação de provas',
    'Sentença','Apelação','Contrarrazões','Acórdão',
    'Trânsito em julgado','Cumprimento de sentença','Arquivado',
  ],
  ADM: [
    'Protocolo','Em análise','Exigência (carta)','Cumprimento de exigência',
    'Perícia médica designada','Perícia realizada',
    'Deferido','Indeferido','Recurso interposto',
    'Aguardando análise CRPS','Decisão CRPS','Implantado','Arquivado',
  ],
};

/* ── DOCUMENTOS SUGERIDOS POR TIPO/AÇÃO ─────────────────────────────────
   Lista enxuta, baseada na prática previdenciária e da FAUM/CE.
   Status no UI: OK / FALTANTE / N/A                                       */
const DOCS_POR_KIT = {
  AUX_MED: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência (se justiça gratuita)',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço atual',
    'Carteira do CRM',
    'Certidão de conclusão da residência médica (ou matrícula, se em curso)',
    'Contrato/termo de matrícula no programa de residência',
    'Declaração do hospital com datas de início e fim da residência',
    'Comprovantes de pagamento da bolsa (todos os meses)',
    'Contracheques ou extrato bancário da bolsa',
    'Comprovante de moradia durante a residência (contrato de aluguel, recibos)',
    'Edital do programa de residência (se for útil)',
    'Cálculo memorial dos valores devidos',
  ],
  MS_AUX: [
    'Procuração ad judicia (poderes específicos para MS)',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'Carteira do CRM',
    'Comprovante de matrícula ativa na residência',
    'Comprovante do indeferimento administrativo (ato coator)',
    'Requerimento administrativo protocolado',
    'Edital/regulamento do programa de residência',
  ],
  SAL_MAT: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'Certidão de nascimento do(a) RN (ou atestado médico DPP)',
    'CTPS digitalizada (se urbana com vínculo)',
    'CNIS atualizado (Meu INSS)',
    'Comprovantes de contribuição (12 meses anteriores ao parto)',
    'Comprovante de qualidade de segurada',
    'Indeferimento administrativo do INSS (DER)',
    'Declaração do empregador (se empregada)',
    'Comprovação de atividade rural (se segurada especial)',
  ],
  AIT: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'CNIS atualizado',
    'Indeferimento/Cessação do INSS (DER)',
    'Laudos médicos (com CID e CRM)',
    'Atestados médicos',
    'Receituários',
    'Exames complementares',
    'Histórico clínico / prontuário',
    'Comprovação da qualidade de segurado (CTPS, contribuições)',
    'Comprovação da carência (quando exigida)',
  ],
  APOS: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'CNIS atualizado',
    'CTPS digitalizada',
    'Carnês / Guias de contribuição',
    'PPP — Perfil Profissiográfico Previdenciário (se especial)',
    'LTCAT (se especial)',
    'Indeferimento administrativo (DER)',
    'Documentos rurais (se rural/híbrida): ITR, notas, declarações sindicais',
  ],
  PENSAO: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'Certidão de óbito',
    'Certidão de casamento ou comprovação de união estável',
    'Certidão de nascimento dos filhos (se houver)',
    'CNIS do(a) falecido(a)',
    'Comprovação da qualidade de segurado(a) do(a) falecido(a)',
    'Comprovação de dependência econômica (se aplicável)',
    'Indeferimento administrativo (DER)',
  ],
  BPC: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência',
    'Contrato de honorários',
    'RG e CPF do requerente',
    'RG e CPF de todos os integrantes do grupo familiar',
    'Comprovante de endereço',
    'CadÚnico atualizado (folha resumo)',
    'Comprovante de inscrição no CRAS',
    'Comprovantes de renda de toda a família',
    'Laudos médicos detalhados (se BPC deficiente, com CID)',
    'Atestados, exames, receituários',
    'Declaração de composição familiar',
    'Indeferimento administrativo do INSS (DER)',
    'Cálculo da renda per capita',
  ],
  REVISAO: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'Carta de concessão do benefício',
    'CNIS atualizado',
    'Memorial de cálculo da revisão pretendida',
    'Documentos comprobatórios da tese revisional',
  ],
  MS: [
    'Procuração com poderes específicos para MS',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'Documento que comprove o ato coator',
    'Requerimento administrativo / protocolo',
    'Documentos que demonstrem o direito líquido e certo',
  ],
  SAUDE: [
    'Procuração ad judicia',
    'Declaração de hipossuficiência',
    'Contrato de honorários',
    'RG e CPF',
    'Comprovante de endereço',
    'Cartão SUS',
    'Receituário/prescrição médica com CID e CRM',
    'Laudo médico circunstanciado (indicando urgência e necessidade)',
    'Exames recentes',
    'Negativa do SUS ou do plano de saúde',
    'Bula/registro ANVISA do medicamento (se aplicável)',
    'Orçamentos (mínimo 3 para procedimento/insumo)',
    'Comprovante de hipossuficiência financeira',
  ],
  MS_SAUDE: [
    'Procuração com poderes específicos para MS',
    'Contrato de honorários',
    'RG e CPF',
    'Receituário com CID e CRM',
    'Laudo médico de urgência',
    'Negativa expressa do SUS / autoridade coatora',
    'Comprovação do ato coator (protocolo, ofício)',
  ],
  ADM_INSS: [
    'Procuração administrativa',
    'RG e CPF',
    'Comprovante de endereço',
    'CNIS atualizado',
    'Documentos específicos do benefício pleiteado',
    'Comprovação de carência (se exigida)',
    'Laudos médicos (se benefício por incapacidade)',
  ],
};

/* ── PEÇAS PROCESSUAIS E SEUS PRAZOS LEGAIS ─────────────────────────────
   contagem: 'uteis' (CPC, dias úteis) ou 'corridos' (mandado segurança etc.)
   dobro_fazenda: aplica art. 183 CPC? (não aplica em JEF e MS)              */
const PECAS = [
  { codigo: 'CONTEST_CPC',     nome: 'Contestação · Procedimento Comum',         dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'CONTEST_JEF',     nome: 'Contestação · JEF',                        dias: 30, contagem: 'uteis',  dobro_fazenda: false },
  { codigo: 'REPLICA',         nome: 'Réplica',                                  dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'EMENDA',          nome: 'Emenda à inicial',                         dias: 15, contagem: 'uteis',  dobro_fazenda: false },
  { codigo: 'ESP_PROVAS',      nome: 'Especificação de provas',                  dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'MANIF_LAUDO',     nome: 'Manifestação sobre laudo pericial',        dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'EMBARGOS_DECL',   nome: 'Embargos de Declaração',                   dias: 5,  contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'APELACAO',        nome: 'Apelação',                                 dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'CONTRARR_APEL',   nome: 'Contrarrazões à Apelação',                 dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'REC_INOMINADO',   nome: 'Recurso Inominado (JEF)',                  dias: 10, contagem: 'uteis',  dobro_fazenda: false },
  { codigo: 'CONTRARR_INOM',   nome: 'Contrarrazões ao Inominado',               dias: 10, contagem: 'uteis',  dobro_fazenda: false },
  { codigo: 'AGRAVO_INST',     nome: 'Agravo de Instrumento',                    dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'AGRAVO_INT',      nome: 'Agravo Interno',                           dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'RESP',            nome: 'Recurso Especial',                         dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'REXT',            nome: 'Recurso Extraordinário',                   dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'INFO_MS',         nome: 'Informações em MS (autoridade coatora)',   dias: 10, contagem: 'corridos', dobro_fazenda: false },
  { codigo: 'REC_ORD_MS',      nome: 'Recurso Ordinário em MS',                  dias: 15, contagem: 'uteis',  dobro_fazenda: false },
  { codigo: 'IMPUG_CUMPR',     nome: 'Impugnação ao Cumprimento de Sentença',    dias: 15, contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'IMPUG_CUMPR_FAZ', nome: 'Impugnação · Faz. Pública (art. 535)',     dias: 30, contagem: 'uteis',  dobro_fazenda: false },
  { codigo: 'CUMPR_SENT',      nome: 'Cumprimento de Sentença · petição',        dias: 15, contagem: 'uteis',  dobro_fazenda: false },
  { codigo: 'MANIF_GERAL',     nome: 'Manifestação geral (despacho)',            dias: 5,  contagem: 'uteis',  dobro_fazenda: true  },
  { codigo: 'REC_ADM_INSS',    nome: 'Recurso administrativo INSS (CRPS/JR)',    dias: 30, contagem: 'corridos', dobro_fazenda: false },
  { codigo: 'CUMPR_EXIG',      nome: 'Cumprimento de exigência (INSS)',          dias: 30, contagem: 'corridos', dobro_fazenda: false },
];

/* ── FERIADOS NACIONAIS + ESTADUAIS CE + FORTALEZA ─────────────────────────
   Lista mantida manualmente; atualizar anualmente.
   Datas no formato YYYY-MM-DD.                                             */
const FERIADOS = [
  // 2025
  '2025-01-01','2025-03-03','2025-03-04','2025-03-05','2025-04-18','2025-04-21',
  '2025-05-01','2025-06-19','2025-08-15','2025-09-07','2025-10-12','2025-11-02',
  '2025-11-15','2025-11-20','2025-12-25',
  // 2026
  '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-04-03','2026-04-21',
  '2026-05-01','2026-06-04','2026-08-15','2026-09-07','2026-10-12','2026-11-02',
  '2026-11-15','2026-11-20','2026-12-25',
  // 2027
  '2027-01-01','2027-02-08','2027-02-09','2027-02-10','2027-03-26','2027-04-21',
  '2027-05-01','2027-05-27','2027-08-15','2027-09-07','2027-10-12','2027-11-02',
  '2027-11-15','2027-11-20','2027-12-25',
];

/* ── RECESSO FORENSE (CNJ Res. 244/2016) ──────────────────────────────────
   Prazos suspensos entre 20/12 e 20/01.                                     */
function emRecessoForense(date) {
  const m = date.getMonth() + 1, d = date.getDate();
  return (m === 12 && d >= 20) || (m === 1 && d <= 20);
}

/* ── EXPORTAÇÃO GLOBAL ─────────────────────────────────────────────────── */
window.CATALOGOS = {
  AREAS, TIPOS_ACAO, FASES_POR_RITO, DOCS_POR_KIT, PECAS, FERIADOS, emRecessoForense,
};

})();
