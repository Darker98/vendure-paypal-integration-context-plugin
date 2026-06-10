import { Args, Mutation, Resolver } from '@nestjs/graphql';
import {
    ActiveOrderService,
    Allow,
    Ctx,
    Logger,
    Permission,
    RequestContext,
    UserInputError,
} from '@vendure/core';
import {
    ApiError,
    CheckoutPaymentIntent,
    OrderApplicationContextUserAction,
    OrdersController,
} from '@paypal/paypal-server-sdk';

import { getPayPalClient } from '../paypal-client';

const loggerCtx = 'PayPalShopResolver';

type PayPalOrderIntent = 'CAPTURE' | 'AUTHORIZE';

interface CreatePayPalOrderResult {
    paypalOrderId: string;
    approvalUrl: string;
}

@Resolver()
export class PayPalShopResolver {
    constructor(private activeOrderService: ActiveOrderService) {}

    @Mutation()
    @Allow(Permission.Owner)
    async createPayPalOrder(
        @Ctx() ctx: RequestContext,
        @Args() args: { intent?: PayPalOrderIntent },
    ): Promise<CreatePayPalOrderResult> {
        const activeOrder = await this.activeOrderService.getActiveOrder(ctx, undefined);

        if (!activeOrder) {
            throw new UserInputError('No active order found. Add items to your cart first.');
        }

        if (activeOrder.totalWithTax === 0) {
            throw new UserInputError('Cannot create a PayPal order for a zero-value order.');
        }

        const intent = args.intent ?? 'CAPTURE';
        const paypalIntent =
            intent === 'AUTHORIZE' ? CheckoutPaymentIntent.Authorize : CheckoutPaymentIntent.Capture;

        const currencyCode = activeOrder.currencyCode;
        // Vendure stores amounts in the smallest currency unit (e.g. cents). PayPal needs a decimal string.
        const value = (activeOrder.totalWithTax / 100).toFixed(2);

        const returnUrl = process.env.PAYPAL_RETURN_URL ?? 'http://localhost:4200/checkout/payment';
        const cancelUrl = process.env.PAYPAL_CANCEL_URL ?? 'http://localhost:4200/checkout/payment';

        try {
            const client = getPayPalClient();
            const controller = new OrdersController(client);

            const response = await controller.createOrder({
                prefer: 'return=representation',
                body: {
                    intent: paypalIntent,
                    purchaseUnits: [
                        {
                            amount: { currencyCode, value },
                            customId: activeOrder.code,
                        },
                    ],
                    applicationContext: {
                        returnUrl,
                        cancelUrl,
                        userAction: OrderApplicationContextUserAction.PayNow,
                    },
                },
            });

            const paypalOrderId = response.result?.id;
            const approvalLink = response.result?.links?.find(l => l.rel === 'approve');

            if (!paypalOrderId || !approvalLink) {
                Logger.error(
                    `PayPal createOrder missing id or approve link: ${JSON.stringify(response.result)}`,
                    loggerCtx,
                );
                throw new Error('PayPal did not return a valid order ID or approval URL.');
            }

            Logger.info(
                `Created PayPal ${intent} order ${paypalOrderId} for Vendure order ${activeOrder.code}`,
                loggerCtx,
            );

            return { paypalOrderId, approvalUrl: approvalLink.href };
        } catch (err) {
            if (err instanceof ApiError) {
                const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
                Logger.error(`PayPal createOrder API error (${err.statusCode}): ${body}`, loggerCtx);
                throw new Error(`PayPal error (${err.statusCode}): ${body}`);
            }
            if (err instanceof UserInputError) throw err;
            const message = err instanceof Error ? err.message : String(err);
            Logger.error(`PayPal createOrder unexpected error: ${message}`, loggerCtx);
            throw new Error(message);
        }
    }
}
