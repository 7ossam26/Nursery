import { z } from 'zod';

const ids = z.array(z.uuid()).min(1).max(100).refine((v) => new Set(v).size === v.length);
export const announcementTargetSchema = z.discriminatedUnion('kind',[
  z.object({ kind: z.literal('NURSERY') }).strict(),
  z.object({ kind: z.literal('BRANCH'),id: z.uuid() }).strict(),
  z.object({ kind: z.literal('CLASSROOM'),id: z.uuid() }).strict(),
  z.object({ kind: z.literal('PARENTS'),ids }).strict(),
  z.object({ kind: z.literal('CHILDREN'),ids }).strict()
]);
export const announcementInputSchema = z.object({ operationId: z.uuid(),title: z.string().trim().min(1).max(160),body: z.string().trim().min(1).max(2000),target: announcementTargetSchema,acknowledgmentRequired: z.boolean(),
  holiday: z.object({ from: z.iso.date(),until: z.iso.date() }).strict().refine((v) => v.until >= v.from).nullable().default(null)
}).strict();
export const communicationQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20),offset: z.coerce.number().int().min(0).max(100000).default(0) }).strict();
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
export type Announcement = { id: string;title: string;body: string;acknowledgmentRequired: boolean;acknowledged: boolean;holiday: AnnouncementInput['holiday'] };
export const notificationKinds = ['LEARNING','HOMEWORK','INCIDENT','UNEXPECTED_ABSENCE','PLANNED_ABSENCE','ANNOUNCEMENT','HOLIDAY','RECEIPT','OVERDUE'] as const;
export type NotificationKind = typeof notificationKinds[number];
export type ParentNotification = { id: string;kind: NotificationKind;childId: string;date: string | null;read: boolean;href: string };
export type NotificationPage = { items: ParentNotification[];unread: number;total: number };
