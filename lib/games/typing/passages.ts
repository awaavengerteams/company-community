/**
 * คลังข้อความแข่งพิมพ์ดีด — ภาษาละ 55 ข้อความ (สั้น 30 · กลาง 25)
 *
 * ★★ เขียนขึ้นใหม่ทั้งหมด ไม่มีเนื้อหาที่มีลิขสิทธิ์ — ประโยคทั่วไปที่อ่านลื่น
 *
 * ★★★ อักขระที่ใช้ถูกจำกัดโดยตั้งใจ
 *     อังกฤษ: ตัวอักษร เว้นวรรค จุลภาค จุด เท่านั้น
 *       ★ ไม่มี ' หรือ " — iOS "Smart Punctuation" เปลี่ยนเป็น ’ ” ให้เอง
 *         แม้ปิด autocorrect แล้ว คนที่พิมพ์ถูกจะโดนนับว่าผิดโดยไม่รู้ตัว
 *     ไทย: ตัวอักษรไทย ไม้ยมก และเว้นวรรค ไม่มีเลขไทย ไม่มีเครื่องหมายวรรคตอนอื่น
 *       ★ ทุกตัวพิมพ์ได้จากคีย์บอร์ดไทยมาตรฐานของ iOS/Android โดยไม่ต้องสลับหน้า
 *
 * ★ ห้ามแก้ข้อความเดิม/สลับลำดับ — ห้องที่แข่งค้างอยู่อ้างอิงด้วยลำดับ (index)
 *   เพิ่มได้ต่อท้ายเท่านั้น
 */

export type TypingLang = 'th' | 'en'
export type TypingLength = 'short' | 'medium'

const TH_SHORT = [
  'เช้านี้ฝนตกเบา ๆ ทำให้อากาศเย็นสบายกว่าทุกวัน',
  'กาแฟแก้วแรกของวันช่วยให้สมองตื่นตัวพร้อมทำงาน',
  'อย่าลืมดื่มน้ำให้เพียงพอระหว่างวันนะ',
  'ทีมของเราประชุมสั้น ๆ ทุกเช้าวันจันทร์',
  'แมวตัวน้อยนอนหลับอยู่บนโซฟาสีเทา',
  'ร้านข้าวมันไก่หน้าซอยคนต่อคิวยาวทุกเที่ยง',
  'เขาเดินขึ้นบันไดแทนลิฟต์เพื่อออกกำลังกาย',
  'ต้นไม้ในกระถางริมหน้าต่างเริ่มออกดอกแล้ว',
  'เสียงหัวเราะดังมาจากห้องประชุมเล็ก',
  'วันศุกร์นี้เราจะไปกินหมูกระทะด้วยกัน',
  'ลมหนาวพัดผ่านมาพร้อมกลิ่นดอกไม้',
  'โปรดปิดไฟและแอร์ก่อนออกจากห้อง',
  'หนังสือเล่มนี้อ่านสนุกจนวางไม่ลง',
  'เธอยิ้มให้ทุกคนที่เดินผ่านโต๊ะของเธอ',
  'รถติดมากในช่วงเย็นของวันที่ฝนตก',
  'พรุ่งนี้มีประชุมกับลูกค้าตอนสิบโมงเช้า',
  'ขนมปังอบใหม่หอมไปทั่วทั้งร้าน',
  'เด็ก ๆ วิ่งเล่นกันอย่างสนุกในสวนสาธารณะ',
  'เราควรสำรองข้อมูลสำคัญไว้เสมอ',
  'ทะเลสีฟ้าใสสะท้อนแสงแดดยามบ่าย',
  'คุณแม่ทำต้มยำกุ้งรสชาติจัดจ้านมาก',
  'นกสองตัวเกาะอยู่บนสายไฟหน้าบ้าน',
  'การฝึกพิมพ์ทุกวันช่วยให้มือคล่องขึ้น',
  'ห้องนี้เงียบจนได้ยินเสียงนาฬิกาเดิน',
  'เขาลืมร่มไว้ที่ร้านกาแฟอีกแล้ว',
  'ช่วงเย็นแสงอาทิตย์เป็นสีส้มสวยงาม',
  'ทุกคนช่วยกันเก็บโต๊ะหลังงานเลี้ยง',
  'เพลงนี้ฟังแล้วรู้สึกผ่อนคลายดี',
  'น้องหมาวิ่งมารับที่หน้าประตูทุกวัน',
  'วันหยุดยาวนี้หลายคนกลับบ้านต่างจังหวัด',
]

const TH_MEDIUM = [
  'เช้าวันจันทร์ทุกคนมาถึงออฟฟิศพร้อมกาแฟในมือ บางคนยังง่วงอยู่เล็กน้อย แต่พอเริ่มประชุมทีมทุกคนก็ตื่นตัวและพร้อมทำงาน',
  'ร้านอาหารตามสั่งหน้าซอยเปิดมานานกว่ายี่สิบปี เจ้าของร้านจำเมนูประจำของลูกค้าได้แทบทุกคน จึงมีคนแวะมากินไม่ขาดสาย',
  'การวางแผนงานล่วงหน้าช่วยลดความเครียดได้มาก เมื่อรู้ว่าต้องทำอะไรก่อนหลัง เราจะใช้เวลาได้คุ้มค่าและมีเวลาพักผ่อนมากขึ้น',
  'ฝนตกหนักตั้งแต่บ่ายจนถึงค่ำ ถนนหลายสายมีน้ำขัง พนักงานหลายคนจึงตัดสินใจรอให้ฝนหยุดก่อนค่อยเดินทางกลับบ้าน',
  'สวนสาธารณะใกล้บ้านมีคนมาออกกำลังกายทุกเย็น บางคนวิ่งรอบสระน้ำ บางคนเล่นแบดมินตัน และมีเด็ก ๆ ปั่นจักรยานกันอย่างสนุก',
  'ทีมของเราตั้งเป้าว่าจะส่งงานให้ลูกค้าภายในสิ้นเดือนนี้ ทุกคนจึงช่วยกันตรวจรายละเอียดอย่างตั้งใจ เพื่อให้งานออกมาดีที่สุด',
  'เมื่อวานเราไปเที่ยวตลาดน้ำกันทั้งแผนก อากาศดีมาก ของกินก็อร่อย ทุกคนถ่ายรูปกันเยอะจนแบตโทรศัพท์แทบหมด',
  'การอ่านหนังสือก่อนนอนวันละนิดช่วยให้หลับง่ายขึ้น ทั้งยังได้ความรู้ใหม่ ๆ และช่วยลดเวลาที่ใช้หน้าจอโทรศัพท์ไปในตัว',
  'คุณยายปลูกผักสวนครัวไว้หลังบ้านหลายชนิด ทั้งพริก กะเพรา และมะนาว เวลาทำกับข้าวจึงเดินไปเก็บสด ๆ ได้ทุกวัน',
  'ห้องสมุดของบริษัทมีหนังสือใหม่เข้ามาทุกเดือน ใครอยากยืมก็เขียนชื่อไว้ในสมุด แล้วนำมาคืนภายในสองสัปดาห์',
  'ช่วงปลายปีอากาศเริ่มเย็นลง หลายคนวางแผนไปเที่ยวภาคเหนือ เพื่อชมทะเลหมอกและสัมผัสลมหนาวบนยอดดอย',
  'น้องใหม่ในทีมปรับตัวได้เร็วมาก เขาถามเมื่อไม่เข้าใจและจดทุกอย่างไว้อย่างเป็นระบบ ไม่นานก็ทำงานได้ด้วยตัวเอง',
  'การประชุมที่ดีควรมีวาระชัดเจนและจบตรงเวลา ทุกคนควรรู้ว่าตัวเองต้องทำอะไรต่อ หลังจากออกจากห้องประชุมไปแล้ว',
  'ร้านกาแฟเล็ก ๆ ข้างออฟฟิศมีเมล็ดกาแฟจากหลายจังหวัด เจ้าของร้านชอบเล่าเรื่องที่มาของกาแฟแต่ละแก้วให้ลูกค้าฟัง',
  'วันเสาร์นี้มีงานวิ่งการกุศลในเมือง เพื่อนร่วมงานหลายคนสมัครไปด้วยกัน ทุกคนตั้งใจซ้อมวิ่งทุกเย็นมาตลอดเดือน',
  'การแยกขยะก่อนทิ้งไม่ใช่เรื่องยาก แค่แบ่งถังให้ชัดเจนว่าอันไหนรีไซเคิลได้ แล้วทำจนเป็นนิสัยทุกวัน',
  'ตอนเย็นเรามักเดินไปซื้อผลไม้ที่ตลาดใกล้สถานีรถไฟ แม่ค้าใจดีแถมให้เสมอ ผลไม้ก็สดและราคาไม่แพงเลย',
  'เมื่อคอมพิวเตอร์ทำงานช้า ลองปิดโปรแกรมที่ไม่ได้ใช้ และรีสตาร์ตเครื่องสักครั้ง ปัญหาส่วนใหญ่มักหายไปเอง',
  'งานเลี้ยงปีใหม่ของบริษัทปีนี้จัดในธีมย้อนยุค ทุกคนแต่งตัวกันสนุกมาก และมีการจับรางวัลจนถึงดึก',
  'การฟังอย่างตั้งใจเป็นทักษะที่สำคัญมาก เมื่อเราฟังจนจบก่อนตอบ เราจะเข้าใจอีกฝ่ายมากขึ้นและทำงานด้วยกันได้ราบรื่น',
  'ทุกเช้าคุณตาจะออกไปเดินเล่นริมคลองพร้อมสุนัขตัวโปรด ทั้งสองเดินช้า ๆ ทักทายเพื่อนบ้านไปตลอดทาง',
  'โครงการใหม่ของเราต้องใช้ความร่วมมือจากหลายแผนก จึงต้องสื่อสารให้ชัดเจนตั้งแต่ต้น เพื่อไม่ให้งานซ้ำซ้อนกัน',
  'ช่วงพักเที่ยงหลายคนชอบนั่งคุยกันที่โต๊ะยาวในห้องครัว บางวันก็มีคนนำขนมมาแบ่งกันกิน บรรยากาศจึงเป็นกันเองมาก',
  'การนอนหลับให้เพียงพอช่วยให้ร่างกายฟื้นตัว สมองจำเรื่องต่าง ๆ ได้ดีขึ้น และทำให้อารมณ์ดีตลอดทั้งวัน',
  'ถ้าเราฝึกพิมพ์โดยไม่มองแป้นทุกวันวันละไม่กี่นาที ไม่นานก็จะพิมพ์ได้เร็วและแม่นยำขึ้นอย่างเห็นได้ชัด',
]

const EN_SHORT = [
  'The morning rain made the whole city feel calm and quiet.',
  'Please remember to save your work before you leave.',
  'A cup of warm tea is the best way to start the day.',
  'Our team meets every Monday to plan the week ahead.',
  'The little cat fell asleep on the soft gray sofa.',
  'She always smiles at everyone who walks past her desk.',
  'Fresh bread from the corner bakery smells wonderful.',
  'He took the stairs instead of the elevator today.',
  'The plants by the window are finally starting to bloom.',
  'We should back up important files at least once a week.',
  'The children played happily in the park until sunset.',
  'Traffic is always slow on rainy Friday evenings.',
  'This book was so good that I read it in one night.',
  'Two small birds sat together on the garden fence.',
  'Turn off the lights and the fan before you go home.',
  'A short walk after lunch helps you feel more awake.',
  'The meeting room was quiet except for the ticking clock.',
  'Practice a little every day and your speed will grow.',
  'The sky turned orange and pink as the sun went down.',
  'Everyone helped clean the tables after the party.',
  'My neighbor grows tomatoes and basil on her balcony.',
  'The new coffee machine makes a very strong espresso.',
  'Good notes make it easy to remember what you learned.',
  'The dog waits by the door every evening for its owner.',
  'We booked a small cabin near the lake for the holiday.',
  'Clear goals help a team move in the same direction.',
  'The wind carried the sweet smell of flowers into the room.',
  'He forgot his umbrella at the cafe once again.',
  'A friendly hello can brighten the day of a coworker.',
  'The library is open late on Thursdays and Fridays.',
]

const EN_MEDIUM = [
  'Every Monday morning the office fills with the smell of fresh coffee. Some people are still sleepy, but by the time the team meeting starts everyone is ready to work.',
  'The small noodle shop near the station has been open for twenty years. The owner remembers what most regulars like to order, so the place is busy every day.',
  'Planning your work ahead of time can reduce a lot of stress. When you know what to do first, you use your time better and still have room to rest.',
  'It rained heavily from the afternoon until late evening. Many streets were flooded, so most of us decided to wait in the office until the rain stopped.',
  'The park near my home is full of people every evening. Some jog around the pond, some play badminton, and children ride their bikes along the paths.',
  'Our team plans to deliver the project before the end of the month. Everyone is checking the details carefully, because we want the final result to be our best work.',
  'Last weekend the whole department visited a floating market. The weather was lovely, the food was delicious, and we took so many photos that our phones nearly died.',
  'Reading a few pages before bed can help you fall asleep faster. It also teaches you something new and keeps you away from bright screens at night.',
  'My grandmother grows vegetables behind her house, including chili, basil, and lime. When she cooks, she simply walks outside and picks what she needs.',
  'The company library gets new books every month. If you want to borrow one, write your name in the notebook and return it within two weeks.',
  'At the end of the year the weather becomes cooler. Many people plan trips to the mountains to see the sea of fog and feel the fresh morning air.',
  'The newest member of our team learns very quickly. He asks questions when something is unclear and keeps careful notes, so he can now work on his own.',
  'A good meeting has a clear agenda and finishes on time. When people leave the room, each of them should know exactly what they need to do next.',
  'The little cafe next to our office sells beans from many different farms. The owner enjoys telling customers where each cup of coffee comes from.',
  'There is a charity run in the city this Saturday. Several coworkers signed up together, and they have been practicing every evening for a month.',
  'Sorting your trash before throwing it away is not difficult. Use clearly marked bins for paper, plastic, and glass, and soon it becomes a daily habit.',
  'After work we often buy fruit at the market near the train station. The seller is kind and usually adds a little extra, and the fruit is always fresh.',
  'When your computer feels slow, close the programs you are not using and restart it once. Most small problems disappear after a simple restart.',
  'This year the company party had a retro theme. Everyone dressed up in old fashioned clothes, and the prize draw went on until late at night.',
  'Listening carefully is one of the most useful skills at work. When you let others finish before you reply, you understand them better and work together more smoothly.',
  'Every morning my grandfather walks along the canal with his favorite dog. They move slowly and stop to greet the neighbors along the way.',
  'Our new project needs help from several departments. That is why we must communicate clearly from the start, so that nobody does the same work twice.',
  'During lunch break many of us sit together at the long table in the kitchen. Sometimes a colleague brings snacks to share, which makes the place feel like home.',
  'Getting enough sleep helps your body recover and your mind remember things. It also keeps you in a better mood for the rest of the day.',
  'If you practice typing without looking at the keys for a few minutes every day, you will soon notice that you are faster and make fewer mistakes.',
]

const BANK: Record<TypingLang, Record<TypingLength, string[]>> = {
  th: { short: TH_SHORT, medium: TH_MEDIUM },
  en: { short: EN_SHORT, medium: EN_MEDIUM },
}

export function passageCount(lang: TypingLang, length: TypingLength): number {
  return BANK[lang][length].length
}

/** ข้อความตามลำดับ — ลำดับนอกช่วงวนกลับมาเริ่มใหม่ (ไม่ทำให้หน้าพัง) */
export function passageOf(lang: TypingLang, length: TypingLength, index: number): string {
  const list = BANK[lang][length]
  return list[((index % list.length) + list.length) % list.length]!
}

/** สุ่มลำดับข้อความ — ★ ไม่ซ้ำกับข้อความก่อนหน้า (แข่งอีกรอบต้องได้ข้อความใหม่) */
export function randomPassage(lang: TypingLang, length: TypingLength, avoid: number | null = null): number {
  const n = passageCount(lang, length)
  let i = Math.floor(Math.random() * n)
  if (avoid !== null && n > 1 && i === avoid) i = (i + 1) % n
  return i
}

export const isLang = (v: unknown): v is TypingLang => v === 'th' || v === 'en'
export const isLength = (v: unknown): v is TypingLength => v === 'short' || v === 'medium'
