import { ApiError, OrdersController } from '@paypal/paypal-server-sdk';
import {
    CreatePaymentResult,
    LanguageCode,
    PaymentMethodHandler,
    SettlePaymentResult,
} from '@vendure/core';

import { PAYPAL_PAYMENT_METHOD_CODE } from '../constants';
import { getPayPalClient } from '../paypal-client';

export const paypalPaymentHandler = new PaymentMethodHandler({
    code: PAYPAL_PAYMENT_METHOD_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'PayPal' }],
    args: {},

    createPayment: async (ctx, order, amount, args, metadata): Promise<CreatePaymentResult> => {
        const paypalOrderId = metadata?.paypalOrderId as string | undefined;

        if (!paypalOrderId) {
            return {
                amount,
                state: 'Declined',
                errorMessage: 'Missing paypalOrderId in payment metadata.',
                metadata: { errorMessage: 'Missing paypalOrderId in payment metadata.' },
            };
        }

        try {
            const client = getPayPalClient();
            const controller = new OrdersController(client);

            const response = await controller.captureOrder({
                id: paypalOrderId,
                prefer: 'return=representation',
            });

            const capture = response.result?.purchaseUnits?.[0]?.payments?.captures?.[0];
            const captureId = capture?.id;

            if (!captureId) {
                return {
                    amount,
                    state: 'Declined',
                    errorMessage: 'PayPal capture succeeded but returned no capture ID.',
                    metadata: { paypalOrderId, errorMessage: 'No capture ID in PayPal response.' },
                };
            }

            return {
                amount,
                state: 'Settled',
                transactionId: captureId,
                metadata: {
                    paypalOrderId,
                    captureId,
                    captureStatus: capture.status ?? 'COMPLETED',
                },
            };
        } catch (err) {
            if (err instanceof ApiError) {
                const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
                const message = `PayPal capture failed (${err.statusCode}): ${body}`;
                return {
                    amount,
                    state: 'Declined',
                    errorMessage: message,
                    metadata: { paypalOrderId, errorMessage: message },
                };
            }
            const message = err instanceof Error ? err.message : String(err);
            return {
                amount,
                state: 'Declined',
                errorMessage: message,
                metadata: { paypalOrderId, errorMessage: message },
            };
        }
    },

    settlePayment: async (ctx, order, payment, args): Promise<SettlePaymentResult> => {
        // Standard checkout captures immediately in createPayment; this is a no-op.
        return { success: true };
    },
});
