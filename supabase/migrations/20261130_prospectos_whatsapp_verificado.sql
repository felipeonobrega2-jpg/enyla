-- Prospector: marca o número que a Evolution confirmou ter WhatsApp (ação verificar_whatsapp da porta externa).
-- Só aditiva: uma coluna nova com padrão false. Não apaga nem altera dado existente.
-- Rodar ANTES de juntar o PR no SQL Editor do Supabase (o envio e a resposta de e-mail passam a ler a coluna). Pode rodar de novo.
alter table prospectos_parceiros add column if not exists whatsapp_verificado boolean not null default false;
