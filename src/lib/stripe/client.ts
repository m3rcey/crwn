import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build';

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2026-02-25.clover',
});

export const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy_key_for_build';
