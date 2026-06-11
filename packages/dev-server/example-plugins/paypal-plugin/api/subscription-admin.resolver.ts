import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import {
    CreateBillingPlanInput,
    PayPalSubscriptionService,
} from '../subscription/paypal-subscription.service';

@Resolver()
export class PayPalSubscriptionAdminResolver {
    constructor(private subscriptionService: PayPalSubscriptionService) {}

    @Query()
    @Allow(Permission.Authenticated)
    async paypalBillingPlans(
        @Ctx() ctx: RequestContext,
        @Args() args: { pageSize?: number; page?: number },
    ) {
        return this.subscriptionService.listBillingPlans(ctx, args.pageSize, args.page);
    }

    @Query()
    @Allow(Permission.Authenticated)
    async paypalSubscriptions(@Ctx() ctx: RequestContext) {
        return this.subscriptionService.listLocalSubscriptions(ctx);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async createPayPalBillingPlan(
        @Ctx() ctx: RequestContext,
        @Args() args: { input: CreateBillingPlanInput },
    ) {
        return this.subscriptionService.createBillingPlan(ctx, args.input);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async cancelPayPalSubscription(
        @Ctx() ctx: RequestContext,
        @Args() args: { subscriptionId: string; reason: string },
    ) {
        return this.subscriptionService.cancelSubscription(ctx, args.subscriptionId, args.reason);
    }

    @Mutation()
    @Allow(Permission.Authenticated)
    async syncPayPalSubscription(
        @Ctx() ctx: RequestContext,
        @Args() args: { subscriptionId: string },
    ) {
        return this.subscriptionService.syncSubscriptionStatus(ctx, args.subscriptionId);
    }
}
