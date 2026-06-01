-- ═══════════════════════════════════════════════════════════════════════════
-- M&SM Advocacia — Melhorias v2
-- ───────────────────────────────────────────────────────────────────────────
-- Cadastro central de clientes, recursos (adm/judicial), guias múltiplas do
-- salário-maternidade, fluxo deferimento/indeferimento, novos campos para
-- aux-doença / BPC e separação dos prazos no dashboard.
-- Rode este arquivo no SQL Editor do Supabase depois dos arquivos 01 e 02.
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. CADASTRO CENTRAL DE CLIENTES
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clientes (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  nome            TEXT         NOT NULL,
  cpf             TEXT         UNIQUE,
  rg              TEXT,
  telefone        TEXT,
  email           TEXT,
  endereco        TEXT,
  data_nascimento DATE,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ  DEFAULT now(),
  updated_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_nome ON public.clientes (lower(nome));
CREATE INDEX IF NOT EXISTS idx_clientes_cpf  ON public.clientes (cpf);

DROP TRIGGER IF EXISTS set_updated_at_clientes ON public.clientes;
CREATE TRIGGER set_updated_at_clientes
  BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_clientes" ON public.clientes;
CREATE POLICY "auth_all_clientes" ON public.clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PROCESSOS ADMINISTRATIVOS — fluxo aguardando / deferido / indeferido
--    + cliente_id, prazo automático por tipo de benefício, parcelas (aux-doença)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.processos_administrativos
  ADD COLUMN IF NOT EXISTS cliente_id              UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prazo_analise_inss      DATE,      -- protocolo + N dias
  ADD COLUMN IF NOT EXISTS dias_prazo_analise      INT,       -- 30/45/60/90
  ADD COLUMN IF NOT EXISTS resultado_pedido        TEXT,      -- 'Aguardando' | 'Deferido' | 'Indeferido'
  ADD COLUMN IF NOT EXISTS data_decisao            DATE,      -- data deferimento/indeferimento
  ADD COLUMN IF NOT EXISTS data_prev_pagamento     DATE,      -- se deferido
  ADD COLUMN IF NOT EXISTS prazo_recurso           DATE,      -- se indeferido: data_decisao + 30 dias
  ADD COLUMN IF NOT EXISTS qtd_parcelas_deferidas  INT,       -- 1..12 ou NULL = indeterminado
  ADD COLUMN IF NOT EXISTS valor_mensal_beneficio  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS tempo_indeterminado     BOOLEAN DEFAULT FALSE;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. PROCESSOS JUDICIAIS INSS — vínculo cliente, valor, parte contrária, parcelas
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.processos_judiciais_inss
  ADD COLUMN IF NOT EXISTS cliente_id              UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parte_contraria         TEXT,
  ADD COLUMN IF NOT EXISTS valor_acao              NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS qtd_parcelas_deferidas  INT,
  ADD COLUMN IF NOT EXISTS tempo_indeterminado     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS valor_mensal_beneficio  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS data_protocolo          DATE,
  ADD COLUMN IF NOT EXISTS data_decisao            DATE,
  ADD COLUMN IF NOT EXISTS resultado_pedido        TEXT;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. SALÁRIO-MATERNIDADE — data protocolo, fluxo decisão, vínculo cliente
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.salario_maternidade
  ADD COLUMN IF NOT EXISTS cliente_id              UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_protocolo          DATE,
  ADD COLUMN IF NOT EXISTS prazo_analise_inss      DATE,      -- protocolo + 30 dias
  ADD COLUMN IF NOT EXISTS resultado_pedido        TEXT,      -- 'Aguardando' | 'Deferido' | 'Indeferido'
  ADD COLUMN IF NOT EXISTS data_decisao            DATE,
  ADD COLUMN IF NOT EXISTS data_prev_pagamento     DATE,
  ADD COLUMN IF NOT EXISTS prazo_recurso           DATE;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. GUIAS INSS DO SALÁRIO-MATERNIDADE (até 3 guias por processo)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guias_sal_mat (
  id                 UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  sal_mat_id         UUID         NOT NULL REFERENCES public.salario_maternidade(id) ON DELETE CASCADE,
  ordem              INT          NOT NULL CHECK (ordem BETWEEN 1 AND 3),
  numero_guia        TEXT,
  competencia        TEXT,        -- MM/AAAA
  data_vencimento    DATE,
  valor_guia         NUMERIC(14,2),
  status_guia        TEXT         DEFAULT 'Pendente',  -- Pendente | Pago | Atrasado
  data_pagamento     DATE,
  observacao         TEXT,
  created_at         TIMESTAMPTZ  DEFAULT now(),
  updated_at         TIMESTAMPTZ  DEFAULT now(),
  CONSTRAINT guia_unica_por_ordem UNIQUE (sal_mat_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_guias_salmat ON public.guias_sal_mat (sal_mat_id, ordem);
CREATE INDEX IF NOT EXISTS idx_guias_venc   ON public.guias_sal_mat (data_vencimento);

DROP TRIGGER IF EXISTS set_updated_at_guias ON public.guias_sal_mat;
CREATE TRIGGER set_updated_at_guias
  BEFORE UPDATE ON public.guias_sal_mat
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.guias_sal_mat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_guias" ON public.guias_sal_mat;
CREATE POLICY "auth_all_guias" ON public.guias_sal_mat
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. RECURSOS — vinculados ao requerimento original (administrativo OU judicial)
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recursos (
  id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,

  -- vínculo origem (opcional — recurso "manual" pode existir sem origem)
  origem_tipo           TEXT,        -- 'adm' | 'sal' | 'jud' | 'aux_doenca' | 'bpc' | 'manual'
  origem_id             UUID,        -- id do registro origem (nulo se manual)
  cliente_id            UUID REFERENCES public.clientes(id) ON DELETE SET NULL,

  -- identificação
  numero_requerimento   TEXT,        -- nº do protocolo original (para busca)
  nome_cliente          TEXT,
  cpf                   TEXT,
  tipo_beneficio        TEXT,

  -- natureza do recurso
  modalidade            TEXT,        -- 'Recurso Administrativo' | 'Processo Judicial'
  numero_processo       TEXT,        -- nº do recurso adm OU nº do processo judicial
  vara_tribunal         TEXT,        -- se judicial
  parte_contraria       TEXT,        -- se judicial
  valor_acao            NUMERIC(14,2),

  -- prazos / datas
  data_protocolo        DATE,
  prazo_resposta        DATE,        -- protocolo + N dias (CRPS = 30 corridos no adm)
  data_decisao          DATE,
  resultado             TEXT,        -- 'Aguardando' | 'Provido' | 'Improvido' | 'Procedente' | 'Improcedente'

  fase_atual            TEXT,
  proximo_prazo         DATE,
  tipo_prazo            TEXT,
  status                TEXT         DEFAULT 'Em andamento',
  observacoes           TEXT,
  created_at            TIMESTAMPTZ  DEFAULT now(),
  updated_at            TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recursos_origem  ON public.recursos (origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_recursos_req     ON public.recursos (numero_requerimento);
CREATE INDEX IF NOT EXISTS idx_recursos_cliente ON public.recursos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_recursos_prazo   ON public.recursos (proximo_prazo);

DROP TRIGGER IF EXISTS set_updated_at_recursos ON public.recursos;
CREATE TRIGGER set_updated_at_recursos
  BEFORE UPDATE ON public.recursos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.recursos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_recursos" ON public.recursos;
CREATE POLICY "auth_all_recursos" ON public.recursos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. AUXÍLIO-DOENÇA (Auxílio por Incapacidade Temporária) — tabela dedicada
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auxilio_doenca (
  id                       UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id               UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  numero_processo          TEXT,
  nome_cliente             TEXT         NOT NULL,
  cpf                      TEXT,
  natureza                 TEXT         DEFAULT 'administrativo',  -- 'administrativo' | 'judicial'

  -- requerimento
  data_protocolo           DATE,
  prazo_analise_inss       DATE,        -- protocolo + 45 dias
  resultado_pedido         TEXT,        -- 'Aguardando' | 'Deferido' | 'Indeferido'
  data_decisao             DATE,
  data_prev_pagamento      DATE,
  prazo_recurso            DATE,

  -- benefício
  valor_mensal_beneficio   NUMERIC(14,2),
  qtd_parcelas_deferidas   INT,         -- 1..12
  tempo_indeterminado      BOOLEAN      DEFAULT FALSE,
  data_inicio_beneficio    DATE,
  data_fim_beneficio       DATE,

  -- judicial (quando natureza='judicial')
  vara_tribunal            TEXT,
  parte_contraria          TEXT,
  valor_acao               NUMERIC(14,2),
  fase_atual               TEXT,

  -- prazo de peça
  data_intimacao           DATE,
  peca_codigo              TEXT,
  proximo_prazo            DATE,
  tipo_prazo               TEXT,

  status                   TEXT         DEFAULT 'Em andamento',
  observacoes              TEXT,
  created_at               TIMESTAMPTZ  DEFAULT now(),
  updated_at               TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auxdoenca_prazo   ON public.auxilio_doenca (proximo_prazo);
CREATE INDEX IF NOT EXISTS idx_auxdoenca_cliente ON public.auxilio_doenca (cliente_id);

DROP TRIGGER IF EXISTS set_updated_at_auxdoenca ON public.auxilio_doenca;
CREATE TRIGGER set_updated_at_auxdoenca
  BEFORE UPDATE ON public.auxilio_doenca
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.auxilio_doenca ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_auxdoenca" ON public.auxilio_doenca;
CREATE POLICY "auth_all_auxdoenca" ON public.auxilio_doenca
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 8. BPC / LOAS — tabela dedicada
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bpc_loas (
  id                       UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id               UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  numero_processo          TEXT,
  nome_cliente             TEXT         NOT NULL,
  cpf                      TEXT,
  natureza                 TEXT         DEFAULT 'administrativo',
  modalidade               TEXT,        -- 'Idoso' | 'Deficiente'

  -- requerimento
  data_protocolo           DATE,
  prazo_analise_inss       DATE,        -- protocolo + 90 dias
  resultado_pedido         TEXT,
  data_decisao             DATE,
  data_prev_pagamento      DATE,
  prazo_recurso            DATE,

  -- benefício
  valor_mensal_beneficio   NUMERIC(14,2),
  meses_atrasados          INT,

  -- judicial
  vara_tribunal            TEXT,
  parte_contraria          TEXT,
  valor_acao               NUMERIC(14,2),
  fase_atual               TEXT,

  -- prazo de peça
  data_intimacao           DATE,
  peca_codigo              TEXT,
  proximo_prazo            DATE,
  tipo_prazo               TEXT,

  status                   TEXT         DEFAULT 'Em andamento',
  observacoes              TEXT,
  created_at               TIMESTAMPTZ  DEFAULT now(),
  updated_at               TIMESTAMPTZ  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bpc_prazo   ON public.bpc_loas (proximo_prazo);
CREATE INDEX IF NOT EXISTS idx_bpc_cliente ON public.bpc_loas (cliente_id);

DROP TRIGGER IF EXISTS set_updated_at_bpc ON public.bpc_loas;
CREATE TRIGGER set_updated_at_bpc
  BEFORE UPDATE ON public.bpc_loas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.bpc_loas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_bpc" ON public.bpc_loas;
CREATE POLICY "auth_all_bpc" ON public.bpc_loas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. ACOES_GENERICAS — vínculo cliente_id + parte_contraria já existe
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.acoes_genericas
  ADD COLUMN IF NOT EXISTS cliente_id              UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 10. AUXÍLIO-MORADIA — vínculo cliente_id
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.auxilio_moradia
  ADD COLUMN IF NOT EXISTS cliente_id              UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 11. CONTROLE_COBRANCAS — vínculo ao registro de origem (auto-criação)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.controle_cobrancas
  ADD COLUMN IF NOT EXISTS cliente_id              UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_tipo             TEXT,
  ADD COLUMN IF NOT EXISTS origem_id               UUID,
  ADD COLUMN IF NOT EXISTS forma_pagamento         TEXT,    -- '30% por parcela' | '1ª parcela integral' | 'À vista' | 'Personalizado'
  ADD COLUMN IF NOT EXISTS categoria               TEXT;    -- 'honorário' | 'guia_inss'

CREATE INDEX IF NOT EXISTS idx_cobr_origem  ON public.controle_cobrancas (origem_tipo, origem_id);
CREATE INDEX IF NOT EXISTS idx_cobr_cliente ON public.controle_cobrancas (cliente_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 12. PRAZOS JUDICIAIS — escopo expandido (qualquer área)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.prazos_judiciais_auxilio
  ADD COLUMN IF NOT EXISTS cliente_id              UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS escopo                  TEXT,    -- 'AUX_MORADIA' | 'INSS' | 'CIVEL' | 'FAMILIA' | 'CONSUMIDOR' | 'SAUDE'
  ADD COLUMN IF NOT EXISTS origem_tipo             TEXT,
  ADD COLUMN IF NOT EXISTS origem_id               UUID;

CREATE INDEX IF NOT EXISTS idx_prazos_escopo ON public.prazos_judiciais_auxilio (escopo);
CREATE INDEX IF NOT EXISTS idx_prazos_origem ON public.prazos_judiciais_auxilio (origem_tipo, origem_id);

-- Registros antigos (sem escopo) correspondem à área Auxílio-Moradia
UPDATE public.prazos_judiciais_auxilio
   SET escopo = 'AUX_MORADIA'
 WHERE escopo IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIM — Tabelas novas: clientes, guias_sal_mat, recursos, auxilio_doenca, bpc_loas.
-- Colunas adicionadas em: processos_administrativos, processos_judiciais_inss,
--   salario_maternidade, acoes_genericas, auxilio_moradia, controle_cobrancas,
--   prazos_judiciais_auxilio.
-- ═══════════════════════════════════════════════════════════════════════════
