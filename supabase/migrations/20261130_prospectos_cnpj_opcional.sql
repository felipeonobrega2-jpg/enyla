-- Prospector: o CNPJ deixa de ser obrigatório (acabadoras com celular não têm CNPJ publicado).
-- Aditiva: só remove o NOT NULL. Não apaga nem altera nenhum dado. Pode rodar de novo.
-- A regra de 14 dígitos (prospectos_parceiros_cnpj) segue valendo quando o CNPJ vem preenchido (check com NULL passa)
-- e o índice único continua impedindo CNPJ repetido (NULL não conflita com NULL).
alter table prospectos_parceiros alter column cnpj drop not null;
