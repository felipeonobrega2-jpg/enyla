// Substitui next/image fora do Next (só para as telas de conferência)
export default function Imagem(p: { src: string; alt: string; className?: string }) {
  return <img src={`../../../public${p.src}`} alt={p.alt} className={p.className} />
}
