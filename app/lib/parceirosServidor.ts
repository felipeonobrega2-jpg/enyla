// Parceiros ENYLA no servidor: recebe o cadastro público (com tabela de preços / orçamento de exemplo), guarda no
// AppConfig e avisa você. Aprovar/recusar é pela tela Fornecedores (só a equipe).
import { lerConfigLinha } from "./configAtomica"
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"
import { limparCadastro, errosDoCadastro, comFalta, type CadastroComFalta, nomeServico, textoPrazo, textoEndereco, GERENTE_PADRAO, type CadastroParceiro } from "./parceiros"
import { textoEndereco as textoParaMotorista, type Endereco } from "./frete"

import { origemDoCadastro, listarProspectosParaCasar } from "./origemCadastroServidor"
import { CENARIOS_PADRAO, mesclarCenarios, limparCenario, cenariosPublicos, type CenarioParceiro, type CenarioPublico } from "./cenariosParceiros"

type Cfg = Record<string, unknown> & { cadastrosParceiros?: CadastroParceiro[]; cenariosParceiros?: CenarioParceiro[]; agenteAuto?: { avisoNumero?: string } }
const TIPOS = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|application\/vnd\.(ms-excel|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document))|text\/csv)$/
const MAX_BYTES = 10 * 1024 * 1024

export async function receberCadastro(form: FormData): Promise<{ ok: true; id: string } | { ok: false; erro: string; campos?: Record<string, string> }> {
  if (String(form.get("site") ?? "").trim()) return { ok: true, id: "ok" }   // robô (campo escondido preenchido)
  let bruto: Partial<CadastroParceiro>
  try { bruto = JSON.parse(String(form.get("dados") ?? "{}")) } catch { return { ok: false, erro: "Dados inválidos." } }
  const dados = limparCadastro(bruto)
  const campos = errosDoCadastro(dados)
  if (Object.keys(campos).length) return { ok: false, erro: "Confira os campos destacados.", campos }

  const { data: c } = await lerConfigLinha()
  const cfg = (c?.data ?? {}) as Cfg
  // Versão do cenário: a que o parceiro viu (se ainda existe) ou a atual
  const cenarios = mesclarCenarios(cfg.cenariosParceiros)
  for (const s of dados.servicos) for (const cid of Object.keys(s.precosExemplo ?? {})) {
    const versao = s.cenarioVersoes?.[cid] ?? cenarios.find(x => x.id === cid)?.versao
    if (versao) s.cenarioVersoes = { ...s.cenarioVersoes, [cid]: versao }
  }
  const ultimaHora = (cfg.cadastrosParceiros ?? []).filter(x => Date.now() - new Date(x.em).getTime() < 3_600_000)
  if (ultimaHora.length >= 30) return { ok: false, erro: "Muitos cadastros agora. Tente de novo em alguns minutos." }
  if (ultimaHora.some(x => x.documento === dados.documento)) return { ok: false, erro: "Já recebemos o seu cadastro agora há pouco. Obrigado!" }

  const id = `PAR-${Date.now().toString(36).toUpperCase()}`
  const arquivos: { nome: string; url: string }[] = []
  for (const f of form.getAll("arquivos").slice(0, 5)) {
    if (!(f instanceof File) || !f.size) continue
    if (f.size > MAX_BYTES || !TIPOS.test(f.type)) return { ok: false, erro: `O arquivo "${f.name}" não pode ser enviado (até 10 MB: PDF, imagem, planilha ou Word).` }
    const caminho = `parceiros/${id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60)}`
    const { error } = await supabase.storage.from("pedido-arquivos").upload(caminho, await f.arrayBuffer(), { contentType: f.type, upsert: false })
    if (error) return { ok: false, erro: "Não consegui guardar o arquivo. Tente de novo." }
    arquivos.push({ nome: f.name.slice(0, 120), url: supabase.storage.from("pedido-arquivos").getPublicUrl(caminho).data.publicUrl })
  }

  // Base no mapa (para o frete de levar e buscar material): coordenada pelo CEP + número; rua e bairro como ele escreveu
  let base: Endereco | null = null
  try {
    const { enderecoPeloCep } = await import("./geocodificar")
    const g = await Promise.race([enderecoPeloCep(dados.cep, dados.numero, dados.complemento), new Promise<{ erro: string }>(r => setTimeout(() => r({ erro: "tempo" }), 12_000))])
    if (!("erro" in g)) {
      const partes = { cep: g.cep, rua: dados.rua || g.rua, numero: dados.numero, complemento: dados.complemento, bairro: dados.bairro || g.bairro, cidade: dados.cidade || g.cidade, uf: dados.uf || g.uf }
      base = { ...partes, texto: textoParaMotorista(partes), lat: g.lat, lng: g.lng }
    }
  } catch { /* sem coordenada: você ajusta na aprovação */ }
  // Origem: telefone ou CNPJ de um prospecto (ou o id do link ?o=prospector&p=, se o prospecto existe) = prospector
  const dica = { origem: String(form.get("o") ?? "").slice(0, 20), prospectoId: String(form.get("p") ?? "").replace(/\D/g, "").slice(0, 12) }
  let ligacao: ReturnType<typeof origemDoCadastro> = null
  try { ligacao = origemDoCadastro(dados, await listarProspectosParaCasar(), dica) } catch { /* sem a tabela: fica direto */ }
  const origem = ligacao ? { origem: "prospector" as const, prospectoId: ligacao.prospecto.id } : { origem: "direto" as const }
  const cadastro: CadastroParceiro = { ...dados, id, em: new Date().toISOString(), status: "novo", gerente: GERENTE_PADRAO, arquivos, base, ...origem }
  await mudarConfig((d: Cfg) => ({ cadastrosParceiros: [cadastro, ...(d.cadastrosParceiros ?? [])].slice(0, 500) }))

  // Veio da prospecção (telefone ou CNPJ conferem): o funil vai para "cadastrou" (e "respondeu", se ainda antes). Não envia mensagem.
  if (ligacao?.avanca) {
    try {
      const { avancarProspectoPeloCadastro } = await import("./prospectorServidor")
      await avancarProspectoPeloCadastro(ligacao.prospecto.id, cadastro.id)
    } catch { /* o cadastro já está salvo; o funil não pode desfazer isso */ }
  }

  // Mesmo CNPJ de um prospecto que ainda não avançou (opt-out, descartado): só registra no histórico do prospecto.
  // Não mexe no cadastro e não envia mensagem.
  try {
    const { registrarCadastroRecebido } = await import("./prospectorServidor")
    await registrarCadastroRecebido(cadastro.documento, cadastro.tipoDocumento, cadastro.id)
  } catch { /* o cadastro já está salvo; o funil não pode desfazer isso */ }

  // E-mail "Cadastro recebido" para o parceiro (se a Resend estiver configurada)
  try {
    const { emailDoCadastro } = await import("./emailsServidor")
    const r = await emailDoCadastro(cadastro, "recebido")
    await mudarConfig((d: Cfg) => ({ cadastrosParceiros: (d.cadastrosParceiros ?? []).map(x => x.id === id ? { ...x, emails: [...(x.emails ?? []), r] } : x) }))
  } catch { /* o cadastro já está salvo */ }

  // Aviso para você (celular e WhatsApp)
  const servicos = cadastro.servicos.map(nomeServico).join(", ")
  await notificar("Novo parceiro cadastrado", `${cadastro.nomeFantasia} · ${cadastro.cidade}/${cadastro.uf} · ${servicos}`.slice(0, 180), { prioridade: "alta", link: `${LINK_SISTEMA}/?aba=fornecedores`, tags: ["handshake"] }).catch(() => null)
  try {
    const { evo } = await import("./evolution")
    const { seuNumero } = await import("./agenteAuto")
    const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
    if (destino) {
      const linhas = cadastro.servicos.map(s => `• ${nomeServico(s)} · ${textoPrazo(s)}`)
      const texto = [`🤝 *Novo parceiro: ${cadastro.nomeFantasia}*`, `${cadastro.responsavel} · ${textoEndereco(cadastro)}${base ? "" : " (não achei no mapa)"}`, `wa.me/55${cadastro.whatsapp.replace(/^55/, "")}`, ...linhas, arquivos.length ? `📎 ${arquivos.length} arquivo(s) com preços` : "", `${LINK_SISTEMA}/?aba=fornecedores`].filter(Boolean).join("\n")
      await evo("/message/sendText/{i}", { method: "POST", body: JSON.stringify({ number: destino, text: texto }) })
    }
  } catch { /* o cadastro já está salvo */ }
  return { ok: true, id }
}

export async function listarCadastros(): Promise<CadastroComFalta[]> {
  const { data: c } = await lerConfigLinha()
  return comFalta(((c?.data ?? {}) as Cfg).cadastrosParceiros ?? [])
}

export async function mudarStatus(id: string, status: CadastroParceiro["status"], fornecedorId?: string) {
  let antes: CadastroParceiro | undefined
  await mudarConfig((d: Cfg) => {
    antes = (d.cadastrosParceiros ?? []).find(x => x.id === id)
    return { cadastrosParceiros: (d.cadastrosParceiros ?? []).map(x => x.id === id ? { ...x, status, ...(fornecedorId ? { fornecedorId } : {}) } : x) }
  })
  // Aprovado agora: o prospecto com o mesmo CNPJ vai para "cadastrou" (não envia nada; falha quieta)
  if (status === "aprovado" && antes && antes.status !== "aprovado") {
    try {
      const { marcarProspectCadastrou } = await import("./prospectorServidor")
      await marcarProspectCadastrou(antes.documento, antes.tipoDocumento, antes.id)
    } catch { /* a aprovação já está salva; o funil não pode desfazer isso */ }
  }
  // Aprovado agora: e-mail de boas-vindas à rede
  if (status === "aprovado" && antes && antes.status !== "aprovado") {
    try {
      const { emailDoCadastro } = await import("./emailsServidor")
      const r = await emailDoCadastro({ ...antes, status }, "aprovado")
      await mudarConfig((d: Cfg) => ({ cadastrosParceiros: (d.cadastrosParceiros ?? []).map(x => x.id === id ? { ...x, emails: [...(x.emails ?? []), r] } : x) }))
      return r
    } catch { return null }
  }
  return null
}

// Cenários-exemplo: a equipe vê tudo (com referências); o público só enunciado e versão
export async function lerCenarios(): Promise<CenarioParceiro[]> {
  const { data: c } = await lerConfigLinha()
  return mesclarCenarios(((c?.data ?? {}) as Cfg).cenariosParceiros)
}
export async function lerCenariosPublicos(): Promise<CenarioPublico[]> {
  try { return cenariosPublicos(await lerCenarios()) } catch { return cenariosPublicos(mesclarCenarios(undefined)) }
}
export async function salvarCenarios(entrada: unknown): Promise<CenarioParceiro[]> {
  const ids = new Set(CENARIOS_PADRAO.map(c => c.id))
  const lista = (Array.isArray(entrada) ? entrada : []).filter(x => x && ids.has(x.id)).map(x => limparCenario({ ...x, servicoId: CENARIOS_PADRAO.find(c => c.id === x.id)!.servicoId })).filter(x => x.enunciado)
  let final: CenarioParceiro[] = []
  await mudarConfig((d: Cfg) => {
    const atuais = mesclarCenarios(d.cenariosParceiros)
    final = atuais.map(a => {
      const novo = lista.find(x => x.id === a.id)
      if (!novo) return a
      return { ...novo, versao: novo.enunciado === a.enunciado ? a.versao : a.versao + 1 }
    })
    return { cenariosParceiros: final }
  })
  return final
}
