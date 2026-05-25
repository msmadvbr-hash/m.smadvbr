-- ============================================================
-- SETUP SUPABASE — SISTEMA DE GESTÃO VSM ADVOCACIA
-- Execute este script no SQL Editor do Supabase
-- Supabase Dashboard → SQL Editor → New Query → Cole e Execute
-- ============================================================

-- ── EXTENSÃO ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABELA 1: PROCESSOS ADMINISTRATIVOS INSS ──────────────
CREATE TABLE IF NOT EXISTS processos_administrativos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_processo TEXT,
  nome_cliente    TEXT NOT NULL,
  cpf             TEXT,
  tipo_beneficio  TEXT,
  data_protocolo  DATE,
  fase_atual      TEXT,
  proximo_prazo   DATE,
  tipo_prazo      TEXT,
  prazo_boleto    DATE,
  numero_proc_judicial TEXT,
  status          TEXT DEFAULT 'Em andamento',
  observacoes     TEXT,
  docs_recebidos  INT DEFAULT 0,
  docs_pendentes  INT DEFAULT 0,
  documentos_confirmados TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABELA 2: PROCESSOS JUDICIAIS INSS ────────────────────
CREATE TABLE IF NOT EXISTS processos_judiciais_inss (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_processo       TEXT,
  numero_proc_adm       TEXT,
  nome_cliente          TEXT NOT NULL,
  cpf                   TEXT,
  tipo_beneficio        TEXT,
  vara_tribunal         TEXT,
  juiz                  TEXT,
  fase_atual            TEXT,
  data_proxima_audiencia DATE,
  tipo_prazo            TEXT,
  prazo_boleto          DATE,
  status                TEXT DEFAULT 'Em andamento',
  observacoes           TEXT,
  docs_recebidos        INT DEFAULT 0,
  docs_pendentes        INT DEFAULT 0,
  documentos_confirmados TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABELA 3: AUXÍLIO-MORADIA (MÉDICOS) ───────────────────
CREATE TABLE IF NOT EXISTS auxilio_moradia (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_medico     TEXT NOT NULL,
  crm             TEXT,
  cpf             TEXT,
  telefone        TEXT,
  email           TEXT,
  rqe             TEXT,
  hospital        TEXT,
  numero_processo TEXT,
  tipo_acao       TEXT,
  fase_processo   TEXT,
  proximo_prazo   DATE,
  tipo_prazo      TEXT,
  status          TEXT DEFAULT 'Em andamento',
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABELA 4: SALÁRIO-MATERNIDADE ─────────────────────────
CREATE TABLE IF NOT EXISTS salario_maternidade (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_processo           TEXT,
  nome_cliente              TEXT NOT NULL,
  cpf                       TEXT,
  dpp                       DATE,
  tipo_salario_mat          TEXT,
  valor_mensal_beneficio    NUMERIC(12,2),
  numero_guia               TEXT,
  competencia_guia          TEXT,
  data_limite_pagamento     DATE,
  status_guia               TEXT DEFAULT 'Pendente',
  data_pgto_guia            DATE,
  honorario_total           NUMERIC(12,2),
  numero_parcela            INT,
  valor_parcela             NUMERIC(12,2),
  data_cobranca             DATE,
  data_limite_pgto_honorario DATE,
  data_recebimento          DATE,
  valor_recebido            NUMERIC(12,2),
  status_honorario          TEXT DEFAULT 'Pendente',
  observacoes               TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABELA 5: CONTROLE DE COBRANÇAS / HONORÁRIOS ──────────
CREATE TABLE IF NOT EXISTS controle_cobrancas (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_processo       TEXT,
  nome_cliente          TEXT NOT NULL,
  cpf                   TEXT,
  tipo_beneficio        TEXT,
  valor_mensal_beneficio NUMERIC(12,2),
  qtd_parcelas          INT,
  honorarios_totais     NUMERIC(12,2),
  numero_parcela        INT,
  valor_parcela         NUMERIC(12,2),
  data_cobranca         DATE,
  data_limite_pgto      DATE,
  data_recebimento      DATE,
  valor_recebido        NUMERIC(12,2),
  saldo_parcela         NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(valor_parcela, 0) - COALESCE(valor_recebido, 0)
  ) STORED,
  status                TEXT DEFAULT 'Pendente',
  observacoes           TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── TABELA 6: PRAZOS JUDICIAIS AUXÍLIO-MORADIA ────────────
CREATE TABLE IF NOT EXISTS prazos_judiciais_auxilio (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  numero_processo TEXT,
  cliente_medico  TEXT NOT NULL,
  cpf             TEXT,
  tipo_acao       TEXT,
  vara_tribunal   TEXT,
  juiz            TEXT,
  fase_atual      TEXT,
  proximo_prazo   DATE,
  tipo_prazo      TEXT,
  peca_sugerida   TEXT,
  prioridade      TEXT,
  status          TEXT DEFAULT 'Em andamento',
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── FUNÇÃO: atualizar updated_at automaticamente ──────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger em cada tabela
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'processos_administrativos',
    'processos_judiciais_inss',
    'auxilio_moradia',
    'salario_maternidade',
    'controle_cobrancas',
    'prazos_judiciais_auxilio'
  ] LOOP
    EXECUTE format('
      CREATE TRIGGER trg_updated_at_%s
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', t, t);
  END LOOP;
END $$;

-- ── ROW LEVEL SECURITY (RLS) ──────────────────────────────
ALTER TABLE processos_administrativos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE processos_judiciais_inss      ENABLE ROW LEVEL SECURITY;
ALTER TABLE auxilio_moradia               ENABLE ROW LEVEL SECURITY;
ALTER TABLE salario_maternidade           ENABLE ROW LEVEL SECURITY;
ALTER TABLE controle_cobrancas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE prazos_judiciais_auxilio      ENABLE ROW LEVEL SECURITY;

-- Políticas: usuário autenticado acessa todos os dados
-- (ideal para uso individual como advogada)
CREATE POLICY "Acesso autenticado" ON processos_administrativos
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Acesso autenticado" ON processos_judiciais_inss
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Acesso autenticado" ON auxilio_moradia
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Acesso autenticado" ON salario_maternidade
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Acesso autenticado" ON controle_cobrancas
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Acesso autenticado" ON prazos_judiciais_auxilio
  FOR ALL USING (auth.role() = 'authenticated');

-- ── ÍNDICES para performance ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_proc_adm_cpf    ON processos_administrativos(cpf);
CREATE INDEX IF NOT EXISTS idx_proc_adm_prazo  ON processos_administrativos(proximo_prazo);
CREATE INDEX IF NOT EXISTS idx_proc_jud_cpf    ON processos_judiciais_inss(cpf);
CREATE INDEX IF NOT EXISTS idx_proc_jud_prazo  ON processos_judiciais_inss(data_proxima_audiencia);
CREATE INDEX IF NOT EXISTS idx_aux_mor_cpf     ON auxilio_moradia(cpf);
CREATE INDEX IF NOT EXISTS idx_aux_mor_prazo   ON auxilio_moradia(proximo_prazo);
CREATE INDEX IF NOT EXISTS idx_sal_mat_cpf     ON salario_maternidade(cpf);
CREATE INDEX IF NOT EXISTS idx_sal_mat_pgto    ON salario_maternidade(data_limite_pagamento);
CREATE INDEX IF NOT EXISTS idx_cobr_cpf        ON controle_cobrancas(cpf);
CREATE INDEX IF NOT EXISTS idx_cobr_pgto       ON controle_cobrancas(data_limite_pgto);
CREATE INDEX IF NOT EXISTS idx_praz_aux_prazo  ON prazos_judiciais_auxilio(proximo_prazo);

-- ============================================================
-- FIM DO SCRIPT
-- Após executar, vá em Authentication → Users → Add User
-- e crie seu usuário com email e senha.
-- ============================================================
