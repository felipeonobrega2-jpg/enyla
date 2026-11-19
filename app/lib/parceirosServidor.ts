// Parceiros ENYLA no servidor: recebe o cadastro público (com tabela de preços / orçamento de exemplo), guarda no
// AppConfig e avisa você. Aprovar/recusar é pela tela Fornecedores (só a equipe).
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"
import { limparCadastro, errosDoCadastro, nomeServico, textoPrazo, textoEndereco, GERENTE_PADRAO, type CadastroParceiro } from "./parceiros"
import { textoEndereco as textoParaMotorista, type Endereco } from "./frete"

type Cfg = Record<string, unknown> & { cadastrosParceiros?: CadastroParceiro[]; agenteAuto?: { avisoNumero?: string } }
const TIPOS = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif)|application\/vnd\.(ms-excel|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document))|text\/csv)$/
const MAX_BYTES = 10 * 1024 * 1024

export async function receberCadastro(form: FormData): Promise<{ ok: true; id: string } | { ok: false; erro: string; campos?: Record<string, string> }> {
  if (String(form.get("site") ?? "").trim()) return { ok: true, id: "ok" }   // robô (campo escondido preenchido)
  let bruto: Partial<CadastroParceiro>
  try { bruto = JSON.parse(String(form.get("dados") ?? "{}")) } catch { return { ok: false, erro: "Dados inválidos." } }
  const dados = limparCadastro(bruto)
  const campos = errosDoCadastro(dados)
  if (Object.keys(campos).length) return { ok: false, erro: "Confira os campos destacados.", campos }

  const { data: c } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  const cfg = (c?.data ?? {}) as Cfg
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
  const cadastro: CadastroParceiro = { ...dados, id, em: new Date().toISOString(), status: "novo", gerente: GERENTE_PADRAO, arquivos, base }
  await mudarConfig((d: Cfg) => ({ cadastrosParceiros: [cadastro, ...(d.cadastrosParceiros ?? [])].slice(0, 500) }))

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

export async function listarCadastros(): Promise<CadastroParceiro[]> {
  const { data: c } = await supabase.from("AppConfig").select("data").eq("id", 1).single()
  return ((c?.data ?? {}) as Cfg).cadastrosParceiros ?? []
}

export async function mudarStatus(id: string, status: CadastroParceiro["status"], fornecedorId?: string) {
  let antes: CadastroParceiro | undefined
  await mudarConfig((d: Cfg) => {
    antes = (d.cadastrosParceiros ?? []).find(x => x.id === id)
    return { cadastrosParceiros: (d.cadastrosParceiros ?? []).map(x => x.id === id ? { ...x, status, ...(fornecedorId ? { fornecedorId } : {}) } : x) }
  })
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
