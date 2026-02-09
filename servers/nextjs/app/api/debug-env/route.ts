import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    INTERNAL_API_URL: process.env.INTERNAL_API_URL || "NOT_SET",
    NODE_ENV: process.env.NODE_ENV,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes("INTERNAL") || k.includes("API") || k.includes("GCS"))
  });
}
