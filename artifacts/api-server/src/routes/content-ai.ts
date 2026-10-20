import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { anthropic, extractText } from "@workspace/integrations-anthropic-ai-server";
import { db, voiceExamplesTable } from "@workspace/db";

const router: IRouter = Router();

const MODEL = "claude-haiku-5-5";

const allowedActions = new Set([
  "rewrite",
  "shorten",
  "expand",
  "tone",
  "adapt",
  "hooks",
  "ctas",
  "proofread",
  "repurpose",
]);

const PLATFORM_GRAMMAR: Record<string, string> = {
  Instagram: "Instagram grammar: strong visual-first hook, short lines, conversational warmth, up to ~150 words before truncation, hashtags go at the end (5-10), emojis allowed sparingly.",
  Facebook: "Facebook grammar: community tone, slightly longer context allowed, one clear link or ask, questions drive comments.",
  TikTok: "TikTok grammar: spoken-word hook in the first line, casual and direct, trend-aware, caption under ~100 characters plus 3-5 hashtags.",
  LinkedIn: "LinkedIn grammar: professional but human, open with a one-line insight or bold claim, short paragraphs with line breaks, no hashtag spam (3 max), end with a discussion prompt.",
  YouTube: "YouTube grammar: title under 70 characters, description front-loads the value proposition in the first two lines, then timestamps/links.",
  Newsletter: "Newsletter grammar: subject line under 50 characters that earns the open, personal letter tone, one core idea, single clear CTA.",
  Web: "Web grammar: scannable structure, descriptive headings, concise paragraphs, SEO-aware but written for humans first.",
};

async function buildVoiceProfile(clientId?: string): Promise<string> {
  if (!clientId) return "";
  try {
    const rows = await db
      .select()
      .from(voiceExamplesTable)
      .where(eq(voiceExamplesTable.clientId, clientId))
      .orderBy(desc(voiceExamplesTable.createdAt))
      .limit(30);
    if (!rows.length) return "";
    const kept = rows.filter((r) => r.kind === "kept" && r.final).slice(0, 6);
    const edited = rows.filter((r) => r.kind === "edited" && r.original && r.final).slice(0, 4);
    const rejected = rows.filter((r) => r.kind === "rejected" && r.original).slice(0, 4);
    const parts: string[] = ["LEARNED VOICE PROFILE (from what the editor kept, corrected, and rejected — this outranks generic style advice):"];
    if (kept.length) {
      parts.push("Approved examples of this client's voice:\n" + kept.map((r) => `---\n${r.final.slice(0, 500)}`).join("\n"));
    }
    if (edited.length) {
      parts.push("Corrections the editor made (learn the direction of these edits):\n" + edited.map((r) => `AI draft: ${r.original.slice(0, 250)}\nEditor fixed to: ${r.final.slice(0, 350)}`).join("\n\n"));
    }
    if (rejected.length) {
      parts.push("Styles that were REJECTED for this client (do not produce these):\n" + rejected.map((r) => `---\n${r.original.slice(0, 250)}`).join("\n"));
    }
    return parts.join("\n\n");
  } catch {
    return "";
  }
}

const EDITOR_SYSTEM =
  "You are a senior editor and social copywriter working in a multi-client content studio. Never invent dates, names, credits, prices, links, quotes, or event facts. Preserve factual accuracy and the client's voice. Return only the requested copy unless the request asks for alternatives.";

router.post("/content-ai", async (req, res) => {
  const {
    action,
    text,
    platform = "General",
    clientContext = "",
    instructions = "",
    clientId = "",
  } = req.body as Record<string, string | undefined>;

  if (!action || !allowedActions.has(action)) {
    res.status(400).json({ error: "Choose a supported writing action." });
    return;
  }
  if (!text?.trim()) {
    res.status(400).json({ error: "Add some source copy first." });
    return;
  }

  const actionGuidance: Record<string, string> = {
    rewrite: "Rewrite the copy for clarity, rhythm, specificity, and impact.",
    shorten: "Shorten the copy substantially while preserving every essential fact.",
    expand: "Expand the copy with useful detail, stronger transitions, and no filler.",
    tone: "Adjust the tone according to the additional instructions.",
    adapt: `Adapt this into native-feeling copy for ${platform}. ${PLATFORM_GRAMMAR[platform] ?? ""}`,
    hooks: "Return five distinct opening hooks, each on its own numbered line.",
    ctas: "Return five clear calls to action, each on its own numbered line.",
    proofread: "Proofread and correct the copy. Preserve voice and facts. Return only the corrected copy.",
    repurpose: `Repurpose this for ${platform}: change the structure, not just the length. ${PLATFORM_GRAMMAR[platform] ?? ""} If something in the source cannot survive the format change (a visual demo becoming text, a link becoming audio), name the tradeoff after the copy under "LOST IN TRANSLATION:" and suggest the strongest alternative.`,
  };

  try {
    const voiceProfile = await buildVoiceProfile(clientId);
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: EDITOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            actionGuidance[action],
            PLATFORM_GRAMMAR[platform] && !["adapt", "repurpose"].includes(action) ? PLATFORM_GRAMMAR[platform] : "",
            clientContext ? `Client voice notes: ${clientContext}` : "",
            voiceProfile,
            instructions ? `Additional direction: ${instructions}` : "",
            `Source copy:\n${text}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    const result = extractText(message);
    if (!result) {
      res.status(502).json({ error: "The writing assistant returned no copy." });
      return;
    }
    res.json({ result });
  } catch (error) {
    req.log.error({ error }, "Content AI request failed");
    res.status(502).json({ error: "The writing assistant is temporarily unavailable. Your draft is safe." });
  }
});

// --- Ask-before-writing: one sharp clarifying question -----------------------

router.post("/content-ai/clarify", async (req, res) => {
  const { text = "", clientContext = "", platform = "", instructions = "" } = req.body as Record<string, string>;
  if (!text.trim()) {
    res.status(400).json({ error: "Add some source copy first." });
    return;
  }
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        "You are a senior editor deciding whether a brief is clear enough to write from. If one missing fact or decision would materially change the output (audience, goal, offer, date, angle), ask exactly ONE sharp question. If the brief is workable, reply with exactly: CLEAR. Never ask more than one question. Never ask about style preferences.",
      messages: [
        {
          role: "user",
          content: [
            platform ? `Platform: ${platform}` : "",
            clientContext ? `Client context: ${clientContext}` : "",
            instructions ? `Direction given: ${instructions}` : "",
            `Source material:\n${text.slice(0, 3000)}`,
          ].filter(Boolean).join("\n\n"),
        },
      ],
    });
    const out = extractText(message);
    res.json({ question: !out || out === "CLEAR" || out.startsWith("CLEAR") ? null : out.replace(/^Question:\s*/i, "") });
  } catch (error) {
    req.log.error({ error }, "Clarify request failed");
    res.status(502).json({ error: "The writing assistant is temporarily unavailable." });
  }
});

// --- Draft the week ----------------------------------------------------------

router.post("/content-ai/draft-week", async (req, res) => {
  const {
    clientName = "",
    voice = "",
    pillars = [],
    topPerformers = "",
    links = "",
    instructions = "",
    platforms = [],
    days = 5,
    clientId = "",
  } = req.body as {
    clientName?: string; voice?: string; pillars?: string[]; topPerformers?: string;
    links?: string; instructions?: string; platforms?: string[]; days?: number; clientId?: string;
  };
  if (!clientName.trim()) {
    res.status(400).json({ error: "Pick a client first." });
    return;
  }
  try {
    const voiceProfile = await buildVoiceProfile(clientId);
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: EDITOR_SYSTEM + " Respond with STRICT JSON only, no markdown fences.",
      messages: [
        {
          role: "user",
          content: [
            `Draft ${Math.min(Math.max(days, 1), 7)} distinct content pieces for the coming week for the client "${clientName}".`,
            pillars.length ? `Content pillars to rotate across: ${pillars.join(", ")}.` : "",
            platforms.length ? `Platforms to cover: ${platforms.join(", ")}. Match each piece's structure to its platform.` : "",
            voice ? `Client voice notes: ${voice}` : "",
            voiceProfile,
            topPerformers ? `What has worked recently (make more in this spirit, never copy):\n${topPerformers}` : "",
            links ? `Source material and links to draw facts from (never invent facts beyond these):\n${links}` : "",
            instructions ? `Direction: ${instructions}` : "",
            `Return JSON exactly in this shape: {"drafts":[{"day":"Monday","title":"...","platform":"...","format":"...","copy":"...","checklist":["asset or prep item","..."]}]}. Vary angles across the week; no two drafts on the same pillar back-to-back.`,
          ].filter(Boolean).join("\n\n"),
        },
      ],
    });
    const raw = extractText(message);
    const match = raw.match(/\{[\s\S]*\}/);
    let parsed: { drafts?: unknown } | null = null;
    try {
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }
    const drafts = Array.isArray(parsed?.drafts) ? parsed!.drafts : null;
    if (!drafts) {
      res.status(502).json({ error: "The assistant returned an unreadable draft set. Try again." });
      return;
    }
    res.json({ drafts });
  } catch (error) {
    req.log.error({ error }, "Draft-week request failed");
    res.status(502).json({ error: "The writing assistant is temporarily unavailable." });
  }
});

// --- Vision: auto alt-text + tags -------------------------------------------

router.post("/content-ai/auto-tag", async (req, res) => {
  const { image = "" } = req.body as { image?: string };
  const match = image.match(/^data:image\/(png|jpeg|jpg|gif|webp);base64,(.+)$/);
  if (!match) {
    res.status(400).json({ error: "Provide the image as a png, jpeg, gif, or webp data URL." });
    return;
  }
  const [, subtype, data] = match;
  const mediaType = (subtype === "jpg" ? "image/jpeg" : `image/${subtype}`) as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        "You describe images for a media library. Respond with STRICT JSON only: {\"altText\":\"one accurate, specific sentence for screen readers\",\"tags\":[\"3-6 lowercase search tags\"]}. Describe what is literally visible; never guess names, brands, or locations you cannot see.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: "Describe this image." },
          ],
        },
      ],
    });
    const raw = extractText(message);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (!parsed?.altText) {
      res.status(502).json({ error: "Could not describe this image." });
      return;
    }
    res.json({
      altText: String(parsed.altText).slice(0, 500),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: unknown) => String(t).toLowerCase().slice(0, 40)).slice(0, 8) : [],
    });
  } catch (error) {
    req.log.error({ error }, "Auto-tag request failed");
    res.status(502).json({ error: "Image description is temporarily unavailable." });
  }
});

// --- Case study drafting ------------------------------------------------------

router.post("/content-ai/case-study-draft", async (req, res) => {
  const { clientName = "", subject = "", voice = "", notes = "", pieces = [] } = req.body as {
    clientName?: string;
    subject?: string;
    voice?: string;
    notes?: string;
    pieces?: { title: string; platform: string; copy: string; views: number; likes: number; comments: number; shares: number }[];
  };
  const who = subject.trim() || clientName.trim();
  if (!who) {
    res.status(400).json({ error: "Add a subject first." });
    return;
  }
  if (!notes.trim() && (!Array.isArray(pieces) || !pieces.length)) {
    res.status(400).json({ error: "Add some rough notes, or select work to draft from." });
    return;
  }
  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: EDITOR_SYSTEM + " You are drafting a short proof-of-work case study for a studio's own portfolio/pitch materials. Never invent results, numbers, or claims beyond what's given.",
      messages: [
        {
          role: "user",
          content: [
            `Draft a short case study narrative (3-4 short paragraphs: context, approach, results) for "${who}".`,
            voice ? `Voice notes: ${voice}` : "",
            notes.trim() ? `Rough notes to build the narrative from (ground every claim in these, never invent beyond them):\n${notes.trim()}` : "",
            pieces.length ? `Selected work to build the narrative from:\n${pieces.map(p => `- "${p.title}" (${p.platform}): ${p.views || 0} views, ${p.likes || 0} likes, ${p.comments || 0} comments, ${p.shares || 0} shares. Copy: ${p.copy.slice(0, 300)}`).join("\n")}` : "",
            "Write in third person about the studio's work for this subject. No headings, no bullet points, just prose. Ground every claim in the data given.",
          ].filter(Boolean).join("\n\n"),
        },
      ],
    });
    const narrative = extractText(message);
    if (!narrative) {
      res.status(502).json({ error: "The assistant returned no draft." });
      return;
    }
    res.json({ narrative });
  } catch (error) {
    req.log.error({ error }, "Case study draft request failed");
    res.status(502).json({ error: "The writing assistant is temporarily unavailable." });
  }
});

export default router;
