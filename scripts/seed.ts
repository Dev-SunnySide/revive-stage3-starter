import { db } from "../src/prisma/db";

async function main() {
  console.log("🌱 Seeding Revive database...");

  const user = await db.orm.public.User.create({
      email: "demo@revive.app",
      name: "Demo Business Owner",
      role: "OWNER",
  });

  const business = await db.orm.public.Business.create({
      name: "Demo Store",
      description: "A demo business for testing Revive",
      currency: "NGN",
  });

  await db.orm.public.BusinessMember.create({
      userId: user.id,
      businessId: business.id,
  });

  const customer1 = await db.orm.public.Customer.create({
      businessId: business.id,
      name: "David Okafor",
      email: "david@example.com",
      phone: "+2348012345678",
  });

  const customer2 = await db.orm.public.Customer.create({
      businessId: business.id,
      name: "Sarah Williams",
      email: "sarah@example.com",
      phone: "+2348098765432",
  });

  const customer3 = await db.orm.public.Customer.create({
      businessId: business.id,
      name: "Michael Adeyemi",
      email: "michael@example.com",
      phone: "+2348076543210",
  });

  const transaction1 = await db.orm.public.Transaction.create({
      businessId: business.id,
      customerId: customer1.id,
      reference: "RVV-DEMO-001",
      amount: 1500000,
      currency: "NGN",
      status: "FAILED",
  });

  const transaction2 = await db.orm.public.Transaction.create({
      businessId: business.id,
      customerId: customer2.id,
      reference: "RVV-DEMO-002",
      amount: 850000,
      currency: "NGN",
      status: "FAILED",
  });

  const transaction3 = await db.orm.public.Transaction.create({
      businessId: business.id,
      customerId: customer3.id,
      reference: "RVV-DEMO-003",
      amount: 450000,
      currency: "NGN",
      status: "SUCCESSFUL",
  });

  const transaction4 = await db.orm.public.Transaction.create({
      businessId: business.id,
      customerId: customer1.id,
      reference: "RVV-DEMO-004",
      amount: 2200000,
      currency: "NGN",
      status: "FAILED",
  });

  const transaction5 = await db.orm.public.Transaction.create({
      businessId: business.id,
      customerId: customer2.id,
      reference: "RVV-DEMO-005",
      amount: 650000,
      currency: "NGN",
      status: "SUCCESSFUL",
  });

  const recovery1 = await db.orm.public.RecoveryCase.create({
      businessId: business.id,
      customerId: customer1.id,
      transactionId: transaction1.id,
      status: "ACTION_REQUIRED",
      reason: "Payment failed during checkout",
      amountAtRisk: transaction1.amount,
      recoveredAmount: 0,
  });

  const recovery2 = await db.orm.public.RecoveryCase.create({
      businessId: business.id,
      customerId: customer2.id,
      transactionId: transaction2.id,
      status: "IN_PROGRESS",
      reason: "Insufficient funds",
      amountAtRisk: transaction2.amount,
      recoveredAmount: 0,
  });

  const recovery3 = await db.orm.public.RecoveryCase.create({
      businessId: business.id,
      customerId: customer1.id,
      transactionId: transaction4.id,
      status: "RECOVERED",
      reason: "Payment timeout",
      amountAtRisk: transaction4.amount,
      recoveredAmount: transaction4.amount,
  });

  await db.orm.public.AIRecommendation.create({
      recoveryCaseId: recovery1.id,
      recommendation:
        "Send a payment recovery message with a direct payment link.",
      confidence: 0.94,
      reasoning:
        "The customer has previously completed successful transactions and the failed payment appears recoverable.",
  });

  await db.orm.public.AIRecommendation.create({
      recoveryCaseId: recovery2.id,
      recommendation:
        "Send a reminder asking the customer to retry payment using another payment method.",
      confidence: 0.87,
      reasoning:
        "The transaction failure suggests the customer may need an alternative payment method.",
  });

  await db.orm.public.AIRecommendation.create({
      recoveryCaseId: recovery3.id,
      recommendation:
        "No further recovery action required because the payment has been recovered.",
      confidence: 0.99,
      reasoning: "Transaction was successfully recovered.",
  });

  await db.orm.public.RecoveryAction.create({
      recoveryCaseId: recovery1.id,
      type: "PAYMENT_LINK",
      status: "PENDING",
      message: "Your payment could not be completed. Retry securely here.",
  });

  await db.orm.public.RecoveryAction.create({
      recoveryCaseId: recovery2.id,
      type: "EMAIL",
      status: "PENDING",
      message: "Your payment is incomplete. Please retry your payment.",
  });

  await db.orm.public.RecoveryAction.create({
      recoveryCaseId: recovery3.id,
      type: "EMAIL",
      status: "COMPLETED",
      message: "Payment successfully recovered.",
  });

  await db.orm.public.ActivityLog.create({
      businessId: business.id,
      userId: user.id,
      action: "BUSINESS_CREATED",
      metadata: {
        source: "development_seed",
      },
  });

  console.log("✅ Revive database seeded successfully.");
  console.log(`Business: ${business.name}`);
  console.log(`User: ${user.email}`);
  console.log("Transactions: 5");
  console.log("Recovery cases: 3");
}

main().catch((error) => {
  console.error("❌ Seed failed:", error);
  process.exit(1);
});