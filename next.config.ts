import type { NextConfig } from 'next'

/**
 * ★★ Content Security Policy
 *
 *    เว็บนี้ฝัง iframe ของ YouTube ซึ่งต้องเปิดช่องให้ youtube.com โดยเฉพาะ
 *    การเปิดช่องนั้น "อย่างแคบที่สุดเท่าที่จะทำได้" คือสาระสำคัญของ CSP นี้
 *
 *    จุดที่ต้องยอมผ่อน:
 *      script-src 'unsafe-inline'  — Next.js inject script สำหรับ hydration
 *      style-src  'unsafe-inline'  — Tailwind + styled-jsx ใส่ style ใน HTML
 *
 *    จุดที่ปิดแน่น:
 *      frame-src    เฉพาะ youtube.com — ฝัง iframe จากที่อื่นไม่ได้
 *      connect-src  เฉพาะ self + supabase — ส่งข้อมูลออกไปที่อื่นไม่ได้
 *                   (ข้อนี้คือด่านที่ทำให้ XSS ขโมยข้อมูลส่งออกไม่ได้)
 *      object-src   none — ปิด <object>/<embed> ที่เป็นช่องเก่าแก่ของ XSS
 *      frame-ancestors none — เว็บอื่นเอาเราไปใส่ iframe ไม่ได้ (กัน clickjacking)
 */
const SUPABASE_HOST = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/**
 * ★ React dev mode ใช้ eval() สำหรับเครื่องมือ debug (source map, callstack ข้าม environment)
 *   production ไม่ใช้เลย จึงเปิดช่องนี้เฉพาะตอน dev
 *
 *   ถ้าใส่ตลอดจะทำให้ CSP อ่อนลงอย่างมีนัยสำคัญบน production โดยไม่ได้ประโยชน์อะไร
 *   (เจอตอนทดสอบ E2E — console เต็มไปด้วย error ว่า eval ถูกบล็อก)
 */
const allowEval = process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${allowEval} https://www.youtube.com https://s.ytimg.com`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://i.ytimg.com https://yt3.ggpht.com https://*.ytimg.com ${SUPABASE_HOST}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_HOST.replace('https://', 'wss://')} https://www.youtube.com`,
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "media-src 'self' https://*.googlevideo.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    /**
     * ★ whitelist เฉพาะ thumbnail ของ YouTube
     * ถ้าไม่จำกัด host จะกลายเป็นช่องให้คนอื่นใช้ image optimizer ของเรา
     * proxy รูปจากที่ไหนก็ได้ (เปลืองเงิน + เสี่ยง SSRF)
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'i.ytimg.com', pathname: '/vi/**' },
      { protocol: 'https', hostname: 'yt3.ggpht.com' },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // กันเบราว์เซอร์เดาชนิดไฟล์เอง ซึ่งเปิดช่องให้ไฟล์ที่ผู้ใช้อัปโหลดถูกรันเป็นสคริปต์
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // ไม่ส่ง URL ของห้อง (ซึ่งมีรหัสห้องอยู่) ไปให้เว็บอื่นตอนผู้ใช้กดลิงก์ออก
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // เว็บนี้ไม่ต้องใช้สิทธิ์พวกนี้เลย ปิดทิ้งให้หมด
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // ★ API ต้องไม่ถูก cache ที่ CDN เด็ดขาด
        //   ถ้า CDN cache คำตอบของผู้ใช้คนหนึ่งไว้ ผู้ใช้อีกคนอาจได้ข้อมูลห้อง
        //   ที่ตัวเองไม่มีสิทธิ์เห็น — และ rate limit จะไม่ถูกนับเพราะ request
        //   ไม่เคยมาถึง server
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'X-Robots-Tag', value: 'noindex' },
        ],
      },
    ]
  },

  // ไม่ให้ build ผ่านทั้งที่ type ผิด — production-oriented
  typescript: { ignoreBuildErrors: false },
}

export default nextConfig
