import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";

export type PublicJob = {
  id: string;
  subreddits: string[];
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  downloaded: number;
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  error?: string;
};

type InternalJob = PublicJob & {
  child?: ChildProcessWithoutNullStreams;
};

type JobOptions = {
  subreddits: string[];
  limit: number;
  sort: "new" | "hot" | "top";
  timeframe: "day" | "week" | "month" | "year" | "all";
  destination: string;
  archive: boolean;
};

declare global {
  var redditGalleryJobs: Map<string, InternalJob> | undefined;
}

const jobs = globalThis.redditGalleryJobs ?? new Map<string, InternalJob>();
globalThis.redditGalleryJobs = jobs;

// gallery-dl's built-in Reddit "installed app" client. Supplying it switches
// the extractor away from Reddit's frequently blocked public .json endpoint.
const defaultRedditClientId = "6N9uN0krSDE-ig";

export const defaultDestination = path.join(
  os.homedir(),
  "Downloads",
  "reddit-gallery",
);

function publicJob(job: InternalJob): PublicJob {
  return {
    id: job.id,
    subreddits: job.subreddits,
    status: job.status,
    downloaded: job.downloaded,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    logs: job.logs,
    error: job.error,
  };
}

function pushLog(job: InternalJob, value: string) {
  const clean = value.replace(/\x1b\[[0-9;]*m/g, "").trim();
  if (!clean) return;
  job.logs.push(clean);
  if (job.logs.length > 240) job.logs.splice(0, job.logs.length - 240);
}

function parseStream(job: InternalJob, stream: Readable) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("SAVED|")) {
        job.downloaded += 1;
        pushLog(job, `Saved ${line.slice(6)}`);
      } else {
        pushLog(job, line);
      }
    }
  });
  stream.on("end", () => pushLog(job, buffer));
}

function resolveDestination(input: string) {
  const expanded =
    input === "~"
      ? os.homedir()
      : input.startsWith("~/")
        ? path.join(os.homedir(), input.slice(2))
        : input;
  return path.resolve(expanded);
}

export async function createJob(options: JobOptions): Promise<PublicJob> {
  const destination = resolveDestination(options.destination);
  await mkdir(destination, { recursive: true });

  const id = randomUUID();
  const job: InternalJob = {
    id,
    subreddits: options.subreddits,
    status: "queued",
    downloaded: 0,
    startedAt: new Date().toISOString(),
    logs: ["Preparing gallery-dl…"],
  };
  jobs.set(id, job);

  const args = [
    "--no-input",
    "--no-colors",
    "--option",
    `extractor.reddit.client-id=${
      process.env.REDDIT_CLIENT_ID?.trim() || defaultRedditClientId
    }`,
    "--destination",
    destination,
    "--post-range",
    `1-${options.limit}`,
    "--filter",
    "extension in ('mp4', 'webm', 'gif', 'gifv', 'm4v')",
    "--Print",
    "after:SAVED|{_path}",
  ];

  if (process.env.REDDIT_USER_AGENT?.trim()) {
    args.push(
      "--option",
      `extractor.reddit.user-agent=${process.env.REDDIT_USER_AGENT.trim()}`,
    );
  }

  if (options.archive) {
    args.push("--download-archive", path.join(destination, ".gallery-dl-archive"));
  }

  const urls = options.subreddits.map((name) => {
    const suffix = options.sort === "top" ? `top/?t=${options.timeframe}` : `${options.sort}/`;
    return `https://www.reddit.com/r/${name}/${suffix}`;
  });
  args.push(...urls);

  const child = spawn("gallery-dl", args, {
    cwd: destination,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    shell: false,
  });
  job.child = child;
  job.status = "running";
  job.logs = [
    `Downloading ${options.subreddits.map((name) => `r/${name}`).join(", ")}`,
    `Output: ${destination}`,
  ];

  parseStream(job, child.stdout);
  parseStream(job, child.stderr);

  child.on("error", (error) => {
    job.status = "failed";
    job.error =
      (error as NodeJS.ErrnoException).code === "ENOENT"
        ? "gallery-dl is not installed or is not on PATH."
        : error.message;
    pushLog(job, job.error);
    job.finishedAt = new Date().toISOString();
  });

  child.on("close", (code, signal) => {
    delete job.child;
    if (job.status === "cancelled") return;
    job.finishedAt = new Date().toISOString();
    if (code === 0) {
      job.status = "completed";
      pushLog(job, `Done — ${job.downloaded} files saved.`);
    } else {
      job.status = "failed";
      job.error = `gallery-dl exited with ${signal ? `signal ${signal}` : `code ${code}`}.`;
      pushLog(job, job.error);
    }
  });

  return publicJob(job);
}

export function listJobs() {
  return Array.from(jobs.values())
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicJob);
}

export function cancelJob(id: string) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === "queued" || job.status === "running") {
    job.status = "cancelled";
    job.finishedAt = new Date().toISOString();
    pushLog(job, "Cancelled by user.");
    job.child?.kill("SIGTERM");
    delete job.child;
  }
  return publicJob(job);
}
