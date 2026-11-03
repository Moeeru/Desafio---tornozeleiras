/**
 * Onde ficam os arquivos do projeto e quais datasets existem.
 *
 * Os datasets são identificados por número (outputs/respostasN.json, filtros do BI, `-d N`),
 * mas o arquivo de entrada guarda o nome original. O catálogo (metricas/datasets.json) liga
 * um ao outro:
 *   - oficiais: os nomes de `datasetsOficiais` em radar.config.json, numerados pela posição;
 *   - incluídos: qualquer outro arquivo com extensão aceita na pasta de entradas, numerado
 *     na ordem em que apareceu. Números de datasets removidos não são reaproveitados.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Catalogo, DatasetCatalogo, VerificacaoArquivo } from '../../../shared/contrato';
import { CONFIG } from '../config';
import { RAIZ } from './raiz';

export const PASTAS = {
  inputs: path.resolve(RAIZ, CONFIG.pastas.entradas),
  outputs: path.resolve(RAIZ, CONFIG.pastas.saidas),
  metricas: path.resolve(RAIZ, CONFIG.pastas.metricas),
  indices: path.resolve(RAIZ, CONFIG.pastas.metricas, 'indices'),
  gabaritos: path.resolve(RAIZ, CONFIG.pastas.gabaritos)
};

export const CABECALHO = CONFIG.formato.cabecalho;
/** Quantos campos cada linha de dados tem (os do cabeçalho). */
export const CAMPOS = CABECALHO.split(';').length;
export const ARQUIVO_CATALOGO = path.join(PASTAS.metricas, 'datasets.json');

export const arquivoResposta = (n: number): string => path.join(PASTAS.outputs, `respostas${n}.json`);
export const arquivoIndice = (n: number): string => path.join(PASTAS.indices, `dataset${n}.json`);
/** Caminho relativo à raiz, para mensagens ("Inputs/coleta.txt"). */
export const relativo = (caminho: string): string => path.relative(RAIZ, caminho).split(path.sep).join('/');

/** Nomes de arquivo são comparados sem diferenciar maiúsculas (Windows e macOS não diferenciam). */
const chave = (nome: string): string => nome.normalize('NFC').toLowerCase();
const extensaoAceita = (nome: string): boolean =>
  CONFIG.formato.extensoes.some(e => nome.toLowerCase().endsWith(e.toLowerCase()));

function lerGravado(): Catalogo {
  try {
    const c = JSON.parse(fs.readFileSync(ARQUIVO_CATALOGO, 'utf8')) as Catalogo;
    if (Array.isArray(c.datasets)) return { ultimoNumero: Number(c.ultimoNumero) || 0, datasets: c.datasets };
  } catch {
    /* ainda não existe ou ilegível: é recriado */
  }
  return { ultimoNumero: 0, datasets: [] };
}

function gravar(c: Catalogo): void {
  const texto = `${JSON.stringify(c satisfies Catalogo, null, 2)}\n`;
  const atual = fs.existsSync(ARQUIVO_CATALOGO) ? fs.readFileSync(ARQUIVO_CATALOGO, 'utf8') : '';
  if (texto === atual) return;
  fs.mkdirSync(PASTAS.metricas, { recursive: true });
  fs.writeFileSync(ARQUIVO_CATALOGO, texto, 'utf8');
}

function arquivosNaPasta(): string[] {
  if (!fs.existsSync(PASTAS.inputs)) return [];
  return fs.readdirSync(PASTAS.inputs, { withFileTypes: true })
    .filter(d => d.isFile() && !d.name.startsWith('.') && extensaoAceita(d.name))
    .map(d => d.name)
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

let emMemoria: DatasetCatalogo[] | null = null;

/**
 * Catálogo atualizado: oficiais da configuração + incluídos já registrados + arquivos novos
 * encontrados na pasta de entradas (que ganham o próximo número). Grava se algo mudou.
 * Fica em memória durante o comando; `reler` força olhar a pasta de novo.
 */
export function catalogo(reler = false): DatasetCatalogo[] {
  if (emMemoria && !reler) return emMemoria;
  const gravado = lerGravado();
  const naPasta = arquivosNaPasta();
  const presentes = new Map(naPasta.map(nome => [chave(nome), nome]));

  const oficiais: DatasetCatalogo[] = CONFIG.datasetsOficiais.map((arquivo, i) => ({
    n: i + 1, arquivo, oficial: true, existe: presentes.has(chave(arquivo))
  }));
  const usados = new Set(oficiais.map(d => chave(d.arquivo)));
  let ultimo = Math.max(gravado.ultimoNumero, oficiais.length);

  const incluidos: DatasetCatalogo[] = [];
  for (const d of gravado.datasets) {
    if (d.oficial || usados.has(chave(d.arquivo)) || d.n <= oficiais.length) continue;
    usados.add(chave(d.arquivo));
    ultimo = Math.max(ultimo, d.n);
    // O nome no disco vale mais que o gravado (o arquivo pode ter sido renomeado só nas maiúsculas)
    const noDisco = presentes.get(chave(d.arquivo));
    incluidos.push({ n: d.n, arquivo: noDisco ?? d.arquivo, oficial: false, existe: !!noDisco, ...(d.incluidoEm ? { incluidoEm: d.incluidoEm } : {}) });
  }
  for (const nome of naPasta) {
    if (usados.has(chave(nome))) continue;
    usados.add(chave(nome));
    incluidos.push({ n: ++ultimo, arquivo: nome, oficial: false, existe: true, incluidoEm: new Date().toISOString() });
  }

  const lista = [...oficiais, ...incluidos].sort((a, b) => a.n - b.n);
  gravar({ ultimoNumero: ultimo, datasets: lista });
  emMemoria = lista;
  return lista;
}

export function entradaCatalogo(n: number): DatasetCatalogo | undefined {
  return catalogo().find(d => d.n === n);
}

/** Números dos datasets cujo arquivo está na pasta de entradas, em ordem. */
export function listarDatasets(): number[] {
  return catalogo().filter(d => d.existe).map(d => d.n);
}

/** Caminho do arquivo de entrada do dataset n (erro se o número não existe). */
export function arquivoDataset(n: number): string {
  const d = entradaCatalogo(n);
  if (!d) throw new Error(`O dataset ${n} não existe. Disponíveis: ${listarDatasets().join(', ') || 'nenhum'}.`);
  return path.join(PASTAS.inputs, d.arquivo);
}

/** "dataset3.txt" / "coleta março.csv", para mensagens. */
export function nomeDataset(n: number): string {
  return entradaCatalogo(n)?.arquivo ?? `dataset ${n}`;
}

/** Remove um dataset incluído do catálogo (o número não volta a ser usado). */
export function retirarDoCatalogo(n: number): void {
  const lista = catalogo(true);
  const ultimo = Math.max(lerGravado().ultimoNumero, ...lista.map(d => d.n));
  emMemoria = lista.filter(d => d.n !== n);
  gravar({ ultimoNumero: ultimo, datasets: emMemoria });
}

/* ---------------------------------------------------------------- */
/* Inclusão de arquivos                                              */
/* ---------------------------------------------------------------- */

const NOME_VALIDO = /^[\p{L}\p{N}][\p{L}\p{N} ._()\-]*$/u;
const TAMANHO_MAXIMO_NOME = 120;

/** O nome pode ser usado na pasta de entradas? E já existe um arquivo com ele? */
export function verificarNome(nomeBruto: string): VerificacaoArquivo {
  const nome = nomeBruto.normalize('NFC').trim();
  const recusar = (mensagem: string): VerificacaoArquivo => ({ nome, valido: false, existe: false, mensagem });

  if (!nome) return recusar('Informe o nome do arquivo.');
  if (nome !== path.basename(nome) || /[\\/]/.test(nome)) return recusar('O nome não pode conter pastas.');
  if (nome.length > TAMANHO_MAXIMO_NOME) return recusar(`O nome passa de ${TAMANHO_MAXIMO_NOME} caracteres.`);
  if (!extensaoAceita(nome)) return recusar(`Extensão não aceita. Use ${CONFIG.formato.extensoes.join(' ou ')}.`);
  if (!NOME_VALIDO.test(nome)) return recusar('Use só letras, números, espaço e os sinais . _ - ( ) no nome, começando por letra ou número.');

  const k = chave(nome);
  const doCatalogo = catalogo(true).find(d => chave(d.arquivo) === k);
  const noDisco = arquivosNaPasta().find(a => chave(a) === k);
  if (noDisco || doCatalogo?.existe) {
    const d = doCatalogo;
    return {
      nome, valido: true, existe: true, dataset: d?.n, oficial: d?.oficial,
      mensagem: `Já existe "${noDisco ?? d?.arquivo}" em ${CONFIG.pastas.entradas}/` +
        (d ? ` (dataset ${d.n}, ${d.oficial ? 'oficial' : 'incluído'}).` : '.')
    };
  }
  return { nome, valido: true, existe: false, mensagem: `Nome livre: será gravado como ${CONFIG.pastas.entradas}/${nome}.` };
}

/** Registra um arquivo que acabou de ser colocado na pasta de entradas e devolve o número dele. */
export function registrarArquivo(nome: string): number {
  const d = catalogo(true).find(x => chave(x.arquivo) === chave(nome));
  if (!d) throw new Error(`"${nome}" não está em ${CONFIG.pastas.entradas}/.`);
  return d.n;
}

async function hashArquivo(arquivo: string): Promise<string> {
  const h = crypto.createHash('sha256');
  for await (const parte of fs.createReadStream(arquivo, { highWaterMark: 4 << 20 })) h.update(parte as Buffer);
  return h.digest('hex');
}

/**
 * Dataset existente com exatamente o mesmo conteúdo do arquivo, ou null. Só calcula o hash
 * dos arquivos de mesmo tamanho, então custa quase nada no caso comum.
 */
export async function conteudoDuplicado(arquivo: string): Promise<DatasetCatalogo | null> {
  const tamanho = fs.statSync(arquivo).size;
  const mesmos = catalogo().filter(d => d.existe && fs.statSync(path.join(PASTAS.inputs, d.arquivo)).size === tamanho);
  if (!mesmos.length) return null;
  const alvo = await hashArquivo(arquivo);
  for (const d of mesmos) {
    if ((await hashArquivo(path.join(PASTAS.inputs, d.arquivo))) === alvo) return d;
  }
  return null;
}

/** Confere o cabeçalho do arquivo. Retorna a mensagem de erro, ou null se estiver certo. */
export function validarCabecalho(arquivo: string): string | null {
  const fd = fs.openSync(arquivo, 'r');
  const buf = Buffer.alloc(Math.max(1024, CABECALHO.length * 4));
  let lidos = 0;
  try {
    lidos = fs.readSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (lidos === 0) return 'O arquivo está vazio.';
  let primeira = buf.toString('utf8', 0, lidos).split(/\r?\n/)[0];
  if (primeira.charCodeAt(0) === 0xfeff) primeira = primeira.slice(1); // BOM de editores do Windows
  primeira = primeira.replace(/["\s]/g, '');
  if (primeira.toLowerCase() !== CABECALHO.toLowerCase()) {
    return `A primeira linha precisa ser o cabeçalho "${CABECALHO}". Encontrado: "${primeira.slice(0, 120)}".`;
  }
  return null;
}
