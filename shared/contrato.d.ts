/**
 * Contrato entre o backend (detecção) e o frontend (BI). Só tipos, nenhum código.
 *
 * Arquivos que o backend grava e o BI lê:
 *   outputs/respostasN.json   -> EncontroResposta[]  (formato oficial do desafio)
 *   metricas/execucao.json    -> Execucao[]
 *   metricas/validacao.json   -> Validacao
 *
 * Saídas de linha de comando do backend que o servidor do BI repassa ao navegador:
 *   node backend/dist/cli/brutos.js    -> PaginaBrutos    (GET /api/brutos)
 *   node backend/dist/cli/explicar.js  -> InstanteBruto   (uso no terminal)
 *   node backend/dist/cli/incluir.js   -> ResultadoInclusao (POST /api/datasets)
 *
 * Payload que o lado servidor do BI entrega ao navegador (embutido no HTML ou via GET /api/dados):
 *   DadosPainel
 */
export type TipoEncontro = 'generico' | 'faccao' | 'protetiva';
export type LatLon = [number, number];

/** Um item de outputs/respostasN.json, no formato exigido pelo desafio. */
export interface EncontroResposta {
  tipo: TipoEncontro;
  monitoradosEncontro: [number, number];
  timestamp: string;
  posicoes: Record<string, { lat: number; lon: number }>;
  distanciaMetros: number;
}

/* ------------------------------------------------------------------ */
/* Qualidade da coleta e aproveitamento dos registros                  */
/* ------------------------------------------------------------------ */

export type TipoFalha =
  | 'linha_invalida'          // linha sem os 7 campos esperados
  | 'id_invalido'             // id que não é número
  | 'coordenada_invalida'     // latitude/longitude ausente ou fora do intervalo
  | 'timestamp_invalido'      // fora do formato YYYY-MM-DD HH:MM:SS
  | 'fora_de_ordem'           // instante anterior ao da linha de antes
  | 'instante_repetido'       // instante que reaparece depois de outro (bloco não contínuo)
  | 'leitura_duplicada'       // mesmo id duas vezes no mesmo instante
  | 'leitura_ausente'         // id sem posição em algum instante
  | 'restricao_desconhecida'  // vítima protegida contra um id que nunca aparece
  | 'cadastro_inconsistente'; // vítima com facção, ou restrição em quem não é vítima

export interface ExemploFalha {
  /** Número da linha no arquivo (1 = cabeçalho). null quando a falha não é de uma linha só. */
  linha: number | null;
  conteudo: string;
  detalhe: string;
}

export interface Falha {
  total: number;
  /** Primeiros casos encontrados (no máximo 25). */
  exemplos: ExemploFalha[];
}

/** Caminho de um arquivo, da linha lida ao encontro registrado. */
export interface Funil {
  linhasLidas: number;
  cabecalhos: number;
  registrosValidos: number;
  registrosDescartados: number;
  instantes: number;
  /** Todos os pares possíveis dentro de cada instante. */
  paresComparados: number;
  /** Pares que passaram o pré-filtro por caixa delimitadora (só esses têm Haversine calculado). */
  paresPreFiltro: number;
  /** Pares a menos de 20 m. */
  paresProximos: number;
  /** Pares a menos de 20 m descartados pela regra da vítima sem relação. */
  paresIgnorados: number;
  encontros: number;
  /** Registros com pelo menos um vizinho no pré-filtro. */
  registrosCandidatos: number;
  /** Registros que fazem parte de algum encontro: os registros úteis para a proposta. */
  registrosEmEncontro: number;
}

/** Uma linha de metricas/execucao.json. Campos opcionais faltam em arquivos de versões antigas. */
export interface Execucao {
  dataset: number;
  sizeBytes: number;
  records: number;
  timestamps: number;
  distinctIds?: number;
  discarded?: number;
  outOfOrder?: number;
  nonContiguous?: number;
  duplicates?: number;
  encounters: number;
  peakRssBytes?: number;
  processMs: number;
  totalMs: number;
  breakdown: Record<TipoEncontro, number>;
  executedAt: string;
  funil?: Funil;
  falhas?: Partial<Record<TipoFalha, Falha>>;
}

export interface ValidacaoDataset {
  dataset: number;
  fonte: 'gabarito' | 'referencia';
  esperados: number;
  gerados: number;
  corretos: number;
  faltando: number;
  extras: number;
  tipoErrado: number;
  distanciaDiferente: number;
}

export interface Validacao {
  executadoEm: string;
  passaram: number;
  falharam: number;
  datasets: ValidacaoDataset[];
}

/* ------------------------------------------------------------------ */
/* Dados brutos de um instante, com o tratamento de cada registro      */
/* ------------------------------------------------------------------ */

export interface RegistroBruto {
  linha: number;
  bruto: string;
  status: 'valido' | 'descartado';
  motivo?: string;
  id?: number;
  faccao?: string;
  lat?: number;
  lon?: number;
  vitima?: boolean;
  restricoes?: number[];
  /** Pessoa mais próxima no mesmo instante, por Haversine. */
  vizinho?: { id: number; distancia: number } | null;
  /** Quantos vizinhos passaram o pré-filtro. */
  candidatos?: number;
  /** De quantos encontros este registro participa. */
  encontros?: number;
  /** Pessoas que passaram o pré-filtro junto com este registro, e o resultado de cada par. */
  paresCom?: { id: number; distancia: number; etapa: ParAnalisado['etapa']; tipo?: TipoEncontro }[];
  /** Dataset e instante do registro (preenchidos na tabela de dados brutos). */
  ds?: number;
  ts?: string;
}

/** Uma página da tabela de dados brutos (todos os datasets ou um só). */
export interface PaginaBrutos {
  /** null = todos os datasets. */
  dataset: number | null;
  pagina: number;
  tamanho: number;
  paginas: number;
  /** Registros (linhas de dados, sem o cabeçalho) no recorte. */
  total: number;
  totaisPorDataset: { dataset: number; registros: number }[];
  registros: RegistroBruto[];
}

export interface ParAnalisado {
  a: number;
  b: number;
  distancia: number;
  /** Resultado depois do pré-filtro: encontro, longe demais (≥ 20 m) ou descartado pela regra da vítima. */
  etapa: 'encontro' | 'acima_do_limite' | 'ignorado_vitima';
  tipo?: TipoEncontro;
}

export interface InstanteBruto {
  dataset: number;
  indice: number;
  totalInstantes: number;
  ts: string;
  anterior: string | null;
  proximo: string | null;
  registros: RegistroBruto[];
  /** Só os pares que passaram o pré-filtro (os demais estão a mais de ~25 m). */
  pares: ParAnalisado[];
  resumo: {
    registros: number;
    validos: number;
    descartados: number;
    paresComparados: number;
    paresPreFiltro: number;
    paresProximos: number;
    encontros: number;
  };
}

export interface ResultadoInclusao {
  dataset: number;
  arquivo: string;
  encontros: number;
  registros: number;
  falhas: number;
}

/* ------------------------------------------------------------------ */
/* Payload do painel                                                   */
/* ------------------------------------------------------------------ */

export interface EncontroBruto {
  tipo: TipoEncontro;
  a: number;
  b: number;
  ts: string;
  pa: LatLon;
  pb: LatLon;
  m: number;
}

export interface CadastroBruto {
  /** id -> [facção ('' se nenhuma), é vítima, ids restritos] */
  pessoas: Record<string, [string, boolean, number[]]>;
  inicio: string;
  fim: string;
}

export interface DatasetBruto {
  n: number;
  /** Os 7 datasets do desafio são oficiais; os demais foram incluídos depois. */
  oficial: boolean;
  cadastro: CadastroBruto | null;
  encontros: EncontroBruto[];
}

export interface DadosPainel {
  geradoEm: string;
  /** 'arquivo' = HTML autocontido; 'servidor' = carregado de /api/dados (permite atualizar). */
  origem: 'arquivo' | 'servidor';
  /** O que só funciona com o servidor rodando. */
  capacidades: { brutos: boolean; incluir: boolean };
  datasets: DatasetBruto[];
  execucao: Execucao[];
  validacao: Validacao | null;
  avisos: string[];
}
