import { Client, Environment } from '@paypal/paypal-server-sdk';

let clientInstance: Client | undefined;

/**
 * Returns a singleton PayPal SDK Client.
 * Reads PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_ENVIRONMENT from env.
 * Throws clearly if required credentials are absent.
 */
export function getPayPalClient(): Client {
    if (clientInstance) {
        return clientInstance;
    }

    const oAuthClientId = process.env.PAYPAL_CLIENT_ID;
    const oAuthClientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!oAuthClientId || !oAuthClientSecret) {
        throw new Error(
            'PayPal plugin: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables must be set.',
        );
    }

    const environment =
        process.env.PAYPAL_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox;

    clientInstance = new Client({
        clientCredentialsAuthCredentials: {
            oAuthClientId,
            oAuthClientSecret,
        },
        environment,
    });

    return clientInstance;
}

/** Resets the singleton — useful in tests. */
export function resetPayPalClient(): void {
    clientInstance = undefined;
}
