import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    type PayPalHealthCheckResult {
        connected: Boolean!
        environment: String!
        message: String!
    }

    type PayPalBillingPlan {
        id: String!
        name: String!
        status: String!
        description: String
        createTime: String
        updateTime: String
    }

    type PayPalSubscriptionRecord {
        id: ID!
        paypalSubscriptionId: String!
        paypalPlanId: String!
        vendureCustomerId: String
        status: String!
        createdAt: DateTime!
        updatedAt: DateTime!
    }

    type PayPalSubscriptionStatus {
        paypalSubscriptionId: String!
        status: String!
    }

    input CreatePayPalBillingPlanInput {
        productId: String!
        name: String!
        description: String
        currencyCode: String!
        price: String!
        intervalUnit: String!
        intervalCount: Int
    }

    type PayPalTransactionInfo {
        transactionId: String
        transactionStatus: String
        transactionAmount: String
        currencyCode: String
        feeAmount: String
        initiationDate: String
        updatedDate: String
        payerEmail: String
        payerName: String
        invoiceId: String
        customField: String
    }

    type PayPalTransactionSearchResult {
        transactions: [PayPalTransactionInfo!]!
        totalItems: Int
        totalPages: Int
        page: Int
        startDate: String
        endDate: String
        lastRefreshedDatetime: String
    }

    type PayPalBalance {
        currency: String!
        totalBalance: String!
        availableBalance: String
        withheldBalance: String
        primary: Boolean
    }

    type PayPalBalancesResult {
        balances: [PayPalBalance!]!
        asOfTime: String
        lastRefreshTime: String
    }

    extend type Query {
        paypalHealthCheck: PayPalHealthCheckResult!
        paypalBillingPlans(pageSize: Int, page: Int): [PayPalBillingPlan!]!
        paypalSubscriptions: [PayPalSubscriptionRecord!]!
        """
        Search PayPal transactions within a date range (max 31 days).
        Dates must be ISO 8601 with seconds, e.g. "2024-01-01T00:00:00Z".
        Note: Transactions appear with up to 3 hours delay.
        """
        paypalTransactions(
            startDate: String!
            endDate: String!
            transactionStatus: String
            transactionCurrency: String
            transactionId: String
            pageSize: Int
            page: Int
        ): PayPalTransactionSearchResult!
        """
        Returns PayPal account balances. Note: balances have up to 3 hours delay.
        """
        paypalBalances(currencyCode: String, asOfTime: String): PayPalBalancesResult!
    }

    extend type Mutation {
        createPayPalBillingPlan(input: CreatePayPalBillingPlanInput!): PayPalBillingPlan!
        cancelPayPalSubscription(subscriptionId: String!, reason: String!): Boolean!
        syncPayPalSubscription(subscriptionId: String!): PayPalSubscriptionStatus!
    }
`;
