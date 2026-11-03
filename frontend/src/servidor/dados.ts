/**
 * Monta os dados do painel a partir dos arquivos do projeto. Usado tanto pelo gerador do
 * HTML autocontido (gerarPainel.ts) quanto pelo servidor (servidor.ts, rota /api/dados).
 * As pastas vêm de radar.config.json.
 *
 *   metricas/datasets.json       catálogo: número de cada dataset e o nome do arquivo (gravado pelo backend)
 *   outputs/respostasN.json      encontros detectados (obrigatório)
 *   metricas/execucao.json       tempos, memória e auditoria de qualidade (gravado pelo backend no npm start)
 *   metricas/validacao.json      acerto vs. gabarito e vs. referência (gravado pelo backend no npm test)
 *   Inputs/<arquivo>             só o primeiro instante (cadastro) e o fim do arquivo (período)
 */
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import type { CadastroBruto, Catalogo, DadosPainel, DatasetBruto, DatasetCatalogo, EncontroResposta, Execucao, Validacao } from '../../../shared/contrato';
import { CONFIG, PASTAS, parametrosPainel } from './config';
import { RAIZ } from './raiz';

const rel = (p: string): string => path.relative(RAIZ, p).split(path.sep).join('/');

/**
 * Datasets do catálogo gravado pelo backend. Sem catálogo (backend nunca rodou), usa os
 * outputs/respostasN.json encontrados e os nomes oficiais da configuração.
 */
export function listarDatasets(): { lista: DatasetCatalogo[]; comCatalogo: boolean } {
  const arquivo = path.join(PASTAS.metricas, 'datasets.json');
  const catalogo = lerJson<Catalogo>(arquivo);
  if (catalogo && Array.isArray(catalogo.datasets)) return { lista: catalogo.datasets, comCatalogo: true };

  const nums = fs.existsSync(PASTAS.saidas)
    ? fs.readdirSync(PASTAS.saidas).map(nome => /^respostas(\d+)\.json$/i.exec(nome)).filter((m): m is RegExpExecArray => !!m).map(m => Number(m[1]))
    : [];
  const lista = nums.sort((a, b) => a - b).map(n => {
    const arquivoOficial = CONFIG.datasetsOficiais[n - 1];
    return { n, arquivo: arquivoOficial ?? '', oficial: !!arquivoOficial, existe: !!arquivoOficial && fs.existsSync(path.join(PASTAS.entradas, arquivoOficial)) };
  });
  return { lista, comCatalogo: false };
}

/** O backend compilado, necessário para os dados brutos e para incluir datasets. */
export const backendCompilado = (): boolean => fs.existsSync(path.join(RAIZ, 'backend', 'dist', 'cli', 'brutos.js'));

async function lerCadastro(filePath: string): Promise<CadastroBruto> {
  // O laço para no segundo instante: o stream precisa ser fechado à mão, senão o arquivo fica
  // aberto (no Windows, um arquivo aberto não some da pasta ao ser removido)
  const entrada = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: entrada, crlfDelay: Infinity });
  const pessoas: CadastroBruto['pessoas'] = {};
  const primeiroCampo = CONFIG.formato.cabecalho.split(';')[0];
  let inicio = '';
  for await (const line of rl) {
    const semBom = line.charCodeAt(0) === 0xfeff ? line.slice(1) : line; // BOM de editores do Windows
    if (!semBom || semBom.startsWith(primeiroCampo)) continue;
    const c = semBom.split(';');
    if (c.length < 6 || !Number.isFinite(Number(c[0]))) continue; // linhas inválidas aparecem na aba de qualidade
    const ts = c[2].replace(/"/g, '').trim();
    if (!inicio) inicio = ts;
    if (ts !== inicio) break; // no primeiro instante todos os monitorados aparecem
    const restr = (c[6] ?? '').replace(/"/g, '').split(',').filter(Boolean).map(Number);
    pessoas[c[0]] = [c[1].replace(/"/g, '').trim(), c[5].trim().toLowerCase() === 'true', restr];
  }
  rl.close();
  entrada.destroy();
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

export async function carregarDados(origem: DadosPainel['origem'], porta?: number): Promise<DadosPainel> {
  const avisos: string[] = [];
  const datasets: DatasetBruto[] = [];
  const { lista, comCatalogo } = listarDatasets();
  if (!comCatalogo) avisos.push(`${rel(PASTAS.metricas)}/datasets.json não existe; os nomes dos arquivos incluídos ficam desconhecidos. Rode "npm start".`);

  for (const d of lista) {
    const respPath = path.join(PASTAS.saidas, `respostas${d.n}.json`);
    const encontros = lerJson<EncontroResposta[]>(respPath);
    const nome = d.arquivo || `dataset ${d.n}`;
    if (!encontros) {
      if (d.existe) avisos.push(`${nome} (dataset ${d.n}) ainda não foi processado; ele fica fora do painel. Rode "npm start -- -d ${d.n}".`);
      continue;
    }
    const inputPath = d.arquivo ? path.join(PASTAS.entradas, d.arquivo) : '';
    const cadastro = inputPath && fs.existsSync(inputPath) ? await lerCadastro(inputPath) : null;
    if (!cadastro) avisos.push(`${inputPath ? rel(inputPath) : nome} não está na pasta de entradas; facções, vítimas e período do dataset ${d.n} ficam sem cadastro.`);

    datasets.push({
      n: d.n,
      arquivo: d.arquivo,
      oficial: d.oficial,
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
    throw new Error(`Nenhum resultado em ${rel(PASTAS.saidas)}/. Rode "npm start" para gerar os resultados primeiro.`);
  }

  const execPath = path.join(PASTAS.metricas, 'execucao.json');
  const execucao = lerJson<Execucao[]>(execPath);
  if (!execucao) avisos.push(`${rel(execPath)} não existe; tempos e qualidade dos dados ficam vazios. Rode "npm start".`);
  const valPath = path.join(PASTAS.metricas, 'validacao.json');
  const validacao = lerJson<Validacao>(valPath);
  if (!validacao) avisos.push(`${rel(valPath)} não existe; score e acurácia ficam vazios. Rode "npm test".`);

  const comBackend = origem === 'servidor' && backendCompilado();
  if (origem === 'servidor' && !comBackend) {
    avisos.push('O backend não está compilado; as abas Dados brutos e Incluir dados ficam indisponíveis. Rode "npm run build".');
  }
  return {
    geradoEm: new Date().toISOString(),
    origem,
    capacidades: { brutos: comBackend, incluir: comBackend },
    parametros: parametrosPainel(porta),
    datasets,
    execucao: execucao ?? [],
    validacao,
    avisos
  };
}
