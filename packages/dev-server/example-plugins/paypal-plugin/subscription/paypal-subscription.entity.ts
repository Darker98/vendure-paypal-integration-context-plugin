import { DeepPartial } from '@vendure/common/lib/shared-types';
import { VendureEntity } from '@vendure/core';
import { Column, Entity, Index } from 'typeorm';

@Entity()
export class PayPalSubscription extends VendureEntity {
    constructor(input?: DeepPartial<PayPalSubscription>) {
        super(input);
    }

    @Index({ unique: true })
    @Column()
    paypalSubscriptionId: string;

    @Column()
    paypalPlanId: string;

    @Column({ nullable: true })
    vendureCustomerId: string;

    @Column({ default: 'APPROVAL_PENDING' })
    status: string;
}
