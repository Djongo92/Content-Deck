import { pgTable, text, boolean, real, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";

// Single-user workspace: no user/account columns by design.

export const clientsTable = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#d4a373"),
  archived: boolean("archived").notNull().default(false),
  voice: text("voice").notNull().default(""),
  audience: text("audience").notNull().default(""),
  pillars: jsonb("pillars").$type<string[]>().notNull().default([]),
  approvedTerms: jsonb("approved_terms").$type<string[]>().notNull().default([]),
  avoidedTerms: jsonb("avoided_terms").$type<string[]>().notNull().default([]),
  timezone: text("timezone").notNull().default("UTC"),
  monthlyRetainerHours: real("monthly_retainer_hours").notNull().default(0),
  monthlyDeliverableTarget: integer("monthly_deliverable_target").notNull().default(0),
  monthlyRetainerAmount: real("monthly_retainer_amount").notNull().default(0),
  platforms: jsonb("platforms").$type<string[]>().notNull().default([]),
});

export const briefsTable = pgTable("briefs", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  title: text("title").notNull(),
  objective: text("objective").notNull().default(""),
  essentialFacts: text("essential_facts").notNull().default(""),
  keyMessage: text("key_message").notNull().default(""),
  campaign: text("campaign").notNull().default(""),
  sourceLinks: jsonb("source_links").$type<string[]>().notNull().default([]),
  createdAt: text("created_at").notNull(),
});

export const deliverablesTable = pgTable("deliverables", {
  id: text("id").primaryKey(),
  briefId: text("brief_id"),
  clientId: text("client_id").notNull(),
  platform: text("platform").notNull().default(""),
  format: text("format").notNull().default(""),
  title: text("title").notNull().default(""),
  copy: text("copy").notNull().default(""),
  productionStatus: text("production_status").notNull().default("idea"),
  publishingStatus: text("publishing_status").notNull().default("not-scheduled"),
  owner: text("owner").notNull().default(""),
  productionDueAt: text("production_due_at"),
  publishAt: text("publish_at"),
  publishedAt: text("published_at"),
  assetChecklist: jsonb("asset_checklist").$type<string[]>().notNull().default([]),
  approvedVersionId: text("approved_version_id"),
  currentVersionId: text("current_version_id"),
  estimatedHours: real("estimated_hours").notNull().default(0),
  actualHours: real("actual_hours").notNull().default(0),
  performance: jsonb("performance").$type<Record<string, number>>().notNull().default({}),
  seriesId: text("series_id"),
  createdAt: text("created_at").notNull().default(""),
}, (t) => [
  index("deliverables_client_idx").on(t.clientId),
  index("deliverables_publish_idx").on(t.publishAt),
]);

export const calendarEventsTable = pgTable("calendar_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  eventType: text("event_type").notNull().default("other"),
  clientId: text("client_id"),
  location: text("location").notNull().default(""),
  startAt: text("start_at").notNull(),
  endAt: text("end_at").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [
  index("calendar_events_start_idx").on(t.startAt),
  index("calendar_events_client_idx").on(t.clientId),
]);

export const versionsTable = pgTable("versions", {
  id: text("id").primaryKey(),
  deliverableId: text("deliverableId").notNull(),
  copy: text("copy").notNull().default(""),
  assetIds: jsonb("assetIds").$type<string[]>().notNull().default([]),
  createdAt: text("createdAt").notNull(),
  approvalState: text("approvalState").notNull().default("pending"),
  approver: text("approver"),
  approvalTimestamp: text("approvalTimestamp"),
}, (t) => [index("versions_deliverable_idx").on(t.deliverableId)]);

export const assetsTable = pgTable("assets", {
  id: text("id").primaryKey(),
  clientId: text("clientId").notNull().default(""),
  name: text("name").notNull().default(""),
  type: text("type").notNull().default("image"),
  fileUrl: text("fileUrl").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  credit: text("credit").notNull().default(""),
  rightsExpiry: text("rightsExpiry"),
  altText: text("altText").notNull().default(""),
});

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  text: text("text").notNull().default(""),
  done: boolean("done").notNull().default(false),
  createdAt: text("createdAt").notNull().default(""),
});

export const notesTable = pgTable("notes", {
  id: text("id").primaryKey(),
  date: text("date").notNull().default(""),
  text: text("text").notNull().default(""),
  title: text("title").notNull().default(""),
  url: text("url").notNull().default(""),
  kind: text("kind").notNull().default("idea"), // idea | capture
});

// Performance snapshots over time (powers trends + best-time suggestions)
export const metricsTable = pgTable("metrics", {
  id: text("id").primaryKey(),
  deliverableId: text("deliverable_id").notNull(),
  capturedAt: text("captured_at").notNull(),
  views: real("views").notNull().default(0),
  likes: real("likes").notNull().default(0),
  comments: real("comments").notNull().default(0),
  shares: real("shares").notNull().default(0),
  clicks: real("clicks").notNull().default(0),
  source: text("source").notNull().default("manual"), // manual | import | api
}, (t) => [index("metrics_deliverable_idx").on(t.deliverableId)]);

// Recurring content templates ("weekly recap every Friday for client X")
export const templatesTable = pgTable("templates", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  title: text("title").notNull(),
  platform: text("platform").notNull().default(""),
  format: text("format").notNull().default(""),
  copyTemplate: text("copy_template").notNull().default(""),
  checklist: jsonb("checklist").$type<string[]>().notNull().default([]),
  estimatedHours: real("estimated_hours").notNull().default(0),
  frequency: text("frequency").notNull().default("weekly"), // weekly | biweekly | monthly
  dayOfWeek: integer("day_of_week").notNull().default(5), // 0=Sun
  timeOfDay: text("time_of_day").notNull().default("09:00"),
  active: boolean("active").notNull().default(true),
  lastGeneratedOn: text("last_generated_on"), // YYYY-MM-DD
});

// Client review links: frozen version snapshots approvable without an account
export const reviewLinksTable = pgTable("review_links", {
  token: text("token").primaryKey(),
  deliverableId: text("deliverable_id").notNull(),
  versionId: text("version_id").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | changes-requested | expired
  approverName: text("approver_name"),
  comment: text("comment"),
  respondedAt: text("responded_at"),
});

// Voice learning signal: what was kept, edited, or rejected per client
export const voiceExamplesTable = pgTable("voice_examples", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull(),
  kind: text("kind").notNull(), // kept | edited | rejected
  original: text("original").notNull().default(""),
  final: text("final").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (t) => [index("voice_client_idx").on(t.clientId)]);

// Versioned full-state backups (daily auto-snapshot)
export const snapshotsTable = pgTable("snapshots", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  reason: text("reason").notNull().default("auto"),
  state: jsonb("state").notNull(),
});

export type ClientRow = typeof clientsTable.$inferSelect;
export type DeliverableRow = typeof deliverablesTable.$inferSelect;
