## Objetivo

Transformar o modelo atual (1 dono → várias empresas) em um modelo onde cada sócio tem login próprio, fixo em 1 empresa, e só você (dono) tem acesso ao seletor de empresas — escondido na URL `/tannus`. Sócios não veem nada que sugira que existem outras empresas.

## Mudanças no banco

1. **Nova tabela `company_members`** (`company_id`, `user_id`, `role`, `created_at`)
   - Liga sócios a empresas. O dono (`companies.owner_user_id`) tem acesso implícito.
   - RLS: dono da empresa gerencia membros; membros leem a própria linha.

2. **Função `has_company_access(user_id, company_id) → boolean`** (SECURITY DEFINER)
   - Retorna `true` se o usuário é dono OU está em `company_members`.

3. **RLS atualizada** em `companies`, `celetus_sales`, `products`, `daily_manual_inputs`, `monthly_settings`, `monthly_tax_settings`, `webhook_config`, `webhook_events`
   - Trocar `auth.uid() = user_id` por `has_company_access(auth.uid(), user_id)`.
   - Sócios passam a ver/editar os mesmos dados operacionais da empresa.

## Mudanças no app

4. **`companies-resolve.ts`** — deixar de exigir `owner_user_id = auth.uid()`. Resolver por slug + verificar acesso via `has_company_access`.

5. **Rota `/companies` → `/tannus`** (renomear o arquivo `src/routes/companies.tsx`)
   - Continua sendo a tela onde você cria/escolhe empresas.
   - Sem link público pra ela. Só você sabe a URL.

6. **Pós-login inteligente** (em `src/routes/auth.tsx` e `src/routes/index.tsx`)
   - Buscar empresas acessíveis do usuário logado.
   - Se **1 empresa** → redirect direto pra `/{slug}/dashboard`.
   - Se **>1 empresa** → redirect pra `/tannus`.
   - Sócio com 1 empresa nunca enxerga o seletor.

7. **Sidebar (`_authenticated/route.tsx`)**
   - Esconder o link "Trocar de empresa" quando o usuário tem acesso a apenas 1 empresa.
   - Você (com acesso às duas) continua vendo; sócios não veem nada.

8. **Settings da empresa** — nova seção "Sócios" visível **só pro dono**
   - Listar membros atuais.
   - Adicionar sócio por e-mail (server fn com `supabaseAdmin` busca o `auth.users.id` pelo email e insere em `company_members`). Se o email não existe ainda, mostra mensagem pedindo que a pessoa crie a conta primeiro.
   - Remover membro.

## Fluxo final

```text
você (dono de Tannus + Cecilia)
  login → /tannus → escolhe → /tannus-labs/dashboard

sócio Marcos (member de Cecilia)
  login → /cecilia-labs/dashboard (direto, sem seletor)
  sidebar não mostra "Trocar de empresa"
  Settings não mostra a seção "Sócios"
```

## Fora do escopo

- Múltiplos roles além de "member" (ex: viewer só leitura).
- Convite por email com link mágico — por enquanto o sócio precisa já ter conta criada.
- Auditoria de quem alterou o quê.
