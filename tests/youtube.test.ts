import { parseIsoDuration, formatDuration } from '@/lib/youtube/duration'
import { extractVideoIdFromUrl, normalizeQuery, parseSearchInput } from '@/lib/youtube/video-id'
import { decodeHtmlEntities } from '@/lib/youtube/decode-entities'

let pass = 0, fail = 0
function eq(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${label}`) }
  else { fail++; console.log(`  \x1b[31m✗\x1b[0m ${label}\n      ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(expected)}`) }
}

console.log('\n\x1b[1mparseIsoDuration\x1b[0m')
eq('PT3M45S → 225',        parseIsoDuration('PT3M45S'), 225)
eq('PT1H2M3S → 3723',      parseIsoDuration('PT1H2M3S'), 3723)
eq('PT45S → 45',           parseIsoDuration('PT45S'), 45)
eq('PT1H → 3600',          parseIsoDuration('PT1H'), 3600)
eq('P1DT2H30M → 95400',    parseIsoDuration('P1DT2H30M'), 95400)
eq('PT4M13.5S → 253 (ปัดลง)', parseIsoDuration('PT4M13.5S'), 253)
eq('P0D (live) → null',    parseIsoDuration('P0D'), null)
eq('PT0S → null',          parseIsoDuration('PT0S'), null)
eq('"" → null',            parseIsoDuration(''), null)
eq('null → null',          parseIsoDuration(null), null)
eq('ขยะ → null',            parseIsoDuration('3:45'), null)
eq('P1Y → null (เป็นไปไม่ได้)', parseIsoDuration('P1Y'), null)

console.log('\n\x1b[1mformatDuration\x1b[0m')
eq('225 → 3:45',      formatDuration(225), '3:45')
eq('45 → 0:45',       formatDuration(45), '0:45')
eq('3723 → 1:02:03',  formatDuration(3723), '1:02:03')
eq('-5 → 0:00',       formatDuration(-5), '0:00')

console.log('\n\x1b[1mextractVideoIdFromUrl — ★ URL เท่านั้น ไม่เดาจากข้อความ\x1b[0m')
eq('watch?v=',        extractVideoIdFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
eq('youtu.be + ?t=',  extractVideoIdFromUrl('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ')
eq('m. + &list=',     extractVideoIdFromUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc'), 'dQw4w9WgXcQ')
eq('shorts',          extractVideoIdFromUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
eq('embed',           extractVideoIdFromUrl('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
eq('music.',          extractVideoIdFromUrl('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
eq('ไม่มี scheme',     extractVideoIdFromUrl('youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
eq('★ id เปล่า → null (ไม่ใช่ URL)', extractVideoIdFromUrl('dQw4w9WgXcQ'), null)
eq('★ คำค้นทั่วไป → null',           extractVideoIdFromUrl('bohemian rhapsody'), null)

console.log('\n\x1b[1mparseSearchInput — ★ ไม่เดา บอกว่ากำกวมแล้วให้ผู้เรียกลองทั้งสองทาง\x1b[0m')
eq('ลิงก์ → url (แน่นอน)',
   parseSearchInput('https://youtu.be/dQw4w9WgXcQ'), { kind: 'url', videoId: 'dQw4w9WgXcQ' })
eq('id เปล่า 11 ตัว → ambiguous',
   parseSearchInput('dQw4w9WgXcQ'), { kind: 'ambiguous', videoId: 'dQw4w9WgXcQ', query: 'dQw4w9WgXcQ' })
eq('★ คำค้น 11 ตัวพอดี → ambiguous ไม่ใช่ id',
   parseSearchInput('cant-stop-m'), { kind: 'ambiguous', videoId: 'cant-stop-m', query: 'cant-stop-m' })
eq('คำค้นมีช่องว่าง → query แน่นอน',
   parseSearchInput('bohemian rhapsody'), { kind: 'query', query: 'bohemian rhapsody' })
eq('ว่างเปล่า → null', parseSearchInput('   '), null)
eq('★ เว็บอื่น → null',       extractVideoIdFromUrl('https://evil.example/watch?v=dQw4w9WgXcQ'), null)
eq('★ vimeo → null',         extractVideoIdFromUrl('https://vimeo.com/12345'), null)
eq('id สั้นไป → null',        extractVideoIdFromUrl('https://youtu.be/short'), null)

console.log('\n\x1b[1mnormalizeQuery\x1b[0m')
eq('ยุบช่องว่าง+ตัวเล็ก', normalizeQuery('  Bohemian   RHAPSODY '), 'bohemian rhapsody')
eq('ตรงกันข้ามกัน',     normalizeQuery('bohemian rhapsody'), normalizeQuery(' BOHEMIAN  rhapsody '))

console.log('\n\x1b[1mdecodeHtmlEntities\x1b[0m')
eq('&amp;',    decodeHtmlEntities('Rock &amp; Roll'), 'Rock & Roll')
eq('&quot;',   decodeHtmlEntities('&quot;Live&quot;'), '"Live"')
eq('&#39;',    decodeHtmlEntities('it&#39;s'), "it's")
eq('ผสมหลายตัว', decodeHtmlEntities('A &amp; B &quot;C&quot; D&#39;E'), 'A & B "C" D\'E')
eq('&#x2764;', decodeHtmlEntities('love &#x2764;'), 'love ❤')
eq('★ ไม่รู้จัก → คงเดิม', decodeHtmlEntities('a &bogus; b'), 'a &bogus; b')
eq('★ script tag เป็นข้อความ', decodeHtmlEntities('&lt;script&gt;'), '<script>')

console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}\n`)
if (fail > 0) process.exit(1)
