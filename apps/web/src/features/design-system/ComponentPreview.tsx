import { useState } from 'react';
import { formatDateOnly, formatEgp, piastres } from '@nursery/domain';
import { Button, DateField, ErrorSummary, SelectField, TextField } from '../../components/controls.js';
import { Icon } from '../../components/Icon.js';
import { Modal } from '../../components/Modal.js';
import { Card, ResponsiveTable, Skeleton, StatePanel, type TableColumn } from '../../components/surfaces.js';
import { Avatar, Badge, EmptyState, StatCard, StatGrid } from '../../components/data-display.js';
import { useLocale } from '../../i18n/LocaleProvider.js';
import { AppShell } from '../../layout/AppShell.js';
import type { ShellRole } from '../../layout/navigation.js';

const sampleCatalogs = {
  en: { childOne: 'Mariam Hassan', childTwo: 'Youssef Adel', sunflowers: 'Sunflowers', butterflies: 'Butterflies' },
  'ar-EG': { childOne: 'مريم حسن', childTwo: 'يوسف عادل', sunflowers: 'عباد الشمس', butterflies: 'الفراشات' }
} as const;

type PreviewRow = Readonly<{ id: string; nameKey: 'childOne' | 'childTwo'; classroomKey: 'sunflowers' | 'butterflies'; statusKey: 'preview.present' | 'preview.pending' }>;
const rows: readonly PreviewRow[] = [
  { id: 'child-001', nameKey: 'childOne', classroomKey: 'sunflowers', statusKey: 'preview.present' },
  { id: 'child-002', nameKey: 'childTwo', classroomKey: 'butterflies', statusKey: 'preview.pending' }
];

export function ComponentPreview() {
  const { locale, t } = useLocale();
  const [role, setRole] = useState<ShellRole>('parent');
  const [name, setName] = useState('M');
  const [businessDate, setBusinessDate] = useState('2026-09-13');
  const [classroom, setClassroom] = useState('sunflowers');
  const [modalOpen, setModalOpen] = useState(false);
  const samples = sampleCatalogs[locale];
  const nameError = name.trim().length < 2 ? t('form.nameError') : undefined;
  const columns: readonly TableColumn<PreviewRow>[] = [
    { key: 'name', heading: t('preview.childName'), cell: (row) => samples[row.nameKey] },
    { key: 'classroom', heading: t('preview.classroom'), cell: (row) => samples[row.classroomKey] },
    { key: 'status', heading: t('preview.status'), cell: (row) => <span className={`status status--${row.statusKey === 'preview.present' ? 'success' : 'warning'}`}>{t(row.statusKey)}</span> }
  ];

  return <AppShell role={role} pathPrefix="/__preview"><main>
    <div className="preview-notice" role="note">{t('shell.previewNotice')}</div>
    <header className="page-header"><div><span className="eyebrow">{t('preview.phase')}</span><h1>{t('preview.title')}</h1><p>{t('preview.description')}</p></div>
      <SelectField label={t('preview.persona')} value={role} onChange={(event) => setRole(event.target.value as ShellRole)}>
        <option value="parent">{t('role.parent')}</option><option value="teacher">{t('role.teacher')}</option><option value="administration">{t('role.administration')}</option><option value="support">{t('role.support')}</option>
      </SelectField>
    </header>

    <StatGrid label={t('preview.metrics')}>
      <StatCard tone="cyan" icon="children" label={t('preview.attendance')} value="18 / 20" numeric />
      <StatCard tone="warning" icon="classroom" label={t('preview.homework')} countTo={2} value={2} numeric meta={<span className="status status--warning"><Icon name="warning" />{t('preview.pending')}</span>} />
      <StatCard tone="magenta" icon="finance" label={t('preview.upcoming')} value={formatEgp(piastres(125050n))} numeric meta={formatDateOnly('2026-09-30')} />
    </StatGrid>

    <section className="task-grid" aria-label={t('preview.components')}>
      <Card className="task-card task-card--pink"><span>{t('preview.attendance')}</span><strong>18 / 20</strong><Button variant="secondary" icon="arrow">{t('preview.attendance')}</Button></Card>
      <Card className="task-card task-card--yellow"><span>{t('preview.homework')}</span><strong>2</strong><span className="status status--warning">{t('preview.pending')}</span></Card>
      <Card className="task-card task-card--peach"><span>{t('preview.upcoming')}</span><strong className="numeric">{formatEgp(piastres(125050n))}</strong><span>{formatDateOnly('2026-09-30')}</span></Card>
    </section>

    <div className="preview-grid">
      <Card title={t('preview.forms')}>
        <form className="form-stack" onSubmit={(event) => event.preventDefault()} noValidate>
          <ErrorSummary title={t('form.errorSummary')} errors={nameError ? [{ fieldId: 'preview-name', message: nameError }] : []} />
          <TextField id="preview-name" label={t('form.name')} hint={t('form.nameHint')} error={nameError} required value={name} onChange={(event) => setName(event.target.value)} />
          <DateField id="preview-date" label={t('form.date')} hint={t('form.dateHint')} required value={businessDate} onValueChange={setBusinessDate} />
          <SelectField id="preview-classroom" label={t('form.classroom')} value={classroom} onChange={(event) => setClassroom(event.target.value)}>
            <option value="">{t('form.chooseClassroom')}</option><option value="sunflowers">{samples.sunflowers}</option><option value="butterflies">{samples.butterflies}</option>
          </SelectField>
          <div className="stored-values" aria-live="polite"><span>{t('preview.savedValue')}</span><code>{JSON.stringify({ localeNeutralStatus: 'paid', businessDate, classroom })}</code></div>
          <div className="button-row"><Button type="submit" icon="check">{t('form.save')}</Button><Button variant="secondary" onClick={() => setModalOpen(true)}>{t('preview.openModal')}</Button></div>
        </form>
      </Card>
      <Card title={t('preview.states')}><div className="state-stack"><Skeleton label={t('state.loading')} /><StatePanel tone="empty" title={t('state.emptyTitle')} body={t('state.emptyBody')} /><StatePanel tone="error" title={t('state.errorTitle')} body={t('state.errorBody')} actionLabel={t('state.retry')} /><EmptyState title={t('preview.emptyTitle')} body={t('preview.emptyBody')} /><div className="button-row"><Button loading>{t('auth.working')}</Button><Button variant="secondary" settled icon="check">{t('form.save')}</Button><Button variant="danger">{t('form.cancel')}</Button></div><div className="button-row"><Avatar name={samples.childOne} /><Badge>{t('preview.classroom')}</Badge><Badge tone="count">2</Badge><span className="status status--success"><Icon name="check" />{t('preview.present')}</span></div></div></Card>
    </div>

    <Card title={t('preview.table')}><ResponsiveTable caption={t('preview.table')} columns={columns} rows={rows} rowKey={(row) => row.id} /></Card>

    <Modal open={modalOpen} title={t('preview.modalTitle')} closeLabel={t('common.close')} onClose={() => setModalOpen(false)} footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>{t('form.cancel')}</Button><Button icon="check" onClick={() => setModalOpen(false)}>{t('form.confirm')}</Button></>}><p>{t('preview.modalBody')}</p><p className="numeric">{formatEgp(piastres(125050n))} · {locale === 'ar-EG' ? 'RTL' : 'LTR'}</p></Modal>
  </main></AppShell>;
}
