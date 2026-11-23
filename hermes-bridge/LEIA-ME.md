# Ponte Hermes ↔ Painel Celetus

Script que roda no PC e liga o sistema ao Hermes e ao Claude Code.

## Fluxo

1. Em **Produtos → Criar produto**, o sistema cria o produto com SRC e põe o pedido na fila.
2. A ponte pega o pedido e roda `hermes -z ... --skills tannus-orquestrador` numa pasta própria (`pedidos/<SRC>/`).
3. O Hermes salva os entregáveis, `resultado.json`, `prompt_celetus.md` e `criativos/prompts_imagens.json` (o prompt de cada criativo; ele não desenha mais as artes em HTML).
4. A ponte chama o Claude com o Chrome para gerar cada imagem no **Gemini** (ou ChatGPT) usando a sua conta, sem API. Se houver referências em `Documents\OperacaoIA\knowledge\criativos-validados\<modelo_id>\`, elas vão anexadas. Cada imagem baixada é movida para `pedidos/<SRC>/criativos/`. Depois devolve tudo ao sistema (status **Aguardando cadastro**).
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
| `imagens_auto` | true | gerar as imagens dos criativos pelo Chrome |
| `imagens_site` | `gemini` | `gemini`, `chatgpt` ou `ambos` (cada criativo sai nos dois, com sufixo `-gemini` / `-chatgpt`). Cada criativo também pode pedir o seu com `"site"` no `prompts_imagens.json` |
| `imagem_timeout_min` | 10 | tempo máximo por imagem |
| `downloads_dir` | `%USERPROFILE%\Downloads` | onde o Chrome salva os downloads |
| `referencias_dir` | `Documents\OperacaoIA\knowledge\criativos-validados` | criativos vencedores, uma subpasta por `modelo_id` |
| `poll_seconds` | 30 | de quanto em quanto tempo olha a fila |
| `hermes_bin`, `claude_bin` | caminhos padrão do Windows | onde estão os programas |
| `work_dir` | `./pedidos` | onde ficam as pastas dos produtos e o `ponte.log` |

Gerar (ou completar) as imagens de uma pasta: `node ponte.mjs --imagens pedidos\<SRC>`. Para imagens, o Chrome precisa estar logado no Gemini/ChatGPT; o Chrome é usado por uma tarefa de cada vez.

Teste sem gastar créditos: `set PONTE_FAKE=1` antes de rodar simula o Hermes e o Claude.
