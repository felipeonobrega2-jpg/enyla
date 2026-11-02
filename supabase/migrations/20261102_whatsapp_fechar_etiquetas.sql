-- Fechar conversas (some da lista e do funil; volta sozinha se o cliente escrever depois) e etiquetas por conversa.
alter table whatsapp_conversas add column if not exists fechada_em timestamptz;
alter table whatsapp_conversas add column if not exists etiquetas text[] not null default '{}';
