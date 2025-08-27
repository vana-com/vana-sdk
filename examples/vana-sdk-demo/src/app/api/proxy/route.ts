import { NextResponse, type NextRequest } from "next/server";
import { promises as dns } from "dns";
import { isIPv4 } from "net";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 },
    );
  }

  return handleProxy(url);
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json(
        { error: "URL is required in request body" },
        { status: 400 },
      );
    }

    return handleProxy(url);
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
}

async function handleProxy(
  url: string,
  redirectCount = 0,
): Promise<NextResponse> {
  try {
    // Prevent infinite redirect loops
    if (redirectCount > 5) {
      return NextResponse.json(
        { error: "Too many redirects" },
        { status: 400 },
      );
    }

    const { hostname } = new URL(url);

    // Resolve hostname to IP address
    // Special handling for localhost, direct IPs, and hostnames
    const ip =
      hostname === "localhost"
        ? "127.0.0.1"
        : isIPv4(hostname) || hostname === "::1"
          ? hostname
          : await dns
              .lookup(hostname)
              .then((r) => r.address)
              .catch(() => hostname);

    // SSRF Protection: Block private/internal IP ranges
    if (isIPv4(ip)) {
      const [a, b] = ip.split(".").map(Number);
      if (
        a === 10 ||
        a === 127 ||
        a === 0 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        a >= 224
      ) {
        // Also block multicast/reserved ranges
        return NextResponse.json(
          { error: "Access to private/internal addresses not allowed" },
          { status: 403 },
        );
      }
    } else if (ip === "::1") {
      // Block IPv6 loopback
      return NextResponse.json(
        { error: "Access to private/internal addresses not allowed" },
        { status: 403 },
      );
    }

    // Fetch with manual redirect handling for safety
    const response = await fetch(url, { redirect: "manual" });

    // Handle redirects recursively with the same security checks
    if (response.status >= 301 && response.status <= 308) {
      const location = response.headers.get("location");
      if (location) {
        const redirectUrl = new URL(location, url);
        return handleProxy(redirectUrl.toString(), redirectCount + 1);
      }
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch: ${response.statusText}` },
        { status: response.status },
      );
    }

    const data = await response.blob();

    return new NextResponse(data, {
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/octet-stream",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy request" },
      { status: 500 },
    );
  }
}

// Handle CORS preflight
export function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
