// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axe from 'axe-core';
import { safetyFixture } from '../helpers/safety.js';
import { httpClient } from '../helpers/http-client.js';
import { App } from '../../apps/web/src/App.js';
import { LocaleProvider } from '../../apps/web/src/i18n/LocaleProvider.js';
import { translate, type Locale } from '../../apps/web/src/i18n/catalogs.js';
import type { AuthClient } from '../../apps/web/src/features/auth/client.js';
describe('Phase 07 bilingual scripted DOM against HTTP and real PostgreSQL',() => {
  let f: Awaited<ReturnType<typeof safetyFixture>>; let origin: string;
  beforeEach(async () => { window.localStorage.clear(); f = await safetyFixture(false); origin = await f.app.listen({ host: '127.0.0.1',port: 0 }); },30000);
  afterEach(async () => { cleanup(); await f?.close(); },30000);
  function mount(client: AuthClient,locale: Locale,path: string) { return render(<MemoryRouter initialEntries={[path]}><LocaleProvider userLocale={locale}><App authClient={client} /></LocaleProvider></MemoryRouter>); }
  // List items mix several text nodes; regex matchers compare the full item text rather than one node.
  const rx = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  const noViolations = async (container: HTMLElement) => expect((await axe.run(container,{ rules: { 'color-contrast': { enabled: false } } })).violations).toEqual([]);
  it.each(['en','ar-EG'] as const)('guardian adds a one-day collector, staff records a confirmed release, health and incidents, and a disabled health module keeps the staff emergency view in %s',async (locale) => {
    const t = (key: Parameters<typeof translate>[1],values?: Record<string,string | number>) => translate(locale,key,values); const user = userEvent.setup();
    const family = await f.onboardFamily('UI'); await f.app.auth.setLocale(family.first.token,locale);
    const parentClient = httpClient(origin,f.config.appOrigin); await parentClient.login('parent-ui',`Permanent guardian secret ${family.guardianIds[0]}`);
    const parentView = mount(parentClient,locale,`/parent/children/${family.childId}`);
    await screen.findByRole('heading',{ name: 'Child UI' }); const add = await screen.findByRole('group',{ name: t('safety.addPerson'),exact: true });
    await user.type(within(add).getByLabelText(t('children.fullName'),{ exact: false }),'UI Uncle'); await user.type(within(add).getByLabelText(t('children.mobile'),{ exact: false }),'01000000021'); await user.type(within(add).getByLabelText(t('children.relationship'),{ exact: false }),'Uncle');
    expect((within(add).getByLabelText(t('safety.oneDay')) as HTMLInputElement).checked).toBe(true); await user.click(within(add).getByRole('button',{ name: t('safety.addPerson') }));
    await screen.findByText(/UI Uncle/,{},{ timeout: 15000 }); expect(screen.queryByRole('heading',{ name: t('safety.emergency') })).toBeNull(); expect(screen.queryByText(t('safety.blocker.REVIEW_REQUIRED'))).toBeNull();
    expect(document.documentElement.dir).toBe(locale === 'en' ? 'ltr' : 'rtl'); await noViolations(parentView.container); cleanup();
    const staff = await f.safetyStaff(['health.read','health.manage','pickup.record','pickup.manage','incidents.read','incidents.manage'],[f.a.id]); await f.app.auth.setLocale(staff.token,locale);
    const staffClient = httpClient(origin,f.config.appOrigin); await staffClient.login(staff.username,staff.password); const staffView = mount(staffClient,locale,`/administration/children/${family.childId}`);
    await screen.findByRole('heading',{ name: t('safety.emergency') },{ timeout: 15000 });
    const whatsapp = screen.getAllByRole('link',{ name: t('safety.whatsapp') }); expect(whatsapp.map((a) => a.getAttribute('href'))).toEqual(['https://wa.me/201000000000','https://wa.me/201000000002']); expect(whatsapp[0].getAttribute('rel')).toContain('noopener');
    const health = screen.getByRole('group',{ name: t('safety.addEntry'),exact: true });
    await user.type(within(health).getByLabelText(t('safety.entryTitle'),{ exact: false }),'Peanuts'); await user.selectOptions(within(health).getByRole('combobox',{ name: t('safety.severity') }),'CRITICAL'); await user.click(within(health).getByRole('button',{ name: t('safety.addEntry') }));
    await screen.findByText(/Peanuts/,{},{ timeout: 15000 });
    const authorization = (await f.safety.staffView(staff.token,family.childId)).pickup!.authorizations.find((a) => a.fullName === 'UI Uncle')!;
    const release = screen.getByRole('group',{ name: t('safety.record'),exact: true });
    await user.selectOptions(within(release).getByRole('combobox',{ name: t('safety.collector') }),`A:${authorization.id}`); await user.selectOptions(within(release).getByRole('combobox',{ name: t('safety.calledGuardian') }),family.guardianIds[0]);
    await user.click(within(release).getByRole('button',{ name: t('safety.record') }));
    await screen.findByText(t('safety.callNotConfirmed'),{},{ timeout: 15000 }); expect((await f.safety.staffView(staff.token,family.childId)).pickup!.records).toEqual([]);
    await user.click(within(release).getByLabelText(t('safety.callConfirmed'))); await user.click(within(release).getByRole('button',{ name: t('safety.record') }));
    await screen.findByText(rx(t('safety.collectedBy',{ name: 'UI Uncle',relationship: 'Uncle',guardian: 'Parent UI' })),{},{ timeout: 15000 });
    const incident = screen.getByRole('group',{ name: t('safety.report'),exact: true });
    fireEvent.change(within(incident).getByLabelText(t('safety.occurredTime'),{ exact: false }),{ target: { value: '10:15' } });
    await user.type(within(incident).getByLabelText(t('safety.description')),'Fell in the yard'); await user.type(within(incident).getByLabelText(t('safety.actionTaken')),'Ice pack applied'); await user.click(within(incident).getByRole('button',{ name: t('safety.report') }));
    // The description textarea also contains the typed text until the accepted report resets it; wait for the rendered list item.
    await screen.findByText(rx(t('safety.notInformed')),{},{ timeout: 15000 }); expect(screen.getAllByText(/Fell in the yard/).map((n) => n.tagName)).toEqual(['LI']);
    expect((await f.database.pool.query("select recipient_ids from notification_events where child_id=$1 and kind='incident.reported'",[family.childId])).rows[0].recipient_ids).toEqual([family.guardianIds[0]]);
    await noViolations(staffView.container);
    await f.setModule('HEALTH',false); fireEvent.focus(window);
    await screen.findByText(t('safety.healthDisabled'),{},{ timeout: 15000 }); expect(screen.getByText(/Peanuts/)).toBeTruthy(); expect(screen.queryByRole('group',{ name: t('safety.addEntry'),exact: true })).toBeNull();
    cleanup(); const again = httpClient(origin,f.config.appOrigin); await again.login('parent-ui',`Permanent guardian secret ${family.guardianIds[0]}`); mount(again,locale,`/parent/children/${family.childId}`);
    await screen.findByRole('heading',{ name: t('safety.pickup') },{ timeout: 15000 }); expect(screen.queryByText(/Peanuts/)).toBeNull(); expect(screen.queryByRole('heading',{ name: t('safety.health') })).toBeNull();
    expect(screen.getByText(/Fell in the yard/)).toBeTruthy(); expect(screen.queryByText(/wa\.me/)).toBeNull();
  },60000);
});
