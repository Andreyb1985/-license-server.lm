export function requireStripeDeleteConfirmation(license, confirmation) {
  if (!license?.stripe_subscription_id) return;
  if (confirmation !== true) {
    throw new Error('Additional confirmation is required to delete a Stripe license.');
  }
}
