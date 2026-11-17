import { Gender, QuestionItem } from '@/types/game';

export const QUESTION_BANK: QuestionItem[] = [
  // KETAKUTAN HIDUP (7)
  {
    id: 'q1',
    category: 'Ketakutan Hidup',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Gua sering ngerasa hidup gua jalan di tempat, sementara temen-temen seumuran udah pada mapan atau nikah.',
    consequenceSeed: 'Pasangan butuh validasi emosional tiap kali overthinking soal pencapaian hidup.',
  },
  {
    id: 'q2',
    category: 'Ketakutan Hidup',
    genderTarget: 'Laki-laki',
    ageTarget: '18-25',
    statement: 'Gua takut banget gagal secara finansial sebelum umur 30 dan dianggap nggak punya masa depan.',
    consequenceSeed: 'Dia bakal kerja rodi ngejar karier dan waktu pacaran kalian bakal sering dikorbankan.',
  },
  {
    id: 'q3',
    category: 'Ketakutan Hidup',
    genderTarget: 'Perempuan',
    ageTarget: '18-25',
    statement: 'Gua sering ngerasa nggak cukup menarik atau nggak cukup berprestasi kalau dibandingin sama standar di media sosial.',
    consequenceSeed: 'Kamu harus siap ngasih reassurance terus-menerus tiap dia lagi insecure.',
  },
  {
    id: 'q4',
    category: 'Ketakutan Hidup',
    genderTarget: 'Laki-laki',
    ageTarget: '26-35',
    statement: 'Gua takut nggak sanggup jadi tulang punggung keluarga sendiri karena masih harus nanggung beban ekonomi orang tua (sandwich generation).',
    consequenceSeed: 'Sebagian besar penghasilan rumah tangga kalian nanti wajib dialokasikan ke keluarga besarnya.',
  },
  {
    id: 'q5',
    category: 'Ketakutan Hidup',
    genderTarget: 'Perempuan',
    ageTarget: '26-35',
    statement: 'Gua takut salah pilih pasangan cuma karena dikejar umur dan tekanan pertanyaan keluarga soal kapan nikah.',
    consequenceSeed: 'Kamu harus siap menerima kenyataan bahwa dia mungkin milih kamu sebagian karena faktor dikejar waktu.',
  },
  {
    id: 'q6',
    category: 'Ketakutan Hidup',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Jauh di lubuk hati, gua takut kalau orang yang paling gua sayang tahu sisi tergelap gua, dia bakal pergi.',
    consequenceSeed: 'Kamu bakal berhadapan sama trauma masa lalu yang belum tentu selesai sepenuhnya.',
  },
  {
    id: 'q7',
    category: 'Ketakutan Hidup',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Gua lebih takut kesepian sendirian daripada terjebak di hubungan yang sebenarnya udah nggak sehat.',
    consequenceSeed: 'Hubungan ini berisiko jalan karena ketergantungan emosional, bukan murni karena sehat.',
  },

  // KEBIASAAN BURUK (7)
  {
    id: 'q8',
    category: 'Kebiasaan Buruk',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Kalau lagi stres atau capek mental, pelarian gua adalah belanja impulsif atau jajan mahal walau saldo lagi sekarat.',
    consequenceSeed: 'Tabungan bersama atau dana darurat kalian rawan jebol tiap dia lagi stres kerja.',
  },
  {
    id: 'q9',
    category: 'Kebiasaan Buruk',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Gua sering doomscrolling sampai subuh, terus besoknya ngeluh capek dan nunda semua kerjaan penting.',
    consequenceSeed: 'Jadwal kencan atau urusan penting kalian bakal sering molor karena jam tidurnya berantakan.',
  },
  {
    id: 'q10',
    category: 'Kebiasaan Buruk',
    genderTarget: 'Laki-laki',
    ageTarget: '18-25',
    statement: 'Kalau udah keasyikan main game, nongkrong, atau hobi, gua bisa ngilang berjam-jam tanpa ngabarin pasangan.',
    consequenceSeed: 'Chat kamu bakal sering di-read atau tidak dibalas berjam-jam tanpa penjelasan.',
  },
  {
    id: 'q11',
    category: 'Kebiasaan Buruk',
    genderTarget: 'Perempuan',
    ageTarget: '18-25',
    statement: 'Gua sering bilang "terserah" atau "aku gapapa", padahal dalam hati ngarep pasangan peka dan nebak sendiri maunya gua apa.',
    consequenceSeed: 'Kamu dituntut jadi pembaca pikiran dan siap disalahkan kalau tebakanmu meleset.',
  },
  {
    id: 'q12',
    category: 'Kebiasaan Buruk',
    genderTarget: 'Laki-laki',
    ageTarget: '26-35',
    statement: 'Kalau lagi ada masalah berat di kerjaan, gua milih nutup diri dan diem seharian daripada cerita ke pasangan.',
    consequenceSeed: 'Kamu harus tahan rasa dicuekin dan tidak boleh memaksa dia cerita sebelum dia siap.',
  },
  {
    id: 'q13',
    category: 'Kebiasaan Buruk',
    genderTarget: 'Perempuan',
    ageTarget: '26-35',
    statement: 'Gua punya kebiasaan nge-stalk masa lalu pasangan atau mantan-mantannya sampai bikin mood gua sendiri rusak.',
    consequenceSeed: 'Jejak digital dan privasi media sosialmu bakal selalu diaudit diam-diam.',
  },
  {
    id: 'q14',
    category: 'Kebiasaan Buruk',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Gua gampang tergiur cicilan atau paylater demi gaya hidup yang sebenernya di luar kemampuan gaji gua.',
    consequenceSeed: 'Kamu berpotensi ikut menanggung beban cicilan konsumtif saat kalian sudah serumah.',
  },

  // SIFAT JELEK & RED FLAG EGO (6)
  {
    id: 'q15',
    category: 'Sifat Jelek',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Kalau lagi berantem, gua lebih milih menang debat dan nyari siapa yang salah daripada nyari solusi bareng.',
    consequenceSeed: 'Setiap pertengkaran bakal berubah jadi ruang sidang di mana kamu harus siap kalah argumen.',
  },
  {
    id: 'q16',
    category: 'Sifat Jelek',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Gua sering ngasih silent treatment (mendiamkan pasangan) berhari-hari daripada ngomongin masalahnya secara dewasa.',
    consequenceSeed: 'Kamu bakal didiamkan berhari-hari dalam suasana dingin setiap kali ada konflik.',
  },
  {
    id: 'q17',
    category: 'Sifat Jelek',
    genderTarget: 'Laki-laki',
    ageTarget: '18-35',
    statement: 'Gua susah banget minta maaf duluan, bahkan di saat gua sadar kalau gua yang salah.',
    consequenceSeed: 'Kamu hampir selalu harus jadi pihak yang menurunkan ego dan minta maaf duluan.',
  },
  {
    id: 'q18',
    category: 'Sifat Jelek',
    genderTarget: 'Perempuan',
    ageTarget: '18-35',
    statement: 'Gua gampang ngungkit-ngungkit kesalahan lama pasangan tiap kali kita lagi ribut soal masalah baru.',
    consequenceSeed: 'Kesalahanmu setahun lalu bakal terus disimpan dan dipakai sebagai senjata saat ribut.',
  },
  {
    id: 'q19',
    category: 'Sifat Jelek',
    genderTarget: 'universal',
    ageTarget: '26-35',
    statement: 'Gua gampang ilfeel dan pengen kabur menjauh begitu hubungan mulai masuk fase serius atau ngebosenin.',
    consequenceSeed: 'Kamu harus siap menghadapi fase di mana dia tiba-tiba dingin tanpa alasan jelas.',
  },
  {
    id: 'q20',
    category: 'Sifat Jelek',
    genderTarget: 'universal',
    ageTarget: '18-35',
    statement: 'Gua sering terlalu ngatur dan nuntut pasangan berubah sesuai standar gua, tapi gua sendiri ogah dikritik.',
    consequenceSeed: 'Kebebasan pribadimu bakal dibatasi standar ganda yang dia buat sendiri.',
  },
];

export function getQuestionsForProfile(gender: Gender, age: number): QuestionItem[] {
  const ageGroup = age <= 25 ? '18-25' : '26-35';
  const prioritized = QUESTION_BANK.filter(
    (q) =>
      (q.genderTarget === 'universal' || q.genderTarget === gender) &&
      (q.ageTarget === '18-35' || q.ageTarget === ageGroup)
  );
  const remaining = QUESTION_BANK.filter((q) => !prioritized.some((p) => p.id === q.id));
  return [...prioritized, ...remaining].slice(0, 20);
}
