/**
 * Servidor local do BI, só com node:http (sem dependências).
 *
 *   GET    /                    painel (frontend/public/index.html)
 *   GET    /estilos.css         estilos
 *   GET    /app/**.js           módulos ES de frontend/src/app compilados em frontend/dist/app/
 *   GET    /api/saude           verificação simples
 *   GET    /api/dados           dados atuais, lidos dos arquivos a cada requisição
 *   GET    /api/brutos?ds=todos|N&p=P&t=T   uma página da tabela de dados brutos, com o tratamento de cada linha
 *   POST   /api/datasets        inclui um arquivo de dados (corpo = conteúdo do arquivo) e processa
 *   DELETE /api/datasets/N      remove um dataset incluído (N > 7)
 *   GET    /painel.html         versão autocontida, igual à gerada por `npm run bi`
 *
 * O BI não executa a detecção por conta própria: para dados brutos, inclusão e remoção ele chama
 * os comandos do backend (backend/dist/cli/*.js), que são a única fonte das regras.
 *
 * Uso: npm run bi:serve                 (porta 4173)
 *      npm run bi:serve -- --porta 8080
 */
import { execFile } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { carregarDados } from './dados';
import { FRONT_DIST, FRONT_PUBLIC, ROOT, montarHtmlAutocontido } from './gerarPainel';

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};
const CLI = path.join(ROOT, 'backend', 'dist', 'cli');
const LIMITE_UPLOAD = 2 * 1024 ** 3; // 2 GB

function lerPorta(): number {
  const args = process.argv.slice(2);
  const i = args.findIndex(a => a === '--porta' || a === '-p');
  const valor = i >= 0 ? args[i + 1] : args.find(a => a.startsWith('--porta='))?.split('=')[1];
  const n = Number(valor ?? process.env.PORT ?? 4173);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`[ERRO] Porta inválida: ${valor}. Use um número de 1 a 65535, por exemplo: npm run bi:serve -- --porta 8080`);
    process.exit(1);
  }
  return n;
}
const PORTA = lerPorta();

function enviar(res: http.ServerResponse, status: number, tipo: string, corpo: string | Buffer): void {
  res.writeHead(status, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(corpo);
}
const json = (res: http.ServerResponse, status: number, obj: unknown): void => enviar(res, status, TIPOS['.json'], JSON.stringify(obj));
const erro = (res: http.ServerResponse, status: number, msg: string): void => json(res, status, { erro: msg });

function arquivo(res: http.ServerResponse, caminho: string): void {
  fs.readFile(caminho, (err, buf) => {
    if (err) return erro(res, 404, `Arquivo não encontrado: ${path.relative(ROOT, caminho)}. Rode "npm run build:frontend".`);
    enviar(res, 200, TIPOS[path.extname(caminho)] ?? 'application/octet-stream', buf);
  });
}

/** Executa um comando do backend e devolve a última linha da saída, interpretada como JSON. */
function rodarBackend(script: string, args: string[], timeoutMs: number): Promise<Record<string, unknown>> {
  const alvo = path.join(CLI, script);
  if (!fs.existsSync(alvo)) {
    return Promise.reject(new Error('O backend não está compilado. Rode "npm run build" e tente de novo.'));
  }
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [alvo, ...args], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs }, (err, stdout) => {
      const ultima = stdout.trim().split('\n').pop() ?? '';
      let saida: Record<string, unknown> | null = null;
      try { saida = JSON.parse(ultima) as Record<string, unknown>; } catch { /* saída não é JSON */ }
      if (saida && typeof saida.erro === 'string') return reject(new Error(saida.erro));
      if (err && !saida) return reject(new Error(err.killed ? 'O comando demorou demais e foi interrompido.' : err.message));
      resolve(saida ?? {});
    });
  });
}

/* Cache dos instantes já explicados (a explicação de um instante não muda enquanto o arquivo não muda). */
const cacheBrutos = new Map<string, Record<string, unknown>>();
function guardar(chave: string, valor: Record<string, unknown>): void {
  cacheBrutos.set(chave, valor);
  if (cacheBrutos.size > 64) cacheBrutos.delete(cacheBrutos.keys().next().value as string);
}

/** Escritas só podem vir do próprio painel: bloqueia outros sites abertos no navegador. */
function origemConfiavel(req: http.IncomingMessage): boolean {
  const origem = req.headers.origin;
  const permitidas = [`http://localhost:${PORTA}`, `http://127.0.0.1:${PORTA}`];
  return req.headers['x-radar'] === '1' && (origem === undefined || permitidas.includes(origem));
}

let inclusaoEmAndamento = false;

async function incluir(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (inclusaoEmAndamento) return erro(res, 409, 'Já há um arquivo sendo processado. Aguarde terminar.');
  const declarado = Number(req.headers['content-length'] ?? 0);
  if (declarado > LIMITE_UPLOAD) return erro(res, 413, 'Arquivo maior que 2 GB.');
  inclusaoEmAndamento = true;
  const temp = path.join(os.tmpdir(), `radar-upload-${process.pid}-${Date.now()}.txt`);
  try {
    await new Promise<void>((resolve, reject) => {
      let recebidos = 0;
      const destino = fs.createWriteStream(temp);
      req.on('data', (parte: Buffer) => {
        recebidos += parte.length;
        if (recebidos > LIMITE_UPLOAD) { req.destroy(); reject(new Error('Arquivo maior que 2 GB.')); }
      });
      req.pipe(destino);
      destino.on('finish', () => (recebidos ? resolve() : reject(new Error('O arquivo enviado está vazio.'))));
      destino.on('error', reject);
      req.on('error', reject);
    });
    const r = await rodarBackend('incluir.js', [temp, '--mover', '--json'], 30 * 60 * 1000);
    cacheBrutos.clear();
    json(res, 200, r);
  } catch (e) {
    erro(res, 400, (e as Error).message);
  } finally {
    inclusaoEmAndamento = false;
    fs.rm(temp, { force: true }, () => undefined);
  }
}

async function rotear(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const p = url.pathname;
  const metodo = req.method ?? 'GET';

  if (p === '/api/datasets' && metodo === 'POST') {
    if (!origemConfiavel(req)) return erro(res, 403, 'Requisição recusada: só o próprio painel pode incluir dados.');
    return incluir(req, res);
  }
  const remover = /^\/api\/datasets\/(\d+)$/.exec(p);
  if (remover && metodo === 'DELETE') {
    if (!origemConfiavel(req)) return erro(res, 403, 'Requisição recusada: só o próprio painel pode remover dados.');
    try {
      const r = await rodarBackend('remover.js', [remover[1], '--json'], 60 * 1000);
      cacheBrutos.clear();
      return json(res, 200, r);
    } catch (e) {
      return erro(res, 400, (e as Error).message);
    }
  }
  if (metodo !== 'GET' && metodo !== 'HEAD') return erro(res, 405, 'Método não aceito nesta rota.');

  if (p === '/' || p === '/index.html') return arquivo(res, path.join(FRONT_PUBLIC, 'index.html'));
  if (p === '/estilos.css') return arquivo(res, path.join(FRONT_PUBLIC, 'estilos.css'));
  if (p === '/api/saude') return json(res, 200, { ok: true });
  if (p === '/api/dados') {
    try { return json(res, 200, await carregarDados(ROOT, 'servidor')); } catch (e) { return erro(res, 500, (e as Error).message); }
  }
  if (p === '/api/brutos') {
    const ds = url.searchParams.get('ds') ?? 'todos';
    const pg = url.searchParams.get('p') ?? '1';
    const tam = url.searchParams.get('t') ?? '100';
    if (!/^(todos|\d+)$/.test(ds) || !/^\d+$/.test(pg) || !/^\d+$/.test(tam)) {
      return erro(res, 400, 'Use ?ds=todos|N&p=PÁGINA&t=TAMANHO');
    }
    const chave = `${ds}|${pg}|${tam}`;
    const emCache = cacheBrutos.get(chave);
    if (emCache) return json(res, 200, emCache);
    try {
      const r = await rodarBackend('brutos.js', ['--dataset', ds, '--pagina', pg, '--tamanho', tam], 3 * 60 * 1000);
      guardar(chave, r);
      return json(res, 200, r);
    } catch (e) {
      return erro(res, 400, (e as Error).message);
    }
  }
  if (p === '/painel.html') {
    try { return enviar(res, 200, TIPOS['.html'], montarHtmlAutocontido(await carregarDados(ROOT, 'arquivo'))); }
    catch (e) { return erro(res, 500, (e as Error).message); }
  }
  if (p.startsWith('/app/') && p.endsWith('.js')) {
    // Resolve dentro de frontend/dist/app e recusa qualquer caminho que saia de lá
    const alvo = path.resolve(FRONT_DIST, `.${p.slice('/app'.length)}`);
    if (!alvo.startsWith(FRONT_DIST + path.sep)) return erro(res, 404, 'Rota não encontrada.');
    return arquivo(res, alvo);
  }
  erro(res, 404, `Rota não encontrada: ${p}`);
}

const servidor = http.createServer((req, res) => {
  const t0 = Date.now();
  res.on('finish', () => {
    if (req.url?.startsWith('/api/')) console.log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - t0} ms`);
  });
  rotear(req, res).catch(e => erro(res, 500, String(e)));
});

servidor.on('error', (err: NodeJS.ErrnoException) => {
  console.error(err.code === 'EADDRINUSE'
    ? `[ERRO] A porta ${PORTA} já está em uso. Escolha outra: npm run bi:serve -- --porta ${PORTA + 1}`
    : `[ERRO] ${err.message}`);
  process.exit(1);
});
servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`BI disponível em http://localhost:${PORTA}`);
  console.log('Os dados são relidos de outputs/ e metricas/ a cada atualização. Ctrl+C para encerrar.');
});
