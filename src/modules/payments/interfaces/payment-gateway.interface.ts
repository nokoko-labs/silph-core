export interface PaymentGateway {
  createPreference(amount: number, externalId: string): Promise<unknown>;
  processWebhook(payload: unknown): Promise<unknown>;
}
