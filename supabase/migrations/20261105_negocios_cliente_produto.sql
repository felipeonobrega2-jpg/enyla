-- Parceiros: venda com ganho em cima ou comissão, agora com o cliente, o produto e a quantidade
alter table "NegocioParceiro" add column if not exists "nomeCliente" text;
alter table "NegocioParceiro" add column if not exists "produto" text;
alter table "NegocioParceiro" add column if not exists "quantidade" numeric;
