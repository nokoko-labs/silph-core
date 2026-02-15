export interface EmailProvider {
  send(
    to: string,
    subject: string,
    template: string,
    context: Record<string, unknown>,
  ): Promise<void>;
}
