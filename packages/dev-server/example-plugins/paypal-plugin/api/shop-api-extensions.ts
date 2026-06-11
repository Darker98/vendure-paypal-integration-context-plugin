import gql from 'graphql-tag';

export const shopApiExtensions = gql`
    enum PayPalOrderIntent {
        CAPTURE
        AUTHORIZE
    }

    type CreatePayPalOrderResult {
        paypalOrderId: String!
        approvalUrl: String!
    }

    type CreatePayPalSubscriptionResult {
        paypalSubscriptionId: String!
        approvalUrl: String!
    }

    type PayPalSubscriptionStatus {
        paypalSubscriptionId: String!
        status: String!
    }

    extend type Mutation {
        """
        Creates a PayPal order for the active Vendure order and returns the approval URL.
        Pass intent: AUTHORIZE for authorize-then-capture flow; defaults to CAPTURE for immediate payment.
        """
        createPayPalOrder(intent: PayPalOrderIntent): CreatePayPalOrderResult!

        """
        Creates a PayPal subscription for a billing plan and returns the PayPal approval URL.
        The customer must visit the approval URL to activate the recurring billing agreement.
        """
        createPayPalSubscription(planId: String!, customId: String): CreatePayPalSubscriptionResult!

        """
        Fetches the current subscription status from PayPal and syncs it to the local record.
        Call this after the customer returns from the PayPal approval redirect.
        """
        syncPayPalSubscriptionStatus(paypalSubscriptionId: String!): PayPalSubscriptionStatus!
    }
`;
