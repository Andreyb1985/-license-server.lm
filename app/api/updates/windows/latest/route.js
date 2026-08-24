import { buildWindowsUpdateManifest } from "../../../../../lib/update-manifest.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(buildWindowsUpdateManifest(), {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Windows update manifest is invalid", error);
    return Response.json(
      {
        available: false,
        platform: "windows",
        message: "Update service is temporarily unavailable.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
