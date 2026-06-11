import { Injectable } from '@nestjs/common';
import {
    ApiError,
    TransactionSearchController,
} from '@paypal/paypal-server-sdk';
import { Logger, RequestContext } from '@vendure/core';

import { getPayPalClient } from '../paypal-client';

const loggerCtx = 'PayPalReportingService';
const MAX_DATE_RANGE_DAYS = 31;
const MS_PER_DAY = 86_400_000;

export interface TransactionSearchInput {
    startDate: string;
    endDate: string;
    transactionStatus?: string;
    transactionCurrency?: string;
    transactionId?: string;
    pageSize?: number;
    page?: number;
}

export interface PayPalTransactionInfo {
    transactionId?: string | null;
    transactionStatus?: string | null;
    transactionAmount?: string | null;
    currencyCode?: string | null;
    feeAmount?: string | null;
    initiationDate?: string | null;
    updatedDate?: string | null;
    payerEmail?: string | null;
    payerName?: string | null;
    invoiceId?: string | null;
    customField?: string | null;
}

export interface TransactionSearchResult {
    transactions: PayPalTransactionInfo[];
    totalItems?: number | null;
    totalPages?: number | null;
    page?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    lastRefreshedDatetime?: string | null;
}

export interface PayPalBalance {
    currency: string;
    totalBalance: string;
    availableBalance?: string | null;
    withheldBalance?: string | null;
    primary?: boolean | null;
}

export interface BalancesResult {
    balances: PayPalBalance[];
    asOfTime?: string | null;
    lastRefreshTime?: string | null;
}

@Injectable()
export class PayPalReportingService {
    async searchTransactions(
        ctx: RequestContext,
        input: TransactionSearchInput,
    ): Promise<TransactionSearchResult> {
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            throw new Error('startDate and endDate must be valid ISO 8601 date-time strings.');
        }
        if (end <= start) {
            throw new Error('endDate must be after startDate.');
        }
        const rangeDays = (end.getTime() - start.getTime()) / MS_PER_DAY;
        if (rangeDays > MAX_DATE_RANGE_DAYS) {
            throw new Error(
                `Date range exceeds the PayPal maximum of ${MAX_DATE_RANGE_DAYS} days. ` +
                    `Requested range: ${Math.ceil(rangeDays)} days.`,
            );
        }

        try {
            const client = getPayPalClient();
            const controller = new TransactionSearchController(client);

            const response = await controller.searchTransactions({
                startDate: input.startDate,
                endDate: input.endDate,
                transactionStatus: input.transactionStatus,
                transactionCurrency: input.transactionCurrency,
                transactionId: input.transactionId,
                fields: 'transaction_info,payer_info',
                balanceAffectingRecordsOnly: 'Y',
                pageSize: input.pageSize ?? 100,
                page: input.page ?? 1,
            });

            const result = response.result;
            const transactions: PayPalTransactionInfo[] = (result?.transactionDetails ?? []).map(
                detail => {
                    const info = detail.transactionInfo;
                    const payer = detail.payerInfo;
                    return {
                        transactionId: (info as any)?.transactionId ?? null,
                        transactionStatus: (info as any)?.transactionStatus ?? null,
                        transactionAmount: (info as any)?.transactionAmount?.value ?? null,
                        currencyCode: (info as any)?.transactionAmount?.currencyCode ?? null,
                        feeAmount: (info as any)?.feeAmount?.value ?? null,
                        initiationDate: (info as any)?.transactionInitiationDate ?? null,
                        updatedDate: (info as any)?.transactionUpdatedDate ?? null,
                        payerEmail: payer?.emailAddress ?? null,
                        payerName: (payer as any)?.payerName?.alternateFullName ?? null,
                        invoiceId: info?.invoiceId ?? null,
                        customField: info?.customField ?? null,
                    };
                },
            );

            Logger.info(
                `Transaction search returned ${transactions.length} results (total: ${result?.totalItems ?? 0})`,
                loggerCtx,
            );

            return {
                transactions,
                totalItems: result?.totalItems ?? null,
                totalPages: result?.totalPages ?? null,
                page: result?.page ?? null,
                startDate: result?.startDate ?? null,
                endDate: result?.endDate ?? null,
                lastRefreshedDatetime: result?.lastRefreshedDatetime ?? null,
            };
        } catch (err) {
            this.handleError(err, 'searchTransactions');
        }
    }

    async getBalances(
        ctx: RequestContext,
        currencyCode?: string,
        asOfTime?: string,
    ): Promise<BalancesResult> {
        try {
            const client = getPayPalClient();
            const controller = new TransactionSearchController(client);

            const response = await controller.searchBalances({
                currencyCode,
                asOfTime,
            });

            const result = response.result;
            const balances: PayPalBalance[] = (result?.balances ?? []).map(b => ({
                currency: b.currency,
                totalBalance: b.totalBalance.value,
                availableBalance: b.availableBalance?.value ?? null,
                withheldBalance: b.withheldBalance?.value ?? null,
                primary: b.primary ?? null,
            }));

            Logger.info(`Balance lookup returned ${balances.length} currency balance(s)`, loggerCtx);

            return {
                balances,
                asOfTime: result?.asOfTime ?? null,
                lastRefreshTime: result?.lastRefreshTime ?? null,
            };
        } catch (err) {
            this.handleError(err, 'getBalances');
        }
    }

    private handleError(err: unknown, operation: string): never {
        if (err instanceof ApiError) {
            const body = typeof err.body === 'string' ? err.body : JSON.stringify(err.body);
            const message = `PayPal ${operation} failed (${err.statusCode}): ${body}`;
            Logger.error(message, loggerCtx);
            throw new Error(message);
        }
        const message = err instanceof Error ? err.message : String(err);
        Logger.error(`${operation} unexpected error: ${message}`, loggerCtx);
        throw new Error(message);
    }
}
