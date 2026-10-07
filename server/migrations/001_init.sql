-- Temple of the High Priestess API schema (MySQL 8 / MariaDB 10.6+). Applied in order by src/db.js.

CREATE TABLE IF NOT EXISTS players (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  public_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_players_public (public_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per install id. The id + secret live in the iCloud-synced Keychain, so a player's
-- devices on the same Apple ID share it (and their progress).
CREATE TABLE IF NOT EXISTS devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  install_id CHAR(36) NOT NULL,
  player_id BIGINT UNSIGNED NOT NULL,
  secret_hash CHAR(64) NOT NULL,
  app_version VARCHAR(32) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_devices_install (install_id),
  KEY idx_devices_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tokens (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  device_id BIGINT UNSIGNED NOT NULL,
  player_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_tokens_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- data is the exact JSON string the game keeps in its save slot.
CREATE TABLE IF NOT EXISTS saves (
  player_id BIGINT UNSIGNED NOT NULL,
  slot VARCHAR(8) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  data MEDIUMTEXT NOT NULL,
  summary TEXT NULL,
  game_version VARCHAR(32) NULL,
  device_id BIGINT UNSIGNED NULL,
  client_updated_at TIMESTAMP(3) NULL,
  server_updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (player_id, slot)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Every replaced revision (last 10 per slot kept) so a bad conflict choice can be rolled back.
CREATE TABLE IF NOT EXISTS save_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  player_id BIGINT UNSIGNED NOT NULL,
  slot VARCHAR(8) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  data MEDIUMTEXT NOT NULL,
  summary TEXT NULL,
  device_id BIGINT UNSIGNED NULL,
  replaced_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_hist_slot (player_id, slot, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  player_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Server-driven content. A base is a published snapshot of the bundled content (from the repo);
-- overrides are JSON Merge Patches edited by the owner, applied on top of whichever base a client uses.
CREATE TABLE IF NOT EXISTS content_bases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  hash VARCHAR(16) NOT NULL,
  body LONGTEXT NOT NULL,
  assets MEDIUMTEXT NOT NULL,
  source TEXT NULL,
  published_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_content_hash (hash),
  KEY idx_content_published (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS content_overrides (
  version INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  body MEDIUMTEXT NOT NULL,
  note VARCHAR(255) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
