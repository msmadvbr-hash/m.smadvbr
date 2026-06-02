-- ═══════════════════════════════════════════════════════════════════════════
-- M&SM Advocacia — Melhorias v3
-- ───────────────────────────────────────────────────────────────────────────
-- - Nº do Benefício (NB) em todos os módulos do INSS
-- - Renomeação conceitual de "Nº Processo" para "Nº Protocolo Requerimento"
--   (não muda o nome da coluna no banco — só o rótulo no UI; mantém compat.)
-- - Motivo de indeferimento para auto-fill do processo judicial
-- - Vínculo de processo judicial dentro de cada módulo adm
-- - Pagamento e controle das 4 parcelas do salário-maternidade
-- - Sócios para divisão de honorários (Vandressa / Thaynar 50/50)
-- Rode no SQL Editor depois dos arquivos 01, 02 e 03. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. CAMPOS COMUNS INSS — NB + motivo indeferimento + processo judicial
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.processos_administrativos
  ADD COLUMN IF NOT EXISTS numero_beneficio          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_indeferimento      TEXT,
  ADD COLUMN IF NOT EXISTS processo_judicial_numero  TEXT;

ALTER TABLE public.salario_maternidade
  ADD COLUMN IF NOT EXISTS numero_beneficio          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_indeferimento      TEXT,
  ADD COLUMN IF NOT EXISTS processo_judicial_numero  TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio_pagamento     DATE,
  ADD COLUMN IF NOT EXISTS forma_pagamento_honor     TEXT,   -- '30% sobre cada parcela' | '1ª parcela integral'
  -- Status das 4 parcelas do benefício (a cliente recebe; controle separado da cobrança)
  ADD COLUMN IF NOT EXISTS parc1_data                DATE,
  ADD COLUMN IF NOT EXISTS parc1_status              TEXT DEFAULT 'A receber',
  ADD COLUMN IF NOT EXISTS parc2_data                DATE,
  ADD COLUMN IF NOT EXISTS parc2_status              TEXT DEFAULT 'A receber',
  ADD COLUMN IF NOT EXISTS parc3_data                DATE,
  ADD COLUMN IF NOT EXISTS parc3_status              TEXT DEFAULT 'A receber',
  ADD COLUMN IF NOT EXISTS parc4_data                DATE,
  ADD COLUMN IF NOT EXISTS parc4_status              TEXT DEFAULT 'A receber';

ALTER TABLE public.auxilio_doenca
  ADD COLUMN IF NOT EXISTS numero_beneficio          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_indeferimento      TEXT,
  ADD COLUMN IF NOT EXISTS processo_judicial_numero  TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento_honor     TEXT;

ALTER TABLE public.bpc_loas
  ADD COLUMN IF NOT EXISTS numero_beneficio          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_indeferimento      TEXT,
  ADD COLUMN IF NOT EXISTS processo_judicial_numero  TEXT,
  ADD COLUMN IF NOT EXISTS forma_pagamento_honor     TEXT;

ALTER TABLE public.processos_judiciais_inss
  ADD COLUMN IF NOT EXISTS numero_beneficio          TEXT,
  ADD COLUMN IF NOT EXISTS motivo_indeferimento_adm  TEXT;

CREATE INDEX IF NOT EXISTS idx_pa_judnumero  ON public.processos_administrativos (processo_judicial_numero);
CREATE INDEX IF NOT EXISTS idx_sm_judnumero  ON public.salario_maternidade (processo_judicial_numero);
CREATE INDEX IF NOT EXISTS idx_axd_judnumero ON public.auxilio_doenca (processo_judicial_numero);
CREATE INDEX IF NOT EXISTS idx_bpc_judnumero ON public.bpc_loas (processo_judicial_numero);
CREATE INDEX IF NOT EXISTS idx_pa_protocolo  ON public.processos_administrativos (numero_processo);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SÓCIOS — divisão de honorários
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.socios (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  nome        TEXT         NOT NULL,
  percentual  NUMERIC(5,2) NOT NULL DEFAULT 50,   -- soma dos sócios deve dar 100
  ativo       BOOLEAN      DEFAULT TRUE,
  created_at  TIMESTAMPTZ  DEFAULT now()
);

-- Sócias padrão (idempotente: só insere se não houver)
INSERT INTO public.socios (nome, percentual)
SELECT 'Vandressa', 50 WHERE NOT EXISTS (SELECT 1 FROM public.socios WHERE nome = 'Vandressa');
INSERT INTO public.socios (nome, percentual)
SELECT 'Thaynar',   50 WHERE NOT EXISTS (SELECT 1 FROM public.socios WHERE nome = 'Thaynar');

ALTER TABLE public.socios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_socios" ON public.socios;
CREATE POLICY "auth_all_socios" ON public.socios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. COBRANÇAS — múltiplas parcelas vinculadas (cada parcela = uma linha)
--    Já existem campos numero_parcela, valor_parcela, data_cobranca, etc.
--    Adicionamos qtd_parcelas_total e parcela_de para vincular grupos.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.controle_cobrancas
  ADD COLUMN IF NOT EXISTS qtd_parcelas_total  INT,
  ADD COLUMN IF NOT EXISTS grupo_cobranca_id   UUID,    -- todas as parcelas do mesmo grupo
  ADD COLUMN IF NOT EXISTS mes_referencia      TEXT;    -- AAAA-MM para faturamento

CREATE INDEX IF NOT EXISTS idx_cobr_mes_ref ON public.controle_cobrancas (mes_referencia);
CREATE INDEX IF NOT EXISTS idx_cobr_grupo   ON public.controle_cobrancas (grupo_cobranca_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. GUIAS SAL-MAT — incluir status "A Gerar"
--    (sem CHECK constraint; é só TEXT — adicionamos no UI)
-- ───────────────────────────────────────────────────────────────────────────
-- nada a fazer no SQL; o UI passa a oferecer 'A Gerar' | 'Pendente' | 'Pago' | 'Atrasado'

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM
-- ═══════════════════════════════════════════════════════════════════════════
