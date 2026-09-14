import { Router, type IRouter, type Request, Response as ExResponse } from "express";
import { randomUUID } from "crypto";
import { eq, desc, inArray, and } from "drizzle-orm";
import {
  db,
  deliverablesTable,
  versionsTable,
  assetsTable,
  clientsTable,
  reviewLinksTable,
} from "@workspace/db";

const router: IRouter = Router();

const REVIEW_TTL_DAYS = 14;

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

// --- Create / list review links ---------------------------------------------

router.post("/review-links", async (req: Request, res: ExResponse) => {
  const { deliverableId, versionId } = (req.body ?? {}) as { deliverableId?: string; versionId?: string };
  if (!deliverableId) {
    res.status(400).json({ error: "deliverableId is required." });
    return;
  }
  try {
    const [deliverable] = await db.select().from(deliverablesTable).where(eq(deliverablesTable.id, deliverableId)).limit(1);
    if (!deliverable) {
      res.status(404).json({ error: "Deliverable not found. Save it first." });
      return;
    }
    const vid = versionId || deliverable.currentVersionId;
    if (!vid) {
      res.status(400).json({ error: "This deliverable has no version to review yet." });
      return;
    }
    const [version] = await db.select().from(versionsTable).where(eq(versionsTable.id, vid)).limit(1);
    if (!version) {
      res.status(404).json({ error: "Version not found." });
      return;
    }
    if (version.deliverableId !== deliverableId) {
      res.status(400).json({ error: "That version does not belong to this deliverable." });
      return;
    }
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, deliverable.clientId)).limit(1);
    const assetRows = version.assetIds.length
      ? await db.select().from(assetsTable).where(inArray(assetsTable.id, version.assetIds))
      : [];
    const assetSet = new Map(assetRows.map((a) => [a.id, a]));
    const assets = version.assetIds
      .map((id) => assetSet.get(id))
      .filter(Boolean)
      .map((a) => ({ name: a!.name, type: a!.type, fileUrl: a!.fileUrl, altText: a!.altText }));

    const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, "");
    const now = new Date();
    const expires = new Date(now.getTime() + REVIEW_TTL_DAYS * 24 * 60 * 60 * 1000);

    await db.insert(reviewLinksTable).values({
      token,
      deliverableId,
      versionId: vid,
      snapshot: {
        title: deliverable.title,
        platform: deliverable.platform,
        format: deliverable.format,
        clientName: client?.name ?? "Client",
        clientColor: client?.color ?? "#d4a373",
        copy: version.copy,
        versionCreatedAt: version.createdAt,
        publishAt: deliverable.publishAt,
        assets,
      },
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      status: "pending",
    });

    res.json({ token, path: `/api/review/${token}`, expiresAt: expires.toISOString() });
  } catch (error) {
    req.log.error({ error }, "Failed to create review link");
    res.status(500).json({ error: "Failed to create review link." });
  }
});

router.get("/review-links", async (req: Request, res: ExResponse) => {
  const deliverableId = String(req.query.deliverableId ?? "");
  try {
    const rows = deliverableId
      ? await db.select().from(reviewLinksTable).where(eq(reviewLinksTable.deliverableId, deliverableId)).orderBy(desc(reviewLinksTable.createdAt)).limit(20)
      : await db.select().from(reviewLinksTable).orderBy(desc(reviewLinksTable.createdAt)).limit(100);
    res.json({
      links: rows.map((r) => ({
        token: r.token,
        deliverableId: r.deliverableId,
        versionId: r.versionId,
        status: r.status,
        approverName: r.approverName,
        comment: r.comment,
        createdAt: r.createdAt,
        respondedAt: r.respondedAt,
        expiresAt: r.expiresAt,
        path: `/api/review/${r.token}`,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to load review links." });
  }
});

// --- Public review page ------------------------------------------------------

function reviewPage(opts: {
  title: string;
  body: string;
  status?: string;
  approverName?: string | null;
  comment?: string | null;
  respondedAt?: string | null;
  form?: string;
}): string {
  const statusBanner = opts.status && opts.status !== "pending"
    ? `<div class="banner ${opts.status === "approved" ? "ok" : "warn"}">
        <strong>${opts.status === "approved" ? "Approved" : opts.status === "expired" ? "Link expired" : "Changes requested"}</strong>
        ${opts.approverName ? `<span> by ${escapeHtml(opts.approverName)}</span>` : ""}
        ${opts.respondedAt ? `<span> · ${escapeHtml(new Date(opts.respondedAt).toLocaleString())}</span>` : ""}
        ${opts.comment ? `<p class="comment">"${escapeHtml(opts.comment)}"</p>` : ""}
      </div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">
<title>${escapeHtml(opts.title)} — Content Review</title>
<style>
:root{color-scheme:dark}
body{background:#141110;color:#f2ece1;font-family:system-ui,-apple-system,sans-serif;margin:0;line-height:1.6}
.wrap{max-width:680px;margin:0 auto;padding:48px 20px 80px}
h1{font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:30px;margin:0 0 4px}
.meta{color:#a89f92;font-size:13px;letter-spacing:.04em;text-transform:uppercase;margin-bottom:28px}
.copy{white-space:pre-wrap;background:#1d1916;border:1px solid #332c26;border-radius:12px;padding:24px;font-size:16px}
.media{margin-top:20px;display:grid;gap:12px}
.media img{max-width:100%;border-radius:10px;border:1px solid #332c26}
.file{background:#1d1916;border:1px solid #332c26;border-radius:10px;padding:14px;font-size:14px;color:#c9bfb2}
.banner{border-radius:10px;padding:14px 18px;margin:24px 0;font-size:15px}
.banner.ok{background:rgba(122,158,110,.12);border:1px solid rgba(122,158,110,.4)}
.banner.warn{background:rgba(212,163,115,.12);border:1px solid rgba(212,163,115,.4)}
.comment{color:#a89f92;font-size:14px;margin:8px 0 0}
form{margin-top:32px;border-top:1px solid #332c26;padding-top:28px}
label{display:block;font-size:13px;color:#a89f92;margin:0 0 6px;text-transform:uppercase;letter-spacing:.05em}
input,textarea{width:100%;box-sizing:border-box;background:#1d1916;border:1px solid #332c26;border-radius:8px;color:#f2ece1;padding:10px 12px;font-size:15px;margin-bottom:16px;font-family:inherit}
.actions{display:flex;gap:12px;margin-top:8px}
button{flex:1;padding:14px;border-radius:10px;border:1px solid;cursor:pointer;font-size:15px;font-weight:600;font-family:inherit}
.approve{background:#7a9e6e;border-color:#7a9e6e;color:#10130e}
.changes{background:transparent;border-color:#d4a373;color:#d4a373}
.foot{margin-top:48px;color:#6b6357;font-size:12px;text-align:center}
h2{font-family:Georgia,serif;font-weight:500;font-size:18px;color:#c9bfb2;margin:32px 0 12px}
</style></head><body><div class="wrap">${opts.body}${statusBanner}${opts.form ?? ""}
<p class="foot">Frozen snapshot · Content Desk review link · No account required</p>
</div></body></html>`;
}

function renderSnapshot(snapshot: Record<string, unknown>): string {
  const assets = Array.isArray(snapshot.assets) ? (snapshot.assets as Array<Record<string, string>>) : [];
  const media = assets.length
    ? `<div class="media">${assets
        .map((a) =>
          a.type === "image" && a.fileUrl
            ? `<img src="${escapeHtml(a.fileUrl)}" alt="${escapeHtml(a.altText || a.name)}">`
            : `<div class="file">Attachment: ${escapeHtml(a.name)} (${escapeHtml(a.type)})</div>`,
        )
        .join("")}</div>`
    : "";
  const publish = snapshot.publishAt
    ? ` · Planned ${escapeHtml(new Date(String(snapshot.publishAt)).toLocaleString())}`
    : "";
  return `
    <h1>${escapeHtml(snapshot.title)}</h1>
    <div class="meta">${escapeHtml(snapshot.clientName)} · ${escapeHtml(snapshot.platform)}${snapshot.format ? " · " + escapeHtml(snapshot.format) : ""}${publish}</div>
    <div class="copy">${escapeHtml(snapshot.copy)}</div>
    ${media}`;
}

router.get("/review/:token", async (req: Request, res: ExResponse) => {
  try {
    const [link] = await db.select().from(reviewLinksTable).where(eq(reviewLinksTable.token, String(req.params.token))).limit(1);
    if (!link) {
      res.status(404).type("html").send(reviewPage({ title: "Not found", body: "<h1>Review link not found</h1><p class='meta'>This link may have been removed.</p>" }));
      return;
    }
    const snapshot = link.snapshot as Record<string, unknown>;
    const expired = new Date(link.expiresAt).getTime() < Date.now();
    let status = link.status;
    if (status === "pending" && expired) {
      status = "expired";
      await db.update(reviewLinksTable).set({ status: "expired" }).where(eq(reviewLinksTable.token, link.token));
    }
    const form = status === "pending"
      ? `<form method="POST" action="/api/review/${escapeHtml(link.token)}/respond">
          <h2>Your review</h2>
          <label for="name">Your name</label>
          <input id="name" name="name" required placeholder="So the studio knows who reviewed">
          <label for="comment">Comments (optional)</label>
          <textarea id="comment" name="comment" rows="3" placeholder="Anything to change?"></textarea>
          <div class="actions">
            <button type="submit" name="action" value="changes" class="changes">Request changes</button>
            <button type="submit" name="action" value="approve" class="approve">Approve this version</button>
          </div>
        </form>`
      : "";
    res.type("html").send(
      reviewPage({
        title: String(snapshot.title ?? "Content review"),
        body: renderSnapshot(snapshot),
        status,
        approverName: link.approverName,
        comment: link.comment,
        respondedAt: link.respondedAt,
        form,
      }),
    );
  } catch (error) {
    req.log.error({ error }, "Failed to render review page");
    res.status(500).json({ error: "Failed to load review." });
  }
});

router.post("/review/:token/respond", async (req: Request, res: ExResponse) => {
  const action = String(req.body?.action ?? "");
  const name = String(req.body?.name ?? "").slice(0, 120);
  const comment = String(req.body?.comment ?? "").slice(0, 4000);
  if (!["approve", "changes"].includes(action) || !name.trim()) {
    res.status(400).type("html").send(reviewPage({ title: "Invalid response", body: "<h1>Something was missing</h1><p class='meta'>Please go back, enter your name, and choose approve or request changes.</p>" }));
    return;
  }
  try {
    const [link] = await db.select().from(reviewLinksTable).where(eq(reviewLinksTable.token, String(req.params.token))).limit(1);
    if (!link) {
      res.status(404).json({ error: "Review link not found." });
      return;
    }
    if (link.status !== "pending" || new Date(link.expiresAt).getTime() < Date.now()) {
      res.redirect(303, `/api/review/${link.token}`);
      return;
    }
    const now = new Date().toISOString();
    const approved = action === "approve";
    // Conditional update: only the first response to a pending link wins.
    const claimed = await db.update(reviewLinksTable).set({
      status: approved ? "approved" : "changes-requested",
      approverName: name.trim(),
      comment: comment.trim() || null,
      respondedAt: now,
    }).where(and(eq(reviewLinksTable.token, link.token), eq(reviewLinksTable.status, "pending"))).returning({ token: reviewLinksTable.token });
    if (!claimed.length) {
      res.redirect(303, `/api/review/${link.token}`);
      return;
    }

    await db.update(versionsTable).set({
      approvalState: approved ? "approved" : "rejected",
      approver: name.trim(),
      approvalTimestamp: now,
    }).where(eq(versionsTable.id, link.versionId));

    await db.update(deliverablesTable).set(
      approved
        ? { approvedVersionId: link.versionId, productionStatus: "approved" }
        : { productionStatus: "changes-requested" },
    ).where(eq(deliverablesTable.id, link.deliverableId));

    res.redirect(303, `/api/review/${link.token}`);
  } catch (error) {
    req.log.error({ error }, "Failed to record review response");
    res.status(500).json({ error: "Failed to record your response." });
  }
});

export default router;
