import type { Property } from '../types';

type SubscriptionAccessRecord = Pick<
  Property,
  'subscriptionExpiresAt' | 'subscriptionExpiryDate' | 'subscriptionTrialEndsAt' | 'subscriptionTrialEndsAtTimestamp' | 'subscriptionStatus'
>;

function toExpiryMillis(value: unknown): number | null {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const parsed = (value as { toDate: () => Date }).toDate().getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) {
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Keep public listings visible only while their current free-trial or paid
 * subscription entitlement is valid. Missing legacy dates remain visible
 * until the one-time admin migration has supplied an expiry.
 */
export function isSubscriptionAccessActive(
  property: SubscriptionAccessRecord,
  now = Date.now()
): boolean {
  if (property.subscriptionStatus === 'expired') return false;

  const expiryValues = [
    property.subscriptionExpiresAt,
    property.subscriptionExpiryDate,
    property.subscriptionTrialEndsAtTimestamp,
    property.subscriptionTrialEndsAt,
  ];
  for (const value of expiryValues) {
    if (value === '' || value === null || value === undefined) continue;
    const expiry = toExpiryMillis(value);
    if (expiry !== null) return expiry > now;
  }
  return true;
}
