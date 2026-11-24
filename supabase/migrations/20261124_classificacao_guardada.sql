-- Última classificação feita pela IA, guardada na conversa (perfil, quantidade_total, motivo, evidencia, recorrente,
-- fornecedor + hora). Só aditiva: o atendimento reaproveita quando o cliente não escreveu nada depois.
ALTER TABLE whatsapp_conversas ADD COLUMN IF NOT EXISTS classificacao_guardada JSONB;
