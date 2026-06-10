import { Query, Resolver } from '@nestjs/graphql';
import { Allow, Permission } from '@vendure/core';
import { ApiError, SubscriptionsController } from '@paypal/paypal-server-sdk';

import { getPayPalClient } from '../paypal-client';

interface HealthCheckResult {
    connected: boolean;
    environment: string;
    message: string;
}

@Resolver()
export class PayPalHealthResolver {
    @Query()
    @Allow(Permission.Authenticated)
    async paypalHealthCheck(): Promise<HealthCheckResult> {
        const environment = process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox';

        try {
            const client = getPayPalClient();
            const controller = new SubscriptionsController(client);

            await controller.listBillingPlans({ pageSize: 1, page: 1 });

            return {
                connected: true,
                environment,
                message: 'Successfully authenticated with PayPal API.',
            };
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.statusCode === 401) {
                    return {
                        connected: false,
                        environment,
                        message: `Authentication failed (401): Invalid client credentials.`,
                    };
                }
                return {
                    connected: false,
                    environment,
                    message: `PayPal API error (${err.statusCode}): ${String(err.body ?? err.message)}`,
                };
            }

            const message = err instanceof Error ? err.message : String(err);
            return {
                connected: false,
                environment,
                message: `PayPal client error: ${message}`,
            };
        }
    }
}
