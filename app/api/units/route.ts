import { NextResponse } from "next/server";
import { apiErrorResponse, readJsonObject } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

const UNIT_TYPES = [
  "STUDIO",
  "ONE_BEDROOM",
  "TWO_BEDROOM",
  "THREE_BEDROOM",
  "FOUR_BEDROOM",
  "VILLA",
  "PLOT",
  "COMMERCIAL",
] as const;
const UNIT_STATUSES = ["AVAILABLE", "BLOCKED"] as const;

function parseUnit(body: Record<string, unknown>) {
  const unitNumber =
    typeof body.unitNumber === "string" ? body.unitNumber.trim() : "";
  const type =
    typeof body.type === "string" &&
    UNIT_TYPES.includes(body.type as (typeof UNIT_TYPES)[number])
      ? (body.type as (typeof UNIT_TYPES)[number])
      : null;
  const price = Number(body.price);
  const floor =
    body.floor === null || body.floor === undefined || body.floor === ""
      ? null
      : Number(body.floor);
  const status =
    typeof body.status === "string" &&
    UNIT_STATUSES.includes(body.status as (typeof UNIT_STATUSES)[number])
      ? (body.status as (typeof UNIT_STATUSES)[number])
      : null;

  if (
    !unitNumber ||
    unitNumber.length > 40 ||
    !type ||
    !Number.isFinite(price) ||
    price <= 0 ||
    (floor !== null && (!Number.isInteger(floor) || floor < 0)) ||
    (body.status !== undefined && !status)
  ) {
    return null;
  }

  return { unitNumber, type, price, floor, status };
}

export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const status = searchParams.get("status");
    if (status && !["AVAILABLE", "BLOCKED", "BOOKED"].includes(status)) {
      return NextResponse.json({ error: "Choose a valid unit status." }, {
        status: 400,
      });
    }

    const units = await prisma.unit.findMany({
      where: {
        ...(propertyId ? { building: { propertyId } } : {}),
        ...(status ? { status: status as "AVAILABLE" | "BLOCKED" | "BOOKED" } : {}),
      },
      include: {
        building: {
          include: { property: { select: { id: true, name: true, location: true } } },
        },
      },
      orderBy: [{ building: { property: { name: "asc" } } }, { unitNumber: "asc" }],
      take: 1000,
    });
    return NextResponse.json(units);
  } catch (error) {
    return apiErrorResponse(error, "Fetch units");
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const buildingId =
    typeof body?.buildingId === "string" ? body.buildingId.trim() : "";
  const unit = body ? parseUnit(body) : null;
  if (!buildingId || !unit) {
    return NextResponse.json({ error: "Check the new unit details." }, {
      status: 400,
    });
  }

  try {
    await requireUser(["ADMIN"]);
    const created = await prisma.unit.create({
      data: {
        buildingId,
        unitNumber: unit.unitNumber,
        type: unit.type,
        price: unit.price,
        floor: unit.floor,
        ...(unit.status ? { status: unit.status } : {}),
      },
      include: { building: { include: { property: true } } },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Create unit");
  }
}

export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const unit = body ? parseUnit(body) : null;
  const status =
    body?.status === undefined ||
    (typeof body.status === "string" &&
      UNIT_STATUSES.includes(body.status as (typeof UNIT_STATUSES)[number]))
      ? (body?.status as (typeof UNIT_STATUSES)[number] | undefined)
      : null;

  if (!id || !unit || status === null) {
    return NextResponse.json({ error: "Check the unit details." }, {
      status: 400,
    });
  }

  try {
    await requireUser(["ADMIN"]);
    const current = await prisma.unit.findUnique({
      where: { id },
      include: { bookings: { where: { status: { in: ["PENDING", "CONFIRMED"] } } } },
    });
    if (!current) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    }
    if (current.status === "BOOKED" || current.bookings.length > 0) {
      return NextResponse.json(
        { error: "Units with active bookings can only be changed by updating the booking." },
        { status: 409 },
      );
    }

    const updated = await prisma.unit.update({
      where: { id },
      data: {
        unitNumber: unit.unitNumber,
        type: unit.type,
        price: unit.price,
        floor: unit.floor,
        ...(status ? { status } : {}),
      },
      include: { building: { include: { property: true } } },
    });
    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error, "Update unit");
  }
}

export async function DELETE(request: Request) {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "A unit ID is required." }, {
      status: 400,
    });
  }

  try {
    await requireUser(["ADMIN"]);
    const current = await prisma.unit.findUnique({
      where: { id },
      select: { id: true, bookings: { select: { id: true } } },
    });
    if (!current) {
      return NextResponse.json({ error: "Unit not found." }, { status: 404 });
    }
    if (current.bookings.length) {
      return NextResponse.json(
        { error: "This unit has booking history and cannot be deleted." },
        { status: 409 },
      );
    }
    await prisma.unit.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Delete unit");
  }
}
