/**
 * Monta os dados do painel a partir dos arquivos do projeto. Usado tanto pelo gerador do
 * HTML autocontido (gerarPainel.ts) quanto pelo servidor (servidor.ts, rota /api/dados).
 *
 *   outputs/respostasN.json      encontros detectados (obrigatório)
 *   metricas/execucao.json       tempos, memória e auditoria de qualidade (gravado pelo backend no npm start)
 *   metricas/validacao.json      acerto vs. gabarito e vs. referência (gravado pelo backend no npm test)
 *   Inputs/datasetN.txt          só o primeiro instante (cadastro) e o fim do arquivo (período)
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { CadastroBruto, DadosPainel, DatasetBruto, EncontroResposta, Execucao, Validacao } from '../../../shared/contrato';

/** Os 7 datasets do desafio; os de número maior foram incluídos depois. */
export const DATASETS_OFICIAIS = 7;

/** Números de dataset presentes em Inputs/ (datasetN.txt) ou em outputs/ (respostasN.json). */
export function listarDatasets(root: string): number[] {
  const nums = new Set<number>();
  const coletar = (dir: string, re: RegExp): void => {
    if (!fs.existsSync(dir)) return;
    for (const nome of fs.readdirSync(dir)) {
      const m = re.exec(nome);
      if (m && Number(m[1]) > 0) nums.add(Number(m[1]));
    }
  };
  coletar(path.join(root, 'Inputs'), /^dataset(\d+)\.txt$/i);
  coletar(path.join(root, 'outputs'), /^respostas(\d+)\.json$/i);
  return [...nums].sort((a, b) => a - b);
}

/** O backend compilado, necessário para os dados brutos e para incluir datasets. */
export const backendCompilado = (root: string): boolean =>
  fs.existsSync(path.join(root, 'backend', 'dist', 'cli', 'brutos.js'));

async function lerCadastro(filePath: string): Promise<CadastroBruto> {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  const pessoas: CadastroBruto['pessoas'] = {};
  let inicio = '';
  for await (const line of rl) {
    const semBom = line.charCodeAt(0) === 0xfeff ? line.slice(1) : line; // BOM de editores do Windows
    if (!semBom || semBom.startsWith('idMonitorado')) continue;
    const c = line.split(';');
    if (c.length < 6 || !Number.isFinite(Number(c[0]))) continue; // linhas inválidas aparecem na aba de qualidade
    const ts = c[2].replace(/"/g, '').trim();
    if (!inicio) inicio = ts;
    if (ts !== inicio) break; // no primeiro instante todos os monitorados aparecem
    const restr = (c[6] ?? '').replace(/"/g, '').split(',').filter(Boolean).map(Number);
    pessoas[c[0]] = [c[1].replace(/"/g, '').trim(), c[5].trim().toLowerCase() === 'true', restr];
  }
  rl.close();
  return { pessoas, inicio, fim: lerUltimoTimestamp(filePath) };
}

/** Lê só o final do arquivo para achar o último timestamp, sem percorrer centenas de MB. */
function lerUltimoTimestamp(filePath: string): string {
  const size = fs.statSync(filePath).size;
  const len = Math.min(size, 4096);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, len, size - len);
  } finally {
    fs.closeSync(fd);
  }
  // Última linha com timestamp (o arquivo pode terminar com linhas inválidas)
  const lines = buf.toString('utf8').split(/\r?\n/).map(l => l.split(';')).filter(c => c.length >= 3 && /\d{4}-\d{2}-\d{2}/.test(c[2]));
  return lines.length ? lines[lines.length - 1][2].replace(/"/g, '').trim() : '';
}

function lerJson<T>(filePath: string): T | null {
  return fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, 'utf8')) as T) : null;
}

export async function carregarDados(root: string, origem: DadosPainel['origem']): Promise<DadosPainel> {
  const avisos: string[] = [];
  const datasets: DatasetBruto[] = [];

  for (const n of listarDatasets(root)) {
    const respPath = path.join(root, 'outputs', `respostas${n}.json`);
    const encontros = lerJson<EncontroResposta[]>(respPath);
    if (!encontros) {
      avisos.push(`Inputs/dataset${n}.txt ainda não foi processado; ele fica fora do painel. Rode "npm start -- -d ${n}".`);
      continue;
    }
    const inputPath = path.join(root, 'Inputs', `dataset${n}.txt`);
    const cadastro = fs.existsSync(inputPath) ? await lerCadastro(inputPath) : null;
    if (!cadastro) avisos.push(`Inputs/dataset${n}.txt não existe; facções, vítimas e período do dataset ${n} ficam sem cadastro.`);

    datasets.push({
      n,
      oficial: n <= DATASETS_OFICIAIS,
      cadastro,
      encontros: encontros.map(e => {
        const [a, b] = e.monitoradosEncontro;
        return {
          tipo: e.tipo, a, b, ts: e.timestamp,
          pa: [e.posicoes[a].lat, e.posicoes[a].lon],
          pb: [e.posicoes[b].lat, e.posicoes[b].lon],
          m: e.distanciaMetros
        };
      })
    });
  }

  if (datasets.length === 0) {
    throw new Error('Nenhum arquivo em outputs/. Rode "npm start" para gerar os resultados primeiro.');
  }

  const execucao = lerJson<Execucao[]>(path.join(root, 'metricas', 'execucao.json'));
  if (!execucao) avisos.push('metricas/execucao.json não existe; tempos e qualidade dos dados ficam vazios. Rode "npm start".');
  const validacao = lerJson<Validacao>(path.join(root, 'metricas', 'validacao.json'));
  if (!validacao) avisos.push('metricas/validacao.json não existe; score e acurácia ficam vazios. Rode "npm test".');

  const comBackend = origem === 'servidor' && backendCompilado(root);
  if (origem === 'servidor' && !comBackend) {
    avisos.push('O backend não está compilado; as abas Dados brutos e Incluir dados ficam indisponíveis. Rode "npm run build".');
  }
  return {
    geradoEm: new Date().toISOString(),
    origem,
    capacidades: { brutos: comBackend, incluir: comBackend },
    datasets,
    execucao: execucao ?? [],
    validacao,
    avisos
  };
}
