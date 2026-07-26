"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

type Status = {
  ready: boolean;
  version?: string;
  defaultDestination: string;
  error?: string;
};

type Job = {
  id: string;
  subreddits: string[];
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  downloaded: number;
  startedAt: string;
  finishedAt?: string;
  logs: string[];
  error?: string;
};

const limits = [25, 50, 100, 250];
const runningStates = new Set(["queued", "running"]);

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function cleanSubreddit(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\/(?:www\.)?reddit\.com\/r\//i, "")
    .replace(/^r\//i, "")
    .split(/[/?#]/)[0]
    .replace(/[^a-zA-Z0-9_]/g, "");
}

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [subredditInput, setSubredditInput] = useState("");
  const [limit, setLimit] = useState(50);
  const [sort, setSort] = useState("new");
  const [timeframe, setTimeframe] = useState("month");
  const [destination, setDestination] = useState("");
  const [archive, setArchive] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/status").then((response) => response.json()),
      fetch("/api/jobs").then((response) => response.json()),
    ])
      .then(([statusData, jobData]: [Status, Job[]]) => {
        setStatus(statusData);
        setDestination(statusData.defaultDestination);
        setJobs(jobData);
      })
      .catch(() => {
        setStatus({
          ready: false,
          defaultDestination: "",
          error: "Could not reach the local service.",
        });
      });
  }, []);

  useEffect(() => {
    const hasActiveJobs = jobs.some((job) => runningStates.has(job.status));
    if (!hasActiveJobs) return;

    const timer = window.setInterval(async () => {
      const response = await fetch("/api/jobs");
      if (!response.ok) return;
      const nextJobs = (await response.json()) as Job[];
      setJobs(nextJobs);
    }, 800);

    return () => window.clearInterval(timer);
  }, [jobs]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === selectedJob) ?? jobs[0],
    [jobs, selectedJob],
  );

  function addSubreddit(raw = subredditInput) {
    const names = raw
      .split(/[\s,]+/)
      .map(cleanSubreddit)
      .filter(Boolean);
    if (!names.length) return;
    setSubreddits((current) =>
      Array.from(new Set([...current, ...names])).slice(0, 20),
    );
    setSubredditInput("");
    setFormError("");
  }

  function onSubredditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === "," || event.key === " ") {
      event.preventDefault();
      addSubreddit();
    }
    if (event.key === "Backspace" && !subredditInput && subreddits.length) {
      setSubreddits((current) => current.slice(0, -1));
    }
  }

  async function startDownload(event: FormEvent) {
    event.preventDefault();
    addSubreddit();
    const pendingName = cleanSubreddit(subredditInput);
    const finalSubreddits = Array.from(
      new Set([...subreddits, ...(pendingName ? [pendingName] : [])]),
    );

    if (!finalSubreddits.length) {
      setFormError("Add at least one subreddit to start.");
      return;
    }
    if (!destination.trim()) {
      setFormError("Choose a download folder.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subreddits: finalSubreddits,
          limit,
          sort,
          timeframe,
          destination,
          archive,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not start download.");
      setJobs((current) => [payload, ...current]);
      setSelectedJob(payload.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not start download.");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelJob(id: string) {
    const response = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
    if (!response.ok) return;
    const updated = (await response.json()) as Job;
    setJobs((current) => current.map((job) => (job.id === id ? updated : job)));
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#" aria-label="Reddl home">
          <span className="brand-mark">r/</span>
          <span>reddl</span>
        </a>
        <div className={`status-pill ${status?.ready ? "ready" : ""}`}>
          <span className="status-dot" />
          {status === null
            ? "Checking gallery-dl"
            : status.ready
              ? `gallery-dl ${status.version}`
              : "Setup needed"}
        </div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">LOCAL MEDIA COLLECTOR</p>
          <h1>
            Keep the good stuff.
            <span>Skip the tedious part.</span>
          </h1>
        </div>
        <p className="hero-copy">
          Bulk-save videos and GIFs from your favorite subreddits with a clean
          layer over gallery-dl. Everything stays on your machine.
        </p>
      </section>

      <section className="workspace">
        <form className="control-panel" onSubmit={startDownload}>
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <h2>Choose subreddits</h2>
              <p>Paste names or full Reddit URLs</p>
            </div>
          </div>

          <div className="tag-input" onClick={() => document.getElementById("subreddit-input")?.focus()}>
            {subreddits.map((name) => (
              <button
                type="button"
                className="subreddit-tag"
                key={name}
                onClick={() => setSubreddits((current) => current.filter((item) => item !== name))}
                aria-label={`Remove r/${name}`}
              >
                r/{name} <span>×</span>
              </button>
            ))}
            <input
              id="subreddit-input"
              value={subredditInput}
              onChange={(event) => setSubredditInput(event.target.value)}
              onKeyDown={onSubredditKeyDown}
              onBlur={() => addSubreddit()}
              placeholder={subreddits.length ? "Add another…" : "e.g. perfectlycutscreams"}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className="field-help">Press Enter to add · up to 20 at once</p>

          <div className="divider" />

          <div className="section-heading">
            <span className="step-number">02</span>
            <div>
              <h2>Shape the batch</h2>
              <p>Only video and animated formats are saved</p>
            </div>
          </div>

          <div className="field-grid">
            <fieldset>
              <legend>Posts per subreddit</legend>
              <div className="segmented compact">
                {limits.map((value) => (
                  <button
                    type="button"
                    className={limit === value ? "selected" : ""}
                    onClick={() => setLimit(value)}
                    key={value}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Sort by</legend>
              <div className="segmented">
                {["new", "hot", "top"].map((value) => (
                  <button
                    type="button"
                    className={sort === value ? "selected" : ""}
                    onClick={() => setSort(value)}
                    key={value}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {sort === "top" && (
            <label className="select-field">
              <span>Top posts from</span>
              <select value={timeframe} onChange={(event) => setTimeframe(event.target.value)}>
                <option value="day">Past day</option>
                <option value="week">Past week</option>
                <option value="month">Past month</option>
                <option value="year">Past year</option>
                <option value="all">All time</option>
              </select>
            </label>
          )}

          <label className="folder-field">
            <span>Download folder</span>
            <div className="folder-input">
              <span aria-hidden="true">⌂</span>
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                spellCheck={false}
              />
            </div>
          </label>

          <label className="toggle-row">
            <span>
              <strong>Skip files you already saved</strong>
              <small>Uses a download archive inside the output folder</small>
            </span>
            <input
              type="checkbox"
              checked={archive}
              onChange={(event) => setArchive(event.target.checked)}
            />
          </label>

          {status && !status.ready && (
            <div className="notice">
              <strong>gallery-dl wasn’t found</strong>
              <span>{status.error}</span>
              <code>python3 -m pip install -U gallery-dl</code>
            </div>
          )}
          {formError && <p className="form-error">{formError}</p>}

          <button className="download-button" disabled={submitting || status?.ready === false}>
            <span>{submitting ? "Starting…" : "Start download"}</span>
            <span aria-hidden="true">↓</span>
          </button>
          <p className="privacy-note">
            <span>●</span> Runs locally · nothing is uploaded
          </p>
        </form>

        <aside className="queue-panel">
          <div className="queue-header">
            <div>
              <p className="eyebrow">DOWNLOAD ACTIVITY</p>
              <h2>Your queue</h2>
            </div>
            {jobs.some((job) => runningStates.has(job.status)) && (
              <span className="live-label"><i /> LIVE</span>
            )}
          </div>

          {!jobs.length ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <span className="file-card back">GIF</span>
                <span className="file-card front">▶</span>
                <i className="down-arrow">↓</i>
              </div>
              <h3>Ready when you are</h3>
              <p>Your download jobs and live progress will show up here.</p>
              <div className="empty-tip">
                <span>TIP</span>
                Start with 25 posts to check a new subreddit before pulling a large batch.
              </div>
            </div>
          ) : (
            <div className="queue-content">
              <div className="job-list">
                {jobs.map((job) => (
                  <button
                    type="button"
                    key={job.id}
                    className={`job-card ${activeJob?.id === job.id ? "active" : ""}`}
                    onClick={() => setSelectedJob(job.id)}
                  >
                    <span className={`job-icon ${job.status}`}>
                      {job.status === "completed" ? "✓" : job.status === "failed" ? "!" : "↓"}
                    </span>
                    <span className="job-summary">
                      <strong>{job.subreddits.map((name) => `r/${name}`).join(", ")}</strong>
                      <small>
                        {job.downloaded} saved · {timeLabel(job.startedAt)}
                      </small>
                    </span>
                    <span className="job-status">{job.status}</span>
                  </button>
                ))}
              </div>

              {activeJob && (
                <div className="job-detail">
                  <div className="detail-title">
                    <span>
                      <small>SELECTED JOB</small>
                      <strong>{activeJob.downloaded} files saved</strong>
                    </span>
                    {runningStates.has(activeJob.status) && (
                      <button type="button" onClick={() => cancelJob(activeJob.id)}>
                        Cancel
                      </button>
                    )}
                  </div>
                  <div className={`progress-track ${runningStates.has(activeJob.status) ? "moving" : ""}`}>
                    <span />
                  </div>
                  <pre className="job-log" aria-label="Download log">
                    {activeJob.logs.length
                      ? activeJob.logs.slice(-14).join("\n")
                      : "Waiting for gallery-dl…"}
                  </pre>
                  {activeJob.error && <p className="job-error">{activeJob.error}</p>}
                </div>
              )}
            </div>
          )}
        </aside>
      </section>

      <footer>
        <span>Built for your local network</span>
        <span>reddit → gallery-dl → your disk</span>
      </footer>
    </main>
  );
}
