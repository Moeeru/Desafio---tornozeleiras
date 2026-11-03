/**
 * Configuração do projeto, lida de radar.config.json na raiz. Tudo o que antes era fixo no
 * código (pastas, datasets oficiais, cabeçalho, extensões, distância limite, raio da Terra,
 * porta e limite de upload do BI) vem daqui. O BI lê o mesmo arquivo.
 */
import fs from 'fs';
import path from 'path';
import type { ConfigProjeto } from '../../shared/contrato';
import { RAIZ } from './arquivos/raiz';

export const ARQUIVO_CONFIG = path.join(RAIZ, 'radar.config.json');

function invalida(campo: string, esperado: string): never {
  throw new Error(`radar.config.json: "${campo}" precisa ser ${esperado}.`);
}

function validar(c: ConfigProjeto): ConfigProjeto {
  for (const k of ['entradas', 'saidas', 'metricas', 'gabaritos'] as const) {
    if (typeof c.pastas?.[k] !== 'string' || !c.pastas[k]) invalida(`pastas.${k}`, 'um caminho');
  }
  if (!Array.isArray(c.datasetsOficiais) || c.datasetsOficiais.some(n => typeof n !== 'string' || !n)) {
    invalida('datasetsOficiais', 'uma lista de nomes de arquivo');
  }
  if (typeof c.formato?.cabecalho !== 'string' || !c.formato.cabecalho.includes(';')) invalida('formato.cabecalho', 'os campos separados por ";"');
  if (!Array.isArray(c.formato.extensoes) || !c.formato.extensoes.every(e => /^\.[a-z0-9]+$/i.test(e))) {
    invalida('formato.extensoes', 'uma lista como [".txt", ".csv"]');
  }
  if (!(c.formato.intervaloLeituraSegundos > 0)) invalida('formato.intervaloLeituraSegundos', 'um número maior que zero');
  if (!(c.deteccao?.distanciaLimiteMetros > 0)) invalida('deteccao.distanciaLimiteMetros', 'um número maior que zero');
  if (!(c.deteccao.raioTerraMetros > 0)) invalida('deteccao.raioTerraMetros', 'um número maior que zero');
  if (!Number.isInteger(c.bi?.porta) || c.bi.porta < 1 || c.bi.porta > 65535) invalida('bi.porta', 'um número de 1 a 65535');
  if (!(c.bi.limiteUploadMB > 0)) invalida('bi.limiteUploadMB', 'um número maior que zero');
  return c;
}

function carregar(): ConfigProjeto {
  if (!fs.existsSync(ARQUIVO_CONFIG)) throw new Error(`Configuração não encontrada: ${ARQUIVO_CONFIG}.`);
  let bruto: unknown;
  try {
    bruto = JSON.parse(fs.readFileSync(ARQUIVO_CONFIG, 'utf8'));
  } catch (e) {
    throw new Error(`radar.config.json não é um JSON válido: ${(e as Error).message}`);
  }
  return validar(bruto as ConfigProjeto);
}

export const CONFIG: ConfigProjeto = carregar();
