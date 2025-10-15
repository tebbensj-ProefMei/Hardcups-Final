-- ProefMei MySQL schema (with NFC + auth)
CREATE DATABASE IF NOT EXISTS proefmei CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE proefmei;

CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number VARCHAR(8) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  address VARCHAR(300),
  nfc_code VARCHAR(64) UNIQUE
);

CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_key VARCHAR(32) NOT NULL UNIQUE,
  product_name VARCHAR(200) NOT NULL,
  units INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  product_key VARCHAR(32) NOT NULL,
  amount INT NOT NULL,
  tx_type ENUM('issue','return') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cust FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','medewerker','klant') NOT NULL DEFAULT 'medewerker',
  customer_id INT NULL,
  allowed_dashboards VARCHAR(255) NOT NULL DEFAULT 'dashboard'
);

CREATE TABLE IF NOT EXISTS coin_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  amount INT NOT NULL,
  recorded_by VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_coin_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
);
