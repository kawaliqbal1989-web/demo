-- Widen BusinessPartner.logoUrl to TEXT to support longer URLs (e.g., CDN/signed URLs).
ALTER TABLE `BusinessPartner` MODIFY `logoUrl` TEXT NULL;
