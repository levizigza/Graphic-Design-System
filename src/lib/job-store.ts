import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  JobManifestSchema,
  type JobManifest,
  type JobPhase,
  type VersionedArtifactKind,
  type VersionedArtifactRef,
} from "../schemas/job-manifest.js";
import { SCHEMA_VERSION } from "../schemas/version.js";
import { createCorrelationId, createJobId } from "./ids.js";

export type JobStoreOptions = {
  rootDir: string;
  now?: () => string;
};

function sha256Hex(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Filesystem job store: versioned briefs, concepts, specs, critiques, exports.
 * Never writes secrets or credentials into manifests.
 */
export class JobStore {
  private readonly rootDir: string;
  private readonly now: () => string;

  constructor(options: JobStoreOptions) {
    this.rootDir = options.rootDir;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  jobDir(jobId: string): string {
    return join(this.rootDir, jobId);
  }

  async createJob(input?: {
    jobId?: string;
    correlationId?: string;
  }): Promise<JobManifest> {
    const now = this.now();
    const jobId = input?.jobId ?? createJobId();
    const correlationId = input?.correlationId ?? createCorrelationId();
    const manifest = JobManifestSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      id: `job-manifest-${jobId}`,
      createdAt: now,
      updatedAt: now,
      jobId,
      correlationId,
      phase: "intake",
      history: [
        {
          at: now,
          toPhase: "intake",
          correlationId,
          note: "job created",
        },
      ],
      latest: {},
      versions: [],
      canvaDesignId: null,
      canvaEditUrl: null,
      errorState: { failed: false },
    });
    await mkdir(this.jobDir(jobId), { recursive: true });
    await this.writeManifest(manifest);
    return manifest;
  }

  async readManifest(jobId: string): Promise<JobManifest> {
    const raw = await readFile(join(this.jobDir(jobId), "manifest.json"), "utf8");
    return JobManifestSchema.parse(JSON.parse(raw));
  }

  async writeManifest(manifest: JobManifest): Promise<void> {
    const dir = this.jobDir(manifest.jobId);
    await mkdir(dir, { recursive: true });
    const parsed = JobManifestSchema.parse({
      ...manifest,
      updatedAt: this.now(),
    });
    await writeFile(
      join(dir, "manifest.json"),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf8",
    );
  }

  async transitionPhase(
    jobId: string,
    toPhase: JobPhase,
    meta?: { correlationId?: string; requestId?: string; note?: string },
  ): Promise<JobManifest> {
    const manifest = await this.readManifest(jobId);
    const now = this.now();
    const entry: JobManifest["history"][number] = {
      at: now,
      fromPhase: manifest.phase,
      toPhase,
    };
    if (meta?.correlationId) entry.correlationId = meta.correlationId;
    else entry.correlationId = manifest.correlationId;
    if (meta?.requestId) entry.requestId = meta.requestId;
    if (meta?.note) entry.note = meta.note;

    const next = JobManifestSchema.parse({
      ...manifest,
      phase: toPhase,
      history: [...manifest.history, entry],
      updatedAt: now,
      errorState:
        toPhase === "failed"
          ? manifest.errorState.failed
            ? manifest.errorState
            : {
                failed: true as const,
                code: "job_failed",
                message: meta?.note ?? "Job marked failed",
                retryable: false,
                occurredAt: now,
                correlationId: manifest.correlationId,
                jobId,
              }
          : { failed: false as const },
    });
    await this.writeManifest(next);
    return next;
  }

  /**
   * Persist a versioned artifact and update the job manifest pointer.
   */
  async saveVersionedArtifact(input: {
    jobId: string;
    kind: VersionedArtifactKind;
    artifactId: string;
    version: string;
    body: unknown;
    correlationId?: string;
    notes?: string[];
  }): Promise<{ ref: VersionedArtifactRef; manifest: JobManifest }> {
    const manifest = await this.readManifest(input.jobId);
    const now = this.now();
    const dirName = kindDir(input.kind);
    const relativePath = join(dirName, `${input.version}.json`);
    const absDir = join(this.jobDir(input.jobId), dirName);
    await mkdir(absDir, { recursive: true });

    const content = `${JSON.stringify(input.body, null, 2)}\n`;
    const hash = sha256Hex(content);
    await writeFile(join(this.jobDir(input.jobId), relativePath), content, "utf8");

    const ref: VersionedArtifactRef = {
      kind: input.kind,
      artifactId: input.artifactId,
      version: input.version,
      relativePath: relativePath.replace(/\\/g, "/"),
      sha256: hash,
      createdAt: now,
      notes: input.notes ?? [],
    };
    if (input.correlationId) ref.correlationId = input.correlationId;
    else ref.correlationId = manifest.correlationId;

    const latest = { ...manifest.latest };
    switch (input.kind) {
      case "brief":
        latest.briefVersion = input.version;
        break;
      case "concept":
      case "concept_board":
        latest.conceptBoardVersion = input.version;
        break;
      case "design_spec":
        latest.designSpecVersion = input.version;
        break;
      case "critique":
        latest.critiqueVersion = input.version;
        break;
      case "export":
        latest.exportVersion = input.version;
        break;
      case "asset_manifest":
        latest.assetManifestVersion = input.version;
        break;
      default:
        break;
    }

    const next = JobManifestSchema.parse({
      ...manifest,
      latest,
      versions: [...manifest.versions, ref],
      updatedAt: now,
    });
    await this.writeManifest(next);
    return { ref, manifest: next };
  }
}

function kindDir(kind: VersionedArtifactKind): string {
  switch (kind) {
    case "brief":
      return "briefs";
    case "concept":
    case "concept_board":
      return "concepts";
    case "design_spec":
      return "specs";
    case "critique":
      return "critiques";
    case "export":
      return "exports";
    case "preflight":
      return "preflight";
    case "asset_manifest":
      return "assets";
    case "render_result":
      return "renders";
    default:
      return "other";
  }
}
