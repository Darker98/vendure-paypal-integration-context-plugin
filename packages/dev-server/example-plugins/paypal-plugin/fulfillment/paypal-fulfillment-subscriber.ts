import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ApiError, OrdersController, ShipmentCarrier } from '@paypal/paypal-server-sdk';
import {
    EventBus,
    FulfillmentStateTransitionEvent,
    Logger,
    TransactionalConnection,
} from '@vendure/core';
import { Fulfillment } from '@vendure/core';
import { concatMap, filter } from 'rxjs/operators';

import { getPayPalClient } from '../paypal-client';
import { PAYPAL_PAYMENT_METHOD_CODE } from '../constants';

const loggerCtx = 'PayPalFulfillmentSubscriber';

@Injectable()
export class PayPalFulfillmentSubscriber implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private connection: TransactionalConnection,
    ) {}

    onApplicationBootstrap(): void {
        this.eventBus
            .ofType(FulfillmentStateTransitionEvent)
            .pipe(
                filter(event => event.toState === 'Shipped'),
                concatMap(event => this.handleFulfillmentShipped(event).catch(err => {
                    Logger.error(
                        `Unhandled error in shipment tracking handler: ${err instanceof Error ? err.message : String(err)}`,
                        loggerCtx,
                    );
                })),
            )
            .subscribe();
    }

    private async handleFulfillmentShipped(event: FulfillmentStateTransitionEvent): Promise<void> {
        const { ctx, fulfillment } = event;

        const fulfillmentWithOrders = await this.connection
            .getRepository(ctx, Fulfillment)
            .findOne({
                where: { id: fulfillment.id },
                relations: ['orders', 'orders.payments'],
            });

        if (!fulfillmentWithOrders?.orders?.length) {
            Logger.debug(
                `Fulfillment ${fulfillment.id} has no associated orders — skipping PayPal tracking push.`,
                loggerCtx,
            );
            return;
        }

        for (const order of fulfillmentWithOrders.orders) {
            const paypalPayment = order.payments?.find(
                p =>
                    p.method === PAYPAL_PAYMENT_METHOD_CODE &&
                    typeof p.metadata?.captureId === 'string' &&
                    typeof p.metadata?.paypalOrderId === 'string',
            );

            if (!paypalPayment) {
                Logger.debug(
                    `Order ${order.code} has no captured PayPal payment — skipping tracking push.`,
                    loggerCtx,
                );
                continue;
            }

            const paypalOrderId = paypalPayment.metadata.paypalOrderId as string;
            const captureId = paypalPayment.metadata.captureId as string;
            const trackingNumber = fulfillmentWithOrders.trackingCode;
            const method = fulfillmentWithOrders.method;

            if (!trackingNumber) {
                Logger.warn(
                    `Fulfillment ${fulfillment.id} for order ${order.code} has no trackingCode — ` +
                        'tracking number will be omitted from PayPal push.',
                    loggerCtx,
                );
            }

            await this.pushTrackingToPayPal(paypalOrderId, captureId, trackingNumber, method, order.code);
        }
    }

    private async pushTrackingToPayPal(
        paypalOrderId: string,
        captureId: string,
        trackingNumber: string | null | undefined,
        method: string,
        orderCode: string,
    ): Promise<void> {
        const { carrier, carrierNameOther } = resolveCarrier(method);

        try {
            const client = getPayPalClient();
            const ordersController = new OrdersController(client);

            const body: {
                captureId: string;
                notifyPayer: boolean;
                trackingNumber?: string;
                carrier?: ShipmentCarrier;
                carrierNameOther?: string;
            } = {
                captureId,
                notifyPayer: true,
                carrier,
            };

            if (trackingNumber) {
                body.trackingNumber = trackingNumber;
            }
            if (carrierNameOther) {
                body.carrierNameOther = carrierNameOther;
            }

            await ordersController.createOrderTracking({ id: paypalOrderId, body });

            Logger.info(
                `Pushed shipment tracking to PayPal for order ${orderCode}: ` +
                    `carrier=${carrier}${carrierNameOther ? ` (${carrierNameOther})` : ''}, ` +
                    `trackingNumber=${trackingNumber ?? '(none)'}`,
                loggerCtx,
            );
        } catch (err) {
            if (err instanceof ApiError) {
                const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
                Logger.error(
                    `PayPal tracking push failed for order ${orderCode} (${err.statusCode}): ${body}`,
                    loggerCtx,
                );
            } else {
                Logger.error(
                    `PayPal tracking push failed for order ${orderCode}: ${err instanceof Error ? err.message : String(err)}`,
                    loggerCtx,
                );
            }
            // Do not rethrow — a failed tracking push must not crash the fulfillment flow.
        }
    }
}

/**
 * Maps a Vendure fulfillment method name to a PayPal ShipmentCarrier enum value.
 *
 * Resolution order:
 * 1. Normalize method string and check for an exact match against all carrier values.
 * 2. Keyword-based match for the most common global carriers.
 * 3. Fall back to ShipmentCarrier.Other with carrierNameOther set to the original method string.
 */
function resolveCarrier(method: string): { carrier: ShipmentCarrier; carrierNameOther?: string } {
    const normalized = method.trim().toUpperCase().replace(/[\s-]+/g, '_');
    const allValues = new Set(Object.values(ShipmentCarrier) as string[]);

    if (allValues.has(normalized)) {
        return { carrier: normalized as unknown as ShipmentCarrier };
    }

    const keywords: Array<[string, string]> = [
        ['UPS', 'UPS'],
        ['FEDEX', 'FEDEX'],
        ['DHL', 'DHL_SG'],
        ['USPS', 'USPS'],
        ['ROYAL_MAIL', 'ROYAL_MAIL'],
        ['ROYALMAIL', 'ROYAL_MAIL'],
        ['AMAZON', 'AMAZON'],
        ['PUROLATOR', 'PUROLATOR'],
    ];

    for (const [keyword, candidate] of keywords) {
        if (normalized.includes(keyword) && allValues.has(candidate)) {
            return { carrier: candidate as unknown as ShipmentCarrier };
        }
    }

    return { carrier: ShipmentCarrier.Other, carrierNameOther: method };
}
