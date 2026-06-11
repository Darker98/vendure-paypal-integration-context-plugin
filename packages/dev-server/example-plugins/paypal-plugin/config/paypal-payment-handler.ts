import { ApiError, OrdersController, PaymentsController } from '@paypal/paypal-server-sdk';
import {
    CancelPaymentErrorResult,
    CancelPaymentResult,
    CreatePaymentResult,
    CreateRefundResult,
    LanguageCode,
    Logger,
    PaymentMethodHandler,
    SettlePaymentErrorResult,
    SettlePaymentResult,
} from '@vendure/core';

import { PAYPAL_PAYMENT_METHOD_CODE } from '../constants';
import { getPayPalClient } from '../paypal-client';

const loggerCtx = 'PayPalPaymentHandler';

export const paypalPaymentHandler = new PaymentMethodHandler({
    code: PAYPAL_PAYMENT_METHOD_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'PayPal' }],
    args: {},

    createPayment: async (ctx, order, amount, args, metadata): Promise<CreatePaymentResult> => {
        const paypalOrderId = metadata?.paypalOrderId as string | undefined;
        const intent = (metadata?.intent as string | undefined) ?? 'CAPTURE';

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

            if (intent === 'AUTHORIZE') {
                // ── Authorize-then-Capture flow ──────────────────────────────────
                const ordersController = new OrdersController(client);
                const response = await ordersController.authorizeOrder({
                    id: paypalOrderId,
                    prefer: 'return=representation',
                });

                const authorization =
                    response.result?.purchaseUnits?.[0]?.payments?.authorizations?.[0];
                const authorizationId = authorization?.id;

                if (!authorizationId) {
                    return {
                        amount,
                        state: 'Declined',
                        errorMessage: 'PayPal authorization returned no authorization ID.',
                        metadata: { paypalOrderId, errorMessage: 'No authorization ID in response.' },
                    };
                }

                Logger.info(
                    `PayPal order ${paypalOrderId} authorized. Authorization ID: ${authorizationId}`,
                    loggerCtx,
                );

                return {
                    amount,
                    state: 'Authorized',
                    transactionId: authorizationId,
                    metadata: {
                        paypalOrderId,
                        authorizationId,
                        authorizationStatus: authorization.status ?? 'CREATED',
                        intent: 'AUTHORIZE',
                    },
                };
            } else {
                // ── Standard Checkout (immediate capture) ────────────────────────
                const ordersController = new OrdersController(client);
                const response = await ordersController.captureOrder({
                    id: paypalOrderId,
                    prefer: 'return=representation',
                });

                const capture = response.result?.purchaseUnits?.[0]?.payments?.captures?.[0];
                const captureId = capture?.id;

                if (!captureId) {
                    return {
                        amount,
                        state: 'Declined',
                        errorMessage: 'PayPal capture returned no capture ID.',
                        metadata: { paypalOrderId, errorMessage: 'No capture ID in response.' },
                    };
                }

                Logger.info(
                    `PayPal order ${paypalOrderId} captured. Capture ID: ${captureId}`,
                    loggerCtx,
                );

                return {
                    amount,
                    state: 'Settled',
                    transactionId: captureId,
                    metadata: {
                        paypalOrderId,
                        captureId,
                        captureStatus: capture.status ?? 'COMPLETED',
                        intent: 'CAPTURE',
                    },
                };
            }
        } catch (err) {
            if (err instanceof ApiError) {
                const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
                const message = `PayPal payment failed (${err.statusCode}): ${body}`;
                Logger.error(message, loggerCtx);
                return {
                    amount,
                    state: 'Declined',
                    errorMessage: message,
                    metadata: { paypalOrderId, errorMessage: message },
                };
            }
            const message = err instanceof Error ? err.message : String(err);
            Logger.error(`PayPal payment unexpected error: ${message}`, loggerCtx);
            return {
                amount,
                state: 'Declined',
                errorMessage: message,
                metadata: { paypalOrderId, errorMessage: message },
            };
        }
    },

    cancelPayment: async (ctx, order, payment, args): Promise<CancelPaymentResult | CancelPaymentErrorResult> => {
        const authorizationId = payment.metadata?.authorizationId as string | undefined;

        if (!authorizationId) {
            // Nothing to void — payment was never authorized (e.g. already declined).
            return { success: true };
        }

        try {
            const client = getPayPalClient();
            const paymentsController = new PaymentsController(client);

            await paymentsController.voidPayment({ authorizationId });

            Logger.info(`PayPal authorization ${authorizationId} voided successfully.`, loggerCtx);

            return { success: true };
        } catch (err) {
            if (err instanceof ApiError) {
                const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
                const message = `PayPal void failed (${err.statusCode}): ${body}`;
                Logger.error(message, loggerCtx);
                // 409 = already captured; surface as a clear error message
                return { success: false, errorMessage: message };
            }
            const message = err instanceof Error ? err.message : String(err);
            Logger.error(`PayPal cancelPayment unexpected error: ${message}`, loggerCtx);
            return { success: false, errorMessage: message };
        }
    },

    settlePayment: async (ctx, order, payment, args): Promise<SettlePaymentResult | SettlePaymentErrorResult> => {
        const authorizationId = payment.metadata?.authorizationId as string | undefined;

        if (!authorizationId) {
            // Standard checkout: payment was already captured in createPayment.
            return { success: true };
        }

        // Authorize-then-Capture: capture the reserved funds now.
        try {
            const client = getPayPalClient();
            const paymentsController = new PaymentsController(client);

            const response = await paymentsController.captureAuthorizedPayment({
                authorizationId,
                prefer: 'return=representation',
                body: { finalCapture: true },
            });

            const captureId = response.result?.id;

            if (!captureId) {
                return {
                    success: false,
                    errorMessage: 'PayPal capture of authorization returned no capture ID.',
                };
            }

            Logger.info(
                `PayPal authorization ${authorizationId} captured. Capture ID: ${captureId}`,
                loggerCtx,
            );

            return { success: true };
        } catch (err) {
            if (err instanceof ApiError) {
                const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
                const message = `PayPal captureAuthorizedPayment failed (${err.statusCode}): ${body}`;
                Logger.error(message, loggerCtx);
                return { success: false, errorMessage: message };
            }
            const message = err instanceof Error ? err.message : String(err);
            Logger.error(`PayPal settlePayment unexpected error: ${message}`, loggerCtx);
            return { success: false, errorMessage: message };
        }
    },

    createRefund: async (ctx, input, amount, order, payment, args): Promise<CreateRefundResult> => {
        const captureId = payment.metadata?.captureId as string | undefined;

        if (!captureId) {
            const errorMessage =
                'Cannot refund: no captureId found on payment. Only captured payments can be refunded.';
            Logger.error(errorMessage, loggerCtx);
            return {
                state: 'Failed',
                metadata: { errorMessage },
            };
        }

        try {
            const client = getPayPalClient();
            const paymentsController = new PaymentsController(client);

            // Empty body instructs PayPal to issue a full refund for the captured amount.
            const response = await paymentsController.refundCapturedPayment({
                captureId,
                prefer: 'return=representation',
                body: {},
            });

            const refundId = response.result?.id;

            if (!refundId) {
                const errorMessage = 'PayPal refund response did not include a refund ID.';
                Logger.error(errorMessage, loggerCtx);
                return {
                    state: 'Failed',
                    metadata: { captureId, errorMessage },
                };
            }

            Logger.info(
                `PayPal full refund issued. Capture ID: ${captureId}, Refund ID: ${refundId}`,
                loggerCtx,
            );

            return {
                state: 'Settled',
                transactionId: refundId,
                metadata: {
                    captureId,
                    refundId,
                    refundStatus: response.result?.status ?? 'COMPLETED',
                },
            };
        } catch (err) {
            if (err instanceof ApiError) {
                const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
                const message = `PayPal refund failed (${err.statusCode}): ${body}`;
                Logger.error(message, loggerCtx);
                return {
                    state: 'Failed',
                    metadata: { captureId, errorMessage: message },
                };
            }
            const message = err instanceof Error ? err.message : String(err);
            Logger.error(`PayPal createRefund unexpected error: ${message}`, loggerCtx);
            return {
                state: 'Failed',
                metadata: { captureId, errorMessage: message },
            };
        }
    },
});
