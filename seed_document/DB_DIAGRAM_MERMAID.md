Project ScentStation {
  database_type: 'PostgreSQL'
  Note: 'Logical database model for ScentStation. Source: Phieu_FA26SE114.docx, BRD, Use Case Specification and Database Design. Updated 2026-09-29 for ADR-0006 (prepaid slot rental packages, invoices, goods storage insurance) — mirrors spec/contracts/schema.sql after migrations 1790665900000 and 1790665960000. Updated 2026-09-30 for ADR-0008 (one payment for several slots via rental_checkouts) — migration 1790757100000.'
}

Enum brand_status {
  ACTIVE
  SUSPENDED
  DISABLED
}
Enum user_status {
  INVITED
  ACTIVE
  LOCKED
  DISABLED
}
Enum machine_connection_status {
  ONLINE
  UNSTABLE
  OFFLINE
}
Enum machine_operating_mode {
  NORMAL
  MAINTENANCE
  DISABLED
}
Enum slot_status {
  AVAILABLE
  UNAVAILABLE
  MAINTENANCE
  DISABLED
}
Enum bottle_status {
  IN_STOCK
  INSTALLED
  LOW
  EMPTY
  DAMAGED
  EXPIRED
  LIQUIDATED
}
Enum refill_status {
  STARTED
  COMPLETED
  CANCELLED
}
Enum order_status {
  CREATED
  PENDING_PAYMENT
  PAID
  DISPENSE_REQUESTED
  DISPENSED
  FAILED
  EXPIRED
  REFUND_PENDING
  REFUNDED
  FORFEITED [note: 'ADR-0007: paid but the customer did not press the lit button within DISPENSE_PRESS_WINDOW_SEC; no refund (FR-ORD-27)']
}
Enum payment_status {
  PENDING
  SUCCEEDED
  FAILED
  CANCELLED
  EXPIRED
  REFUND_PENDING
  PARTIALLY_REFUNDED
  REFUNDED
}
Enum command_status {
  CREATED
  SENT
  ACKNOWLEDGED
  SUCCEEDED
  FAILED
  REJECTED
  EXPIRED
  UNKNOWN
}
Enum dispense_type {
  CUSTOMER
  DIAGNOSTIC
}
Enum alert_severity {
  INFO
  WARNING
  HIGH
  CRITICAL
}
Enum alert_status {
  OPEN
  ACKNOWLEDGED
  IN_PROGRESS
  RESOLVED
  CLOSED
}
Enum ticket_status {
  OPEN
  ASSIGNED
  IN_PROGRESS
  WAITING_PART
  POST_TEST
  RESOLVED
  CLOSED
  REOPENED
}
Enum ticket_priority {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
Enum credential_status {
  ACTIVE
  REVOKED
  EXPIRED
}
Enum notification_status {
  PENDING
  SENT
  FAILED
  READ
}
Enum slot_rental_status {
  DRAFT
  ACTIVE
  EXPIRING
  GRACE
  RENEWED
  LIQUIDATED
  CLOSED
  TERMINATED
  CANCELLED [note: 'ADR-0006: DRAFT invoice whose checkout hold expired before payment (FR-SLT-39)']
}
Enum revenue_owner_type {
  BRAND
  PLATFORM
}
Enum kiosk_interaction_type {
  PRODUCT_IMPRESSION
  PRODUCT_SELECTED
}
Enum refill_request_status {
  SUBMITTED
  ACCEPTED
  REJECTED
  SCHEDULED
  COMPLETED
  CANCELLED
}
Enum refill_request_reason {
  LOW_STOCK
  EXPIRING
  PRODUCT_CHANGE
}
// DEPRECATED (ADR-0006): self-service request/approval flow was removed
Enum slot_rental_request_status {
  REQUESTED
  APPROVED
  REJECTED
  CONVERTED
  CANCELLED
}
Enum shipment_declaration_status {
  DECLARED
  RECEIVED
  DISCREPANCY
  CANCELLED
}
Enum storage_compensation_status {
  PENDING
  PAID
}

Table brands {
  id uuid [pk]
  code varchar(50) [not null, unique]
  name varchar(200) [not null]
  logo_url text
  description text
  contact_info jsonb
  kiosk_content jsonb
  status brand_status [not null, default: 'ACTIVE']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}

Table users {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Null only for platform-level users']
  email citext [not null, unique]
  password_hash text [not null]
  full_name varchar(200) [not null]
  status user_status [not null, default: 'INVITED']
  permission_version int [not null, default: 1]
  last_login_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes { (brand_id, status) }
}

Table roles {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Null for platform/system roles']
  code varchar(100) [not null]
  name varchar(150) [not null]
  description text
  is_system boolean [not null, default: false]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes { (brand_id, code) [unique] }
}

Table permissions {
  id uuid [pk]
  code varchar(150) [not null, unique]
  description text
  created_at timestamptz [not null, default: `now()`]
}

Table user_roles {
  id uuid [pk]
  user_id uuid [not null, ref: > users.id]
  role_id uuid [not null, ref: > roles.id]
  scope_type varchar(30) [not null, default: 'BRAND', note: 'PLATFORM, BRAND, LOCATION or MACHINE']
  scope_id uuid [note: 'Location or machine id when scope requires it']
  assigned_by uuid [ref: > users.id]
  assigned_at timestamptz [not null, default: `now()`]

  indexes {
    (user_id, role_id, scope_type, scope_id) [unique, note: 'For null scope_id, enforce logical uniqueness with a PostgreSQL expression/partial index']
  }
}

Table role_permissions {
  role_id uuid [not null, ref: > roles.id]
  permission_id uuid [not null, ref: > permissions.id]
  created_at timestamptz [not null, default: `now()`]

  indexes { (role_id, permission_id) [pk] }
}

Table refresh_sessions {
  id uuid [pk]
  user_id uuid [not null, ref: > users.id]
  token_hash text [not null, unique]
  ip_address inet
  user_agent text
  expires_at timestamptz [not null]
  revoked_at timestamptz
  last_used_at timestamptz
  created_at timestamptz [not null, default: `now()`]

  indexes { (user_id, expires_at) }
}

Table locations {
  id uuid [pk]
  code varchar(50) [not null, unique]
  name varchar(200) [not null]
  address text
  timezone varchar(50) [not null, default: 'Asia/Ho_Chi_Minh']
  status varchar(30) [not null, default: 'ACTIVE']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

}

Table fragrance_products {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  sku varchar(100) [not null]
  name varchar(200) [not null]
  description text
  fragrance_notes jsonb
  image_url text
  product_url text
  default_price numeric(19,4) [not null, note: 'Suggested price per spray, used as a hint when Brand Admin prices a slot (FR-PRD-04)']
  currency char(3) [not null, default: 'VND']
  full_bottle_retail_price numeric(19,4) [note: 'Retail price of one full bottle, used to compute grace-period storage fee (FR-PRD-05, FR-EXP-10)']
  full_bottle_volume_ml numeric(14,4) [note: 'Full bottle volume, used to compute grace-period storage fee (FR-PRD-05, FR-EXP-10)']
  status varchar(30) [not null, default: 'ACTIVE']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
  deleted_at timestamptz

  indexes { (brand_id, sku) [unique] }
  checks {
    `default_price >= 0` [name: 'chk_product_price_nonnegative']
    `full_bottle_retail_price IS NULL OR full_bottle_retail_price >= 0` [name: 'chk_product_retail_price_nonnegative']
    `full_bottle_volume_ml IS NULL OR full_bottle_volume_ml >= 0` [name: 'chk_product_volume_nonnegative']
  }
}

Table machines {
  id uuid [pk]
  location_id uuid [not null, ref: > locations.id]
  serial_number varchar(100) [not null, unique]
  display_name varchar(200) [not null]
  status machine_connection_status [not null, default: 'OFFLINE', note: 'FR-MCH-08: connectivity, derived from heartbeat (FR-IOT-01 to 03)']
  operating_mode machine_operating_mode [not null, default: 'NORMAL', note: 'FR-MCH-09: operator-controlled mode (FR-MNT-05/12)']
  last_seen_at timestamptz
  firmware_version varchar(100)
  configuration_version int [not null, default: 1]
  simulator_enabled boolean [not null, default: false]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (location_id, status)
    last_seen_at
  }
}

Table machine_slots {
  id uuid [pk]
  machine_id uuid [not null, ref: > machines.id]
  slot_number int [not null]
  active_bottle_id uuid [ref: - bottles.id, note: 'Must be unique when not null; implement as PostgreSQL partial unique index']
  calibrated_dosage_ml numeric(10,4)
  low_stock_threshold_ml numeric(14,4)
  estimated_remaining_ml numeric(14,4) [not null, default: 0]
  estimated_remaining_sprays int [not null, default: 0]
  status slot_status [not null, default: 'DISABLED']
  version int [not null, default: 1]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
  monthly_rent_price numeric(19,4) [note: 'ADR-0006, FR-SLT-32: listed monthly rent. Null = slot not open for rent and hidden from the available-slot list (FR-SLT-19)']

  indexes {
    (machine_id, slot_number) [unique]
    (machine_id, status)
  }
  checks {
    `slot_number > 0` [name: 'chk_slot_number_positive']
    `estimated_remaining_ml >= 0` [name: 'chk_slot_remaining_ml_nonnegative']
    `estimated_remaining_sprays >= 0` [name: 'chk_slot_remaining_sprays_nonnegative']
    `monthly_rent_price IS NULL OR monthly_rent_price >= 0` [name: 'chk_slot_rent_price_nonnegative']
  }
}

Table rental_packages {
  id uuid [pk]
  name varchar(100) [not null, unique]
  duration_months smallint [not null, note: 'e.g. 3, 6, 12 — catalog data, not a spec/constraints.md threshold']
  discount_percent numeric(5,2) [not null, default: 0, note: 'Longer packages get a bigger discount; applies to rent only, not to storage']
  is_active boolean [not null, default: true, note: 'false = no longer sold; invoices already bought keep their snapshot (FR-SLT-33)']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  checks {
    `duration_months > 0` [name: 'chk_package_duration_positive']
    `discount_percent >= 0 AND discount_percent <= 100` [name: 'chk_package_discount_percent']
  }
  Note: 'ADR-0006, FR-SLT-30: rental packages listed by Platform Super Admin.'
}

Table storage_plans {
  id uuid [pk]
  name varchar(100) [not null, unique]
  description text
  monthly_price numeric(19,4) [not null]
  currency char(3) [not null, default: 'VND']
  coverage_percent numeric(5,2) [not null, note: 'Compensation rate applied to fragrance_products.full_bottle_retail_price']
  coverage_cap numeric(19,4) [not null, note: 'Maximum cumulative compensation per invoice (slot_rentals row)']
  is_active boolean [not null, default: true, note: 'Domain service must keep at least one active plan — a storage plan is mandatory (FR-SLT-31 AC3)']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  checks {
    `monthly_price >= 0` [name: 'chk_storage_plan_price_nonnegative']
    `coverage_percent >= 0 AND coverage_percent <= 100` [name: 'chk_storage_plan_coverage_percent']
    `coverage_cap >= 0` [name: 'chk_storage_plan_cap_nonnegative']
  }
  Note: 'ADR-0006, FR-SLT-31: goods storage plans ("bảo hiểm hàng hóa"). Every invoice must pick exactly one.'
}

Table rental_checkouts {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  currency char(3) [not null, default: 'VND']
  total_amount numeric(19,4) [not null, note: 'Sum of total_amount of every invoice in the checkout (FR-SLT-36); write-once']
  hold_expires_at timestamptz [not null, note: 'created_at + RENTAL_CHECKOUT_HOLD_MIN — holds EVERY slot of the checkout (FR-SLT-35, FR-SLT-39)']
  paid_at timestamptz [note: 'Set with paid_at of every invoice in the same transaction (FR-SLT-38)']
  cancelled_at timestamptz [note: 'Hold expired unpaid: every invoice → CANCELLED in the same transaction (FR-SLT-39)']
  created_by uuid [not null, ref: > users.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (id, brand_id) [unique, name: 'uq_checkout_id_brand']
    (brand_id, created_at)
    hold_expires_at [name: 'idx_checkouts_unpaid_hold', note: 'Partial: WHERE paid_at IS NULL AND cancelled_at IS NULL (FR-SLT-39 job)']
  }
  checks {
    `total_amount >= 0` [name: 'chk_checkout_amount_nonnegative']
    `paid_at IS NULL OR cancelled_at IS NULL` [name: 'chk_checkout_paid_or_cancelled']
  }
  Note: 'ADR-0008: one Brand Admin checkout of one or more slots, paid once. Each slot is still its own invoice (slot_rentals) with its own invoice_number, price snapshot and lifecycle; the checkout only groups the hold, the total and the payment. Status is derived: both paid_at and cancelled_at null = awaiting payment. Cross-table invariants in implementation note 23.'
}

Table slot_rentals {
  id uuid [pk]
  slot_id uuid [not null, ref: > machine_slots.id]
  brand_id uuid [not null, ref: > brands.id]
  fragrance_product_id uuid [ref: > fragrance_products.id, note: 'Nullable: a paid invoice has no product until Brand Admin configures the slot (FR-SLT-27). Application layer must enforce NOT NULL before the rental can serve orders (FR-SLT-29)']
  product_assigned_at timestamptz [note: 'Set/updated when Brand Admin assigns or changes the product on this rental (FR-SLT-27, FR-SLT-28)']
  request_id uuid [ref: > slot_rental_requests.id, note: 'DEPRECATED (ADR-0006): request/approval flow removed; always null for new invoices']
  previous_rental_id uuid [ref: > slot_rentals.id, note: 'Previous invoice when this one is a renewal (FR-SLT-12)']
  status slot_rental_status [not null, default: 'DRAFT', note: 'DRAFT + paid_at null = awaiting payment (holds the slot); DRAFT + paid_at set = awaiting stock']
  starts_at timestamptz [not null, note: 'DRAFT: provisional value so excl_slot_rental_overlap holds the slot. Overwritten on activation: first bottle install (FR-SLT-24), RENTAL_MAX_STOCKING_DAYS auto-start (FR-SLT-42), or renewal hand-over (FR-SLT-12)']
  ends_at timestamptz [not null, note: 'DRAFT: provisional. On activation = starts_at + duration_months']
  grace_ends_at timestamptz
  price_per_spray numeric(19,4) [note: 'Nullable since ADR-0006: Brand Admin sets it when configuring the slot after payment (FR-SLT-08); orders blocked while null (FR-SLT-29)']
  currency char(3) [not null, default: 'VND']
  fixed_fee numeric(19,4) [not null, default: 0, note: 'DEPRECATED (ADR-0006): no periodic fixed fee; kept at 0']
  revenue_share_percent numeric(5,2) [not null, default: 0, note: 'DEPRECATED (ADR-0006): no revenue share; kept at 0']
  terminated_reason text
  created_by uuid [not null, ref: > users.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
  invoice_number varchar(30) [unique, note: 'Issued exactly when payment succeeds (FR-SLT-38)']
  rental_package_id uuid [ref: > rental_packages.id, note: 'Null only for invoices created before ADR-0006']
  storage_plan_id uuid [ref: > storage_plans.id]
  duration_months smallint [note: 'Snapshot columns from here to total_amount are write-once (FR-SLT-33)']
  monthly_rent_price numeric(19,4)
  discount_percent numeric(5,2)
  storage_monthly_price numeric(19,4)
  storage_coverage_percent numeric(5,2)
  storage_coverage_cap numeric(19,4)
  rent_amount numeric(19,4) [note: 'monthly_rent_price × duration_months × (1 − discount_percent)']
  storage_amount numeric(19,4) [note: 'storage_monthly_price × duration_months']
  grace_fee_amount numeric(19,4) [not null, default: 0, note: 'Grace fee carried from the previous invoice on renewal (FR-EXP-12)']
  total_amount numeric(19,4)
  paid_at timestamptz [note: 'Same moment as rental_checkouts.paid_at of its checkout']
  cancelled_at timestamptz
  checkout_id uuid [ref: > rental_checkouts.id, note: 'ADR-0008: checkout that created this invoice. Required when rental_package_id is set; null for pre-ADR-0006 invoices. Same-brand composite FK fk_rental_checkout_same_brand. The hold (hold_expires_at) lives on the checkout, not here']

  indexes {
    (brand_id, status, starts_at)
    (slot_id, starts_at, ends_at)
    (fragrance_product_id, status)
    paid_at [name: 'idx_rentals_draft_awaiting_stock', note: 'Partial: WHERE status = DRAFT AND paid_at IS NOT NULL (FR-SLT-42 job)']
    checkout_id [name: 'idx_rentals_checkout', note: 'Partial: WHERE checkout_id IS NOT NULL']
  }
  checks {
    `ends_at > starts_at` [name: 'chk_rental_period']
    `price_per_spray >= 0` [name: 'chk_rental_price_nonnegative']
    `fixed_fee >= 0` [name: 'chk_rental_fee_nonnegative']
    `revenue_share_percent >= 0 AND revenue_share_percent <= 100` [name: 'chk_revenue_share_percent']
    `rental_package_id IS NULL OR num_nulls(storage_plan_id, duration_months, monthly_rent_price, discount_percent, storage_monthly_price, storage_coverage_percent, storage_coverage_cap, rent_amount, storage_amount, total_amount, checkout_id) = 0` [name: 'chk_rental_package_snapshot_complete']
    `total_amount IS NULL OR total_amount = rent_amount + storage_amount + grace_fee_amount` [name: 'chk_rental_total_amount']
    `(paid_at IS NULL) = (invoice_number IS NULL)` [name: 'chk_rental_invoice_on_payment']
    `status::text <> 'CANCELLED' OR paid_at IS NULL` [name: 'chk_rental_cancelled_unpaid']
    `(status::text = 'CANCELLED') = (cancelled_at IS NOT NULL)` [name: 'chk_rental_cancelled_at']
  }
  Note: 'Slot rental invoice ("hóa đơn thuê slot", ADR-0006): one purchase of one package for one slot; several invoices may be paid together in one rental_checkouts row (ADR-0008). Also carries non-negativity/percent-range checks on every snapshot column (chk_rental_amounts_nonnegative, chk_rental_percents, chk_rental_duration_positive) — see schema.sql. The CANCELLED checks compare status::text because node-pg-migrate runs pending migrations in one transaction (docs/MIGRATIONS.md).'
}

Table slot_rental_requests {
  id uuid [pk]
  slot_id uuid [not null, ref: > machine_slots.id]
  brand_id uuid [not null, ref: > brands.id]
  requested_by uuid [not null, ref: > users.id]
  desired_starts_at timestamptz [not null]
  desired_ends_at timestamptz [not null]
  status slot_rental_request_status [not null, default: 'REQUESTED']
  reviewed_by uuid [ref: > users.id]
  reviewed_at timestamptz
  rejection_reason text
  resulting_rental_id uuid [ref: - slot_rentals.id, note: 'DEPRECATED (ADR-0006). Formerly set when APPROVED and the DRAFT rental was auto-created (FR-SLT-23)']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, status, created_at)
    (slot_id, status)
  }
  checks { `desired_ends_at > desired_starts_at` [name: 'chk_request_period'] }
  Note: 'DEPRECATED (ADR-0006): the request → approval flow (FR-SLT-20 to FR-SLT-26) was removed in favour of prepaid package checkout. No new rows are written; the table is kept because dropping it is destructive.'
}

Table machine_status_histories {
  id uuid [pk]
  machine_id uuid [not null, ref: > machines.id]
  from_connection_status machine_connection_status
  to_connection_status machine_connection_status
  from_operating_mode machine_operating_mode
  to_operating_mode machine_operating_mode
  reason text
  source varchar(30) [not null]
  changed_by uuid [ref: > users.id]
  occurred_at timestamptz [not null, default: `now()`]

  indexes { (machine_id, occurred_at) }
  Note: 'One row per transition. A connectivity change (FR-MCH-08/FR-IOT-02/03) fills the *_connection_status pair and leaves *_operating_mode null; an operator mode change (FR-MCH-09/FR-MNT-05/12) fills the *_operating_mode pair and leaves *_connection_status null.'
}

Table inventory_batches {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  fragrance_product_id uuid [not null, ref: > fragrance_products.id]
  source_declaration_id uuid [ref: - brand_shipment_declarations.id, note: 'Set when this batch was auto-created from a received brand shipment declaration (FR-INV-26); null for platform-sourced/manual batches']
  batch_number varchar(100) [not null]
  received_at timestamptz [not null]
  expires_at timestamptz
  quantity_received int [not null]
  supplier_info jsonb
  created_by uuid [not null, ref: > users.id]
  created_at timestamptz [not null, default: `now()`]

  indexes { (brand_id, fragrance_product_id, batch_number) [unique] }
  checks { `quantity_received > 0` [name: 'chk_batch_quantity_positive'] }
}

Table brand_shipment_declarations {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  fragrance_product_id uuid [not null, ref: > fragrance_products.id]
  declared_quantity int [not null]
  declared_bottle_volume_ml numeric(14,4) [not null]
  expected_ship_date date
  status shipment_declaration_status [not null, default: 'DECLARED']
  received_quantity int
  discrepancy_notes text [note: 'Required when received_quantity != declared_quantity (FR-INV-25)']
  received_by uuid [ref: > users.id]
  received_at timestamptz
  declared_by uuid [not null, ref: > users.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes { (brand_id, status, created_at) }
  checks { `declared_quantity > 0` [name: 'chk_declared_quantity_positive'] }
  Note: 'Brand Admin declares an incoming shipment to the platform warehouse; Inventory Staff reconciles on receipt (FR-INV-22 to FR-INV-28). resulting inventory_batches row links back via inventory_batches.source_declaration_id.'
}

Table bottles {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id, note: 'Originating brand; immutable for audit even after ownership transfers to platform']
  owner revenue_owner_type [not null, default: 'BRAND', note: 'Current owner. Flips to PLATFORM on liquidation (FR-EXP-15)']
  batch_id uuid [not null, ref: > inventory_batches.id]
  fragrance_product_id uuid [not null, ref: > fragrance_products.id]
  identifier varchar(150) [not null]
  status bottle_status [not null, default: 'IN_STOCK']
  initial_volume_ml numeric(14,4) [not null]
  current_estimated_ml numeric(14,4) [not null]
  empty_weight_g numeric(14,4)
  initial_measured_weight_g numeric(14,4)
  current_measured_weight_g numeric(14,4)
  opened_at timestamptz
  installed_at timestamptz
  removed_at timestamptz
  expires_at timestamptz
  source_rental_id uuid [ref: > slot_rentals.id, note: 'Slot rental this bottle was serving at the time of liquidation (FR-EXP-16)']
  liquidated_at timestamptz [note: 'Set when owner flips to PLATFORM via liquidation (FR-EXP-16)']
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, identifier) [unique]
    (brand_id, status, expires_at)
    batch_id
  }
  checks {
    `initial_volume_ml >= 0` [name: 'chk_bottle_initial_nonnegative']
    `current_estimated_ml >= 0` [name: 'chk_bottle_current_nonnegative']
  }
}

Table refill_sessions {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  machine_id uuid [not null, ref: > machines.id]
  slot_id uuid [not null, ref: > machine_slots.id]
  old_bottle_id uuid [ref: > bottles.id]
  new_bottle_id uuid [ref: > bottles.id, note: 'Nullable: this row IS the phiếu nạp (FR-INV-29) and is opened before the replacement bottle is chosen; must be set by the time status = COMPLETED, enforced in the domain service']
  performed_by uuid [not null, ref: > users.id]
  status refill_status [not null, default: 'STARTED']
  checklist_completed boolean [not null, default: false, note: 'FR-INV-14 checklist gate before the ticket can be closed (COMPLETED)']
  before_weight_g numeric(14,4)
  after_weight_g numeric(14,4)
  notes text
  started_at timestamptz [not null, default: `now()`]
  completed_at timestamptz

  indexes { (brand_id, machine_id, started_at) }
  Note: 'started_at/status=STARTED = opened phiếu nạp (FR-INV-29); completed_at/status=COMPLETED = closed phiếu (FR-INV-31). While STARTED, alert generation for FR-ALR-03 door-open-too-long must be suppressed for this machine/slot (FR-INV-30).'
}

Table inventory_adjustments {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  bottle_id uuid [not null, ref: > bottles.id]
  slot_id uuid [ref: > machine_slots.id]
  before_quantity_ml numeric(14,4) [not null]
  after_quantity_ml numeric(14,4) [not null]
  difference_ml numeric(14,4) [not null]
  reason text [not null]
  adjusted_by uuid [not null, ref: > users.id]
  created_at timestamptz [not null, default: `now()`]

  indexes { (brand_id, bottle_id, created_at) }
  checks {
    `before_quantity_ml >= 0` [name: 'chk_adjust_before_nonnegative']
    `after_quantity_ml >= 0` [name: 'chk_adjust_after_nonnegative']
  }
}

Table storage_compensations {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  bottle_id uuid [not null, unique, ref: > bottles.id, note: 'One compensation per damaged bottle']
  slot_rental_id uuid [not null, ref: > slot_rentals.id, note: 'Invoice whose storage plan applies: the slot the bottle is installed in, or — for a warehouse bottle — the brand active invoice with the highest coverage_percent. The cap is consumed per this column']
  bottle_retail_price numeric(19,4) [not null, note: 'Snapshot used for the calculation']
  coverage_percent numeric(5,2) [not null, note: 'Snapshot used for the calculation']
  amount numeric(19,4) [not null, note: 'min(coverage_percent × bottle_retail_price, remaining cap of the invoice)']
  currency char(3) [not null, default: 'VND']
  status storage_compensation_status [not null, default: 'PENDING']
  payout_reference varchar(200)
  paid_by uuid [ref: > users.id]
  paid_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, status, created_at)
    slot_rental_id
  }
  checks {
    `bottle_retail_price >= 0 AND amount >= 0` [name: 'chk_compensation_amounts_nonnegative']
    `coverage_percent >= 0 AND coverage_percent <= 100` [name: 'chk_compensation_coverage_percent']
    `(status = 'PAID') = (paid_at IS NOT NULL AND paid_by IS NOT NULL AND payout_reference IS NOT NULL)` [name: 'chk_compensation_paid_fields']
  }
  Note: 'ADR-0006, FR-SLT-44 to 46: goods storage insurance payout when a brand bottle becomes DAMAGED while held by the platform. Money moves outside the system; Super Admin records the payout after re-authentication (FR-SLT-45).'
}

Table orders {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id, note: 'Catalog brand owning fragrance_product_id at order time — always set, even for post-liquidation orders where revenue_owner = PLATFORM. Money ownership is revenue_owner, not this column. Brand Admin visibility (FR-EXP-20, FR-REV-06) must filter by revenue_owner = BRAND, never by brand_id alone']
  slot_rental_id uuid [not null, ref: > slot_rentals.id]
  revenue_owner revenue_owner_type [not null, note: 'Immutable snapshot: BRAND or PLATFORM at order creation']
  machine_id uuid [not null, ref: > machines.id]
  slot_id uuid [not null, ref: > machine_slots.id]
  fragrance_product_id uuid [not null, ref: > fragrance_products.id]
  product_name_snapshot varchar(200) [not null]
  amount numeric(19,4) [not null]
  currency char(3) [not null]
  status order_status [not null, default: 'CREATED']
  payment_reference varchar(150) [not null, unique]
  idempotency_key varchar(150) [not null, unique]
  expires_at timestamptz [not null]
  paid_at timestamptz
  dispensed_at timestamptz
  failure_code varchar(100)
  needs_manual_review boolean [not null, default: false, note: 'FR-ORD-19: set when paid but dispense failed/unknown. Drives FR-ORD-20/21 refund and support flows']
  manual_review_resolved_by uuid [ref: > users.id]
  manual_review_resolved_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, created_at)
    (brand_id, status, created_at)
    (machine_id, created_at)
  }
  checks { `amount >= 0` [name: 'chk_order_amount_nonnegative'] }
}

Table kiosk_interaction_events {
  id uuid [pk]
  event_id varchar(150) [not null, unique, note: 'Client-generated idempotency key']
  event_type kiosk_interaction_type [not null]
  brand_id uuid [not null, ref: > brands.id, note: 'Snapshot from rental when event occurred']
  slot_rental_id uuid [not null, ref: > slot_rentals.id]
  machine_id uuid [not null, ref: > machines.id]
  slot_id uuid [not null, ref: > machine_slots.id]
  fragrance_product_id uuid [not null, ref: > fragrance_products.id]
  kiosk_session_id uuid [not null, note: 'Anonymous rotating session; contains no customer identity']
  occurred_at timestamptz [not null]
  received_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, occurred_at)
    (slot_rental_id, event_type, occurred_at)
    (fragrance_product_id, event_type, occurred_at)
    (machine_id, event_type, occurred_at)
  }
}

Table refill_requests {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  slot_rental_id uuid [not null, ref: > slot_rentals.id]
  slot_id uuid [not null, ref: > machine_slots.id]
  fragrance_product_id uuid [not null, ref: > fragrance_products.id]
  reason refill_request_reason [not null]
  status refill_request_status [not null, default: 'SUBMITTED']
  requested_by uuid [not null, ref: > users.id]
  reviewed_by uuid [ref: > users.id]
  rejection_reason text
  scheduled_at timestamptz
  refill_session_id uuid [ref: - refill_sessions.id]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, status, created_at)
    (slot_id, status)
  }
}

Table order_status_histories {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  order_id uuid [not null, ref: > orders.id]
  from_status order_status
  to_status order_status [not null]
  reason text
  metadata jsonb
  actor_type varchar(30) [not null]
  actor_id uuid
  occurred_at timestamptz [not null, default: `now()`]

  indexes { (order_id, occurred_at) }
}

Table payments {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  order_id uuid [ref: > orders.id, note: 'Kiosk order being paid. Exactly one of order_id / rental_checkout_id is set (chk_payment_single_target)']
  provider varchar(50) [not null]
  provider_transaction_id varchar(200)
  provider_reference varchar(200) [note: 'Reference sent to the gateway and echoed in the webhook. Unique per provider (uq_payment_provider_reference, ADR-0009)']
  amount numeric(19,4) [not null]
  currency char(3) [not null]
  status payment_status [not null, default: 'PENDING']
  raw_response jsonb
  paid_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
  rental_checkout_id uuid [ref: > rental_checkouts.id, note: 'ADR-0008 (replaces ADR-0006 slot_rental_id): slot rental checkout being paid — one payment for every invoice in it (FR-SLT-37). Same webhook and idempotency as kiosk orders']

  indexes {
    (provider, provider_transaction_id) [unique, note: 'In PostgreSQL make this partial: WHERE provider_transaction_id IS NOT NULL']
    order_id
    (brand_id, status, created_at)
    rental_checkout_id [unique, name: 'uq_checkout_payment_pending', note: 'Partial: WHERE rental_checkout_id IS NOT NULL AND status = PENDING — at most one pending payment per checkout']
  }
  checks {
    `amount >= 0` [name: 'chk_payment_amount_nonnegative']
    `num_nonnulls(order_id, rental_checkout_id) = 1` [name: 'chk_payment_single_target']
  }
}

Table payment_events {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Null when the webhook could not be matched to any payment/order (invalid signature, unknown reference) — still logged for security review per FR-ORD-13/14']
  payment_id uuid [ref: > payments.id]
  provider varchar(50) [not null]
  provider_event_id varchar(200) [not null]
  payload_hash varchar(128) [not null]
  signature_valid boolean [not null]
  payload jsonb [not null]
  processing_result varchar(50)
  received_at timestamptz [not null, default: `now()`]
  processed_at timestamptz

  indexes {
    (provider, provider_event_id) [unique]
    (brand_id, received_at)
  }
}

Table dispense_commands {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Set for CUSTOMER commands (copied from the order). Null for DIAGNOSTIC commands run on a slot with no current rental (e.g. testing hardware before any brand is assigned)']
  order_id uuid [ref: > orders.id, note: 'Unique for CUSTOMER command; null for DIAGNOSTIC']
  machine_id uuid [not null, ref: > machines.id]
  slot_id uuid [not null, ref: > machine_slots.id]
  command_type dispense_type [not null]
  command_token varchar(255) [not null, unique]
  signature text [not null]
  status command_status [not null, default: 'CREATED']
  expires_at timestamptz [not null]
  sent_at timestamptz
  acknowledged_at timestamptz
  completed_at timestamptz
  retry_count int [not null, default: 0]
  created_by uuid [ref: > users.id]
  created_at timestamptz [not null, default: `now()`]

  indexes {
    order_id [unique, note: 'Exported SQL must be partial: WHERE order_id IS NOT NULL AND command_type = CUSTOMER']
    machine_id [unique, name: 'uq_machine_active_customer_command', note: 'ADR-0007, FR-DSP-26 — partial: WHERE command_type = CUSTOMER AND status IN (CREATED, SENT, ACKNOWLEDGED). One lit button per machine']
    (machine_id, created_at)
  }
  checks { `retry_count >= 0` [name: 'chk_command_retry_nonnegative'] }
}

Table dispense_results {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Copied from dispense_commands.brand_id; null for DIAGNOSTIC results']
  command_id uuid [not null, unique, ref: - dispense_commands.id]
  success boolean [not null]
  result_code varchar(100)
  failure_code varchar(100)
  executed_at timestamptz
  received_at timestamptz [not null, default: `now()`]
  measured_quantity_ml numeric(10,4)
  sensor_snapshot jsonb
  raw_payload jsonb
  device_event_id varchar(150)

  indexes { (brand_id, received_at) }
}

Table alerts {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Set only for slot-scoped alerts (single brand known, e.g. FR-ALR-02). Null for machine-scoped alerts (FR-ALR-01/03/05), which can affect several brands at once — FR-ALR-09 derives the affected brand list at read time by joining active slot_rentals for the machine, not from this column']
  machine_id uuid [not null, ref: > machines.id]
  slot_id uuid [ref: > machine_slots.id]
  type varchar(80) [not null]
  severity alert_severity [not null]
  status alert_status [not null, default: 'OPEN']
  deduplication_key varchar(255) [not null]
  title varchar(250) [not null]
  description text
  first_occurred_at timestamptz [not null]
  last_occurred_at timestamptz [not null]
  occurrence_count int [not null, default: 1]
  acknowledged_by uuid [ref: > users.id]
  acknowledged_at timestamptz
  assigned_to uuid [ref: > users.id]
  resolved_by uuid [ref: > users.id]
  resolved_at timestamptz
  resolution text
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, status, severity, created_at)
    deduplication_key [note: 'Use a PostgreSQL partial unique index for unresolved statuses']
  }
  checks { `occurrence_count > 0` [name: 'chk_alert_occurrence_positive'] }
}

Table maintenance_tickets {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Almost always null: a maintenance ticket is a platform/machine resource, not owned by one brand. FR-MNT-07 notifies every Brand Admin with a slot on the machine, derived by joining active slot_rentals — not stored here']
  machine_id uuid [not null, ref: > machines.id]
  source_alert_id uuid [ref: - alerts.id]
  ticket_number varchar(80) [not null]
  category varchar(100) [not null]
  severity alert_severity [not null]
  priority ticket_priority [not null]
  status ticket_status [not null, default: 'OPEN']
  assigned_to uuid [ref: > users.id]
  due_at timestamptz
  started_at timestamptz
  resolved_at timestamptz
  closed_at timestamptz
  diagnosis text
  corrective_action text
  replacement_parts jsonb
  cost numeric(19,4)
  post_test_result varchar(30)
  post_tested_by uuid [ref: > users.id]
  post_tested_at timestamptz
  downtime_minutes int
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    ticket_number [unique, note: 'Globally unique — tickets are a platform resource, not scoped per brand']
    (machine_id, status, assigned_to, due_at)
  }
  checks {
    `cost IS NULL OR cost >= 0` [name: 'chk_ticket_cost_nonnegative']
    `downtime_minutes IS NULL OR downtime_minutes >= 0` [name: 'chk_downtime_nonnegative']
  }
}

Table maintenance_activities {
  id uuid [pk]
  ticket_id uuid [not null, ref: > maintenance_tickets.id]
  actor_id uuid [not null, ref: > users.id]
  activity_type varchar(80) [not null]
  from_status ticket_status
  to_status ticket_status
  notes text
  attachments jsonb
  created_at timestamptz [not null, default: `now()`]

  indexes { (ticket_id, created_at) }
}

Table device_credentials {
  id uuid [pk]
  machine_id uuid [not null, unique, ref: - machines.id]
  credential_identifier varchar(200) [not null, unique]
  public_key_or_secret_hash text [not null]
  certificate_fingerprint varchar(255)
  status credential_status [not null, default: 'ACTIVE']
  issued_at timestamptz [not null]
  expires_at timestamptz
  revoked_at timestamptz
  last_authenticated_at timestamptz
}

Table device_events {
  id uuid [pk]
  machine_id uuid [not null, ref: > machines.id]
  device_event_id varchar(150) [not null]
  event_type varchar(100) [not null]
  occurred_at timestamptz [not null]
  received_at timestamptz [not null, default: `now()`]
  payload jsonb

  indexes {
    (machine_id, device_event_id) [unique]
    (machine_id, occurred_at)
  }
}

Table sensor_readings {
  id uuid [pk]
  machine_id uuid [not null, ref: > machines.id]
  slot_id uuid [ref: > machine_slots.id]
  reading_type varchar(100) [not null]
  numeric_value numeric(18,6)
  unit varchar(30)
  payload jsonb
  measured_at timestamptz [not null]
  received_at timestamptz [not null, default: `now()`]

  indexes { (machine_id, slot_id, measured_at) }
}

Table audit_logs {
  id uuid [pk]
  brand_id uuid [ref: > brands.id, note: 'Null for platform-wide event']
  actor_type varchar(30) [not null]
  actor_id uuid
  action varchar(150) [not null]
  target_type varchar(100) [not null]
  target_id uuid
  source_ip inet
  user_agent text
  severity varchar(30) [not null, default: 'INFO']
  before_data jsonb
  after_data jsonb
  metadata jsonb
  occurred_at timestamptz [not null, default: `now()`]

  indexes {
    (brand_id, occurred_at)
    (actor_id, occurred_at)
    (target_type, target_id)
  }
  Note: 'Append-only. Application roles must not have UPDATE or DELETE privileges.'
}

Table notifications {
  id uuid [pk]
  brand_id uuid [not null, ref: > brands.id]
  recipient_user_id uuid [not null, ref: > users.id]
  type varchar(80) [not null]
  channel varchar(30) [not null]
  subject varchar(250)
  content text [not null]
  status notification_status [not null, default: 'PENDING']
  sent_at timestamptz
  read_at timestamptz
  created_at timestamptz [not null, default: `now()`]

  indexes { (recipient_user_id, status, created_at) }
}

TableGroup Identity_and_Brands {
  brands
  users
  roles
  permissions
  user_roles
  role_permissions
  refresh_sessions
}

TableGroup Catalog_and_Machines {
  locations
  fragrance_products
  machines
  machine_slots
  machine_status_histories
  slot_rentals
  slot_rental_requests
  rental_packages
  storage_plans
  rental_checkouts
}

TableGroup Inventory {
  inventory_batches
  brand_shipment_declarations
  bottles
  refill_sessions
  inventory_adjustments
  storage_compensations
}

TableGroup Orders_and_Payments {
  orders
  order_status_histories
  payments
  payment_events
  dispense_commands
  dispense_results
  kiosk_interaction_events
}

TableGroup Operations {
  alerts
  maintenance_tickets
  maintenance_activities
  notifications
  audit_logs
  refill_requests
}

TableGroup Device_and_IoT {
  device_credentials
  device_events
  sensor_readings
}

Note implementation_notes {
  '''
  PostgreSQL migration requirements not fully expressible in DBML:
  1. Add partial unique index for machine_slots.active_bottle_id WHERE active_bottle_id IS NOT NULL.
  2. Add partial unique index for payments(provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL.
  3. Add partial unique index for one CUSTOMER dispense command per order.
  4. Add partial unique index for unresolved alert deduplication keys.
  5. Add same-brand composite constraints/triggers and Row-Level Security policies.
  6. Enforce valid order/ticket state transitions in domain services and record histories.
  7. Enforce user_roles scope uniqueness when scope_id is null using a PostgreSQL expression or partial unique index.
  8. Add an exclusion constraint on slot_rentals so rental periods for the same slot cannot overlap in occupying statuses.
  9. Enforce fragrance_product_id belongs to slot_rentals.brand_id and snapshot brand/rental fields cannot change after event or order creation.
  10. Add a partial unique index on refill_requests(slot_id) for unfinished statuses to prevent duplicate open requests.
  11. Add a partial unique index on slot_rental_requests(slot_id) WHERE status IN (REQUESTED, APPROVED) to prevent duplicate open rental requests on the same slot (FR-SLT-26). DEPRECATED with the table (ADR-0006); kept until the table is dropped.
  12. Enforce in the domain service, not as a DB constraint: refill_sessions.new_bottle_id must be NOT NULL by the time status transitions to COMPLETED (FR-INV-29 allows opening a phiếu nạp before the replacement bottle is chosen).
  13. Enforce in the domain service: slot_rentals.fragrance_product_id AND price_per_spray must be NOT NULL before orders can be created on the slot (FR-SLT-29); both columns are nullable at the DB level only for the window between payment (FR-SLT-38) and slot configuration (FR-SLT-08, FR-SLT-27).
  14. FR-ALR-03 door-open-too-long alert generation must additionally suppress while there exists a refill_sessions row with status = STARTED for the same machine/slot (FR-INV-30), in addition to the existing MAINTENANCE-mode exception.
  15. Roles/permissions are data rows, not enum values, so no schema change is needed to merge the former Operations Manager and Technician roles into one Operations Staff role — only update the seed/reference data in the roles table (drop one role code, or keep one canonical code and stop issuing the other).
  16. On FR-EXP-15 liquidation: set bottles.owner = PLATFORM, bottles.status = LIQUIDATED, bottles.liquidated_at = now(), bottles.source_rental_id = the liquidated slot_rentals.id, for every bottle installed or held in reserve for that rental's slot.
  17. ADR-0006 — prepaid slot rental packages. The exclusion constraint of note 8 covers DRAFT, so a DRAFT invoice holds the slot during checkout: a second brand checking out the same slot fails with SLOT_OCCUPIED (FR-SLT-35). CANCELLED is outside the constraint, so a cancelled invoice frees the slot.
  18. Domain service jobs (with catch-up after downtime, NFR-REL-07): unpaid rental_checkouts past hold_expires_at → cancelled_at set, every invoice of the checkout → CANCELLED, its PENDING payment → EXPIRED, all in one transaction (FR-SLT-39, ADR-0008); DRAFT + paid for more than RENTAL_MAX_STOCKING_DAYS → ACTIVE with real starts_at/ends_at (FR-SLT-42).
  19. First bottle install on a paid DRAFT invoice activates it in the same transaction (FR-SLT-24). Renewal: old invoice → RENEWED and new invoice → ACTIVE in the same transaction, exactly when the new invoice starts (FR-SLT-12, FR-EXP-13) — never at payment time, or the slot would stop selling until the hand-over.
  20. Same-brand composite FKs (note 5) added by ADR-0006 and ADR-0008: payments(rental_checkout_id, brand_id) → rental_checkouts(id, brand_id); slot_rentals(checkout_id, brand_id) → rental_checkouts(id, brand_id); storage_compensations(bottle_id, brand_id) → bottles(id, brand_id) (needs UNIQUE (id, brand_id) on bottles); storage_compensations(slot_rental_id, brand_id) → slot_rentals(id, brand_id).
  21. Enforce in the domain service: storage_compensations.amount must not exceed slot_rentals.storage_coverage_cap minus the sum of existing amounts for the same slot_rental_id (FR-SLT-44).
  22. ADR-0007 — physical button per slot. For CUSTOMER commands, ACKNOWLEDGED means the slot button is lit and waiting; the device dispenses only when the customer presses it within DISPENSE_PRESS_WINDOW_SEC, otherwise it rejects with PRESS_TIMEOUT and the order becomes FORFEITED without manual review or refund. Other rejections after ACK make the order FAILED with needs_manual_review. After ACK the UNKNOWN deadline is acknowledged_at + DISPENSE_PRESS_WINDOW_SEC + DISPENSE_RESULT_TIMEOUT_SEC. A paid order waits in PAID while the machine has another active CUSTOMER command; order creation on such a machine fails with MACHINE_BUSY.
  23. ADR-0008 — one payment for several slots. A checkout and all its invoices are created in ONE transaction; excl_slot_rental_overlap rejecting any slot rolls back the whole cart (all or nothing, FR-SLT-35). Deferred constraint triggers (schema.sql §10d) check at COMMIT that a checkout has at least one invoice, that rental_checkouts.total_amount = sum of its invoices total_amount, and that the checkout and every invoice agree on paid (paid_at null or not) and cancelled (cancelled_at null or not). On webhook success each invoice gets its own invoice_number (FR-SLT-38).
  24. ADR-0009 — BEFORE UPDATE trigger trg_orders_snapshot_immutable rejects any change to the order snapshot columns (brand_id, slot_rental_id, revenue_owner, machine_id, slot_id, fragrance_product_id, product_name_snapshot, amount, currency, payment_reference, idempotency_key) with constraint name chk_order_snapshot_immutable (FR-REV-03 AC2). Partial unique index uq_payment_provider_reference on payments (provider, provider_reference) WHERE provider_reference IS NOT NULL so the webhook resolves exactly one payment per reference.
  '''
}
