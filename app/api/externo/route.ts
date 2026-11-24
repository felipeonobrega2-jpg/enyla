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
import { conciliacao } from "@/app/lib/conciliacaoExterna"
import { categoria } from "@/app/lib/categoriaExterna"
import { leituraFinanceira, AJUDA_FINANCEIRO } from "@/app/lib/financeiroExterno"
import { ErroMeta } from "@/app/lib/metaAdsLeitura"
import { leituraMetaAdsComFunil } from "@/app/lib/funilMetaAds"
import { paradasParaLeitura } from "@/app/lib/metaCampanhaParada"
import { acaoMetaAds } from "@/app/lib/metaAdsAcoes"
import { leadExterno } from "@/app/lib/leadExterno"
import { acaoPendencia, lerPendenciasDaArea, renovarFotoDepois } from "@/app/lib/pendenciaExterna"
import { acaoTarefaFelipe, tarefasDoDiretor } from "@/app/lib/tarefaFelipe"
import { pedidoExterno } from "@/app/lib/pedidoExterno"

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

export async function GET(req: NextRequest) {
  const c = await entrar(req)
  if (c instanceof NextResponse) return c
  const diretor = c.diretor
  const info = DIRETORES.find(d => d.id === diretor)!
  const o = req.nextUrl.searchParams.get("o")

  if (!o) return NextResponse.json({
    voce: `${info.nome}, ${info.cargo} (${info.area})`,
    leitura: { "?o=dossie": "lista dos arquivos do dossiê (história, manual do sistema, linha do tempo, todas as conversas)", "?o=arquivo&nome=": "um arquivo do dossiê (markdown)", "?o=conhecimento": "conhecimento vivo do sistema (JSON)", "?o=empresa": "a empresa agora: números, sua área, seu plano, equipe", "?o=detalhe&area=": AREAS.join(" | "), "?o=conversa": "o que você e o Felipe conversaram", ...(diretor === "cfo" ? AJUDA_FINANCEIRO : { "?o=financeiro": "SÓ PARA A CHAVE DO CFO (as outras recebem 403): leitura financeira completa" }), ...(diretor === "cmo" ? { "?o=meta_ads": "Meta Ads ao vivo (só leitura): conta, campanhas, conjuntos e anúncios; hoje, 7 e 30 dias; cache de 3 min; bloco funil por campanha (7 e 30 dias: leads, mql, orçamentos, pedidos, vendido, gasto, custo por lead e por MQL) e previsaoSaldoDias" } : {}) },
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
      ...Object.fromEntries(FERRAMENTAS.map(f => [`POST {acao:'${f}', ...}`, "ferramenta (ver instruções)"])) },
    limitePorHora: LIMITE_POR_HORA,
  })

  if (o === "financeiro") {
    if (diretor !== "cfo") return NextResponse.json({ erro: "?o=financeiro é só para a chave do CFO." }, { status: 403 })
    const l = await leituraFinanceira(req.nextUrl.searchParams)
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
    if (!AREAS.includes(area)) return NextResponse.json({ erro: `Área: ${AREAS.join(", ")}` }, { status: 400 })
    return NextResponse.json({ area, em: hora(foto.em), dados: foto.detalhes[area], ...(area === "marketing" ? { campanhasParadas: await paradasParaLeitura() } : {}) })
  }
  if (o === "empresa") {
    const [planos, cfg] = await Promise.all([lerPlanos(), lerCampos<{ conhecimentoDiretoria?: Partial<Record<string, LicaoDiretor[]>> }>(["conhecimentoDiretoria"])])
    const blocos = foto.bloco.split(/\n\n(?=## )/)
    const meu = blocos.find(b => b.includes(`, ${info.cargo} (`)) ?? ""
    const licoes = (cfg.conhecimentoDiretoria?.[diretor] ?? []).slice(0, 40).map(l => l.texto)
    return NextResponse.json({
      numerosDe: hora(foto.em), norte: foto.norte, suaArea: meu, detalheDaSuaArea: foto.detalhes[MINHA_AREA[diretor]] ?? "",
      seuPlano: planos[diretor] ?? null, oQueOFelipeEnsinou: licoes, equipe: foto.equipe, ferramentasDoSistema: foto.ferramentasTxt,
      resultados: foto.resultados, cultura: foto.cultura, funcionarios: foto.exec.map(f => ({ id: f.id, nome: f.nome })),
      ...await tarefasDoDiretor(diretor),
      ...await lerPendenciasDaArea(foto, diretor),   // pendencias (com chave) e dispensadas à parte
      outrasAreas: blocos.filter(b => b !== meu).map(b => b.split("\n").slice(0, 3).join("\n")),
    })
  }
  return NextResponse.json({ erro: "o: empresa, detalhe, conversa ou financeiro (só CFO)" }, { status: 400 })
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
  } else if (b.acao === "pedido") {
    const r = await pedidoExterno(diretor, b)
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status })
    msg = { id: novoId(), de: "diretor", texto: r.resultado, em: new Date().toISOString(), nuvem: true }
    await gravarConversa(diretor, [...await lerConversa(diretor), msg])
    after(() => { renovarFoto().catch(() => null) })   // o detalhe da produção já mostra a marca nova
    return NextResponse.json({ ok: true, resultado: r.resultado, aguardandoPagamento: r.aguardandoPagamento })
  } else if (b.acao === "meta_ads") {
    const r = await acaoMetaAds(diretor, b)
    return NextResponse.json(r.corpo, { status: r.status })
  } else if (FERRAMENTAS.includes(b.acao)) {
    const { apiKey } = await lerCampos<{ apiKey?: string }>(["apiKey"])
    if (b.acao === "ordenar_funcionario" && !apiKey) return NextResponse.json({ erro: "Sem chave da IA no sistema." }, { status: 503 })
    const r = await executarFerramenta(diretor, b.acao, b, { ctx: await fotoRapida(), apiKey: apiKey ?? "", grava: true })
    saida = r.saida
    if (!r.acao) return NextResponse.json({ ok: false, resultado: saida }, { status: 400 })
    msg = { id: novoId(), de: "diretor", texto: texto || saida, em: new Date().toISOString(), acoes: [r.acao], nuvem: true }
  } else return NextResponse.json({ erro: `acao: relatar, tarefa_felipe, dispensar_pendencia, reabrir_pendencia, ${FERRAMENTAS.join(", ")}` }, { status: 400 })
  await gravarConversa(diretor, [...await lerConversa(diretor), msg])
  return NextResponse.json({ ok: true, resultado: saida })
}
