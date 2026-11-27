This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Extrato bancário: Pluggy e Openi juntas

A Pluggy segue no que está configurado. A Openi roda junto quando `OPENI_API_KEY` e `OPENI_CONTAS` existem na Vercel, mesmo com `bankFeedSource` em `pluggy` ou ausente (com `bankFeedSource = 'openi'` a Pluggy deixa de rodar). Sem essas envs nada muda. O webhook `/api/openi/webhook` (protegido por `OPENI_WEBHOOK_SECRET`) sincroniza a Openi nesse modo.

`OPENI_CONTAS` é um JSON só de **conta corrente** (cartão fica de fora), com ids fictícios aqui:

```json
[{"item":"<id do item>","conta":"<id da conta>","banco":"Itaú","aPartirDe":"2026-11-17"}]
```

`banco` (opcional) dá o nome da conta no cadastro, criada sozinha na primeira vez (Openi ou Pluggy), com o mapa `contasDoBanco` gravado para a conciliação não sugerir a conta de outro banco. `antesDe` / `aPartirDe` limitam o período de cada conta. Movimentos entram pelo id `openi:<id externo>` e nunca alteram linhas já existentes.
