import gql from 'graphql-tag';

export const adminApiExtensions = gql`
    type PayPalHealthCheckResult {
        connected: Boolean!
        environment: String!
        message: String!
    }

    extend type Query {
        paypalHealthCheck: PayPalHealthCheckResult!
    }
`;
