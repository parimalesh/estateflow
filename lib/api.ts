import { NextResponse } from "next/server";
import { AuthError } from "./auth";

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function apiErrorResponse(error: unknown, operation: string) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const code =
    error !== null && typeof error === "object" && "code" in error
      ? error.code
      : undefined;

  if (code === "P2002" || code === "P2034") {
    return NextResponse.json(
      { error: "This change conflicts with a record that was just updated." },
      { status: 409 },
    );
  }
  if (code === "P2025") {
    return NextResponse.json({ error: "The requested record was not found." }, {
      status: 404,
    });
  }

  console.error(`${operation} failed:`, error);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
