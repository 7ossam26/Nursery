// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor,fireEvent } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { ComponentPreview } from '../features/design-system/ComponentPreview.js';
import { LanguageSwitcher } from '../layout/AppShell.js';
import { LocaleProvider, useLocale } from '../i18n/LocaleProvider.js';
import { Modal } from './Modal.js';
import { Button,DateField } from './controls.js';
import { Badge,PageHeader } from './data-display.js';

beforeEach(() => {
  window.localStorage.clear();
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});

afterEach(cleanup);

function LocaleHarness() {
  const { t } = useLocale();
  return <><LanguageSwitcher /><span>{t('status.paid')}</span><code>paid</code></>;
}

describe('component accessibility and interaction', () => {
  it('blocks invalid visible business dates instead of submitting the previous valid date',()=>{
    function Harness() {const [value,setValue]=useState('2026-09-14');return <form><DateField label="Collection date" value={value} onValueChange={setValue} required/></form>;}
    render(<Harness/>);const input=screen.getByLabelText('Collection date',{exact:false}) as HTMLInputElement;
    expect(input.value).toBe('14/09/2026');fireEvent.change(input,{target:{value:'31/02/2026'}});expect(input.validity.customError).toBe(true);expect(input.form!.checkValidity()).toBe(false);
    fireEvent.change(input,{target:{value:'15/09/2026'}});expect(input.validity.customError).toBe(false);expect(input.form!.checkValidity()).toBe(true);
  });
  it('switches copy and document direction without changing a stored business value', async () => {
    const user = userEvent.setup();
    render(<LocaleProvider><LocaleHarness /></LocaleProvider>);
    expect(document.documentElement).toHaveProperty('dir', 'ltr');
    await user.click(screen.getByRole('button', { name: 'العربية' }));
    expect(document.documentElement).toHaveProperty('dir', 'rtl');
    expect(screen.getByText('تم السداد')).toBeTruthy();
    expect(screen.getByText('paid')).toBeTruthy();
    expect(window.localStorage.getItem('nursery.locale')).toBe('ar-EG');
  });

  it('restores keyboard focus to the dialog trigger after closing', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><Button onClick={() => setOpen(true)}>Open</Button><Modal open={open} title="Confirm" closeLabel="Close" onClose={() => setOpen(false)}>Dialog body</Modal></>;
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);
    expect(screen.getByRole('dialog').hasAttribute('open')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('keeps shared action variants semantic while exposing their visual states', () => {
    render(<>
      <Button variant="danger" loading>Remove</Button>
      <Button variant="success" disabled>Approve</Button>
      <Button variant="outline" size="compact" iconOnly icon="refresh" aria-label="Refresh"><span className="visually-hidden">Refresh</span></Button>
      <Badge tone="warning">Pending</Badge>
    </>);
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(remove.getAttribute('aria-busy')).toBe('true');
    expect(remove.hasAttribute('disabled')).toBe(false);
    expect(remove.className).toContain('button--danger');
    expect(screen.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Refresh' }).className).toContain('button--compact');
    expect(screen.getByText('Pending').className).toContain('badge--warning');
  });

  it('groups page actions and describes dialogs only when description copy exists', () => {
    const { rerender } = render(<><PageHeader title="Children" description="Manage child records" actions={<Button>Add</Button>} /><Modal open title="Confirm" description="Review this action" closeLabel="Close" onClose={() => undefined}>Body</Modal></>);
    expect(screen.getByRole('heading', { level: 1, name: 'Children' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add' }).parentElement?.className).toContain('action-group');
    expect(screen.getByRole('dialog').getAttribute('aria-describedby')).toBeTruthy();
    rerender(<Modal open title="Confirm" closeLabel="Close" onClose={() => undefined}>Body</Modal>);
    expect(screen.getByRole('dialog').hasAttribute('aria-describedby')).toBe(false);
  });

  it.each([
    { locale: 'en', direction: 'ltr', heading: 'Design system preview', field: /Display name/, navigation: 'Main navigation', table: 'Accessible roster' },
    { locale: 'ar-EG', direction: 'rtl', heading: 'معاينة نظام التصميم', field: /الاسم الظاهر/, navigation: 'التنقل الرئيسي', table: 'كشف أطفال سهل الاستخدام' }
  ] as const)('renders the $direction representative preview without automated accessibility violations', async ({ locale, direction, heading, field, navigation, table }) => {
    const { container } = render(<MemoryRouter initialEntries={['/__preview/parent/home']}><LocaleProvider userLocale={locale}><ComponentPreview /></LocaleProvider></MemoryRouter>);
    expect(document.documentElement.dir).toBe(direction);
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: field })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: navigation })).toBeTruthy();
    expect(screen.getByRole('table', { name: table })).toBeTruthy();
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});
