import { Module } from '@nestjs/common';
import { TenantsModule } from '@/modules/tenants/tenants.module';
import { PaymentFactory } from './payment.factory';

@Module({
  imports: [TenantsModule],
  providers: [PaymentFactory],
  exports: [PaymentFactory],
})
export const PaymentsModule = {};
