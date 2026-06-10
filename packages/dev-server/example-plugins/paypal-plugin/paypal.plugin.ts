import { PluginCommonModule, VendurePlugin } from '@vendure/core';

import { adminApiExtensions } from './api/api-extensions';
import { PayPalHealthResolver } from './api/paypal-health.resolver';
import { PAYPAL_PLUGIN_OPTIONS } from './constants';
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
 *   PAYPAL_ENVIRONMENT  ('sandbox' | 'production', defaults to 'sandbox')
 */
@VendurePlugin({
    imports: [PluginCommonModule],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [PayPalHealthResolver],
    },
    providers: [
        {
            provide: PAYPAL_PLUGIN_OPTIONS,
            useFactory: () => PayPalPlugin.options,
        },
    ],
    configuration: config => {
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
