export function stripeSubscriptionId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.id || '');
}

export function invoiceLicenseStatus(invoice, nowMs = Date.now()) {
  const status = String(invoice?.status || '').toLowerCase();
  if (status === 'paid') return 'active';
  if (status === 'uncollectible') return 'unpaid';
  if (status === 'void') return 'canceled';

  const dueAtMs = Number(invoice?.due_date || 0) * 1000;
  if (status === 'open' && dueAtMs > 0 && dueAtMs < nowMs) {
    return 'past_due';
  }

  return null;
}

export function invoiceDueAt(invoice) {
  const timestamp = Number(invoice?.due_date || 0);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}
