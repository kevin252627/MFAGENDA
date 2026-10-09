require('dotenv').config();
const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { createCountWorkbook } = require('./spreadsheet-export.cjs');
const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 3000);
const htmlFile = 'MF_Alocacao_Estoque_MF_DESIGN_CONTAGEM_FISICA_APENAS (1).html';
const validUnits = new Set(['matriz', 'filial']);
const normalizedAccountName = user => String(user?.nome || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const isKevinAccount = user => user?.role === 'admin' && (user?.accountKey === 'kevin' || String(user.username || '').toLowerCase() === 'kevin01' || normalizedAccountName(user).startsWith('kevin'));
const isRafaelAccount = user => user?.role === 'admin' && (user?.accountKey === 'rafael' || String(user.username || '').toLowerCase() === 'rafael02' || normalizedAccountName(user).startsWith('rafael'));
const canEditInventoryCodes = req => isKevinAccount(req.user);
const sessionSecret = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const scrypt = promisify(crypto.scrypt);
const execFileAsync = promisify(execFile);
let databaseReady = false;
const loginFailures = new Map();
const requesterNamesByUsername = { mf01: 'davy', mf02: 'GABRIEL', mf03: 'visitante' };
const adminOnly = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Acesso restrito a administradores.' });
const purchaseApproverOnly = (req, res, next) => {
  return isKevinAccount(req.user) || isRafaelAccount(req.user)
    ? next()
    : res.status(403).json({ error: 'Aprovação de compras restrita a Kevin01 e Rafael02.' });
};

const purchaseStatusApproverOnly = (req, res, next) => isRafaelAccount(req.user)
  ? next()
  : res.status(403).json({ error: 'Somente Rafael02 pode aprovar solicitações de compra.' });

function configuredAccounts() {
  return [
    { username: process.env.ADMIN1_USERNAME || 'admin1', previousUsername: process.env.ADMIN1_PREVIOUS_USERNAME || '', nome: process.env.ADMIN1_NAME || 'Administrador 1', password: process.env.ADMIN1_PASSWORD, role: 'admin' },
    { username: process.env.ADMIN2_USERNAME || 'admin2', previousUsername: process.env.ADMIN2_PREVIOUS_USERNAME || '', nome: process.env.ADMIN2_NAME || 'Administrador 2', password: process.env.ADMIN2_PASSWORD, role: 'admin' },
    { username: process.env.USER1_USERNAME || 'usuario1', previousUsername: process.env.USER1_PREVIOUS_USERNAME || '', nome: process.env.USER1_NAME || 'Usuário 1', password: process.env.USER1_PASSWORD, role: 'user' },
    { username: process.env.USER2_USERNAME || 'usuario2', previousUsername: process.env.USER2_PREVIOUS_USERNAME || '', nome: process.env.USER2_NAME || 'Usuário 2', password: process.env.USER2_PASSWORD, role: 'user' },
    { username: process.env.USER3_USERNAME || 'usuario3', previousUsername: process.env.USER3_PREVIOUS_USERNAME || '', nome: process.env.USER3_NAME || 'Usuário 3', password: process.env.USER3_PASSWORD, role: 'user' }
  ].map((account, index) => ({ ...account, accountKey: ['kevin', 'rafael', 'mf01', 'mf02', 'mf03'][index] }));
}
async function provisionAccounts() {
  const accounts = configuredAccounts();
  for (const account of accounts) {
    if (await prisma.appUser.findUnique({ where: { accountKey: account.accountKey }, select: { id: true } })) continue;
    const username = account.username.trim().toLowerCase();
    const previousUsername = account.previousUsername?.trim().toLowerCase();
    const existing = await prisma.appUser.findUnique({ where: { username }, select: { id: true } })
      || (previousUsername ? await prisma.appUser.findUnique({ where: { username: previousUsername }, select: { id: true } }) : null);
    if (existing) await prisma.appUser.update({ where: { id: existing.id }, data: { accountKey: account.accountKey } });
  }
  // Existing accounts are managed in the app settings UI. Provision only the initial set,
  // so restarting the server cannot undo changed usernames or passwords.
  if (await prisma.appUser.count() >= accounts.length) return;
  if (accounts.some(account => !account.password)) {
    console.warn('Login desabilitado: configure as cinco senhas iniciais no arquivo .env.');
    return;
  }
  for (const account of accounts) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = (await scrypt(account.password, salt, 64)).toString('hex');
    const username = account.username.trim().toLowerCase();
    const previousUsername = account.previousUsername?.trim().toLowerCase();
    const data = { accountKey: account.accountKey, username, nome: account.nome, passwordHash: `${salt}:${hash}`, role: account.role };
    const existing = await prisma.appUser.findUnique({ where: { username } });
    if (existing) {
      await prisma.appUser.update({ where: { id: existing.id }, data: { role: account.role, accountKey: account.accountKey } });
      if (requesterNamesByUsername[username]) {
        await prisma.purchaseRequest.updateMany({ where: { usuarioId: existing.id }, data: { solicitante: requesterNamesByUsername[username] } });
      } else if (existing.nome && existing.nome !== account.nome) {
        await prisma.purchaseRequest.updateMany({
          where: { usuarioId: existing.id, solicitante: existing.nome },
          data: { solicitante: account.nome }
        });
      }
    }
    else if (previousUsername && previousUsername !== username) {
      const previous = await prisma.appUser.findUnique({ where: { username: previousUsername } });
      if (previous) {
        await prisma.appUser.update({ where: { id: previous.id }, data: { username, nome: account.nome, role: account.role } });
      if (requesterNamesByUsername[username]) {
        await prisma.purchaseRequest.updateMany({ where: { usuarioId: previous.id }, data: { solicitante: requesterNamesByUsername[username] } });
      } else if (previous.nome && previous.nome !== account.nome) {
          await prisma.purchaseRequest.updateMany({
            where: { usuarioId: previous.id, solicitante: previous.nome },
            data: { solicitante: account.nome }
          });
        }
      }
      else await prisma.appUser.create({ data });
    } else await prisma.appUser.create({ data });
  }
}
function sessionCookie(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  return cookies.map(part => part.trim()).find(part => part.startsWith('mf_session='))?.slice('mf_session='.length) || '';
}
function signSession(user) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, accountKey: user.accountKey, username: user.username, nome: user.nome, role: user.role, exp: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', sessionSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
function readSession(token) {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expected = crypto.createHmac('sha256', sessionSecret).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return user.exp > Date.now() ? user : null;
  } catch { return null; }
}
function requireAuth(req, res, next) {
  if (!databaseReady) return res.status(503).json({ error: 'Banco de dados inicializando. Tente novamente em instantes.' });
  const user = readSession(sessionCookie(req));
  if (!user) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  prisma.appUser.findUnique({ where: { id: user.id }, select: { id: true, accountKey: true, username: true, nome: true, role: true } })
    .then(current => {
      if (!current || current.username !== user.username || current.role !== user.role) return res.status(401).json({ error: 'A conta foi atualizada. Entre novamente.' });
      req.user = current;
      next();
    })
    .catch(next);
}

app.use(express.json({ limit: '2mb' }));
app.get('/api/health', async (_req, res) => {
  if (!databaseReady) return res.status(503).json({ ok: false, database: 'initializing' });
  try { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, database: 'postgresql' }); }
  catch { res.status(503).json({ ok: false }); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    if (!databaseReady) return res.status(503).json({ error: 'Banco de dados inicializando. Tente novamente em instantes.' });
    if (configuredAccounts().some(account => !account.password)) return res.status(503).json({ error: 'As cinco contas iniciais ainda não foram configuradas no servidor.' });
    const ip = req.ip || 'unknown';
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const attemptKey = `${ip}:${username.slice(0, 80)}`;
    const failure = loginFailures.get(attemptKey);
    if (failure && failure.resetAt > Date.now() && failure.count >= 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
    const invalidLogin = () => {
      if (!failure || failure.resetAt <= Date.now()) loginFailures.set(attemptKey, { count: 1, resetAt: Date.now() + 15 * 60 * 1000 });
      else { failure.count += 1; loginFailures.set(attemptKey, failure); }
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    };
    const user = await prisma.appUser.findUnique({ where: { username } });
    if (!user) return invalidLogin();
    const [salt, savedHash] = user.passwordHash.split(':');
    const candidate = await scrypt(password, salt, 64);
    const saved = Buffer.from(savedHash, 'hex');
    if (candidate.length !== saved.length || !crypto.timingSafeEqual(candidate, saved)) return invalidLogin();
    loginFailures.delete(attemptKey);
    const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `mf_session=${signSession(user)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
    res.json({ user: { id: user.id, accountKey: user.accountKey, username: user.username, nome: user.nome, role: user.role } });
  } catch (error) { next(error); }
});
app.post('/api/auth/logout', (_req, res) => {
  res.setHeader('Set-Cookie', 'mf_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.use('/api', requireAuth);
app.use('/api', (req, res, next) => databaseReady ? next() : res.status(503).json({ error: 'Banco de dados inicializando. Tente novamente em instantes.' }));
const kevinSettingsOnly = (req, res, next) => isKevinAccount(req.user)
  ? next()
  : res.status(403).json({ error: 'Configurações restritas ao Kevin01.' });
app.get('/api/admin/users', kevinSettingsOnly, async (_req, res, next) => {
  try {
    res.json(await prisma.appUser.findMany({ select: { id: true, accountKey: true, username: true, nome: true, role: true }, orderBy: [{ role: 'desc' }, { criadoEm: 'asc' }] }));
  } catch (error) { next(error); }
});
app.patch('/api/admin/users/:id', kevinSettingsOnly, async (req, res, next) => {
  try {
    const id = String(req.params.id || '');
    const username = String(req.body.username || '').trim().toLowerCase();
    const nome = String(req.body.nome || '').trim();
    const newPassword = String(req.body.newPassword || '');
    if (!/^[a-z0-9._-]{3,80}$/.test(username)) return res.status(400).json({ error: 'O login deve ter de 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado.' });
    if (newPassword && (newPassword.length < 8 || newPassword.length > 200)) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres.' });
    const account = await prisma.appUser.findUnique({ where: { id }, select: { id: true, username: true, nome: true, role: true } });
    if (!account) return res.status(404).json({ error: 'Acesso não encontrado.' });
    if (nome.length < 1 || nome.length > 150) return res.status(400).json({ error: 'Informe um nome com até 150 caracteres.' });
    const update = { username, nome };
    if (newPassword) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = (await scrypt(newPassword, salt, 64)).toString('hex');
      update.passwordHash = `${salt}:${hash}`;
    }
    const user = await prisma.$transaction(async tx => {
      const updated = await tx.appUser.update({ where: { id }, data: update, select: { id: true, accountKey: true, username: true, nome: true, role: true } });
      await tx.purchaseRequest.updateMany({
        where: { OR: [{ usuarioId: id }, { usuarioId: null, solicitante: { equals: account.nome, mode: 'insensitive' } }] },
        data: { solicitante: nome }
      });
      return updated;
    });
    if (user.id === req.user.id) {
      const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `mf_session=${signSession(user)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure}`);
    }
    res.json({ user });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Esse login já está sendo usado.' });
    next(error);
  }
});
app.get('/api/inventory/:unit', async (req, res, next) => {
  try {
    if (!validUnits.has(req.params.unit)) return res.status(400).json({ error: 'Unidade inválida.' });
    res.json(await prisma.inventoryItem.findMany({ where: { unidade: req.params.unit }, orderBy: { ordem: 'asc' } }));
  } catch (error) { next(error); }
});
app.put('/api/inventory/:unit', async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    if (!Array.isArray(req.body.items)) return res.status(400).json({ error: 'Informe a lista items.' });
    const existingItems = canEditInventoryCodes(req) ? [] : await prisma.inventoryItem.findMany({ where: { unidade }, select: { ordem: true, codigo: true } });
    const existingCodes = new Map(existingItems.map(row => [row.ordem, row.codigo]));
    const operations = req.body.items.map((row, ordem) => {
      const codigo = canEditInventoryCodes(req) ? String(row.codigo || '').trim() : (existingCodes.get(ordem) || String(row.codigo || '').trim());
      const item = String(row.item || '').trim();
      return prisma.inventoryItem.upsert({
        where: { unidade_ordem: { unidade, ordem } },
        update: { codigo, item, prateleira: String(row.prateleira || '') },
        create: { unidade, ordem, codigo, item, prateleira: String(row.prateleira || '') }
      });
    });
    await prisma.$transaction(operations);
    await prisma.inventoryItem.deleteMany({ where: { unidade, ordem: { gte: req.body.items.length } } });
    res.json({ ok: true, total: req.body.items.length });
  } catch (error) { next(error); }
});
app.patch('/api/inventory/:unit/:order', async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    const ordem = Number(req.params.order);
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    if (!Number.isSafeInteger(ordem) || ordem < 0) return res.status(400).json({ error: 'Posição do item inválida.' });
    const codigo = String(req.body.codigo || '').trim();
    const item = String(req.body.item || '').trim();
    const prateleira = String(req.body.prateleira ?? '').trim();
    if (!codigo || !item) return res.status(400).json({ error: 'Código e item são obrigatórios.' });
    const where = { unidade_ordem: { unidade, ordem } };
    const current = await prisma.inventoryItem.findUnique({ where });
    if (current && current.codigo !== codigo && !canEditInventoryCodes(req)) return res.status(403).json({ error: 'Somente Kevin01 pode alterar o código do produto.' });
    if (current && current.codigo === codigo && current.item === item && current.prateleira === prateleira) {
      return res.json({ ok: true, unchanged: true, item: current });
    }
    const saved = await prisma.inventoryItem.upsert({
      where,
      update: { codigo, item, prateleira },
      create: { unidade, ordem, codigo, item, prateleira }
    });
    res.json({ ok: true, item: saved });
  } catch (error) { next(error); }
});
app.get('/api/counts/:unit', async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    const [inventory, saved] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { unidade }, orderBy: { ordem: 'asc' } }),
      prisma.stockCount.findMany({ where: { unidade }, orderBy: { ordem: 'asc' } })
    ]);
    const byOrder = new Map(saved.map(row => [row.ordem, row]));
    const rows = inventory.map(row => {
      const count = byOrder.get(row.ordem);
      return { codigo: row.codigo, item: row.item, sistema: count?.sistema ?? 0, contagem: count?.contagemFisica == null ? '' : String(count.contagemFisica) };
    });
    const inventoryOrders = new Set(inventory.map(row => row.ordem));
    for (const count of saved) if (!inventoryOrders.has(count.ordem)) rows.push({ codigo: count.codigo, item: count.item, sistema: count.sistema, contagem: count.contagemFisica == null ? '' : String(count.contagemFisica) });
    res.json(rows);
  } catch (error) { next(error); }
});
async function removeInventoryAt(unidade, ordem) {
  const where = { unidade_ordem: { unidade, ordem } };
  const item = await prisma.inventoryItem.findUnique({ where });
  if (!item) return false;
  await prisma.$transaction(async tx => {
    await tx.inventoryItem.delete({ where });
    await tx.stockCount.deleteMany({ where: { unidade, ordem } });
    const inventory = await tx.inventoryItem.findMany({ where: { unidade, ordem: { gt: ordem } }, orderBy: { ordem: 'asc' }, select: { ordem: true } });
    for (const row of inventory) {
      await tx.inventoryItem.update({ where: { unidade_ordem: { unidade, ordem: row.ordem } }, data: { ordem: row.ordem - 1 } });
    }
    const counts = await tx.stockCount.findMany({ where: { unidade, ordem: { gt: ordem } }, orderBy: { ordem: 'asc' }, select: { ordem: true } });
    for (const row of counts) {
      await tx.stockCount.update({ where: { unidade_ordem: { unidade, ordem: row.ordem } }, data: { ordem: row.ordem - 1 } });
    }
  });
  return true;
}
app.delete('/api/inventory/:unit/:order', purchaseApproverOnly, async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    const ordem = Number(req.params.order);
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    if (!Number.isSafeInteger(ordem) || ordem < 0) return res.status(400).json({ error: 'Posição do item inválida.' });
    if (!await removeInventoryAt(unidade, ordem)) return res.status(404).json({ error: 'Produto não encontrado.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.delete('/api/inventory/:unit/products/remove', purchaseApproverOnly, async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    const codigo = String(req.body.codigo || '').trim();
    const item = String(req.body.item || '').trim();
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    if (!codigo || !item) return res.status(400).json({ error: 'Informe o código e a descrição do produto.' });
    const match = await prisma.inventoryItem.findFirst({ where: { unidade, codigo, item }, select: { ordem: true } });
    if (!match) return res.json({ ok: true, alreadyRemoved: true });
    await removeInventoryAt(unidade, match.ordem);
    res.json({ ok: true });
  } catch (error) { next(error); }
});
app.put('/api/counts/:unit', async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    if (!Array.isArray(req.body.items)) return res.status(400).json({ error: 'Informe a lista items.' });
    const canEditInformedStock = isKevinAccount(req.user);
    const existingCounts = await prisma.stockCount.findMany({ where: { unidade }, select: { ordem: true, sistema: true } });
    const informedStockByOrder = new Map(existingCounts.map(row => [row.ordem, row.sistema]));
    const operations = req.body.items.map((row, ordem) => {
      const codigo = String(row.codigo || '').trim();
      const item = String(row.item || '').trim();
      const contagemFisica = row.contagem === '' || row.contagem == null ? null : Math.max(0, Number(row.contagem));
      const sistema = canEditInformedStock
        ? Math.max(0, Number(row.sistema) || 0)
        : informedStockByOrder.get(ordem) ?? 0;
      return prisma.stockCount.upsert({
        where: { unidade_ordem: { unidade, ordem } },
        update: { codigo, item, sistema, contagemFisica, dataContagem: contagemFisica == null ? null : new Date() },
        create: { unidade, ordem, codigo, item, sistema, contagemFisica, dataContagem: contagemFisica == null ? null : new Date() }
      });
    });
    await prisma.$transaction(operations);
    await prisma.stockCount.deleteMany({ where: { unidade, ordem: { gte: req.body.items.length } } });
    res.json({ ok: true, total: req.body.items.length });
  } catch (error) { next(error); }
});

app.get('/api/count-sessions/:unit', async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    const [active, latest] = await Promise.all([
      prisma.stockCountSession.findFirst({ where: { unidade, finalizadoEm: null }, orderBy: { iniciadoEm: 'desc' } }),
      prisma.stockCountSession.findFirst({ where: { unidade }, orderBy: { iniciadoEm: 'desc' } })
    ]);
    res.json({ active, latest });
  } catch (error) { next(error); }
});
app.post('/api/count-sessions/:unit/start', async (req, res, next) => {
  try {
    const unidade = req.params.unit;
    if (!validUnits.has(unidade)) return res.status(400).json({ error: 'Unidade inválida.' });
    const requestedId = String(req.body.id || '');
    if (requestedId && !/^[0-9a-f-]{36}$/i.test(requestedId)) return res.status(400).json({ error: 'Identificador inválido.' });
    if (requestedId) {
      const previous = await prisma.stockCountSession.findUnique({ where: { id: requestedId } });
      if (previous) return res.json({ session: previous, existing: true });
    }
    const active = await prisma.stockCountSession.findFirst({ where: { unidade, finalizadoEm: null }, orderBy: { iniciadoEm: 'desc' } });
    if (active) return res.json({ session: active, existing: true });
    const requestedStart = req.body.iniciadoEm ? new Date(req.body.iniciadoEm) : new Date();
    const iniciadoEm = Number.isNaN(requestedStart.getTime()) || requestedStart > new Date() ? new Date() : requestedStart;
    const session = await prisma.stockCountSession.create({ data: { ...(requestedId ? { id: requestedId } : {}), unidade, iniciadoEm } });
    res.json({ session, existing: false });
  } catch (error) { next(error); }
});
app.post('/api/count-sessions/:id/finalize', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const session = await prisma.stockCountSession.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ error: 'Sessão de contagem não encontrada.' });
    if (session.finalizadoEm) return res.status(409).json({ error: 'Esta contagem já foi finalizada.', filename: session.arquivo });
    const requestedFinish = req.body.finalizadoEm ? new Date(req.body.finalizadoEm) : new Date();
    const finishedAt = Number.isNaN(requestedFinish.getTime()) || requestedFinish < session.iniciadoEm || requestedFinish > new Date() ? new Date() : requestedFinish;
    const [inventory, savedCounts] = await Promise.all([
      prisma.inventoryItem.findMany({ where: { unidade: session.unidade }, orderBy: { ordem: 'asc' } }),
      prisma.stockCount.findMany({ where: { unidade: session.unidade }, orderBy: { ordem: 'asc' } })
    ]);
    const byOrder = new Map(savedCounts.map(row => [row.ordem, row]));
    const items = inventory.map(row => {
      const count = byOrder.get(row.ordem);
      return { codigo: row.codigo, item: row.item, sistema: count?.sistema ?? 0, contagem: count?.contagemFisica == null ? '' : String(count.contagemFisica) };
    });
    const stamp = finishedAt.toISOString().replace(/[:.]/g, '-');
    const filename = `Contagem_${session.unidade === 'matriz' ? 'Matriz' : 'Filial'}_${stamp}.xlsx`;
    const workbook = createCountWorkbook({ unit: session.unidade, startedAt: session.iniciadoEm, finishedAt, items });
    await fs.writeFile(path.join(__dirname, filename), workbook);
    const finalized = await prisma.stockCountSession.update({ where: { id: session.id }, data: { finalizadoEm: finishedAt, arquivo: filename } });
    res.json({ session: finalized, filename, downloadUrl: `/api/count-sessions/${session.id}/download` });
  } catch (error) { next(error); }
});
app.get('/api/count-sessions/:id/download', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const session = await prisma.stockCountSession.findUnique({ where: { id: req.params.id } });
    if (!session?.arquivo) return res.status(404).json({ error: 'Arquivo da contagem não encontrado.' });
    res.download(path.join(__dirname, path.basename(session.arquivo)), session.arquivo);
  } catch (error) { next(error); }
});

app.get('/api/purchase-requests', async (req, res, next) => {
  try {
    const requests = await prisma.purchaseRequest.findMany({ include: { usuario: { select: { id: true, accountKey: true, username: true, nome: true } } }, orderBy: { criadoEm: 'desc' } });
    res.json(requests.map(row => row.usuario?.nome ? { ...row, solicitante: row.usuario.nome } : row));
  } catch (error) { next(error); }
});
app.post('/api/purchase-requests', async (req, res, next) => {
  try {
    if (isKevinAccount(req.user)) return res.status(403).json({ error: 'Kevin01 possui acesso somente para visualizar solicitações.' });
    if (!Array.isArray(req.body.items)) return res.status(400).json({ error: 'Informe a lista items.' });
    const items = req.body.items.map(row => ({
      id: String(row.id || ''), codigo: String(row.codigo || '').trim().slice(0, 50),
      item: String(row.item || '').trim(), quantidade: Math.floor(Number(row.quantidade)),
      unidade: String(row.unidade || ''), solicitante: String(req.user.nome || row.solicitante || '').trim().slice(0, 150),
      justificativa: String(row.justificativa || '').trim().slice(0, 2000),
      usuarioId: req.user.id, status: 'Pendente'
    })).filter(row => /^[0-9a-f-]{36}$/i.test(row.id) && row.item && row.solicitante && row.justificativa && Number.isInteger(row.quantidade) && row.quantidade > 0 && validUnits.has(row.unidade));
    if (items.length !== req.body.items.length) return res.status(400).json({ error: 'Uma ou mais solicitações são inválidas.' });
    await prisma.purchaseRequest.createMany({ data: items, skipDuplicates: true });
    res.json({ ok: true, total: items.length });
  } catch (error) { next(error); }
});
app.patch('/api/purchase-requests/:id/status', purchaseStatusApproverOnly, async (req, res, next) => {
  try {
    const status = String(req.body.status || '');
    if (!['Pendente', 'Aprovada', 'Rejeitada'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    res.json(await prisma.purchaseRequest.update({ where: { id: req.params.id }, data: { status } }));
  } catch (error) { next(error); }
});
app.delete('/api/purchase-requests/:id', async (req, res, next) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido.' });
    const request = await prisma.purchaseRequest.findUnique({ where: { id: req.params.id }, select: { usuarioId: true, solicitante: true } });
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const legacyRequesterNames = { mf01: 'davy', mf02: 'gabriel', mf03: 'visitante' };
    const requesterName = req.user?.nome;
    const requesterAccount = req.user?.role === 'user' && ['mf01', 'mf02', 'mf03'].includes(req.user?.accountKey);
    const submittedName = String(request.solicitante || '').trim().toLowerCase();
    const isRequester = request.usuarioId === req.user.id || submittedName === String(requesterName || '').trim().toLowerCase() || submittedName === legacyRequesterNames[req.user?.accountKey];
    if (!requesterAccount || !isRequester) return res.status(403).json({ error: 'Somente o solicitante pode excluir esta solicitação.' });
    await prisma.purchaseRequest.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, htmlFile)));
app.use((req, res, next) => {
  if (req.method === 'GET' && decodeURIComponent(req.path) === `/${htmlFile}`) return res.sendFile(path.join(__dirname, htmlFile));
  next();
});
for (const asset of ['manifest.webmanifest', 'app-icon.svg', 'app-icon-192.png', 'app-icon-512.png', 'pwa-install.js', 'sw.js', 'api-client.js', 'auth-client.js']) {
  app.get(`/${asset}`, (_req, res) => res.sendFile(path.join(__dirname, asset)));
}
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: 'Falha ao acessar o banco de dados.' });
});
async function startServer() {
  app.listen(port, '0.0.0.0', () => console.log(`MF Estoque disponível na porta ${port}`));
  const initializeDatabase = async () => {
    if (databaseReady) return;
    try {
      const schemaFile = path.join(__dirname, 'schema.prisma');
      const prismaCli = path.join(__dirname, 'node_modules', 'prisma', 'build', 'index.js');
      const { stdout, stderr } = await execFileAsync(process.execPath, [prismaCli, 'db', 'push', '--schema', schemaFile], {
        cwd: __dirname, env: process.env, timeout: 120000, maxBuffer: 10 * 1024 * 1024
      });
      if (stdout.trim()) console.log(stdout.trim());
      if (stderr.trim()) console.warn(stderr.trim());
      await provisionAccounts();
      databaseReady = true;
      console.log('Banco de dados pronto; estrutura existente reutilizada ou criada pelo Prisma.');
    } catch (error) {
      console.error('Não foi possível preparar o banco; nova tentativa em 30 segundos:', String(error.stderr || error.message).trim());
      setTimeout(initializeDatabase, 30000).unref();
    }
  };
  initializeDatabase();
}
startServer();
