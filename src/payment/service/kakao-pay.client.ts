import {BadRequestException, Injectable, InternalServerErrorException, Logger} from "@nestjs/common";
import * as process from "node:process";


const KAKAO_PAY_BASE_URL = 'https://open-api.kakaopay.com/online/v1/payment';

export interface KakaoPayReadyResult {
    tid: string;
    next_redirect_app_url: string;
    next_redirect_mobile_url: string;
    next_redirect_pc_url: string;
    created_at: string;
}

export interface KakaoPayApproveResult {
    aid: string;
    tid: string;
    cid: string;
    partner_order_id: string;
    partner_user_id: string;
    payment_method_type: 'CARD' | 'MONEY';
    item_name: string;
    quantity: number;
    amount: {
        total: number;
        tax_free: number;
        vat: number;
        point: number;
        discount: number;
        green_deposit: number;
    };
    created_at: string;
    approved_at: string;
}

interface KakaoPayErrorBody {
    error_code?: number;
    error_message?: string;
    extras?: {
        methond_result_code?: string;
        methond_result_message?: string;
    };
}

/**
 * 카카오페이 온라인 단건결제 API 호출만 담당
 * 도메인 로직은 PaymentService가 갖고, 여기서는 HTTP 통신과 에러 변환만 처리.
 * 테스트 결제는 cid "TC0ONETIME" + Secret key(dev) 조합으로 호출
 */
@Injectable()
export class KakaoPayClient {
    private readonly logger = new Logger(KakaoPayClient.name);

    private get secretKey(): string {
        const key = process.env.KAKAO_PAY_SECRET_KEY;

        if (!key) {
            throw new InternalServerErrorException(
                'KAKAO_PAY_SECRET_KEY 환경변수가 설정되지 않았습니다.',
            );
        }

        return key;
    }

    get cid(): string {
        return process.env.KAKAO_PAY_CID ?? 'TCOONETIME';
    }

    async ready(params: {
        partnerOrderId: string;
        partnerUserId: string;
        itemName: string;
        totalAmount: number;
        approvalUrl: string;
        cancelUrl: string;
        failUrl: string;
    }): Promise<KakaoPayReadyResult> {
        return this.request<KakaoPayReadyResult>('/ready', {
            cid: this.cid,
            partner_order_id: params.partnerOrderId,
            partner_user_id: params.partnerUserId,
            item_name: params.itemName,
            quantity: 1,
            total_amount: params.totalAmount,
            tax_free_amount: 0,
            approval_url: params.approvalUrl,
            cancel_url: params.cancelUrl,
            fail_url: params.failUrl,
        });
    }

    async approve(params: {
        tid: string;
        partnerOrderId: string;
        partnerUserId: string;
        pgToken: string;
    }): Promise<KakaoPayApproveResult> {
        // partner_order_id / partner_user_id는 ready 요청 때와 반드시 동일해야 한다.
        return this.request<KakaoPayApproveResult>('/approve', {
            cid: this.cid,
            tid: params.tid,
            partner_order_id: params.partnerOrderId,
            partner_user_id: params.partnerUserId,
            pg_token: params.pgToken,
        });
    }

    static parseKakaoDateTime(value: string | undefined): Date {
        if (!value) return new Date();

        const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
        const parsed = new Date(hasTimezone ? value : `${value}+09:00`);

        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    private async request<T>(path: string,  body: unknown): Promise<T> {
        const response = await fetch(`${KAKAO_PAY_BASE_URL}${path}`, {
            method: 'POST',
            headers: {
                Authorization: `SECRET_KEY ${this.secretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const text = await response.text();

        if (!response.ok) {
            this.logger.error(
                `카카오페이 ${path} 호출 실패 (${response.status}): ${text}`,
            );

            throw this.toHttpException(text);
        }

        return JSON.parse(text) as T;
    }

    /**
     * 결제 수단 승인 실패(카드사 한도초과, 거래 중복 등)는 사용자가 조치할 수 있는 상황이므로
     * 카카오가 내려준 안내 문구를 그대로 전달한다. 그 외는 일반 오류로 감싼다.
     */

    private toHttpException(rawBody: string): Error {
        let parsed: KakaoPayErrorBody;

        try {
            parsed = JSON.parse(rawBody) as KakaoPayErrorBody;
        } catch {
            return new InternalServerErrorException(
                '결제 처리 중 오류가 발생했습니다.',
            );
        }

        const userMessage = parsed.extras?.methond_result_message;

        if (userMessage) {
            return new BadRequestException(userMessage);
        }

        return new InternalServerErrorException(
            '결제 처리 중 오류가 발생했습니다.'
        );
    }
}