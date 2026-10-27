import { NextResponse } from "next/server";
import { apiErrorResponse, readJsonObject } from "../../../lib/api";
import { hashPassword, requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const users = await prisma.user.findMany({
      where: user.role === "ADMIN" ? undefined : { id: user.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { name: "asc" },
    });

    const withCounts = await Promise.all(
      users.map(async (member) => {
        const [assignedLeadsCount, activeBookingsCount] = await Promise.all([
          prisma.lead.count({ where: { assignedToId: member.id } }),
          prisma.booking.count({
            where: {
              userId: member.id,
              status: { in: ["PENDING", "CONFIRMED"] },
            },
          }),
        ]);
        return { ...member, assignedLeadsCount, activeBookingsCount };
      }),
    );

    return NextResponse.json(withCounts);
  } catch (error) {
    return apiErrorResponse(error, "Fetch team");
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (
    name.length < 2 ||
    name.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12
  ) {
    return NextResponse.json(
      { error: "Enter a valid name, email, and password of at least 12 characters." },
      { status: 400 },
    );
  }

  try {
    await requireUser(["ADMIN"]);
    const user = await prisma.user.create({
      data: { name, email, passwordHash: await hashPassword(password) },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Create team member");
  }
}

export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const email =
    typeof body?.email === "string"
      ? body.email.trim().toLowerCase()
      : undefined;
  const password = typeof body?.password === "string" ? body.password : "";

  if (
    !id ||
    (name !== undefined && (name.length < 2 || name.length > 120)) ||
    (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    (password !== "" && password.length < 12) ||
    (name === undefined && email === undefined && password === "")
  ) {
    return NextResponse.json(
      { error: "Enter valid employee details and a 12-character password if changing it." },
      { status: 400 },
    );
  }

  try {
    await requireUser(["ADMIN"]);
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Update team member");
  }
}
