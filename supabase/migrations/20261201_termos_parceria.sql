-- Termos de Parceria ENYLA, versionados. Só aditiva: cria a tabela e o registro inicial (versão 0.3, RASCUNHO). Nada é apagado nem alterado.
-- Para publicar o texto final: inserir uma nova linha com versao nova e rascunho = false (o servidor lê a de maior vigente_desde que já começou). Sem deploy.
-- O texto usa {servicos} no item 1: o sistema troca pela lista de serviços do formulário /parceiros.
create table if not exists termos_parceria (
  versao         text primary key,
  titulo         text not null,
  texto          text not null,
  rascunho       boolean not null default true,
  vigente_desde  timestamptz not null default now(),
  criado_em      timestamptz not null default now()
);
alter table termos_parceria enable row level security;   -- só o servidor (chave de serviço) acessa

insert into termos_parceria (versao, titulo, texto, rascunho, vigente_desde) values (
  '0.3',
  'Termos de Parceria ENYLA, versão 0.3, aguardando revisão de advogado',
  E'1. Objeto. A ENYLA encaminha à Parceira, conforme a demanda dos seus clientes, os serviços oferecidos no cadastro de parceiros, entre eles: {servicos}, e outros serviços informados no cadastro, como manuseio e montagem. Cada serviço é combinado por pedido.\n2. Cadastro. O cadastro é gratuito. Não há exclusividade: a Parceira segue atendendo os próprios clientes normalmente.\n3. Volume. A ENYLA não garante quantidade mínima nem frequência de pedidos.\n4. Preço e prazo. A Parceira informa preço e prazo de cada serviço, ou deixa cadastrados um preço de referência e um prazo médio, que dão prioridade na distribuição dos pedidos.\n5. Pagamento. 50% antes do início do serviço e 50% na retirada, por PIX, em conta de mesma titularidade do CNPJ ou CPF cadastrado. O adiantamento é pago somente para chave na mesma titularidade do CNPJ ou CPF do cadastro.\n6. Logística. Retirada e entrega do material são de responsabilidade da ENYLA. A Parceira entrega o serviço pronto somente à ENYLA ou a quem ela indicar. Quando a Parceira presta o próprio serviço de transporte, segue as instruções do pedido.\n7. Não aliciamento. Durante a parceria e por 24 meses após o último serviço, a Parceira não pode procurar, oferecer serviços, orçar ou atender, direta ou indiretamente (por sócios, funcionários ou outra empresa), nenhum cliente que conheceu por meio da ENYLA. Isso inclui clientes cuja marca, arte ou material ela tenha recebido em pedido da ENYLA.\n8. Multa. Cada cliente abordado ou atendido em violação da cláusula 7 gera multa equivalente ao faturamento desse cliente com a ENYLA nos 12 meses anteriores à violação, com valor mínimo de R$ 10.000,00 por cliente, sem prejuízo de perdas e danos.\n9. Confidencialidade. Artes, marcas, quantidades, preços e qualquer informação dos pedidos são confidenciais. A Parceira não pode copiar, divulgar, fotografar para portfólio nem usar esse material fora do serviço.\n10. Identificação. A Parceira não coloca etiqueta, nota, cartão ou qualquer identificação própria no material.\n11. Qualidade e material. Serviço com defeito causado pela Parceira é refeito sem custo, no prazo que a ENYLA indicar. Material da ENYLA perdido ou estragado pela Parceira é ressarcido pelo custo, valor que pode ser descontado dos 50% da retirada.\n12. Aceite. O aceite é registrado no cadastro com data, hora e versão destes termos. Quem se cadastrou antes desta versão aceita antes do primeiro pedido. Parceiras que já prestam serviço à ENYLA aceitam pelo mesmo link, sem interrupção dos pedidos em andamento.\n13. Foro. [Comarca a definir.]',
  true, now()
) on conflict (versao) do nothing;
