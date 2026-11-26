import { NextRequest, NextResponse, after } from "next/server"
import { conferirChave, LIMITE_POR_HORA } from "@/app/lib/acessoExterno"
import { DIRETORES, type IdDiretor, type LicaoDiretor } from "@/app/lib/diretoria"
import { aquecerFoto, executarFerramenta, fotoRapida, renovarFoto } from "@/app/lib/conversaDiretor"
import { lerConversa, gravarConversa, lerPlanos, type MsgConversa } from "@/app/lib/diretoriaServidor"
import { lerCampos } from "@/app/lib/configAtomica"
import { supabase } from "@/app/lib/supabase"
import { filtroDoAgente } from "@/app/lib/agenteLeads"
import { gastoFixo } from "@/app/lib/gastoFixoExterno"
import { lancamento } from "@/app/lib/lancamentoExterno"
import { lancarDespesaExterno } from "@/app/lib/lancarDespesaExterno"
import { renomearFornecedorExterno } from "@/app/lib/renomearFornecedorExterno"
import { conciliacao } from "@/app/lib/conciliacaoExterna"
import { categoria } from "@/app/lib/categoriaExterna"
import { leituraFinanceira, carregarFinanceiro, AJUDA_FINANCEIRO } from "@/app/lib/financeiroExterno"
import { custoPorLote, AJUDA_CUSTO_LOTE } from "@/app/lib/custoLoteExterno"
import { ErroMeta } from "@/app/lib/metaAdsLeitura"
import { leituraMetaAdsComFunil } from "@/app/lib/funilMetaAds"
import { paradasParaLeitura } from "@/app/lib/metaCampanhaParada"
import { acaoMetaAds } from "@/app/lib/metaAdsAcoes"
import { ehComercial, podeAcionarComercial, comerciaisDoDiretor } from "@/app/lib/ordemComercial"
import { leadExterno } from "@/app/lib/leadExterno"
import { acaoPendencia, lerPendenciasDaArea, renovarFotoDepois } from "@/app/lib/pendenciaExterna"
import { acaoTarefaFelipe, tarefasDoDiretor } from "@/app/lib/tarefaFelipe"
import { pedidoExterno } from "@/app/lib/pedidoExterno"
import { lerPertoExterno, AJUDA_PERTO } from "@/app/lib/pertoExterno"
import { lerPropostasExterno, AJUDA_PROPOSTAS } from "@/app/lib/propostasExterno"
import { moverCardExterno } from "@/app/lib/moverCardExterno"
import { registrarMovimentoExterno, podeRegistrarMovimento } from "@/app/lib/registrarMovimentoExterno"
import { gravarDigitalExterno } from "@/app/lib/gravarDigitalExterno"
import { cancelarOrdem } from "@/app/lib/cancelarOrdem"
import { niveisDosLeads } from "@/app/lib/nivelNoDetalhe"
import { lerHistoricoOffset, AJUDA_HISTORICO_OFFSET } from "@/app/lib/historicoOffsetExterno"
import { leituraParceiros, AJUDA_PARCEIROS } from "@/app/lib/parceirosExterno"
import { lerPrazosFornecedores, AJUDA_PRAZOS_FORNECEDORES, PODEM_LER_PRAZOS } from "@/app/lib/prazosFornecedoresExterno"

// Porta de acesso dos diretores na nuvem (ex.: Grok Bot). Pública no proxy, mas cada chamada exige a chave do diretor
// (Authorization: Bearer enyla_<diretor>_...). Leitura da empresa e as mesmas ferramentas da conversa com o Felipe;
// mensagem a cliente só pelo Aprovo dele. O que o diretor faz aparece na conversa dele com o Felipe.
export const maxDuration = 120

const AREAS = ["comercial", "producao", "financeiro", "marketing", "sistema"]
const MINHA_AREA: Record<IdDiretor, string> = { coo: "producao", cco: "comercial", cmo: "marketing", cfo: "financeiro", cto: "sistema" }
const FERRAMENTAS = ["registrar_plano", "pedir_ferramenta", "pedir_contratacao", "guardar_conhecimento", "ordenar_funcionario"]
const novoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })

async function entrar(req: NextRequest) {
  const c = await conferirChave(req.headers.get("authorization"))
  return c.ok ? c : NextResponse.json({ erro: c.erro }, { status: c.status })
}

// COO: quem espera a Enyla há mais de 24 h (pedido, cliente, desde quando, horas). Sem telefone e sem texto da conversa.
async function lerEsperandoAEnyla() {
  const { esperaLonga } = await lerCampos<{ esperaLonga?: import("@/app/lib/esperaLongaServidor").EsperaLongaGravada }>(["esperaLonga"])
  return { atualizadoEm: esperaLonga?.em ? hora(esperaLonga.em) : null, itens: (esperaLonga?.itens ?? []).map(e => ({ pedido: e.pedido, cliente: e.nome, desde: hora(e.desde), horasEsperando: e.horas })) }
}

export async function GET(req: NextRequest) {
  const c = await entrar(req)
  if (c instanceof NextResponse) return c
  const diretor = c.diretor
  const info = DIRETORES.find(d => d.id === diretor)!
  const o = req.nextUrl.searchParams.get("o")

  if (!o) return NextResponse.json({
    voce: `${info.nome}, ${info.cargo} (${info.area})`,
    leitura: { "?o=dossie": "lista dos arquivos do dossiê (história, manual do sistema, linha do tempo, todas as conversas)", "?o=arquivo&nome=": "um arquivo do dossiê (markdown)", "?o=conhecimento": "conhecimento vivo do sistema (JSON)", "?o=empresa": "a empresa agora: números, sua área, seu plano, equipe", "?o=detalhe&area=": AREAS.join(" | ") + " | parceiros (só CCO e CMO)", ...(podeAcionarComercial(diretor) ? { "?o=parceiros": AJUDA_PARCEIROS } : { "?o=parceiros": "SÓ PARA AS CHAVES DO CCO E DA CMO (as outras recebem 403): cadastros de /parceiros e respostas do Prospector" }), "?o=historico_offset": AJUDA_HISTORICO_OFFSET, "?o=prazos_fornecedores": PODEM_LER_PRAZOS.includes(diretor) ? AJUDA_PRAZOS_FORNECEDORES : "SÓ PARA AS CHAVES DO COO E DO CTO (as outras recebem 403): prazos cadastrais dos fornecedores de produção", "?o=conversa": "o que você e o Felipe conversaram", ...(podeAcionarComercial(diretor) ? { "?o=propostas": AJUDA_PROPOSTAS } : { "?o=propostas": "SÓ PARA AS CHAVES DO CCO E DA CMO (as outras recebem 403): propostas Offset em JSON paginado" }), ...(podeAcionarComercial(diretor) ? { "?o=perto": AJUDA_PERTO } : { "?o=perto": "SÓ PARA AS CHAVES DO CCO E DA CMO (as outras recebem 403): a lista 'Perto de você'" }), ...(diretor === "cfo" ? { ...AJUDA_FINANCEIRO, ...AJUDA_CUSTO_LOTE } : { "?o=financeiro": "SÓ PARA A CHAVE DO CFO (as outras recebem 403): leitura financeira completa", "?o=custo_lote": "SÓ PARA A CHAVE DO CFO (as outras recebem 403): custo real por lote Offset" }), ...(diretor === "cmo" ? { "?o=meta_ads": "Meta Ads ao vivo (só leitura): conta, campanhas, conjuntos e anúncios; hoje, 7 e 30 dias; cache de 3 min; bloco funil por campanha (7 e 30 dias: leads, mql, orçamentos, pedidos, vendido, gasto, custo por lead e por MQL) e previsaoSaldoDias" } : {}) },
    escrita: { "POST {acao:'relatar', texto}": "manda algo ao Felipe",
      "POST {acao:'dispensar_pendencia', chave, motivo, ate?}": "QUALQUER DIRETOR. Dispensa uma pendência (a chave vem em ?o=empresa, campo pendencias) com motivo obrigatório (sem motivo: 400); ate (AAAA-MM-DD) opcional: depois dessa data ela volta. Não apaga nada",
      "POST {acao:'tarefa_felipe', titulo, detalhe?, prazo? (AAAA-MM-DD)}": "QUALQUER DIRETOR. Põe uma tarefa na lista 'Depende de você' do Felipe (pedido por você, com data e prazo). titulo obrigatório (até 140 caracteres); no máximo 10 abertas por diretor (a 11ª volta 429). Suas tarefas (abertas e feitas nos últimos 7 dias) estão em ?o=empresa, campo tarefasParaFelipe. {acao:'tarefa_felipe', operacao:'cancelar', id} cancela só as suas. Não manda mensagem a ninguém",
      "POST {acao:'reabrir_pendencia', chave}": "QUALQUER DIRETOR. Tira a dispensa e a pendência volta na hora (?o=empresa lista as dispensadas à parte)",
      ...(diretor === "cmo" ? { "POST {acao:'meta_ads', operacao:'ligar'|'pausar'|'ajustar_verba', campanhaId | conjuntoId, verbaDiaria}": "SÓ A CHAVE DA CMO. Só em campanha ou conjunto que já existe (conjuntoId substitui campanhaId, nunca os dois; campanha ABO tem a verba no conjunto, campanha CBO se ajusta na campanha: conjunto CBO recebe 400): ligar (ACTIVE), pausar (PAUSED) ou ajustar a verba diária (verbaDiaria em reais, só em ajustar_verba). Mudança de verba de no máximo 20% sobre a atual e nunca acima de R$ 200 por campanha ou por conjunto: fora disso, 400 e nada é alterado (não corta). Criar campanha, conjunto ou anúncio e publicar são do Felipe. Resposta: { ok, registro } com antes e depois; cada ação e recusa fica registrada" } : {}),
      "POST {acao:'lead', operacao:'perdido'|'orcado'|'reabrir', jid | cliente, motivo}": "SÓ AS CHAVES DO CCO E DO COO (as outras recebem 403). perdido exige motivo (400 sem); orcado é manual, para quando a detecção do orçamento enviado pelo Felipe falhar; reabrir volta o lead ao normal. Nada é apagado (fica no histórico) e nada é enviado ao cliente. Resposta: { ok, resultado, jid }",
      "POST {acao:'gasto_fixo', operacao:'criar'|'editar'|'desativar', id, nome, valor, diaVencimento, categoriaId, contaId, obs}": "SÓ A CHAVE DO CFO (as outras recebem 403). Cadastra, edita ou desativa um gasto fixo (Financeiro → Cadastros → Gastos fixos). criar exige nome e valor (reais, > 0); editar e desativar exigem id; diaVencimento 1 a 31; a conta de pagamento é contaId e anotações como 'cartão 7150' vão em obs. Desativar só põe ativa:false, nunca apaga. Resposta: { ok, resultado, gasto } com o item gravado",
      ...(diretor === "cfo" ? {
        "POST {acao:'lancamento', operacao:'criar'|'editar'|'desativar'|'estornar', id, tipo, descricao, valor, dataVencimento, dataPagamento, status, categoria, subcategoria, contaId, fornecedorId, formaPagamento, obs, cardId, cardNumero, nomeCliente, loteId, loteNumero}": "SÓ A CHAVE DO CFO. Lançamentos e contas a pagar (despesa não paga). criar exige tipo (receita|despesa), descricao, valor (reais, > 0) e dataVencimento; editar, desativar e estornar exigem id; datas AAAA-MM-DD; status pendente|pago|atrasado; formaPagamento pix|boleto|cartao_credito|cartao_debito|dinheiro|transferencia|outro|conta. status 'pago' é só baixa no livro: não dispara pagamento. Desativar e estornar nunca apagam a linha (marcam estornadoEm/estornadoPor). Resposta: { ok, resultado, lancamento }",
        "POST {acao:'conciliacao', operacao:'vincular'|'vincularVarios'|'atualizar'|'criar'|'ignorar'|'desfazer', txId, lancamentoId, lancamentoIds, campos, lancamentos, sempre, ensinar}": "SÓ A CHAVE DO CFO. Decide um movimento de banco_transacoes (txId): vincular a um lançamento, vincularVarios, atualizar (baixa no lançamento com campos), criar lançamentos ou ignorar. desfazer é lógico: estorna os lançamentos criados (nada é apagado) e devolve a transação a pendente. Sem contraparte_doc nem bruto na resposta. Resposta: { ok, resultado, tx, lancamentos }",
        "POST {acao:'categoria', operacao:'criar'|'editar'|'desativar', tipo:'receita'|'despesa', id, nome, subcategorias, ativa}": "SÓ A CHAVE DO CFO. Categorias financeiras. criar exige nome; editar e desativar exigem id. Desativar só põe ativa:false, a categoria continua na lista. Resposta: { ok, resultado, categoria }",
      } : {}),
      ...(diretor === "cto" ? {
        "POST {acao:'lancar_despesa', chaveIdempotencia, fornecedorId, descricao, valor, dataVencimento, dataPagamento, status:'pago'|'pendente', rateio:[{loteNumero | loteId, valor}]}": "SÓ A CHAVE DO CTO (CFO e as outras recebem 403; o CFO só confere por leitura em ?o=financeiro). Lança UMA despesa (total em valor, reais) rateada por lote: cada item do rateio leva a fatia do lote (> 0, no máximo 2 casas); a soma tem de ser igual ao total, comparada em centavos (senão 400 e nada é gravado; o residual não é acertado). Lote repetido: 400; lote ou fornecedor inexistente: 404. Grava uma linha por lote com a fatia e um id de grupo (nunca o total em cada lote): custo direto, a pagar, caixa e DRE contam o total uma vez. chaveIdempotencia obrigatória (400 sem): a mesma chave com o mesmo payload devolve o resultado original sem duplicar; com payload diferente: 409. status 'pago' é só baixa no livro (dataPagamento opcional, padrão = dataVencimento): não dispara pagamento, não chama Asaas, Pluggy nem banco. Registra quem, quando (Brasília) e o payload. Resposta: { ok, resultado, despesa, rateio, registro }",
        "POST {acao:'renomear_fornecedor', id, nome}": "SÓ A CHAVE DO CTO (as outras, inclusive a do CFO, recebem 403). Troca só o nome exibido do fornecedor (AppConfig.fornecedores); o id e os vínculos continuam. id inexistente: 404; nome vazio: 400. Registra quem, quando (Brasília), id, nome anterior e novo. Resposta: { ok, resultado, fornecedor, registro }",
      } : {}),
      ...(comerciaisDoDiretor(diretor).length ? { "POST {acao:'ordenar_funcionario', funcionario:'atendente'|'followup'|'reativacao', cliente | jid, ordem}": "SÓ CCO e CMO (as outras recebem 403). O agente do Comercial escreve a mensagem para UM lead com o histórico do WhatsApp; REGRA (25/11): só 'cliente' (quem já comprou, nível A, B ou C) precisa do Aprovo do Felipe. Para LEAD (nunca comprou; cadastro sem compra e orçamento aberto não contam) a mensagem SAI DIRETO pelo agente indicado, só com o agente ligado e dentro do horário dele (senão 409 'fora do horário do agente', nada é criado), no máximo 20 envios diretos por dia por diretor (a 21ª volta 429). Cliente A, B, C ou nível 'indefinido' (já comprou sem curva, compra antiga, só digital, ligação fraca com quem comprou, erro de leitura) vai para a fila do Aprovo, no máximo 20 esperando por diretor (a 21ª volta 429). Texto que promete orçamento sem link real, Felipe escrevendo na conversa e gráfica do Prospector também vão para a fila. Lead sem WhatsApp: 404. Resposta: { ok, resultado, destino: 'enviado_direto'|'fila_aprovo', motivo, nivel, id }; leia o nível antes em ?o=perto ou ?o=detalhe&area=comercial" } : {}),
      "POST {acao:'mover_card', numero | loteNumero, coluna, motivo}": "QUALQUER DIRETOR para colunas 2 a 8 e para 10 (Perdido, mesmo efeito do X do card); coluna 9 (Entregue) SÓ CTO e COO (as outras: 403, nada é gravado). Avança um pedido de etapa na produção. numero (ORC-...) ou loteNumero (move os cards do lote); coluna de 2 (Arte/Dieline) a 8 (Expedição); motivo obrigatório (até 300 caracteres). Só avança (destino maior que a coluna atual) e só de cards já Fechados (coluna 1 em diante); nunca volta nem vai a 0: 400 com o motivo e nada é alterado. coluna 9 (Entregue) e coluna 10 (Perdido) exigem motivo e valem para card em andamento (1 a 8); Perdido grava em motivoPerdido e devolve também registro (quem, quando em Brasília, numero/lote, de, para, motivo). Só muda a coluna (preço, quantidade, sinal e opcoes ficam como estão). Registra no Tracking quem moveu (seu nome), a etapa de destino e o motivo. Não manda mensagem nem e-mail ao cliente, não mexe em cobrança, pagamento nem a receber e não apaga nada. Resposta: { ok, resultado, movidos: [{numero, de, para}] }",
      ...(podeRegistrarMovimento(diretor) ? { "POST {acao:'registrar_movimento', operacao:'receber'|'enviar', id | loteNumero | pedidoKey, etapa, fornecedorId, servicos, enviadoEm, recebidoEm, prazoPrevisto, pedidoLabel}": "SÓ AS CHAVES DO CTO E DO COO (as outras: 403 e nada é gravado). Grava só em AppConfig.producao.movimentos (não muda a coluna do card nem o Tracking; para mover o card use mover_card). receber: fecha um movimento aberto com recebidoEm (data real AAAA-MM-DD); identifique por id ou por loteNumero/pedidoKey + etapa; mesma data de novo devolve o resultado sem alterar; data diferente num movimento já fechado: 409; inexistente: 404. enviar: abre movimento novo com loteNumero ou pedidoKey, fornecedorId (existente e ativo), etapa (arte|impressao|acabamento|corteVinco|colagem|outro), servicos, enviadoEm (data real) e prazoPrevisto opcional; sem prazoPrevisto, calcula em dias úteis pelo prazoDias cadastral do fornecedor (PREVISÃO cadastral, não data combinada nem confirmada); já existindo movimento aberto da mesma etapa no pedido: 409. Não manda WhatsApp, e-mail nem aviso a cliente ou fornecedor. Registra quem, quando (Brasília) e o payload. Resposta: { ok, resultado, movimento, registro }" } : { "POST {acao:'registrar_movimento'}": "SÓ AS CHAVES DO CTO E DO COO (as outras recebem 403): abre e fecha movimento de fornecedor" }),
      "POST {acao:'gravar_digital', id, situacaoArte?, prazoEntrega?, arteAprovadaEm?, motivo}": "QUALQUER DIRETOR (arteAprovadaEm: só CTO e COO). Grava no pedido Digital (id DIG-0000) só a situação da arte (sem arte | enviada | ajustes pedidos | aprovada | prova autorizada) e/ou o prazo de entrega (YYYY-MM-DD; vazio limpa e volta a 'a confirmar'). arteAprovadaEm (opcional): instante ISO com fuso, ex. 2026-11-13T14:00:00.000Z, no passado e não anterior à criação do pedido; é a data de que o acompanhamento parte para prever a entrega (use nos pedidos cuja arte foi aprovada no WhatsApp antes do gravador automático); outras chaves recebem 403 e nada é gravado. Informe ao menos um dos três; motivo obrigatório (até 300 caracteres). Registra no pedido quem gravou (seu nome), quando (Brasília), o motivo e o valor anterior de arteAprovadaEm (null se não havia). Não mexe em pagamento, status, custo nem mensagem, e não manda nada ao cliente. 400 com o motivo e nada alterado se algo estiver inválido; 403 se arteAprovadaEm vier de quem não é CTO/COO; 404 se o pedido não existe. Resposta: { ok, id, situacaoArte, prazoEntrega, arteAprovadaEm }",
      "POST {acao:'cancelar_ordem', id}": "QUALQUER DIRETOR. Cancela uma ordem SUA (id do cartão, devolvido por ordenar_funcionario) que ainda está esperando o Aprovo (status aguardando). Só marca como cancelada (canceladoPor, canceladoEm): nunca apaga nada e nada é enviado. Ordem de outro diretor ou que não existe: 404; já enviada, descartada, com erro ou cancelada: 409. A tela da diretoria mostra 'Cancelada' e não oferece o Aprovo. Resposta: { ok, resultado, id }",
      ...Object.fromEntries(FERRAMENTAS.map(f => [`POST {acao:'${f}', ...}`, "ferramenta (ver instruções)"])) },
    limitePorHora: LIMITE_POR_HORA,
  })

  if (o === "custo_lote") {
    if (diretor !== "cfo") return NextResponse.json({ erro: "?o=custo_lote é só para a chave do CFO." }, { status: 403 })
    const ie = req.nextUrl.searchParams.get("incluirEstornados")
    if (ie !== null && !["1", "true", "sim"].includes(ie)) return NextResponse.json({ erro: "incluirEstornados: 1 | true | sim" }, { status: 400 })
    const d = await carregarFinanceiro()
    return NextResponse.json({ lotes: custoPorLote(d.kanban, d.lancamentos, { lote: req.nextUrl.searchParams.get("lote") ?? undefined, incluirEstornados: ie !== null }) })
  }

  if (o === "financeiro") {
    if (diretor !== "cfo") return NextResponse.json({ erro: "?o=financeiro é só para a chave do CFO." }, { status: 403 })
    const l = await leituraFinanceira(req.nextUrl.searchParams)
    return NextResponse.json(l.corpo, { status: l.status })
  }

  if (o === "parceiros") {
    if (!podeAcionarComercial(diretor)) return NextResponse.json({ erro: "?o=parceiros é só para as chaves do CCO e da CMO." }, { status: 403 })
    const l = await leituraParceiros()
    return NextResponse.json(l.corpo, { status: l.status })
  }

  if (o === "historico_offset") {
    const l = await lerHistoricoOffset()
    return NextResponse.json(l.corpo, { status: l.status })
  }

  if (o === "prazos_fornecedores") {
    const l = await lerPrazosFornecedores(diretor)
    return NextResponse.json(l.corpo, { status: l.status })
  }

  if (o === "propostas") {
    const q = req.nextUrl.searchParams
    const l = await lerPropostasExterno(diretor, { pagina: q.get("pagina"), limite: q.get("limite"), status: q.get("status"), estrela: q.get("estrela") })
    return NextResponse.json(l.corpo, { status: l.status })
  }

  if (o === "perto") {
    const l = await lerPertoExterno(diretor)
    return NextResponse.json(l.corpo, { status: l.status })
  }

  if (o === "meta_ads") {
    if (diretor !== "cmo") return NextResponse.json({ erro: "A leitura da Meta Ads é só da CMO." }, { status: 403 })
    try { const l = await leituraMetaAdsComFunil(); return NextResponse.json({ ...l, campanhasParadas: await paradasParaLeitura(l.conta) }) }
    catch (e) {
      if (e instanceof ErroMeta) return NextResponse.json({ erro: e.message, codigo: e.codigo }, { status: e.status })
      return NextResponse.json({ erro: "Falha ao ler a Meta Ads." }, { status: 500 })
    }
  }

  if (o === "conversa") {
    const ms = (await lerConversa(diretor)).slice(-30)
    return NextResponse.json({ mensagens: ms.map(m => ({ de: m.de === "felipe" ? "Felipe" : info.nome.split(" ")[0], em: hora(m.em), texto: m.texto, ...(m.acoes?.length ? { acoes: m.acoes.map(a => a.tipo) } : {}) })) })
  }

  // Dossiê: o contexto inteiro da empresa (história, linha do tempo, todas as conversas do Felipe com o engenheiro)
  if (o === "dossie") {
    const { data } = await supabase.from("dados_sistema").select("id, dados->>titulo, dados->>em, atualizado_em").eq("colecao", "dossieNuvem").order("id")
    const lista = (data ?? []) as { id: string; titulo: string | null; em: string | null }[]
    const ordem = (n: string) => n === "historia.md" ? 0 : n === "sistema.md" ? 1 : n === "linha-do-tempo.md" ? 2 : 3
    return NextResponse.json({ leiaNaOrdem: lista.sort((a, b) => ordem(a.id) - ordem(b.id) || a.id.localeCompare(b.id)).map(r => ({ nome: r.id, titulo: r.titulo, em: r.em })) })
  }
  if (o === "arquivo") {
    const nome = req.nextUrl.searchParams.get("nome") ?? ""
    const { data } = await supabase.from("dados_sistema").select("dados").eq("colecao", "dossieNuvem").eq("id", nome).maybeSingle()
    const texto = (data?.dados as { texto?: string } | null)?.texto
    if (!texto) return NextResponse.json({ erro: "Arquivo não encontrado (veja ?o=dossie)." }, { status: 404 })
    return new NextResponse(texto, { headers: { "Content-Type": "text/markdown; charset=utf-8" } })
  }
  if (o === "conhecimento") {
    const [cfg, planos] = await Promise.all([lerCampos<Record<string, unknown> & { filtroLeads?: string; agenteAuto?: { pequenoParceiro?: boolean } }>(["guiaAtendimento", "filtroLeads", "agenteAuto", "estiloFelipe", "conhecimentoAgente", "conhecimentoDiretoria", "ideias"]), lerPlanos()])
    const auto = cfg.agenteAuto as { pequenoParceiro?: boolean; horario?: unknown } | undefined
    return NextResponse.json({
      em: new Date().toISOString(),
      guiaDeAtendimento: cfg.guiaAtendimento ?? null, filtroDeLeads: filtroDoAgente(cfg), estiloDoFelipe: cfg.estiloFelipe ?? null,
      modoDigital: auto?.pequenoParceiro === false, horarioDoAgente: auto?.horario ?? null,
      oQueOsAgentesAprenderam: cfg.conhecimentoAgente ?? [], oQueOFelipeEnsinouADiretoria: cfg.conhecimentoDiretoria ?? {},
      planosDosDiretores: planos, bancoDeIdeias: cfg.ideias ?? [],
    })
  }

  const foto = await fotoRapida()
  after(aquecerFoto)
  if (o === "detalhe") {
    const area = req.nextUrl.searchParams.get("area") ?? ""
    if (area === "parceiros") {
      if (!podeAcionarComercial(diretor)) return NextResponse.json({ erro: "A área parceiros é só para as chaves do CCO e da CMO." }, { status: 403 })
      const l = await leituraParceiros()
      return NextResponse.json({ area, ...l.corpo }, { status: l.status })
    }
    if (!AREAS.includes(area)) return NextResponse.json({ erro: `Área: ${AREAS.join(", ")}` }, { status: 400 })
    return NextResponse.json({ area, em: hora(foto.em), dados: foto.detalhes[area], ...(area === "marketing" ? { campanhasParadas: await paradasParaLeitura() } : {}), ...(area === "comercial" ? { niveisDosLeads: await niveisDosLeads(foto.detalhes.comercial) } : {}), ...(area === "producao" ? { esperandoAEnyla24h: await lerEsperandoAEnyla() } : {}) })
  }
  if (o === "empresa") {
    const [planos, cfg] = await Promise.all([lerPlanos(), lerCampos<{ conhecimentoDiretoria?: Partial<Record<string, LicaoDiretor[]>> }>(["conhecimentoDiretoria"])])
    const blocos = foto.bloco.split(/\n\n(?=## )/)
    const meu = blocos.find(b => b.includes(`, ${info.cargo} (`)) ?? ""
    const licoes = (cfg.conhecimentoDiretoria?.[diretor] ?? []).slice(0, 40).map(l => l.texto)
    return NextResponse.json({
      numerosDe: hora(foto.em), norte: foto.norte, suaArea: meu, detalheDaSuaArea: foto.detalhes[MINHA_AREA[diretor]] ?? "",
      seuPlano: planos[diretor] ?? null, oQueOFelipeEnsinou: licoes, equipe: foto.equipe, ferramentasDoSistema: foto.ferramentasTxt,
      resultados: foto.resultados, cultura: foto.cultura, funcionarios: [...foto.exec, ...comerciaisDoDiretor(diretor)].map(f => ({ id: f.id, nome: f.nome })),
      ...await tarefasDoDiretor(diretor),
      ...await lerPendenciasDaArea(foto, diretor),   // pendencias (com chave) e dispensadas à parte
      outrasAreas: blocos.filter(b => b !== meu).map(b => b.split("\n").slice(0, 3).join("\n")),
    })
  }
  return NextResponse.json({ erro: "o: empresa, detalhe, conversa, perto, historico_offset, prazos_fornecedores (só COO e CTO), propostas, parceiros (CCO e CMO) ou financeiro ou custo_lote (só CFO)" }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const c = await entrar(req)
  if (c instanceof NextResponse) return c
  const diretor = c.diretor
  const b = await req.json().catch(() => null) as (Record<string, unknown> & { acao?: string; texto?: string }) | null
  if (!b?.acao) return NextResponse.json({ erro: "Mande { acao, ... } em JSON." }, { status: 400 })
  const texto = typeof b.texto === "string" ? b.texto.trim().slice(0, 4000) : ""
  let msg: MsgConversa
  let saida = ""
  if (b.acao === "relatar") {
    if (!texto) return NextResponse.json({ erro: "texto vazio" }, { status: 400 })
    msg = { id: novoId(), de: "diretor", texto, em: new Date().toISOString(), nuvem: true }
    saida = "Entregue ao Felipe."
  } else if (b.acao === "gasto_fixo") {
    if (diretor !== "cfo") return NextResponse.json({ erro: "gasto_fixo é só para a chave do CFO." }, { status: 403 })
    const r = await gastoFixo(b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    return NextResponse.json({ ok: true, resultado: r.resultado, gasto: r.gasto })
  } else if (b.acao === "lancamento" || b.acao === "conciliacao" || b.acao === "categoria") {
    if (diretor !== "cfo") return NextResponse.json({ erro: `${b.acao} é só para a chave do CFO.` }, { status: 403 })
    const r = b.acao === "lancamento" ? await lancamento(b) : b.acao === "conciliacao" ? await conciliacao(b) : await categoria(b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    const { ok: _ok, resultado, ...resto } = r
    void _ok
    return NextResponse.json({ ok: true, resultado, ...resto })
  } else if (b.acao === "lancar_despesa" || b.acao === "renomear_fornecedor") {
    if (diretor !== "cto") return NextResponse.json({ erro: `${b.acao} é só para a chave do CTO.` }, { status: 403 })
    const r = b.acao === "lancar_despesa" ? await lancarDespesaExterno(diretor, b) : await renomearFornecedorExterno(diretor, b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    const { ok: _ok, resultado, ...resto } = r
    void _ok
    return NextResponse.json({ ok: true, resultado, ...resto })
  } else if (b.acao === "lead") {
    const r = await leadExterno(b, diretor)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    return NextResponse.json({ ok: true, resultado: r.resultado, jid: r.jid })
  } else if (b.acao === "dispensar_pendencia" || b.acao === "reabrir_pendencia") {
    const r = await acaoPendencia(diretor, b)
    if (r.status === 200) after(renovarFotoDepois)
    return NextResponse.json(r.corpo, { status: r.status })
  } else if (b.acao === "tarefa_felipe") {
    const r = await acaoTarefaFelipe(diretor, b)
    if (r.status !== 200) return NextResponse.json(r.corpo, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: String(r.corpo.resultado), em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    return NextResponse.json(r.corpo)
  } else if (b.acao === "cancelar_ordem") {
    const r = await cancelarOrdem(diretor, b)
    return NextResponse.json(r.corpo, { status: r.status })
  } else if (b.acao === "pedido") {
    const r = await pedidoExterno(diretor, b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    after(() => { renovarFoto().catch(() => null) })   // o detalhe da produção já mostra a marca nova
    return NextResponse.json({ ok: true, resultado: r.resultado, aguardandoPagamento: r.aguardandoPagamento })
  } else if (b.acao === "mover_card") {
    const r = await moverCardExterno(diretor, b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    after(() => { renovarFoto().catch(() => null) })
    return NextResponse.json({ ok: true, resultado: r.resultado, movidos: r.movidos, ...(r.registro ? { registro: r.registro } : {}) })
  } else if (b.acao === "registrar_movimento") {
    if (!podeRegistrarMovimento(diretor)) return NextResponse.json({ erro: "registrar_movimento é só para as chaves do CTO e do COO." }, { status: 403 })
    const r = await registrarMovimentoExterno(diretor, b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    return NextResponse.json({ ok: true, resultado: r.resultado, movimento: r.movimento, registro: r.registro, ...(r.prazoPrevistoCadastral ? { prazoPrevistoCadastral: true } : {}) })
  } else if (b.acao === "gravar_digital") {
    const r = await gravarDigitalExterno(diretor, b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    return NextResponse.json({ ok: true, id: r.id, situacaoArte: r.situacaoArte, prazoEntrega: r.prazoEntrega, arteAprovadaEm: r.arteAprovadaEm })
  } else if (b.acao === "meta_ads") {
    const r = await acaoMetaAds(diretor, b)
    return NextResponse.json(r.corpo, { status: r.status })
  } else if (FERRAMENTAS.includes(b.acao)) {
    const { apiKey } = await lerCampos<{ apiKey?: string }>(["apiKey"])
    if (b.acao === "ordenar_funcionario" && ehComercial(b.funcionario) && !podeAcionarComercial(diretor)) return NextResponse.json({ erro: `${b.funcionario} só atende ordens da CCO e da CMO.` }, { status: 403 })
    if (b.acao === "ordenar_funcionario" && !apiKey) return NextResponse.json({ erro: "Sem chave da IA no sistema." }, { status: 503 })
    const r = await executarFerramenta(diretor, b.acao, b, { ctx: await fotoRapida(), apiKey: apiKey ?? "", grava: true, enviarLead: true })
    saida = r.saida
    if (!r.acao) return NextResponse.json({ ok: false, resultado: saida, ...(r.motivo ? { motivo: r.motivo } : {}), ...(r.nivel ? { nivel: r.nivel } : {}) }, { status: r.status ?? 400 })
    msg = { id: novoId(), de: "diretor", texto: texto || saida, em: new Date().toISOString(), acoes: [r.acao], nuvem: true }
    if (r.destino) {
      await gravarConversa(diretor, [...await lerConversa(diretor), msg])
      return NextResponse.json({ ok: true, resultado: saida, destino: r.destino, motivo: r.motivo, nivel: r.nivel, id: r.acao.id })
    }
  } else return NextResponse.json({ erro: `acao: relatar, lancar_despesa, renomear_fornecedor, mover_card, registrar_movimento, gravar_digital, cancelar_ordem, tarefa_felipe, dispensar_pendencia, reabrir_pendencia, ${FERRAMENTAS.join(", ")}` }, { status: 400 })
  await gravarConversa(diretor, [...await lerConversa(diretor), msg])
  return NextResponse.json({ ok: true, resultado: saida })
}
