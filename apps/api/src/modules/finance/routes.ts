import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FinancialCore } from './core.js';
import { LedgerService } from './ledger.js';
import { TreasuryService } from './treasury.js';
import { PaymentService } from './payments.js';
declare module 'fastify' { interface FastifyInstance { financialCore:FinancialCore;ledger:LedgerService;treasury:TreasuryService;payments:PaymentService } }
export function installFinance(app:FastifyInstance) {
  const core=new FinancialCore(app.children),ledger=new LedgerService(core),treasury=new TreasuryService(core),payments=new PaymentService(core,ledger,treasury);
  app.decorate('financialCore',core);app.decorate('ledger',ledger);app.decorate('treasury',treasury);app.decorate('payments',payments);
  const id=(raw:unknown)=>z.object({id:z.uuid()}).strict().parse(raw).id;
  app.get('/api/v1/finance/options',async r=>({data:await treasury.options(r.sessionToken)}));
  app.get('/api/v1/finance/accounts',async r=>({data:await treasury.accounts(r.sessionToken,r.query)}));
  app.post('/api/v1/finance/accounts',async r=>({data:await treasury.createAccount(r.sessionToken,r.body)}));
  app.post('/api/v1/finance/branches/:id/default-account',async r=>({data:await treasury.setDefault(r.sessionToken,id(r.params),r.body)}));
  app.get('/api/v1/finance/accounts/:id/movements',async r=>({data:await treasury.movements(r.sessionToken,id(r.params),r.query)}));
  app.get('/api/v1/finance/categories',async r=>({data:await ledger.categories(r.sessionToken)}));
  app.post('/api/v1/finance/categories',async r=>({data:await ledger.category(r.sessionToken,r.body)}));
  app.get('/api/v1/finance/balances',async r=>({data:await ledger.balances(r.sessionToken,r.query)}));
  app.get('/api/v1/finance/children/:id/balances',async r=>({data:await ledger.balances(r.sessionToken,r.query,id(r.params))}));
  app.post('/api/v1/finance/obligations',{bodyLimit:65536},async r=>({data:await ledger.createObligation(r.sessionToken,r.body)}));
  app.post('/api/v1/payments',{bodyLimit:262144},async r=>({data:await payments.collect(r.sessionToken,r.body)}));
  app.post('/api/v1/finance/credit-receipts',async r=>({data:await payments.receiveCredit(r.sessionToken,r.body)}));
  app.post('/api/v1/finance/credit-applications',{bodyLimit:65536},async r=>({data:await payments.applyCredit(r.sessionToken,r.body)}));
  app.get('/api/v1/finance/receipts',async r=>({data:await payments.receipts(r.sessionToken,r.query)}));
  app.get('/api/v1/finance/receipts/:id',async r=>({data:await payments.getReceipt(r.sessionToken,id(r.params))}));
  app.get('/api/v1/finance/operations/:id',async r=>({data:await core.operationStatus(r.sessionToken,id(r.params))}));
}
