# Configurar dados online do Metal & Forma

O site continua público no GitHub Pages. O painel do proprietário usa Supabase Auth; clientes enviam pedidos sem criar conta. Os dados financeiros e os cadastros do painel ficam privados para a conta autorizada em `mf_workshop_members`. A chave pública `anon`/publishable pode ficar no código do site porque as regras RLS deste projeto controlam o acesso. Nunca use a chave `service_role` no site.

## Estado atual

- O site está apontado para o mesmo projeto Supabase do Gestão de Barbearia usando a chave pública publishable.
- As tabelas `mf_*`, as políticas de acesso e o bucket `mf-portfolio-images` foram criados no projeto.
- A conta do proprietário foi autorizada na tabela privada do Metal & Forma. Os registros da Barbearia usam tabelas diferentes e não são lidos pelo site.

## No painel Supabase

1. Para configurar outro projeto, abra **Authentication → Users** e crie o usuário do proprietário com o e-mail dele e uma senha forte. O site não oferece cadastro público de acesso ao painel.
2. Abra **SQL Editor → New query**. Copie `supabase/schema.sql`, substitua `OWNER_EMAIL` pelo e-mail do usuário criado e execute. O script limita as tabelas de gestão a esse usuário e habilita a vitrine pública e o recebimento de orçamentos.
3. Em **Project Settings → API Keys** (ou no botão **Connect**), copie **Project URL** e **anon / publishable key**. Não copie `service_role` ou secret key.
4. Cole os dois valores em `supabase-config.js` nos campos `url` e `anonKey`.
5. Publique o site atualizado. Acesse a área do profissional, entre com o usuário do proprietário e confira os dados em dois dispositivos.

## Dados que são salvos

- Clientes, agenda, projetos, lançamentos financeiros, configurações e histórico de orçamentos: linha privada em `mf_workshop_state`.
- Pedidos públicos enviados pelo formulário: tabela `mf_quote_requests`, visível apenas ao proprietário.
- Projetos adicionados ao portfólio e suas imagens: tabela `mf_portfolio_items` e bucket público `mf-portfolio-images`.

No primeiro login do proprietário, o site migra os registros reais do navegador atual para a nuvem e ignora dados marcados como exemplos. As imagens de portfólio escolhidas nesse navegador também são copiadas para o armazenamento online. Os pedidos de orçamento do formulário passam a aparecer na caixa de entrada dentro de **Projetos**.
