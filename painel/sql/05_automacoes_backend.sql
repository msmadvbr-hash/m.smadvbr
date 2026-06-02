-- ═══════════════════════════════════════════════════════════════════════════
-- M&SM Advocacia — Automações e Gatilhos Backend (Fase 2)
-- ───────────────────────────────────────────────────────────────────────────
-- Executa cálculos de prazos e geração de cobranças no Supabase.
-- Rode este arquivo no SQL Editor do Supabase Dashboard.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. FUNÇÃO AUXILIAR: DIAS DE ANÁLISE INSS
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_dias_analise_inss(tipo_beneficio TEXT)
RETURNS INT AS $$
DECLARE
  tipo_lower TEXT;
BEGIN
  IF tipo_beneficio IS NULL THEN
    RETURN 45;
  END IF;
  tipo_lower := lower(tipo_beneficio);
  IF tipo_lower LIKE '%salário-maternidade%' OR tipo_lower LIKE '%salario-maternidade%' OR tipo_lower LIKE '%maternidade%' THEN
    RETURN 30;
  ELSIF tipo_lower LIKE '%incapacidade temporária%' OR tipo_lower LIKE '%incapacidade temporaria%' OR tipo_lower LIKE '%auxílio-doença%' OR tipo_lower LIKE '%auxilio-doenca%' OR tipo_lower LIKE '%auxilio doença%' OR tipo_lower LIKE '%invalidez%' OR tipo_lower LIKE '%permanente%' THEN
    RETURN 45;
  ELSIF tipo_lower LIKE '%pensão por morte%' OR tipo_lower LIKE '%pensao por morte%' OR tipo_lower LIKE '%reclusão%' OR tipo_lower LIKE '%reclusao%' OR tipo_lower LIKE '%acidente%' THEN
    RETURN 60;
  ELSIF tipo_lower LIKE '%idade%' OR tipo_lower LIKE '%tempo de contribuição%' OR tipo_lower LIKE '%tempo de contribuicao%' OR tipo_lower LIKE '%especial%' OR tipo_lower LIKE '%bpc%' OR tipo_lower LIKE '%loas%' THEN
    RETURN 90;
  ELSE
    RETURN 45;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. FUNÇÃO E TRIGGER: CÁLCULO DE PRAZOS ADMINISTRATIVOS
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_calcular_prazos_inss()
RETURNS TRIGGER AS $$
DECLARE
  v_dias INT;
BEGIN
  -- Calcular prazo_analise_inss com base na data do protocolo
  IF NEW.data_protocolo IS NOT NULL THEN
    IF TG_TABLE_NAME = 'salario_maternidade' THEN
      v_dias := 30;
    ELSIF TG_TABLE_NAME = 'auxilio_doenca' THEN
      v_dias := 45;
    ELSIF TG_TABLE_NAME = 'bpc_loas' THEN
      v_dias := 90;
    ELSIF TG_TABLE_NAME = 'processos_administrativos' THEN
      IF NEW.dias_prazo_analise IS NOT NULL AND NEW.dias_prazo_analise > 0 THEN
        v_dias := NEW.dias_prazo_analise;
      ELSE
        v_dias := public.fn_dias_analise_inss(NEW.tipo_beneficio);
        NEW.dias_prazo_analise := v_dias;
      END IF;
    ELSE
      v_dias := 45;
    END IF;
    NEW.prazo_analise_inss := NEW.data_protocolo + v_dias;
  ELSE
    NEW.prazo_analise_inss := NULL;
  END IF;

  -- Calcular prazo_recurso: se indeferido: data_decisao + 30 dias
  IF (NEW.resultado_pedido = 'Indeferido' OR NEW.status = 'Indeferido') AND NEW.data_decisao IS NOT NULL THEN
    NEW.prazo_recurso := NEW.data_decisao + 30;
  ELSE
    NEW.prazo_recurso := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Associação dos Triggers de Prazo BEFORE INSERT OR UPDATE
DROP TRIGGER IF EXISTS tr_calcular_prazos_inss ON public.processos_administrativos;
CREATE TRIGGER tr_calcular_prazos_inss
  BEFORE INSERT OR UPDATE ON public.processos_administrativos
  FOR EACH ROW EXECUTE FUNCTION public.fn_calcular_prazos_inss();

DROP TRIGGER IF EXISTS tr_calcular_prazos_inss ON public.salario_maternidade;
CREATE TRIGGER tr_calcular_prazos_inss
  BEFORE INSERT OR UPDATE ON public.salario_maternidade
  FOR EACH ROW EXECUTE FUNCTION public.fn_calcular_prazos_inss();

DROP TRIGGER IF EXISTS tr_calcular_prazos_inss ON public.auxilio_doenca;
CREATE TRIGGER tr_calcular_prazos_inss
  BEFORE INSERT OR UPDATE ON public.auxilio_doenca
  FOR EACH ROW EXECUTE FUNCTION public.fn_calcular_prazos_inss();

DROP TRIGGER IF EXISTS tr_calcular_prazos_inss ON public.bpc_loas;
CREATE TRIGGER tr_calcular_prazos_inss
  BEFORE INSERT OR UPDATE ON public.bpc_loas
  FOR EACH ROW EXECUTE FUNCTION public.fn_calcular_prazos_inss();


-- ───────────────────────────────────────────────────────────────────────────
-- 3. FUNÇÃO E TRIGGER: GERADOR AUTOMÁTICO DE COBRANÇAS (DEFERIDO/PROCEDENTE)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_criar_cobranca()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_id UUID;
  v_nome_cliente TEXT;
  v_cpf TEXT;
  v_numero_processo TEXT;
  v_tipo_beneficio TEXT;
  v_valor_mensal NUMERIC(14,2);
  v_qtd_parcelas INT;
  v_tempo_indeterminado BOOLEAN;
  v_valor_acao NUMERIC(14,2);
  v_forma_pagamento TEXT;
  v_origem_tipo TEXT;
  v_origem_id UUID;
  v_status TEXT;
  v_resultado TEXT;
  v_honorarios NUMERIC(14,2) := 0;
  v_existe INT;
BEGIN
  v_origem_id := NEW.id;
  v_origem_tipo := TG_TABLE_NAME;

  -- 3.1 Mapeamento das colunas dependendo da tabela de origem
  IF TG_TABLE_NAME = 'processos_administrativos' THEN
    v_cliente_id := NEW.cliente_id;
    v_nome_cliente := NEW.nome_cliente;
    v_cpf := NEW.cpf;
    v_numero_processo := NEW.numero_processo;
    v_tipo_beneficio := NEW.tipo_beneficio;
    v_valor_mensal := NEW.valor_mensal_beneficio;
    v_qtd_parcelas := NEW.qtd_parcelas_deferidas;
    v_tempo_indeterminado := COALESCE(NEW.tempo_indeterminado, FALSE);
    v_valor_acao := 0;
    v_forma_pagamento := '30% por parcela';
    v_status := NEW.status;
    v_resultado := NEW.resultado_pedido;
  ELSIF TG_TABLE_NAME = 'salario_maternidade' THEN
    v_cliente_id := NEW.cliente_id;
    v_nome_cliente := NEW.nome_cliente;
    v_cpf := NEW.cpf;
    v_numero_processo := NEW.numero_processo;
    v_tipo_beneficio := 'Salário-Maternidade';
    v_valor_mensal := NEW.valor_mensal_beneficio;
    v_qtd_parcelas := NEW.qtd_parcelas_efetivas;
    v_tempo_indeterminado := FALSE;
    v_valor_acao := 0;
    v_forma_pagamento := COALESCE(NEW.forma_pagamento_honor, '30% sobre cada parcela');
    v_status := NEW.status;
    v_resultado := NEW.resultado_pedido;
  ELSIF TG_TABLE_NAME = 'auxilio_doenca' THEN
    v_cliente_id := NEW.cliente_id;
    v_nome_cliente := NEW.nome_cliente;
    v_cpf := NEW.cpf;
    v_numero_processo := NEW.numero_processo;
    v_tipo_beneficio := 'Auxílio-Doença';
    v_valor_mensal := NEW.valor_mensal_beneficio;
    v_qtd_parcelas := NEW.qtd_parcelas_deferidas;
    v_tempo_indeterminado := COALESCE(NEW.tempo_indeterminado, FALSE);
    v_valor_acao := NEW.valor_acao;
    v_forma_pagamento := COALESCE(NEW.forma_pagamento_honor, '30% por parcela');
    v_status := NEW.status;
    v_resultado := NEW.resultado_pedido;
  ELSIF TG_TABLE_NAME = 'bpc_loas' THEN
    v_cliente_id := NEW.cliente_id;
    v_nome_cliente := NEW.nome_cliente;
    v_cpf := NEW.cpf;
    v_numero_processo := NEW.numero_processo;
    v_tipo_beneficio := 'BPC/LOAS';
    v_valor_mensal := NEW.valor_mensal_beneficio;
    v_qtd_parcelas := NEW.meses_atrasados;
    v_tempo_indeterminado := FALSE;
    v_valor_acao := NEW.valor_acao;
    v_forma_pagamento := COALESCE(NEW.forma_pagamento_honor, '30% por parcela');
    v_status := NEW.status;
    v_resultado := NEW.resultado_pedido;
  ELSIF TG_TABLE_NAME = 'processos_judiciais_inss' THEN
    v_cliente_id := NEW.cliente_id;
    v_nome_cliente := NEW.nome_cliente;
    v_cpf := NEW.cpf;
    v_numero_processo := NEW.numero_processo;
    v_tipo_beneficio := NEW.tipo_beneficio;
    v_valor_mensal := NEW.valor_mensal_beneficio;
    v_qtd_parcelas := NEW.qtd_parcelas_deferidas;
    v_tempo_indeterminado := COALESCE(NEW.tempo_indeterminado, FALSE);
    v_valor_acao := NEW.valor_acao;
    v_forma_pagamento := '30% por parcela';
    v_status := NEW.status;
    v_resultado := NEW.resultado_pedido;
  ELSIF TG_TABLE_NAME = 'acoes_genericas' THEN
    v_cliente_id := NEW.cliente_id;
    v_nome_cliente := NEW.nome_cliente;
    v_cpf := NEW.cpf;
    v_numero_processo := NEW.numero_processo;
    v_tipo_beneficio := COALESCE(NEW.tipo_acao, NEW.area);
    v_valor_mensal := 0;
    v_qtd_parcelas := 1;
    v_tempo_indeterminado := FALSE;
    v_valor_acao := NEW.valor_causa;
    v_forma_pagamento := 'À vista';
    v_status := NEW.status;
    v_resultado := NEW.status;
  ELSIF TG_TABLE_NAME = 'auxilio_moradia' THEN
    v_cliente_id := NEW.cliente_id;
    v_nome_cliente := NEW.nome_medico;
    v_cpf := NEW.cpf;
    v_numero_processo := NEW.numero_processo;
    v_tipo_beneficio := COALESCE(NEW.tipo_acao, NEW.area);
    v_valor_mensal := 0;
    v_qtd_parcelas := 1;
    v_tempo_indeterminado := FALSE;
    v_valor_acao := NEW.valor_acao_calculado;
    v_forma_pagamento := 'À vista';
    v_status := NEW.status;
    v_resultado := NEW.status;
  ELSE
    RETURN NEW;
  END IF;

  -- 3.2 Validação de Status (se passou a Deferido / Procedente)
  IF NOT (
    v_status IN ('Deferido', 'Procedente', '🟢 Deferido') OR
    v_resultado IN ('Deferido', 'Procedente', '🟢 Deferido')
  ) THEN
    RETURN NEW;
  END IF;

  -- 3.3 Resolver cliente_id se nulo
  IF v_cliente_id IS NULL AND v_cpf IS NOT NULL THEN
    SELECT id INTO v_cliente_id FROM public.clientes WHERE cpf = v_cpf LIMIT 1;
  END IF;

  -- 3.4 Evitar duplicidade de cobrança para o mesmo registro de origem
  SELECT COUNT(1) INTO v_existe 
    FROM public.controle_cobrancas 
   WHERE origem_tipo = v_origem_tipo AND origem_id = v_origem_id;
   
  IF v_existe > 0 THEN
    RETURN NEW;
  END IF;

  -- 3.5 Cálculo de honorários sugeridos
  IF v_tipo_beneficio ILIKE '%salário-maternidade%' OR v_tipo_beneficio ILIKE '%salario-maternidade%' OR v_tipo_beneficio ILIKE '%maternidade%' THEN
    IF v_forma_pagamento = '1ª parcela integral' THEN
      v_honorarios := COALESCE(v_valor_mensal, 0);
    ELSE
      v_honorarios := COALESCE(v_valor_mensal, 0) * 4 * 0.30;
    END IF;
  ELSIF (v_tipo_beneficio ILIKE '%auxílio%' OR v_tipo_beneficio ILIKE '%auxilio%') AND (v_tipo_beneficio ILIKE '%incapacidade%' OR v_tipo_beneficio ILIKE '%doença%' OR v_tipo_beneficio ILIKE '%doenca%') THEN
    IF v_tempo_indeterminado THEN
      v_honorarios := COALESCE(v_valor_mensal, 0) * 12 * 0.30;
    ELSE
      v_honorarios := COALESCE(v_valor_mensal, 0) * COALESCE(v_qtd_parcelas, 1) * 0.30;
    END IF;
  ELSE
    v_honorarios := COALESCE(v_valor_acao, 0) * 0.30;
  END IF;

  -- Fallbacks para campos específicos de honorário já calculados
  IF v_honorarios = 0 OR v_honorarios IS NULL THEN
    IF TG_TABLE_NAME = 'acoes_genericas' THEN
      v_honorarios := COALESCE(NEW.honorarios_contratuais, 0);
    ELSIF TG_TABLE_NAME = 'auxilio_moradia' THEN
      v_honorarios := COALESCE(NEW.honorarios_calculado, 0);
    END IF;
  END IF;

  -- 3.6 Inserção na tabela controle_cobrancas se houver honorários
  IF v_honorarios > 0 THEN
    INSERT INTO public.controle_cobrancas (
      cliente_id, origem_tipo, origem_id,
      nome_cliente, cpf, numero_processo,
      tipo_beneficio,
      valor_mensal_beneficio,
      qtd_parcelas,
      honorarios_totais,
      forma_pagamento,
      categoria,
      status
    ) VALUES (
      v_cliente_id, v_origem_tipo, v_origem_id,
      v_nome_cliente, v_cpf, v_numero_processo,
      v_tipo_beneficio,
      v_valor_mensal,
      CASE WHEN v_tempo_indeterminado THEN NULL ELSE v_qtd_parcelas END,
      v_honorarios,
      v_forma_pagamento,
      'honorário',
      'Pendente'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Associação dos Triggers de Cobrança AFTER INSERT OR UPDATE
DROP TRIGGER IF EXISTS tr_auto_criar_cobranca ON public.processos_administrativos;
CREATE TRIGGER tr_auto_criar_cobranca
  AFTER INSERT OR UPDATE ON public.processos_administrativos
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_criar_cobranca();

DROP TRIGGER IF EXISTS tr_auto_criar_cobranca ON public.salario_maternidade;
CREATE TRIGGER tr_auto_criar_cobranca
  AFTER INSERT OR UPDATE ON public.salario_maternidade
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_criar_cobranca();

DROP TRIGGER IF EXISTS tr_auto_criar_cobranca ON public.auxilio_doenca;
CREATE TRIGGER tr_auto_criar_cobranca
  AFTER INSERT OR UPDATE ON public.auxilio_doenca
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_criar_cobranca();

DROP TRIGGER IF EXISTS tr_auto_criar_cobranca ON public.bpc_loas;
CREATE TRIGGER tr_auto_criar_cobranca
  AFTER INSERT OR UPDATE ON public.bpc_loas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_criar_cobranca();

DROP TRIGGER IF EXISTS tr_auto_criar_cobranca ON public.processos_judiciais_inss;
CREATE TRIGGER tr_auto_criar_cobranca
  AFTER INSERT OR UPDATE ON public.processos_judiciais_inss
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_criar_cobranca();

DROP TRIGGER IF EXISTS tr_auto_criar_cobranca ON public.acoes_genericas;
CREATE TRIGGER tr_auto_criar_cobranca
  AFTER INSERT OR UPDATE ON public.acoes_genericas
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_criar_cobranca();

DROP TRIGGER IF EXISTS tr_auto_criar_cobranca ON public.auxilio_moradia;
CREATE TRIGGER tr_auto_criar_cobranca
  AFTER INSERT OR UPDATE ON public.auxilio_moradia
  FOR EACH ROW EXECUTE FUNCTION public.fn_auto_criar_cobranca();
