import type { ExemploFalha, Falha, TipoFalha } from '../../../shared/contrato';

/** Cópia independente da string, para não reter o bloco de leitura de onde ela foi fatiada. */
export function detach(s: string): string {
  return Buffer.from(s, 'utf8').toString('utf8');
}

/**
 * Registro das falhas de coleta de um arquivo: total por tipo e os primeiros exemplos,
 * com número da linha e conteúdo, para mostrar no BI.
 *
 * Só é chamado quando há falha, então não pesa no processamento de arquivos limpos.
 */
export class Auditoria {
  readonly falhas: Partial<Record<TipoFalha, Falha>> = {};

  constructor(private readonly maxExemplos = 25) {}

  registrar(tipo: TipoFalha, linha: number | null, conteudo: string, detalhe: string, quantidade = 1): void {
    const f = (this.falhas[tipo] ??= { total: 0, exemplos: [] });
    f.total += quantidade;
    if (f.exemplos.length < this.maxExemplos) {
      // As duas strings podem conter fatias da linha lida; a cópia evita reter o bloco de leitura
      const exemplo: ExemploFalha = { linha, conteudo: detach(conteudo.slice(0, 200)), detalhe: detach(detalhe) };
      f.exemplos.push(exemplo);
    }
  }

  total(tipo?: TipoFalha): number {
    if (tipo) return this.falhas[tipo]?.total ?? 0;
    return Object.values(this.falhas).reduce((s, f) => s + (f?.total ?? 0), 0);
  }
}
