-- In-app purchases (StoreKit 2 signed transactions, verified server-side), App Store Server
-- Notifications v2, and first-party funnel events.
CREATE TABLE IF NOT EXISTS entitlements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id BIGINT UNSIGNED NOT NULL,
  product_id VARCHAR(100) NOT NULL,
  original_transaction_id VARCHAR(64) NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  ownership VARCHAR(24) NULL,
  app_account_token CHAR(36) NULL,
  purchase_date TIMESTAMP(3) NULL,
  revoked_at TIMESTAMP(3) NULL,
  revocation_reason INT NULL,
  signed_transaction MEDIUMTEXT NOT NULL,
  verified_with VARCHAR(16) NOT NULL DEFAULT 'jws',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_player_otx (player_id, original_transaction_id),
  KEY idx_otx (original_transaction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS asn_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  notification_uuid CHAR(36) NOT NULL,
  notification_type VARCHAR(48) NOT NULL,
  subtype VARCHAR(48) NULL,
  environment VARCHAR(16) NULL,
  original_transaction_id VARCHAR(64) NULL,
  signed_payload MEDIUMTEXT NOT NULL,
  received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_uuid (notification_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(32) NOT NULL,
  props VARCHAR(2048) NULL,
  app_version VARCHAR(32) NULL,
  client_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_name_time (name, created_at),
  KEY idx_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
