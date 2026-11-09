-- Depois que o site e o sistema publicarem com os nomes novos (cartuxo_*): apaga os atalhos antigos.
drop view if exists caixaria_pedidos, caixaria_chapas, caixaria_chapa_lugares, caixaria_facas, caixaria_config;
notify pgrst, 'reload schema';
