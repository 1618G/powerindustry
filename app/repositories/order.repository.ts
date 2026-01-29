/**
 * Order Repository - Data access for Order entity
 *
 * PURPOSE: All database operations for orders
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";
import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { nanoid } from "nanoid";

// ============================================
// Types
// ============================================

export interface CreateOrderInput {
  buyerUserId: string;
  storeId: string;
  subtotal: number;
  shippingCost?: number;
  platformFee?: number;
  communityFee?: number;
  taxAmount?: number;
  discountAmount?: number;
  total: number;
  currency?: string;
  shippingMethod?: string;
  shippingAddress?: Prisma.InputJsonValue;
  buyerNote?: string;
}

export interface CreateOrderItemInput {
  orderId: string;
  listingId: string;
  title: string;
  description?: string;
  price: number;
  quantity: number;
  total: number;
  variationData?: Prisma.InputJsonValue;
  downloadUrl?: string;
  downloadLimit?: number;
}

export interface UpdateOrderInput {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  stripePaymentIntentId?: string;
  stripeCheckoutSessionId?: string;
  stripeChargeId?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  fulfilledAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  sellerNote?: string;
}

export interface CreateTimelineEventInput {
  orderId: string;
  type: string;
  title: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  actorId?: string;
  actorType?: string;
  isPublic?: boolean;
}

export interface CreateOrderMessageInput {
  orderId: string;
  senderId: string;
  senderType: string;
  message: string;
  attachments?: Prisma.InputJsonValue;
}

// ============================================
// Repository Class
// ============================================

class OrderRepositoryClass {
  /**
   * Generate unique order number
   */
  generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = nanoid(4).toUpperCase();
    return `SP-${timestamp}-${random}`;
  }

  /**
   * Find order by ID
   */
  async findById(id: string) {
    return db.order.findUnique({
      where: { id },
      include: {
        buyer: {
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerUserId: true,
          },
        },
        items: {
          include: {
            listing: {
              select: {
                id: true,
                slug: true,
              },
            },
          },
        },
        timeline: {
          orderBy: { createdAt: "desc" },
        },
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string) {
    return db.order.findUnique({
      where: { orderNumber },
      include: {
        buyer: {
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
          },
        },
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            ownerUserId: true,
          },
        },
        items: true,
        timeline: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  /**
   * Find order by Stripe Payment Intent ID
   */
  async findByPaymentIntentId(paymentIntentId: string) {
    return db.order.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      include: {
        items: true,
        store: true,
      },
    });
  }

  /**
   * Find orders by buyer
   */
  async findByBuyer(buyerUserId: string, limit = 20, offset = 0) {
    return db.order.findMany({
      where: { buyerUserId },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        items: {
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Find orders by store
   */
  async findByStore(storeId: string, status?: OrderStatus, limit = 20, offset = 0) {
    const where: Prisma.OrderWhereInput = { storeId };
    if (status) where.status = status;

    return db.order.findMany({
      where,
      include: {
        buyer: {
          select: {
            id: true,
            email: true,
            name: true,
            displayName: true,
          },
        },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Count orders by store
   */
  async countByStore(storeId: string, status?: OrderStatus): Promise<number> {
    const where: Prisma.OrderWhereInput = { storeId };
    if (status) where.status = status;
    return db.order.count({ where });
  }

  /**
   * Create order with items
   */
  async create(data: CreateOrderInput, items: Omit<CreateOrderItemInput, "orderId">[]) {
    const orderNumber = this.generateOrderNumber();

    return db.order.create({
      data: {
        orderNumber,
        buyerUserId: data.buyerUserId,
        storeId: data.storeId,
        subtotal: data.subtotal,
        shippingCost: data.shippingCost || 0,
        platformFee: data.platformFee || 0,
        communityFee: data.communityFee || 0,
        taxAmount: data.taxAmount || 0,
        discountAmount: data.discountAmount || 0,
        total: data.total,
        currency: data.currency || "GBP",
        shippingMethod: data.shippingMethod,
        shippingAddress: data.shippingAddress,
        buyerNote: data.buyerNote,
        items: {
          create: items.map(item => ({
            listingId: item.listingId,
            title: item.title,
            description: item.description,
            price: item.price,
            quantity: item.quantity,
            total: item.total,
            variationData: item.variationData,
            downloadUrl: item.downloadUrl,
            downloadLimit: item.downloadLimit,
          })),
        },
        timeline: {
          create: {
            type: "created",
            title: "Order placed",
            description: `Order ${orderNumber} was placed`,
            actorType: "system",
            isPublic: true,
          },
        },
      },
      include: {
        items: true,
        timeline: true,
      },
    });
  }

  /**
   * Update order
   */
  async update(id: string, data: UpdateOrderInput) {
    return db.order.update({
      where: { id },
      data,
      include: {
        items: true,
      },
    });
  }

  /**
   * Update order status
   */
  async updateStatus(id: string, status: OrderStatus) {
    return db.order.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(id: string, paymentStatus: PaymentStatus) {
    return db.order.update({
      where: { id },
      data: { paymentStatus },
    });
  }

  /**
   * Add timeline event
   */
  async addTimelineEvent(data: CreateTimelineEventInput) {
    return db.orderTimelineEvent.create({
      data,
    });
  }

  /**
   * Get timeline events
   */
  async getTimeline(orderId: string, publicOnly = false) {
    const where: Prisma.OrderTimelineEventWhereInput = { orderId };
    if (publicOnly) where.isPublic = true;

    return db.orderTimelineEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Add message
   */
  async addMessage(data: CreateOrderMessageInput) {
    return db.orderMessage.create({
      data,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
    });
  }

  /**
   * Get messages
   */
  async getMessages(orderId: string) {
    return db.orderMessage.findMany({
      where: { orderId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            displayName: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Mark messages as read
   */
  async markMessagesAsRead(orderId: string, recipientType: "buyer" | "seller") {
    // Mark messages from the other party as read
    const senderType = recipientType === "buyer" ? "seller" : "buyer";
    
    return db.orderMessage.updateMany({
      where: {
        orderId,
        senderType,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Get order statistics for store
   */
  async getStoreStats(storeId: string) {
    const [total, pending, processing, completed, revenue] = await Promise.all([
      db.order.count({ where: { storeId } }),
      db.order.count({ where: { storeId, status: { in: ["PENDING", "PAID"] } } }),
      db.order.count({ where: { storeId, status: { in: ["PROCESSING", "SHIPPED"] } } }),
      db.order.count({ where: { storeId, status: "COMPLETED" } }),
      db.order.aggregate({
        where: { storeId, paymentStatus: "SUCCEEDED" },
        _sum: { total: true },
      }),
    ]);

    return {
      total,
      pending,
      processing,
      completed,
      revenue: revenue._sum.total || 0,
    };
  }
}

export const orderRepository = new OrderRepositoryClass();
