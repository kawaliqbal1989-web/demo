-- Migration: Add AiCustomTool table for student-created custom AI tools
-- Safe to run: additive only, no existing table changes

CREATE TABLE IF NOT EXISTS `AiCustomTool` (
  `id` varchar(30) NOT NULL,
  `tenantId` varchar(30) NOT NULL,
  `studentId` varchar(30) NOT NULL,
  `toolName` varchar(50) NOT NULL,
  `icon` varchar(10) NOT NULL DEFAULT '🔧',
  `title` varchar(100) NOT NULL,
  `description` varchar(300) NOT NULL,
  `systemPrompt` text NOT NULL,
  `placeholder` varchar(200) NOT NULL DEFAULT 'Type your input here...',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `AiCustomTool_tenantId_studentId_idx` (`tenantId`, `studentId`),
  KEY `AiCustomTool_studentId_fkey` (`studentId`),
  CONSTRAINT `AiCustomTool_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `Tenant` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `AiCustomTool_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
