export class FeatureNotEnabledError extends Error {
  readonly name = 'FeatureNotEnabledError';
  readonly code = 'FEATURE_NOT_ENABLED';
  readonly status = 403;
  readonly orgId: string;
  readonly featureKey: string;
  readonly tier?: string;
  readonly subscriptionStatus?: string;

  constructor(params: { orgId: string; featureKey: string; message?: string; tier?: string; subscriptionStatus?: string }) {
    super(params.message ?? `Feature not enabled: ${params.featureKey}`);
    this.orgId = params.orgId;
    this.featureKey = params.featureKey;
    this.tier = params.tier;
    this.subscriptionStatus = params.subscriptionStatus;
  }
}

export class AuthRequiredError extends Error {
  readonly name = 'AuthRequiredError';
  readonly code = 'AUTH_REQUIRED';
  readonly status = 401;
}

export class InvalidTokenError extends Error {
  readonly name = 'InvalidTokenError';
  readonly code = 'INVALID_TOKEN';
  readonly status = 401;
}

export class SubscriptionNotActiveError extends Error {
  readonly name = 'SubscriptionNotActiveError';
  readonly code = 'SUBSCRIPTION_NOT_ACTIVE';
  readonly status = 403;
  readonly orgId: string;
  readonly tier?: string;
  readonly subscriptionStatus?: string;

  constructor(params: { orgId: string; message?: string; tier?: string; subscriptionStatus?: string }) {
    super(params.message ?? 'Subscription is not active');
    this.orgId = params.orgId;
    this.tier = params.tier;
    this.subscriptionStatus = params.subscriptionStatus;
  }
}
