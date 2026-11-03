/** Formatação pt-BR e utilitários numéricos puros (sem DOM). */

export const nf = new Intl.NumberFormat('pt-BR');
export const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nf5 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

export const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 100) : 0);
export const plural = (n: number, um: string, varios: string): string => `${nf.format(n)} ${n === 1 ? um : varios}`;
export const sum = <T>(a: T[], f: (x: T) => number): number => a.reduce((s, x) => s + f(x), 0);
export const MB = (bytes: number): number => bytes / 1048576;

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/** Remove tags de um trecho de HTML (para rótulos acessíveis e tooltips). */
export function stripTags(html: string): string {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * "2024-01-01 00:05:15" -> milissegundos UTC. Aceita "T" no lugar do espaço; devolve NaN para
 * qualquer outro formato (arquivos incluídos podem ter timestamps inválidos, que a aba de
 * qualidade aponta).
 */
export function tsMs(ts: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(ts ?? '');
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
}

export function fmtDur(sec: number): string {
  sec = Math.round(sec);
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${m} min`;
  if (sec < 86400) return m ? `${h} h ${m} min` : `${h} h`;
  return h ? `${d} d ${h} h` : `${d} d`;
}

export function compact(n: number): string {
  if (n >= 1e6) return `${nf1.format(n / 1e6)} mi`;
  if (n >= 1e3) return `${nf.format(Math.round(n / 1e3))} mil`;
  return nf.format(Math.round(n));
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
}

export const median = (a: number[]): number => quantile([...a].sort((x, y) => x - y), 0.5);

export const fmtDataHora = (iso: string): string => new Date(iso).toLocaleString('pt-BR');
