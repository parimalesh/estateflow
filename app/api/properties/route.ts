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

type UnitInput = {
  unitNumber: string;
  floor: number | null;
  type: (typeof UNIT_TYPES)[number];
  price: number;
};

type BuildingInput = { name: string; units: UnitInput[] };

export async function GET() {
  try {
    await requireUser();
    const properties = await prisma.property.findMany({
      include: {
        buildings: {
          orderBy: { name: "asc" },
          include: { units: { orderBy: { unitNumber: "asc" } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(properties);
  } catch (error) {
    return apiErrorResponse(error, "Fetch properties");
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
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const description =
    body.description === undefined || body.description === ""
      ? null
      : typeof body.description === "string"
        ? body.description.trim()
        : undefined;
  const buildings: BuildingInput[] = [];

  if (Array.isArray(body.buildings)) {
    for (const rawBuilding of body.buildings) {
      if (
        rawBuilding === null ||
        typeof rawBuilding !== "object" ||
        Array.isArray(rawBuilding)
      ) {
        return NextResponse.json({ error: "Check the building details." }, {
          status: 400,
        });
      }

      const building = rawBuilding as Record<string, unknown>;
      const buildingName =
        typeof building.name === "string" ? building.name.trim() : "";
      if (!buildingName || buildingName.length > 100) {
        return NextResponse.json({ error: "Enter a valid building name." }, {
          status: 400,
        });
      }
      if (!Array.isArray(building.units) || building.units.length === 0) {
        return NextResponse.json(
          { error: "Add at least one unit to each building." },
          { status: 400 },
        );
      }

      const units: UnitInput[] = [];
      for (const rawUnit of building.units) {
        if (
          rawUnit === null ||
          typeof rawUnit !== "object" ||
          Array.isArray(rawUnit)
        ) {
          return NextResponse.json({ error: "Check the unit details." }, {
            status: 400,
          });
        }

        const unit = rawUnit as Record<string, unknown>;
        const unitNumber =
          typeof unit.unitNumber === "string" ? unit.unitNumber.trim() : "";
        const type =
          typeof unit.type === "string" &&
          UNIT_TYPES.includes(unit.type as (typeof UNIT_TYPES)[number])
            ? (unit.type as UnitInput["type"])
            : null;
        const price = Number(unit.price);
        const floor =
          unit.floor === null || unit.floor === undefined || unit.floor === ""
            ? null
            : Number(unit.floor);

        if (
          !unitNumber ||
          unitNumber.length > 40 ||
          !type ||
          !Number.isFinite(price) ||
          price <= 0 ||
          (floor !== null && (!Number.isInteger(floor) || floor < 0))
        ) {
          return NextResponse.json({ error: "Check the unit details." }, {
            status: 400,
          });
        }

        units.push({ unitNumber, floor, type, price });
      }
      buildings.push({ name: buildingName, units });
    }
  }

  if (
    name.length < 2 ||
    name.length > 160 ||
    !location ||
    location.length > 200 ||
    description === undefined ||
    (description !== null && description.length > 2000) ||
    buildings.length === 0
  ) {
    return NextResponse.json(
      { error: "Enter a project, location, building, and at least one unit." },
      { status: 400 },
    );
  }

  try {
    await requireUser(["ADMIN"]);
    const property = await prisma.property.create({
      data: {
        name,
        location,
        description,
        buildings: {
          create: buildings.map((building) => ({
            name: building.name,
            units: { create: building.units },
          })),
        },
      },
      include: {
        buildings: { include: { units: true } },
      },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Create property");
  }
}

export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const location =
    typeof body?.location === "string" ? body.location.trim() : "";
  const description =
    body?.description === null || body?.description === ""
      ? null
      : typeof body?.description === "string"
        ? body.description.trim()
        : undefined;

  if (
    !id ||
    name.length < 2 ||
    name.length > 160 ||
    !location ||
    location.length > 200 ||
    description === undefined ||
    (description !== null && description.length > 2000)
  ) {
    return NextResponse.json(
      { error: "Enter a project name, location, and valid description." },
      { status: 400 },
    );
  }

  try {
    await requireUser(["ADMIN"]);
    const property = await prisma.property.update({
      where: { id },
      data: { name, location, description },
      include: {
        buildings: { include: { units: { orderBy: { unitNumber: "asc" } } } },
      },
    });
    return NextResponse.json(property);
  } catch (error) {
    return apiErrorResponse(error, "Update property");
  }
}
