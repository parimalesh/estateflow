import { NextResponse } from "next/server";
import { apiErrorResponse, readJsonObject } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const followUps = await prisma.followUp.findMany({
      where:
        user.role === "ADMIN"
          ? undefined
          : {
              OR: [
                { userId: user.id },
                { lead: { assignedToId: user.id } },
              ],
            },
      include: {
        lead: {
          select: { id: true, name: true, phone: true, status: true },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: [{ completed: "asc" }, { scheduledAt: "asc" }],
      take: 500,
    });

    return NextResponse.json(followUps);
  } catch (error) {
    return apiErrorResponse(error, "Fetch follow-ups");
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const scheduledAt =
    typeof body?.scheduledAt === "string" ? new Date(body.scheduledAt) : null;
  const requestedUserId =
    typeof body?.userId === "string" ? body.userId.trim() : "";

  if (
    !leadId ||
    notes.length < 2 ||
    notes.length > 2000 ||
    !scheduledAt ||
    !Number.isFinite(scheduledAt.getTime())
  ) {
    return NextResponse.json(
      { error: "Choose a lead, date, and follow-up note." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser();
    if (user.role !== "ADMIN" && requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json(
        { error: "Only an administrator can assign reminders to another employee." },
        { status: 403 },
      );
    }
    const lead = await prisma.lead.findFirst({
      where: {
        id: leadId,
        ...(user.role === "ADMIN" ? {} : { assignedToId: user.id }),
      },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    if (user.role === "ADMIN" && requestedUserId) {
      const assignee = await prisma.user.findFirst({
        where: { id: requestedUserId, role: "SALES_EMPLOYEE" },
        select: { id: true },
      });
      if (!assignee) {
        return NextResponse.json({ error: "Choose an active employee." }, {
          status: 400,
        });
      }
    }

    const followUp = await prisma.followUp.create({
      data: {
        leadId,
        userId: user.role === "ADMIN" ? requestedUserId || user.id : user.id,
        scheduledAt,
        notes,
      },
      include: {
        lead: { select: { id: true, name: true, phone: true, status: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(followUp, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Create follow-up");
  }
}

export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const scheduledAt =
    typeof body?.scheduledAt === "string" ? new Date(body.scheduledAt) : null;
  const notes =
    typeof body?.notes === "string" ? body.notes.trim() : undefined;
  const leadId =
    typeof body?.leadId === "string" ? body.leadId.trim() : undefined;
  if (
    !id ||
    (body?.completed !== undefined &&
      typeof body.completed !== "boolean") ||
    (scheduledAt !== null && !Number.isFinite(scheduledAt.getTime())) ||
    (body?.scheduledAt !== undefined && !scheduledAt) ||
    (notes !== undefined && (notes.length < 2 || notes.length > 2000)) ||
    (body?.notes !== undefined && notes === undefined) ||
    (body?.leadId !== undefined && !leadId)
  ) {
    return NextResponse.json(
      { error: "Enter a valid follow-up ID, date, and reminder." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser();
    const data: {
      completed?: boolean;
      scheduledAt?: Date;
      notes?: string;
      leadId?: string;
      userId?: string | null;
    } = {};
    if (typeof body?.completed === "boolean") data.completed = body.completed;
    if (scheduledAt) data.scheduledAt = scheduledAt;
    if (notes !== undefined) data.notes = notes;
    if (leadId) {
      const lead = await prisma.lead.findFirst({
        where: {
          id: leadId,
          ...(user.role === "ADMIN" ? {} : { assignedToId: user.id }),
        },
        select: { id: true },
      });
      if (!lead) {
        return NextResponse.json({ error: "Lead not found." }, {
          status: 404,
        });
      }
      data.leadId = leadId;
    }

    if (user.role === "ADMIN" && "userId" in (body ?? {})) {
      if (
        body?.userId !== null &&
        (typeof body?.userId !== "string" || !body.userId.trim())
      ) {
        return NextResponse.json({ error: "Choose a valid employee." }, {
          status: 400,
        });
      }
      const assignedUserId =
        typeof body?.userId === "string" ? body.userId.trim() : null;
      if (assignedUserId) {
        const employee = await prisma.user.findFirst({
          where: { id: assignedUserId, role: "SALES_EMPLOYEE" },
          select: { id: true },
        });
        if (!employee) {
          return NextResponse.json({ error: "Choose an active employee." }, {
            status: 400,
          });
        }
      }
      data.userId = assignedUserId;
    }

    const result = await prisma.followUp.updateMany({
      where: {
        id,
        ...(user.role === "ADMIN"
          ? {}
          : { OR: [{ userId: user.id }, { lead: { assignedToId: user.id } }] }),
      },
      data,
    });
    if (!result.count) {
      return NextResponse.json({ error: "Follow-up not found." }, {
        status: 404,
      });
    }

    const followUp = await prisma.followUp.findUnique({
      where: { id },
      include: {
        lead: { select: { id: true, name: true, phone: true, status: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(followUp);
  } catch (error) {
    return apiErrorResponse(error, "Update follow-up");
  }
}
