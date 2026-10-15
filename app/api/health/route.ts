import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { authConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Setup check: is the database reachable and is the admin login configured? Reveals nothing else. */
export async function GET() {
  let database = false;
  try {
    await query("select 1");
    database = true;
  } catch (err) {
    console.error("Health check: database unreachable", err);
  }
  return NextResponse.json({ database, adminLogin: authConfigured() }, { status: database ? 200 : 503 });
}
