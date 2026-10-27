import { connection, NextResponse } from "next/server";
import { apiErrorResponse } from "../../../lib/api";
import { requireUser } from "../../../lib/auth";
import { prisma } from "../../../lib/prisma";

export async function GET() {
  await connection();
  try {
    const user = await requireUser();
    const leadScope =
      user.role === "ADMIN" ? {} : { assignedToId: user.id };
    const bookingScope =
      user.role === "ADMIN"
        ? {}
        : {
            OR: [
              { userId: user.id },
              { lead: { assignedToId: user.id } },
            ],
          };
    const followUpScope =
      user.role === "ADMIN"
        ? {}
        : {
            OR: [
              { userId: user.id },
              { lead: { assignedToId: user.id } },
            ],
          };
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [
      leadCount,
      newLeadCount,
      bookedLeadCount,
      propertyCount,
      unitCount,
      availableUnitCount,
      blockedUnitCount,
      pendingBookingCount,
      confirmedBookingCount,
      cancelledBookingCount,
      revenue,
      overdueFollowUpCount,
      dueTodayCount,
      upcomingFollowUpCount,
      openFollowUpCount,
      completedFollowUpCount,
      recentLeads,
      recentBookings,
      bookings,
    ] = await Promise.all([
      prisma.lead.count({ where: leadScope }),
      prisma.lead.count({ where: { ...leadScope, status: "NEW" } }),
      prisma.lead.count({ where: { ...leadScope, status: "BOOKED" } }),
      prisma.property.count(),
      prisma.unit.count(),
      prisma.unit.count({ where: { status: "AVAILABLE" } }),
      prisma.unit.count({ where: { status: "BLOCKED" } }),
      prisma.booking.count({ where: { ...bookingScope, status: "PENDING" } }),
      prisma.booking.count({ where: { ...bookingScope, status: "CONFIRMED" } }),
      prisma.booking.count({ where: { ...bookingScope, status: "CANCELLED" } }),
      prisma.booking.aggregate({
        where: { ...bookingScope, status: { in: ["PENDING", "CONFIRMED"] } },
        _sum: { amount: true },
      }),
      prisma.followUp.count({
        where: {
          ...followUpScope,
          completed: false,
          scheduledAt: { lt: todayStart },
        },
      }),
      prisma.followUp.count({
        where: {
          ...followUpScope,
          completed: false,
          scheduledAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      prisma.followUp.count({
        where: {
          ...followUpScope,
          completed: false,
          scheduledAt: { gte: tomorrowStart },
        },
      }),
      prisma.followUp.count({
        where: { ...followUpScope, completed: false },
      }),
      prisma.followUp.count({
        where: { ...followUpScope, completed: true },
      }),
      prisma.lead.findMany({
        where: leadScope,
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          propertyName: true,
          budget: true,
          createdAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.booking.findMany({
        where: bookingScope,
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          unit: {
            include: {
              building: {
                include: { property: { select: { id: true, name: true } } },
              },
            },
          },
          user: { select: { id: true, name: true } },
        },
        orderBy: { bookedAt: "desc" },
        take: 8,
      }),
      prisma.booking.findMany({
        where: {
          ...bookingScope,
          status: { in: ["PENDING", "CONFIRMED"] },
          bookedAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) },
        },
        select: { amount: true, bookedAt: true },
        orderBy: { bookedAt: "asc" },
      }),
    ]);

    const monthlyRevenue = new Map<string, number>();
    for (const booking of bookings) {
      const month = `${booking.bookedAt.getFullYear()}-${String(
        booking.bookedAt.getMonth() + 1,
      ).padStart(2, "0")}`;
      monthlyRevenue.set(
        month,
        (monthlyRevenue.get(month) ?? 0) + Number(booking.amount),
      );
    }

    return NextResponse.json({
      counts: {
        leadCount,
        newLeadCount,
        bookedLeadCount,
        propertyCount,
        unitCount,
        availableUnitCount,
        blockedUnitCount,
        pendingBookingCount,
        confirmedBookingCount,
        cancelledBookingCount,
        overdueFollowUpCount,
        dueTodayCount,
        upcomingFollowUpCount,
        openFollowUpCount,
        completedFollowUpCount,
      },
      activeBookingCount: pendingBookingCount + confirmedBookingCount,
      activeBookingValue: revenue._sum.amount ?? 0,
      recentLeads,
      recentBookings,
      monthlyRevenue: Array.from(monthlyRevenue, ([month, amount]) => ({
        month,
        amount,
      })),
    });
  } catch (error) {
    return apiErrorResponse(error, "Load dashboard");
  }
}
