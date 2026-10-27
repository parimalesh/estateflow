import { NextResponse } from "next/server";
import {
  createSession,
  deleteCurrentSession,
  getSessionUser,
  verifyPassword,
} from "../../../lib/auth";
import { apiErrorResponse, readJsonObject } from "../../../lib/api";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const [user, userCount] = await Promise.all([
      getSessionUser(),
      prisma.user.count(),
    ]);

    return NextResponse.json({
      user,
      setupAvailable: userCount === 0 && Boolean(process.env.ADMIN_SETUP_KEY),
      setupRequired: userCount === 0,
    });
  } catch (error) {
    return apiErrorResponse(error, "Load session");
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 },
      );
    }

    await createSession(user.id);
    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    return apiErrorResponse(error, "Sign in");
  }
}

export async function DELETE() {
  try {
    await deleteCurrentSession();
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Sign out");
  }
}
