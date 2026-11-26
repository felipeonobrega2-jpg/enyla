# Perfil diretor: criar usuário e ligar bloqueios

Decisão do Felipe, 26/11/2026. Cada diretor (CMO, CFO, CCO, COO, CTO) entra com usuário e senha próprios, perfil **diretor**.
O diretor tem acesso total, igual ao admin, **menos** o que um interruptor bloquear. Os 7 interruptores nascem **desligados**.

## Criar o usuário de um diretor

1. Entre em `/login` com a senha de acesso de sempre (campo usuário vazio). Você entra como **admin**.
2. Abra `/usuarios`.
3. Em **Criar usuário** preencha: usuário (ex.: `cmo`), nome, senha (mínimo 10 caracteres) e perfil **diretor**. Clique em **Criar**.
4. Passe o usuário e a senha ao diretor por um canal seguro. Para trocar a senha ou desativar, use os botões na lista.
5. O diretor entra em `/login` preenchendo **usuário** e **senha**.

Nenhum usuário ou senha existe no código nem na migration: só a tela cria. A senha é guardada como hash (bcrypt).

## Os 7 interruptores (seção "Bloqueios do perfil diretor" em `/usuarios`)

Ligar um interruptor faz o servidor responder **403** com mensagem clara ao diretor naquela ação. Não precisa de novo deploy. Só o admin liga e desliga.

| Interruptor | Barra o diretor em |
|---|---|
| apagar | qualquer `DELETE` |
| financeiro | escrever em lançamentos, caixa, gastos, banco e recebíveis digitais |
| cobranca | gerar link de Pix e mexer na conta Asaas |
| preco | custos, chapas e facas do cartuxo; campos `materiais`, `custos`, `multiplicadores`, `fornecedores` da configuração |
| configuracao | usuários, chaves (Groq, Gemini), token da Meta, acesso externo, conexão do WhatsApp |
| mensagem_externa | envio direto de WhatsApp (`enviar`, `enviar-cliente`, `reativacao`, `atender`), envio do Prospector e aviso a fornecedor |
| meta | campanha digital (campanha, verba, anúncio) |

A leitura nunca é barrada. A ordem ao funcionário (`ordenar_funcionario`) não envia nada direto e segue liberada.

A rota `/api/config` salva a configuração inteira. O servidor compara com o que está salvo e conta só os campos que mudaram de verdade.

## Auditoria

Toda alteração feita por um diretor (e toda tentativa barrada) grava quem, quando, método, caminho, o **antes** e o **depois**
em `dados_sistema` (coleção `auditoria_diretor`). Veja as últimas 100 em `/usuarios`. Se o registro não puder ser gravado, a alteração do diretor **não passa** (erro 503).

Limite: o "antes" vem da leitura do mesmo endereço (`GET`) quando a rota tem leitura. Em rotas `POST` sem leitura, o "antes" fica vazio e o "depois" é o corpo enviado.
