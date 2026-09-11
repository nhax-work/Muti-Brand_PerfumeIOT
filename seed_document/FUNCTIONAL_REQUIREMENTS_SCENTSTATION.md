# ScentStation Functional Requirements

## 1. Platform Super Administrator

The Platform Super Administrator manages the entire ScentStation platform and all participating perfume brands.

- Create, update, activate, suspend, and manage perfume-brand tenants.
- Create and manage Brand Administrator accounts for each tenant.
- Configure platform-wide settings, payment providers, device policies, notification templates, and system parameters.
- Monitor all registered machines, locations, device connectivity, firmware versions, critical alerts, and system services.
- View platform-wide statistics, including brands, machines, transactions, dispensing operations, and operational incidents.
- Access system audit logs for security investigation and operational monitoring.
- Manage platform-level roles and permissions.
- Ensure that data belonging to different perfume brands remains logically isolated.
- Revoke user or device access when suspicious activities are detected.

## 2. Brand Administrator

The Brand Administrator manages business data, users, products, machines, and operations belonging to one perfume brand.

- Manage brand information, logos, descriptions, contact information, and kiosk display content.
- Create, update, deactivate, and assign accounts for Operations Managers, Technicians, Inventory Staff, and Viewers.
- Configure roles and permissions within the assigned brand.
- Manage perfume products, including product name, description, images, fragrance notes, price per spray, and availability.
- Manage locations and assign machines to specific locations.
- Configure the perfume product, selling price, and availability of each machine slot.
- Configure machine operating hours, low-stock thresholds, and notification settings.
- View the status of all machines belonging to the brand.
- View transactions, dispensing results, inventory status, alerts, refill history, and maintenance activities.
- Configure promotional campaigns, free-trial campaigns, or temporary prices.
- View and export operational and business reports by fragrance, machine, location, and time period.

## 3. Operations Manager

The Operations Manager monitors daily machine operations and handles transaction or device incidents.

- Monitor machine status, including online/offline status, last connection time, operating mode, active slots, and current alerts.
- View the perfume currently installed in each slot and its estimated remaining quantity.
- Remotely enable or disable a machine or an individual slot when an operational problem occurs.
- Review pending, successful, failed, expired, and refunded transactions.
- Identify transactions in which payment succeeded but dispensing failed or was not confirmed.
- Initiate an authorized retry, refund, or manual-review workflow according to operational policies.
- Receive alerts for offline machines, low stock, empty slots, opened doors, suspected leakage, sensor failure, and dispensing failure.
- Create, prioritize, assign, and monitor maintenance tickets.
- Monitor machine uptime, downtime, refill frequency, incident frequency, and resolution time.
- View operational dashboards and reports for the assigned brand or locations.

## 4. Technician

The Technician performs inspection, refill support, diagnostics, and maintenance for assigned machines.

- View assigned machines, active alerts, and maintenance tickets.
- Authenticate before accessing maintenance or diagnostic functions.
- Place a machine into maintenance mode to prevent new customer transactions.
- View machine information, firmware version, sensor readings, error codes, and recent device events.
- Perform authorized diagnostic operations on the machine or a selected slot.
- Run a controlled test spray that is recorded separately from customer transactions.
- Record inspection results, identified problems, corrective actions, and replaced components.
- Complete configurable maintenance checklists.
- Record supporting notes or images when required.
- Perform a post-maintenance test before returning the machine to normal operation.
- Close a maintenance ticket only after recording the repair result.
- View the maintenance and failure history of assigned machines.

## 5. Inventory Staff

The Inventory Staff manages perfume bottles or cartridges and performs refill or replacement operations.

- Manage perfume inventory batches, including product, batch number, quantity, received date, and expiration date.
- Register individual perfume bottles or cartridges with unique identifiers.
- View bottles or cartridges by status, including available, installed, nearly empty, empty, damaged, and expired.
- Assign a bottle or cartridge to a specific machine slot.
- Verify that the correct fragrance is installed in the correct slot.
- Record the measured weight or quantity before and after installation.
- Record the employee, time, machine, slot, previous bottle, and new bottle for every refill or replacement.
- Reconcile estimated inventory with sensor measurements.
- Record inventory adjustments together with a mandatory reason.
- Receive low-stock, abnormal-consumption, and expiration alerts.
- View inventory movement and refill history.
- Generate inventory reports by perfume, batch, machine, location, and time period.

## 6. Customer/Kiosk User

The Customer uses the kiosk to select, pay for, and receive a perfume experience.

- View all fragrances currently available on the machine.
- View fragrance information, including brand, product name, description, fragrance notes, image, price, and usage instructions.
- Select one available fragrance for an experience session.
- Review and confirm the selected fragrance and price before creating an order.
- Receive a dynamically generated QR code for payment.
- View the current payment status, including waiting, successful, failed, cancelled, or expired.
- Receive instructions to place a test strip or wrist in the designated spraying area.
- Receive one controlled spray only after the backend confirms successful payment.
- View the dispensing status, including processing, successful, or failed.
- Receive clear recovery instructions when payment succeeds but dispensing fails.
- Scan a product QR code to view more information, promotions, or purchase channels.
- Automatically return to the home screen after the transaction or inactivity timeout.

## 7. Brand, User, and Access Management

The system shall provide multi-tenant account management and role-based access control.

- Associate each user with a perfume brand and one or more authorized roles.
- Restrict users to functions and data within their assigned tenant and operational scope.
- Prevent users of one brand from accessing machines, products, transactions, inventory, or reports belonging to another brand.
- Allow authorized administrators to activate, deactivate, lock, or reset user accounts.
- Support permission assignment by role, location, machine, or operational responsibility.
- Record login attempts, account changes, role changes, and permission changes.
- Terminate or revoke active sessions when an account is disabled.
- Require additional authorization for sensitive actions such as refunds, inventory adjustments, diagnostic sprays, and machine reconfiguration.

## 8. Machine and Slot Management

The system shall manage physical perfume machines and their independently controlled slots.

- Register each machine using a unique serial number and device identity.
- Activate and associate a machine with a tenant and operating location.
- Configure the number and identifiers of slots available on each machine.
- Assign one active perfume bottle or cartridge to each slot.
- Prevent one slot from having multiple active bottles at the same time.
- Configure slot price, product, low-stock threshold, spray duration or calibrated dosage, and availability.
- Display machine connectivity, operating mode, firmware version, configuration version, and last communication time.
- Allow authorized users to enable or disable the whole machine or selected slots.
- Maintain machine installation, relocation, ownership, configuration, and service history.
- Record all important configuration changes in the audit log.

## 9. Order and Payment Management

The system shall securely manage the customer order and payment process.

- Allow an order to be created only when the selected machine and slot are available.
- Store the tenant, machine, slot, perfume product, price, currency, and expiration time at order creation.
- Generate a unique payment reference and QR code for each order.
- Receive payment notifications from the configured payment provider.
- Verify the webhook signature, payment reference, paid amount, currency, and transaction status.
- Prevent duplicated payment notifications from being processed more than once.
- Mark unpaid orders as expired after a configured timeout.
- Prevent failed, cancelled, or expired orders from generating dispensing commands.
- Maintain the complete payment and order status history.
- Support refund or manual-review workflows when payment succeeds but dispensing is unsuccessful.
- Reconcile internal transactions with payment-provider records.
- Allow authorized users to search transactions by time, machine, location, perfume, payment reference, and status.

## 10. Secure Dispensing Management

The system shall ensure that every valid payment produces no more than one perfume spray.

- Generate a dispensing command only after successful payment verification by the backend.
- Assign every command a unique identifier, target machine, target slot, creation time, expiration time, and secure signature.
- Ensure that an order has no more than one active dispensing command.
- Send the command to the correct machine through a secure IoT communication channel.
- Require the device to acknowledge the command before execution.
- Require the device to reject invalid, expired, duplicated, or incorrectly addressed commands.
- Prevent dispensing when the machine is in maintenance mode, the door is open, the selected slot is empty, or a critical error exists.
- Activate only the selected slot for one calibrated dispensing cycle.
- Record command acknowledgement, execution time, result, relevant sensor data, and failure code.
- Update the order to `DISPENSED` only after receiving a successful result from the machine.
- Handle timeout or uncertain results without automatically creating an uncontrolled second spray.
- Send unsuccessful or uncertain dispensing results to an operational review workflow.

## 11. IoT Device Monitoring and Communication

The system shall remotely monitor machines and securely exchange data with IoT devices.

- Receive periodic heartbeat messages from each registered machine.
- Determine whether a machine is online, unstable, or offline based on the most recent heartbeat.
- Collect telemetry such as slot weight, estimated remaining perfume, door state, leakage state, actuator state, and power status.
- Receive device events such as startup, shutdown, reconnection, maintenance mode, sensor error, and dispensing failure.
- Send secure commands for dispensing, diagnostics, status requests, and configuration updates.
- Correlate every command with its acknowledgement and final execution result.
- Store important telemetry and aggregate historical readings for reporting.
- Allow the device to temporarily store unsent events when the network is unavailable.
- Synchronize stored events after reconnection without creating duplicate records.
- Monitor device firmware and configuration versions.
- Reject communication from unregistered, revoked, or invalid devices.

## 12. Perfume Inventory and Level Monitoring

The system shall estimate perfume consumption and manage refill activities.

- Record the initial quantity or weight when a bottle or cartridge is installed.
- Estimate the remaining quantity using successful spray count and calibrated consumption per spray.
- Compare estimated consumption with load-cell or level-sensor measurements.
- Update the estimated remaining spray count after every successful customer or diagnostic spray.
- Generate a low-stock alert when the remaining amount is below a configured threshold.
- Mark a slot unavailable when it does not contain enough perfume for another safe spray.
- Detect possible leakage or abnormal consumption when measured loss differs significantly from recorded dispensing activity.
- Maintain the complete installation, refill, removal, adjustment, and disposal history.
- Require an authorized user and a reason for manual inventory adjustments.
- Generate inventory reports by product, batch, machine, location, brand, and time period.

## 13. Alert and Notification Management

The system shall automatically detect and manage operational problems.

- Generate alerts for machine offline status, low stock, empty slots, opened doors, suspected leakage, sensor failures, actuator failures, and repeated dispensing failures.
- Classify alerts by type, severity, status, machine, location, and occurrence time.
- Avoid generating excessive duplicate alerts for the same unresolved problem.
- Notify responsible users through in-system notifications and configured external channels.
- Allow authorized users to acknowledge, assign, resolve, or reopen alerts.
- Automatically create maintenance tickets for configured critical alert types.
- Record the responsible user, acknowledgement time, resolution details, and resolution time.
- Escalate alerts that remain unresolved beyond the configured service time.
- Maintain alert history for operational analysis.

## 14. Maintenance Management

The system shall support the complete lifecycle of machine maintenance.

- Create maintenance tickets manually or automatically from device alerts.
- Assign tickets to technicians based on brand, location, machine, or responsibility.
- Classify tickets by category, severity, priority, status, and due date.
- Prevent machines with critical maintenance tickets from accepting new orders.
- Provide inspection, repair, refill-support, and post-maintenance checklists.
- Record diagnostic results, corrective actions, replaced parts, costs, and supporting evidence.
- Track the time from incident detection to acknowledgement and final resolution.
- Require a successful post-maintenance test before returning the machine to active service.
- Maintain maintenance history for each machine and component.
- Generate reports about downtime, repeated failures, maintenance frequency, and resolution performance.

## 15. Dashboard and Reporting

The system shall provide operational and business reports according to the user’s authorized scope.

- Display machines by online, offline, maintenance, disabled, and error status.
- Display transaction volume and revenue by day, week, month, and custom period.
- Report successful, pending, failed, expired, and refunded transactions.
- Report successful and failed dispensing rates.
- Identify cases where payment succeeded but dispensing was not confirmed.
- Display the most frequently selected perfumes by brand, machine, location, and period.
- Display current inventory estimates, low-stock slots, and expected refill requirements.
- Report machine uptime, downtime, alert frequency, and average resolution time.
- Allow users to filter reports by authorized brand, location, machine, product, and time range.
- Allow authorized users to export reports in common formats such as CSV or Excel.
- Restrict platform-wide reports to the Platform Super Administrator.

## 16. Audit and Traceability

The system shall maintain traceability for security and operational investigation.

- Record important user actions, authentication events, device commands, payment events, inventory changes, and configuration updates.
- Store the actor, tenant, action, target object, timestamp, source, and relevant before-and-after values.
- Record all changes to product prices, slot assignments, user permissions, inventory adjustments, refunds, and maintenance status.
- Prevent normal users from editing or deleting audit records.
- Allow authorized administrators to search audit logs by time, user, machine, action, object, and severity.
- Maintain end-to-end traceability from an order to its payment, dispensing command, device result, inventory deduction, operational incident, and refund if applicable.

## 17. Business Rules

- Each machine belongs to exactly one perfume-brand tenant at a given time.
- Each machine slot can contain only one active perfume bottle or cartridge at a time.
- Only available products installed in online and operational machines can be selected by customers.
- The product and price of an order are fixed at the time the order is created.
- Only the backend can confirm that a payment is successful.
- A screenshot or kiosk-displayed result shall not be considered proof of payment.
- A successfully paid order shall result in no more than one successful spray.
- An expired, invalid, duplicated, or incorrectly addressed command shall be rejected by the device.
- A machine shall not dispense when its door is open, it is under maintenance, the selected slot is empty, or a critical hardware error is active.
- New orders shall not be accepted when the machine cannot communicate with the backend.
- Only confirmed dispensing operations shall reduce customer-sale inventory; diagnostic sprays shall be recorded separately.
- Every refill, inventory adjustment, diagnostic spray, price change, permission change, and refund shall be recorded in the audit log.
- Users belonging to one perfume brand shall not access data belonging to another perfume brand.
- An uncertain dispensing result shall require review and shall not automatically create another spray command.
- A machine under maintenance shall return to active service only after the required checklist and post-maintenance test are completed.
