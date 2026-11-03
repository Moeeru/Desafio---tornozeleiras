import fs from 'fs';
import path from 'path';

const NOME_PACOTE = 'desafio-deteccao-encontros';

/**
 * Raiz do projeto (onde ficam Inputs/, outputs/ e metricas/), encontrada subindo a partir deste
 * arquivo até o package.json do projeto. Funciona igual a partir de frontend/src/servidor (ts-node)
 * ou de frontend/dist/servidor (compilado), sem contar níveis de "..".
 */
function encontrarRaiz(): string {
  let dir = __dirname;
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        if ((JSON.parse(fs.readFileSync(pkg, 'utf8')) as { name?: string }).name === NOME_PACOTE) return dir;
      } catch {
        /* package.json ilegível: continua subindo */
      }
    }
    const pai = path.dirname(dir);
    if (pai === dir) {
      throw new Error(`Não encontrei o package.json de "${NOME_PACOTE}" acima de ${__dirname}.`);
    }
    dir = pai;
  }
}

export const RAIZ = encontrarRaiz();
