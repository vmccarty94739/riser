/**
 * Riser only schedules local notifications (reminders built on the phone), so it never needs
 * Apple Push Notifications. expo-notifications adds the `aps-environment` entitlement by default;
 * removing it keeps provisioning simple and avoids asking for a capability the app doesn't use.
 */
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
