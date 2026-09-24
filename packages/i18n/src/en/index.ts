/**
 * Catalog tiếng Anh.
 *
 * Khai báo kiểu là `typeof vi` chứ không để TypeScript tự suy — nhờ đó thiếu một khóa, thừa một
 * khóa, hay gõ sai tên khóa đều là lỗi biên dịch ngay ở `npm run lint`, không phải thứ chờ tới lúc
 * chạy mới lộ. Đây là hàng rào chính giữ hai ngôn ngữ luôn khớp nhau.
 *
 * Giữ nguyên tập placeholder `{...}` của bản tiếng Việt; đổi hay bỏ sót sẽ bị
 * `tests/contract/i18n-parity.test.ts` bắt.
 */

import type { vi } from '../vi/index.js';

/**
 * Cùng bộ khóa với `vi`, nhưng giá trị là `string` bất kỳ.
 *
 * Không dùng thẳng `typeof vi` được: `vi` khai báo `as const` nên mỗi giá trị là một kiểu literal,
 * và bản dịch tiếng Anh sẽ không gán được. Kiểu này nới phần giá trị mà vẫn giữ nguyên phần khóa —
 * tức vẫn bắt được thiếu khóa, thừa khóa và gõ sai tên khóa.
 */
type SameKeysAs<T> = { [Namespace in keyof T]: { [Name in keyof T[Namespace]]: string } };

export const en: SameKeysAs<typeof vi> = {
  common: {
    internalError: 'Something went wrong. Please try again later.',
    notFound: 'Resource not found',
    outOfScope: 'This resource is outside your brand slot scope',
    routeNotFound: 'The requested endpoint does not exist',
    unauthenticated: 'Sign in to perform this action',
    forbidden: 'You do not have permission to perform this action',
  },

  validation: {
    invalidPayload: 'The submitted data is invalid',
    required: 'This field is required',
    invalidType: 'Wrong data type',
    invalidFormat: 'Invalid format',
    invalidEmail: 'Invalid email address',
    invalidUuid: 'Invalid identifier',
    invalidUrl: 'Invalid URL',
    invalidEnum: 'Value is not one of the allowed options',
    tooSmall: 'Value is below the allowed minimum',
    tooBig: 'Value is above the allowed maximum',
    notANumber: 'Must be a number',
    priceFormat: 'Price must be a decimal string',
  },

  auth: {
    missingAccessToken: 'Missing access token',
    invalidAccessToken: 'Invalid access token',
    accessTokenExpired: 'Access token has expired',
    sessionExpired: 'Your session is no longer valid',
    mustChangePassword: 'Change your temporary password before using the system',
    missingPermission: 'Your account lacks permission for this action',
    reauthRequired: 'This action requires you to re-enter your password',
    invalidCredentials: 'Incorrect email or password',
    accountLocked: 'The account is temporarily locked',
    invalidRefreshToken: 'Refresh token is invalid or has expired',
    wrongPassword: 'Incorrect password',
    wrongCurrentPassword: 'Current password is incorrect',
    newPasswordMustDiffer: 'The new password must differ from the current one',
    newPasswordSameAsCurrent: 'Same as the current password',
  },

  mch: {
    locationNotFound: 'Location not found',
    locationCodeTaken: 'Location code "{code}" is already in use',
    locationInactive: 'The location does not exist or is no longer active',
    newLocationInactive: 'The new location does not exist or is no longer active',

    machineNotFound: 'Machine not found',
    serialTaken: 'Serial number "{serialNumber}" already exists',
    slotCountPositive: 'Slot count must be greater than 0',
    credentialNotIssued: 'No credentials have been issued for this machine',

    slotNotFound: 'Slot not found',
    dosagePositive: 'Spray dosage must be greater than 0',
    thresholdNonNegative: 'The low-stock threshold cannot be negative',
    slotNotDirectlyEnableable: 'The slot is {status} and cannot be enabled directly',
    machineDisabledCannotEnableSlot:
      'The machine hosting this slot is disabled, so the slot cannot be enabled',
    slotOccupied: 'The slot has an active rental and cannot be removed',
    slotChangedConcurrently:
      'The slot was changed by another operation, please reload and try again',
  },

  slotStatus: {
    AVAILABLE: 'available',
    UNAVAILABLE: 'unavailable',
    MAINTENANCE: 'under maintenance',
    DISABLED: 'disabled',
  },

  bnd: {
    codeTaken: 'Brand code already exists',
    brandAccountOnly: 'Only brand-scoped accounts have a brand of their own',
  },

  prd: {
    brandAccountOnly: 'Only brand-scoped accounts can create products',
    skuTaken: 'This SKU already exists within the brand',
  },

  usr: {
    brandAdminNeedsBrand: 'A Brand Admin must be attached to exactly one brand',
    platformRoleNoBrand: 'Platform roles must not be attached to a brand',
    brandNotFound: 'Brand does not exist',
    emailTaken: 'That email is already used by another account',
    cannotDisableSelf: 'You cannot disable your own account',
    cannotResetDisabledAccount: 'The account is disabled, its password cannot be reset',
  },

  ui: {
    localeName: 'English',
    language: 'Language',
    appName: 'ScentStation Admin',
    email: 'Email',
    password: 'Password',
    login: 'Sign in',
    loginTitle: 'Sign in to the admin console',
    logout: 'Sign out',
    dashboard: 'Overview',
    dashboardWelcome: 'Hello, {fullName}',
    dashboardHint: 'Pick a feature from the left menu to get started.',
    notFound: 'The page you requested was not found',
    backHome: 'Back to home',
    confirm: 'Confirm',
    cancel: 'Cancel',
    reauthTitle: 'Confirm your password',
    reauthDescription: 'Re-enter your password to continue with this action.',
    networkError: 'Cannot reach the server. Check your connection and try again.',
    loading: 'Loading...',
  },

  kiosk: {
    welcome: 'Welcome to ScentStation',
    tapToStart: 'Tap to choose a scent',
    outOfServiceTitle: 'This machine is temporarily out of service',
    outOfServiceHint: 'Please come back in a few minutes or ask the staff at this location.',
  },
};
