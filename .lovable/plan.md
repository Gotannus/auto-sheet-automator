## Remover o seletor de empresa da sidebar

Você acessa a troca exclusivamente pelo `/tannus`. A sidebar não precisa mais mostrar nada disso.

### Mudanças

**`src/routes/_authenticated/route.tsx`**
- Remover o bloco `{canSwitch && <Link to="/tannus">…Trocar de empresa</Link>}`.
- Remover o `useQuery` de `listMyCompanies` e a variável `canSwitch` (ficaram sem uso).
- Remover os imports não usados: `listMyCompanies`, `ChevronsLeftRight`, `Link`.
- Manter o bloco que mostra o ícone + nome da empresa atual (`Building2` + `displayName`), sem nenhum link de troca.

Nada mais muda — `/tannus` continua sendo a página de seleção/criação, acessada digitando a URL manualmente.