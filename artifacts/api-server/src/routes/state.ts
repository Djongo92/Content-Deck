import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { desc, eq, gte, inArray } from "drizzle-orm";
import {
  db,
  clientsTable,
  briefsTable,
  deliverablesTable,
  versionsTable,
  assetsTable,
  tasksTable,
  notesTable,
  metricsTable,
  templatesTable,
  voiceExamplesTable,
  snapshotsTable,
  launchTasksTable,
  launchLeadsTable,
  launchNotesTable,
  launchGatesTable,
  launchSettingsTable,
  launchActivityTable,
} from "@workspace/db";
import { calendarEventsTable } from "@workspace/db/schema";

const router: IRouter = Router();

const ENTITY_TABLES = {
  clients: clientsTable,
  briefs: briefsTable,
  deliverables: deliverablesTable,
  events: calendarEventsTable,
  versions: versionsTable,
  assets: assetsTable,
  tasks: tasksTable,
  notes: notesTable,
  metrics: metricsTable,
  templates: templatesTable,
  voiceExamples: voiceExamplesTable,
  launchTasks: launchTasksTable,
  launchLeads: launchLeadsTable,
  launchNotes: launchNotesTable,
  launchGates: launchGatesTable,
  launchSettings: launchSettingsTable,
  launchActivity: launchActivityTable,
} as const;

type EntityKey = keyof typeof ENTITY_TABLES;

async function assembleState() {
  const [
    clients, briefs, deliverables, events, versions, assets, tasks, notes, metrics, templates, voiceExamples,
    launchTasks, launchLeads, launchNotes, launchGates, launchSettings, launchActivity,
  ] =
    await Promise.all([
      db.select().from(clientsTable),
      db.select().from(briefsTable),
      db.select().from(deliverablesTable),
      db.select().from(calendarEventsTable),
      db.select().from(versionsTable),
      db.select().from(assetsTable),
      db.select().from(tasksTable),
      db.select().from(notesTable),
      db.select().from(metricsTable),
      db.select().from(templatesTable),
      db.select().from(voiceExamplesTable),
      db.select().from(launchTasksTable),
      db.select().from(launchLeadsTable),
      db.select().from(launchNotesTable),
      db.select().from(launchGatesTable),
      db.select().from(launchSettingsTable),
      db.select().from(launchActivityTable),
    ]);
  return {
    clients, briefs, deliverables, events, versions, assets, tasks, notes, metrics, templates, voiceExamples,
    launchTasks, launchLeads, launchNotes, launchGates, launchSettings, launchActivity,
  };
}

router.get("/state", async (_req: Request, res: Response) => {
  try {
    res.json(await assembleState());
  } catch (error) {
    res.status(500).json({ error: "Failed to load workspace state" });
  }
});

/**
 * Last-write-wins sync. The frontend is the optimistic source of truth;
 * single-user workload makes conflicts rare and benign.
 */
router.post("/sync", async (req: Request, res: Response) => {
  const { upserts = {}, deletes = {} } = (req.body ?? {}) as {
    upserts?: Partial<Record<EntityKey, Record<string, unknown>[]>>;
    deletes?: Partial<Record<EntityKey, string[]>>;
  };

  const errors: string[] = [];

  for (const key of Object.keys(ENTITY_TABLES) as EntityKey[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = ENTITY_TABLES[key] as any;
    const rows = upserts[key];
    if (Array.isArray(rows)) {
      for (const row of rows.slice(0, 500)) {
        if (!row || typeof row.id !== "string" || !row.id) continue;
        try {
          await db.insert(table).values(row).onConflictDoUpdate({ target: table.id, set: row });
        } catch (error) {
          errors.push(`${key}:${row.id}`);
        }
      }
    }
    const delIds = deletes[key];
    if (Array.isArray(delIds) && delIds.length) {
      try {
        await db.delete(table).where(inArray(table.id, delIds.slice(0, 500)));
      } catch (error) {
        errors.push(`${key}:delete`);
      }
    }
  }

  if (errors.length) {
    // Non-2xx so the client re-queues failed rows instead of dropping them.
    res.status(500).json({ ok: false, failed: errors });
    return;
  }
  res.json({ ok: true });
});

// --- Automatic versioned backups -------------------------------------------

async function createSnapshot(reason: string) {
  const state = await assembleState();
  const id = randomUUID();
  await db.insert(snapshotsTable).values({ id, createdAt: new Date().toISOString(), reason, state });
  // Keep the 90 most recent snapshots
  const old = await db
    .select({ id: snapshotsTable.id })
    .from(snapshotsTable)
    .orderBy(desc(snapshotsTable.createdAt))
    .offset(90)
    .limit(1000);
  if (old.length) {
    await db.delete(snapshotsTable).where(inArray(snapshotsTable.id, old.map((r) => r.id)));
  }
  return id;
}

router.post("/backups/auto", async (_req: Request, res: Response) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const existing = await db
      .select({ id: snapshotsTable.id })
      .from(snapshotsTable)
      .where(gte(snapshotsTable.createdAt, todayStart.toISOString()))
      .limit(1);
    if (existing.length) {
      res.json({ created: false });
      return;
    }
    const id = await createSnapshot("auto-daily");
    res.json({ created: true, id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create automatic backup" });
  }
});

router.post("/backups", async (req: Request, res: Response) => {
  try {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 80) : "manual";
    const id = await createSnapshot(reason);
    res.json({ created: true, id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create backup" });
  }
});

router.get("/backups", async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ id: snapshotsTable.id, createdAt: snapshotsTable.createdAt, reason: snapshotsTable.reason })
      .from(snapshotsTable)
      .orderBy(desc(snapshotsTable.createdAt))
      .limit(90);
    res.json({ backups: rows });
  } catch (error) {
    res.status(500).json({ error: "Failed to list backups" });
  }
});

router.get("/backups/:id", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(snapshotsTable).where(eq(snapshotsTable.id, String(req.params.id))).limit(1);
    if (!rows.length) {
      res.status(404).json({ error: "Backup not found" });
      return;
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to load backup" });
  }
});

// --- Quick capture (bookmarklet / share target) ----------------------------

const CAPTURE_PAGE = (title: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Saved</title>
<style>body{background:#141110;color:#f5efe6;font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
div{text-align:center;max-width:420px;padding:24px}p{color:#a89f92;font-family:system-ui;font-size:14px}</style></head>
<body><div><h1>Saved to Content Desk</h1><p>${title}</p><p>You can close this tab.</p></div>
<script>setTimeout(()=>window.close(),2500)</script></body></html>`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

async function saveCapture(url: string, title: string, text: string) {
  const note = {
    id: randomUUID(),
    date: new Date().toISOString(),
    text: (text || title || url || "Captured link").slice(0, 2000),
    title: title.slice(0, 300),
    url: url.slice(0, 2000),
    kind: "capture",
  };
  await db.insert(notesTable).values(note);
  return note;
}

router.get("/capture", async (req: Request, res: Response) => {
  const url = String(req.query.url ?? "");
  const title = String(req.query.title ?? "");
  const text = String(req.query.text ?? "");
  try {
    await saveCapture(url, title, text);
    res.type("html").send(CAPTURE_PAGE(escapeHtml(title || url || "Idea captured")));
  } catch (error) {
    res.status(500).json({ error: "Failed to save capture" });
  }
});

router.post("/capture", async (req: Request, res: Response) => {
  const { url = "", title = "", text = "" } = (req.body ?? {}) as Record<string, string>;
  try {
    const note = await saveCapture(String(url), String(title), String(text));
    res.json({ ok: true, note });
  } catch (error) {
    res.status(500).json({ error: "Failed to save capture" });
  }
});

// --- Metrics import ----------------------------------------------------------

router.post("/metrics/import", async (req: Request, res: Response) => {
  const rows = (req.body?.rows ?? []) as Array<Record<string, unknown>>;
  if (!Array.isArray(rows) || !rows.length) {
    res.status(400).json({ error: "Provide rows to import." });
    return;
  }
  let imported = 0;
  const touched = new Map<string, Record<string, number>>();
  for (const row of rows.slice(0, 1000)) {
    const deliverableId = String(row.deliverableId ?? "");
    if (!deliverableId) continue;
    const metric = {
      id: randomUUID(),
      deliverableId,
      capturedAt: typeof row.capturedAt === "string" ? row.capturedAt : new Date().toISOString(),
      views: Number(row.views) || 0,
      likes: Number(row.likes) || 0,
      comments: Number(row.comments) || 0,
      shares: Number(row.shares) || 0,
      clicks: Number(row.clicks) || 0,
      source: typeof row.source === "string" ? row.source.slice(0, 20) : "import",
    };
    try {
      await db.insert(metricsTable).values(metric);
      touched.set(deliverableId, {
        views: metric.views, likes: metric.likes, comments: metric.comments, shares: metric.shares, clicks: metric.clicks,
      });
      imported++;
    } catch (error) {
      // skip malformed row
    }
  }
  for (const [deliverableId, performance] of touched) {
    try {
      await db.update(deliverablesTable).set({ performance }).where(eq(deliverablesTable.id, deliverableId));
    } catch (error) {
      // deliverable may not exist; skip
    }
  }
  res.json({ imported });
});

// --- Voice learning examples -------------------------------------------------

router.post("/voice", async (req: Request, res: Response) => {
  const { clientId, kind, original = "", final = "" } = (req.body ?? {}) as Record<string, string>;
  if (!clientId || !["kept", "edited", "rejected"].includes(kind)) {
    res.status(400).json({ error: "clientId and a kind of kept|edited|rejected are required." });
    return;
  }
  try {
    await db.insert(voiceExamplesTable).values({
      id: randomUUID(),
      clientId,
      kind,
      original: String(original).slice(0, 4000),
      final: String(final).slice(0, 4000),
      createdAt: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to record voice example" });
  }
});

export default router;
