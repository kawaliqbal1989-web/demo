/**
 * Seed script: Create 7 new courses with course-levels for the DEFAULT tenant.
 *
 * Courses:
 *  1. Vedic Math
 *  2. Mental Math
 *  3. Handwriting Improvement
 *  4. General Knowledge
 *  5. English Grammar & Vocabulary
 *  6. Coding Basics
 *  7. AI Literacy
 *
 * Usage:
 *   node scripts/seed-new-courses.mjs
 *
 * Requires DATABASE_URL env var (or .env loaded by dotenv).
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const COURSES = [
  {
    code: "COURSE-VEDIC-MATH",
    name: "Vedic Math",
    description: "Ancient Indian mathematical techniques for lightning-fast calculations.",
    levels: [
      { levelNumber: 1, title: "Introduction & Sutras", sortOrder: 1 },
      { levelNumber: 2, title: "Addition & Subtraction Tricks", sortOrder: 2 },
      { levelNumber: 3, title: "Multiplication Techniques", sortOrder: 3 },
      { levelNumber: 4, title: "Division & Squares", sortOrder: 4 },
      { levelNumber: 5, title: "Cubes & Square Roots", sortOrder: 5 },
      { levelNumber: 6, title: "Advanced Applications", sortOrder: 6 }
    ]
  },
  {
    code: "COURSE-MENTAL-MATH",
    name: "Mental Math",
    description: "Build mental arithmetic speed and accuracy without pen-and-paper.",
    levels: [
      { levelNumber: 1, title: "Number Sense & Estimation", sortOrder: 1 },
      { levelNumber: 2, title: "Rapid Addition & Subtraction", sortOrder: 2 },
      { levelNumber: 3, title: "Mental Multiplication", sortOrder: 3 },
      { levelNumber: 4, title: "Mental Division & Fractions", sortOrder: 4 },
      { levelNumber: 5, title: "Mixed Operations Challenge", sortOrder: 5 }
    ]
  },
  {
    code: "COURSE-HANDWRITING",
    name: "Handwriting Improvement",
    description: "Improve handwriting legibility, speed, and style for all age groups.",
    levels: [
      { levelNumber: 1, title: "Posture & Grip Basics", sortOrder: 1 },
      { levelNumber: 2, title: "Letter Formation (Print)", sortOrder: 2 },
      { levelNumber: 3, title: "Cursive Foundations", sortOrder: 3 },
      { levelNumber: 4, title: "Speed & Fluency", sortOrder: 4 },
      { levelNumber: 5, title: "Creative Writing Style", sortOrder: 5 }
    ]
  },
  {
    code: "COURSE-GK",
    name: "General Knowledge",
    description: "Broaden awareness of science, geography, history, current affairs, and more.",
    levels: [
      { levelNumber: 1, title: "World Around Us", sortOrder: 1 },
      { levelNumber: 2, title: "Science & Nature", sortOrder: 2 },
      { levelNumber: 3, title: "History & Culture", sortOrder: 3 },
      { levelNumber: 4, title: "Geography & Environment", sortOrder: 4 },
      { levelNumber: 5, title: "Current Affairs & Quiz Master", sortOrder: 5 }
    ]
  },
  {
    code: "COURSE-ENGLISH",
    name: "English Grammar & Vocabulary",
    description: "Structured English learning covering grammar rules, vocabulary building, and writing.",
    levels: [
      { levelNumber: 1, title: "Parts of Speech", sortOrder: 1 },
      { levelNumber: 2, title: "Sentence Structure", sortOrder: 2 },
      { levelNumber: 3, title: "Tenses & Voice", sortOrder: 3 },
      { levelNumber: 4, title: "Vocabulary Building", sortOrder: 4 },
      { levelNumber: 5, title: "Comprehension & Writing", sortOrder: 5 },
      { levelNumber: 6, title: "Advanced Grammar & Composition", sortOrder: 6 }
    ]
  },
  {
    code: "COURSE-CODING",
    name: "Coding Basics",
    description: "Introduction to programming concepts using block-based and text-based approaches.",
    levels: [
      { levelNumber: 1, title: "What is Coding?", sortOrder: 1 },
      { levelNumber: 2, title: "Sequences & Loops", sortOrder: 2 },
      { levelNumber: 3, title: "Conditions & Logic", sortOrder: 3 },
      { levelNumber: 4, title: "Variables & Functions", sortOrder: 4 },
      { levelNumber: 5, title: "Build a Mini Project", sortOrder: 5 }
    ]
  },
  {
    code: "COURSE-AI-LITERACY",
    name: "AI Literacy",
    description: "Understand the basics of Artificial Intelligence, machine learning, and responsible AI use.",
    levels: [
      { levelNumber: 1, title: "What is AI?", sortOrder: 1 },
      { levelNumber: 2, title: "How Machines Learn", sortOrder: 2 },
      { levelNumber: 3, title: "AI in Daily Life", sortOrder: 3 },
      { levelNumber: 4, title: "Ethics & Responsible AI", sortOrder: 4 },
      { levelNumber: 5, title: "Hands-on AI Exploration", sortOrder: 5 }
    ]
  }
];

async function main() {
  // Find or create the DEFAULT tenant
  const tenant = await prisma.tenant.findUnique({ where: { code: "DEFAULT" } });
  if (!tenant) {
    console.error("DEFAULT tenant not found. Run the main seed first.");
    process.exit(1);
  }

  console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

  for (const courseDef of COURSES) {
    const course = await prisma.course.upsert({
      where: {
        tenantId_code: {
          tenantId: tenant.id,
          code: courseDef.code
        }
      },
      update: {
        name: courseDef.name,
        description: courseDef.description,
        isActive: true
      },
      create: {
        tenantId: tenant.id,
        code: courseDef.code,
        name: courseDef.name,
        description: courseDef.description,
        isActive: true
      }
    });

    console.log(`✅ Course: ${course.name} (${course.id})`);

    for (const lvl of courseDef.levels) {
      await prisma.courseLevel.upsert({
        where: {
          courseId_levelNumber: {
            courseId: course.id,
            levelNumber: lvl.levelNumber
          }
        },
        update: {
          title: lvl.title,
          sortOrder: lvl.sortOrder,
          isActive: true
        },
        create: {
          tenantId: tenant.id,
          courseId: course.id,
          levelNumber: lvl.levelNumber,
          title: lvl.title,
          sortOrder: lvl.sortOrder,
          isActive: true
        }
      });

      console.log(`   Level ${lvl.levelNumber}: ${lvl.title}`);
    }

    console.log("");
  }

  console.log("🎉 All 7 courses seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
