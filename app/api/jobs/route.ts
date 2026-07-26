import { NextRequest, NextResponse } from "next/server";
import { createJob, listJobs } from "../../../lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subredditPattern = /^[A-Za-z0-9_]{2,21}$/;
const validSorts = new Set(["new", "hot", "top"]);
const validTimeframes = new Set(["day", "week", "month", "year", "all"]);

export async function GET() {
  return NextResponse.json(listJobs());
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subreddits: string[] = Array.isArray(body.subreddits)
      ? Array.from(
          new Set(
            body.subreddits.filter(
              (value: unknown): value is string => typeof value === "string",
            ),
          ),
        )
      : [];
    const limit = Number(body.limit);

    if (
      !subreddits.length ||
      subreddits.length > 20 ||
      !subreddits.every((name) => subredditPattern.test(name))
    ) {
      return NextResponse.json(
        { error: "Use 1–20 valid subreddit names." },
        { status: 400 },
      );
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      return NextResponse.json(
        { error: "Posts per subreddit must be between 1 and 500." },
        { status: 400 },
      );
    }
    if (!validSorts.has(body.sort) || !validTimeframes.has(body.timeframe)) {
      return NextResponse.json({ error: "Invalid sorting option." }, { status: 400 });
    }
    if (typeof body.destination !== "string" || !body.destination.trim()) {
      return NextResponse.json({ error: "Choose a download folder." }, { status: 400 });
    }

    const job = await createJob({
      subreddits,
      limit,
      sort: body.sort,
      timeframe: body.timeframe,
      destination: body.destination,
      archive: body.archive !== false,
    });
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start job." },
      { status: 500 },
    );
  }
}
