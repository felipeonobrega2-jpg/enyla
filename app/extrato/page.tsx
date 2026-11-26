import UploadExtrato from "./UploadExtrato"

export default function ExtratoPage() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-xl font-semibold">Importar extrato (OFX)</h1>
      <p className="mb-4 text-sm text-gray-600">Baixe o .ofx no Internet Banking Santander Empresas e envie aqui. Só guarda os lançamentos para conciliação; não altera despesas nem recebimentos. Reenviar o mesmo período não duplica.</p>
      <UploadExtrato />
    </main>
  )
}
