import { describe, it, expect } from "vitest"
import { sugerir, daPluggy, aprender, chaveContraparte, TxBanco } from "@/app/lib/banco"
import type { LancamentoFinanceiro } from "@/app/types"
import type { Fornecedor } from "@/app/config"

const tx = (p: Partial<TxBanco>): TxBanco => ({ id: "t1", conta_id: "c", conta_nome: "Santander", data: "2026-11-03", valor: 100, tipo: "saida", descricao: "PIX ENVIADO", contraparte_nome: null, contraparte_doc: null, categoria_pluggy: null, estado: "pendente", lancamento_ids: [], sugestao: null, historico: [], ...p })
const lanc = (p: Partial<LancamentoFinanceiro>): LancamentoFinanceiro => ({ id: "l1", tipo: "despesa", descricao: "Papel", valor: 100, dataVencimento: "2026-11-02", status: "pago", dataPagamento: "2026-11-02", criadoEm: "", ...p })
const jerograf: Fornecedor = { id: "jero", nome: "Jerograf", categoria: "grafica", ativo: true, conta: true }
const base = { pedidos: [], fornecedores: [jerograf], regras: [], jaVinculados: new Set<string>() }

describe("banco → lançamentos sem bagunçar o manual", () => {
  it("já lançado à mão: vincula, não cria", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({})] })).toMatchObject({ acao: "vincular", lancamentoId: "l1" })
  })
  it("lançado como pendente: dá baixa com a data do banco", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({ status: "pendente", dataPagamento: undefined })] }))
      .toMatchObject({ acao: "atualizar", campos: { status: "pago", dataPagamento: "2026-11-03" } })
  })
  it("dois iguais, um no mesmo dia do banco: é ele (vincula sem perguntar)", () => {
    const r = sugerir({ ...base, tx: tx({ tipo: "entrada", data: "2026-11-11" }), lancamentos: [lanc({ id: "a", tipo: "receita", dataPagamento: "2026-11-09" }), lanc({ id: "b", tipo: "receita", dataPagamento: "2026-11-11" })] })
    expect(r).toMatchObject({ acao: "vincular", lancamentoId: "b" })
  })
  it("pagador conhecido: mesmo valor até 10 dias; senão, parte de um maior no mesmo dia", () => {
    const memoria = { pagadores: { "bianca maria": "Maurício" } }
    const t = tx({ tipo: "entrada", valor: 1000, data: "2026-09-26", contraparte_nome: "Bianca Maria" })
    const l = (p: Partial<LancamentoFinanceiro>) => lanc({ tipo: "receita", nomeCliente: "Maurício", ...p })
    expect(sugerir({ ...base, memoria, tx: t, lancamentos: [l({ id: "x", valor: 1000, dataPagamento: "2026-09-21" })] })).toMatchObject({ acao: "vincular", lancamentoId: "x" })
    expect(sugerir({ ...base, memoria, tx: { ...t, valor: 280, data: "2026-09-11" }, lancamentos: [l({ id: "y", valor: 1280, dataPagamento: "2026-09-11" })] })).toMatchObject({ acao: "escolher", candidatos: ["y"] })
    expect(sugerir({ ...base, tx: t, lancamentos: [l({ id: "x", valor: 1000, dataPagamento: "2026-09-21" })] })?.acao).not.toBe("vincular")
  })
  it("dois iguais: pergunta qual; já vinculado a outra transação não conta", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({}), lanc({ id: "l2" })] })).toMatchObject({ acao: "escolher" })
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({}), lanc({ id: "l2" })], jaVinculados: new Set(["l2"]) })).toMatchObject({ acao: "vincular", lancamentoId: "l1" })
  })
  it("data longe ou valor diferente: não vincula", () => {
    expect(sugerir({ ...base, tx: tx({ data: "2026-11-20" }), lancamentos: [lanc({})] })?.acao).not.toBe("vincular")
    expect(sugerir({ ...base, tx: tx({ valor: 101 }), lancamentos: [lanc({})] })?.acao).not.toBe("vincular")
  })
  it("custo na conta do fornecedor nunca casa com saída do banco (não passou pelo banco)", () => {
    expect(sugerir({ ...base, tx: tx({}), lancamentos: [lanc({ formaPagamento: "conta" })] })?.acao).not.toBe("vincular")
  })
  it("Pix para a Jerograf: sai do caixa (custo no DRE) e abate a conta (receita na conta)", () => {
    const s = sugerir({ ...base, tx: tx({ contraparte_nome: "JEROGRAF GRAFICA LTDA", valor: 2000 }), lancamentos: [] })
    expect(s).toMatchObject({ acao: "criar", origem: "conta" })
    const ls = s && s.acao === "criar" ? s.lancamentos : []
    expect(ls[0]).toMatchObject({ tipo: "despesa", categoria: "pagamento-fornecedor", formaPagamento: "pix", fornecedorId: "jero", valor: 2000 })
    expect(ls[1]).toMatchObject({ tipo: "receita", formaPagamento: "conta", fornecedorId: "jero", valor: 2000 })
  })
  it("pagamento da conta já lançado à mão: vincula", () => {
    const manual = lanc({ id: "aj", tipo: "receita", formaPagamento: "conta", fornecedorId: "jero", valor: 2000 })
    expect(sugerir({ ...base, tx: tx({ contraparte_nome: "Jerograf", valor: 2000 }), lancamentos: [manual] })).toMatchObject({ acao: "vincular", lancamentoId: "aj" })
  })
  it("Pix para você: distribuição de lucros (não some); a sua regra vale primeiro; rendimento e aplicação", () => {
    const meu = ["48970391851"]
    expect(sugerir({ ...base, tx: tx({ contraparte_doc: "48970391851", contraparte_nome: "Luiz Felipe" }), lancamentos: [], documentosProprios: meu }))
      .toMatchObject({ acao: "criar", lancamentos: [{ tipo: "despesa", categoria: "salarios", subcategoria: "Distribuição de Lucros" }] })
    const t = tx({ contraparte_doc: "48970391851" })
    const regras = aprender([], t, { acao: "lancar", categoria: "salarios", subcategoria: "Folha Salarial" })
    expect(sugerir({ ...base, regras, tx: t, lancamentos: [], documentosProprios: meu })).toMatchObject({ acao: "criar", origem: "regra", lancamentos: [{ subcategoria: "Folha Salarial" }] })
    expect(sugerir({ ...base, tx: tx({ tipo: "entrada", valor: 0.08, descricao: "REMUNERACAO APLICACAO AUTOMATICA" }), lancamentos: [] }))
      .toMatchObject({ acao: "criar", lancamentos: [{ tipo: "receita", categoria: "outros", subcategoria: "Rendimento" }] })
    expect(sugerir({ ...base, tx: tx({ descricao: "APLICACAO AUTOMATICA" }), lancamentos: [] })).toMatchObject({ acao: "ignorar" })
  })
  it("correção vira regra e vale na próxima", () => {
    const t = tx({ contraparte_nome: "Papelaria Brás", contraparte_doc: "11222333000144", valor: 350 })
    const regras = aprender([], t, { acao: "lancar", categoria: "materiais", descricao: "Papel" })
    expect(sugerir({ ...base, regras, tx: { ...t, id: "t2", valor: 420 }, lancamentos: [] })).toMatchObject({ acao: "criar", origem: "regra" })
    const de2 = aprender(regras, t, { acao: "lancar", categoria: "materiais" })
    expect(de2).toHaveLength(1)
    expect(de2[0].vezes).toBe(2)
  })
  it("Pluggy → formato do sistema", () => {
    const t = daPluggy({ id: "x", accountId: "a", date: "2026-11-03T10:00:00.000Z", description: "PIX RECEBIDO", amount: 250, type: "CREDIT", paymentData: { payer: { name: "Ana Cosméticos", documentNumber: { value: "12.345.678/0001-90" } } } }, "Inter")
    expect(t).toMatchObject({ tipo: "entrada", valor: 250, contraparte_nome: "Ana Cosméticos", contraparte_doc: "12345678000190", data: "2026-11-03" })
    expect(daPluggy({ id: "y", accountId: "a", date: "2026-11-03", amount: -80, description: "Compra" }, null).tipo).toBe("saida")
    expect(chaveContraparte({ contraparte_doc: null, contraparte_nome: "Gráfica X", descricao: "" })).toBe("grafica x")
  })
})

describe("banco aprende subcategoria, conta e forma", async () => {
  const { aprenderConta, contaDoBanco, subcategoriaValida, completarSugestao } = await import("@/app/lib/banco")
  const cats = [{ id: "insumos", subcategorias: ["Papel", "Tinta"] }, { id: "aluguel" }]
  it("a regra guarda subcategoria, conta e forma, e sugere com elas", () => {
    const t = tx({ contraparte_nome: "Papelaria Exemplo" })
    const regras = aprender([], t, { acao: "lancar", categoria: "insumos", subcategoria: "Papel", contaId: "itau", formaPagamento: "pix" })
    expect(regras[0]).toMatchObject({ subcategoria: "Papel", contaId: "itau", formaPagamento: "pix" })
    const sg = sugerir({ ...base, tx: t, lancamentos: [], regras })
    expect(sg).toMatchObject({ acao: "criar", origem: "regra", lancamentos: [{ categoria: "insumos", subcategoria: "Papel", formaPagamento: "pix" }] })
    expect(completarSugestao(sg!, t, regras, undefined, cats)).toMatchObject({ lancamentos: [{ subcategoria: "Papel", contaId: "itau" }] })
  })
  it("conta do banco → conta do sistema pelo que mais se repete", () => {
    let m = aprenderConta({}, "pluggy-1", "santander")
    m = aprenderConta(m, "pluggy-1", "santander")
    m = aprenderConta(m, "pluggy-1", "caixa")
    expect(contaDoBanco(m, "pluggy-1")).toBe("santander")
    expect(contaDoBanco(m, "outra")).toBeUndefined()
  })
  it("subcategoria da IA só vale se existe na categoria (sem diferença de acento/maiúscula)", () => {
    expect(subcategoriaValida(["Papel", "Tinta"], "papel")).toBe("Papel")
    expect(subcategoriaValida(["Papel"], "Cola")).toBeUndefined()
    const sg = { acao: "criar" as const, origem: "ia" as const, motivo: "", lancamentos: [{ tipo: "despesa" as const, categoria: "insumos", subcategoria: "Inventada", valor: 10 }] }
    const r = completarSugestao(sg, tx({ conta_id: "pluggy-1" }), [], { "pluggy-1": { santander: 3 } }, cats)
    expect(r).toMatchObject({ lancamentos: [{ contaId: "santander" }] })
    expect((r as { lancamentos: { subcategoria?: string }[] }).lancamentos[0].subcategoria).toBeUndefined()
  })
})

describe("regra confiável lança sozinha", async () => {
  const { regraConfiavel, aceitouSemMudar, zerarConfianca, REGRA_CONFIAVEL } = await import("@/app/lib/banco")
  const t = tx({ contraparte_nome: "Papelaria Exemplo" })
  const dec = { acao: "lancar" as const, categoria: "insumos", subcategoria: "Papel" }
  it("3 aceitas seguidas sem mudar = lança sozinha; mudar zera; automático mantém", () => {
    let r = aprender([], t, dec)                       // você lançou à mão
    expect(r[0].seguidas).toBe(0)
    for (let i = 0; i < REGRA_CONFIAVEL; i++) r = aprender(r, t, dec, "mais")
    expect(regraConfiavel(r[0])).toBe(true)
    r = aprender(r, t, dec, "mantem")
    expect(r[0].seguidas).toBe(3)
    r = aprender(r, t, { ...dec, subcategoria: "Tinta" })
    expect(regraConfiavel(r[0])).toBe(false)
    r = aprender(r, t, dec, "mais"); r = aprender(r, t, dec, "mais"); r = aprender(r, t, dec, "mais")
    expect(regraConfiavel(zerarConfianca(r, t)[0])).toBe(false)
    expect(regraConfiavel({ acao: "ignorar" })).toBe(true)
  })
  it("aceitou sem mudar compara categoria, subcategoria, fornecedor e conta", () => {
    const sg = { acao: "criar" as const, origem: "regra" as const, motivo: "", lancamentos: [{ categoria: "insumos", subcategoria: "Papel", contaId: "itau", valor: 10 }] }
    expect(aceitouSemMudar(sg, [{ categoria: "insumos", subcategoria: "Papel", contaId: "itau", valor: 10, descricao: "outra" }])).toBe(true)
    expect(aceitouSemMudar(sg, [{ categoria: "insumos", subcategoria: "Tinta", contaId: "itau", valor: 10 }])).toBe(false)
    expect(aceitouSemMudar(sg, [{ categoria: "insumos" }, { categoria: "insumos" }])).toBe(false)
  })
})

describe("custo do fornecedor → pedido pelo previsto do motor", async () => {
  const { pedidoDoCusto } = await import("@/app/lib/calibragem")
  const cfgBase = { fornecedores: [{ id: "fv", nome: "Facas e Vincos Exemplo", categoria: "corte", ativo: true }], producao: undefined } as never
  const ped = (numero: string, fechado: string, despesas: LancamentoFinanceiro[] = []) =>
    ({ pedido: { numero, nomeCliente: "Cliente " + numero, tipo: "card", cards: [{ id: "c" + numero }], dataFechamento: fechado, despesas } as never, comp: { corteVinco: 480 }, porFornecedor: { fv: 480 } })
  it("liga ao único pedido com o previsto perto do valor", () => {
    const r = pedidoDoCusto({ valor: 470, data: "2026-11-10" }, { fornecedorId: "fv", descricao: "Corte e vinco" }, [ped("ORC-1", "2026-11-05"), { ...ped("ORC-2", "2026-11-05"), porFornecedor: { fv: 900 }, comp: { corteVinco: 900 } }], cfgBase)
    expect(r?.pedido.numero).toBe("ORC-1")
    expect(r?.previsto).toBe(480)
  })
  it("dois pedidos parecidos, fechado depois do pagamento ou custo já lançado: não liga", () => {
    expect(pedidoDoCusto({ valor: 470, data: "2026-11-10" }, { fornecedorId: "fv" }, [ped("ORC-1", "2026-11-05"), ped("ORC-2", "2026-11-06")], cfgBase)).toBeNull()
    expect(pedidoDoCusto({ valor: 470, data: "2026-11-01" }, { fornecedorId: "fv" }, [ped("ORC-1", "2026-11-05")], cfgBase)).toBeNull()
    expect(pedidoDoCusto({ valor: 470, data: "2026-11-10" }, { fornecedorId: "fv" }, [ped("ORC-1", "2026-11-05", [lanc({ fornecedorId: "fv" })])], cfgBase)).toBeNull()
  })
})

describe("aviso de duplicado ao lançar", async () => {
  const { possiveisDuplicados, duplicadosNoLote } = await import("@/app/lib/banco")
  const t = tx({ id: "tx9", valor: 300, data: "2026-11-11", contraparte_nome: "Luiz Felipe Nobrega", descricao: "PIX ENVIADO Luiz Felipe" })
  it("lançado à mão, mesmo valor e dia (±1) e parecido (categoria ou nome): avisa", () => {
    expect(possiveisDuplicados(t, [lanc({ valor: 300, dataPagamento: "2026-11-12", descricao: "Retirada Felipe" })])).toHaveLength(1)
    expect(possiveisDuplicados(t, [lanc({ valor: 300, dataPagamento: "2026-11-11", descricao: "Pró-labore", categoria: "salarios" })], "salarios")).toHaveLength(1)
  })
  it("não avisa: outro gasto com o mesmo valor, longe da data, veio do banco, outro tipo", () => {
    expect(possiveisDuplicados(t, [lanc({ valor: 300, dataPagamento: "2026-11-11", descricao: "Gasolina", categoria: "transporte" })], "salarios")).toHaveLength(0)
    expect(possiveisDuplicados(t, [lanc({ valor: 300, dataPagamento: "2026-11-14", descricao: "Retirada Felipe" })])).toHaveLength(0)
    expect(possiveisDuplicados(t, [lanc({ valor: 300, dataPagamento: "2026-11-11", descricao: "Retirada Felipe", obs: "conc:outra" })])).toHaveLength(0)
    expect(possiveisDuplicados(t, [lanc({ valor: 300, dataPagamento: "2026-11-11", descricao: "Retirada Felipe", tipo: "receita" })])).toHaveLength(0)
  })
  it("no lote: dois Pix iguais no mesmo dia são duas transferências de verdade (não avisa)", () => {
    const r = duplicadosNoLote([{ tx: { ...t, id: "a" } }, { tx: { ...t, id: "b" } }], [])
    expect(r).toHaveLength(0)
  })
})

describe("vínculos por soma", async () => {
  const { vinculosPorSoma } = await import("@/app/lib/banco")
  it("rateio: um Pix paga 5 lançamentos iguais do mesmo dia (sozinho)", () => {
    const ls = Array.from({ length: 5 }, (_, i) => lanc({ id: `c${i}`, descricao: "Colagem", valor: 194, dataPagamento: "2026-09-18" }))
    const r = vinculosPorSoma([tx({ id: "p", valor: 970, data: "2026-09-18" })], ls)
    expect(r.porTx.get("p")).toMatchObject({ acao: "vincularVarios" })
    expect((r.porTx.get("p") as { lancamentoIds: string[] }).lancamentoIds).toHaveLength(5)
    expect(r.rateioAutomatico.has("p")).toBe(true)
  })
  it("junto: dois Pix somam um lançamento", () => {
    const r = vinculosPorSoma([tx({ id: "a", tipo: "entrada", valor: 1000, data: "2026-09-11" }), tx({ id: "b", tipo: "entrada", valor: 280, data: "2026-09-11" })],
      [lanc({ id: "m", tipo: "receita", descricao: "Lote MAU-003", valor: 1280, dataPagamento: "2026-09-11" })])
    expect(r.porTx.get("a")).toMatchObject({ acao: "vincular", lancamentoId: "m", junto: ["b"] })
    expect(r.porTx.get("b")).toMatchObject({ acao: "vincular", lancamentoId: "m", junto: ["a"] })
  })
  it("quase igual (até 5%) no mesmo dia: pergunta; combinação ambígua: não sugere", () => {
    const q = vinculosPorSoma([tx({ id: "l", valor: 106.34, data: "2026-10-08" })], [lanc({ id: "x", valor: 105.15, dataPagamento: "2026-10-08" })])
    expect(q.porTx.get("l")).toMatchObject({ acao: "escolher", candidatos: ["x"] })
    const amb = vinculosPorSoma(Array.from({ length: 5 }, (_, i) => tx({ id: `g${i}`, valor: 50, data: "2026-10-28" })), [lanc({ id: "gas", descricao: "Gasolina", valor: 100, dataPagamento: "2026-10-28" })])
    expect(amb.porTx.size).toBe(0)
  })
})

describe("regras do histórico (o que você já vinculou ou lançou)", () => {
  it("quem caiu 2+ vezes na mesma categoria vira regra, com a subcategoria tirada do nome", async () => {
    const { regrasDoHistorico } = await import("@/app/lib/banco")
    const ls = [lanc({ id: "a", tipo: "receita", descricao: "Comissão Venda Frascos", categoria: "comissoes" }), lanc({ id: "b", tipo: "receita", descricao: "Comissão Frascos Ana", categoria: "comissoes" }), lanc({ id: "c", tipo: "receita", descricao: "Comissão Bia", categoria: "comissoes" })]
    const res = [tx({ tipo: "entrada", contraparte_nome: "ACME EMBALAGENS", lancamento_ids: ["a"] }), tx({ tipo: "entrada", contraparte_nome: "ACME EMBALAGENS", lancamento_ids: ["b"] }), tx({ tipo: "entrada", contraparte_nome: "ACME EMBALAGENS", lancamento_ids: ["c"] })]
    const [r] = regrasDoHistorico(res, ls, [], [{ id: "comissoes", subcategorias: ["Frascos", "Indicação"] }])
    expect(r).toMatchObject({ acao: "lancar", categoria: "comissoes", subcategoria: "Frascos", seguidas: 0, vezes: 3 })
    const sg = sugerir({ tx: tx({ tipo: "entrada", valor: 316.8, contraparte_nome: "ACME EMBALAGENS" }), lancamentos: [], pedidos: [], fornecedores: [], regras: [r], jaVinculados: new Set() })
    expect(sg).toMatchObject({ acao: "criar", origem: "regra", lancamentos: [{ tipo: "receita", categoria: "comissoes", subcategoria: "Frascos" }] })
  })
  it("não vira regra: uma vez só, categorias diferentes, pedido de cliente ou regra que você já ensinou", async () => {
    const { regrasDoHistorico } = await import("@/app/lib/banco")
    const ls = [lanc({ id: "a", categoria: "x" }), lanc({ id: "b", categoria: "y" }), lanc({ id: "c", categoria: "x", loteNumero: "L-1" }), lanc({ id: "d", categoria: "x", loteNumero: "L-2" })]
    const t = (nome: string, id: string) => tx({ contraparte_nome: nome, lancamento_ids: [id] })
    expect(regrasDoHistorico([t("UMA VEZ", "a")], ls, [])).toEqual([])
    expect(regrasDoHistorico([t("MISTURA", "a"), t("MISTURA", "b")], ls, [])).toEqual([])
    expect(regrasDoHistorico([t("CLIENTE", "c"), t("CLIENTE", "d")], ls, [])).toEqual([])
    expect(regrasDoHistorico([t("ENSINADA", "a"), t("ENSINADA", "a")], ls, [{ chave: chaveContraparte(t("ENSINADA", "a")), tipo: "saida", acao: "ignorar", vezes: 1 }])).toEqual([])
  })
})

describe("devoluções (PIX DEVOLVIDO / estorno)", () => {
  it("Pix que foi e voltou inteiro: as duas pontas são ignoradas; cada compra serve a uma devolução", async () => {
    const { paresDeDevolucao } = await import("@/app/lib/banco")
    const c1 = tx({ id: "c1", valor: 70.26, contraparte_doc: "111", descricao: "PIX ENVIADO", data: "2026-09-25" })
    const c2 = tx({ id: "c2", valor: 70.26, contraparte_doc: "111", descricao: "PIX ENVIADO", data: "2026-09-25" })
    const d1 = tx({ id: "d1", tipo: "entrada", valor: 70.26, contraparte_doc: "111", descricao: "PIX DEVOLVIDO", data: "2026-09-25" })
    const pares = paresDeDevolucao([c1, c2, d1])
    expect(pares.size).toBe(2)   // uma compra fica sem par (não foi devolvida)
    const base = { lancamentos: [], pedidos: [], fornecedores: [], regras: [], jaVinculados: new Set<string>(), pares }
    expect(sugerir({ ...base, tx: d1 })).toMatchObject({ acao: "ignorar", motivo: expect.stringMatching(/^foi e voltou/) })
    const compra = pares.get("d1")!.outra.id
    expect(sugerir({ ...base, tx: compra === "c1" ? c1 : c2 })).toMatchObject({ acao: "ignorar" })
    expect(sugerir({ ...base, tx: compra === "c1" ? c2 : c1 })).toBeNull()
  })
  it("devolução parcial de compra já lançada vira estorno (Outros / Estorno)", async () => {
    const { paresDeDevolucao } = await import("@/app/lib/banco")
    const c = tx({ id: "c", valor: 279.18, contraparte_doc: "222", data: "2026-10-22", estado: "vinculada", lancamento_ids: ["l9"] })
    const d = tx({ id: "d", tipo: "entrada", valor: 274.07, contraparte_doc: "222", descricao: "PIX DEVOLVIDO Pix Marketplace", data: "2026-10-22" })
    const pares = paresDeDevolucao([c, d])
    const sg = sugerir({ tx: d, lancamentos: [lanc({ id: "l9", descricao: "Compra Mercado Livre" })], pedidos: [], fornecedores: [], regras: [], jaVinculados: new Set(["l9"]), pares })
    expect(sg).toMatchObject({ acao: "criar", origem: "devolucao", lancamentos: [{ tipo: "receita", categoria: "outros", subcategoria: "Estorno", descricao: "Estorno — Compra Mercado Livre", valor: 274.07 }] })
  })
})

describe("um Pix para o fornecedor que paga 4+ lançamentos dele no mesmo dia", () => {
  it("2 colagens + 2 cortes de dois lotes = o Pix", async () => {
    const { vinculosPorSoma } = await import("@/app/lib/banco")
    const d = { dataVencimento: "2026-10-27", dataPagamento: "2026-10-27", fornecedorId: "fab" }
    const ls = [lanc({ id: "a", descricao: "Colagem", valor: 975, loteNumero: "L1", ...d }), lanc({ id: "b", descricao: "Colagem", valor: 975, loteNumero: "L2", ...d }),
      lanc({ id: "c", descricao: "Corte e Vinco", valor: 318.5, loteNumero: "L1", ...d }), lanc({ id: "e", descricao: "Corte e Vinco", valor: 318.5, loteNumero: "L2", ...d })]
    const r = vinculosPorSoma([tx({ id: "p", valor: 2587, data: "2026-10-27" })], ls)
    expect(r.porTx.get("p")).toMatchObject({ acao: "vincularVarios", lancamentoIds: expect.arrayContaining(["a", "b", "c", "e"]) })
  })
})

it("soma de lançamentos diferentes não mistura fornecedores", async () => {
  const { vinculosPorSoma } = await import("@/app/lib/banco")
  const d = { dataVencimento: "2026-10-27", dataPagamento: "2026-10-27" }
  const ls = [lanc({ id: "a", descricao: "Colagem", valor: 975, fornecedorId: "fab", loteNumero: "L1", ...d }), lanc({ id: "b", descricao: "Colagem", valor: 975, fornecedorId: "fab", loteNumero: "L2", ...d }), lanc({ id: "c", descricao: "Corte", valor: 400, fornecedorId: "jac", ...d })]
  expect(vinculosPorSoma([tx({ id: "p", valor: 2350, data: "2026-10-27" })], ls).porTx.size).toBe(0)
})
