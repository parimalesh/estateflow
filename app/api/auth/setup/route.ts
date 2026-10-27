import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSession, hashPassword } from "../../../../lib/auth";
import { apiErrorResponse, readJsonObject } from "../../../../lib/api";
import { prisma } from "../../../../lib/prisma";

function matchesSetupKey(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return (
    candidateBuffer.length === expectedBuffer.length &&
    timingSafeEqual(candidateBuffer, expectedBuffer)
  );
}

export async function POST(request: Request) {
  const setupKey = process.env.ADMIN_SETUP_KEY;
  if (!setupKey) {
    return NextResponse.json(
      { error: "Workspace setup is not configured on the server." },
      { status: 503 },
    );
  }

  const body = await readJsonObject(request);
  const suppliedKey = typeof body?.setupKey === "string" ? body.setupKey : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!matchesSetupKey(suppliedKey, setupKey)) {
    return NextResponse.json({ error: "Invalid setup key." }, { status: 403 });
  }
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Enter a valid name and email address." },
      { status: 400 },
    );
  }
  if (password.length < 12) {
    return NextResponse.json(
      { error: "Choose a password with at least 12 characters." },
      { status: 400 },
    );
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(
      async (tx) => {
        if ((await tx.user.count()) > 0) {
          throw new Error("WORKSPACE_ALREADY_INITIALIZED");
        }

        return tx.user.create({
          data: { name, email, passwordHash, role: "ADMIN" },
          select: { id: true, name: true, email: true, role: true },
        });
      },
      { isolationLevel: "Serializable" },
    );

    await createSession(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "WORKSPACE_ALREADY_INITIALIZED") {
      return NextResponse.json(
        { error: "This workspace already has an administrator. Sign in instead." },
        { status: 409 },
      );
    }
    return apiErrorResponse(error, "Create initial administrator");
  }
}
