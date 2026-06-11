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

    extend type Query {
        paypalHealthCheck: PayPalHealthCheckResult!
        paypalBillingPlans(pageSize: Int, page: Int): [PayPalBillingPlan!]!
        paypalSubscriptions: [PayPalSubscriptionRecord!]!
    }

    extend type Mutation {
        createPayPalBillingPlan(input: CreatePayPalBillingPlanInput!): PayPalBillingPlan!
        cancelPayPalSubscription(subscriptionId: String!, reason: String!): Boolean!
        syncPayPalSubscription(subscriptionId: String!): PayPalSubscriptionStatus!
    }
`;
