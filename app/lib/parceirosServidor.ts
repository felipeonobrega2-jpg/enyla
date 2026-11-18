// Parceiros ENYLA no servidor: recebe o cadastro público (com tabela de preços / orçamento de exemplo), guarda no
// AppConfig e avisa você. Aprovar/recusar é pela tela Fornecedores (só a equipe).
import { supabase } from "./supabase"
import { mudarConfig } from "./configAtomica"
import { notificar, LINK_SISTEMA } from "./notificar"
import { limparCadastro, errosDoCadastro, nomeServico, textoPrazo, GERENTE_PADRAO, type CadastroParceiro } from "./parceiros"

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

  const cadastro: CadastroParceiro = { ...dados, id, em: new Date().toISOString(), status: "novo", gerente: GERENTE_PADRAO, arquivos }
  await mudarConfig((d: Cfg) => ({ cadastrosParceiros: [cadastro, ...(d.cadastrosParceiros ?? [])].slice(0, 500) }))

  // Aviso para você (celular e WhatsApp)
  const servicos = cadastro.servicos.map(nomeServico).join(", ")
  await notificar("Novo parceiro cadastrado", `${cadastro.nomeFantasia} · ${cadastro.cidade}/${cadastro.uf} · ${servicos}`.slice(0, 180), { prioridade: "alta", link: `${LINK_SISTEMA}/?aba=fornecedores`, tags: ["handshake"] }).catch(() => null)
  try {
    const { evo } = await import("./evolution")
    const { seuNumero } = await import("./agenteAuto")
    const destino = (cfg.agenteAuto?.avisoNumero ?? "").replace(/\D/g, "") || await seuNumero()
    if (destino) {
      const linhas = cadastro.servicos.map(s => `• ${nomeServico(s)} · ${textoPrazo(s)}`)
      const texto = [`🤝 *Novo parceiro: ${cadastro.nomeFantasia}*`, `${cadastro.cidade}/${cadastro.uf} · ${cadastro.responsavel}`, `wa.me/55${cadastro.whatsapp.replace(/^55/, "")}`, ...linhas, arquivos.length ? `📎 ${arquivos.length} arquivo(s) com preços` : "", `${LINK_SISTEMA}/?aba=fornecedores`].filter(Boolean).join("\n")
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
  await mudarConfig((d: Cfg) => ({ cadastrosParceiros: (d.cadastrosParceiros ?? []).map(x => x.id === id ? { ...x, status, ...(fornecedorId ? { fornecedorId } : {}) } : x) }))
}
