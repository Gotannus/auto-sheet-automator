#!/usr/bin/env node
// Ponte entre o sistema (Painel Celetus) e o Hermes + Claude no seu PC.
//
// 1. Busca pedidos "Criar produto" na fila do sistema e chama o Hermes (skill tannus-orquestrador).
// 2. Devolve o resultado (produto + prompt de cadastro na Celetus) para o sistema.
// 3. Quando você clica "Aprovar e cadastrar", chama o Claude Code com o Chrome para cadastrar
//    na Celetus e devolve o link do checkout.
//
// Uso:
//   node ponte.mjs            roda sem parar (Ctrl+C para sair)
//   node ponte.mjs --check    só confere configuração, API, Hermes e Claude (não gasta créditos)
//   node ponte.mjs --once     uma rodada e sai
//
// Configuração: ponte.config.json na mesma pasta (veja ponte.config.example.json).
// Sem dependências: precisa só do Node 18+.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGS = new Set(process.argv.slice(2));
const FAKE = process.env.PONTE_FAKE === "1"; // testes: simula Hermes e Claude sem gastar nada

// ---------- configuração ----------

function loadConfig() {
  const file = process.env.PONTE_CONFIG || path.join(HERE, "ponte.config.json");
  if (!fs.existsSync(file)) {
    console.error(`Falta o arquivo de configuração: ${file}\nCopie ponte.config.example.json e preencha.`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const home = process.env.USERPROFILE || process.env.HOME || HERE;
  const cfg = {
    api_base: "https://auto-sheet-automator.lovable.app/api/public/hermes",
    hermes_secret: "",
    hermes_bin: path.join(home, "AppData", "Local", "hermes", "bin", "hermes.exe"),
    hermes_skills: "tannus-orquestrador",
    hermes_extra_args: [],
    hermes_timeout_min: 180,
    claude_bin: path.join(home, ".local", "bin", "claude.exe"),
    claude_extra_args: [],
    claude_timeout_min: 30,
    celetus_auto: true,
    imagens_auto: true,
    imagens_site: "gemini", // "gemini" ou "chatgpt" (pelo Chrome, sem API)
    imagem_timeout_min: 10,
    downloads_dir: path.join(home, "Downloads"),
    referencias_dir: path.join(home, "Documents", "OperacaoIA", "knowledge", "criativos-validados"),
    work_dir: path.join(HERE, "pedidos"),
    poll_seconds: 30,
    ...raw,
  };
  cfg.api_base = String(cfg.api_base).replace(/\/+$/, "");
  if (!cfg.hermes_secret || cfg.hermes_secret.length < 16) {
    console.error("hermes_secret vazio no ponte.config.json (pegue na página Webhook do sistema).");
    process.exit(1);
  }
  fs.mkdirSync(cfg.work_dir, { recursive: true });
  return cfg;
}

const cfg = loadConfig();
const LOG_FILE = path.join(cfg.work_dir, "ponte.log");

function log(...parts) {
  const line = `[${new Date().toLocaleString("pt-BR")}] ${parts.join(" ")}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
}

// ---------- API do sistema ----------

async function api(method, route, body) {
  const res = await fetch(`${cfg.api_base}/${route}`, {
    method,
    headers: {
      "x-hermes-secret": cfg.hermes_secret,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${JSON.stringify(data)}`);
  return data;
}

async function progress(jobId, message) {
  try {
    await api("POST", `jobs/${jobId}/progress`, { message: message.slice(0, 500) });
  } catch (e) {
    log("aviso: não deu para mandar andamento:", e.message);
  }
}

// ---------- rodar programas ----------

function run(bin, args, { cwd, timeoutMin, onTick }) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let done = false;
    const child = spawn(bin, args, {
      cwd,
      windowsHide: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const started = Date.now();
    const tick = onTick
      ? setInterval(() => onTick(Math.round((Date.now() - started) / 60000)), 5 * 60 * 1000)
      : null;
    const timer = setTimeout(() => {
      if (done) return;
      err += `\n[ponte] tempo limite de ${timeoutMin} min estourado`;
      child.kill();
    }, timeoutMin * 60 * 1000);
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    const finish = (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (tick) clearInterval(tick);
      resolve({ code, out, err });
    };
    child.on("error", (e) => {
      err += `\n[ponte] ${e.message}`;
      finish(-1);
    });
    child.on("close", finish);
  });
}

const tail = (s, n = 1500) => (s.length > n ? "…" + s.slice(-n) : s);

function safeName(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "pedido";
}

function extractJson(text) {
  // pega o último bloco {...} que seja JSON válido
  const fence = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  for (const c of fence.reverse()) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {}
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(text.slice(start, end + 1));
      if (v && typeof v === "object" && !Array.isArray(v)) return v;
    } catch {}
  }
  return null;
}

// ---------- Chrome: um uso por vez (imagens e cadastro dividem o mesmo navegador) ----------

let chromeQueue = Promise.resolve();
function withChrome(fn) {
  const next = chromeQueue.then(fn, fn);
  chromeQueue = next.catch(() => {});
  return next;
}

// ---------- Imagens: Gemini / ChatGPT pelo Chrome, sem API ----------

const IMAGE_EXT = /\.(png|jpe?g|jfif|webp)$/i; // o Gemini baixa como .jfif (JPEG)

const SITES = {
  gemini: { nome: "Gemini", url: "https://gemini.google.com/app" },
  chatgpt: { nome: "ChatGPT", url: "https://chatgpt.com/" },
};

function imagePromptForClaude(item, refs, site) {
  const s = SITES[site] || SITES.gemini;
  const anexos = refs.length
    ? `Antes de enviar, anexe estas imagens de referência na conversa (ferramenta de upload de arquivo):\n${refs.map((r) => `- ${r}`).join("\n")}\n`
    : "";
  const pedido = [
    `Crie uma imagem no formato ${item.formato || "4:5"} (vertical) para anúncio de Instagram/Facebook.`,
    refs.length
      ? "Use as imagens anexadas como referência de estilo, composição e qualidade (são criativos que já venderam). Não copie textos delas."
      : "",
    item.prompt,
    "Todo texto na imagem em português do Brasil, escrito corretamente e legível no celular.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return `Gere UMA imagem no ${s.nome} usando o Chrome do usuário (Claude in Chrome) e baixe o arquivo.

Passos:
1. Abra uma aba nova em ${s.url} (conversa nova).
2. Se pedir login, senha ou código, NÃO digite nada: pare e responda "FALHOU: precisa fazer login no ${s.nome} no Chrome".
3. ${anexos || "Não há imagens de referência."}
4. Cole e envie exatamente este pedido:
"""
${pedido}
"""
5. Espere a imagem aparecer (pode levar alguns minutos). Se o ${s.nome} responder só com texto, peça uma vez: "Gere a imagem agora."
6. Baixe a imagem no tamanho original pelo botão de download do próprio ${s.nome}. Clique UMA vez só. Você não precisa conferir a pasta Downloads: a ponte confere o arquivo sozinha.
7. Não gere outras imagens, não mude configurações, não assine nada.

Na última linha da resposta escreva só: BAIXADA  ou  FALHOU: motivo curto`;
}

function listDownloads() {
  try {
    return fs
      .readdirSync(cfg.downloads_dir)
      .filter((f) => IMAGE_EXT.test(f))
      .map((f) => {
        const full = path.join(cfg.downloads_dir, f);
        return { full, mtime: fs.statSync(full).mtimeMs };
      });
  } catch {
    return [];
  }
}

async function waitNewDownload(before, sinceMs, seconds = 30) {
  const known = new Set(before.map((d) => d.full));
  for (let i = 0; i < seconds; i++) {
    const fresh = listDownloads()
      .filter((d) => !known.has(d.full) || d.mtime > sinceMs)
      .filter((d) => d.mtime >= sinceMs - 2000)
      .sort((a, b) => b.mtime - a.mtime);
    if (fresh.length) return fresh[0].full;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
  }
}

function findImagePrompts(dir) {
  for (const f of [path.join(dir, "criativos", "prompts_imagens.json"), path.join(dir, "prompts_imagens.json")]) {
    if (!fs.existsSync(f)) continue;
    try {
      const v = JSON.parse(fs.readFileSync(f, "utf8"));
      const list = Array.isArray(v) ? v : Array.isArray(v?.imagens) ? v.imagens : [];
      return list.filter((i) => i && typeof i.prompt === "string" && i.prompt.trim());
    } catch (e) {
      log(`prompts_imagens.json inválido em ${f}: ${e.message}`);
    }
  }
  return [];
}

async function generateImages(dir, jobId) {
  const items = findImagePrompts(dir);
  if (!items.length) return { gerados: [], falhas: [], total: 0 };
  const outDir = path.join(dir, "criativos");
  fs.mkdirSync(outDir, { recursive: true });
  const site = SITES[cfg.imagens_site] ? cfg.imagens_site : "gemini";
  const gerados = [];
  const falhas = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const base = safeName(String(item.arquivo || `criativo-${String(i + 1).padStart(2, "0")}`).replace(IMAGE_EXT, ""));
    const exists = fs.readdirSync(outDir).find((f) => f.replace(IMAGE_EXT, "") === base && IMAGE_EXT.test(f));
    if (exists) {
      gerados.push(path.join(outDir, exists));
      continue;
    }
    const refs = (Array.isArray(item.referencias) ? item.referencias : [])
      .map(String)
      .filter((r) => fs.existsSync(r))
      .slice(0, 3);
    if (jobId) await progress(jobId, `Gerando imagem ${i + 1}/${items.length} no ${SITES[site].nome}: ${base}`);
    log(`Imagem ${i + 1}/${items.length}: ${base}`);

    const r = await withChrome(async () => {
      const before = listDownloads();
      const started = Date.now();
      let res;
      if (FAKE) {
        const fake = path.join(cfg.downloads_dir, `fake-${Date.now()}.png`);
        fs.mkdirSync(cfg.downloads_dir, { recursive: true });
        fs.writeFileSync(fake, "fake");
        res = { code: 0, out: "BAIXADA", err: "" };
      } else {
        const dirs = [...new Set([outDir, ...refs.map((r) => path.dirname(r))])];
        res = await run(
          cfg.claude_bin,
          [
            "-p",
            imagePromptForClaude(item, refs, site),
            "--chrome",
            "--permission-mode",
            "dontAsk",
            "--allowedTools",
            "mcp__claude-in-chrome",
            "Read",
            "--add-dir",
            ...dirs,
            "--output-format",
            "json",
            "--no-session-persistence",
            ...cfg.claude_extra_args,
          ],
          { cwd: outDir, timeoutMin: cfg.imagem_timeout_min },
        );
      }
      const file = await waitNewDownload(before, started, 30);
      return { ...res, file };
    });

    let text = r.out;
    try {
      const j = JSON.parse(r.out);
      if (typeof j.result === "string") text = j.result;
    } catch {}
    try {
      fs.writeFileSync(path.join(outDir, `_saida_${base}.txt`), `${text}\n\n--- stderr ---\n${r.err}`);
    } catch {}

    if (r.file) {
      let ext = path.extname(r.file).toLowerCase() || ".png";
      if (ext === ".jfif" || ext === ".jpeg") ext = ".jpg";
      const dest = path.join(outDir, base + ext);
      moveFile(r.file, dest);
      gerados.push(dest);
      log(`  salva: ${dest}`);
    } else {
      const motivo = text.match(/FALHOU:\s*(.+)/i)?.[1]?.trim() || `nenhum download apareceu (${tail(r.err || text, 300)})`;
      falhas.push({ arquivo: base, motivo });
      log(`  falhou: ${motivo}`);
      if (/login/i.test(motivo)) break; // sem login não adianta tentar as outras
    }
  }
  return { gerados, falhas, total: items.length };
}

// ---------- Hermes: criar o produto ----------

function hermesPrompt(job, dir) {
  const b = job.briefing || {};
  return `Crie um produto digital completo para a operação, usando o seu fluxo de vários agentes (tannus-orquestrador).

PEDIDO (veio do sistema Painel Celetus)
- Tipo: ${b.tipo || "-"}
- Tema: ${b.tema || "-"}
- Público: ${b.publico || "-"}
- Preço alvo: ${b.preco_alvo || "-"}
- Observações: ${b.observacoes || "-"}
- SRC do produto: ${job.src}   (é o código que liga as vendas da Celetus a este produto; use exatamente assim)

REGRAS DESTA EXECUÇÃO
- Esta execução é automática: não há ninguém para responder perguntas. Decida com bom senso e registre as decisões.
- Salve TODOS os entregáveis nesta pasta: ${dir}
- NÃO publique nada, NÃO cadastre na Celetus, NÃO gaste dinheiro. O cadastro é feito depois, com aprovação do usuário.

CRIATIVOS (IMPORTANTE)
- NÃO desenhe as artes dos anúncios em HTML/CSS/código nem tire print. As imagens finais serão geradas depois no ${(SITES[cfg.imagens_site] || SITES.gemini).nome}, a partir dos prompts que você escrever.
- O agente de criativos escreve, para cada criativo, um prompt de imagem completo e visual: cena, enquadramento, pessoas/objetos, luz, estilo (foto real, UGC de celular, flat lay etc.), cores, e o texto exato que deve aparecer na arte (headline, preço, CTA). Siga os modelos validados de knowledge/registro_modelos.json e cite o modelo_id.
- Referências visuais: se existir a pasta ${cfg.referencias_dir}\\<modelo_id>\\, escolha até 3 imagens de lá para cada criativo e coloque os caminhos completos em "referencias".
- Salve a lista em criativos/prompts_imagens.json nesta pasta, neste formato:
[
  { "arquivo": "c01-gancho-dor-4x5", "formato": "4:5", "modelo_id": "...", "angulo": "...",
    "prompt": "prompt completo da imagem", "referencias": ["C:\\\\...\\\\ref1.png"] }
]
- Faça de 3 a 6 criativos, cada um com ângulo diferente. Prévias do produto (capas, páginas do PDF) podem ser feitas por código, porque são o próprio produto.

AO TERMINAR, crie dois arquivos nesta pasta:

1) resultado.json, exatamente neste formato (pt-BR):
{
  "nome": "nome comercial do produto",
  "descricao": "descrição curta para a página de vendas (até 3 frases)",
  "preco": "preço de venda, ex: R$ 19,90",
  "order_bumps": [ { "nome": "...", "preco": "R$ ...", "descricao": "..." } ],
  "copy": "headline e copy principal da página",
  "arquivos": [ "nomes dos arquivos entregáveis criados nesta pasta" ],
  "observacoes": "decisões tomadas e o que o usuário precisa conferir"
}

2) prompt_celetus.md: um prompt completo para o Claude cadastrar este produto na Celetus pelo navegador. Inclua: nome, descrição, preço, order bumps com preços, quais arquivos subir (caminho completo nesta pasta), e que o SRC do produto é ${job.src}. Termine pedindo para ele responder com o link do checkout.

Depois de criar os dois arquivos, responda só com o conteúdo de resultado.json.`;
}

async function processCreateJob(job) {
  const dir = path.join(cfg.work_dir, safeName(job.src));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "pedido.json"), JSON.stringify(job, null, 2));
  log(`Hermes: começando ${job.src} em ${dir}`);
  await progress(job.id, `Hermes começou a criar o produto (pasta no PC: ${dir})`);

  const seen = new Set(fs.readdirSync(dir));
  const prompt = hermesPrompt(job, dir);
  fs.writeFileSync(path.join(dir, "prompt_hermes.txt"), prompt);

  let r;
  if (FAKE) {
    fs.writeFileSync(
      path.join(dir, "resultado.json"),
      JSON.stringify({ nome: `Teste ${job.briefing?.tema ?? ""}`, preco: "R$ 9,90", arquivos: [] }, null, 2),
    );
    fs.writeFileSync(path.join(dir, "prompt_celetus.md"), `Cadastre o produto de teste com SRC ${job.src}.`);
    r = { code: 0, out: "{}", err: "" };
  } else {
    const args = [
      "-z",
      prompt,
      "--in",
      dir,
      "--usage-file",
      path.join(dir, "uso_hermes.json"),
      ...(cfg.hermes_skills ? ["--skills", cfg.hermes_skills] : []),
      ...cfg.hermes_extra_args,
    ];
    r = await run(cfg.hermes_bin, args, {
      cwd: dir,
      timeoutMin: cfg.hermes_timeout_min,
      onTick: async (min) => {
        const now = fs.readdirSync(dir).filter((f) => !seen.has(f));
        now.forEach((f) => seen.add(f));
        await progress(
          job.id,
          now.length
            ? `Hermes trabalhando (${min} min). Novos arquivos: ${now.slice(0, 8).join(", ")}`
            : `Hermes trabalhando (${min} min)`,
        );
      },
    });
  }
  fs.writeFileSync(path.join(dir, "saida_hermes.txt"), `${r.out}\n\n--- stderr ---\n${r.err}`);

  let result = null;
  const resultFile = path.join(dir, "resultado.json");
  if (fs.existsSync(resultFile)) {
    try {
      result = JSON.parse(fs.readFileSync(resultFile, "utf8"));
    } catch {}
  }
  if (!result) result = extractJson(r.out);

  if (r.code !== 0 && !result) {
    throw new Error(`Hermes saiu com código ${r.code}.\n${tail(r.err || r.out)}`);
  }
  if (!result) {
    throw new Error(`O Hermes terminou mas não criou resultado.json.\nResposta: ${tail(r.out, 800)}`);
  }

  let celetusPrompt = "";
  const promptFile = path.join(dir, "prompt_celetus.md");
  if (fs.existsSync(promptFile)) celetusPrompt = fs.readFileSync(promptFile, "utf8").trim();
  if (!celetusPrompt) {
    celetusPrompt = `Cadastre na Celetus o produto abaixo.\n\n${JSON.stringify(result, null, 2)}`;
  }
  if (!celetusPrompt.includes(job.src)) {
    celetusPrompt += `\n\nSRC do produto: ${job.src}`;
  }

  result.pasta_no_pc = dir;

  if (cfg.imagens_auto) {
    try {
      const img = await generateImages(dir, job.id);
      if (img.total) {
        result.imagens = img.gerados.map((f) => path.basename(f));
        if (img.falhas.length) result.imagens_falhas = img.falhas;
        await progress(
          job.id,
          `Imagens: ${img.gerados.length} de ${img.total} geradas${img.falhas.length ? ` (${img.falhas.length} falharam)` : ""}`,
        );
      } else {
        await progress(job.id, "O Hermes não deixou prompts de imagem (criativos/prompts_imagens.json)");
      }
    } catch (e) {
      log("erro nas imagens:", e.message);
      result.imagens_falhas = [{ arquivo: "*", motivo: String(e.message).slice(0, 300) }];
    }
  }

  await api("POST", `jobs/${job.id}/result`, { result, celetus_prompt: celetusPrompt.slice(0, 20000) });
  log(`Hermes: ${job.src} pronto, aguardando aprovação do cadastro`);
}

// ---------- Claude: cadastrar na Celetus ----------

const CLAUDE_RULES = `Você está cadastrando um produto na Celetus usando o Chrome do usuário (Claude in Chrome).
O usuário já aprovou este cadastro no sistema. Regras:
- Trabalhe numa aba nova. Se a Celetus pedir login, senha ou código, NÃO digite: pare e responda "FALHOU: precisa fazer login na Celetus no Chrome".
- Não pague nada, não aceite planos pagos, não mexa em dados bancários nem em configurações da conta.
- Use exatamente o SRC informado. Se a Celetus usa o SRC como parâmetro do link (?src=), devolva o link do checkout já com ?src=SRC.
- Na última linha da resposta escreva só uma destas:
  CHECKOUT_URL: https://...
  FALHOU: motivo curto`;

async function processRegisterJob(job) {
  const dir = path.join(cfg.work_dir, safeName(job.src));
  fs.mkdirSync(dir, { recursive: true });
  log(`Claude: cadastrando ${job.src}`);
  await progress(job.id, "A ponte chamou o Claude para cadastrar pelo Chrome");

  const prompt = `${job.celetus_prompt}\n\nSRC do produto: ${job.src}\nArquivos do produto: ${dir}`;
  fs.writeFileSync(path.join(dir, "prompt_claude.txt"), prompt);

  let r;
  if (FAKE) {
    r = { code: 0, out: JSON.stringify({ result: `ok\nCHECKOUT_URL: https://exemplo.test/checkout?src=${job.src}` }), err: "" };
  } else {
    const args = [
      "-p",
      prompt,
      "--chrome",
      "--append-system-prompt",
      CLAUDE_RULES,
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "mcp__claude-in-chrome",
      "Read",
      "--add-dir",
      dir,
      "--output-format",
      "json",
      "--no-session-persistence",
      ...cfg.claude_extra_args,
    ];
    r = await run(cfg.claude_bin, args, {
      cwd: dir,
      timeoutMin: cfg.claude_timeout_min,
      onTick: (min) => progress(job.id, `Claude cadastrando (${min} min)`),
    });
  }
  fs.writeFileSync(path.join(dir, "saida_claude.txt"), `${r.out}\n\n--- stderr ---\n${r.err}`);

  let text = r.out;
  try {
    const j = JSON.parse(r.out);
    if (typeof j.result === "string") text = j.result;
  } catch {}

  const url = text.match(/CHECKOUT_URL:\s*(https?:\/\/\S+)/i)?.[1]?.replace(/[)\].,;]+$/, "");
  if (url) {
    await api("POST", `jobs/${job.id}/registered`, { checkout_url: url });
    log(`Claude: ${job.src} cadastrado -> ${url}`);
    return;
  }
  const motivo =
    text.match(/FALHOU:\s*(.+)/i)?.[1]?.trim() ||
    (r.code !== 0 ? `Claude saiu com código ${r.code}. ${tail(r.err || r.out, 600)}` : `Sem link do checkout. ${tail(text, 600)}`);
  await api("POST", `jobs/${job.id}/register-failed`, { message: motivo.slice(0, 2000) });
  log(`Claude: ${job.src} falhou: ${motivo}`);
}

// ---------- laço principal ----------

let creating = false;
let registering = false;

async function cycle() {
  if (!creating) {
    creating = true;
    (async () => {
      let job = null;
      try {
        job = await api("GET", "jobs/next");
        if (job) await processCreateJob(job);
      } catch (e) {
        log("erro no pedido:", e.message);
        if (job) {
          try {
            await api("POST", `jobs/${job.id}/error`, { message: String(e.message).slice(0, 2000) });
          } catch (e2) {
            log("e não deu para avisar o sistema:", e2.message);
          }
        }
      } finally {
        creating = false;
      }
    })();
  }
  if (cfg.celetus_auto && !registering) {
    registering = true;
    (async () => {
      let job = null;
      try {
        job = await api("GET", "jobs/approved/next");
        if (job) await withChrome(() => processRegisterJob(job));
      } catch (e) {
        log("erro no cadastro:", e.message);
        if (job) {
          try {
            await api("POST", `jobs/${job.id}/register-failed`, { message: String(e.message).slice(0, 2000) });
          } catch {}
        }
      } finally {
        registering = false;
      }
    })();
  }
}

async function check() {
  let ok = true;
  try {
    const p = await api("GET", "ping");
    log(`API ok: empresa ${p.company?.name} (${p.company?.slug})`);
  } catch (e) {
    ok = false;
    log("API FALHOU:", e.message);
  }
  for (const [name, bin] of [
    ["Hermes", cfg.hermes_bin],
    ["Claude", cfg.claude_bin],
  ]) {
    if (!fs.existsSync(bin)) {
      ok = false;
      log(`${name} NÃO encontrado em ${bin}`);
      continue;
    }
    const r = await run(bin, ["--version"], { cwd: HERE, timeoutMin: 1 });
    log(`${name} ok: ${(r.out || r.err).trim().split("\n")[0]}`);
  }
  log(`Pasta dos pedidos: ${cfg.work_dir}`);
  log(`Cadastro automático na Celetus: ${cfg.celetus_auto ? "ligado" : "desligado"}`);
  log(
    `Imagens pelo Chrome: ${cfg.imagens_auto ? `ligado (${(SITES[cfg.imagens_site] || SITES.gemini).nome})` : "desligado"}; downloads em ${cfg.downloads_dir}`,
  );
  if (!fs.existsSync(cfg.downloads_dir)) {
    ok = false;
    log(`Pasta de downloads NÃO encontrada: ${cfg.downloads_dir}`);
  }
  return ok;
}

if (ARGS.has("--check")) {
  process.exit((await check()) ? 0 : 1);
}

// node ponte.mjs --imagens <pasta>   gera (ou completa) as imagens de uma pasta de pedido
if (ARGS.has("--imagens")) {
  const argv = process.argv.slice(2);
  const dir = path.resolve(argv[argv.indexOf("--imagens") + 1] || ".");
  log(`Gerando imagens de ${dir} no ${(SITES[cfg.imagens_site] || SITES.gemini).nome}`);
  const r = await generateImages(dir, null);
  log(`Pronto: ${r.gerados.length} de ${r.total} geradas.`);
  r.falhas.forEach((f) => log(`  falhou ${f.arquivo}: ${f.motivo}`));
  process.exit(r.falhas.length ? 1 : 0);
}

log(`Ponte ligada${FAKE ? " (MODO TESTE)" : ""}. Olhando a fila a cada ${cfg.poll_seconds}s.`);
await check();
if (ARGS.has("--once")) {
  await cycle();
  const wait = () => new Promise((r) => setTimeout(r, 500));
  while (creating || registering) await wait();
  process.exit(0);
}
await cycle();
setInterval(cycle, cfg.poll_seconds * 1000);
