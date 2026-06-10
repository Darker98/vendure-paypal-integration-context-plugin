import gql from 'graphql-tag';

export const shopApiExtensions = gql`
    type CreatePayPalOrderResult {
        paypalOrderId: String!
        approvalUrl: String!
    }

    extend type Mutation {
        createPayPalOrder: CreatePayPalOrderResult!
    }
`;
