-- =====================================================================
-- Cobr-AI - schema MySQL (compatível com phpMyAdmin)
-- =====================================================================
-- Para instalar:
--   1. Crie o banco no phpMyAdmin: CREATE DATABASE cobrai;
--   2. Importe este arquivo dentro do banco
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- Empresas (multi-tenant)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `plan` ENUM('free','starter','pro') DEFAULT 'free',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Usuários
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('owner','admin','operator') DEFAULT 'owner',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Configurações da empresa (régua, IA, limites)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings` (
  `company_id` INT PRIMARY KEY,
  `tone` ENUM('formal','amigavel','firme') DEFAULT 'amigavel',
  `max_discount` DECIMAL(5,2) DEFAULT 20.00,
  `max_installments` INT DEFAULT 6,
  `dunning_d1` INT DEFAULT 0,
  `dunning_d2` INT DEFAULT 3,
  `dunning_d3` INT DEFAULT 7,
  `send_window_start` TIME DEFAULT '09:00:00',
  `send_window_end` TIME DEFAULT '18:00:00',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Inadimplentes
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `debtors`;
CREATE TABLE `debtors` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(20) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `due_date` DATE NOT NULL,
  `installments` INT DEFAULT 1,
  `status` ENUM('nao_contatado','em_conversa','negociando','aguardando_pagamento','pago','ignorado')
            DEFAULT 'nao_contatado',
  `last_contact_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_company_phone` (`company_id`,`phone`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  INDEX `idx_status` (`status`),
  INDEX `idx_due_date` (`due_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Mensagens (histórico WhatsApp)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `messages`;
CREATE TABLE `messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `debtor_id` INT NOT NULL,
  `direction` ENUM('out','in') NOT NULL,
  `body` TEXT NOT NULL,
  `provider_id` VARCHAR(120),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`debtor_id`) REFERENCES `debtors`(`id`) ON DELETE CASCADE,
  INDEX `idx_debtor` (`debtor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Acordos / negociações
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `deals`;
CREATE TABLE `deals` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `debtor_id` INT NOT NULL,
  `original_amount` DECIMAL(12,2) NOT NULL,
  `final_amount` DECIMAL(12,2) NOT NULL,
  `discount_pct` DECIMAL(5,2) DEFAULT 0,
  `installments` INT DEFAULT 1,
  `due_date` DATE,
  `status` ENUM('proposto','aceito','recusado','pago') DEFAULT 'proposto',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`debtor_id`) REFERENCES `debtors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Pagamentos
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `payments`;
CREATE TABLE `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `debtor_id` INT NOT NULL,
  `deal_id` INT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `method` ENUM('pix','boleto','cartao') DEFAULT 'pix',
  `provider` VARCHAR(50) DEFAULT 'mock',
  `provider_id` VARCHAR(120),
  `link` VARCHAR(500),
  `status` ENUM('pendente','pago','cancelado') DEFAULT 'pendente',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `paid_at` TIMESTAMP NULL,
  FOREIGN KEY (`debtor_id`) REFERENCES `debtors`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- Régua de cobrança - log de envios automáticos
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS `dunning_log`;
CREATE TABLE `dunning_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `debtor_id` INT NOT NULL,
  `step` ENUM('d1','d2','d3') NOT NULL,
  `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_step` (`debtor_id`,`step`),
  FOREIGN KEY (`debtor_id`) REFERENCES `debtors`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- Seed inicial: a empresa demo + usuário demo são criados automaticamente
-- pelo backend no primeiro start (src/index.js -> bootstrapDemo).
-- Login: demo@cobrai.com / demo123
-- =====================================================================
