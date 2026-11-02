-- Confirmação de entrega/leitura das mensagens do WhatsApp (✓ enviada, ✓✓ entregue, ✓✓ azul lida).
-- Preenchida pelo evento messages.update do Evolution (app/lib/whatsappEventos.ts).
alter table whatsapp_mensagens add column if not exists status text;
