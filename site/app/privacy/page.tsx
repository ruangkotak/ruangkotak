import { Footer } from "@/components/footer";
import { Logo } from "@/components/logo";
import { BUSINESS, NOTICE_VERSION } from "@/lib/legal";

export const metadata = {
  title: "Privacy Notice | Notis Privasi | RUANGKOTAK",
  description: "How RUANGKOTAK collects, uses and protects your personal data under the Personal Data Protection Act 2010.",
};

// Written notice under PDPA 2010 s7 (Notice and Choice), in both English and Bahasa Melayu as s7(3) requires.
// The English text prevails if the two differ. Bump NOTICE_VERSION in lib/legal.ts whenever this changes.

type Section = { h: string; p: (string | string[])[] };

const who = `${BUSINESS.name}${BUSINESS.registration ? ` (${BUSINESS.registration})` : ""}`;

const EN: Section[] = [
  {
    h: "Who we are",
    p: [
      `${who} runs ${BUSINESS.site}, an account diagnosis service for TikTok and Instagram creators in Malaysia. We are the data user responsible for your personal data under the Personal Data Protection Act 2010 (PDPA).`,
    ],
  },
  {
    h: "What we collect",
    p: [
      [
        "What you give us: your name, email, WhatsApp number (optional), your TikTok or Instagram handle, and anything you write in the monthly application.",
        "Public data from the account you enter: recent public videos, their captions, cover images, view counts and posting dates, and the follower count.",
        "Technical data: your IP address and approximate country, a cookie (rk_dev) and a browser storage id (rk_id) that let each device get one free mini-diagnosis, and a session flag (rk_intro) that remembers you have seen the opening animation.",
        "Your consent: which boxes you ticked, when, from which IP address, and the version of this notice.",
      ],
    ],
  },
  {
    h: "Why we use it",
    p: [
      [
        "To prepare your mini-diagnosis and show it to you.",
        "To email you the link to your mini-diagnosis.",
        "To review a monthly application and reply with a quote.",
        "To stop misuse, such as one device requesting many free diagnoses.",
        "Only if you tick the optional box: to contact you about the monthly service and send occasional tips.",
      ],
      "We do not sell your personal data, and we do not use it for anything else without asking you first.",
    ],
  },
  {
    h: "What you must give, and what is optional",
    p: [
      "Your name, email, account handle and the two required consent boxes are needed to prepare and send a mini-diagnosis. Without them we cannot provide it. Your WhatsApp number and the follow-up box are optional; leaving them out changes nothing about your mini-diagnosis.",
    ],
  },
  {
    h: "Who we share it with",
    p: [
      "We use service providers who process data only on our instructions:",
      [
        "Vercel (website hosting)",
        "Upstash (database)",
        "Resend (sending email)",
        "Telegram (internal alerts to our team)",
        "Apify (collecting public videos from the account you enter)",
        "TypeSafe and Anthropic (AI analysis of captions and results)",
      ],
      "We may also disclose data where the law requires it.",
    ],
  },
  {
    h: "Transfers outside Malaysia",
    p: [
      "Some of these providers store or process data outside Malaysia, including in the United States. We transfer data under section 129 of the PDPA with your consent and choose providers that protect data to a standard at least as high as the PDPA requires.",
    ],
  },
  {
    h: "How long we keep it",
    p: [
      "Mini-diagnoses and the contact details that came with them are deleted 12 months after they were created, unless you become a monthly client. Client records are kept for the length of the service and as long as tax and accounting law requires after it ends. Consent records are kept as long as the data they cover.",
    ],
  },
  {
    h: "How we protect it",
    p: [
      "Data travels over HTTPS. Only our team can see leads and applications. Each mini-diagnosis link is long and random, and is not listed or indexed by search engines. If a data breach causes or is likely to cause significant harm, we will notify the Personal Data Protection Commissioner within 72 hours and tell affected people without unnecessary delay.",
    ],
  },
  {
    h: "Your rights",
    p: [
      [
        "See a copy of the personal data we hold about you (we reply within 21 days).",
        "Correct data that is wrong or out of date.",
        "Withdraw consent, or ask us to stop processing or delete your data.",
        "Stop follow-ups and tips at any time. We will stop direct marketing as soon as you ask.",
      ],
      `Email ${BUSINESS.email}, or reply to any email from us, from the address you gave us. There is no charge.`,
    ],
  },
  {
    h: "Under 18",
    p: [
      "If you are under 18, a parent or guardian must agree before you send us your details. If we learn we hold data from someone under 18 without that agreement, we delete it.",
    ],
  },
  {
    h: "Questions and complaints",
    p: [
      `Email ${BUSINESS.email}, or reply to any email from us. If you are not satisfied with our reply, you may complain to the Personal Data Protection Department (Jabatan Perlindungan Data Peribadi) at pdp.gov.my.`,
    ],
  },
  {
    h: "Changes",
    p: ["If we change this notice, we update the date below. Consent you gave stays tied to the version you saw."],
  },
];

const MS: Section[] = [
  {
    h: "Siapa kami",
    p: [
      `${who} mengendalikan ${BUSINESS.site}, perkhidmatan diagnosis akaun untuk pencipta kandungan TikTok dan Instagram di Malaysia. Kami ialah pengguna data yang bertanggungjawab ke atas data peribadi anda di bawah Akta Perlindungan Data Peribadi 2010 (APDP).`,
    ],
  },
  {
    h: "Apa yang kami kumpul",
    p: [
      [
        "Yang anda berikan: nama, e-mel, nombor WhatsApp (pilihan), nama pengguna TikTok atau Instagram anda, dan apa-apa yang anda tulis dalam permohonan bulanan.",
        "Data awam daripada akaun yang anda masukkan: video awam terkini, kapsyen, imej muka depan, bilangan tontonan dan tarikh siaran, serta bilangan pengikut.",
        "Data teknikal: alamat IP dan anggaran negara anda, kuki (rk_dev) dan id storan pelayar (rk_id) supaya setiap peranti mendapat satu diagnosis mini percuma, dan penanda sesi (rk_intro) yang mengingati anda sudah melihat animasi pembukaan.",
        "Persetujuan anda: kotak yang anda tandakan, bila, dari alamat IP mana, dan versi notis ini.",
      ],
    ],
  },
  {
    h: "Mengapa kami menggunakannya",
    p: [
      [
        "Untuk menyediakan diagnosis mini anda dan memaparkannya kepada anda.",
        "Untuk menghantar pautan diagnosis mini anda melalui e-mel.",
        "Untuk menyemak permohonan bulanan dan membalas dengan sebut harga.",
        "Untuk mencegah penyalahgunaan, seperti satu peranti meminta banyak diagnosis percuma.",
        "Hanya jika anda menandakan kotak pilihan: untuk menghubungi anda tentang perkhidmatan bulanan dan menghantar tip sekali-sekala.",
      ],
      "Kami tidak menjual data peribadi anda, dan tidak menggunakannya untuk tujuan lain tanpa bertanya kepada anda terlebih dahulu.",
    ],
  },
  {
    h: "Apa yang wajib dan apa yang pilihan",
    p: [
      "Nama, e-mel, nama pengguna akaun dan dua kotak persetujuan wajib diperlukan untuk menyediakan dan menghantar diagnosis mini. Tanpanya kami tidak dapat menyediakannya. Nombor WhatsApp dan kotak susulan adalah pilihan; jika tidak diisi, diagnosis mini anda tetap sama.",
    ],
  },
  {
    h: "Dengan siapa kami berkongsi",
    p: [
      "Kami menggunakan pembekal perkhidmatan yang memproses data hanya mengikut arahan kami:",
      [
        "Vercel (pengehosan laman web)",
        "Upstash (pangkalan data)",
        "Resend (penghantaran e-mel)",
        "Telegram (makluman dalaman kepada pasukan kami)",
        "Apify (mengumpul video awam daripada akaun yang anda masukkan)",
        "TypeSafe dan Anthropic (analisis AI kapsyen dan keputusan)",
      ],
      "Kami juga boleh mendedahkan data jika dikehendaki oleh undang-undang.",
    ],
  },
  {
    h: "Pemindahan ke luar Malaysia",
    p: [
      "Sebahagian pembekal ini menyimpan atau memproses data di luar Malaysia, termasuk di Amerika Syarikat. Kami memindahkan data di bawah seksyen 129 APDP dengan persetujuan anda dan memilih pembekal yang melindungi data sekurang-kurangnya setara dengan kehendak APDP.",
    ],
  },
  {
    h: "Berapa lama kami menyimpannya",
    p: [
      "Diagnosis mini dan butiran hubungan yang disertakan dipadam 12 bulan selepas ia dibuat, melainkan anda menjadi pelanggan bulanan. Rekod pelanggan disimpan sepanjang tempoh perkhidmatan dan selama yang dikehendaki undang-undang cukai dan perakaunan selepas ia tamat. Rekod persetujuan disimpan selama data yang berkaitan disimpan.",
    ],
  },
  {
    h: "Bagaimana kami melindunginya",
    p: [
      "Data dihantar melalui HTTPS. Hanya pasukan kami boleh melihat bakal pelanggan dan permohonan. Setiap pautan diagnosis mini panjang dan rawak, dan tidak disenaraikan atau diindeks oleh enjin carian. Jika pelanggaran data menyebabkan atau mungkin menyebabkan kemudaratan yang ketara, kami akan memaklumkan Pesuruhjaya Perlindungan Data Peribadi dalam masa 72 jam dan memberitahu orang yang terjejas tanpa kelewatan yang tidak wajar.",
    ],
  },
  {
    h: "Hak anda",
    p: [
      [
        "Melihat salinan data peribadi anda yang kami simpan (kami membalas dalam masa 21 hari).",
        "Membetulkan data yang salah atau lapuk.",
        "Menarik balik persetujuan, atau meminta kami berhenti memproses atau memadam data anda.",
        "Menghentikan susulan dan tip pada bila-bila masa. Kami akan berhenti pemasaran langsung sebaik sahaja anda meminta.",
      ],
      `E-mel ${BUSINESS.email}, atau balas mana-mana e-mel daripada kami, daripada alamat yang anda berikan. Tiada caj.`,
    ],
  },
  {
    h: "Bawah 18 tahun",
    p: [
      "Jika anda berumur bawah 18 tahun, ibu bapa atau penjaga mesti bersetuju sebelum anda menghantar butiran anda. Jika kami dapati kami menyimpan data seseorang bawah 18 tahun tanpa persetujuan itu, kami akan memadamnya.",
    ],
  },
  {
    h: "Pertanyaan dan aduan",
    p: [
      `E-mel ${BUSINESS.email}, atau balas mana-mana e-mel daripada kami. Jika anda tidak berpuas hati dengan jawapan kami, anda boleh membuat aduan kepada Jabatan Perlindungan Data Peribadi di pdp.gov.my.`,
    ],
  },
  {
    h: "Perubahan",
    p: ["Jika kami mengubah notis ini, kami mengemas kini tarikh di bawah. Persetujuan yang anda berikan kekal terikat kepada versi yang anda lihat."],
  },
];

function Notice({ id, lang, title, sections, updated }: { id: string; lang: string; title: string; sections: Section[]; updated: string }) {
  return (
    <section id={id} lang={lang} className="scroll-mt-8">
      <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted">
        {updated} {NOTICE_VERSION}
      </p>
      <div className="mt-10 grid gap-9">
        {sections.map((s) => (
          <div key={s.h}>
            <h2 className="text-xl font-semibold tracking-tight">{s.h}</h2>
            {s.p.map((b, i) =>
              Array.isArray(b) ? (
                <ul key={i} className="mt-3 grid list-disc gap-2 pl-5 text-muted">
                  {b.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ) : (
                <p key={i} className="mt-3 max-w-[68ch] text-muted">
                  {b}
                </p>
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <main className="mx-auto max-w-[860px] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-12 flex flex-wrap items-center justify-between gap-4">
          <a href="/" aria-label="RUANGKOTAK home">
            <Logo className="h-[16px] w-auto" />
          </a>
          <nav aria-label="Language" className="flex gap-1 border border-line p-1 text-sm font-medium">
            <a href="#en" className="px-3 py-1.5 hover:bg-surface">English</a>
            <a href="#ms" className="px-3 py-1.5 hover:bg-surface">Bahasa Melayu</a>
          </nav>
        </div>
        <Notice id="en" lang="en" title="Privacy Notice" sections={EN} updated="Last updated" />
        <hr className="my-16 border-line" />
        <Notice id="ms" lang="ms" title="Notis Privasi" sections={MS} updated="Kemas kini terakhir" />
        <p className="mt-16 border-t border-line pt-6 text-sm text-muted">
          If the English and Bahasa Melayu versions differ, the English version prevails. / Jika terdapat percanggahan, versi Bahasa Inggeris diguna pakai.
        </p>
      </main>
      <Footer />
    </>
  );
}
