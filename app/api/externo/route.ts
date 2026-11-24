import { NextRequest, NextResponse, after } from "next/server"
import { conferirChave, LIMITE_POR_HORA } from "@/app/lib/acessoExterno"
import { DIRETORES, type IdDiretor, type LicaoDiretor } from "@/app/lib/diretoria"
import { aquecerFoto, executarFerramenta, fotoRapida } from "@/app/lib/conversaDiretor"
import { lerConversa, gravarConversa, lerPlanos, type MsgConversa } from "@/app/lib/diretoriaServidor"
import { lerCampos } from "@/app/lib/configAtomica"
import { supabase } from "@/app/lib/supabase"
import { filtroDoAgente } from "@/app/lib/agenteLeads"
import { gastoFixo } from "@/app/lib/gastoFixoExterno"
import { leituraMetaAds, ErroMeta } from "@/app/lib/metaAdsLeitura"
import { acaoMetaAds } from "@/app/lib/metaAdsAcoes"

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
    leitura: { "?o=dossie": "lista dos arquivos do dossiê (história, manual do sistema, linha do tempo, todas as conversas)", "?o=arquivo&nome=": "um arquivo do dossiê (markdown)", "?o=conhecimento": "conhecimento vivo do sistema (JSON)", "?o=empresa": "a empresa agora: números, sua área, seu plano, equipe", "?o=detalhe&area=": AREAS.join(" | "), "?o=conversa": "o que você e o Felipe conversaram", ...(diretor === "cmo" ? { "?o=meta_ads": "Meta Ads ao vivo (só leitura): conta, campanhas, conjuntos e anúncios; hoje, 7 e 30 dias; cache de 3 min" } : {}) },
    escrita: { "POST {acao:'relatar', texto}": "manda algo ao Felipe",
      ...(diretor === "cmo" ? { "POST {acao:'meta_ads', operacao:'ligar'|'pausar'|'ajustar_verba', campanhaId | conjuntoId, verbaDiaria}": "SÓ A CHAVE DA CMO. Só em campanha ou conjunto que já existe (conjuntoId substitui campanhaId, nunca os dois; campanha ABO tem a verba no conjunto, campanha CBO se ajusta na campanha: conjunto CBO recebe 400): ligar (ACTIVE), pausar (PAUSED) ou ajustar a verba diária (verbaDiaria em reais, só em ajustar_verba). Mudança de verba de no máximo 20% sobre a atual e nunca acima de R$ 200 por campanha ou por conjunto: fora disso, 400 e nada é alterado (não corta). Criar campanha, conjunto ou anúncio e publicar são do Felipe. Resposta: { ok, registro } com antes e depois; cada ação e recusa fica registrada" } : {}),
      "POST {acao:'gasto_fixo', operacao:'criar'|'editar'|'desativar', id, nome, valor, diaVencimento, categoriaId, contaId, obs}": "SÓ A CHAVE DO CFO (as outras recebem 403). Cadastra, edita ou desativa um gasto fixo (Financeiro → Cadastros → Gastos fixos). criar exige nome e valor (reais, > 0); editar e desativar exigem id; diaVencimento 1 a 31; a conta de pagamento é contaId e anotações como 'cartão 7150' vão em obs. Desativar só põe ativa:false, nunca apaga. Resposta: { ok, resultado, gasto } com o item gravado", ...Object.fromEntries(FERRAMENTAS.map(f => [`POST {acao:'${f}', ...}`, "ferramenta (ver instruções)"])) },
    limitePorHora: LIMITE_POR_HORA,
  })

  if (o === "meta_ads") {
    if (diretor !== "cmo") return NextResponse.json({ erro: "A leitura da Meta Ads é só da CMO." }, { status: 403 })
    try { return NextResponse.json(await leituraMetaAds()) }
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
    return NextResponse.json({ area, em: hora(foto.em), dados: foto.detalhes[area] })
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
      outrasAreas: blocos.filter(b => b !== meu).map(b => b.split("\n").slice(0, 3).join("\n")),
    })
  }
  return NextResponse.json({ erro: "o: empresa, detalhe ou conversa" }, { status: 400 })
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
  } else return NextResponse.json({ erro: `acao: relatar, ${FERRAMENTAS.join(", ")}` }, { status: 400 })
  await gravarConversa(diretor, [...await lerConversa(diretor), msg])
  return NextResponse.json({ ok: true, resultado: saida })
}
