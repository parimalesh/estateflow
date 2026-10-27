import { connection, NextResponse } from "next/server";
import { apiErrorResponse } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET(request: Request) {
  await connection();
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return NextResponse.json([]);

    const contains = { contains: query, mode: "insensitive" as const };
    const leadWhere = {
      ...(user.role === "ADMIN" ? {} : { assignedToId: user.id }),
      OR: [
        { name: contains },
        { phone: contains },
        { email: contains },
        { propertyName: contains },
      ],
    };
    const bookingWhere =
      user.role === "ADMIN"
        ? {}
        : {
            OR: [
              { userId: user.id },
              { lead: { assignedToId: user.id } },
            ],
          };

    const [leads, properties, units, bookings] = await Promise.all([
      prisma.lead.findMany({
        where: leadWhere,
        select: { id: true, name: true, phone: true, status: true },
        take: 5,
      }),
      prisma.property.findMany({
        where: { OR: [{ name: contains }, { location: contains }] },
        select: { id: true, name: true, location: true },
        take: 5,
      }),
      prisma.unit.findMany({
        where: {
          OR: [
            { unitNumber: contains },
            {
              building: {
                OR: [
                  { name: contains },
                  { property: { name: contains } },
                ],
              },
            },
          ],
        },
        select: {
          id: true,
          unitNumber: true,
          status: true,
          building: {
            select: {
              name: true,
              property: { select: { id: true, name: true } },
            },
          },
        },
        take: 5,
      }),
      prisma.booking.findMany({
        where: {
          AND: [
            bookingWhere,
            {
              OR: [
                { lead: { name: contains } },
                { unit: { unitNumber: contains } },
                {
                  unit: {
                    building: {
                      property: { name: contains },
                    },
                  },
                },
              ],
            },
          ],
        },
        select: {
          id: true,
          status: true,
          lead: { select: { name: true } },
          unit: {
            select: {
              unitNumber: true,
              building: {
                select: { property: { select: { name: true } } },
              },
            },
          },
        },
        take: 5,
      }),
    ]);

    return NextResponse.json([
      ...leads.map((lead) => ({
        id: lead.id,
        kind: "lead",
        title: lead.name,
        detail: `${lead.phone} · ${lead.status.toLowerCase().replace("_", " ")}`,
      })),
      ...properties.map((property) => ({
        id: property.id,
        kind: "property",
        title: property.name,
        detail: property.location,
      })),
      ...units.map((unit) => ({
        id: unit.id,
        kind: "unit",
        title: `${unit.building.property.name} · ${unit.unitNumber}`,
        detail: `${unit.building.name} · ${unit.status.toLowerCase()}`,
        propertyId: unit.building.property.id,
      })),
      ...bookings.map((booking) => ({
        id: booking.id,
        kind: "booking",
        title: `${booking.lead.name} · ${booking.unit.unitNumber}`,
        detail: `${booking.unit.building.property.name} · ${booking.status.toLowerCase()}`,
      })),
    ]);
  } catch (error) {
    return apiErrorResponse(error, "Search workspace");
  }
}
