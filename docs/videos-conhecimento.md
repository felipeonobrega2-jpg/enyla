# Vídeos do Felipe → conhecimento vivo

Tudo atrás de `AppConfig.videosConhecimento.ativo` (padrão **false**; o Felipe liga em Configurações, ou o campo `videosConhecimento: { ativo: true }` no AppConfig). Desligado, o comportamento do sistema não muda.

## Fluxo
1. O Felipe manda um **vídeo** no chat "você mesmo" do número da ENYLA (ou do número pessoal `agenteAuto.avisoNumero`). Entrada: `talvezAssistente` (`app/lib/assistente.ts`), que só aceita mensagem do próprio Felipe.
2. `obterMidia` baixa/guarda a mídia. O vídeo vai **direto** para a Groq (aceita mp4 e extrai o áudio; não há ffmpeg no servidor). Até 24 MB vai o arquivo; de 24 a 100 MB, a Groq baixa por link assinado (`url`). Acima de 100 MB, o Felipe recebe aviso para mandar um mais curto. Transcrição: `whisper-large-v3-turbo`, `verbose_json`, segmentos com início e fim.
3. Transcrição inteira guardada em `videos_felipe` (`fonte='video'`, `link` para a mídia, segmentos com minutagem). Migração aditiva: `supabase/migrations/20261128_videos_felipe.sql`, a rodar no Supabase antes de ligar a chave.
4. A IA resume em regras curtas por área (comercial, marketing, produção, financeiro). Cada regra vai para `conhecimentoDiretoria` do diretor da área (CCO, CMO, COO, CFO), o mesmo lugar do `guardar_conhecimento` (aparece em `?o=conhecimento`), com a origem "vídeo de DD/MM" e o link.
5. `[CORTE]`: trechos de **15 a 45 s** (preço de referência, produção, história de cliente, resposta a objeção). Trecho fora dessa faixa é descartado. Expostos em `GET /api/externo?o=videos` (só chaves da CMO e do CTO). **Nada é publicado**: a Lívia prepara até 3 cortes por semana e o Felipe aprova antes.
6. O Felipe recebe no próprio chat: "Vídeo recebido, N regras guardadas".

## O que não faz
Não manda nada a cliente, não publica, não apaga, não mexe em cobrança. Sem chave nova (usa `groqKey` e `apiKey` já existentes).

## Limites conhecidos
- O webhook (`messages.upsert`) grava `videoMessage`, e `obterMidia` baixa pelo id da mensagem no Evolution. Não foi possível conferir ao vivo, neste ambiente, que o Evolution devolve a mídia do vídeo no chat "você mesmo". Se não devolver, a mensagem de erro chega ao Felipe e a alternativa é a pasta do Drive "ENYLA/Videos do Felipe" (só documentada; nenhuma credencial nova foi criada).
- A tabela `registro_felipe` (registro único das decisões e conversas) ainda não existe no repositório. `videos_felipe` usa os mesmos campos (`fonte`, `link`) para migrar depois.
- Só vídeo nesta versão; áudio longo fica para depois.
- O processamento roda após a resposta do webhook (`maxDuration` de 60 s): vídeos muito longos podem estourar esse tempo.

## Custo
Groq `whisper-large-v3-turbo`: **US$ 0,04 por hora de áudio**, mínimo cobrado de **10 s por pedido** (console.groq.com/docs/speech-to-text, lido em 25/11/2026). Um vídeo de 10 min custa cerca de US$ 0,007. Mais uma chamada da IA de resumo por vídeo (medidor de IA, origem `videos`).
