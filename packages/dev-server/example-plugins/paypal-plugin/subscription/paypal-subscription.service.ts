import { Injectable } from '@nestjs/common';
import {
    ApiError,
    IntervalUnit,
    PlanRequestStatus,
    SetupFeeFailureAction,
    SubscriptionsController,
    TenureType,
} from '@paypal/paypal-server-sdk';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { getPayPalClient } from '../paypal-client';
import { PayPalSubscription } from './paypal-subscription.entity';

const loggerCtx = 'PayPalSubscriptionService';

const INTERVAL_UNIT_MAP: Record<string, IntervalUnit> = {
    DAY: IntervalUnit.Day,
    WEEK: IntervalUnit.Week,
    MONTH: IntervalUnit.Month,
    YEAR: IntervalUnit.Year,
};

export interface CreateBillingPlanInput {
    productId: string;
    name: string;
    description?: string;
    currencyCode: string;
    price: string;
    intervalUnit: string;
    intervalCount?: number;
}

export interface BillingPlanResult {
    id: string;
    name: string;
    status: string;
    description?: string | null;
    createTime?: string | null;
    updateTime?: string | null;
}

export interface CreateSubscriptionResult {
    paypalSubscriptionId: string;
    approvalUrl: string;
}

export interface SubscriptionStatusResult {
    paypalSubscriptionId: string;
    status: string;
}

@Injectable()
export class PayPalSubscriptionService {
    constructor(private connection: TransactionalConnection) {}

    async createBillingPlan(
        ctx: RequestContext,
        input: CreateBillingPlanInput,
    ): Promise<BillingPlanResult> {
        const intervalUnit = INTERVAL_UNIT_MAP[input.intervalUnit.toUpperCase()];
        if (!intervalUnit) {
            throw new Error(
                `Invalid intervalUnit "${input.intervalUnit}". Valid values: DAY, WEEK, MONTH, YEAR.`,
            );
        }

        try {
            const client = getPayPalClient();
            const controller = new SubscriptionsController(client);

            const response = await controller.createBillingPlan({
                prefer: 'return=representation',
                body: {
                    productId: input.productId,
                    name: input.name,
                    description: input.description,
                    status: PlanRequestStatus.Active,
                    billingCycles: [
                        {
                            pricingScheme: {
                                fixedPrice: {
                                    currencyCode: input.currencyCode,
                                    value: input.price,
                                },
                            },
                            frequency: {
                                intervalUnit,
                                intervalCount: input.intervalCount ?? 1,
                            },
                            tenureType: TenureType.Regular,
                            sequence: 1,
                            totalCycles: 0,
                        },
                    ],
                    paymentPreferences: {
                        autoBillOutstanding: true,
                        setupFeeFailureAction: SetupFeeFailureAction.Cancel,
                        paymentFailureThreshold: 0,
                    },
                    quantitySupported: false,
                },
            });

            const plan = response.result;
            if (!plan?.id) {
                throw new Error('PayPal did not return a billing plan ID.');
            }

            Logger.info(`Created PayPal billing plan ${plan.id} ("${input.name}")`, loggerCtx);

            return {
                id: plan.id,
                name: plan.name ?? input.name,
                status: plan.status ?? 'ACTIVE',
                description: plan.description,
                createTime: plan.createTime,
                updateTime: plan.updateTime,
            };
        } catch (err) {
            this.handleError(err, 'createBillingPlan');
        }
    }

    async listBillingPlans(
        ctx: RequestContext,
        pageSize = 20,
        page = 1,
    ): Promise<BillingPlanResult[]> {
        try {
            const client = getPayPalClient();
            const controller = new SubscriptionsController(client);

            const response = await controller.listBillingPlans({
                prefer: 'return=representation',
                pageSize,
                page,
                totalRequired: false,
            });

            const plans = response.result?.plans ?? [];
            return plans.map(p => ({
                id: p.id ?? '',
                name: p.name ?? '',
                status: p.status ?? '',
                description: p.description,
                createTime: p.createTime,
                updateTime: p.updateTime,
            }));
        } catch (err) {
            this.handleError(err, 'listBillingPlans');
        }
    }

    async createSubscription(
        ctx: RequestContext,
        planId: string,
        customId?: string,
    ): Promise<CreateSubscriptionResult> {
        const returnUrl = process.env.PAYPAL_RETURN_URL ?? 'http://localhost:4200/checkout/payment';
        const cancelUrl = process.env.PAYPAL_CANCEL_URL ?? 'http://localhost:4200/checkout/payment';
        const vendureCustomerId = ctx.activeUserId?.toString() ?? '';

        try {
            const client = getPayPalClient();
            const controller = new SubscriptionsController(client);

            const response = await controller.createSubscription({
                prefer: 'return=representation',
                body: {
                    planId,
                    customId: customId ?? vendureCustomerId,
                    autoRenewal: false,
                    applicationContext: {
                        returnUrl,
                        cancelUrl,
                    },
                },
            });

            const subscription = response.result;
            if (!subscription?.id) {
                throw new Error('PayPal did not return a subscription ID.');
            }

            const approveLink = subscription.links?.find(l => l.rel === 'approve');
            if (!approveLink?.href) {
                throw new Error('PayPal did not return an approval URL for the subscription.');
            }

            const record = new PayPalSubscription({
                paypalSubscriptionId: subscription.id,
                paypalPlanId: planId,
                vendureCustomerId,
                status: 'APPROVAL_PENDING',
            });
            await this.connection.getRepository(ctx, PayPalSubscription).save(record);

            Logger.info(
                `Created PayPal subscription ${subscription.id} for plan ${planId}`,
                loggerCtx,
            );

            return { paypalSubscriptionId: subscription.id, approvalUrl: approveLink.href };
        } catch (err) {
            this.handleError(err, 'createSubscription');
        }
    }

    async syncSubscriptionStatus(
        ctx: RequestContext,
        paypalSubscriptionId: string,
    ): Promise<SubscriptionStatusResult> {
        try {
            const client = getPayPalClient();
            const controller = new SubscriptionsController(client);

            const response = await controller.getSubscription({ id: paypalSubscriptionId });
            // The SDK's Subscription type omits `status`; read it from the raw response body.
            let status = 'UNKNOWN';
            if (typeof response.body === 'string') {
                try {
                    const parsed = JSON.parse(response.body) as Record<string, unknown>;
                    if (typeof parsed.status === 'string') {
                        status = parsed.status;
                    }
                } catch {
                    // keep UNKNOWN if body is unparseable
                }
            }

            const repo = this.connection.getRepository(ctx, PayPalSubscription);
            const record = await repo.findOne({ where: { paypalSubscriptionId } });
            if (record) {
                record.status = status;
                await repo.save(record);
            }

            Logger.info(
                `Synced subscription ${paypalSubscriptionId}: status=${status}`,
                loggerCtx,
            );

            return { paypalSubscriptionId, status };
        } catch (err) {
            this.handleError(err, 'syncSubscriptionStatus');
        }
    }

    async cancelSubscription(
        ctx: RequestContext,
        paypalSubscriptionId: string,
        reason: string,
    ): Promise<boolean> {
        try {
            const client = getPayPalClient();
            const controller = new SubscriptionsController(client);

            await controller.cancelSubscription({ id: paypalSubscriptionId, body: { reason } });

            const repo = this.connection.getRepository(ctx, PayPalSubscription);
            const record = await repo.findOne({ where: { paypalSubscriptionId } });
            if (record) {
                record.status = 'CANCELLED';
                await repo.save(record);
            }

            Logger.info(`Cancelled PayPal subscription ${paypalSubscriptionId}`, loggerCtx);
            return true;
        } catch (err) {
            this.handleError(err, 'cancelSubscription');
        }
    }

    async listLocalSubscriptions(ctx: RequestContext): Promise<PayPalSubscription[]> {
        return this.connection
            .getRepository(ctx, PayPalSubscription)
            .find({ order: { createdAt: 'DESC' } });
    }

    private handleError(err: unknown, operation: string): never {
        if (err instanceof ApiError) {
            const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
            const message = `PayPal ${operation} failed (${err.statusCode}): ${body}`;
            Logger.error(message, loggerCtx);
            throw new Error(message);
        }
        const message = err instanceof Error ? err.message : String(err);
        Logger.error(`${operation} unexpected error: ${message}`, loggerCtx);
        throw new Error(message);
    }
}
