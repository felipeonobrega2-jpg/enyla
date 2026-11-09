-- Caixaria: acompanhamento do pedido depois de pago (briefing do logo, arte de cada caixa, aprovação, envio).
-- O site grava o briefing e a aprovação; o sistema grava a arte e o envio. Rodar uma vez no SQL Editor do Supabase.
alter table caixaria_pedidos add column if not exists acompanhamento jsonb not null default '{}'::jsonb;
