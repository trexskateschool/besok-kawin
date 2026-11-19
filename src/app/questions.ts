export type DeckTheme = "standar" | "finansial" | "keluarga" | "privasi";

export interface QuestionItem {
  id: string;
  segmentLabel: string;
  category:
    | "Ketakutan Hidup"
    | "Kebiasaan Buruk"
    | "Prinsip Hubungan"
    | "Finansial"
    | "Keluarga & Mertua"
    | "Privasi & Masa Lalu";
  statement: string;
  partnerPrompt: string;
  consequenceQuestion: string;
  compromises: [string, string, string];
  botPref: {
    young: number;
    mid: number;
    mature: number;
  };
  targetGender?: "Laki-laki" | "Perempuan" | "all";
  targetAge?: "young" | "mid" | "mature" | "all";
}

export interface BrainSyncItem {
  id: string;
  scenario: string;
  options: [string, string, string];
  botPref: {
    young: number;
    mid: number;
    mature: number;
  };
}

export const DECK_THEME_META: Record<
  DeckTheme,
  { label: string; emoji: string; desc: string }
> = {
  standar: {
    label: "Dek Standar",
    emoji: "🔥",
    desc: "Campuran kebiasaan buruk, trauma, & prinsip hidup",
  },
  finansial: {
    label: "Finansial & Gaya Hidup",
    emoji: "💸",
    desc: "Utang, patungan rumah tangga, sandwich gen, & gengsi",
  },
  keluarga: {
    label: "Mertua & Keluarga",
    emoji: "🏠",
    desc: "Tinggal bareng ortu, campur tangan keluarga, & prioritas",
  },
  privasi: {
    label: "Privasi & Masa Lalu",
    emoji: "🔐",
    desc: "Akses HP, mantan belum kelar, & teman lawan jenis",
  },
};

export const BRAIN_SYNC_QUESTIONS: BrainSyncItem[] = [
  {
    id: "bs-1",
    scenario:
      "Lagi bertengkar hebat dan sama-sama capek kerja, siapa yang harus menurunkan ego duluan untuk minta maaf?",
    options: [
      "Aku yang ngalah duluan biar cepat selesai",
      "Pasangan yang harus mulai karena dia yang pemicunya",
      "Diam dulu sampai besok pagi baru bahas kepala dingin",
    ],
    botPref: { young: 1, mid: 2, mature: 0 },
  },
  {
    id: "bs-2",
    scenario:
      "Tiba-tiba ada kebutuhan darurat keluarga besar yang butuh dana besar di luar tabungan bersama. Keputusan akhirnya?",
    options: [
      "Bantu semaksimal mungkin meski tabungan pribadi terkuras",
      "Bantu sesuai batas wajar yang disepakati berdua saja",
      "Tolak halus kalau mengganggu cicilan & kebutuhan inti rumah",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "bs-3",
    scenario:
      "Setelah menikah, salah satu dapat tawaran karier impian tapi harus LDR beda kota minimal 2 tahun. Pilihan paling masuk akal?",
    options: [
      "Ambil peluangnya, kita jalani LDR dengan jadwal ketemu rutin",
      "Tolak tawarannya, pasangan suami-istri tidak boleh pisah kota",
      "Ikut pindah berdua walau pasangan harus resign dan mulai dari nol",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "bs-4",
    scenario:
      "Ketahuan pasangan masih menyimpan foto atau barang pemberian mantan di galeri/lemari lama. Reaksi paling jujur?",
    options: [
      "Minta hapus/buang detik itu juga di depan mata",
      "Bahas baik-baik kenapa masih disimpan tanpa langsung ngamuk",
      "Cuek aja selama di dunia nyata nggak pernah kontakan lagi",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
];

const STANDAR_QUESTIONS: QuestionItem[] = [
  {
    id: "std-01",
    segmentLabel: "Fase Emosi",
    category: "Kebiasaan Buruk",
    statement:
      "Gua kalau lagi marah atau kecewa seringnya diam seribu bahasa dan berharap pasangan peka sendiri.",
    partnerPrompt:
      "Dia sering diam seribu bahasa saat marah dan menuntut kamu peka tanpa dijelaskan.",
    consequenceQuestion:
      "Kalau tiap bertengkar kamu harus nebak-nebak isi kepalanya berhari-hari tanpa dia mau bicara duluan, kamu sanggup?",
    compromises: [
      "Beri waktu tenang maksimal 2 jam, setelah itu wajib cerita",
      "Pakai kode chat singkat kalau lagi nggak mood ngomong",
      "Biasakan langsung sebut inti masalah tanpa nunggu ditebak",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "std-02",
    segmentLabel: "Fase Emosi",
    category: "Ketakutan Hidup",
    statement:
      "Gua gampang overthinking parah kalau chat dibalas singkat atau lama tanpa kabar jelas.",
    partnerPrompt:
      "Dia gampang overthinking parah kalau chat kamu singkat atau telat membalas.",
    consequenceQuestion:
      "Saat kamu sibuk kerja atau rapat berjam-jam, dia bisa mencurigai macam-macam kalau kamu lupa kasih kabar. Siap?",
    compromises: [
      "Wajib kasih kabar singkat sebelum sibuk atau masuk rapat",
      "Share live location saat bepergian biar tenang",
      "Latih percaya tanpa harus lapor aktivitas tiap jam",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "std-03",
    segmentLabel: "Fase Prinsip",
    category: "Prinsip Hubungan",
    statement:
      "Gua butuh waktu me-time sendirian tanpa diganggu pasangan minimal seharian penuh tiap minggu.",
    partnerPrompt:
      "Dia butuh me-time sendirian tanpa diganggu kamu minimal seharian penuh tiap minggu.",
    consequenceQuestion:
      "Di hari libur yang harusnya buat berdua, dia bisa milih main game atau pergi sendiri tanpa kamu. Terima?",
    compromises: [
      "Jadwalkan me-time di hari Sabtu, Minggu wajib quality time",
      "Bebas me-time kapan aja asal tetap balas chat penting",
      "Kurangi durasi me-time jadi setengah hari setelah menikah",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "std-04",
    segmentLabel: "Fase Kebiasaan",
    category: "Kebiasaan Buruk",
    statement:
      "Gua orangnya berantakan dan suka menunda pekerjaan rumah sampai numpuk.",
    partnerPrompt:
      "Dia tipe orang yang berantakan dan sering menunda pekerjaan rumah sampai menumpuk.",
    consequenceQuestion:
      "Kalau pulang kerja capek tapi lihat cucian piring dan baju kotor numpuk karena dia mager, kamu nggak bakal meledak?",
    compromises: [
      "Bagi tugas rumah spesifik berdasarkan yang paling dibenci",
      "Alokasikan budget bulanan khusus jasa bersih-bersih/laundry",
      "Aturan wajib bereskan barang pribadi sebelum tidur",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
  },
  {
    id: "std-05",
    segmentLabel: "Fase Prinsip",
    category: "Ketakutan Hidup",
    statement:
      "Gua takut banget gagal secara karier dan sering kebawa stres kerjaan sampai ke rumah.",
    partnerPrompt:
      "Dia sering membawa stres dan bad mood dari urusan kerjaan ke dalam rumah.",
    consequenceQuestion:
      "Kamu bisa kena imbas nada bicara ketus atau muka bete padahal kamu nggak salah apa-apa. Sanggup hadapi?",
    compromises: [
      "Beri jeda 30 menit sendiri sepulang kerja sebelum ngobrol",
      "Boleh curhat kerjaan sepuasnya tapi dilarang melampiaskan emosi",
      "Buat aturan tegas: urusan kantor berhenti di depan pintu rumah",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "std-06",
    segmentLabel: "Fase Kebiasaan",
    category: "Kebiasaan Buruk",
    statement:
      "Gua susah bangun pagi dan sering telat kalau ada janji yang nggak terlalu formal.",
    partnerPrompt:
      "Dia susah bangun pagi dan sering telat kalau ada janji santai.",
    consequenceQuestion:
      "Acara keluarga atau jadwal liburan berdua bisa berantakan karena dia kesiangan. Kamu bakal sabar?",
    compromises: [
      "Pasangan berhak bangunkan paksa 1 jam sebelum berangkat",
      "Tinggal berangkat duluan kalau telat lebih dari 20 menit",
      "Hanya buat janji kencan di atas jam 11 siang",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "std-07",
    segmentLabel: "Fase Emosi",
    category: "Kebiasaan Buruk",
    statement:
      "Gua kalau lagi emosi gampang ngomong ketus atau nyakitin, walau 10 menit kemudian langsung nyesel.",
    partnerPrompt:
      "Dia kalau emosi gampang melontarkan kata-kata ketus yang menyakitkan.",
    consequenceQuestion:
      "Kata-kata tajam saat dia emosi bisa membekas lama di hati kamu meski dia sudah minta maaf. Siap?",
    compromises: [
      "Wajib langsung minta maaf tulus di hari yang sama",
      "Biasakan tarik napas & menjauh sebentar saat mulai terpancing",
      "Catat kata-kata terlarang yang haram diucapkan saat bertengkar",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "std-08",
    segmentLabel: "Fase Prinsip",
    category: "Prinsip Hubungan",
    statement:
      "Gua nggak terlalu romantis dan jarang ngasih kejutan atau kata-kata manis.",
    partnerPrompt:
      "Dia bukan tipe orang romantis dan jarang memberi kejutan atau pujian manis.",
    consequenceQuestion:
      "Hari ulang tahun atau anniversary mungkin cuma lewat biasa aja tanpa kado spesial. Kamu nggak bakal kecewa?",
    compromises: [
      "Wajib rayakan minimal ulang tahun dan anniversary pernikahan",
      "Ganti keromantisan dengan tindakan nyata bantu urusan harian",
      "Pasangan boleh request kado/kejutan secara langsung tanpa kode",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
  },
  {
    id: "std-09",
    segmentLabel: "Fase Masa Depan",
    category: "Ketakutan Hidup",
    statement:
      "Gua masih ragu soal punya anak cepat setelah nikah dan pengen nunda minimal 2 tahun.",
    partnerPrompt:
      "Dia ingin menunda punya anak minimal 2 tahun setelah menikah.",
    consequenceQuestion:
      "Kamu harus siap pasang badan menghadapi pertanyaan dan tekanan keluarga besar soal momongan. Sanggup?",
    compromises: [
      "Tunda 1 tahun saja sambil siapkan dana tabungan anak",
      "Sepakat kompak jawab 'masih program' di depan keluarga",
      "Cek kesehatan kesuburan dulu sebelum memutuskan menunda",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "std-10",
    segmentLabel: "Fase Kebiasaan",
    category: "Kebiasaan Buruk",
    statement:
      "Gua kecanduan layar HP atau game sampai sering lupa waktu sebelum tidur.",
    partnerPrompt:
      "Dia sering asyik main HP atau game sampai larut malam sebelum tidur.",
    consequenceQuestion:
      "Obrolan sebelum tidur bisa digantikan layar HP yang menyala di sebelahmu tiap malam. Terima?",
    compromises: [
      "Aturan tanpa HP di kasur 30 menit sebelum tidur",
      "Bebas main game/HP maksimal sampai jam 10 malam",
      "Boleh main HP sepuasnya asal sudah ngobrol 15 menit",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "std-11",
    segmentLabel: "Fase Prinsip",
    category: "Prinsip Hubungan",
    statement:
      "Gua gampang ilfeel kalau pasangan plin-plan dan lama ambil keputusan sederhana.",
    partnerPrompt:
      "Dia gampang ilfeel kalau kamu plin-plan dan terlalu lama mengambil keputusan.",
    consequenceQuestion:
      "Dari urusan pilih tempat makan sampai keputusan besar, dia menuntut kamu tegas dan cepat. Sanggup?",
    compromises: [
      "Gantian tentukan pilihan makan dan jadwal kencan tiap minggu",
      "Beri batas waktu berpikir maksimal 10 menit untuk hal ringan",
      "Diskusikan opsi berdua tapi satu orang wajib ketok palu",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "std-12",
    segmentLabel: "Fase Emosi",
    category: "Ketakutan Hidup",
    statement:
      "Gua punya trauma masa lalu yang bikin gua susah percaya 100% sama janji orang.",
    partnerPrompt:
      "Dia punya trauma masa lalu yang membuatnya sulit percaya 100% pada janji.",
    consequenceQuestion:
      "Kamu harus membuktikan konsistensi berulang kali untuk kesalahan yang bahkan bukan kamu pelakunya. Siap?",
    compromises: [
      "Konsultasi ke psikolog pasangan sebelum hari pernikahan",
      "Jangan pernah buat janji manis kalau tidak yakin 100% ditepati",
      "Bangun transparansi penuh di 6 bulan pertama pernikahan",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "std-13",
    segmentLabel: "Fase Kebiasaan",
    category: "Kebiasaan Buruk",
    statement:
      "Gua pemilih banget soal makanan dan gampang bad mood kalau lagi lapar.",
    partnerPrompt:
      "Dia sangat pemilih soal makanan dan gampang bad mood saat lapar.",
    consequenceQuestion:
      "Rencana makan bareng bisa batal mendadak cuma karena menu yang tersedia nggak sesuai seleranya. Sabar?",
    compromises: [
      "Selalu sedia camilan darurat di tas atau kendaraan",
      "Wajib tentukan tempat makan sebelum berangkat keluar rumah",
      "Masak menu masing-masing kalau selera lagi bertolak belakang",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "std-14",
    segmentLabel: "Fase Sosial",
    category: "Prinsip Hubungan",
    statement:
      "Gua nggak suka diajak kumpul acara keluarga besar atau kondangan tiap akhir pekan.",
    partnerPrompt:
      "Dia malas diajak menghadiri acara keluarga besar atau kondangan tiap akhir pekan.",
    consequenceQuestion:
      "Kamu mungkin sering datang sendirian ke acara keluarga karena dia lebih milih di rumah. Terima?",
    compromises: [
      "Wajib hadir hanya di acara keluarga inti dan hari raya",
      "Batasi undangan maksimal 2 kali dalam sebulan",
      "Boleh pulang lebih awal setelah salaman maksimal 1 jam",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
  },
  {
    id: "std-15",
    segmentLabel: "Fase Prinsip",
    category: "Kebiasaan Buruk",
    statement:
      "Gua keras kepala dan susah ngaku salah kecuali dikasih bukti logis yang jelas.",
    partnerPrompt:
      "Dia keras kepala dan sulit mengaku salah kecuali ditunjukkan bukti yang jelas.",
    consequenceQuestion:
      "Debat kecil bisa berubah jadi sidang pengadilan panjang karena dia nggak mau kalah argumen. Sanggup?",
    compromises: [
      "Fokus cari solusi ke depan daripada debat siapa yang salah",
      "Sepakat hentikan debat kalau nada suara mulai tinggi",
      "Boleh adu argumen sehat maksimal 15 menit lalu baikan",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "std-16",
    segmentLabel: "Fase Masa Depan",
    category: "Ketakutan Hidup",
    statement:
      "Gua takut banget kehilangan kebebasan nongkrong sama sahabat setelah menikah.",
    partnerPrompt:
      "Dia takut kehilangan kebebasan berkumpul dengan sahabatnya setelah menikah.",
    consequenceQuestion:
      "Dia bakal tetap rutin nongkrong malam bareng gengnya meski sudah berstatus suami/istri. Siap?",
    compromises: [
      "Jatah nongkrong sahabat maksimal 2 kali sebulan",
      "Wajib pulang sebelum jam 11 malam dan tetap kabari posisi",
      "Kenalkan semua sahabat dekatnya agar saling percaya",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
  },
  {
    id: "std-17",
    segmentLabel: "Fase Emosi",
    category: "Prinsip Hubungan",
    statement:
      "Gua lebih butuh didengarkan tanpa diceramahi atau langsung dikasih solusi tiap curhat.",
    partnerPrompt:
      "Dia hanya ingin didengarkan tanpa diceramahi atau diberi solusi saat curhat.",
    consequenceQuestion:
      "Kamu harus tahan diri untuk nggak ngasih saran logis meski masalahnya sebenarnya gampang diselesaikan. Bisa?",
    compromises: [
      "Tanya dulu di awal: 'Mau didengerin aja atau butuh solusi?'",
      "Dengarkan penuh empati dulu, baru kasih saran besoknya",
      "Peluk dan validasi perasaannya selama 10 menit pertama",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "std-18",
    segmentLabel: "Fase Kebiasaan",
    category: "Kebiasaan Buruk",
    statement:
      "Gua sering impulsif beli barang atau jajan kopi tiap hari tanpa dicatat.",
    partnerPrompt:
      "Dia sering jajan atau belanja impulsif harian tanpa mencatat pengeluaran.",
    consequenceQuestion:
      "Pengeluaran kecil yang nggak tercatat ini bisa bikin target tabungan bulanan meleset terus. Terima?",
    compromises: [
      "Buat pos jajan khusus yang bebas dipakai tanpa dihakimi",
      "Wajib sisihkan tabungan di awal gajian sebelum jajan",
      "Gunakan aplikasi pencatat keuangan otomatis yang terhubung",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
  },
  {
    id: "std-19",
    segmentLabel: "Fase Masa Depan",
    category: "Ketakutan Hidup",
    statement:
      "Gua cemas kalau suatu hari nanti hubungan kita terasa hambar dan terjebak rutinitas.",
    partnerPrompt:
      "Dia cemas hubungan kalian akan terasa hambar dan membosankan setelah bertahun-tahun.",
    consequenceQuestion:
      "Kamu dituntut terus kreatif menjaga percikan asmara di tengah kesibukan rumah tangga. Sanggup?",
    compromises: [
      "Wajib agenda kencan berdua tanpa bahas kerjaan tiap 2 minggu",
      "Rencanakan liburan singkat minimal 2 kali dalam setahun",
      "Terima bahwa fase tenang adalah tanda hubungan yang dewasa",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "std-20",
    segmentLabel: "Fase Prinsip",
    category: "Prinsip Hubungan",
    statement:
      "Gua pantang tidur dalam keadaan masih bertengkar dan wajib selesai malam itu juga.",
    partnerPrompt:
      "Dia pantang tidur sebelum pertengkaran selesai tuntas malam itu juga.",
    consequenceQuestion:
      "Meski kamu sudah ngantuk berat dan butuh tidur, dia bakal terus mengajak diskusi sampai beres. Siap?",
    compromises: [
      "Selesaikan inti masalah maksimal 30 menit sebelum tidur",
      "Sepakat pelukan dulu sebelum tidur dan lanjut bahas besok",
      "Jangan mulai bahas topik berat di atas jam 10 malam",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
  },
  {
    id: "std-21",
    segmentLabel: "Fase Gengsi",
    category: "Ketakutan Hidup",
    statement:
      "Gua sering ngerasa tertekan harus kelihatan udah mapan secara materi sebelum berani seriusin hubungan.",
    partnerPrompt:
      "Dia sering tertekan ingin terlihat mapan secara materi sebelum berani melangkah serius.",
    consequenceQuestion:
      "Dia bisa menunda lamaran atau menutup diri saat kondisi ekonominya belum sesuai standar gengsinya. Siap?",
    compromises: [
      "Susun target tabungan nikah realistis bertahap berdua",
      "Sepakat menikah sederhana tanpa maksain gengsi pesta",
      "Fokus pada kestabilan arus kas bulanan, bukan saldo instan",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "young",
  },
  {
    id: "std-22",
    segmentLabel: "Fase Sosial",
    category: "Kebiasaan Buruk",
    statement:
      "Gua gampang kepikiran dan ngebandingin hubungan kita kalau lihat pasangan lain pamer kemesraan di medsos.",
    partnerPrompt:
      "Dia mudah membandingkan hubungan kalian dengan kemesraan pasangan lain di media sosial.",
    consequenceQuestion:
      "Kamu bisa sering dituntut melakukan hal-hal romantis demi standar konten media sosial. Sanggup?",
    compromises: [
      "Kurangi konsumsi konten pasangan pamer kemesraan",
      "Tentukan bahasa cinta versi kita sendiri tanpa ikut tren",
      "Boleh bikin konten berdua sesekali asal nggak dipaksakan",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "young",
  },
  {
    id: "std-23",
    segmentLabel: "Fase Emosi",
    category: "Ketakutan Hidup",
    statement:
      "Gua susah terbuka soal ketakutan atau masalah terberat gua karena ngerasa laki-laki harus selalu kelihatan kuat.",
    partnerPrompt:
      "Dia sulit terbuka saat punya masalah berat karena merasa harus selalu terlihat kuat.",
    consequenceQuestion:
      "Kamu bisa baru tahu dia lagi punya masalah besar setelah situasinya telanjur parah. Terima?",
    compromises: [
      "Sediakan ruang ngobrol santai tanpa menghakimi tiap minggu",
      "Wajib cerita kalau masalah sudah mengganggu tidur atau kesehatan",
      "Hargai caranya menenangkan diri asal tetap kasih kabar",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "mid",
  },
  {
    id: "std-24",
    segmentLabel: "Fase Prinsip",
    category: "Prinsip Hubungan",
    statement:
      "Gua nggak mau disuruh berhenti kerja setelah nikah karena karier dan kemandirian adalah identitas gua.",
    partnerPrompt:
      "Dia tegas menolak berhenti bekerja setelah menikah demi mempertahankan karier dan kemandiriannya.",
    consequenceQuestion:
      "Urusan pekerjaan rumah tangga dan pengasuhan anak nanti harus dibagi rata dua arah. Siap?",
    compromises: [
      "Bagi tugas domestik secara adil sesuai jam kerja masing-masing",
      "Gunakan asisten rumah tangga atau daycare jika sama-sama sibuk",
      "Evaluasi ulang pembagian peran saat nanti sudah punya anak",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "mid",
  },
  {
    id: "std-25",
    segmentLabel: "Fase Kebiasaan",
    category: "Kebiasaan Buruk",
    statement:
      "Gua udah kelamaan hidup sendiri dan nyaman sama rutinitas pribadi, jadi agak kaku kalau harus kompromi tiap hari.",
    partnerPrompt:
      "Dia sudah terlalu nyaman dengan rutinitas hidup sendirinya sehingga agak kaku berkompromi.",
    consequenceQuestion:
      "Mengubah kebiasaan harian kecil seperti jam tidur atau tata letak rumah bisa memicu gesekan. Sanggup?",
    compromises: [
      "Punya zona ruang pribadi masing-masing di dalam rumah",
      "Terapkan masa adaptasi 3 bulan pertama dengan evaluasi santai",
      "Kompromi di aturan bersama, bebaskan kebiasaan pribadi di ruang sendiri",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "Laki-laki",
    targetAge: "mature",
  },
  {
    id: "std-26",
    segmentLabel: "Fase Prinsip",
    category: "Prinsip Hubungan",
    statement:
      "Di usia sekarang, gua nggak punya energi buat drama hubungan dan bakal langsung mundur kalau sikapmu nggak dewasa.",
    partnerPrompt:
      "Dia tidak punya toleransi untuk drama dan siap mundur jika kamu bersikap kekanak-kanakan.",
    consequenceQuestion:
      "Setiap konflik menuntut kedewasaan penuh tanpa ngambek atau ancaman putus. Siap?",
    compromises: [
      "Gunakan komunikasi langsung tanpa sindiran saat ada masalah",
      "Sepakat tidak pernah mengucap kata pisah saat sedang emosi",
      "Beri waktu 1x24 jam untuk refleksi sebelum diskusi serius",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "Perempuan",
    targetAge: "mature",
  },
  {
    id: "std-27",
    segmentLabel: "Fase Hobi",
    category: "Kebiasaan Buruk",
    statement:
      "Gua punya hobi rutin di akhir pekan yang susah banget gua tinggalin walau udah berkeluarga nanti.",
    partnerPrompt:
      "Dia punya hobi rutin akhir pekan yang sulit ditinggalkan meski sudah berkeluarga.",
    consequenceQuestion:
      "Sabtu atau Minggu pagi dia bisa rutin pergi menyalurkan hobinya saat kamu butuh ditemani. Terima?",
    compromises: [
      "Jadwalkan hobi maksimal 4 jam di akhir pekan, sisanya buat keluarga",
      "Pasangan juga dapat jatah waktu bebas yang sama di akhir pekan",
      "Batalkan agenda hobi jika ada keperluan keluarga mendesak",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
    targetGender: "Laki-laki",
    targetAge: "mid",
  },
  {
    id: "std-28",
    segmentLabel: "Fase Emosi",
    category: "Kebiasaan Buruk",
    statement:
      "Gua kalau lagi PMS atau capek emosional bisa sensitif banget dan gampang nangis cuma gara-gara hal sepele.",
    partnerPrompt:
      "Dia bisa sangat sensitif dan mudah menangis karena hal sepele saat PMS atau lelah.",
    consequenceQuestion:
      "Nada bicaramu yang sebenarnya biasa saja bisa dianggap membentak atau nggak peduli. Sabar?",
    compromises: [
      "Kasih sinyal atau info di awal kalau lagi fase PMS",
      "Pasangan wajib menurunkan nada bicara dan lebih banyak memeluk",
      "Hindari membahas topik konflik berat saat kondisi fisik lagi drop",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "young",
  },
  {
    id: "std-29",
    segmentLabel: "Fase Gaya Hidup",
    category: "Kebiasaan Buruk",
    statement:
      "Gua masih susah jaga pola makan sehat dan jarang olahraga meski usia udah nggak muda lagi.",
    partnerPrompt:
      "Dia masih sulit menjaga pola makan sehat dan jarang berolahraga di usia yang sudah matang.",
    consequenceQuestion:
      "Risiko kesehatan di masa depan bisa memengaruhi kualitas hidup dan keuangan keluarga kalian. Terima?",
    compromises: [
      "Jadwalkan olahraga ringan berdua minimal 2 kali seminggu",
      "Kurangi makanan manis dan begadang secara bertahap bersama",
      "Wajib medical check-up rutin setahun sekali sebelum dan sesudah nikah",
    ],
    botPref: { young: 1, mid: 2, mature: 0 },
    targetGender: "all",
    targetAge: "mature",
  },
  {
    id: "std-30",
    segmentLabel: "Fase Komitmen",
    category: "Ketakutan Hidup",
    statement:
      "Gua diam-diam takut pernikahan malah ngerusak hubungan kita yang sekarang udah asyik.",
    partnerPrompt:
      "Dia diam-diam takut ikatan pernikahan justru merusak keharmonisan kalian sekarang.",
    consequenceQuestion:
      "Dia butuh diyakinkan terus bahwa menikah bukan penjara yang mematikan kebahagiaan. Sanggup?",
    compromises: [
      "Ikut kelas bimbingan pranikah agar punya ekspektasi realistis",
      "Pertahankan kebiasaan pacaran mingguan setelah resmi menikah",
      "Bahas ketakutan terburuk masing-masing tanpa saling menghakimi",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "all",
    targetAge: "young",
  },
];

const FINANSIAL_QUESTIONS: QuestionItem[] = [
  {
    id: "fin-01",
    segmentLabel: "Arus Kas",
    category: "Finansial",
    statement:
      "Gua masih punya kewajiban kirim uang rutin ke orang tua/adik setiap bulan (sandwich generation).",
    partnerPrompt:
      "Dia punya kewajiban rutin membiayai orang tua dan adiknya setiap bulan.",
    consequenceQuestion:
      "Sebagian penghasilan rumah tangga kalian akan rutin mengalir ke keluarga asalnya. Kamu ikhlas?",
    compromises: [
      "Tetapkan nominal tetap maksimal 15% dari gaji pribadi",
      "Gunakan pos penghasilan masing-masing di luar uang belanja inti",
      "Bantu orang tua hanya untuk kebutuhan pokok dan kesehatan",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "fin-02",
    segmentLabel: "Gaya Hidup",
    category: "Finansial",
    statement:
      "Gua terbiasa pakai paylater atau kartu kredit untuk belanja gaya hidup dan dicicil bulanan.",
    partnerPrompt:
      "Dia terbiasa menggunakan paylater atau cicilan kartu kredit untuk gaya hidup.",
    consequenceQuestion:
      "Tagihan cicilan konsumtif bisa mengganggu pengajuan KPR atau tabungan masa depan kalian. Terima?",
    compromises: [
      "Lunasi semua paylater sebelum akad nikah dan tutup akunnya",
      "Boleh pakai kartu kredit hanya untuk promo lalu langsung bayar penuh",
      "Batasi total cicilan maksimal 10% dari gaji bulanan",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
  },
  {
    id: "fin-03",
    segmentLabel: "Manajemen Uang",
    category: "Finansial",
    statement:
      "Gua lebih nyaman gaji masing-masing dipegang sendiri dan biaya rumah tangga dibagi patungan.",
    partnerPrompt:
      "Dia ingin gaji dipegang masing-masing dan biaya rumah tangga dibagi sistem patungan.",
    consequenceQuestion:
      "Nggak ada satu bendahara tunggal; tiap tagihan listrik, makan, dan cicilan dihitung proporsional. Setuju?",
    compromises: [
      "Buka 1 rekening bersama untuk patungan kebutuhan rumah tangga",
      "Bagi porsi patungan sesuai persentase besaran gaji masing-masing",
      "Suami tanggung kebutuhan pokok, istri tanggung kebutuhan sekunder",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "fin-04",
    segmentLabel: "Prioritas",
    category: "Finansial",
    statement:
      "Gua rela ngeluarin uang jutaan buat hobi, konser, atau gadget demi kewarasan mental.",
    partnerPrompt:
      "Dia rela mengeluarkan jutaan rupiah untuk hobi, konser, atau gadget terbaru.",
    consequenceQuestion:
      "Saat kamu pengen hemat ketat, dia bisa tetap beli barang hobi mahal selama tagihan aman. Sanggup?",
    compromises: [
      "Boleh beli barang hobi asalkan menabung khusus di luar pos rumah",
      "Wajib izin pasangan untuk belanja pribadi di atas 1 juta rupiah",
      "Terapkan aturan 1 banding 1: beli hobi harus nabung nominal sama",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "fin-05",
    segmentLabel: "Aset & Hunian",
    category: "Finansial",
    statement:
      "Gua lebih milih ngontrak rumah dekat kantor daripada nyicil KPR jauh di pinggiran kota.",
    partnerPrompt:
      "Dia lebih memilih mengontrak rumah di tengah kota daripada mengambil cicilan KPR di pinggiran.",
    consequenceQuestion:
      "Kalian mungkin belum punya sertifikat rumah atas nama sendiri di 5 tahun pertama pernikahan. Terima?",
    compromises: [
      "Ngontrak 2 tahun pertama sambil kumpulkan DP rumah lebih besar",
      "Beli rumah di pinggiran tapi disewakan, lalu tetap ngontrak dekat kantor",
      "Tetap ambil KPR sekarang demi kepastian aset jangka panjang",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "fin-06",
    segmentLabel: "Transparansi",
    category: "Finansial",
    statement:
      "Gua nggak suka kalau tiap transaksi pengeluaran pribadi diaudit atau ditanyain detail oleh pasangan.",
    partnerPrompt:
      "Dia tidak suka pengeluaran pribadinya diaudit atau ditanyai detail oleh pasangan.",
    consequenceQuestion:
      "Kamu hanya tahu jumlah tabungan bersama, tanpa tahu detail sisa uang pribadinya dipakai buat apa. Oke?",
    compromises: [
      "Audit cukup dilakukan sebulan sekali hanya untuk pos bersama",
      "Transparan total untuk saldo tabungan dan utang, bebas di uang jajan",
      "Wajib terbuka penuh tanpa rahasia saldo sejak hari pertama menikah",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "fin-07",
    segmentLabel: "Risiko",
    category: "Finansial",
    statement:
      "Gua berani taruh sebagian besar tabungan di instrumen investasi berisiko tinggi (saham/kripto).",
    partnerPrompt:
      "Dia berani menaruh sebagian besar tabungannya di investasi berisiko tinggi seperti saham atau kripto.",
    consequenceQuestion:
      "Nilai portofolio keluarga bisa turun drastis dalam semalam saat pasar anjlok. Kamu kuat mental?",
    compromises: [
      "Dana darurat dan dana pendidikan wajib di deposito/reksadana pasar uang",
      "Investasi agresif maksimal 20% dari total aset tabungan",
      "Semua keputusan investasi besar harus disetujui kedua belah pihak",
    ],
    botPref: { young: 1, mid: 2, mature: 0 },
  },
  {
    id: "fin-08",
    segmentLabel: "Sosial & Gengsi",
    category: "Finansial",
    statement:
      "Gua gampang nggak enakan kalau dimintain pinjam uang sama teman dekat atau saudara.",
    partnerPrompt:
      "Dia gampang tidak enakan dan sering meminjamkan uang ke teman atau saudara.",
    consequenceQuestion:
      "Uang tabungan kalian berisiko dipinjamkan ke orang lain dan susah ditagih balik. Sanggup hadapi?",
    compromises: [
      "Aturan wajib: dilarang pinjamkan uang tanpa persetujuan pasangan",
      "Anggap uang yang dipinjamkan sebagai sedekah dengan batas nominal kecil",
      "Jadikan pasangan sebagai alasan resmi untuk menolak pinjaman",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "fin-09",
    segmentLabel: "Pembagian Nafkah",
    category: "Finansial",
    statement:
      "Gua berharap istri tetap punya penghasilan sendiri karena gua nggak mau nanggung seluruh beban ekonomi sendirian.",
    partnerPrompt:
      "Dia berharap kamu tetap berpenghasilan agar beban ekonomi rumah tangga tidak ditanggungnya sendirian.",
    consequenceQuestion:
      "Kalau suatu hari kamu pengen resign jadi ibu rumah tangga penuh waktu, dia bisa keberatan. Siap?",
    compromises: [
      "Tetap bekerja atau punya usaha dari rumah setelah menikah",
      "Suami tanggung biaya pokok, penghasilan istri untuk tabungan & sekunder",
      "Izinkan resign penuh waktu jika tabungan darurat sudah 12x pengeluaran",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "mid",
  },
  {
    id: "fin-10",
    segmentLabel: "Prinsip Nafkah",
    category: "Finansial",
    statement:
      "Menurut gua uang suami adalah uang bersama, sedangkan gaji gua adalah hak penuh buat diri gua sendiri.",
    partnerPrompt:
      "Dia berprinsip penghasilanmu adalah uang bersama, sedangkan gajinya adalah hak pribadinya sendiri.",
    consequenceQuestion:
      "Seluruh kebutuhan rumah tangga dan cicilan wajib ditutup dari penghasilanmu terlebih dahulu. Sanggup?",
    compromises: [
      "Suami tanggung seluruh kebutuhan dasar, istri bantu pos liburan & anak",
      "Gaji istri tetap utuh tapi wajib ditabung untuk aset masa depan bersama",
      "Gabungkan seluruh penghasilan lalu bagi jatah uang saku yang sama besar",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "mid",
  },
  {
    id: "fin-11",
    segmentLabel: "Gaya Hidup",
    category: "Finansial",
    statement:
      "Gua masih sering ngabisin sisa gaji buat nongkrong atau upgrade kendaraan/gadget biar nggak ketinggalan tongkrongan.",
    partnerPrompt:
      "Dia masih sering menghabiskan sisa gaji untuk nongkrong atau upgrade gadget dan kendaraan.",
    consequenceQuestion:
      "Tabungan nikah kalian bisa jalan di tempat karena gaya hidup pergaulannya masih tinggi. Terima?",
    compromises: [
      "Auto-debet tabungan nikah di tanggal gajian sebelum dipakai jajan",
      "Batasi budget nongkrong maksimal 10% dari penghasilan bulanan",
      "Tunda ganti kendaraan atau gadget sampai dana darurat terkumpul",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
    targetGender: "Laki-laki",
    targetAge: "young",
  },
  {
    id: "fin-12",
    segmentLabel: "Gaya Hidup",
    category: "Finansial",
    statement:
      "Budget skincare, perawatan salon, dan outfit gua tiap bulan cukup besar dan nggak bisa dipangkas drastis.",
    partnerPrompt:
      "Dia punya alokasi rutin yang cukup besar untuk skincare, perawatan, dan outfit setiap bulan.",
    consequenceQuestion:
      "Pos perawatan dirinya akan selalu masuk daftar belanja wajib bulanan rumah tangga. Oke?",
    compromises: [
      "Biayai pos perawatan dari penghasilan atau uang saku pribadi",
      "Tetapkan batas maksimal budget perawatan bulanan yang disepakati",
      "Pilih perawatan esensial saja saat kondisi keuangan lagi ketat",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "young",
  },
  {
    id: "fin-13",
    segmentLabel: "Karier & Risiko",
    category: "Finansial",
    statement:
      "Gua punya rencana resign dari kerjaan tetap buat bangun bisnis sendiri meski penghasilannya belum pasti.",
    partnerPrompt:
      "Dia berencana meninggalkan pekerjaan tetap untuk merintis bisnis dengan penghasilan yang belum pasti.",
    consequenceQuestion:
      "Kalian harus siap menghadapi fase tanpa gaji tetap dan gaya hidup super hemat selama merintis usaha. Siap?",
    compromises: [
      "Siapkan dana hidup keluarga minimal 12 bulan sebelum resign",
      "Jalankan bisnis sebagai sampingan dulu sampai profitnya menyamai gaji",
      "Pasangan tetap bekerja sebagai penopang arus kas selama masa rintisan",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "mature",
  },
  {
    id: "fin-14",
    segmentLabel: "Aset Pribadi",
    category: "Finansial",
    statement:
      "Setelah nikah nanti, gua tetap wajib punya tabungan dan aset atas nama pribadi sebagai jaring pengaman.",
    partnerPrompt:
      "Dia bersikeras tetap memiliki tabungan dan aset atas nama pribadinya setelah menikah.",
    consequenceQuestion:
      "Tidak semua aset yang kalian kumpulkan akan tercatat atas nama bersama. Kamu bisa menerima?",
    compromises: [
      "Sepakat punya rekening bersama sekaligus rekening darurat masing-masing",
      "Buat perjanjian pranikah soal pemisahan harta secara transparan",
      "Boleh punya aset pribadi asal tidak mengurangi jatah kebutuhan rumah",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "Perempuan",
    targetAge: "mature",
  },
  {
    id: "fin-15",
    segmentLabel: "Biaya Nikah",
    category: "Finansial",
    statement:
      "Gua pengen acara pernikahan yang berkesan dan layak meski harus ngabisin hampir seluruh tabungan kita.",
    partnerPrompt:
      "Dia menginginkan pesta pernikahan yang meriah meski menguras hampir seluruh tabungan kalian.",
    consequenceQuestion:
      "Setelah pesta selesai, kalian bakal mulai hidup berumah tangga dari saldo tabungan yang tipis. Sanggup?",
    compromises: [
      "Gelar akad intim berkesan dengan budget maksimal 50% dari tabungan",
      "Pesta meriah boleh asal dibiayai tanpa utang dan sisa tabungan aman",
      "Alokasikan dana lebih besar untuk DP rumah dan isi perabotan",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
    targetGender: "all",
    targetAge: "young",
  },
  {
    id: "fin-16",
    segmentLabel: "Dana Anak",
    category: "Finansial",
    statement:
      "Gua pengen anak kita nanti masuk sekolah swasta terbaik walau biayanya bakal nyedot porsi besar gaji bulanan.",
    partnerPrompt:
      "Dia menargetkan sekolah swasta mahal untuk anak nanti meski menyedot porsi besar penghasilan.",
    consequenceQuestion:
      "Gaya hidup pribadi kalian harus banyak dikorbankan demi mengejar dana pendidikan anak. Setuju?",
    compromises: [
      "Mulai buka tabungan pendidikan anak sejak tahun pertama menikah",
      "Sesuaikan pilihan sekolah dengan kemampuan finansial riil saat waktunya tiba",
      "Prioritaskan sekolah berkualitas yang dekat rumah tanpa memaksakan gengsi",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "all",
    targetAge: "mid",
  },
  {
    id: "fin-17",
    segmentLabel: "Proteksi & Pensiun",
    category: "Finansial",
    statement:
      "Gua mewajibkan alokasi besar buat asuransi kesehatan dan dana pensiun ketimbang liburan atau ganti mobil.",
    partnerPrompt:
      "Dia memprioritaskan budget besar untuk asuransi dan dana pensiun dibanding hiburan atau kendaraan.",
    consequenceQuestion:
      "Gaya hidup kalian bakal terasa sangat konservatif karena banyak uang dikunci untuk masa tua. Terima?",
    compromises: [
      "Sisihkan 15% untuk proteksi & pensiun, 10% khusus pos hiburan keluarga",
      "Pilih produk asuransi murni sesuai kebutuhan tanpa membebani arus kas",
      "Review alokasi keuangan bersama setiap 6 bulan sekali",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "all",
    targetAge: "mature",
  },
  {
    id: "fin-18",
    segmentLabel: "Pergaulan",
    category: "Finansial",
    statement:
      "Gua sering royal nraktir teman atau relasi kerja karena ngerasa itu bagian dari investasi pergaulan.",
    partnerPrompt:
      "Dia sering royal mentraktir teman atau relasi kerja demi menjaga pergaulan.",
    consequenceQuestion:
      "Pengeluaran tak terduga buat traktiran bisa bikin budget bulanan jebol di akhir bulan. Sabar?",
    compromises: [
      "Masukkan biaya traktiran ke dalam jatah uang saku pribadi bulanan",
      "Dilarang pakai kartu kredit atau dana bersama untuk mentraktir orang lain",
      "Batasi traktiran khusus untuk relasi yang benar-benar produktif",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "mid",
  },
];

const KELUARGA_QUESTIONS: QuestionItem[] = [
  {
    id: "kel-01",
    segmentLabel: "Tempat Tinggal",
    category: "Keluarga & Mertua",
    statement:
      "Gua pengen tinggal bareng atau satu komplek sama orang tua setelah nikah biar gampang ngurus mereka.",
    partnerPrompt:
      "Dia ingin tinggal serumah atau bertetangga dekat dengan orang tuanya setelah menikah.",
    consequenceQuestion:
      "Privasi rumah tangga kalian akan bersinggungan langsung dengan kebiasaan dan aturan mertua setiap hari. Siap?",
    compromises: [
      "Cari kontrakan terpisah tapi masih satu kecamatan dengan orang tua",
      "Tinggal bareng maksimal 6 bulan pertama sambil siapkan rumah sendiri",
      "Tetap pisah rumah mutlak demi kemandirian dan kesehatan mental",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "kel-02",
    segmentLabel: "Batasan",
    category: "Keluarga & Mertua",
    statement:
      "Gua sering cerita masalah pribadi atau pertengkaran hubungan ke orang tua/saudara demi minta saran.",
    partnerPrompt:
      "Dia sering menceritakan masalah atau pertengkaran kalian kepada orang tua atau saudaranya.",
    consequenceQuestion:
      "Kekuranganmu bisa diketahui keluarga besarnya dan memengaruhi pandangan mertua terhadapmu. Terima?",
    compromises: [
      "Haram hukumnya curhat aib pasangan ke orang tua maupun mertua",
      "Curhat hanya boleh ke profesional atau sahabat netral",
      "Selesaikan semua konflik internal berdua sebelum ketemu keluarga",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "kel-03",
    segmentLabel: "Prioritas",
    category: "Keluarga & Mertua",
    statement:
      "Kalau ada acara keluarga besar bentrok sama rencana liburan berdua, gua cenderung mendahulukan keluarga.",
    partnerPrompt:
      "Dia cenderung membatalkan rencana berdua jika mendadak ada acara keluarga besar.",
    consequenceQuestion:
      "Tiket liburan atau reservasi kencan kalian bisa batal mendadak demi panggilan keluarga. Sanggup?",
    compromises: [
      "Acara yang sudah dibayar DP tidak boleh dibatalkan kecuali sakit/duka",
      "Gantian prioritas: bulan ini keluarga, bulan depan khusus berdua",
      "Setelah menikah, pasangan inti adalah prioritas nomor satu",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "kel-04",
    segmentLabel: "Pola Asuh",
    category: "Keluarga & Mertua",
    statement:
      "Gua nggak masalah kalau nanti anak kita lebih banyak diasuh kakek-neneknya saat kita kerja.",
    partnerPrompt:
      "Dia ingin menitipkan pengasuhan anak kepada kakek-neneknya saat kalian bekerja.",
    consequenceQuestion:
      "Pola asuh orang tua zaman dulu bisa bertabrakan dengan prinsip parenting modern yang kamu inginkan. Siap?",
    compromises: [
      "Gunakan daycare profesional agar aturan pengasuhan tetap satu pintu",
      "Titip ke orang tua hanya saat kondisi darurat, bukan setiap hari",
      "Buat kesepakatan tertulis soal makanan dan gadget anak dengan mertua",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "kel-05",
    segmentLabel: "Tradisi",
    category: "Keluarga & Mertua",
    statement:
      "Gua sangat menjunjung tinggi adat dan tradisi keluarga meski acaranya ribet dan mahal.",
    partnerPrompt:
      "Dia sangat menjunjung tradisi adat keluarga besar meski prosesnya rumit dan mahal.",
    consequenceQuestion:
      "Persiapan pernikahan dan hari raya akan penuh dengan prosesi adat yang menguras tenaga dan biaya. Terima?",
    compromises: [
      "Jalani prosesi adat inti saja dan sederhanakan teknisnya",
      "Keluarga besar yang menuntut adat wajib ikut menanggung biayanya",
      "Ambil jalan tengah konsep modern-tradisional yang efisien",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "kel-06",
    segmentLabel: "Kemandirian",
    category: "Keluarga & Mertua",
    statement:
      "Gua masih sering minta pertimbangan orang tua sebelum ambil keputusan besar kayak beli mobil atau pindah kerja.",
    partnerPrompt:
      "Dia masih sering meminta restu dan pertimbangan orang tuanya untuk keputusan karier atau aset.",
    consequenceQuestion:
      "Keputusan yang sudah kalian sepakati berdua bisa berubah setelah dia telepon orang tuanya. Sabar?",
    compromises: [
      "Orang tua hanya diberi kabar setelah keputusan final diambil berdua",
      "Minta saran boleh, tapi hak veto mutlak hanya di tangan suami-istri",
      "Diskusikan dengan orang tua hanya jika melibatkan bantuan dana mereka",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "kel-07",
    segmentLabel: "Hari Raya",
    category: "Keluarga & Mertua",
    statement:
      "Setiap Lebaran atau hari raya besar, gua wajib pulang kampung ke rumah orang tua gua dulu.",
    partnerPrompt:
      "Dia mewajibkan hari pertama Lebaran/hari raya selalu dirayakan di rumah orang tuanya dulu.",
    consequenceQuestion:
      "Kamu harus merelakan momen hari pertama perayaan besar di keluargamu sendiri setiap tahun. Setuju?",
    compromises: [
      "Sistem gantian adil: tahun ganjil di keluargamu, tahun genap di keluarganya",
      "Hari pertama bagi dua waktu: pagi di sini, sore langsung ke sana",
      "Rayakan di rumah sendiri dan undang kedua orang tua berkumpul",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "kel-08",
    segmentLabel: "Kunjungan",
    category: "Keluarga & Mertua",
    statement:
      "Gua senang kalau rumah kita selalu terbuka buat saudara atau sepupu yang mau nginep kapan aja.",
    partnerPrompt:
      "Dia senang rumahnya terbuka bebas untuk saudara atau sepupu yang menginap kapan saja.",
    consequenceQuestion:
      "Akhir pekanmu di rumah bisa sering kedatangan tamu keluarga yang menginap tanpa jadwal pasti. Siap?",
    compromises: [
      "Tamu keluarga wajib konfirmasi minimal 3 hari sebelum menginap",
      "Batasi durasi menginap maksimal 2 malam agar privasi terjaga",
      "Sediakan kamar tamu khusus tapi area kamar utama terlarang dimasuki",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "kel-09",
    segmentLabel: "Posisi Tengah",
    category: "Keluarga & Mertua",
    statement:
      "Kalau istri dan ibu gua beda pendapat, gua sering serba salah dan cenderung minta istri gua yang ngalah duluan.",
    partnerPrompt:
      "Dia cenderung memintamu mengalah duluan jika terjadi perbedaan pendapat dengan ibunya.",
    consequenceQuestion:
      "Kamu bisa merasa tidak dibela oleh suamimu sendiri di depan mertua. Sanggup hadapi?",
    compromises: [
      "Pasangan wajib jadi penengah adil di depan, lalu evaluasi berdua di kamar",
      "Sepakat tidak saling menjatuhkan di depan orang tua masing-masing",
      "Rumah tangga punya aturan sendiri yang tidak boleh diintervensi orang tua",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "mid",
  },
  {
    id: "kel-10",
    segmentLabel: "Kedekatan",
    category: "Keluarga & Mertua",
    statement:
      "Gua dekat banget sama keluarga gua dan pengen bisa main atau nginep di rumah orang tua hampir tiap akhir pekan.",
    partnerPrompt:
      "Dia sangat lekat dengan keluarganya dan ingin rutin berkunjung atau menginap hampir tiap akhir pekan.",
    consequenceQuestion:
      "Waktu akhir pekan kalian berdua akan lebih sering dihabiskan di rumah mertua. Terima?",
    compromises: [
      "Kunjungan ke rumah orang tua maksimal 2 kali sebulan",
      "Boleh main kapan saja di hari kerja, tapi akhir pekan milik keluarga inti",
      "Gantian jadwal kunjungan adil antara keluarga kedua belah pihak",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "mid",
  },
  {
    id: "kel-11",
    segmentLabel: "Tanggung Jawab",
    category: "Keluarga & Mertua",
    statement:
      "Sebagai anak laki-laki yang diandalkan, gua sering dimintain tolong urusan teknis atau finansial mendadak sama keluarga.",
    partnerPrompt:
      "Dia sering menjadi tumpuan utama keluarganya untuk urusan mendadak maupun bantuan dana.",
    consequenceQuestion:
      "Waktu dan rencana kalian bisa sering tersita demi mengurus kebutuhan saudara atau orang tuanya. Siap?",
    compromises: [
      "Bantu tenaga boleh, tapi bantuan dana wajib seizin pasangan",
      "Ajarkan saudara lain untuk mandiri dan tidak selalu bergantung",
      "Tetapkan jam khusus untuk urusan keluarga agar waktu rumah tidak terganggu",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "young",
  },
  {
    id: "kel-12",
    segmentLabel: "Ekspektasi Mertua",
    category: "Keluarga & Mertua",
    statement:
      "Gua kurang jago masak dan mengurus rumah, dan gua males kalau dibanding-bandingin sama standar ibu kamu.",
    partnerPrompt:
      "Dia kurang mahir urusan domestik dan menolak dibanding-bandingkan dengan standar ibumu.",
    consequenceQuestion:
      "Kamu harus siap pasang badan kalau orang tuamu mengomentari cara dia mengurus rumah tangga. Sanggup?",
    compromises: [
      "Pasangan wajib membela dan menegaskan setiap rumah punya standar sendiri",
      "Bagi tugas memasak dan bersih-bersih berdua tanpa membebankan satu pihak",
      "Andalkan katering sehat atau alat rumah tangga praktis tanpa gengsi",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "young",
  },
  {
    id: "kel-13",
    segmentLabel: "Perawatan Lansia",
    category: "Keluarga & Mertua",
    statement:
      "Kalau orang tua gua nanti sakit atau butuh perawatan intensif, gua wajib bawa mereka tinggal serumah sama kita.",
    partnerPrompt:
      "Dia mewajibkan orang tuanya tinggal serumah dengan kalian jika kelak sakit atau butuh perawatan.",
    consequenceQuestion:
      "Fokus, tenaga, dan suasana rumah tangga kalian akan berubah total untuk merawat lansia. Siap?",
    compromises: [
      "Siapkan kamar khusus di lantai bawah dan sewa perawat pendamping",
      "Patungan biaya perawatan bersama saudara kandung lainnya secara adil",
      "Jaga komunikasi rutin agar pasangan tidak merasa terabaikan",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "Laki-laki",
    targetAge: "mature",
  },
  {
    id: "kel-14",
    segmentLabel: "Batasan Parenting",
    category: "Keluarga & Mertua",
    statement:
      "Gua bakal langsung menegur tegas siapapun di keluarga besar yang ikut campur atau ngomentarin cara kita ngurus anak.",
    partnerPrompt:
      "Dia tidak segan menegur langsung anggota keluarga besar yang mengomentari pola asuh anak kalian.",
    consequenceQuestion:
      "Suasana kumpul keluarga bisa mendadak tegang kalau ada kerabat yang tersinggung dengan ketegasannya. Terima?",
    compromises: [
      "Suami/istri yang menegur keluarganya masing-masing agar lebih halus",
      "Sepakati kalimat jawaban diplomatis untuk menepis komentar kerabat",
      "Prioritaskan kenyamanan mental ibu dan anak di atas rasa sungkan",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "Perempuan",
    targetAge: "mature",
  },
  {
    id: "kel-15",
    segmentLabel: "Resepsi & Restu",
    category: "Keluarga & Mertua",
    statement:
      "Karena orang tua ikut bantu biaya nikah, gua ngerasa kita harus nurutin semua kemauan konsep dan tamu undangan mereka.",
    partnerPrompt:
      "Dia merasa kalian harus menuruti semua kemauan orang tua soal konsep pernikahan karena dibantu biaya.",
    consequenceQuestion:
      "Acara pernikahan kalian bisa terasa seperti hajatan orang tua ketimbang perayaan kalian berdua. Oke?",
    compromises: [
      "Biayai pernikahan mandiri sepenuhnya agar bebas menentukan konsep",
      "Bagi kuota tamu undangan 50:50 antara pilihan orang tua dan pasangan",
      "Kompromi di acara akad tradisional, bebaskan konsep di acara resepsi",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "all",
    targetAge: "young",
  },
  {
    id: "kel-16",
    segmentLabel: "Nilai & Ibadah",
    category: "Keluarga & Mertua",
    statement:
      "Standar praktik ibadah di keluarga gua cukup ketat, dan gua berharap pasangan bisa menyesuaikan diri saat kumpul keluarga.",
    partnerPrompt:
      "Dia berharap kamu menyesuaikan diri dengan standar praktik ibadah keluarganya yang cukup ketat.",
    consequenceQuestion:
      "Cara berpakaian dan rutinitas ibadahmu akan diperhatikan ketat setiap kali bertemu keluarga besarnya. Siap?",
    compromises: [
      "Saling menghormati proses belajar tanpa paksaan atau menghakimi",
      "Sesuaikan penampilan yang sopan saat berkunjung ke rumah orang tua",
      "Bangun kesepakatan spiritual inti berdua sebagai fondasi rumah tangga",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "all",
    targetAge: "mid",
  },
  {
    id: "kel-17",
    segmentLabel: "Aset Keluarga",
    category: "Keluarga & Mertua",
    statement:
      "Di keluarga besar gua ada urusan aset/bisnis keluarga yang rumit dan sewaktu-waktu butuh keterlibatan gua.",
    partnerPrompt:
      "Dia terlibat dalam urusan aset atau bisnis keluarga besar yang cukup rumit.",
    consequenceQuestion:
      "Drama internal keluarga besarnya bisa ikut menguras waktu dan pikiranmu di rumah. Sanggup?",
    compromises: [
      "Pisahkan total keuangan rumah tangga dari aset atau utang bisnis keluarga",
      "Pasangan tidak wajib ikut campur dalam rapat atau konflik internal saudara",
      "Batasi keterlibatan hanya pada aspek administratif yang jelas",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "all",
    targetAge: "mature",
  },
  {
    id: "kel-18",
    segmentLabel: "Privasi Rumah",
    category: "Keluarga & Mertua",
    statement:
      "Gua nggak suka kalau mertua atau ipar datang ke rumah tanpa janjian dulu, apalagi langsung masuk ke area kamar.",
    partnerPrompt:
      "Dia tidak suka jika mertua atau ipar datang ke rumah tanpa janji terlebih dahulu.",
    consequenceQuestion:
      "Keluargamu nggak bisa lagi mampir dadakan ke rumah kalian seperti mampir ke rumah sendiri. Setuju?",
    compromises: [
      "Wajib kabari minimal sehari sebelumnya sebelum berkunjung ke rumah",
      "Area kamar tidur utama adalah zona privat terlarang bagi semua tamu",
      "Sediakan ruang tamu nyaman khusus untuk menerima keluarga besar",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "mid",
  },
];

const PRIVASI_QUESTIONS: QuestionItem[] = [
  {
    id: "prv-01",
    segmentLabel: "Akses Digital",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua pantang ngasih password HP atau media sosial ke pasangan karena privasi itu hak dasar.",
    partnerPrompt:
      "Dia menolak memberikan password HP atau media sosialnya dengan alasan privasi.",
    consequenceQuestion:
      "Kamu nggak akan pernah bisa mengecek isi chat atau DM-nya secara bebas meski lagi curiga. Terima?",
    compromises: [
      "Simpan password di amplop darurat, hanya dibuka saat kondisi genting",
      "Tidak perlu tukar password, tapi boleh pinjam HP kapan saja tanpa panik",
      "Terbuka penuh saling tahu PIN HP demi ketenangan pikiran",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
  },
  {
    id: "prv-02",
    segmentLabel: "Lingkaran Sosial",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua punya sahabat dekat lawan jenis sejak kuliah dan masih sering curhat atau makan berdua.",
    partnerPrompt:
      "Dia punya sahabat dekat lawan jenis dan masih sering curhat atau makan berdua.",
    consequenceQuestion:
      "Kamu harus menerima kehadiran sahabat lawan jenisnya di lingkaran terdekat pernikahan kalian. Sanggup?",
    compromises: [
      "Dilarang jalan atau makan berdua saja tanpa mengajak pasangan",
      "Boleh tetap berteman tapi wajib kenalkan dan libatkan pasangan",
      "Kurangi intensitas curhat pribadi ke lawan jenis setelah menikah",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "prv-03",
    segmentLabel: "Masa Lalu",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua masih berteman baik di media sosial dengan mantan dan sesekali saling balas story.",
    partnerPrompt:
      "Dia masih berteman di media sosial dengan mantannya dan sesekali berinteraksi.",
    consequenceQuestion:
      "Nama mantannya masih bisa muncul di notifikasi atau daftar viewers story-nya. Kamu nggak bakal cemburu?",
    compromises: [
      "Tetap follow boleh, tapi dilarang saling DM atau balas story",
      "Unfollow/hapus kontak semua mantan demi menghormati pasangan",
      "Hanya boleh komunikasi jika ada urusan pekerjaan yang profesional",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "prv-04",
    segmentLabel: "Jejak Digital",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua tipe orang yang jarang upload foto pasangan di media sosial karena pengen hubungan low-key.",
    partnerPrompt:
      "Dia jarang memposting foto kebersamaan kalian di media sosial karena ingin terlihat low-key.",
    consequenceQuestion:
      "Feed Instagram-nya bakal terlihat seperti akun single tanpa jejak kehadiranmu. Kamu nggak masalah?",
    compromises: [
      "Posting foto berdua minimal saat momen besar atau liburan",
      "Cukup pasang foto profil atau highlight khusus berdua",
      "Bebas tidak posting asal status hubungan jelas di lingkungan nyata",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
  },
  {
    id: "prv-05",
    segmentLabel: "Keterbukaan",
    category: "Privasi & Masa Lalu",
    statement:
      "Ada bagian kelam dari masa lalu gua yang lebih baik nggak usah diceritain detail ke pasangan.",
    partnerPrompt:
      "Dia memilih menyimpan rapat sebagian cerita kelam masa lalunya dari kamu.",
    consequenceQuestion:
      "Kamu harus siap menerima dia apa adanya hari ini tanpa mengorek-ngorek detail masa lalunya. Siap?",
    compromises: [
      "Masa lalu pribadi boleh disimpan asal tidak berdampak hukum/kesehatan",
      "Ceritakan garis besarnya saja agar tidak kaget jika tahu dari orang lain",
      "Buka semua kartu di meja sebelum menikah agar tidak ada bom waktu",
    ],
    botPref: { young: 2, mid: 0, mature: 1 },
  },
  {
    id: "prv-06",
    segmentLabel: "Batasan Kerja",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua sering kerja lembur atau dinas luar kota bareng rekan kerja lawan jenis satu tim.",
    partnerPrompt:
      "Dia sering lembur atau dinas luar kota berdua/satu tim dengan rekan kerja lawan jenis.",
    consequenceQuestion:
      "Intensitas komunikasinya dengan rekan kerja bisa lebih sering daripada denganmu di jam kerja. Terima?",
    compromises: [
      "Wajib video call singkat sebelum tidur setiap kali dinas luar kota",
      "Batasi chat urusan kerja hanya di jam kantor kecuali darurat",
      "Kenalkan rekan satu timnya saat acara kantor bersama",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
  },
  {
    id: "prv-07",
    segmentLabel: "Keamanan",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua nggak nyaman kalau lokasi GPS gua dilacak terus-terusan lewat aplikasi pasangan.",
    partnerPrompt:
      "Dia tidak nyaman jika lokasi GPS-nya dilacak terus-terusan lewat aplikasi.",
    consequenceQuestion:
      "Kamu harus mengandalkan kabar manual darinya tanpa bantuan aplikasi pelacak lokasi. Sanggup?",
    compromises: [
      "Share lokasi hanya saat pulang larut malam atau perjalanan jauh",
      "Pakai fitur cek lokasi darurat yang hanya aktif saat dibutuhkan",
      "Setuju tanpa pelacakan GPS asal telepon selalu diangkat",
    ],
    botPref: { young: 0, mid: 2, mature: 1 },
  },
  {
    id: "prv-08",
    segmentLabel: "Lingkaran Baru",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua gampang akrab dan ramah banget sama orang baru, sampai kadang disalahartikan sebagai flirting.",
    partnerPrompt:
      "Dia terlalu ramah pada orang baru sehingga sering disalahartikan sebagai flirting.",
    consequenceQuestion:
      "Orang lain bisa mengira dia masih single atau memberi harapan karena sikap ramahnya. Kamu kuat mental?",
    compromises: [
      "Wajib selalu pakai cincin nikah dan sering sebut pasangan saat ngobrol",
      "Kurangi bercanda fisik atau pujian berlebihan ke lawan jenis",
      "Pasangan berhak mengingatkan langsung jika sikapnya sudah kelewat batas",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
  },
  {
    id: "prv-09",
    segmentLabel: "Etika Medsos",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua masih follow beberapa akun cewek cantik/selebgram di medsos cuma buat hiburan scroll, bukan niat selingkuh.",
    partnerPrompt:
      "Dia masih mengikuti akun-akun perempuan seksi di media sosial sebagai hiburan.",
    consequenceQuestion:
      "Isi explore Instagram dan daftar following-nya bisa bikin kamu insecure atau ilfeel. Terima?",
    compromises: [
      "Unfollow semua akun yang membuat pasangan tidak nyaman",
      "Dilarang keras memberi like, komentar, atau DM pada akun tersebut",
      "Sepakat menjaga etika bermedia sosial sejak berkomitmen serius",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "young",
  },
  {
    id: "prv-10",
    segmentLabel: "Curhat & Medsos",
    category: "Privasi & Masa Lalu",
    statement:
      "Kalau lagi kesal sama pasangan, gua sering bikin status kode di Close Friends medsos atau curhat ke grup sahabat.",
    partnerPrompt:
      "Dia sering mengunggah sindiran di Close Friends media sosial atau curhat ke grup sahabat saat kesal.",
    consequenceQuestion:
      "Masalah rumah tangga kalian bisa jadi konsumsi teman-temannya sebelum sempat kamu selesaikan. Siap?",
    compromises: [
      "Stop total mengunggah kode atau sindiran masalah pasangan di medsos",
      "Bahas keluhan langsung ke pasangan sebelum cerita ke orang lain",
      "Pilih maksimal 1 sahabat dewasa yang bijak jika butuh teman cerita",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "young",
  },
  {
    id: "prv-11",
    segmentLabel: "Riwayat Finansial",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua pernah punya catatan gagal finansial atau tanggungan masa lalu yang bikin gua malu buat buka semuanya sekarang.",
    partnerPrompt:
      "Dia memiliki riwayat kegagalan finansial masa lalu yang belum dibuka sepenuhnya.",
    consequenceQuestion:
      "Kamu bisa kaget di kemudian hari jika riwayat kredit atau tanggungan lamanya baru terungkap. Sanggup?",
    compromises: [
      "Wajib saling cek SLIK OJK / riwayat kredit sebelum lamaran resmi",
      "Terbuka soal sisa kewajiban masa lalu agar bisa disusun strategi pelunasan",
      "Komitmen tidak ada utang baru yang disembunyikan setelah menikah",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "mid",
  },
  {
    id: "prv-12",
    segmentLabel: "Barang Kenangan",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua masih nyimpen beberapa barang pemberian mantan yang fungsional (kayak jam/tas) karena sayang kalau dibuang.",
    partnerPrompt:
      "Dia masih menyimpan dan memakai barang pemberian mantannya karena dianggap masih fungsional.",
    consequenceQuestion:
      "Kamu bakal sering melihat dia memakai barang pemberian mantannya dalam aktivitas sehari-hari. Oke?",
    compromises: [
      "Jual atau sumbangkan barang tersebut lalu ganti dengan yang baru",
      "Boleh disimpan di gudang selama tidak dipakai di depan pasangan",
      "Anggap murni sebagai benda fungsional tanpa mengaitkan masa lalu",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Perempuan",
    targetAge: "mid",
  },
  {
    id: "prv-13",
    segmentLabel: "Lingkaran Profesi",
    category: "Privasi & Masa Lalu",
    statement:
      "Mantan gua berada di lingkaran komunitas atau industri kerja yang sama, jadi gua masih sesekali ketemu di acara.",
    partnerPrompt:
      "Dia berada di komunitas atau industri kerja yang sama dengan mantannya sehingga masih sesekali bertemu.",
    consequenceQuestion:
      "Kamu harus siap menghadapi situasi di mana dia dan mantannya berada di satu acara yang sama. Kuat mental?",
    compromises: [
      "Wajib kasih tahu pasangan jika tahu akan hadir di acara yang sama",
      "Ajak pasangan ikut hadir di acara komunitas tersebut jika memungkinkan",
      "Jaga interaksi sebatas sapaan formal di tempat umum",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "Laki-laki",
    targetAge: "mature",
  },
  {
    id: "prv-14",
    segmentLabel: "Ruang Pribadi",
    category: "Privasi & Masa Lalu",
    statement:
      "Ada catatan pribadi dan obrolan grup keluarga gua yang haram dibuka pasangan walau kita udah serumah.",
    partnerPrompt:
      "Dia memiliki catatan pribadi dan obrolan keluarga yang dilarang keras kamu buka meski sudah menikah.",
    consequenceQuestion:
      "Kamu harus menghormati batas privasi ruang digital pribadinya tanpa merasa dicurigai. Setuju?",
    compromises: [
      "Sepakati zona privasi masing-masing yang tidak boleh dilanggar",
      "Saling percaya penuh tanpa kebiasaan memeriksa HP diam-diam",
      "Terbuka hanya pada hal-hal yang menyangkut keamanan dan keuangan bersama",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "Perempuan",
    targetAge: "mature",
  },
  {
    id: "prv-15",
    segmentLabel: "Jejak Masa Lalu",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua tipe orang yang kepo banget dan sering nge-stalk masa lalu pasangan maupun mantannya di internet.",
    partnerPrompt:
      "Dia sangat penasaran dan sering mencari tahu masa lalu kamu maupun mantanmu di media sosial.",
    consequenceQuestion:
      "Hal-hal lama sebelum kalian kenal bisa diungkit-ungkit dan jadi bahan pertengkaran baru. Sabar?",
    compromises: [
      "Tanyakan langsung hal yang bikin penasaran daripada stalking diam-diam",
      "Sepakat masa lalu sebelum jadian tidak boleh dijadikan senjata bertengkar",
      "Bersihkan jejak digital lama yang berpotensi memicu salah paham",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "all",
    targetAge: "young",
  },
  {
    id: "prv-16",
    segmentLabel: "Hobi & Komunitas",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua sering mabar game online atau ikut komunitas olahraga yang mayoritas anggotanya lawan jenis.",
    partnerPrompt:
      "Dia rutin bermain game online atau ikut komunitas hobi yang mayoritas anggotanya lawan jenis.",
    consequenceQuestion:
      "Dia punya teman mabar atau teman olahraga lawan jenis yang intens berkomunikasi dengannya. Terima?",
    compromises: [
      "Kenalkan teman komunitasnya dan ajak pasangan ikut sesekali",
      "Hindari obrolan pribadi di luar topik game atau jadwal olahraga",
      "Pasang foto profil berdua di akun game dan media sosial",
    ],
    botPref: { young: 1, mid: 0, mature: 2 },
    targetGender: "all",
    targetAge: "mid",
  },
  {
    id: "prv-17",
    segmentLabel: "Riwayat Medis",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua punya riwayat kondisi kesehatan fisik/mental tertentu yang butuh perhatian rutin seumur hidup.",
    partnerPrompt:
      "Dia memiliki riwayat kondisi kesehatan tertentu yang membutuhkan perhatian dan biaya rutin jangka panjang.",
    consequenceQuestion:
      "Kamu harus siap mendampingi proses kontrol kesehatan dan menjaga pola hidupnya setiap hari. Siap?",
    compromises: [
      "Lakukan pre-marital medical check-up lengkap secara transparan",
      "Siapkan asuransi kesehatan dan dana cadangan medis sejak awal",
      "Pelajari cara penanganan darurat kondisi kesehatannya bersama",
    ],
    botPref: { young: 2, mid: 1, mature: 0 },
    targetGender: "all",
    targetAge: "mature",
  },
  {
    id: "prv-18",
    segmentLabel: "Kebiasaan Digital",
    category: "Privasi & Masa Lalu",
    statement:
      "Gua punya kebiasaan rutin bersihin riwayat chat dan browser bukan karena selingkuh, tapi emang risih lihat menumpuk.",
    partnerPrompt:
      "Dia punya kebiasaan rutin menghapus riwayat chat dan pencarian browser dengan alasan risih menumpuk.",
    consequenceQuestion:
      "Riwayat chat yang selalu kosong bisa memicu rasa curiga seolah dia menyembunyikan sesuatu. Terima?",
    compromises: [
      "Arsipkan chat saja daripada dihapus permanen agar tidak memicu curiga",
      "Bangun keterbukaan komunikasi harian agar tidak perlu cek riwayat HP",
      "Hanya bersihkan cache file media tanpa menghapus riwayat percakapan",
    ],
    botPref: { young: 0, mid: 1, mature: 2 },
    targetGender: "Laki-laki",
    targetAge: "young",
  },
];

function getAgeGroup(age: number): "young" | "mid" | "mature" {
  if (age <= 24) return "young";
  if (age <= 32) return "mid";
  return "mature";
}

function filterAndRankByProfile(
  pool: QuestionItem[],
  gender: "Laki-laki" | "Perempuan",
  ageGroup: "young" | "mid" | "mature"
): QuestionItem[] {
  return pool
    .filter((item) => {
      const g = item.targetGender || "all";
      return g === "all" || g === gender;
    })
    .sort((a, b) => {
      const scoreA =
        (a.targetGender === gender ? 4 : 1) +
        (a.targetAge === ageGroup
          ? 3
          : !a.targetAge || a.targetAge === "all"
          ? 1
          : 0);
      const scoreB =
        (b.targetGender === gender ? 4 : 1) +
        (b.targetAge === ageGroup
          ? 3
          : !b.targetAge || b.targetAge === "all"
          ? 1
          : 0);
      return scoreB - scoreA;
    });
}

export function build20QuestionsForProfile(
  gender: "Laki-laki" | "Perempuan",
  age: number,
  theme: DeckTheme = "standar"
): QuestionItem[] {
  const ageGroup = getAgeGroup(age);
  const ageTag =
    age <= 24 ? "Fase Muda" : age <= 32 ? "Fase Dewasa" : "Fase Matang";
  const genderSuffix = gender === "Laki-laki" ? "Pria" : "Wanita";

  const rankedStandar = filterAndRankByProfile(
    STANDAR_QUESTIONS,
    gender,
    ageGroup
  );

  const themePoolMap: Record<DeckTheme, QuestionItem[]> = {
    standar: rankedStandar,
    finansial: [
      ...filterAndRankByProfile(FINANSIAL_QUESTIONS, gender, ageGroup),
      ...rankedStandar,
    ],
    keluarga: [
      ...filterAndRankByProfile(KELUARGA_QUESTIONS, gender, ageGroup),
      ...rankedStandar,
    ],
    privasi: [
      ...filterAndRankByProfile(PRIVASI_QUESTIONS, gender, ageGroup),
      ...rankedStandar,
    ],
  };

  const selectedPool = themePoolMap[theme] || rankedStandar;

  return selectedPool.slice(0, 20).map((item, idx) => ({
    ...item,
    id: `${theme}-${genderSuffix.toLowerCase()}-${idx + 1}`,
    segmentLabel: `${item.segmentLabel} • ${ageTag}`,
  }));
}
