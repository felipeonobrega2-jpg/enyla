// Parceiros ENYLA: cadastro público de quem presta serviço (impressão, acabamento, corte e vinco, colagem, faca…).
// Cada serviço tem as perguntas técnicas que a operação precisa (formato da máquina, materiais, tipos), o jeito de
// cobrar e o tempo médio de entrega (ou "não consigo mensurar"). O endereço vem pelo CEP e vira a base dele no
// mapa (de onde levamos e buscamos material). Puro: tipos, opções e validação (formulário e servidor usam os mesmos).
import type { FornecedorProducao, Servico } from "./producao"
import type { Endereco } from "./frete"

export type IdServicoParceiro =
  | "impressaoOffset" | "impressaoDigital" | "laminacao" | "verniz" | "hotStamping" | "relevo"
  | "corteVinco" | "colagem" | "faca" | "papel" | "arte" | "fechamento" | "transporte" | "outro"

export const SERVICOS_PARCEIRO: { id: IdServicoParceiro; nome: string; dica: string; servico?: Servico }[] = [
  { id: "impressaoOffset", nome: "Impressão offset", dica: "Folhas impressas em máquina offset", servico: "impressao" },
  { id: "impressaoDigital", nome: "Impressão digital", dica: "Tiragens curtas, cartão e adesivo" },
  { id: "laminacao", nome: "Laminação", dica: "Fosca, brilho, soft touch", servico: "laminacao" },
  { id: "verniz", nome: "Verniz", dica: "UV total, localizado, com relevo", servico: "verniz" },
  { id: "hotStamping", nome: "Hot stamping", dica: "Dourado, prata, holográfico", servico: "hotStamping" },
  { id: "relevo", nome: "Relevo / baixo-relevo", dica: "Seco ou americano" },
  { id: "corteVinco", nome: "Corte e vinco", dica: "Corte com faca e vinco", servico: "corteVinco" },
  { id: "colagem", nome: "Colagem", dica: "Manual ou em coladeira", servico: "colagem" },
  { id: "faca", nome: "Fabricação de faca", dica: "Facas de corte e vinco" },
  { id: "papel", nome: "Papel e cartão", dica: "Venda de papel, cartão, kraft" },
  { id: "arte", nome: "Criação de arte", dica: "Design de embalagem", servico: "arte" },
  { id: "fechamento", nome: "Fechamento de arquivo", dica: "Pré-impressão, prova, CTP", servico: "fechamento" },
  { id: "transporte", nome: "Transporte / frete", dica: "Leva e traz material" },
  { id: "outro", nome: "Outro serviço", dica: "Conta pra gente qual" },
]

// ── Perguntas técnicas por serviço (todas opcionais: quanto mais, melhor a gente encaixa os pedidos) ──
export type TipoPergunta = "multi" | "um" | "simnao" | "numero" | "formato"
export type Pergunta = { id: string; rotulo: string; dica?: string; tipo: TipoPergunta; opcoes?: string[]; unidade?: string; max?: number }
export type Formato = { l: number; a: number }   // cm
export type Resposta = string | string[] | number | boolean | Formato

const CLICHE = ["Eu faço o clichê", "Uso o que mandarem", "Mando fazer fora"]
const FORMATO_MAX = (rotulo = "Qual o maior formato?", dica = "A maior folha que a máquina aceita, em cm"): Pergunta => ({ id: "formatoMax", rotulo, dica, tipo: "formato" })

export const PERGUNTAS: Record<IdServicoParceiro, Pergunta[]> = {
  impressaoOffset: [
    { id: "cores", rotulo: "Quantas cores a máquina imprime de uma vez?", tipo: "um", opcoes: ["1 cor", "2 cores", "4 cores", "5 cores", "6 cores ou mais"] },
    FORMATO_MAX(),
    { id: "gramaturaMax", rotulo: "Gramatura máxima", tipo: "numero", unidade: "g/m²", max: 1000 },
    { id: "materiais", rotulo: "Materiais que imprime", tipo: "multi", opcoes: ["Cartão triplex", "Cartão duplex", "Kraft", "Couché", "Papel offset", "Metalizado", "Adesivo"] },
    { id: "corEspecial", rotulo: "Imprime cor especial (Pantone)?", tipo: "simnao" },
    { id: "chapa", rotulo: "E a chapa (CTP)?", tipo: "um", opcoes: ["Inclusa no preço", "Cobro à parte", "Mando fazer fora"] },
    { id: "tiragemMin", rotulo: "Tiragem mínima", tipo: "numero", unidade: "folhas", max: 1_000_000 },
  ],
  impressaoDigital: [
    FORMATO_MAX(),
    { id: "gramaturaMax", rotulo: "Gramatura máxima", tipo: "numero", unidade: "g/m²", max: 1000 },
    { id: "materiais", rotulo: "Materiais que imprime", tipo: "multi", opcoes: ["Cartão", "Kraft", "Couché", "Adesivo de papel", "Adesivo vinil", "Metalizado"] },
    { id: "frenteVerso", rotulo: "Imprime frente e verso?", tipo: "simnao" },
    { id: "corteEletronico", rotulo: "Faz corte ou meio-corte eletrônico (plotter)?", tipo: "simnao" },
  ],
  laminacao: [
    { id: "tipos", rotulo: "Tipos de laminação", tipo: "multi", opcoes: ["Fosca", "Brilho", "Soft touch", "Holográfica", "Metalizada"] },
    FORMATO_MAX(),
    { id: "lados", rotulo: "Lamina", tipo: "um", opcoes: ["Só um lado", "Os dois lados"] },
  ],
  verniz: [
    { id: "tipos", rotulo: "Tipos de verniz", tipo: "multi", opcoes: ["UV total", "UV localizado", "Com relevo (3D)", "Base água", "Fosco/brilho seletivo"] },
    FORMATO_MAX(),
    { id: "tela", rotulo: "Faz a tela/clichê do localizado?", tipo: "simnao" },
  ],
  hotStamping: [
    { id: "fitas", rotulo: "Cores de fita", tipo: "multi", opcoes: ["Dourado", "Prata", "Holográfico", "Cobre / rosé", "Preto", "Outras cores"] },
    FORMATO_MAX("Área máxima de gravação", "O maior tamanho de gravação por batida, em cm"),
    { id: "cliche", rotulo: "Clichê", tipo: "um", opcoes: CLICHE },
    { id: "comRelevo", rotulo: "Faz hot com relevo junto?", tipo: "simnao" },
  ],
  relevo: [
    { id: "tipos", rotulo: "Tipos", tipo: "multi", opcoes: ["Relevo seco", "Baixo-relevo", "Relevo americano", "Relevo com hot"] },
    FORMATO_MAX("Área máxima", "Em cm"),
    { id: "cliche", rotulo: "Clichê", tipo: "um", opcoes: CLICHE },
  ],
  corteVinco: [
    { id: "maquina", rotulo: "Tipo de máquina", tipo: "um", opcoes: ["Automática (Bobst ou similar)", "Plana / Minerva", "Laser ou plotter"] },
    FORMATO_MAX(),
    { id: "materiais", rotulo: "Materiais que corta", tipo: "multi", opcoes: ["Cartão até 350 g", "Cartão acima de 350 g", "Micro-ondulado", "Papelão ondulado", "Adesivo"] },
    { id: "faca", rotulo: "Faca", tipo: "um", opcoes: ["Fabrico a faca", "Uso a faca que mandarem", "Mando fazer fora"] },
    { id: "destaque", rotulo: "Faz o destaque (tirar o refile)?", tipo: "simnao" },
  ],
  colagem: [
    { id: "modo", rotulo: "Como cola", tipo: "um", opcoes: ["Manual", "Coladeira automática", "Os dois"] },
    { id: "tipos", rotulo: "Tipos de caixa que cola", tipo: "multi", opcoes: ["Cartucho (cola lateral)", "Fundo automático", "Fundo 4 ou 6 pontos", "Berço / interno", "Com visor (janela)", "Display"] },
    { id: "porDia", rotulo: "Quantas caixas por dia, em média", tipo: "numero", unidade: "caixas/dia", max: 10_000_000 },
  ],
  faca: [
    { id: "arquivos", rotulo: "Arquivos que recebe", tipo: "multi", opcoes: ["DXF", "PDF", "AI", "CDR"] },
    { id: "tipo", rotulo: "Tipo de faca", tipo: "um", opcoes: ["Plana (lâmina em madeira)", "Rotativa", "As duas"] },
    { id: "montada", rotulo: "Entrega a faca pronta para a máquina (com borracha)?", tipo: "simnao" },
  ],
  papel: [
    { id: "tipos", rotulo: "O que vende", tipo: "multi", opcoes: ["Cartão triplex", "Cartão duplex", "Kraft", "Couché", "Papel offset", "Adesivo", "Papelão"] },
    { id: "gramaturas", rotulo: "Gramaturas", tipo: "multi", opcoes: ["até 200 g", "250 g", "300 g", "350 g", "400 g ou mais"] },
    { id: "formatos", rotulo: "Formatos", tipo: "multi", opcoes: ["66 × 96", "77 × 113", "Bobina", "Corta no formato"] },
    { id: "entrega", rotulo: "Entrega no endereço?", tipo: "simnao" },
  ],
  arte: [
    { id: "programas", rotulo: "Programas", tipo: "multi", opcoes: ["Illustrator", "CorelDRAW", "Photoshop", "ArtiosCAD / Esko"] },
    { id: "dieline", rotulo: "Monta a planificação (faca/dieline)?", tipo: "simnao" },
    { id: "mockup", rotulo: "Faz mockup 3D?", tipo: "simnao" },
  ],
  fechamento: [
    { id: "entregas", rotulo: "O que entrega", tipo: "multi", opcoes: ["Fechamento de arquivo", "Prova de cor", "Imposição", "Chapa (CTP)"] },
  ],
  transporte: [
    { id: "veiculos", rotulo: "Veículos", tipo: "multi", opcoes: ["Moto", "Carro", "Utilitário / Fiorino", "Van", "Caminhão"] },
    { id: "regiao", rotulo: "Onde atende", tipo: "multi", opcoes: ["Mesma cidade", "Região metropolitana", "Interior do estado", "Outros estados"] },
    { id: "cargaKg", rotulo: "Carga por viagem", tipo: "numero", unidade: "kg", max: 100_000 },
  ],
  outro: [],
}

export type FormaCobranca = "milheiro" | "folha" | "unidade" | "m2" | "acertoMilheiro" | "trabalho" | "hora" | "kg" | "tabela" | "varia"
export const FORMAS_COBRANCA: { id: FormaCobranca; nome: string; unidade: string | null }[] = [
  { id: "milheiro", nome: "Por milheiro", unidade: "por mil" },
  { id: "acertoMilheiro", nome: "Acerto + milheiro", unidade: "por mil (+ acerto)" },
  { id: "folha", nome: "Por folha", unidade: "por folha" },
  { id: "unidade", nome: "Por unidade", unidade: "por unidade" },
  { id: "m2", nome: "Por m²", unidade: "por m²" },
  { id: "kg", nome: "Por kg", unidade: "por kg" },
  { id: "hora", nome: "Por hora", unidade: "por hora" },
  { id: "trabalho", nome: "Valor fechado por trabalho", unidade: "por trabalho" },
  { id: "tabela", nome: "Tenho uma tabela", unidade: null },
  { id: "varia", nome: "Depende do pedido", unidade: null },
]

export type ServicoCadastrado = {
  id: IdServicoParceiro
  qual?: string                    // "outro": qual serviço
  tecnico?: Record<string, Resposta>
  cobranca: FormaCobranca | null
  valor?: number | null
  acerto?: number | null
  prazoDias: number | null         // dias úteis em média
  prazoVaria: boolean              // "não consigo mensurar agora"
  minimo?: string
  obs?: string
  precosExemplo?: Record<string, number>   // R$ por cenário-exemplo respondido (id do cenário, ver cenariosParceiros.ts)
  cenarioVersoes?: Record<string, number>  // versão do enunciado que o parceiro viu, por cenário
}

// Ids dos cenários-exemplo de cada serviço (estrutura fixa; só o texto e a referência são editáveis).
// Impressão não tem cenário: cobra acerto + milheiro. Fica aqui, e não em cenariosParceiros.ts, para o formulário
// público não carregar os preços e nomes de referência.
export const CENARIOS_IDS: Record<IdServicoParceiro, string[]> = {
  impressaoOffset: [], impressaoDigital: [], laminacao: ["laminacao-fosca", "laminacao-brilho", "laminacao-soft", "laminacao-dois-lados"],
  verniz: ["verniz"], hotStamping: ["hotStamping"], relevo: ["relevo"], corteVinco: ["corteVinco"], colagem: ["colagem"], faca: ["faca"],
  papel: ["papel"], arte: ["arte-unitaria", "arte-pacote3"], fechamento: ["fechamento"], transporte: ["transporte"], outro: [],
}
export const ROTULO_PRECO_CENARIO: Record<string, string> = { "arte-unitaria": "Preço por arte (R$)", "arte-pacote3": "Preço do pacote de 3 artes (R$)" }
export const cobraPorAcertoMilheiro = (id: IdServicoParceiro) => id === "impressaoOffset" || id === "impressaoDigital"
const formatoOk = (f: unknown) => !!f && typeof f === "object" && Number((f as Formato).l) > 0 && Number((f as Formato).a) > 0

export type CadastroParceiro = {
  id: string
  em: string
  status: "novo" | "aprovado" | "recusado"
  gerente: string
  // empresa
  nomeFantasia: string
  razaoSocial?: string
  documento: string
  tipoDocumento: "cnpj" | "cpf"
  // base (onde levamos e buscamos material)
  cep: string
  rua: string
  numero: string
  complemento?: string
  bairro: string
  cidade: string
  uf: string
  referencia?: string              // ponto de referência / como chegar
  base?: Endereco | null           // geocodificado no envio (para o frete)
  // contato
  responsavel: string
  whatsapp: string
  email: string
  contatoProducao?: string
  // serviços
  servicos: ServicoCadastrado[]
  // operação
  capacidade?: string
  horario?: string
  maquinas?: string
  arquivos: { nome: string; url: string }[]
  comoConheceu?: string
  aceite: boolean
  fornecedorId?: string
  emails?: { tipo: "recebido" | "aprovado"; em: string; ok: boolean; erro?: string }[]
}

export const GERENTE_PADRAO = "Felipe"

const soDigitos = (s: string) => (s ?? "").replace(/\D/g, "")

export function cnpjValido(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false
  const dv = (base: string, pesos: number[]) => { const s = base.split("").reduce((t, d, i) => t + Number(d) * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s }
  const d1 = dv(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return c.endsWith(`${d1}${d2}`)
}
export function cpfValido(v: string): boolean {
  const c = soDigitos(v)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => { const s = c.slice(0, n).split("").reduce((t, d, i) => t + Number(d) * (n + 1 - i), 0) * 10 % 11; return s === 10 ? 0 : s }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}
export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e ?? "").trim())
export const whatsappValido = (w: string) => { const d = soDigitos(w).replace(/^55(?=\d{10,11}$)/, ""); return d.length === 10 || d.length === 11 }
export const cepValido = (c: string) => soDigitos(c).length === 8

export function mascaraDocumento(v: string, tipo: "cnpj" | "cpf") {
  const d = soDigitos(v).slice(0, tipo === "cnpj" ? 14 : 11)
  return tipo === "cnpj"
    ? d.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2")
    : d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}
export function mascaraTelefone(v: string) {
  const d = soDigitos(v).replace(/^55(?=\d{10,11}$)/, "").slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ""
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
export const mascaraCep = (v: string) => soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2")

export const ETAPAS_IDS = ["empresa", "endereco", "contato", "servicos", "detalhes", "final"] as const
export type Etapa = typeof ETAPAS_IDS[number]
export function errosDaEtapa(c: Partial<CadastroParceiro>, etapa: Etapa): Record<string, string> {
  const e: Record<string, string> = {}
  if (etapa === "empresa") {
    if (!c.nomeFantasia?.trim()) e.nomeFantasia = "Como sua empresa é conhecida?"
    if (c.tipoDocumento === "cpf" ? !cpfValido(c.documento ?? "") : !cnpjValido(c.documento ?? "")) e.documento = c.tipoDocumento === "cpf" ? "Confira o CPF" : "Confira o CNPJ"
  }
  if (etapa === "endereco") {
    if (!cepValido(c.cep ?? "")) e.cep = "CEP com 8 números"
    if (!c.rua?.trim()) e.rua = "Qual a rua?"
    if (!c.numero?.trim()) e.numero = "Número (ou s/n)"
    if (!c.bairro?.trim()) e.bairro = "Qual o bairro?"
    if (!c.cidade?.trim()) e.cidade = "Qual a cidade?"
    if (!/^[A-Za-z]{2}$/.test(c.uf ?? "")) e.uf = "UF"
  }
  if (etapa === "contato") {
    if (!c.responsavel?.trim()) e.responsavel = "Com quem a gente fala?"
    if (!whatsappValido(c.whatsapp ?? "")) e.whatsapp = "WhatsApp com DDD"
    if (!emailValido(c.email ?? "")) e.email = "Confira o e-mail"
  }
  if (etapa === "servicos" && !(c.servicos?.length)) e.servicos = "Escolha pelo menos um serviço"
  if (etapa === "detalhes") for (const s of c.servicos ?? []) {
    if (s.id === "outro" && !s.qual?.trim()) e[`${s.id}.qual`] = "Qual serviço?"
    if (cobraPorAcertoMilheiro(s.id)) {
      if (!formatoOk(s.tecnico?.formatoMax)) e[`${s.id}.formatoMax`] = "Informe o formato da máquina"
      if (!(Number(s.acerto) > 0)) e[`${s.id}.acerto`] = "Informe o acerto"
      if (!(Number(s.valor) > 0)) e[`${s.id}.valor`] = "Informe o valor do milheiro"
    } else {
      for (const cid of CENARIOS_IDS[s.id] ?? []) if (!(Number(s.precosExemplo?.[cid]) > 0)) e[`${s.id}.preco.${cid}`] = "Informe o preço para este exemplo"
      if (!s.cobranca) e[`${s.id}.cobranca`] = "Escolha uma das opções"
    }
    if (!s.prazoVaria && !(s.prazoDias && s.prazoDias > 0 && s.prazoDias <= 120)) e[`${s.id}.prazo`] = "Informe o prazo médio ou marque que varia"
  }
  if (etapa === "final" && !c.aceite) e.aceite = "Precisa concordar para enviar"
  return e
}
export const errosDoCadastro = (c: Partial<CadastroParceiro>) => ETAPAS_IDS.reduce((t, et) => ({ ...t, ...errosDaEtapa(c, et) }), {} as Record<string, string>)

// Respostas técnicas: só as perguntas que existem, dentro das opções e de tamanhos razoáveis
export function limparTecnico(id: IdServicoParceiro, t: unknown): Record<string, Resposta> | undefined {
  if (!t || typeof t !== "object") return undefined
  const out: Record<string, Resposta> = {}
  for (const p of PERGUNTAS[id] ?? []) {
    const v = (t as Record<string, unknown>)[p.id]
    if (v == null || v === "") continue
    if (p.tipo === "multi" && Array.isArray(v)) { const xs = v.filter(x => p.opcoes?.includes(String(x))).map(String); if (xs.length) out[p.id] = xs }
    else if (p.tipo === "um" && p.opcoes?.includes(String(v))) out[p.id] = String(v)
    else if (p.tipo === "simnao" && typeof v === "boolean") out[p.id] = v
    else if (p.tipo === "numero") { const n = Number(v); if (Number.isFinite(n) && n > 0 && n <= (p.max ?? 1e7)) out[p.id] = Math.round(n * 100) / 100 }
    else if (p.tipo === "formato" && typeof v === "object") {
      const f = v as Partial<Formato>, l = Number(f.l), a = Number(f.a)
      if (Number.isFinite(l) && Number.isFinite(a) && l > 0 && a > 0 && l <= 300 && a <= 300) out[p.id] = { l: Math.round(l * 10) / 10, a: Math.round(a * 10) / 10 }
    }
  }
  return Object.keys(out).length ? out : undefined
}

// Preços e versões só dos cenários que existem para o serviço
function limparExemplos(s: Partial<ServicoCadastrado> & { id: IdServicoParceiro }): Pick<ServicoCadastrado, "precosExemplo" | "cenarioVersoes"> {
  const precos: Record<string, number> = {}, versoes: Record<string, number> = {}
  for (const cid of CENARIOS_IDS[s.id] ?? []) {
    const k = Number(s.precosExemplo?.[cid]), v = Number(s.cenarioVersoes?.[cid])
    if (!Number.isFinite(k) || k <= 0 || k > 10_000_000) continue
    precos[cid] = Math.round(k * 100) / 100
    if (Number.isInteger(v) && v > 0) versoes[cid] = v
  }
  return { ...(Object.keys(precos).length ? { precosExemplo: precos } : {}), ...(Object.keys(versoes).length ? { cenarioVersoes: versoes } : {}) }
}

export function limparCadastro(x: Partial<CadastroParceiro>): Omit<CadastroParceiro, "id" | "em" | "status" | "gerente" | "arquivos" | "base"> {
  const t = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max)
  const n = (v: unknown, max: number) => { const k = Number(v); return Number.isFinite(k) && k > 0 && k <= max ? Math.round(k * 100) / 100 : null }
  const ids = new Set(SERVICOS_PARCEIRO.map(s => s.id)), formas = new Set(FORMAS_COBRANCA.map(f => f.id))
  return {
    nomeFantasia: t(x.nomeFantasia, 120), razaoSocial: t(x.razaoSocial, 160) || undefined,
    tipoDocumento: x.tipoDocumento === "cpf" ? "cpf" : "cnpj", documento: soDigitos(x.documento ?? "").slice(0, 14),
    cep: soDigitos(x.cep ?? "").slice(0, 8), rua: t(x.rua, 160), numero: t(x.numero, 20), complemento: t(x.complemento, 80) || undefined,
    bairro: t(x.bairro, 80), cidade: t(x.cidade, 80), uf: t(x.uf, 2).toUpperCase(), referencia: t(x.referencia, 200) || undefined,
    responsavel: t(x.responsavel, 100), whatsapp: soDigitos(x.whatsapp ?? "").slice(-13), email: t(x.email, 160).toLowerCase(),
    contatoProducao: t(x.contatoProducao, 160) || undefined,
    servicos: (x.servicos ?? []).filter(s => ids.has(s.id)).slice(0, 20).map(s => ({
      id: s.id, qual: s.id === "outro" ? t(s.qual, 80) : undefined, tecnico: limparTecnico(s.id, s.tecnico),
      cobranca: cobraPorAcertoMilheiro(s.id) ? "acertoMilheiro" as const : s.cobranca && formas.has(s.cobranca) ? s.cobranca : null,
      valor: n(s.valor, 1_000_000), acerto: n(s.acerto, 1_000_000),
      prazoDias: s.prazoVaria ? null : n(s.prazoDias, 120), prazoVaria: !!s.prazoVaria,
      minimo: t(s.minimo, 120) || undefined, obs: t(s.obs, 600) || undefined,
      ...limparExemplos(s),
    })),
    capacidade: t(x.capacidade, 300) || undefined, horario: t(x.horario, 160) || undefined, maquinas: t(x.maquinas, 600) || undefined,
    comoConheceu: t(x.comoConheceu, 200) || undefined, aceite: !!x.aceite,
  }
}

export const nomeServico = (s: ServicoCadastrado) => s.id === "outro" ? (s.qual || "Outro") : SERVICOS_PARCEIRO.find(x => x.id === s.id)?.nome ?? s.id
export const textoPrazo = (s: ServicoCadastrado) => s.prazoVaria ? "varia muito (sem média)" : s.prazoDias ? `${s.prazoDias} ${s.prazoDias === 1 ? "dia útil" : "dias úteis"}` : "—"
export const textoExemplos = (s: ServicoCadastrado) => {
  const v = Object.values(s.precosExemplo ?? {})
  return v.length ? ` · exemplo${v.length > 1 ? "s" : ""} ${v.map(x => x.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })).join(", ")}` : ""
}
export function textoCobranca(s: ServicoCadastrado) {
  const f = FORMAS_COBRANCA.find(x => x.id === s.cobranca)
  if (!f) return "—"
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  if (s.cobranca === "acertoMilheiro" && (s.valor || s.acerto)) return `${s.acerto ? `acerto ${brl(s.acerto)} + ` : ""}${s.valor ? `${brl(s.valor)} por mil` : "milheiro"}`
  return s.valor && f.unidade ? `${brl(s.valor)} ${f.unidade}` : f.nome
}
export function textoResposta(p: Pergunta, v: Resposta): string {
  if (p.tipo === "formato" && typeof v === "object" && !Array.isArray(v)) return `${String((v as Formato).l).replace(".", ",")} × ${String((v as Formato).a).replace(".", ",")} cm`
  if (Array.isArray(v)) return v.join(", ")
  if (typeof v === "boolean") return v ? "sim" : "não"
  if (typeof v === "number") return `${v.toLocaleString("pt-BR")}${p.unidade ? ` ${p.unidade}` : ""}`
  return String(v)
}
// "Formato máximo: 66 × 96 cm · Cores: 4 cores · …"
export const textoTecnico = (s: ServicoCadastrado) =>
  (PERGUNTAS[s.id] ?? []).filter(p => s.tecnico?.[p.id] != null).map(p => `${p.rotulo.replace(/\?$/, "")}: ${textoResposta(p, s.tecnico![p.id])}`).join(" · ")
export const textoEndereco = (c: Pick<CadastroParceiro, "rua" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "cep">) =>
  `${c.rua}, ${c.numero}${c.complemento ? ` (${c.complemento})` : ""} · ${c.bairro} · ${c.cidade}/${c.uf} · CEP ${mascaraCep(c.cep)}`

// Aprovado: vira fornecedor de produção (prazo, contato, base no mapa e a máquina de impressão, se informada)
export function paraFornecedor(c: CadastroParceiro, id: string): FornecedorProducao {
  const prazos = c.servicos.map(s => s.prazoDias).filter((d): d is number => !!d)
  const resumo = c.servicos.map(s => [`${nomeServico(s)}: ${textoCobranca(s)} · ${textoPrazo(s)}${s.minimo ? ` · mínimo ${s.minimo}` : ""}${textoExemplos(s)}`, textoTecnico(s)].filter(Boolean).join(" · ")).join(" | ")
  const offset = c.servicos.find(s => s.id === "impressaoOffset")
  const fmax = offset?.tecnico?.formatoMax as Formato | undefined
  return {
    id, nome: c.nomeFantasia, ativo: true, servicos: {}, frete: 0,
    prazoDias: prazos.length ? Math.max(...prazos) : 5,
    obs: `Cadastro Parceiros ENYLA (${new Date(c.em).toLocaleDateString("pt-BR")}): ${resumo}`.slice(0, 2000),
    contato: c.contatoProducao || c.responsavel, telefone: c.whatsapp, email: c.email,
    ...(c.base ? { endereco: c.base } : {}),
    ...(fmax ? { maquina: { nome: `${String(offset?.tecnico?.cores ?? "Offset")} ${fmax.l}×${fmax.a}`, largura: Math.round(fmax.l * 10), altura: Math.round(fmax.a * 10), pinca: 10, margem: 5 } } : {}),
  }
}
