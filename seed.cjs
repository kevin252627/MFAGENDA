require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const htmlPath = path.join(__dirname, 'MF_Alocacao_Estoque_MF_DESIGN_CONTAGEM_FISICA_APENAS (1).html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  for (const [name, unidade] of [['original', 'matriz'], ['originalFilial', 'filial']]) {
    const match = html.match(new RegExp(`const ${name} = (\\[.*?\\]);\\r?\\n`, 's'));
    if (!match) throw new Error(`Lista ${name} não encontrada no HTML.`);
    const items = JSON.parse(match[1]);
    for (const [ordem, entry] of items.entries()) {
      await prisma.inventoryItem.upsert({
        where: { unidade_ordem: { unidade, ordem } },
        update: { codigo: String(entry.codigo), item: entry.item },
        create: { unidade, ordem, codigo: String(entry.codigo), item: entry.item, prateleira: entry.prateleira || '' }
      });
    }
    console.log(`${unidade}: ${items.length} itens importados/atualizados`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
