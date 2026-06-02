-- ═══════════════════════════════════════════════════════════════════════════
-- M&SM Advocacia — Tabela de Compromissos da Agenda (Fase 2)
-- ───────────────────────────────────────────────────────────────────────────
-- Rode este arquivo no SQL Editor do Supabase Dashboard.
-- É idempotente (usa IF NOT EXISTS / OR REPLACE).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agenda_compromissos (
  id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo          TEXT         NOT NULL,
  descricao       TEXT,
  data_hora       TIMESTAMPTZ  NOT NULL,
  cliente_id      UUID         REFERENCES public.clientes(id) ON DELETE SET NULL,
  nome_cliente    TEXT,
  created_at      TIMESTAMPTZ  DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agenda_compromissos_data
  ON public.agenda_compromissos (data_hora);

-- Habilitar RLS
ALTER TABLE public.agenda_compromissos ENABLE ROW LEVEL SECURITY;

-- Política de acesso completo para usuários autenticados
DROP POLICY IF EXISTS "auth_all_comp" ON public.agenda_compromissos;
CREATE POLICY "auth_all_comp" ON public.agenda_compromissos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
