import { Args, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { PayPalReportingService, TransactionSearchInput } from '../reporting/paypal-reporting.service';

@Resolver()
export class PayPalReportingResolver {
    constructor(private reportingService: PayPalReportingService) {}

    @Query()
    @Allow(Permission.Authenticated)
    async paypalTransactions(
        @Ctx() ctx: RequestContext,
        @Args()
        args: {
            startDate: string;
            endDate: string;
            transactionStatus?: string;
            transactionCurrency?: string;
            transactionId?: string;
            pageSize?: number;
            page?: number;
        },
    ) {
        const input: TransactionSearchInput = {
            startDate: args.startDate,
            endDate: args.endDate,
            transactionStatus: args.transactionStatus,
            transactionCurrency: args.transactionCurrency,
            transactionId: args.transactionId,
            pageSize: args.pageSize,
            page: args.page,
        };
        return this.reportingService.searchTransactions(ctx, input);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async paypalBalances(
        @Ctx() ctx: RequestContext,
        @Args() args: { currencyCode?: string; asOfTime?: string },
    ) {
        return this.reportingService.getBalances(ctx, args.currencyCode, args.asOfTime);
    }
}
