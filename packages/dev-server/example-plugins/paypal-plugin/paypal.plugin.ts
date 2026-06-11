import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { adminApiExtensions } from './api/api-extensions';
import { PayPalHealthResolver } from './api/paypal-health.resolver';
import { shopApiExtensions } from './api/shop-api-extensions';
import { PayPalShopResolver } from './api/paypal-shop.resolver';
import { PayPalSubscriptionAdminResolver } from './api/subscription-admin.resolver';
import { PayPalSubscriptionShopResolver } from './api/subscription-shop.resolver';
import { paypalPaymentHandler } from './config/paypal-payment-handler';
import { PAYPAL_PLUGIN_OPTIONS } from './constants';
import { PayPalSubscription } from './subscription/paypal-subscription.entity';
import { PayPalSubscriptionService } from './subscription/paypal-subscription.service';
import { PaypalPluginOptions } from './types';

/**
 * PayPalPlugin — integrates PayPal as a Vendure payment provider.
 *
 * Add to your VendureConfig:
 * ```ts
 * plugins: [
 *   PayPalPlugin.init({ environment: 'sandbox' }),
 * ]
 * ```
 *
 * Required environment variables:
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 *   PAYPAL_ENVIRONMENT       ('sandbox' | 'production', defaults to 'sandbox')
 *   PAYPAL_RETURN_URL        storefront URL PayPal redirects to after buyer approval
 *   PAYPAL_CANCEL_URL        storefront URL PayPal redirects to on cancellation
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    entities: [PayPalSubscription],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [PayPalHealthResolver, PayPalSubscriptionAdminResolver],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [PayPalShopResolver, PayPalSubscriptionShopResolver],
    },
    providers: [
        {
            provide: PAYPAL_PLUGIN_OPTIONS,
            useFactory: () => PayPalPlugin.options,
        },
        PayPalSubscriptionService,
    ],
    configuration: config => {
        config.paymentOptions.paymentMethodHandlers.push(paypalPaymentHandler);
        return config;
    },
})
export class PayPalPlugin {
    static options: PaypalPluginOptions = {};

    static init(options: PaypalPluginOptions = {}): typeof PayPalPlugin {
        PayPalPlugin.options = options;
        return PayPalPlugin;
    }
}
