# Padrão visual e de formatação

Toda tela nova (e toda correção de tela) segue este padrão. Não se cria estilo próprio.

## Idioma, data e moeda

- Tudo em **pt-BR**, fuso **America/Sao_Paulo**. Nunca nome de mês ou dia em inglês na tela.
- Use só o helper `app/lib/formato.ts`:
  - `formatarData(v, { formato: "curta" | "longa", ano? })` → `30/11` ou `30 de novembro`.
  - `formatarIntervaloDatas(de, ate)` → `25/11 a 30/11`.
  - `formatarMoeda(n)` → `R$ 1.000,00`.
- Proibido `toLocaleDateString()`, `toLocaleString()`, `toLocaleTimeString()` e `Intl.DateTimeFormat()` sem locale. O teste `tests/padraoLocale.test.ts` falha no CI se aparecer. Texto para pessoa usa `'pt-BR'`; `sv-SE`/`en-CA` só para gerar `AAAA-MM-DD` interno.
- Nunca mostrar data ISO crua (`2026-11-30`) ao cliente.

## Reuso

- Para telas do cliente, siga a página de pedido existente (`app/pedido/[numero]`) e o acompanhamento (`app/track/[numero]`, `app/d/[id]/AcompanhamentoDigital.tsx`). Para telas internas, os componentes de `app/components`.
- Ícones: `lucide-react`. Tailwind, sem CSS novo; fontes vêm do `app/layout.tsx` e `app/globals.css`.
- Logo: o mesmo das outras telas (Enyla Embalagens); não recriar.

## Paleta (já usada nas telas do cliente)

- Roxo da marca `#8456e8`; verde de concluído/pago `#009351`.
- Texto `#191625`, secundário `#5e5c68`, apagado `#898892` / `#8E8E93`; fundo de cartão branco, cantos `rounded-2xl`.
- Links do cliente são sempre em tema claro.

## Tipografia e espaçamento

- Rótulo de seção: `text-[10.5px] uppercase tracking-wide font-bold text-[#8E8E93]`.
- Corpo `text-[13px]`; secundário `text-[12.5px]`; valores com `tabular-nums`.
- Cartões com `p-5` e `space-y-3` entre eles.
