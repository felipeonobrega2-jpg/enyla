import { describe, it, expect, vi } from "vitest"
import { paraFornecedor, completarFornecedor, servicosDoCadastro, type CadastroParceiro, type ServicoCadastrado } from "@/app/lib/parceiros"
import type { FornecedorProducao } from "@/app/lib/producao"

const sv = (o: Partial<ServicoCadastrado> & Pick<ServicoCadastrado, "id">): ServicoCadastrado => ({ cobranca: null, prazoDias: 3, prazoVaria: false, ...o })
const cad = (servicos: ServicoCadastrado[], extra: Partial<CadastroParceiro> = {}): CadastroParceiro => ({
  id: "PAR-T1", em: "2026-11-26T12:00:00Z", status: "novo", gerente: "Equipe", nomeFantasia: "Gráfica Fictícia", documento: "00000000000000", tipoDocumento: "cnpj",
  cep: "00000000", rua: "Rua A", numero: "1", bairro: "B", cidade: "C", uf: "SP", responsavel: "Fulano", whatsapp: "11900000000", email: "x@exemplo.test",
  servicos, arquivos: [], aceite: true, ...extra,
})
const offset = sv({ id: "impressaoOffset", cobranca: "acertoMilheiro", valor: 245, acerto: 1140, tecnico: { cores: "4 cores", formatoMax: { l: 72, a: 102 }, materiais: ["Cartão triplex"] } })

describe("paraFornecedor: serviços no motor", () => {
  it("impressão offset e digital → impressao, acerto_milheiro", () => {
    expect(servicosDoCadastro(cad([offset])).impressao).toEqual({ tipo: "acerto_milheiro", acerto: 1140, milheiro: 245 })
    const dig = sv({ id: "impressaoDigital", cobranca: "acertoMilheiro", valor: 80, acerto: 50 })
    expect(servicosDoCadastro(cad([dig])).impressao).toEqual({ tipo: "acerto_milheiro", acerto: 50, milheiro: 80 })
    expect(servicosDoCadastro(cad([dig, offset])).impressao?.milheiro).toBe(245)   // offset tem prioridade
  })
  it("impressão sem preço entra sem inventar valor e pede orçamento", () => {
    const r = servicosDoCadastro(cad([sv({ id: "impressaoOffset", cobranca: "acertoMilheiro" })])).impressao
    expect(r).toEqual({ tipo: "acerto_milheiro", orcarPorPedido: true })
  })
  it("formas de cobrança com valor: folha, m², unidade, trabalho", () => {
    const s = servicosDoCadastro(cad([
      sv({ id: "corteVinco", cobranca: "folha", valor: 0.12 }), sv({ id: "colagem", cobranca: "unidade", valor: 0.2 }),
      sv({ id: "fechamento", cobranca: "trabalho", valor: 150 }), sv({ id: "hotStamping", cobranca: "m2", valor: 3 }),
    ]))
    expect(s.corteVinco).toEqual({ tipo: "por_folha", valor: 0.12 })
    expect(s.colagem).toEqual({ tipo: "por_unidade", valor: 0.2 })
    expect(s.fechamento).toEqual({ tipo: "por_trabalho", valor: 150 })
    expect(s.hotStamping).toEqual({ tipo: "por_m2", valor: 3 })
  })
  it("preço de cenário-exemplo vira preço unitário; laminação vira precosPorTipo", () => {
    const s = servicosDoCadastro(cad([
      sv({ id: "laminacao", cobranca: "m2", precosExemplo: { "laminacao-fosca": 633.6, "laminacao-brilho": 760.32 } }),
      sv({ id: "verniz", cobranca: "folha", precosExemplo: { verniz: 450 } }),
      sv({ id: "arte", cobranca: "unidade", precosExemplo: { "arte-unitaria": 70 } }),
    ]))
    expect(s.laminacao).toEqual({ tipo: "por_m2", precosPorTipo: { Fosca: 1, Brilho: 1.2 } })
    expect(s.verniz).toEqual({ tipo: "por_folha", precosPorTipo: { "UV total": 0.15 } })
    expect(s.arte).toEqual({ tipo: "por_unidade", valor: 70 })
  })
  it("sem preço, tabela ou varia: entra na etapa com orcarPorPedido e sem valor", () => {
    const s = servicosDoCadastro(cad([
      sv({ id: "laminacao", cobranca: "varia" }), sv({ id: "corteVinco", cobranca: "tabela" }), sv({ id: "colagem", cobranca: "folha" }),
    ]))
    for (const k of ["laminacao", "corteVinco", "colagem"] as const) { expect(s[k]?.orcarPorPedido).toBe(true); expect(s[k]?.valor).toBeUndefined() }
  })
  it("prazo que varia mantém o preço e marca para orçar", () => {
    const r = servicosDoCadastro(cad([sv({ id: "corteVinco", cobranca: "folha", valor: 0.1, prazoDias: null, prazoVaria: true })])).corteVinco
    expect(r).toEqual({ tipo: "por_folha", valor: 0.1, orcarPorPedido: true })
  })
  it("sem correspondente no motor (faca, papel, relevo, outro) e transporte não viram serviço nem frete", () => {
    const f = paraFornecedor(cad([
      sv({ id: "faca", cobranca: "unidade", valor: 100 }), sv({ id: "papel" }), sv({ id: "relevo" }), sv({ id: "outro", qual: "Dobra" }),
      sv({ id: "transporte", cobranca: "unidade", valor: 50, prazoDias: 30 }),
    ]), "f-1")
    expect(f.servicos).toEqual({})
    expect(f.frete).toBe(0)
    expect(f.prazoDias).toBe(3)   // o prazo do transporte não conta
    expect(f.obs).toContain("Fabricação de faca")
    expect(f.obs).toContain("não vira frete")
  })
  it("texto de máquinas e dados técnicos não viram categoria; máquina só do formato da impressão", () => {
    const f = paraFornecedor(cad([offset], { maquinas: "Máquina de teste" }), "f-1")
    expect(Object.keys(f.servicos)).toEqual(["impressao"])
    expect(f.maquina).toMatchObject({ largura: 720, altura: 1020 })
    expect(f.maquina?.nome).not.toContain("Máquina de teste")
    expect(f.obs).toContain("Cartão triplex")
    const sem = paraFornecedor(cad([sv({ id: "corteVinco", cobranca: "folha", valor: 1 })], { maquinas: "Máquina de teste" }), "f-2")
    expect(sem.maquina).toBeUndefined()
  })
})

describe("completarFornecedor / reprocessamento", () => {
  const aprovado = cad([offset], { status: "aprovado", fornecedorId: "f-mwy0u4gw", id: "PAR-MWXNVNYS" })
  const gravado = (): FornecedorProducao => ({
    id: "f-mwy0u4gw", nome: "Gráfica Fictícia", ativo: true, servicos: {}, frete: 0, prazoDias: 3, contato: "Contato Teste", telefone: "11911112222",
    endereco: { texto: "Endereço de teste", lat: -23.5, lng: -46.6 }, obs: "obs gravada",
    maquina: { nome: "4 cores 102×72", largura: 1020, altura: 720, pinca: 10, margem: 5 },
  })
  it("caso PAR-MWXNVNYS → f-mwy0u4gw: preenche impressao e preserva o resto", () => {
    const antes = gravado()
    const depois = completarFornecedor(antes, aprovado)
    expect(depois.id).toBe("f-mwy0u4gw")
    expect(depois.servicos.impressao).toEqual({ tipo: "acerto_milheiro", acerto: 1140, milheiro: 245 })
    expect({ ...depois, servicos: {} }).toEqual(antes)
  })
  it("segunda rodada não muda nada e não apaga ajuste feito à mão", () => {
    const uma = completarFornecedor(gravado(), aprovado)
    expect(completarFornecedor(uma, aprovado)).toEqual(uma)
    const editado = { ...uma, servicos: { impressao: { tipo: "acerto_milheiro" as const, acerto: 1, milheiro: 2 }, laminacao: { tipo: "por_folha" as const, valor: 9 } } }
    const dep = completarFornecedor(editado, aprovado)
    expect(dep.servicos).toEqual(editado.servicos)
  })
})

describe("reprocessarCadastrosAprovados", () => {
  it("atualiza só aprovados com fornecedor, não cria duplicata e é idempotente", async () => {
    let cfg: Record<string, unknown> = {
      cadastrosParceiros: [
        cad([offset], { id: "PAR-MWXNVNYS", status: "aprovado", fornecedorId: "f-mwy0u4gw" }),
        cad([offset], { id: "PAR-NOVO", status: "novo" }),
        cad([offset], { id: "PAR-SEM", status: "aprovado", fornecedorId: "f-inexistente" }),
      ],
      producao: { fornecedores: [{ id: "f-mwy0u4gw", nome: "G", ativo: true, servicos: {}, frete: 0, prazoDias: 3 }, { id: "f-outro", nome: "O", ativo: true, servicos: {}, frete: 0, prazoDias: 5 }] },
    }
    vi.resetModules()
    vi.doMock("@/app/lib/configAtomica", () => ({
      mudarConfig: async (fn: (d: unknown) => Record<string, unknown> | null) => { const m = fn(cfg); if (m) cfg = { ...cfg, ...m }; return cfg },
      lerConfigLinha: async () => ({ data: { data: cfg } }),
    }))
    vi.doMock("@/app/lib/supabase", () => ({ supabase: {} }))
    vi.doMock("@/app/lib/notificar", () => ({ notificar: async () => null, LINK_SISTEMA: "" }))
    vi.doMock("@/app/lib/termosParceriaServidor", () => ({ lerTermosVigentes: async () => ({}), registroDeAceite: () => ({}) }))
    const { reprocessarCadastrosAprovados } = await import("@/app/lib/parceirosServidor")
    const r1 = await reprocessarCadastrosAprovados()
    expect(r1).toEqual({ aprovados: 2, atualizados: ["PAR-MWXNVNYS"], semFornecedor: ["PAR-SEM"] })
    const fs = (cfg.producao as { fornecedores: FornecedorProducao[] }).fornecedores
    expect(fs.map(f => f.id)).toEqual(["f-mwy0u4gw", "f-outro"])
    expect(fs[0].servicos.impressao).toEqual({ tipo: "acerto_milheiro", acerto: 1140, milheiro: 245 })
    expect(fs[1].servicos).toEqual({})
    const r2 = await reprocessarCadastrosAprovados()
    expect(r2.atualizados).toEqual([])
    expect((cfg.producao as { fornecedores: FornecedorProducao[] }).fornecedores).toEqual(fs)
    vi.doUnmock("@/app/lib/configAtomica")
  })
})
