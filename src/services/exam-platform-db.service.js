import { prisma } from "../lib/prisma.js";

let bootstrapPromise = null;

async function ensureExamPlatformTables() {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_subject (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(64) NOT NULL,
        description TEXT NULL,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_exam_subject_tenant_code (tenant_id, code),
        INDEX idx_exam_subject_tenant (tenant_id),
        INDEX idx_exam_subject_archived (tenant_id, is_archived)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_question_category (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_exam_question_category_tenant_name (tenant_id, name),
        INDEX idx_exam_question_category_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_question_difficulty (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        name VARCHAR(100) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_exam_question_difficulty_tenant_name (tenant_id, name),
        INDEX idx_exam_question_difficulty_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_question_tag (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        name VARCHAR(120) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_exam_question_tag_tenant_name (tenant_id, name),
        INDEX idx_exam_question_tag_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_question_bank (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        owner_role VARCHAR(40) NOT NULL,
        owner_user_id VARCHAR(191) NOT NULL,
        subject_id VARCHAR(191) NULL,
        level_id VARCHAR(191) NULL,
        topic VARCHAR(191) NULL,
        category_id VARCHAR(191) NULL,
        difficulty_id VARCHAR(191) NULL,
        question_type VARCHAR(64) NOT NULL,
        question_text TEXT NOT NULL,
        answer_text TEXT NULL,
        metadata_json LONGTEXT NULL,
        is_archived TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_exam_question_bank_tenant (tenant_id),
        INDEX idx_exam_question_bank_subject (tenant_id, subject_id),
        INDEX idx_exam_question_bank_level (tenant_id, level_id),
        INDEX idx_exam_question_bank_topic (tenant_id, topic),
        INDEX idx_exam_question_bank_archived (tenant_id, is_archived)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_question_option (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        question_id VARCHAR(191) NOT NULL,
        option_label VARCHAR(80) NULL,
        option_text TEXT NOT NULL,
        is_correct TINYINT(1) NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_exam_question_option_question (tenant_id, question_id),
        CONSTRAINT fk_exam_question_option_question FOREIGN KEY (question_id) REFERENCES exam_question_bank(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_builder (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(80) NOT NULL,
        description TEXT NULL,
        subject_id VARCHAR(191) NULL,
        level_id VARCHAR(191) NULL,
        duration_minutes INT NOT NULL,
        total_marks DECIMAL(8,2) NOT NULL,
        passing_marks DECIMAL(8,2) NOT NULL,
        selection_mode VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        created_by_user_id VARCHAR(191) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_exam_builder_tenant_code (tenant_id, code),
        INDEX idx_exam_builder_tenant (tenant_id),
        INDEX idx_exam_builder_status (tenant_id, status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_builder_section (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        exam_id VARCHAR(191) NOT NULL,
        section_name VARCHAR(80) NOT NULL,
        question_count INT NOT NULL,
        section_marks DECIMAL(8,2) NOT NULL,
        selection_mode VARCHAR(32) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_exam_builder_section_exam (tenant_id, exam_id),
        CONSTRAINT fk_exam_builder_section_exam FOREIGN KEY (exam_id) REFERENCES exam_builder(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_attempt (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        exam_id VARCHAR(191) NOT NULL,
        student_id VARCHAR(191) NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        submitted_at DATETIME NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'IN_PROGRESS',
        elapsed_seconds INT NOT NULL DEFAULT 0,
        autosave_json LONGTEXT NULL,
        marks_obtained DECIMAL(8,2) NULL,
        remarks TEXT NULL,
        moderation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        approval_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_exam_attempt_exam (tenant_id, exam_id),
        INDEX idx_exam_attempt_student (tenant_id, student_id),
        INDEX idx_exam_attempt_status (tenant_id, status),
        CONSTRAINT fk_exam_attempt_exam FOREIGN KEY (exam_id) REFERENCES exam_builder(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_result (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        exam_id VARCHAR(191) NOT NULL,
        student_id VARCHAR(191) NOT NULL,
        marks DECIMAL(8,2) NOT NULL,
        percentile DECIMAL(6,2) NOT NULL,
        grade VARCHAR(16) NOT NULL,
        pass_fail VARCHAR(16) NOT NULL,
        center_rank INT NULL,
        franchise_rank INT NULL,
        global_rank INT NULL,
        generated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_exam_result_unique (tenant_id, exam_id, student_id),
        INDEX idx_exam_result_exam (tenant_id, exam_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS exam_certificate (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        exam_id VARCHAR(191) NOT NULL,
        student_id VARCHAR(191) NOT NULL,
        certificate_type VARCHAR(40) NOT NULL,
        certificate_no VARCHAR(120) NOT NULL,
        pdf_url VARCHAR(500) NULL,
        issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(32) NOT NULL DEFAULT 'ISSUED',
        issue_version INT NOT NULL DEFAULT 1,
        UNIQUE KEY uq_exam_certificate_no (tenant_id, certificate_no),
        INDEX idx_exam_certificate_exam (tenant_id, exam_id),
        INDEX idx_exam_certificate_student (tenant_id, student_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS competition_builder (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(80) NOT NULL,
        description TEXT NULL,
        subject_id VARCHAR(191) NULL,
        level_id VARCHAR(191) NULL,
        stage VARCHAR(32) NOT NULL DEFAULT 'REGISTRATION',
        status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        starts_at DATETIME NULL,
        ends_at DATETIME NULL,
        created_by_user_id VARCHAR(191) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_competition_builder_tenant_code (tenant_id, code),
        INDEX idx_competition_builder_tenant (tenant_id),
        INDEX idx_competition_builder_stage (tenant_id, stage)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS competition_participant (
        id VARCHAR(191) PRIMARY KEY,
        tenant_id VARCHAR(191) NOT NULL,
        competition_id VARCHAR(191) NOT NULL,
        student_id VARCHAR(191) NOT NULL,
        stage VARCHAR(32) NOT NULL DEFAULT 'REGISTRATION',
        total_score DECIMAL(8,2) NOT NULL DEFAULT 0,
        rank_position INT NULL,
        medal_type VARCHAR(32) NULL,
        winner_title VARCHAR(120) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_competition_participant (tenant_id, competition_id, student_id),
        INDEX idx_competition_participant_comp (tenant_id, competition_id),
        CONSTRAINT fk_competition_participant_comp FOREIGN KEY (competition_id) REFERENCES competition_builder(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  })();

  try {
    await bootstrapPromise;
  } catch (error) {
    bootstrapPromise = null;
    throw error;
  }

  return bootstrapPromise;
}

export { ensureExamPlatformTables };
