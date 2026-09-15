// @vitest-environment jsdom
import React from 'react';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { createDatabase } from '@nursery/db';
import { childFixture } from '../helpers/children.js';
import { httpClient } from '../helpers/http-client.js';
import { buildApp } from '../../apps/api/src/app.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate } from '../../apps/web/src/i18n/catalogs.js';

let f: Awaited<ReturnType<typeof childFixture>>; let backupDir: string; let app: ReturnType<typeof buildApp> | null = null;
afterEach(async () => { cleanup(); if (app) { app.server.closeAllConnections(); await app.close(); app = null; } await f?.close(); if (backupDir) await rm(backupDir, { recursive: true, force: true }); });

it.each(['en', 'ar-EG'] as const)('real HTTP bilingual support screen: status, backup request, reauthenticated restore validation, audit search, account lookup and reset in %s', async (locale) => {
  window.localStorage.clear(); f = await childFixture(false); backupDir = await mkdtemp(join(tmpdir(), 'nursery-support-ui-'));
  // A separate API instance with backups configured (the fixture itself has none), same database and files.
  app = buildApp({ ...f.config, backup: { backupDir, encryptionKey: 'ab'.repeat(32), target: 'none', schedule: '0 2 * * *', retention: { daily: 7, weekly: 4, manual: 4 }, restoreValidationDatabaseUrl: null, restoreValidationFilesDir: null } }, createDatabase(f.config.databaseUrl));
  const origin = await app.listen({ host: '127.0.0.1', port: 0 });
  await f.app.auth.setLocale(f.root.token, locale); const family = await f.children.onboard(f.root.token, f.family('UI')); const staff = await f.staff([f.a.id]);
  const client = httpClient(origin, f.config.appOrigin); await client.login('licensing-system', f.password); const user = userEvent.setup();
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  const view = render(<MemoryRouter initialEntries={['/support/operations']}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: t('support.title') }, { timeout: 15000 });
  expect(await screen.findByText(f.config.installationId)).toBeTruthy(); expect(screen.getByText('0023_support_backups.sql')).toBeTruthy();
  expect(screen.getByText(new RegExp(t('support.workerNever')))).toBeTruthy(); expect(screen.getByText(t('support.offsiteMissing'))).toBeTruthy(); expect(screen.getByText(t('support.restoreNotConfigured'))).toBeTruthy();
  expect(document.documentElement.dir).toBe(locale === 'ar-EG' ? 'rtl' : 'ltr');
  expect(screen.getByRole('link', { name: t('nav.operations') })).toBeTruthy();
  // Manual backup request: audited, listed as REQUESTED until the worker runs it.
  await user.type(screen.getAllByLabelText(t('support.reason'), { exact: false })[0], 'before the term starts');
  await user.click(screen.getByRole('button', { name: t('support.requestBackup') }));
  await screen.findByText(t('support.backupRequested'), {}, { timeout: 15000 });
  await waitFor(() => { const backups = screen.getByRole('table', { name: t('support.backups') }); expect(within(backups).getByText('MANUAL')).toBeTruthy(); expect(within(backups).getByText('REQUESTED')).toBeTruthy(); }, { timeout: 15000 });
  // Once a set succeeded (simulated worker result), restore validation needs the exact archive name and the password again.
  const archive = 'backup-uitest-20260915T000000Z-manual-12345678.tar.enc';
  await f.database.pool.query("update backup_runs set status='SUCCEEDED',started_at=now(),finished_at=now(),archive_name=$1,archive_bytes=42,archive_sha256=repeat('a',64),manifest='{\"counts\":{\"files\":1}}'::jsonb where status='REQUESTED'", [archive]);
  await user.click(screen.getByRole('button', { name: t('support.refresh') }));
  await waitFor(() => expect(within(screen.getByRole('table', { name: t('support.backups') })).getByText('SUCCEEDED')).toBeTruthy(), { timeout: 15000 });
  await user.selectOptions(screen.getByLabelText(t('support.selectBackup'), { exact: false }), archive);
  await user.type(screen.getByLabelText(t('support.confirmArchive'), { exact: false }), 'backup-wrong.tar.enc');
  await user.type(screen.getByLabelText(t('support.operatorPassword'), { exact: false }), f.password);
  await user.type(screen.getAllByLabelText(t('support.reason'), { exact: false })[1], 'quarterly drill');
  await user.click(screen.getByRole('button', { name: t('support.startValidation') }));
  await screen.findByText(t('support.confirmationMismatch'), {}, { timeout: 15000 });
  await user.clear(screen.getByLabelText(t('support.confirmArchive'), { exact: false })); await user.type(screen.getByLabelText(t('support.confirmArchive'), { exact: false }), archive);
  await user.type(screen.getByLabelText(t('support.operatorPassword'), { exact: false }), f.password);
  await user.click(screen.getByRole('button', { name: t('support.startValidation') }));
  await screen.findByText(t('support.validationRequested'), {}, { timeout: 15000 });
  await waitFor(() => expect(within(screen.getByRole('table', { name: t('support.restoreValidation') })).getByText('REQUESTED')).toBeTruthy(), { timeout: 15000 });
  expect((screen.getByLabelText(t('support.operatorPassword'), { exact: false }) as HTMLInputElement).value).toBe('');
  // Audit search finds the support events with the acting username; account lookup finds the parent and resets its password.
  await user.type(screen.getByLabelText(t('support.auditQuery'), { exact: false }), 'restore_validation');
  await user.click(screen.getAllByRole('button', { name: t('support.search') })[0]);
  const audit = await screen.findByRole('table', { name: t('support.audit') }, { timeout: 15000 }); expect(within(audit).getByText('support.restore_validation_requested')).toBeTruthy(); expect(within(audit).getByText('licensing-system')).toBeTruthy();
  await user.type(screen.getByLabelText(t('support.accountQuery'), { exact: false }), 'parent-ui');
  await user.click(screen.getAllByRole('button', { name: t('support.search') })[1]);
  const accounts = await screen.findByRole('table', { name: t('support.accounts') }, { timeout: 15000 }); expect(within(accounts).getByText('parent-ui')).toBeTruthy(); expect(within(accounts).getByText('GUARDIAN')).toBeTruthy();
  await user.click(within(accounts).getByRole('button', { name: t('support.copyId') }));
  const reset = await screen.findByRole('heading', { name: t('support.resetPassword') }); const form = reset.closest('form')!;
  await user.type(within(form).getByLabelText(t('support.operatorPassword'), { exact: false }), f.password);
  await user.click(within(form).getByRole('button', { name: t('support.resetPassword') }));
  await screen.findByText(t('support.resetDone'), {}, { timeout: 15000 }); const temporary = view.container.querySelector('code.auth-temporary')!.textContent!; expect(temporary.length).toBeGreaterThanOrEqual(15);
  expect((await f.app.auth.login('parent-ui', temporary)).account.mustChangePassword).toBe(true);
  const action = async (label: string, reason: string) => {
    const form = screen.getByRole('heading', { name: label }).closest('form')!;
    await user.type(within(form).getByLabelText(t('support.reason'), { exact: false }), reason);
    await user.click(within(form).getByRole('button', { name: label }));
    await within(form).findByText(t('support.actionDone'), {}, { timeout: 15000 });
  };
  await action(t('support.blockParent'), 'manual safeguarding block');
  expect((await f.database.pool.query('select status from accounts where username_normalized=$1', ['parent-ui'])).rows[0].status).toBe('BLOCKED');
  await action(t('support.unblockParent'), 'review completed');
  expect((await f.database.pool.query('select status from accounts where username_normalized=$1', ['parent-ui'])).rows[0].status).toBe('ACTIVE');
  await action(t('support.releaseSeat'), 'duplicate parent account');
  expect((await f.database.pool.query('select status from accounts where username_normalized=$1', ['parent-ui'])).rows[0].status).toBe('RELEASED');
  const restoreForm = screen.getByRole('heading', { name: t('support.restoreAccount') }).closest('form')!;
  await user.type(within(restoreForm).getByLabelText(t('support.reason'), { exact: false }), 'restore valid account');
  await user.click(within(restoreForm).getByRole('button', { name: t('support.restoreAccount') }));
  await within(restoreForm).findByText(t('support.resetDone'), {}, { timeout: 15000 });
  const restoredTemporary = restoreForm.querySelector('code.auth-temporary')!.textContent!;
  expect((await f.app.auth.login('parent-ui', restoredTemporary)).account.mustChangePassword).toBe(true);
  expect((await f.database.pool.query("select count(*)::int as n from seat_reservations s join accounts a on a.id=s.account_id where a.username_normalized='parent-ui' and s.released_at is null")).rows[0].n).toBe(1);
  // Staff lifecycle controls use the same audited licensing service through real HTTP.
  await user.clear(screen.getByLabelText(t('support.accountQuery'), { exact: false })); await user.type(screen.getByLabelText(t('support.accountQuery'), { exact: false }), staff.username);
  await user.click(screen.getAllByRole('button', { name: t('support.search') })[1]);
  const staffAccounts = await screen.findByRole('table', { name: t('support.accounts') }, { timeout: 15000 });
  await waitFor(() => expect(within(staffAccounts).getByText(staff.username)).toBeTruthy(), { timeout: 15000 });
  await user.click(within(within(staffAccounts).getByText(staff.username).closest('tr')!).getByRole('button', { name: t('support.copyId') }));
  await action(t('support.deactivateStaff'), 'staff left temporarily');
  expect((await f.database.pool.query('select status from accounts where id=$1', [staff.id])).rows[0].status).toBe('DISABLED');
  await action(t('support.reactivateStaff'), 'staff returned');
  expect((await f.database.pool.query('select status from accounts where id=$1', [staff.id])).rows[0].status).toBe('ACTIVE');
  // Archival preview and action retain the child row/history while removing it from active product paths.
  await user.type(screen.getByLabelText(t('support.childId'), { exact: false }), family.childIds[0]);
  await user.click(screen.getByRole('button', { name: t('support.preview') }));
  const archiveButton = await screen.findByRole('button', { name: t('support.archiveChild') }, { timeout: 15000 }); const archiveForm = archiveButton.closest('form')!;
  await user.type(within(archiveForm).getByLabelText(t('support.reason'), { exact: false }), 'completed nursery enrollment'); await user.click(archiveButton);
  await screen.findByText(t('support.archived'), {}, { timeout: 15000 });
  expect((await f.database.pool.query('select status from children where id=$1', [family.childIds[0]])).rows[0].status).toBe('ARCHIVED');
  const results = await axe.run(view.container, { rules: { 'color-contrast': { enabled: false } } }); expect(results.violations).toEqual([]);
}, 90_000);
