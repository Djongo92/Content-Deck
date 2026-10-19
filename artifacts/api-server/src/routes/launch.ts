import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import {
  db,
  clientsTable,
  launchTasksTable,
  launchLeadsTable,
  launchNotesTable,
  launchGatesTable,
  launchSettingsTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();
const MODEL = "gpt-5.6-luna";

const PHASE_LABELS = [
  "Foundation",
  "Commercial assets",
  "Market validation",
  "Legal & operational",
  "Launch prep",
  "Public launch",
];

const DISCUSS_SYSTEM =
  "You are a sharp, grounded advisor helping plan the launch and ongoing operation of Algo-Rhythm, a solo music and cultural communications studio. " +
  "Answer from the plan data given to you. Never invent facts, figures, or progress that isn't in that data. " +
  "If something genuinely isn't covered by the plan, say so plainly instead of guessing. Be direct and concrete, not generic startup-advice filler.";

function summarizePlan(plan: {
  settings: typeof launchSettingsTable.$inferSelect | undefined;
  leads: (typeof launchLeadsTable.$inferSelect)[];
  tasks: (typeof launchTasksTable.$inferSelect)[];
  notes: (typeof launchNotesTable.$inferSelect)[];
  gates: (typeof launchGatesTable.$inferSelect)[];
}): string {
  const { settings, leads, tasks, notes, gates } = plan;
  const activeLeads = leads.filter((l) => l.status === "Active");
  const revenue = activeLeads.reduce((sum, l) => sum + (l.fee || 0), 0);
  const doneTasks = tasks.filter((t) => t.done).length;
  const phaseLabels = PHASE_LABELS;

  const lines = [
    `Brand: ${settings?.brandName || "(not set)"} — ${settings?.headline || "(no headline)"}`,
    `Launch date target: ${settings?.launchDate || "(not set)"}`,
    `Current recurring revenue: €${revenue} across ${activeLeads.length} active client(s)`,
    `Tasks: ${doneTasks}/${tasks.length} complete`,
    "",
    "Clients / leads:",
    ...leads.map((l) => `- ${l.name} (${l.status}): €${l.fee}/mo, ${l.hours}h/mo, next: ${l.next}`),
    "",
    "Open tasks by phase:",
    ...phaseLabels.map((label, p) => {
      const open = tasks.filter((t) => t.phase === p && !t.done);
      return `- ${label}: ${open.length} open${open.length ? " — " + open.slice(0, 5).map((t) => t.title).join("; ") : ""}`;
    }),
    "",
    "Launch decision gates:",
    ...gates.map((g) => `- ${g.title} [${g.done ? "done" : "not done"}]: ${g.description}`),
    "",
    "Recent decision notes:",
    ...notes.slice(-5).map((n) => `- ${n.date} — ${n.title}: ${n.text}`),
  ];
  return lines.join("\n");
}

router.post("/launch/discuss", async (req: Request, res: Response) => {
  const { question, history } = (req.body ?? {}) as {
    question?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  if (!question?.trim()) {
    res.status(400).json({ error: "Ask a question first." });
    return;
  }
  try {
    const [settingsRows, leads, tasks, notes, gates] = await Promise.all([
      db.select().from(launchSettingsTable).limit(1),
      db.select().from(launchLeadsTable),
      db.select().from(launchTasksTable),
      db.select().from(launchNotesTable),
      db.select().from(launchGatesTable),
    ]);
    const planSummary = summarizePlan({ settings: settingsRows[0], leads, tasks, notes, gates });

    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: DISCUSS_SYSTEM },
        { role: "user", content: `Current plan data:\n\n${planSummary}` },
        ...(Array.isArray(history) ? history.slice(-10) : []),
        { role: "user", content: question },
      ],
    });

    const result = completion.choices[0]?.message?.content?.trim();
    if (!result) {
      res.status(502).json({ error: "The advisor returned no answer." });
      return;
    }
    res.json({ result });
  } catch (error) {
    req.log.error({ error }, "Launch discuss request failed");
    res.status(502).json({ error: "The advisor is temporarily unavailable." });
  }
});

// --- Phase amend: brainstorm a phase and propose concrete board changes ------

const AMEND_SYSTEM =
  "You help refine one phase of a solo founder's Algo-Rhythm studio-launch roadmap. " +
  "You are given the full plan for context and the current tasks (with ids) inside the one phase actually being discussed. " +
  "Based on the user's request, propose concrete, grounded changes scoped to that phase only: new tasks to add, existing tasks to reword/reschedule/reassign, or tasks that no longer make sense to remove. " +
  "Never invent facts, figures, or progress that isn't in the plan. Keep changes minimal and directly responsive to what the user asked — don't restructure the whole phase unprompted. " +
  "If the user is just asking a question with no change implied, return an empty changes array. " +
  'Respond with STRICT JSON only, no markdown fences, in exactly this shape: {"reply": "one short paragraph explaining your thinking, in plain language", "changes": [ {"op":"add","title":"...","due":"YYYY-MM-DD or empty string","owner":"..."} , {"op":"update","taskId":"...","title":"optional","due":"optional","owner":"optional"} , {"op":"delete","taskId":"..."} ]}. ' +
  'Only include fields in an "update" change that should actually change.';

type ProposedChange =
  | { op: "add"; title: string; due: string; owner: string }
  | { op: "update"; taskId: string; title?: string; due?: string; owner?: string }
  | { op: "delete"; taskId: string };

function isProposedChange(value: unknown): value is ProposedChange {
  if (!value || typeof value !== "object") return false;
  const op = (value as { op?: unknown }).op;
  const taskId = (value as { taskId?: unknown }).taskId;
  const title = (value as { title?: unknown }).title;
  if (op === "add") return typeof title === "string" && title.trim().length > 0;
  if (op === "update") return typeof taskId === "string" && taskId.length > 0;
  if (op === "delete") return typeof taskId === "string" && taskId.length > 0;
  return false;
}

function sanitizeChange(change: ProposedChange): ProposedChange {
  const dateOk = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (change.op === "add") {
    return { op: "add", title: change.title.slice(0, 200), due: dateOk(change.due) ? change.due : "", owner: (change.owner || "Tisa").slice(0, 60) };
  }
  if (change.op === "update") {
    const out: ProposedChange = { op: "update", taskId: change.taskId };
    if (typeof change.title === "string") out.title = change.title.slice(0, 200);
    if (dateOk(change.due)) out.due = change.due;
    if (typeof change.owner === "string") out.owner = change.owner.slice(0, 60);
    return out;
  }
  return change;
}

router.post("/launch/phases/:phase/amend", async (req: Request, res: Response) => {
  const phase = Number(req.params.phase);
  const { question, history } = (req.body ?? {}) as {
    question?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  if (!Number.isInteger(phase) || phase < 0 || phase >= PHASE_LABELS.length) {
    res.status(400).json({ error: "Unknown phase." });
    return;
  }
  if (!question?.trim()) {
    res.status(400).json({ error: "Ask a question or describe the change first." });
    return;
  }
  try {
    const [settingsRows, leads, tasks, notes, gates] = await Promise.all([
      db.select().from(launchSettingsTable).limit(1),
      db.select().from(launchLeadsTable),
      db.select().from(launchTasksTable),
      db.select().from(launchNotesTable),
      db.select().from(launchGatesTable),
    ]);
    const planSummary = summarizePlan({ settings: settingsRows[0], leads, tasks, notes, gates });
    const phaseTasks = tasks.filter((t) => t.phase === phase);
    const phaseLabel = PHASE_LABELS[phase];
    const tasksBlock =
      phaseTasks.map((t) => `- [${t.id}] ${t.title} (due ${t.due || "no date"}, owner ${t.owner}, ${t.done ? "done" : "open"})`).join("\n") ||
      "(no tasks yet)";

    const completion = await openai.chat.completions.create({
      model: MODEL,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: AMEND_SYSTEM },
        {
          role: "user",
          content: `Full plan context:\n\n${planSummary}\n\nPhase being discussed: "${phaseLabel}" (index ${phase}).\nCurrent tasks in this phase:\n${tasksBlock}`,
        },
        ...(Array.isArray(history) ? history.slice(-10) : []),
        { role: "user", content: question },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    let parsed: { reply?: unknown; changes?: unknown } | null = null;
    try {
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed.reply !== "string" || !parsed.reply.trim()) {
      res.status(502).json({ error: "The advisor returned an unreadable response." });
      return;
    }
    const changes = (Array.isArray(parsed.changes) ? parsed.changes : []).filter(isProposedChange).map(sanitizeChange).slice(0, 20);
    res.json({ reply: parsed.reply, changes });
  } catch (error) {
    req.log.error({ error }, "Phase amend request failed");
    res.status(502).json({ error: "The advisor is temporarily unavailable." });
  }
});

router.post("/launch/leads/:id/convert", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const rows = await db.select().from(launchLeadsTable).where(eq(launchLeadsTable.id, id)).limit(1);
    const lead = rows[0];
    if (!lead) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }
    if (lead.linkedClientId) {
      res.status(409).json({ error: "This lead is already linked to a client.", clientId: lead.linkedClientId });
      return;
    }
    const clientId = randomUUID();
    await db.insert(clientsTable).values({
      id: clientId,
      name: lead.name,
      color: "#d94e38",
      archived: false,
      voice: "",
      audience: "",
      pillars: [],
      approvedTerms: [],
      avoidedTerms: [],
      timezone: "UTC",
      monthlyRetainerHours: lead.hours,
      monthlyDeliverableTarget: 0,
      monthlyRetainerAmount: lead.fee,
      platforms: [],
    });
    await db.update(launchLeadsTable).set({ linkedClientId: clientId }).where(eq(launchLeadsTable.id, id));
    res.json({ clientId });
  } catch (error) {
    req.log.error({ error }, "Convert lead to client failed");
    res.status(500).json({ error: "Could not convert this lead to a client." });
  }
});

export default router;
