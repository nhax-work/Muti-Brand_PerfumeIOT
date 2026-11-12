/**
 * Bottle returns upon non-renewal (FR-EXP-26..28, ADR-0014).
 */
export const exp = {
  returnNotFound: 'Bottle return ticket not found',
  forbiddenBrandScope: 'No permission to access bottle returns of another brand',
  rentalNotFound: 'Slot rental invoice not found',
  rentalRenewalNotDeclined: 'Bottle return can only be created for non-renewed slot rentals',
  bottlesRequired: 'At least one bottle is required to create a return ticket',
  bottleNotFound: 'Perfume bottle not found in system',
  bottleNotOwnedByBrand: 'Perfume bottle is not owned by the renting brand',
  returnAlreadyClosed: 'Bottle return ticket is already handed over or forfeited',
  trackingNumberRequiredForShipping: 'Tracking number is required when shipping to brand',
} as const;

export const bottleReturnMethod = {
  PICKUP_AT_STATION: 'Pickup at station / warehouse',
  SHIP_TO_BRAND: 'Ship to brand',
} as const;
