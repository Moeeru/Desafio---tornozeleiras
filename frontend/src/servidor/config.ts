/**
 * radar.config.json, o mesmo arquivo que o backend lê (pastas, datasets oficiais, formato,
 * distância limite, porta e limite de upload). O backend valida cada campo ao rodar; aqui só
 * confirmamos que o arquivo existe e é um JSON, para dar uma mensagem clara.
 */
import fs from 'fs';
import path from 'path';
import type { ConfigProjeto, ParametrosPainel } from '../../../shared/contrato';
import { RAIZ } from './raiz';

function carregar(): ConfigProjeto {
  const arquivo = path.join(RAIZ, 'radar.config.json');
  if (!fs.existsSync(arquivo)) throw new Error(`Configuração não encontrada: ${arquivo}.`);
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8')) as ConfigProjeto;
  } catch (e) {
    throw new Error(`radar.config.json não é um JSON válido: ${(e as Error).message}`);
  }
}

export const CONFIG: ConfigProjeto = carregar();

export const PASTAS = {
  entradas: path.resolve(RAIZ, CONFIG.pastas.entradas),
  saidas: path.resolve(RAIZ, CONFIG.pastas.saidas),
  metricas: path.resolve(RAIZ, CONFIG.pastas.metricas)
};

export const LIMITE_UPLOAD_BYTES = CONFIG.bi.limiteUploadMB * 1024 * 1024;

/** O que a interface precisa da configuração (textos, cálculo de episódios, formulário de envio). */
export function parametrosPainel(porta = CONFIG.bi.porta): ParametrosPainel {
  return {
    distanciaLimiteMetros: CONFIG.deteccao.distanciaLimiteMetros,
    intervaloLeituraSegundos: CONFIG.formato.intervaloLeituraSegundos,
    cabecalho: CONFIG.formato.cabecalho,
    extensoes: CONFIG.formato.extensoes,
    pastaEntradas: CONFIG.pastas.entradas,
    portaBi: porta,
    limiteUploadBytes: LIMITE_UPLOAD_BYTES
  };
}
