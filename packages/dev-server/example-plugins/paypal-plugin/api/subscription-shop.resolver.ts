import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Allow, Ctx, Permission, RequestContext } from '@vendure/core';

import { PayPalSubscriptionService } from '../subscription/paypal-subscription.service';

@Resolver()
export class PayPalSubscriptionShopResolver {
    constructor(private subscriptionService: PayPalSubscriptionService) {}

    @Mutation()
    @Allow(Permission.Owner)
    async createPayPalSubscription(
        @Ctx() ctx: RequestContext,
        @Args() args: { planId: string; customId?: string },
    ) {
        return this.subscriptionService.createSubscription(ctx, args.planId, args.customId);
    }

    @Mutation()
    @Allow(Permission.Owner)
    async syncPayPalSubscriptionStatus(
        @Ctx() ctx: RequestContext,
        @Args() args: { paypalSubscriptionId: string },
    ) {
        return this.subscriptionService.syncSubscriptionStatus(ctx, args.paypalSubscriptionId);
    }
}
