import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * ★ พารามิเตอร์ที่ขึ้นต้นด้วย _ = ตั้งใจไม่ใช้ ไม่ใช่ลืมลบ
       *
       *   เกิดกับฟังก์ชันที่ต้องคงรูปร่างไว้แม้ยังไม่ได้ใช้ค่าที่รับมา
       *   เช่น lib/room/permissions.ts ที่ตอนนี้คืน true ทุกกรณี
       *   แต่ยังรับ role/room ไว้เพื่อให้กลับไปแยกสิทธิ์ได้โดยแก้ที่เดียว
       */
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
