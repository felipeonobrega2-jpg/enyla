import fs from 'fs'
import path from 'path'

export type TrackingEtapa = {
  coluna: number
  nome: string
  dataHora: string
}

export type TrackingEntry = {
  numero: string
  nomeCliente: string
  descricao: string
  materialNome: string
  quantidade: number
  preco: number
  colunaAtual: number
  etapas: TrackingEtapa[]
  criadoEm: string
  dataEntregaPrevista?: string
}

const STORE_PATH = path.join(process.cwd(), '.tracking-store.json')

export function lerStore(): Record<string, TrackingEntry> {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

function escreverStore(store: Record<string, TrackingEntry>): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

export function upsertTracking(entry: TrackingEntry): void {
  const store = lerStore()
  store[entry.numero] = entry
  escreverStore(store)
}

export function getTracking(numero: string): TrackingEntry | null {
  return lerStore()[numero] ?? null
}
