/**
 * Monime.io payment service
 * Handles SaaS subscription billing and POS payment initiation
 * via Sierra Leone mobile money networks (Orange Money, Afrimoney, QMoney).
 *
 * Monime API docs: https://docs.monime.io
 * Base URL: https://api.monime.io/v1
 */
import { createHmac } from 'node:crypto';

export type MonimeNetwork = 'orange_money' | 'afrimoney' | 'qmoney';

export interface CollectPaymentInput {
  amount: number;          // in SLE (leones), e.g. 500000
  currency?: string;       // default SLE
  phoneNumber: string;     // recipient's phone e.g. +23276000000
  network: MonimeNetwork;
  description: string;
  reference: string;       // your internal reference (idempotency key)
  callbackUrl?: string;    // webhook URL Monime will POST to on completion
  metadata?: Record<string, string>;
}

export interface CollectPaymentResponse {
  id: string;
  status: 'pending' | 'processing' | 'successful' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  phoneNumber: string;
  network: MonimeNetwork;
  reference: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, string>;
}

export interface MonimeWebhookPayload {
  event: 'payment.successful' | 'payment.failed' | 'payment.cancelled';
  data: CollectPaymentResponse;
  timestamp: string;
  signature: string;
}

export class MonimeService {
  private readonly baseUrl = 'https://api.monime.io/v1';
  private readonly apiKey: string;
  private readonly webhookSecret: string;

  constructor() {
    this.apiKey = process.env['MONIME_API_KEY'] ?? '';
    this.webhookSecret = process.env['MONIME_WEBHOOK_SECRET'] ?? '';
    if (!this.apiKey) {
      console.warn('[Monime] MONIME_API_KEY not set — payment features disabled');
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = (json as Record<string, unknown>)['message'] ?? `Monime API error ${res.status}`;
      throw new Error(String(msg));
    }

    return json as T;
  }

  /**
   * Initiate a mobile money payment request.
   * Monime sends a USSD prompt to the customer's phone.
   */
  async collectPayment(input: CollectPaymentInput): Promise<CollectPaymentResponse> {
    return this.request<CollectPaymentResponse>('POST', '/collections', {
      amount: input.amount,
      currency: input.currency ?? 'SLE',
      phone_number: input.phoneNumber,
      network: input.network,
      description: input.description,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    });
  }

  /**
   * Poll the status of a payment collection.
   */
  async getPaymentStatus(paymentId: string): Promise<CollectPaymentResponse> {
    return this.request<CollectPaymentResponse>('GET', `/collections/${paymentId}`);
  }

  /**
   * Verify a webhook signature from Monime.
   * Monime sends X-Monime-Signature: sha256=<hmac>
   */
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const expected = `sha256=${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
    return expected === signature;
  }
}

export const monimeService = new MonimeService();
