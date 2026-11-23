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
    const child = spawn(bin, args, { cwd, windowsHide: true, env: process.env });
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
        if (job) await processRegisterJob(job);
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
  return ok;
}

if (ARGS.has("--check")) {
  process.exit((await check()) ? 0 : 1);
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
