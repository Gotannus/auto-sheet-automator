# Ponte Hermes ↔ Painel Celetus

Script que roda no PC e liga o sistema ao Hermes e ao Claude Code.

## Fluxo

1. Em **Produtos → Criar produto**, o sistema cria o produto com SRC e põe o pedido na fila.
2. A ponte pega o pedido e roda `hermes -z ... --skills tannus-orquestrador` numa pasta própria (`pedidos/<SRC>/`).
3. O Hermes salva os entregáveis, `resultado.json` e `prompt_celetus.md`. A ponte devolve isso ao sistema (status **Aguardando cadastro**).
4. Você confere e clica **Aprovar e cadastrar**. A ponte chama `claude -p --chrome` com o prompt; o Claude cadastra na Celetus pelo seu Chrome e devolve o link do checkout (status **Cadastrado**).
5. Se o cadastro automático falhar, o pedido volta para **Aguardando cadastro** com o motivo, e dá para tentar de novo ou fazer à mão.

## Instalação

1. Copie esta pasta para um lugar fixo do PC.
2. Copie `ponte.config.example.json` para `ponte.config.json` e cole o segredo do Hermes (página **Webhook** do sistema).
3. Confira: `node ponte.mjs --check` (não gasta créditos).
4. Ligue: dê dois cliques em `iniciar-ponte.cmd` (deixe a janela aberta).

Para o cadastro automático: Chrome aberto, extensão Claude in Chrome conectada e você logado na Celetus. O Claude nunca digita senha.

## Configuração (`ponte.config.json`)

| Campo | Padrão | O que é |
|---|---|---|
| `hermes_secret` | — | segredo do Hermes da empresa |
| `api_base` | site publicado | endereço da API |
| `hermes_skills` | `tannus-orquestrador` | skills carregadas no Hermes |
| `hermes_timeout_min` | 180 | tempo máximo de um pedido |
| `claude_timeout_min` | 30 | tempo máximo do cadastro |
| `celetus_auto` | true | `false` desliga o cadastro automático |
| `poll_seconds` | 30 | de quanto em quanto tempo olha a fila |
| `hermes_bin`, `claude_bin` | caminhos padrão do Windows | onde estão os programas |
| `work_dir` | `./pedidos` | onde ficam as pastas dos produtos e o `ponte.log` |

Teste sem gastar créditos: `set PONTE_FAKE=1` antes de rodar simula o Hermes e o Claude.
