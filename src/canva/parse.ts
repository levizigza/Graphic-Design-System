/**
 * Defensive parsers for Canva Design MCP payloads.
 * Field names follow Canva docs; we also accept common aliases.
 * Never invent IDs when parsing fails.
 */

import { CanvaAdapterError } from "./errors.js";
import type { DesignCandidate, EditableElementRef } from "../schemas/canva-session.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Unwrap MCP content that may be `{ content: [{ text }] }` or bare JSON. */
export function unwrapMcpContent(result: { content: unknown }): unknown {
  const c = result.content;
  if (Array.isArray(c)) {
    const texts = c
      .map((part) => {
        const p = asRecord(part);
        return p && typeof p.text === "string" ? p.text : null;
      })
      .filter((t): t is string => Boolean(t));
    if (texts.length === 1) {
      try {
        return JSON.parse(texts[0]!);
      } catch {
        return texts[0];
      }
    }
    if (texts.length > 1) {
      try {
        return JSON.parse(texts.join(""));
      } catch {
        return texts;
      }
    }
  }
  if (typeof c === "string") {
    try {
      return JSON.parse(c);
    } catch {
      return c;
    }
  }
  return c;
}

export function parseCandidates(payload: unknown): DesignCandidate[] {
  const root = asRecord(payload) ?? {};
  const list =
    asArray(root.candidates).length > 0
      ? asArray(root.candidates)
      : asArray(root.design_candidates).length > 0
        ? asArray(root.design_candidates)
        : asArray(root.items);

  const candidates: DesignCandidate[] = [];
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const candidateId =
      str(row.candidate_id) ??
      str(row.candidateId) ??
      str(row.id);
    if (!candidateId) continue;

    const thumb =
      str(row.thumbnail_url) ??
      str(row.thumbnailUrl) ??
      str(asRecord(row.thumbnail)?.url);

    const rationale =
      str(row.rationale) ??
      str(row.summary) ??
      str(row.description) ??
      "Candidate from Canva generate-design";

    const candidate: DesignCandidate = {
      candidateId,
      previewNotes: [],
      rationale,
      viable: row.viable === false ? false : true,
      raw: row,
    };
    if (thumb) candidate.thumbnailUrl = thumb;
    if (row.viable === false) {
      candidate.nonViableReason =
        str(row.non_viable_reason) ??
        str(row.reason) ??
        "Marked non-viable by upstream";
    }
    candidates.push(candidate);
  }

  if (candidates.length === 0) {
    throw new CanvaAdapterError(
      "upstream",
      "generate-design returned no parseable candidates with candidate IDs",
      { retryable: true, details: { payload } },
    );
  }
  return candidates;
}

export function parseCreatedDesign(payload: unknown): {
  designId: string;
  editUrl: string;
  pageIds: string[];
} {
  const root = asRecord(payload) ?? {};
  const summary = asRecord(root.design_summary) ?? asRecord(root.design) ?? root;
  const urls = asRecord(summary.urls) ?? asRecord(root.urls) ?? {};

  const designId =
    str(summary.design_id) ??
    str(summary.designId) ??
    str(summary.id) ??
    str(root.design_id) ??
    str(root.designId);

  const editUrl =
    str(urls.edit_url) ??
    str(urls.editUrl) ??
    str(root.edit_url) ??
    str(root.editUrl) ??
    str(root.edit_design_url) ??
    str(summary.edit_url);

  if (!designId || !editUrl) {
    throw new CanvaAdapterError(
      "upstream",
      "create-design-from-candidate did not return both designId and editUrl — refusing to invent them",
      { retryable: true, details: { payload } },
    );
  }

  const pages = asArray(root.pages).length
    ? asArray(root.pages)
    : asArray(summary.pages);
  const pageIds = pages
    .map((p) => str(asRecord(p)?.page_id) ?? str(asRecord(p)?.pageId) ?? str(asRecord(p)?.id))
    .filter((id): id is string => Boolean(id));

  return { designId, editUrl, pageIds };
}

export function parseEditingTransaction(payload: unknown): {
  transactionId: string;
  editDesignUrl: string;
  elements: EditableElementRef[];
  pageIds: string[];
} {
  const root = asRecord(payload) ?? {};
  const txn = asRecord(root.transaction) ?? root;
  const transactionId =
    str(txn.transaction_id) ??
    str(txn.transactionId) ??
    str(root.transaction_id);

  const editDesignUrl =
    str(root.edit_design_url) ??
    str(root.editDesignUrl) ??
    str(root.edit_url) ??
    str(root.editUrl);

  if (!transactionId || !editDesignUrl) {
    throw new CanvaAdapterError(
      "upstream",
      "start-editing-transaction did not return transaction_id and edit_design_url",
      { retryable: true, details: { payload } },
    );
  }

  const elements: EditableElementRef[] = [];
  for (const rt of asArray(root.richtexts)) {
    const row = asRecord(rt);
    const elementId = str(row?.element_id) ?? str(row?.elementId);
    if (!elementId) continue;
    const regions = asArray(row?.regions);
    const previewText = regions
      .map((r) => str(asRecord(r)?.text))
      .filter(Boolean)
      .join(" ");
    elements.push({
      elementId,
      kind: "richtext",
      editable: true,
      ...(typeof row?.page_index === "number" ? { pageIndex: row.page_index } : {}),
      ...(previewText ? { previewText } : {}),
    });
  }
  for (const fill of asArray(root.fills)) {
    const row = asRecord(fill);
    const elementId = str(row?.element_id) ?? str(row?.elementId);
    if (!elementId) continue;
    const assetId = str(row?.asset_id) ?? str(row?.assetId);
    elements.push({
      elementId,
      kind: "fill",
      editable: row?.editable === false ? false : true,
      ...(typeof row?.page_index === "number" ? { pageIndex: row.page_index } : {}),
      ...(assetId ? { assetId } : {}),
    });
  }

  const pageIds = asArray(root.pages)
    .map((p) => str(asRecord(p)?.page_id) ?? str(asRecord(p)?.pageId))
    .filter((id): id is string => Boolean(id));

  return { transactionId, editDesignUrl, elements, pageIds };
}

export function parseExportJob(payload: unknown): {
  jobId: string | null;
  status: "completed" | "pending" | "failed" | "partial" | "unknown";
  downloadUrl: string | null;
} {
  const root = asRecord(payload) ?? {};
  const job = asRecord(root.job) ?? asRecord(root.export) ?? root;
  const jobId = str(job.job_id) ?? str(job.jobId) ?? str(job.id) ?? null;
  const statusRaw = (str(job.status) ?? str(root.status) ?? "unknown").toLowerCase();
  let status: "completed" | "pending" | "failed" | "partial" | "unknown" = "unknown";
  if (["completed", "success", "succeeded", "done"].includes(statusRaw)) {
    status = "completed";
  } else if (["pending", "in_progress", "processing", "running"].includes(statusRaw)) {
    status = "pending";
  } else if (["partial", "partially_completed", "incomplete"].includes(statusRaw)) {
    status = "partial";
  } else if (["failed", "error"].includes(statusRaw)) {
    status = "failed";
  }

  const downloadUrl =
    str(job.url) ??
    str(job.download_url) ??
    str(job.downloadUrl) ??
    str(asRecord(asArray(job.urls)[0])?.url) ??
    null;

  if (status === "unknown" && downloadUrl) status = "completed";

  return { jobId, status, downloadUrl };
}

/**
 * get-design-content is read-only. Element-like ids found there must NEVER
 * be used for perform-editing-operations.
 */
export function assertNotReadonlyContentElementId(
  elementId: string,
  readonlyIds: ReadonlySet<string>,
): void {
  if (readonlyIds.has(elementId)) {
    throw new CanvaAdapterError(
      "readonly_element_forbidden",
      `Element id ${elementId} came from read-only design content and is not valid for editing. Use ids from start-editing-transaction / perform-editing-operations only.`,
      { retryable: false },
    );
  }
}
