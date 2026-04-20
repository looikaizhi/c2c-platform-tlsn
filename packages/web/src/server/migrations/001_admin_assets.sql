-- Admin Console: Supported Asset Tables
-- Run once against your MySQL database to create the admin asset tables.
--
-- Usage:
--   mysql -u root -p c2c < packages/web/src/server/migrations/001_admin_assets.sql

-- Crypto asset table
-- crypto_id mirrors the on-chain index (SupportCryptoInfo.id from the contract).
CREATE TABLE IF NOT EXISTS support_crypto_assets (
    id            INT          NOT NULL AUTO_INCREMENT,
    crypto_id     INT          NOT NULL UNIQUE COMMENT 'On-chain index: supportCryptoList[crypto_id]',
    token_symbol  VARCHAR(20)  NOT NULL,
    token_address VARCHAR(42)  NOT NULL UNIQUE,
    is_active     TINYINT(1)   NOT NULL DEFAULT 0,
    edit_time     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,
    created_time  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fiat asset table
-- fiat_id mirrors the on-chain index (SupportFiatInfo.id from the contract).
CREATE TABLE IF NOT EXISTS support_fiat_assets (
    id           INT          NOT NULL AUTO_INCREMENT,
    fiat_id      INT          NOT NULL UNIQUE COMMENT 'On-chain index: supportFiatList[fiat_id]',
    fiat_name    VARCHAR(50)  NOT NULL UNIQUE,
    is_active    TINYINT(1)   NOT NULL DEFAULT 0,
    edit_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,
    created_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
