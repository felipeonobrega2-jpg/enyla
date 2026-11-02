// CEP + número → endereço completo e coordenadas (a Lalamove cota pela coordenada). Só roda no servidor.
// ViaCEP dá a rua; o OpenStreetMap (Nominatim, gratuito) dá a coordenada. Sem achar o número, usa a rua/CEP.

import { Endereco, textoEndereco } from "./frete"

const UA = { "User-Agent": "ENYLA-sistema/1.0 (enyla.com.br)", "Accept-Language": "pt-BR" }

async function nominatim(params: Record<string, string>) {
  const q = new URLSearchParams({ format: "json", limit: "1", countrycodes: "br", ...params })
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${q}`, { headers: UA }).catch(() => null)
  const j = r?.ok ? await r.json().catch(() => null) as { lat: string; lon: string }[] | null : null
  return j?.[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null
}

export async function enderecoPeloCep(cep: string, numero: string, complemento?: string): Promise<Endereco | { erro: string }> {
  const c = cep.replace(/\D/g, "")
  if (c.length !== 8) return { erro: "CEP precisa ter 8 dígitos." }
  const v = await fetch(`https://viacep.com.br/ws/${c}/json/`).then(r => r.json()).catch(() => null) as
    { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean } | null
  if (!v || v.erro) return { erro: "CEP não encontrado." }
  const partes = { cep: `${c.slice(0, 5)}-${c.slice(5)}`, rua: v.logradouro || undefined, numero: numero.trim() || undefined, complemento: complemento?.trim() || undefined, bairro: v.bairro || undefined, cidade: v.localidade, uf: v.uf }
  // Do mais preciso ao mais genérico
  const coord =
    (v.logradouro ? await nominatim({ street: `${numero} ${v.logradouro}`.trim(), city: v.localidade ?? "", state: v.uf ?? "", country: "Brasil" }) : null)
    ?? (v.logradouro ? await nominatim({ street: v.logradouro, city: v.localidade ?? "", state: v.uf ?? "", country: "Brasil" }) : null)
    ?? await nominatim({ postalcode: partes.cep, country: "Brasil" })
    ?? await nominatim({ q: [v.bairro, v.localidade, v.uf].filter(Boolean).join(", ") })
  if (!coord) return { erro: "Não achei esse endereço no mapa. Confira o CEP." }
  return { ...partes, texto: textoEndereco(partes), ...coord }
}
