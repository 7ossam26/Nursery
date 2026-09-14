import { createHash,randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Transaction } from '@nursery/db';
import { normalizeWhatsAppNumber } from '@nursery/domain';
import { announcementInputSchema,communicationQuerySchema,type Announcement,type AnnouncementInput,type NotificationPage,type ParentNotification } from '@nursery/contracts';
import type { ChildService } from '../children/service.js';
import type { LearningService } from '../learning/service.js';
import { requireChild,resolveChild,staffChildScope } from '../children/policy.js';
import { denied,requireCapability,requireRecord,type Policy } from '../organization/policy.js';

// Applied to both target reads and inbox dispatch. A recipient snapshot alone never grants access.
const currentTarget = `(a.id is null or a.target->>'kind' in ('NURSERY','PARENTS','CHILDREN')
 or (a.target->>'kind'='BRANCH' and c.branch_id::text=a.target->>'id')
 or (a.target->>'kind'='CLASSROOM' and c.classroom_id::text=a.target->>'id'))`;
const currentSource = `s.recipient_ids @> array[$1::uuid] and c.status='ACTIVE' and l.active and l.can_read and l.can_notify
 and (s.module_key is distinct from 'FINANCE' or l.can_finance)
 and (s.kind<>'OVERDUE' or exists(select 1 from finance_reminders fn join installment_balances fb on fb.id=fn.installment_id where s.event_key='finance:'||fn.id::text and fb.remaining>0 and fb.due_on<timezone('Africa/Cairo',now())::date))
 and (s.kind<>'RECEIPT' or exists(select 1 from receipts fr where s.event_key='receipt:'||fr.id::text and not exists(
   select 1 from jsonb_array_elements(fr.lines) line where not exists(select 1 from children fc join guardian_child_links fl on fl.child_id=fc.id
    where fc.id=(line->>'childId')::uuid and fl.guardian_id=$1 and fc.status='ACTIVE' and fl.active and fl.can_read and fl.can_finance))))
 and (s.module_key is null or exists(select 1 from module_settings m where m.module_key=s.module_key and m.enabled)) and ${currentTarget}`;
const sourceJoins = `parent_notification_sources s join children c on c.id=s.child_id
 join guardian_child_links l on l.child_id=c.id and l.guardian_id=$1 left join announcements a on a.id=s.announcement_id`;

export class CommunicationService {
  constructor(readonly children: ChildService,readonly learning: LearningService) {}
  private guardian(p: Policy) { if (p.account.kind!=='GUARDIAN' || p.account.mustChangePassword) throw denied(); }
  private async lockLinks(tx: Transaction,p: Policy) {
    this.guardian(p);
    // Match child/link editors' row locks so pause/placement changes cannot commit
    // between target validation and the response transaction's completion.
    await tx.query(`select c.id from children c join guardian_child_links l on l.child_id=c.id
      where l.guardian_id=$1 order by c.id for share of c,l`,[p.account.id]);
  }
  async contact(token: string) {
    return this.children.withPolicy(token,async (tx,p) => {
      this.guardian(p); const row=(await tx.query<{ name: string;phone: string | null }>('select name,contact_phone as phone from nursery_settings where singleton')).rows[0];
      return { name: row?.name ?? 'Nursery',whatsappNumber: row?.phone ? normalizeWhatsAppNumber(row.phone) : null };
    });
  }

  private async targets(tx: Transaction,p: Policy,target: AnnouncementInput['target']) {
    requireCapability(p,'announcements.manage');
    if (target.kind==='NURSERY' && p.account.kind!=='SYSTEM') throw denied();
    if (target.kind==='BRANCH') {
      if (p.account.kind!=='SYSTEM' && p.scope.mode!=='BRANCH') throw denied();
      requireRecord(p,'announcements.manage',{ branchId: target.id });
      if (!(await tx.query('select 1 from branches where id=$1',[target.id])).rowCount) throw denied();
    }
    if (target.kind==='CLASSROOM') {
      const c=(await tx.query<{ branch_id: string }>('select branch_id from classrooms where id=$1',[target.id])).rows[0];
      if (!c) throw denied(); requireRecord(p,'announcements.manage',{ branchId: c.branch_id,classroomId: target.id });
    }
    const t=target;
    if (t.kind==='CHILDREN') for (const id of [...t.ids].sort()) {
      const child=await resolveChild(tx,id); if (child.status!=='ACTIVE') throw denied(); requireChild(p,'announcements.manage',child);
    }
    if (t.kind==='PARENTS') for (const id of [...t.ids].sort()) {
      const witnesses=(await tx.query<{ id: string }>(`select c.id from children c join guardian_child_links l on l.child_id=c.id where l.guardian_id=$1 and l.active and c.status='ACTIVE' order by c.id`,[id])).rows;
      if (!witnesses.length) throw denied();
      for (const witness of witnesses) requireChild(p,'announcements.manage',await resolveChild(tx,witness.id));
    }
    const predicate=t.kind==='NURSERY' ? 'true' : t.kind==='BRANCH' ? 'c.branch_id=$1::uuid' : t.kind==='CLASSROOM' ? 'c.classroom_id=$1::uuid' : t.kind==='CHILDREN' ? 'c.id=any($1::uuid[])' : 'l.guardian_id=any($1::uuid[])';
    const values=t.kind==='NURSERY' ? [] : 'id' in t ? [t.id] : [t.ids];
    return (await tx.query<{ guardian_id: string;child_id: string }>(`select l.guardian_id,l.child_id from guardian_child_links l join children c on c.id=l.child_id where l.active and l.can_read and c.status='ACTIVE' and ${predicate} order by l.guardian_id,l.child_id`,values)).rows;
  }
  async options(token: string,raw: unknown) {
    const q=communicationQuerySchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      const scope=staffChildScope(p,'announcements.manage');
      const children=(await tx.query<{ id: string;fullName: string }>(`select c.id,c.full_name as "fullName" from children c where c.status='ACTIVE' and ${scope.sql} order by c.full_name,c.id limit $5 offset $6`,[...scope.values,q.limit,q.offset])).rows;
      const parents=(await tx.query<{ id: string;fullName: string }>(`select g.account_id as id,g.full_name as "fullName" from guardian_profiles g where exists(select 1 from guardian_child_links l join children c on c.id=l.child_id where l.guardian_id=g.account_id and l.active and c.status='ACTIVE')
        and not exists(select 1 from guardian_child_links l join children c on c.id=l.child_id where l.guardian_id=g.account_id and l.active and c.status='ACTIVE' and not (${scope.sql})) order by g.full_name,g.account_id limit $5 offset $6`,[...scope.values,q.limit,q.offset])).rows;
      return { nursery: p.account.kind==='SYSTEM',
        branches: p.account.kind!=='SYSTEM' && p.scope.mode!=='BRANCH' ? [] : (await tx.query<{ id: string;name: string }>('select id,name from branches where ($1::boolean or id=any($2::uuid[])) order by name,id',scope.values.slice(0,2))).rows,
        classrooms: (await tx.query<{ id: string;name: string }>(`select c.id,c.name from classrooms c where ${scope.sql.replaceAll('c.classroom_id','c.id')} order by c.name,c.id`,scope.values)).rows,
        children,parents };
    });
  }

  async publish(token: string,raw: unknown) {
    const input=announcementInputSchema.parse(raw);
    return this.children.withPolicy(token,(tx,p) => {
      let recipients: { guardian_id: string;child_id: string }[]=[];
      return this.learning.operation(tx,p,input.operationId,{ kind: 'ANNOUNCEMENT',input },async () => { recipients=await this.targets(tx,p,input.target); },async () => {
        const id=randomUUID();
        await tx.query('insert into announcements(id,actor_id,title,body,target,acknowledgment_required,holiday_from,holiday_until) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,p.account.id,input.title,input.body,JSON.stringify(input.target),input.acknowledgmentRequired,input.holiday?.from ?? null,input.holiday?.until ?? null]);
        for (const r of recipients) await tx.query('insert into announcement_recipients(id,announcement_id,guardian_id,child_id) values($1,$2,$3,$4)',[randomUUID(),id,r.guardian_id,r.child_id]);
        await this.children.audit(tx,p,null,'announcement.published',null,{ id,target: input.target,holiday: input.holiday });
        return { id };
      });
    },input.target.kind==='PARENTS' ? input.target.ids : []);
  }

  private async announcementInTransaction(tx: Transaction,p: Policy,id?: string,raw: unknown={}) {
    await this.lockLinks(tx,p); const q=communicationQuerySchema.parse(raw);
    return (await tx.query<Announcement>(`select a.id,a.title,a.body,a.acknowledgment_required as "acknowledgmentRequired",
      exists(select 1 from announcement_acknowledgments ack where ack.announcement_id=a.id and ack.guardian_id=$1) as acknowledged,
      case when a.holiday_from is null then null else json_build_object('from',a.holiday_from::text,'until',a.holiday_until::text) end as holiday
      from announcements a where ($2::uuid is null or a.id=$2) and exists(
        select 1 from announcement_recipients r join children c on c.id=r.child_id join guardian_child_links l on l.child_id=c.id and l.guardian_id=r.guardian_id
        where r.announcement_id=a.id and r.guardian_id=$1 and c.status='ACTIVE' and l.active and l.can_read and ${currentTarget})
      order by a.created_at desc,a.id limit $3 offset $4`,[p.account.id,id ?? null,q.limit,q.offset])).rows;
  }
  async announcements(token: string,raw: unknown) { return this.children.withPolicy(token,(tx,p) => this.announcementInTransaction(tx,p,undefined,raw)); }
  async announcement(token: string,id: string) {
    z.uuid().parse(id); return this.children.withPolicy(token,async (tx,p) => { const a=(await this.announcementInTransaction(tx,p,id))[0]; if (!a) throw denied(); return a; });
  }
  async acknowledge(token: string,id: string) {
    z.uuid().parse(id); return this.children.withPolicy(token,async (tx,p) => {
      const a=(await this.announcementInTransaction(tx,p,id))[0]; if (!a || !a.acknowledgmentRequired) throw denied();
      await tx.query('insert into announcement_acknowledgments(announcement_id,guardian_id) values($1,$2) on conflict do nothing',[id,p.account.id]);
    });
  }

  // Recipient-local durable dispatch on snapshot reads/live ticks, bounded per transaction.
  // ON CONFLICT handles simultaneous tabs/retries without losing independent read state.
  async dispatchInTransaction(tx: Transaction,p: Policy) {
    await this.lockLinks(tx,p);
    await tx.query(`insert into parent_notifications(id,event_key,guardian_id,child_id)
      select gen_random_uuid(),s.event_key,$1,s.child_id from ${sourceJoins} where ${currentSource}
      and not exists(select 1 from parent_notifications n where n.guardian_id=$1 and n.event_key=s.event_key)
      order by s.event_key limit 200 on conflict(event_key,guardian_id) do nothing`,[p.account.id]);
  }
  private visibleSql() {
    return `select distinct on(n.id) n.id,s.kind,s.child_id as "childId",s.business_date::text as date,n.read,s.announcement_id as "announcementId",n.created_at
      from ${sourceJoins} join parent_notifications n on s.event_key=n.event_key
      where n.guardian_id=$1 and ${currentSource} order by n.id,s.child_id`;
  }
  private href(n: ParentNotification & { announcementId: string | null }) {
    if(n.kind==='RECEIPT'||n.kind==='OVERDUE') return `/parent/payments?childId=${n.childId}`;
    return n.announcementId ? `/parent/notices/${n.announcementId}` : `/parent/children/${n.childId}${n.date ? `?date=${n.date}` : ''}`;
  }
  async notifications(token: string,raw: unknown): Promise<NotificationPage> {
    const q=communicationQuerySchema.parse(raw);
    return this.children.withPolicy(token,async (tx,p) => {
      this.guardian(p); await this.dispatchInTransaction(tx,p);
      const result=(await tx.query<{ total: number;unread: number;items: (ParentNotification & { announcementId: string | null })[] }>(`with visible as (${this.visibleSql()}) select (select count(*)::int from visible) as total,(select count(*)::int from visible where not read) as unread,
        coalesce((select json_agg(page) from (select * from visible order by created_at desc,id limit $2 offset $3) page),'[]'::json) as items`,[p.account.id,q.limit,q.offset])).rows[0];
      return { total: result.total,unread: result.unread,items: result.items.map((n) => ({ id: n.id,kind: n.kind,childId: n.childId,date: n.date,read: n.read,href: this.href(n) })) };
    });
  }
  async setRead(token: string,id: string,read: boolean) {
    z.uuid().parse(id); return this.children.withPolicy(token,async (tx,p) => {
      await this.lockLinks(tx,p);
      const n=(await tx.query<{ id: string }>(`with visible as (${this.visibleSql()}) select id from visible where id=$2`,[p.account.id,id])).rows[0];
      if (!n) throw denied(); await tx.query('update parent_notifications set read=$3 where id=$2 and guardian_id=$1',[p.account.id,id,read]);
    });
  }
  async liveSnapshot(token: string,childId?: string) {
    if (childId) z.uuid().parse(childId);
    return this.children.withPolicy(token,async (tx,p) => {
      await this.lockLinks(tx,p); await this.dispatchInTransaction(tx,p);
      const links=(await tx.query(`select c.id,c.branch_id,c.classroom_id,l.version from children c join guardian_child_links l on l.child_id=c.id
        where l.guardian_id=$1 and l.active and l.can_read and c.status='ACTIVE' order by c.id`,[p.account.id])).rows;
      if (childId && !links.some((l) => l.id===childId)) throw denied();
      const liveSource=currentSource.replace(' and l.can_notify','').replace('s.recipient_ids @> array[$1::uuid]','(s.announcement_id is null or s.recipient_ids @> array[$1::uuid])');
      const sources=(await tx.query(`select distinct s.event_key from ${sourceJoins} where ${liveSource} order by s.event_key`,[p.account.id])).rows;
      const notifications=(await tx.query(`with visible as (${this.visibleSql()}) select id,read from visible order by id`,[p.account.id])).rows;
      const acknowledgments=(await tx.query('select announcement_id from announcement_acknowledgments where guardian_id=$1 order by announcement_id',[p.account.id])).rows;
      const modules=(await tx.query('select module_key,enabled,version from module_settings order by module_key')).rows;
      const hash=(v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
      return { access: hash(links),change: hash([sources,notifications,acknowledgments,modules,p.scope.revision]) };
    });
  }
}
