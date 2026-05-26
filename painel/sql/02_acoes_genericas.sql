-- ═══════════════════════════════════════════════════════════════════════════
-- M&SM Advocacia — Tabela universal de ações (Cível, Família, Consumidor, Saúde)
-- ───────────────────────────────────────────────────────────────────────────
-- Rode este SQL no Supabase SQL Editor depois do 01_schema_expansao.sql.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.acoes_genericas (
  id                         UUID         DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Discriminador de área (CIVEL | FAMILIA | CONSUMIDOR | SAUDE)
  area                       TEXT         NOT NULL,

  -- Dados do cliente
  nome_cliente               TEXT         NOT NULL,
  cpf                        TEXT,
  telefone                   TEXT,
  email                      TEXT,
  endereco_cliente           TEXT,

  -- Parte contrária
  parte_contraria            TEXT,
  parte_contraria_doc        TEXT,
  parte_contraria_endereco   TEXT,

  -- Processo
  numero_processo            TEXT,
  tipo_acao_codigo           TEXT,   -- código do catálogo (ex: COBRANCA)
  tipo_acao                  TEXT,   -- nome legível
  fase_atual                 TEXT,
  data_distribuicao          DATE,
  data_citacao               DATE,

  -- Vara / Comarca
  comarca                    TEXT,
  vara_tribunal              TEXT,
  juiz                       TEXT,
  fazenda_publica            BOOLEAN  DEFAULT FALSE,

  -- Honorários
  valor_causa                NUMERIC(14,2),
  pct_honorarios             NUMERIC(6,2),
  honorarios_contratuais     NUMERIC(14,2),
  honorarios_sucumbenciais   NUMERIC(14,2),

  -- Prazo
  data_intimacao             DATE,
  peca_codigo                TEXT,
  proximo_prazo              DATE,
  tipo_prazo                 TEXT,

  -- Status e observações
  status                     TEXT,
  observacoes                TEXT,

  -- Auditoria
  created_at                 TIMESTAMPTZ  DEFAULT now(),
  updated_at                 TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acoes_gen_area
  ON public.acoes_genericas (area, proximo_prazo);

CREATE INDEX IF NOT EXISTS idx_acoes_gen_cliente
  ON public.acoes_genericas (nome_cliente);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS set_updated_at_gen ON public.acoes_genericas;
CREATE TRIGGER set_updated_at_gen
  BEFORE UPDATE ON public.acoes_genericas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- RLS
ALTER TABLE public.acoes_genericas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_gen" ON public.acoes_genericas;
CREATE POLICY "auth_all_gen" ON public.acoes_genericas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- Acrescenta campos novos no salário-maternidade para suportar prorrogação
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.salario_maternidade
  ADD COLUMN IF NOT EXISTS tipo_salario_mat_codigo  TEXT,
  ADD COLUMN IF NOT EXISTS qtd_parcelas_efetivas    INT,
  ADD COLUMN IF NOT EXISTS prorrog_periodo          TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM — verifique se a tabela acoes_genericas aparece em Table Editor.
-- ═══════════════════════════════════════════════════════════════════════════
