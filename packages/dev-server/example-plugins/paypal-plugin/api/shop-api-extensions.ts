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

    extend type Mutation {
        """
        Creates a PayPal order for the active Vendure order and returns the approval URL.
        Pass intent: AUTHORIZE for authorize-then-capture flow; defaults to CAPTURE for immediate payment.
        """
        createPayPalOrder(intent: PayPalOrderIntent): CreatePayPalOrderResult!
    }
`;
