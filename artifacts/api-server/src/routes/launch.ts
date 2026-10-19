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
  const phaseLabels = [
    "Foundation",
    "Commercial assets",
    "Market validation",
    "Legal & operational",
    "Launch prep",
    "Public launch",
  ];

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
