import { Request, Response } from 'express';
import { Registration } from '../../models/user.model';
import { Event } from '../../models/events.model';
import { Invoice } from '../../models/invoice.model';
import { EventRegistration } from '../../models/event-registration.model';

export class DashboardController {
  static async getStats(req: Request, res: Response) {
    try {
      const [totalUsers, activeEvents, revenueData, pendingInvoices] = await Promise.all([
        Registration.countDocuments(),
        Event.countDocuments({ isActive: true }),
        Invoice.aggregate([
          { $match: { status: 'paid' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Invoice.countDocuments({ status: 'pending' })
      ]);

      const totalRevenue = revenueData.length > 0 ? revenueData[0].total : 0;

      // Calculate trends (mocked for now, but could be calculated by comparing with previous period)
      // For a real implementation, we would query data from last month/week and compare.
      const trends = {
        users: { value: 12, isPositive: true },
        events: { value: 2, isPositive: true },
        revenue: { value: 8, isPositive: true },
        invoices: { value: 5, isPositive: false }
      };

      res.json({
        success: true,
        data: {
          totalUsers,
          activeEvents,
          totalRevenue,
          pendingInvoices,
          trends
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getRecentActivity(req: Request, res: Response) {
    try {
      // Fetch recent registrations
      const recentRegistrations = await EventRegistration.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'fullName')
        .populate('event', 'name')
        .lean();

      // Fetch recent payments
      const recentPayments = await Invoice.find({ status: 'paid' })
        .sort({ paidAt: -1 })
        .limit(5)
        .populate('user', 'fullName')
        .populate('event', 'name')
        .lean();

      // Combine and format
      const activities = [
        ...recentRegistrations.map((reg: any) => ({
          id: reg._id,
          type: 'registration',
          message: `New registration: ${reg.user?.fullName || 'Unknown User'} for "${reg.event?.name || 'Unknown Event'}"`,
          time: reg.createdAt,
          timestamp: new Date(reg.createdAt).getTime()
        })),
        ...recentPayments.map((inv: any) => ({
          id: inv._id,
          type: 'payment',
          message: `Payment received from ${inv.user?.fullName || 'Unknown User'} for "${inv.event?.name || 'Unknown Event'}"`,
          time: inv.paidAt || inv.createdAt,
          timestamp: new Date(inv.paidAt || inv.createdAt).getTime()
        }))
      ];

      // Sort by timestamp desc and take top 10
      const sortedActivities = activities
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

      res.json({
        success: true,
        data: sortedActivities
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}
