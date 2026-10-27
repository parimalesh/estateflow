import { NextResponse } from "next/server";
import { apiErrorResponse, readJsonObject } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "SITE_VISIT",
  "INTERESTED",
  "NEGOTIATION",
  "BOOKED",
  "LOST",
] as const;

function optionalText(value: unknown, maximum: number) {
  if (value === undefined || value === null || value === "") return null;
  return typeof value === "string" && value.trim().length <= maximum
    ? value.trim()
    : undefined;
}

export async function GET() {
  try {
    const user = await requireUser();
    const leads = await prisma.lead.findMany({
      where: user.role === "ADMIN" ? undefined : { assignedToId: user.id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        followUps: {
          where: { completed: false },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });

    return NextResponse.json(leads);
  } catch (error) {
    return apiErrorResponse(error, "Fetch leads");
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Provide a valid JSON request." }, {
      status: 400,
    });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = optionalText(body.email, 254);
  const source = optionalText(body.source, 80);
  const notes = optionalText(body.notes, 4000);
  const propertyName = optionalText(body.propertyName, 160);
  const assignedToId =
    typeof body.assignedToId === "string" ? body.assignedToId.trim() : "";
  const rawBudget = body.budget;
  const budget =
    rawBudget === undefined || rawBudget === null || rawBudget === ""
      ? null
      : Number(rawBudget);

  if (
    name.length < 2 ||
    name.length > 120 ||
    !/^[+()\d\s.-]{8,24}$/.test(phone) ||
    (email !== null &&
      (email === undefined || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
    source === undefined ||
    notes === undefined ||
    propertyName === undefined ||
    (rawBudget !== undefined &&
      rawBudget !== null &&
      rawBudget !== "" &&
      (typeof budget !== "number" ||
        !Number.isFinite(budget) ||
        budget < 0))
  ) {
    return NextResponse.json(
      { error: "Check the lead details and try again." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser();
    const assignment =
      user.role === "ADMIN" ? assignedToId || null : user.id;

    if (user.role !== "ADMIN" && assignedToId && assignedToId !== user.id) {
      return NextResponse.json(
        { error: "Only an administrator can assign leads to another employee." },
        { status: 403 },
      );
    }
    if (user.role === "ADMIN" && assignment) {
      const assignee = await prisma.user.findFirst({
        where: { id: assignment, role: "SALES_EMPLOYEE" },
        select: { id: true },
      });
      if (!assignee) {
        return NextResponse.json(
          { error: "Choose an active sales employee to assign this lead." },
          { status: 400 },
        );
      }
    }

    const lead = await prisma.lead.create({
      data: {
        name,
        phone,
        email,
        source,
        notes,
        propertyName,
        budget,
        assignedToId: assignment,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        followUps: true,
      },
    });

    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Create lead");
  }
}

export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  if (!body) {
    return NextResponse.json({ error: "Provide a valid JSON request." }, {
      status: 400,
    });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "A lead ID is required." }, {
      status: 400,
    });
  }

  const update: {
    name?: string;
    email?: string | null;
    phone?: string;
    source?: string | null;
    notes?: string | null;
    propertyName?: string | null;
    budget?: number | null;
    status?: (typeof LEAD_STATUSES)[number];
    assignedToId?: string | null;
  } = {};

  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 120) {
      return NextResponse.json({ error: "Enter a valid lead name." }, {
        status: 400,
      });
    }
    update.name = body.name.trim();
  }
  if ("phone" in body) {
    if (typeof body.phone !== "string" || !/^[+()\d\s.-]{8,24}$/.test(body.phone.trim())) {
      return NextResponse.json({ error: "Enter a valid phone number." }, {
        status: 400,
      });
    }
    update.phone = body.phone.trim();
  }
  if ("email" in body) {
    const email = optionalText(body.email, 254);
    if (
      email === undefined ||
      (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    ) {
      return NextResponse.json({ error: "Enter a valid email address." }, {
        status: 400,
      });
    }
    update.email = email;
  }
  for (const field of ["source", "notes", "propertyName"] as const) {
    if (field in body) {
      const max = field === "notes" ? 4000 : field === "source" ? 80 : 160;
      const value = optionalText(body[field], max);
      if (value === undefined) {
        return NextResponse.json({ error: `Invalid ${field}.` }, {
          status: 400,
        });
      }
      update[field] = value;
    }
  }

  if ("budget" in body) {
    if (body.budget === null || body.budget === "") {
      update.budget = null;
    } else {
      const budget = Number(body.budget);
      if (!Number.isFinite(budget) || budget < 0) {
        return NextResponse.json({ error: "Enter a valid budget." }, {
          status: 400,
        });
      }
      update.budget = budget;
    }
  }
  if ("status" in body) {
    if (
      typeof body.status !== "string" ||
      !LEAD_STATUSES.includes(body.status as (typeof LEAD_STATUSES)[number])
    ) {
      return NextResponse.json({ error: "Choose a valid lead stage." }, {
        status: 400,
      });
    }
    update.status = body.status as (typeof LEAD_STATUSES)[number];
  }
  if ("assignedToId" in body) {
    if (
      body.assignedToId !== null &&
      (typeof body.assignedToId !== "string" || !body.assignedToId.trim())
    ) {
      return NextResponse.json({ error: "Choose a valid employee." }, {
        status: 400,
      });
    }
  }

  try {
    const user = await requireUser();
    const lead = await prisma.lead.findFirst({
      where: {
        id,
        ...(user.role === "ADMIN" ? {} : { assignedToId: user.id }),
      },
      select: { id: true },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    if ("assignedToId" in body) {
      if (user.role !== "ADMIN") {
        return NextResponse.json(
          { error: "Only an administrator can reassign leads." },
          { status: 403 },
        );
      }
      update.assignedToId =
        typeof body.assignedToId === "string"
          ? body.assignedToId.trim()
          : null;
      if (update.assignedToId) {
        const assignee = await prisma.user.findFirst({
          where: { id: update.assignedToId, role: "SALES_EMPLOYEE" },
          select: { id: true },
        });
        if (!assignee) {
          return NextResponse.json(
            { error: "Choose an active sales employee to assign this lead." },
            { status: 400 },
          );
        }
      }
    }

    if ("status" in update) {
      const activeBooking = await prisma.booking.findFirst({
        where: { leadId: id, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true },
      });
      if (
        (update.status === "BOOKED" && !activeBooking) ||
        (activeBooking && update.status !== "BOOKED")
      ) {
        return NextResponse.json(
          { error: "Update the booking to change this lead’s booked stage." },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.lead.update({
      where: { id },
      data: update,
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        followUps: {
          where: { completed: false },
          orderBy: { scheduledAt: "asc" },
          take: 1,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Update lead");
  }
}

export async function DELETE(request: Request) {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "A lead ID is required." }, {
      status: 400,
    });
  }

  try {
    await requireUser(["ADMIN"]);
    const lead = await prisma.lead.findUnique({
      where: { id },
      select: { id: true, bookings: { select: { id: true }, take: 1 } },
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }
    if (lead.bookings.length) {
      return NextResponse.json(
        { error: "This lead has booking history and cannot be deleted." },
        { status: 409 },
      );
    }
    await prisma.lead.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Delete lead");
  }
}
