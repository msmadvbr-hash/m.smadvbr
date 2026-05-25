-- ═══════════════════════════════════════════════════════════════════════════
-- M&SM Advocacia — Expansão do Schema Supabase
-- ───────────────────────────────────────────────────────────────────────────
-- Rode TODO este arquivo no SQL Editor do Supabase Dashboard.
-- É idempotente (usa IF NOT EXISTS / OR REPLACE) — pode rodar várias vezes.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. NOVOS CAMPOS EM AUXÍLIO-MORADIA
--    (área, tipo de ação codificado, cálculos automáticos, prazo da peça)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.auxilio_moradia
  ADD COLUMN IF NOT EXISTS area                  TEXT,
  ADD COLUMN IF NOT EXISTS tipo_acao_codigo      TEXT,
  ADD COLUMN IF NOT EXISTS data_intimacao        DATE,
  ADD COLUMN IF NOT EXISTS peca_codigo           TEXT,
  ADD COLUMN IF NOT EXISTS fazenda_publica       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS competencias          JSONB,
  ADD COLUMN IF NOT EXISTS total_bolsa           NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS valor_acao_calculado  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS honorarios_calculado  NUMERIC(14,2);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. NOVOS CAMPOS EM PRAZOS_JUDICIAIS_AUXILIO
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prazos_judiciais_auxilio
  ADD COLUMN IF NOT EXISTS area              TEXT,
  ADD COLUMN IF NOT EXISTS tipo_acao_codigo  TEXT,
  ADD COLUMN IF NOT EXISTS data_intimacao    DATE,
  ADD COLUMN IF NOT EXISTS peca_codigo       TEXT,
  ADD COLUMN IF NOT EXISTS fazenda_publica   BOOLEAN DEFAULT FALSE;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. TABELA UNIVERSAL DE DOCUMENTOS POR PROCESSO
--    Funciona para todos os módulos via (processo_tipo, processo_id).
--    Status: 'OK' | 'FALTANTE' | 'NA'
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.documentos_processo (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_tipo   TEXT         NOT NULL,  -- 'adm','jud','sal','aux','praz','cob'
  processo_id     TEXT         NOT NULL,  -- aceita 'novo' antes do salvamento
  nome            TEXT         NOT NULL,
  status          TEXT,                   -- OK | FALTANTE | NA | NULL
  observacao      TEXT,
  uploaded_at     TIMESTAMPTZ,
  storage_path    TEXT,                   -- futuro: caminho no Supabase Storage
  created_at      TIMESTAMPTZ  DEFAULT now(),
  updated_at      TIMESTAMPTZ  DEFAULT now(),
  CONSTRAINT documentos_unicidade UNIQUE (processo_tipo, processo_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_docs_proc
  ON public.documentos_processo (processo_tipo, processo_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. TIMELINE / ANDAMENTOS DO PROCESSO
--    Cada movimento processual: fase, peça, prazo calculado.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.andamentos_processo (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_tipo   TEXT         NOT NULL,
  processo_id     TEXT         NOT NULL,
  data_movimento  DATE         DEFAULT CURRENT_DATE,
  fase            TEXT,
  peca_codigo     TEXT,
  data_intimacao  DATE,
  prazo_calculado DATE,
  dias_aplicados  INT,
  contagem        TEXT,        -- 'uteis' | 'corridos'
  aplicou_dobro   BOOLEAN,
  fazenda_publica BOOLEAN,
  observacao      TEXT,
  created_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_andam_proc
  ON public.andamentos_processo (processo_tipo, processo_id, data_movimento DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. TRIGGER DE updated_at NOS DOCUMENTOS
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.documentos_processo;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.documentos_processo
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY (RLS)
--    Estratégia: usuário autenticado tem acesso total.
--    Ajuste se quiser restringir por user_id.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.documentos_processo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.andamentos_processo  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_docs" ON public.documentos_processo;
CREATE POLICY "auth_all_docs" ON public.documentos_processo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_andam" ON public.andamentos_processo;
CREATE POLICY "auth_all_andam" ON public.andamentos_processo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM — verifique se as duas novas tabelas aparecem em
-- Table Editor: documentos_processo, andamentos_processo
-- ═══════════════════════════════════════════════════════════════════════════
