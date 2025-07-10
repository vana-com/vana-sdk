import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 },
    );
  }

  try {
    // Validate that we only proxy certain domains for security
    const parsedUrl = new URL(url);
    const allowedDomains = ["drive.google.com", "docs.google.com"];

    if (!allowedDomains.includes(parsedUrl.hostname)) {
      return NextResponse.json(
        { error: "Domain not allowed" },
        { status: 403 },
      );
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Vana-SDK-Demo/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch file: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      );
    }

    const data = await response.arrayBuffer();
    const contentType =
      response.headers.get("content-type") || "application/octet-stream";

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch file through proxy",
      },
      { status: 500 },
    );
  }
}
