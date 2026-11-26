import { redirect } from "next/navigation"
import { auth } from "@/auth"
import UsuariosView from "./UsuariosView"

// Tela de administração: só o papel admin entra (servidor). Diretor volta para a página inicial.
export default async function Page() {
  const s = await auth()
  if (s?.papel !== "admin") redirect("/")
  return <UsuariosView />
}
