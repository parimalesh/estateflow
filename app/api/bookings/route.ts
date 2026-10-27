import { NextResponse } from "next/server";
import { apiErrorResponse, readJsonObject } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

class BookingConflict extends Error {}

function isBookingConflict(error: unknown) {
  return error instanceof BookingConflict;
}

export async function GET() {
  try {
    const user = await requireUser();
    const bookings = await prisma.booking.findMany({
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
        lead: { select: { id: true, name: true, phone: true, status: true } },
        unit: {
          include: {
            building: {
              include: { property: { select: { id: true, name: true, location: true } } },
            },
          },
        },
        user: { select: { id: true, name: true } },
      },
      orderBy: { bookedAt: "desc" },
      take: 500,
    });

    return NextResponse.json(bookings);
  } catch (error) {
    return apiErrorResponse(error, "Fetch bookings");
  }
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);
  const leadId = typeof body?.leadId === "string" ? body.leadId.trim() : "";
  const unitId = typeof body?.unitId === "string" ? body.unitId.trim() : "";
  const requestedUserId =
    typeof body?.userId === "string" ? body.userId.trim() : "";
  const amount =
    body?.amount === undefined || body.amount === null || body.amount === ""
      ? undefined
      : Number(body.amount);
  const bookedAt =
    body?.bookedAt === undefined || body.bookedAt === ""
      ? undefined
      : typeof body.bookedAt === "string"
        ? new Date(body.bookedAt)
        : null;

  if (
    !leadId ||
    !unitId ||
    (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) ||
    bookedAt === null ||
    (bookedAt !== undefined && !Number.isFinite(bookedAt.getTime()))
  ) {
    return NextResponse.json(
      { error: "Choose a lead and an available unit." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser();
    if (user.role !== "ADMIN" && requestedUserId && requestedUserId !== user.id) {
      return NextResponse.json(
        { error: "Only an administrator can book on behalf of another employee." },
        { status: 403 },
      );
    }
    const bookingUserId =
      user.role === "ADMIN" ? requestedUserId || user.id : user.id;
    const booking = await prisma.$transaction(
      async (tx) => {
        const lead = await tx.lead.findFirst({
          where: {
            id: leadId,
            ...(user.role === "ADMIN" ? {} : { assignedToId: user.id }),
          },
          select: { id: true, status: true },
        });
        if (!lead) {
          throw new BookingConflict("LEAD_NOT_FOUND");
        }
        if (user.role === "ADMIN" && requestedUserId) {
          const assignee = await tx.user.findFirst({
            where: { id: requestedUserId, role: "SALES_EMPLOYEE" },
            select: { id: true },
          });
          if (!assignee) {
            throw new BookingConflict("BOOKING_USER_NOT_FOUND");
          }
        }
        if (lead.status === "BOOKED" || lead.status === "LOST") {
          throw new BookingConflict("LEAD_NOT_BOOKABLE");
        }

        const activeBooking = await tx.booking.findFirst({
          where: { leadId, status: { in: ["PENDING", "CONFIRMED"] } },
          select: { id: true },
        });
        if (activeBooking) {
          throw new BookingConflict("LEAD_ALREADY_BOOKED");
        }

        const claimedLead = await tx.lead.updateMany({
          where: {
            id: leadId,
            status: {
              in: [
                "NEW",
                "CONTACTED",
                "SITE_VISIT",
                "INTERESTED",
                "NEGOTIATION",
              ],
            },
          },
          data: { status: "BOOKED" },
        });
        if (!claimedLead.count) {
          throw new BookingConflict("LEAD_NOT_BOOKABLE");
        }

        const unit = await tx.unit.findUnique({
          where: { id: unitId },
          select: { id: true, price: true, status: true },
        });
        if (!unit) {
          throw new BookingConflict("UNIT_NOT_FOUND");
        }

        const claimedUnit = await tx.unit.updateMany({
          where: { id: unitId, status: "AVAILABLE" },
          data: { status: "BOOKED" },
        });
        if (!claimedUnit.count) {
          throw new BookingConflict("UNIT_UNAVAILABLE");
        }

        return tx.booking.create({
          data: {
            leadId,
            unitId,
            userId: bookingUserId,
            amount: amount ?? unit.price,
            ...(bookedAt ? { bookedAt } : {}),
          },
          include: {
            lead: { select: { id: true, name: true, phone: true, status: true } },
            unit: {
              include: {
                building: {
                  include: {
                    property: {
                      select: { id: true, name: true, location: true },
                    },
                  },
                },
              },
            },
            user: { select: { id: true, name: true } },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (isBookingConflict(error)) {
      const reason = error.message;
      const status =
        reason === "LEAD_NOT_FOUND" ||
        reason === "UNIT_NOT_FOUND" ||
        reason === "BOOKING_USER_NOT_FOUND"
          ? 404
          : 409;
      const messages: Record<string, string> = {
        LEAD_NOT_FOUND: "Lead not found.",
        LEAD_NOT_BOOKABLE: "This lead can no longer be booked.",
        LEAD_ALREADY_BOOKED: "This lead already has an active booking.",
        UNIT_NOT_FOUND: "Unit not found.",
        UNIT_UNAVAILABLE: "That unit was just booked or is no longer available.",
        BOOKING_USER_NOT_FOUND: "Choose an active sales employee.",
      };
      return NextResponse.json(
        { error: messages[reason] ?? "Booking could not be completed." },
        { status },
      );
    }
    return apiErrorResponse(error, "Create booking");
  }
}

export async function PATCH(request: Request) {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const status =
    body?.status === "CONFIRMED" || body?.status === "CANCELLED"
      ? body.status
      : null;
  if (!id || !status) {
    return NextResponse.json(
      { error: "A booking ID and valid status are required." },
      { status: 400 },
    );
  }

  try {
    const user = await requireUser();
    const updated = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: {
          id,
          ...(user.role === "ADMIN"
            ? {}
            : {
                OR: [
                  { userId: user.id },
                  { lead: { assignedToId: user.id } },
                ],
              }),
        },
        select: { id: true, leadId: true, unitId: true, status: true },
      });
      if (!booking) throw new BookingConflict("BOOKING_NOT_FOUND");
      if (booking.status === "CANCELLED") {
        throw new BookingConflict("BOOKING_CANCELLED");
      }

      const changed = await tx.booking.updateMany({
        where: {
          id,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        data: { status },
      });
      if (!changed.count) throw new BookingConflict("BOOKING_CANCELLED");

      if (status === "CANCELLED") {
        const released = await tx.unit.updateMany({
          where: { id: booking.unitId, status: "BOOKED" },
          data: { status: "AVAILABLE" },
        });
        if (!released.count) throw new BookingConflict("UNIT_STATE_CHANGED");

        const otherActiveBooking = await tx.booking.findFirst({
          where: {
            leadId: booking.leadId,
            status: { in: ["PENDING", "CONFIRMED"] },
            id: { not: booking.id },
          },
          select: { id: true },
        });
        if (!otherActiveBooking) {
          await tx.lead.updateMany({
            where: { id: booking.leadId, status: "BOOKED" },
            data: { status: "NEGOTIATION" },
          });
        }
      }

      return tx.booking.findUniqueOrThrow({
        where: { id },
        include: {
          lead: { select: { id: true, name: true, phone: true, status: true } },
          unit: {
            include: {
              building: {
                include: {
                  property: { select: { id: true, name: true, location: true } },
                },
              },
            },
          },
          user: { select: { id: true, name: true } },
        },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (isBookingConflict(error)) {
      const messages: Record<string, string> = {
        BOOKING_NOT_FOUND: "Booking not found.",
        BOOKING_CANCELLED: "This booking has already been cancelled.",
        UNIT_STATE_CHANGED: "The unit availability changed. Refresh and try again.",
      };
      const status = error.message === "BOOKING_NOT_FOUND" ? 404 : 409;
      return NextResponse.json(
        { error: messages[error.message] ?? "Booking could not be updated." },
        { status },
      );
    }
    return apiErrorResponse(error, "Update booking");
  }
}
