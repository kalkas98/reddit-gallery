import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { defaultDestination } from "../../../lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function GET() {
  try {
    const { stdout } = await execFileAsync("gallery-dl", ["--version"], {
      timeout: 4000,
    });
    return NextResponse.json({
      ready: true,
      version: stdout.trim(),
      defaultDestination,
    });
  } catch {
    return NextResponse.json({
      ready: false,
      defaultDestination,
      error: "Install it, then restart this app.",
    });
  }
}
