/**
 * نصّ الصفحة التعريفية بخمس لغات — بلا مكتبة ترجمة.
 *
 * قاموس `src/lib/i18n` للموظفين: لغتان، ويُخزَّن الاختيار في المتصفح فلا يراه
 * الخادم. صفحة عامة تُشارَك وتُفهرَس تحتاج عنواناً لكل لغة (`/en`, `/ku`…)،
 * ونصّاً يُرسَل من الخادم جاهزاً. فالنصّ كلّه هنا، كائنٌ لكل لغة، والأنواع
 * تمنع أن تنقص لغةٌ سطراً.
 *
 * لا أرقام ولا نِسَب: كل جملة هنا شيء يقع في المحل فعلاً.
 */

export const SITE_LANGS = ["ar", "en", "tr", "it", "ku"] as const;
export type SiteLang = (typeof SITE_LANGS)[number];

/** العربية والكردية (السورانية) تُكتبان من اليمين */
export const isRtl = (lang: SiteLang) => lang === "ar" || lang === "ku";

/**
 * رمز اللغة الذي يُعلَن للمتصفّحات ومحرّكات البحث.
 *
 * مسار الصفحة يبقى `/ku` — روابط مطبوعة ومنشورة لا تُكسر. لكن `ku` رمزٌ جامع
 * يُفهم افتراضاً كرمانجي بالحرف اللاتيني من اليسار، ومحتوانا سورانيّ بالحرف
 * العربي من اليمين ورمزه `ckb`. الخطأ هنا يجعل جوجل يصنّف الصفحة لجمهور آخر
 * ويجعل القارئ الصوتي ينطقها بلغة أخرى.
 */
export const bcp47 = (lang: SiteLang): string => (lang === "ku" ? "ckb" : lang);

export const LANG_LABEL: Record<SiteLang, string> = {
  ar: "العربية",
  en: "English",
  tr: "Türkçe",
  it: "Italiano",
  ku: "کوردی",
};

export type Card = { title: string; body: string };
export type Qa = { q: string; a: string };

export type SiteCopy = {
  metaTitle: string;
  metaDescription: string;
  tagline: string;
  heroLead: string;
  heroTitle: string;
  scrollCue: string;
  nav: { about: string; why: string; menu: string; franchise: string; contact: string };
  ticker: string[];
  badge: string;
  deliveryTitle: string;
  deliveryLead: string;
  deliveryPoints: string[];
  faqTitle: string;
  faq: Qa[];
  order: string;
  learnMore: string;
  aboutTitle: string;
  about: string[];
  techTitle: string;
  techLead: string;
  tech: Card[];
  qualityTitle: string;
  qualityLead: string;
  quality: Card[];
  menuTitle: string;
  menuLead: string;
  menuCta: string;
  franchiseTitle: string;
  franchiseLead: string;
  franchisePoints: string[];
  form: {
    name: string;
    city: string;
    phone: string;
    note: string;
    notePlaceholder: string;
    submit: string;
    sending: string;
    done: string;
    errName: string;
    errCity: string;
    errPhone: string;
    errGeneric: string;
  };
  visitTitle: string;
  addressValue: string;
  hours: string;
  hoursValue: string;
  address: string;
  call: string;
  whatsapp: string;
  directions: string;
  staff: string;
  privacy: string;
  rights: string;
};

const ar: SiteCopy = {
  metaTitle: "ستيشن — أول مطعم تقني في الأنبار",
  metaDescription: "دجاج مقرمش وبيتزا وبرجر في الرمادي، وطلبٌ من هاتفك يصل المطبخ في ثانية. ستيشن — المحطة تفزع لك.",
  tagline: "المحطة تفزع لك",
  heroLead: "دجاج مقرمش بوصفتنا، بيتزا بعجين يومي، وتسعة صوصات تُحضَّر عندنا — في الرمادي، ومن هاتفك.",
  heroTitle: "دجاج مقرمش وبيتزا حارّة",
  scrollCue: "انزل لتشوف",
  nav: { about: "من نحن", why: "لماذا نحن", menu: "المنيو", franchise: "الوكالات", contact: "تواصل" },
  ticker: ["دجاج مقرمش", "بيتزا بعجين يومي", "تسعة صوصات", "برجر لحم طازج", "توصيل ساخن", "من ٩ صباحاً لـ٣ فجراً"],
  badge: "أول مطعم تقني في الأنبار",
  deliveryTitle: "نوصلك وهو حار",
  deliveryLead: "الطلب يخرج من المقلاة إلى الباب — لا يُحضَّر قبل أوانه ولا ينتظر على الرف.",
  deliveryPoints: ["يُقلى عند الطلب لا قبله", "علب تحفظ الحرارة والقرمشة", "تتبّع طلبك برسالة واتساب"],
  faqTitle: "أسئلة يسألها الناس",
  faq: [
    { q: "شنو أوقات الدوام؟", a: "كل يوم من ٩:٠٠ صباحاً حتى ٣:٠٠ فجراً، والطلب من الموقع متاح طوال هذه الساعات." },
    { q: "تجهزون توصيل؟", a: "نعم، داخل الرمادي — اطلب من الموقع أو واتساب ويصلك الطلب مع تنبيه بكل مرحلة." },
    { q: "أكدر أحجز طاولة؟", a: "الطاولات بالأسبقية، وللمناسبات والعزائم اتصل بنا وننظّمها لك." },
    { q: "شلون أفتح فرع ستيشن؟", a: "املأ نموذج الوكالة في هذه الصفحة ونتواصل معك لشرح الشروط والتكاليف." },
    { q: "اللحم والدجاج حلال؟", a: "نعم، كل لحومنا حلال ومن موردين معروفين، وتصلنا طازجة يومياً." },
  ],
  order: "اطلب الآن",
  learnMore: "تعرّف علينا",
  aboutTitle: "من نحن",
  about: [
    "ستيشن مطعم في الرمادي بدأ بفكرة واحدة: أكلٌ يستحقّ أن يُنتظر، ووقتٌ لا يُهدر في الانتظار. الدجاج يُتبَّل عندنا ويُقلى عند الطلب، والعجين يُعجن كل صباح، والصوصات التسعة تُحضَّر في مطبخنا لا تُشترى جاهزة.",
    "واسمه من معناه: محطة تقف عندها فتأخذ ما تحتاج وتمضي — «المحطة تفزع لك». طلبك من الطاولة أو من البيت أو من سيارتك، وكلّه على النظام نفسه.",
  ],
  techTitle: "أول مطعم تقني في الأنبار",
  techLead: "لا شاشات للزينة: كل ما هنا يعمل اليوم، وكل طلب يمرّ به.",
  tech: [
    { title: "اطلب من الطاولة", body: "امسح رمز الطاولة بكاميرا هاتفك، فيفتح المنيو بالصور والأسعار وترسل طلبك بلا أن تنادي أحداً." },
    { title: "المطبخ يرى طلبك فوراً", body: "ما إن يُقبل الطلب حتى يظهر على شاشة المطبخ وتُطبع تذكرة التجهيز — بلا ورقة تضيع ولا صنف يُنسى." },
    { title: "واتساب يخبرك", body: "رسالة حين يُقبل طلبك، ورسالة حين يجهز، ورسالة حين يستلمه موظف التوصيل." },
    { title: "رأيك يصل الإدارة", body: "بعد التسليم يسألك النظام عن الأكل والخدمة، والجواب يصل الإدارة مباشرة لا إلى دفتر ملاحظات." },
  ],
  qualityTitle: "لماذا يعود الناس",
  qualityLead: "ما لا يُرى في الصورة هو ما يصنع الطعم.",
  quality: [
    { title: "زيت يُبدَّل بجدول", body: "نستعمل زيت قلي عالي الجودة ويُبدَّل بموعده لا حين يسوء لونه — القرمشة والطعم يبدآن من هنا." },
    { title: "دجاج طازج يومياً", body: "يصلنا طازجاً ويُتبَّل في المطعم، ولا يُقلى إلا حين يُطلب." },
    { title: "عجين كل صباح", body: "عجين البيتزا يُحضَّر يومياً في المطبخ، والجبن موزاريلا كامل الدسم." },
    { title: "مطبخ يُرى", body: "مطبخنا مكشوف ونظافته جزء من الخدمة لا سرٌّ خلف باب." },
    { title: "تغليف يحفظ القرمشة", body: "علب تتنفّس فلا يصلك الدجاج طريّاً بعد الطريق." },
  ],
  menuTitle: "من المنيو",
  menuLead: "دجاج، ستربس، برجر، بيتزا، ريزو، فرايز، وصوصات ستيشن.",
  menuCta: "شوف المنيو كاملاً",
  franchiseTitle: "وكالات ستيشن — افتح فرعك",
  franchiseLead:
    "ستيشن يفتح بابه لشركاء في محافظات العراق: الاسم، والوصفات، والتدريب، والنظام الذي يدير المطعم كاملاً من أول طلب إلى جرد آخر الليل — جاهز ليعمل في مدينتك.",
  franchisePoints: [
    "وصفاتنا وتدريب فريقك في مطعمنا",
    "نظام ستيشن كاملاً: كاشير، مطبخ، توصيل، تقارير",
    "هوية بصرية جاهزة ودعم في التجهيز والافتتاح",
  ],
  form: {
    name: "اسمك",
    city: "المدينة",
    phone: "رقم الهاتف",
    note: "كلمة عنك (اختياري)",
    notePlaceholder: "خبرتك، والموقع الذي تفكّر به…",
    submit: "أرسل طلب الوكالة",
    sending: "جارٍ الإرسال…",
    done: "وصلنا طلبك ✅ نتواصل معك قريباً.",
    errName: "اكتب اسمك.",
    errCity: "اكتب اسم مدينتك.",
    errPhone: "رقم الهاتف غير صحيح — اكتبه هكذا: 07XXXXXXXXX",
    errGeneric: "تعذّر الإرسال الآن — حاول بعد قليل أو اتصل بنا.",
  },
  visitTitle: "زورنا أو اتصل",
  addressValue: "الرمادي، شارع المستودع، فلكة الفرسان",
  hours: "ساعات العمل",
  hoursValue: "كل يوم من ٩:٠٠ صباحاً حتى ٣:٠٠ فجراً",
  address: "العنوان",
  call: "اتصل بنا",
  whatsapp: "واتساب",
  directions: "الموقع على الخريطة",
  staff: "دخول الموظفين",
  privacy: "الخصوصية",
  rights: "ستيشن — الرمادي، العراق",
};

const en: SiteCopy = {
  metaTitle: "Station — Anbar's first tech-run restaurant",
  metaDescription: "Crispy chicken, pizza and burgers in Ramadi — ordered from your phone and in the kitchen a second later.",
  tagline: "Station has your back",
  heroLead: "Our own crispy chicken recipe, dough made every morning, nine sauces cooked in-house — in Ramadi, and on your phone.",
  heroTitle: "Crispy chicken, hot pizza",
  scrollCue: "Scroll to see",
  nav: { about: "About", why: "Why us", menu: "Menu", franchise: "Franchise", contact: "Contact" },
  ticker: ["Crispy chicken", "Dough made daily", "Nine sauces", "Fresh beef burgers", "Delivered hot", "9:00 to 03:00"],
  badge: "Anbar's first tech-run restaurant",
  deliveryTitle: "It reaches you hot",
  deliveryLead: "Your order goes from the fryer to your door — never cooked early, never waiting on a shelf.",
  deliveryPoints: ["Fried when you order, not before", "Boxes that hold heat and crunch", "Track it by WhatsApp message"],
  faqTitle: "What people ask",
  faq: [
    { q: "What are your hours?", a: "Every day from 9:00 in the morning until 03:00 at night, and the website takes orders the whole time." },
    { q: "Do you deliver?", a: "Yes, across Ramadi — order from the site or on WhatsApp and you get a message at every step." },
    { q: "Can I book a table?", a: "Tables are first come, first served; for gatherings call us and we will arrange it." },
    { q: "How do I open a Station branch?", a: "Fill in the franchise form on this page and we will contact you with the terms and costs." },
    { q: "Is the meat halal?", a: "Yes — all our meat is halal, from known suppliers, delivered fresh every day." },
  ],
  order: "Order now",
  learnMore: "About us",
  aboutTitle: "Who we are",
  about: [
    "Station is a restaurant in Ramadi built on one idea: food worth waiting for, and no time wasted waiting. Chicken is marinated here and fried to order, dough is made every morning, and all nine sauces are prepared in our kitchen — never bought ready-made.",
    "The name says it: a station you stop at, take what you need and go. Order at the table, from home, or from your car — all of it on the same system.",
  ],
  techTitle: "Anbar's first tech-run restaurant",
  techLead: "No screens for show — everything here runs today, and every order passes through it.",
  tech: [
    { title: "Order from your table", body: "Scan the table's code with your phone camera: the menu opens with photos and prices, and your order goes straight through." },
    { title: "The kitchen sees it instantly", body: "The moment an order is accepted it appears on the kitchen screen and a prep ticket prints — no lost slips, no forgotten item." },
    { title: "WhatsApp keeps you posted", body: "A message when your order is accepted, another when it is ready, another when the driver picks it up." },
    { title: "Your rating reaches the owner", body: "After delivery the system asks about the food and the service, and your answer goes straight to management." },
  ],
  qualityTitle: "Why people come back",
  qualityLead: "What you cannot see in a photo is what makes the taste.",
  quality: [
    { title: "Oil changed on schedule", body: "We use high-grade frying oil and change it on time — not when the colour finally turns. Crispiness starts there." },
    { title: "Fresh chicken daily", body: "Delivered fresh, marinated in-house, and fried only when you order it." },
    { title: "Dough every morning", body: "Pizza dough is made daily in our kitchen, with full-fat mozzarella." },
    { title: "An open kitchen", body: "Our kitchen is visible — cleanliness is part of the service, not a secret behind a door." },
    { title: "Packaging that keeps the crunch", body: "Boxes that breathe, so the chicken does not go soft on the way to you." },
  ],
  menuTitle: "From the menu",
  menuLead: "Chicken, strips, burgers, pizza, rizo, fries and Station sauces.",
  menuCta: "See the full menu",
  franchiseTitle: "Station franchises — open your branch",
  franchiseLead:
    "Station is opening its doors to partners across Iraq: the name, the recipes, the training, and the system that runs the whole restaurant — from the first order to the closing count — ready to work in your city.",
  franchisePoints: [
    "Our recipes, and training for your team in our kitchen",
    "The full Station system: cashier, kitchen, delivery, reports",
    "A ready brand identity and support through setup and opening",
  ],
  form: {
    name: "Your name",
    city: "City",
    phone: "Phone number",
    note: "A word about you (optional)",
    notePlaceholder: "Your experience, the location you have in mind…",
    submit: "Send franchise request",
    sending: "Sending…",
    done: "We got your request ✅ We'll be in touch soon.",
    errName: "Please write your name.",
    errCity: "Please write your city.",
    errPhone: "That phone number looks wrong — use 07XXXXXXXXX",
    errGeneric: "Could not send right now — try again shortly or call us.",
  },
  visitTitle: "Visit or call",
  addressValue: "Al-Mustawda' St., Fursan Roundabout, Ramadi, Iraq",
  hours: "Opening hours",
  hoursValue: "Every day, 9:00 to 03:00",
  address: "Address",
  call: "Call us",
  whatsapp: "WhatsApp",
  directions: "Open in maps",
  staff: "Staff sign-in",
  privacy: "Privacy",
  rights: "Station — Ramadi, Iraq",
};

const tr: SiteCopy = {
  metaTitle: "Station — Anbar'ın ilk teknoloji restoranı",
  metaDescription: "Ramadi'de çıtır tavuk, pizza ve burger — telefonunuzdan sipariş, bir saniyede mutfakta.",
  tagline: "Station yanınızda",
  heroLead: "Kendi tarifimizle çıtır tavuk, her sabah yoğrulan hamur ve mutfağımızda hazırlanan dokuz sos — Ramadi'de ve telefonunuzda.",
  heroTitle: "Çıtır tavuk, sıcak pizza",
  scrollCue: "Aşağı kaydırın",
  nav: { about: "Hakkımızda", why: "Neden biz", menu: "Menü", franchise: "Bayilik", contact: "İletişim" },
  ticker: ["Çıtır tavuk", "Her gün yoğrulan hamur", "Dokuz sos", "Taze dana burger", "Sıcak teslimat", "09:00 – 03:00"],
  badge: "Anbar'ın ilk teknoloji restoranı",
  deliveryTitle: "Size sıcak ulaşır",
  deliveryLead: "Siparişiniz fritözden kapınıza gider — erken pişirilmez, rafta beklemez.",
  deliveryPoints: ["Sipariş verilince kızartılır", "Isıyı ve çıtırlığı koruyan kutular", "WhatsApp mesajıyla takip"],
  faqTitle: "Sık sorulanlar",
  faq: [
    { q: "Çalışma saatleriniz nedir?", a: "Her gün 09:00'dan gece 03:00'e kadar; site bu saatler boyunca sipariş alır." },
    { q: "Teslimat yapıyor musunuz?", a: "Evet, Ramadi içinde — siteden ya da WhatsApp'tan sipariş verin, her aşamada mesaj alın." },
    { q: "Masa ayırtabilir miyim?", a: "Masalar geliş sırasına göredir; davetler için bizi arayın, biz ayarlayalım." },
    { q: "Nasıl Station şubesi açarım?", a: "Bu sayfadaki bayilik formunu doldurun; koşulları ve maliyetleri paylaşmak için sizi arayalım." },
    { q: "Etler helal mi?", a: "Evet, tüm etlerimiz helaldir, bilinen tedarikçilerden ve her gün taze gelir." },
  ],
  order: "Hemen sipariş ver",
  learnMore: "Hakkımızda",
  aboutTitle: "Biz kimiz",
  about: [
    "Station, Ramadi'de tek bir fikirle kuruldu: beklemeye değer yemek ve beklemede geçmeyen zaman. Tavuk burada marine edilir ve siparişle kızartılır, hamur her sabah yoğrulur, dokuz sosun hepsi mutfağımızda hazırlanır — hazır alınmaz.",
    "Adı da bunu söyler: uğradığınız, ihtiyacınızı alıp yolunuza devam ettiğiniz bir istasyon. Masadan, evden ya da arabanızdan sipariş — hepsi aynı sistem üzerinde.",
  ],
  techTitle: "Anbar'ın ilk teknoloji restoranı",
  techLead: "Gösteriş için ekran yok; buradaki her şey bugün çalışıyor ve her sipariş buradan geçiyor.",
  tech: [
    { title: "Masadan sipariş", body: "Masadaki kodu telefon kameranızla okutun: fotoğraflı ve fiyatlı menü açılır, siparişiniz doğrudan iletilir." },
    { title: "Mutfak anında görür", body: "Sipariş onaylandığı anda mutfak ekranında belirir ve hazırlık fişi yazdırılır — kaybolan kâğıt, unutulan ürün yok." },
    { title: "WhatsApp haber verir", body: "Siparişiniz alındığında, hazır olduğunda ve kurye teslim aldığında mesaj gelir." },
    { title: "Değerlendirmeniz yönetime ulaşır", body: "Teslimattan sonra sistem yemeği ve hizmeti sorar; cevabınız doğrudan yönetime gider." },
  ],
  qualityTitle: "İnsanlar neden geri geliyor",
  qualityLead: "Fotoğrafta görünmeyen şey, tadı yapan şeydir.",
  quality: [
    { title: "Yağ programlı değişir", body: "Yüksek kaliteli kızartma yağı kullanır ve rengi bozulunca değil, zamanında değiştiririz." },
    { title: "Her gün taze tavuk", body: "Taze gelir, restoranda marine edilir ve yalnızca sipariş verilince kızartılır." },
    { title: "Her sabah hamur", body: "Pizza hamuru her gün mutfağımızda hazırlanır; tam yağlı mozzarella kullanılır." },
    { title: "Açık mutfak", body: "Mutfağımız görünür; temizlik kapı arkasında bir sır değil, hizmetin parçasıdır." },
    { title: "Çıtırlığı koruyan ambalaj", body: "Nefes alan kutular — tavuk yolda yumuşamaz." },
  ],
  menuTitle: "Menüden",
  menuLead: "Tavuk, strips, burger, pizza, rizo, patates ve Station sosları.",
  menuCta: "Menünün tamamı",
  franchiseTitle: "Station bayilikleri — şubenizi açın",
  franchiseLead:
    "Station, Irak'ın illerindeki ortaklara kapısını açıyor: isim, tarifler, eğitim ve restoranın tamamını ilk siparişten gece sayımına kadar yöneten sistem — şehrinizde çalışmaya hazır.",
  franchisePoints: [
    "Tariflerimiz ve ekibinize mutfağımızda eğitim",
    "Station sisteminin tamamı: kasa, mutfak, teslimat, raporlar",
    "Hazır marka kimliği; kurulum ve açılış desteği",
  ],
  form: {
    name: "Adınız",
    city: "Şehir",
    phone: "Telefon numarası",
    note: "Kendinizden kısaca (isteğe bağlı)",
    notePlaceholder: "Deneyiminiz, düşündüğünüz konum…",
    submit: "Bayilik talebi gönder",
    sending: "Gönderiliyor…",
    done: "Talebiniz bize ulaştı ✅ Kısa sürede döneceğiz.",
    errName: "Lütfen adınızı yazın.",
    errCity: "Lütfen şehrinizi yazın.",
    errPhone: "Telefon numarası hatalı görünüyor — 07XXXXXXXXX biçiminde yazın.",
    errGeneric: "Şu anda gönderilemedi — birazdan tekrar deneyin ya da bizi arayın.",
  },
  visitTitle: "Ziyaret edin ya da arayın",
  addressValue: "Al-Mustawda' St., Fursan Roundabout, Ramadi, Iraq",
  hours: "Çalışma saatleri",
  hoursValue: "Her gün 09:00 – 03:00",
  address: "Adres",
  call: "Bizi arayın",
  whatsapp: "WhatsApp",
  directions: "Haritada aç",
  staff: "Personel girişi",
  privacy: "Gizlilik",
  rights: "Station — Ramadi, Irak",
};

const it: SiteCopy = {
  metaTitle: "Station — il primo ristorante tecnologico dell'Anbar",
  metaDescription: "Pollo croccante, pizza e burger a Ramadi: ordini dal telefono e un secondo dopo è in cucina.",
  tagline: "Station c'è per te",
  heroLead: "Pollo croccante con la nostra ricetta, impasto fatto ogni mattina e nove salse preparate in casa — a Ramadi e sul tuo telefono.",
  heroTitle: "Pollo croccante, pizza calda",
  scrollCue: "Scorri per vedere",
  nav: { about: "Chi siamo", why: "Perché noi", menu: "Menu", franchise: "Franchising", contact: "Contatti" },
  ticker: ["Pollo croccante", "Impasto fatto ogni giorno", "Nove salse", "Burger di manzo fresco", "Consegna calda", "9:00 – 03:00"],
  badge: "Il primo ristorante tecnologico dell'Anbar",
  deliveryTitle: "Ti arriva caldo",
  deliveryLead: "L'ordine va dalla friggitrice alla tua porta: mai cucinato in anticipo, mai fermo su uno scaffale.",
  deliveryPoints: ["Fritto quando ordini, non prima", "Scatole che tengono calore e croccantezza", "Lo segui con un messaggio WhatsApp"],
  faqTitle: "Le domande più frequenti",
  faq: [
    { q: "Quali sono gli orari?", a: "Tutti i giorni dalle 9:00 alle 03:00, e il sito prende ordini per tutto questo tempo." },
    { q: "Fate consegne?", a: "Sì, in tutta Ramadi: ordina dal sito o su WhatsApp e ricevi un messaggio a ogni passaggio." },
    { q: "Posso prenotare un tavolo?", a: "I tavoli sono in ordine di arrivo; per le occasioni chiamaci e organizziamo noi." },
    { q: "Come apro una sede Station?", a: "Compila il modulo di franchising in questa pagina e ti contattiamo con condizioni e costi." },
    { q: "La carne è halal?", a: "Sì: tutta la nostra carne è halal, da fornitori noti, consegnata fresca ogni giorno." },
  ],
  order: "Ordina ora",
  learnMore: "Chi siamo",
  aboutTitle: "Chi siamo",
  about: [
    "Station è un ristorante di Ramadi nato da un'idea sola: un cibo che vale l'attesa e un'attesa che non spreca tempo. Il pollo si marina qui e si frigge al momento, l'impasto si prepara ogni mattina e tutte e nove le salse nascono nella nostra cucina — mai comprate pronte.",
    "Il nome lo dice: una stazione dove ti fermi, prendi ciò che ti serve e riparti. Ordini al tavolo, da casa o dall'auto — sempre sullo stesso sistema.",
  ],
  techTitle: "Il primo ristorante tecnologico dell'Anbar",
  techLead: "Niente schermi per scena: qui tutto funziona davvero e ogni ordine ci passa.",
  tech: [
    { title: "Ordina dal tavolo", body: "Inquadra il codice del tavolo: si apre il menu con foto e prezzi e l'ordine parte subito." },
    { title: "La cucina lo vede subito", body: "Appena l'ordine è accettato compare sullo schermo della cucina e stampa il ticket — nessun foglio perso, nessun piatto dimenticato." },
    { title: "WhatsApp ti aggiorna", body: "Un messaggio quando l'ordine è accettato, uno quando è pronto, uno quando il corriere lo ritira." },
    { title: "Il tuo giudizio arriva alla direzione", body: "Dopo la consegna il sistema chiede del cibo e del servizio: la risposta va diritta a chi gestisce." },
  ],
  qualityTitle: "Perché si torna",
  qualityLead: "Ciò che non si vede in foto è ciò che fa il sapore.",
  quality: [
    { title: "Olio cambiato a calendario", body: "Usiamo olio di frittura di alta qualità e lo cambiamo quando va cambiato, non quando cambia colore." },
    { title: "Pollo fresco ogni giorno", body: "Arriva fresco, si marina qui e si frigge solo quando lo ordini." },
    { title: "Impasto ogni mattina", body: "L'impasto della pizza si fa ogni giorno in cucina, con mozzarella intera." },
    { title: "Cucina a vista", body: "La nostra cucina si vede: la pulizia è parte del servizio, non un segreto dietro una porta." },
    { title: "Confezioni che tengono il croccante", body: "Scatole che respirano: il pollo non si ammorbidisce per strada." },
  ],
  menuTitle: "Dal menu",
  menuLead: "Pollo, strips, burger, pizza, rizo, patatine e le salse Station.",
  menuCta: "Vedi tutto il menu",
  franchiseTitle: "Franchising Station — apri la tua sede",
  franchiseLead:
    "Station apre ai partner nelle province dell'Iraq: il nome, le ricette, la formazione e il sistema che gestisce l'intero ristorante — dal primo ordine alla chiusura di cassa — pronto per la tua città.",
  franchisePoints: [
    "Le nostre ricette e la formazione del tuo team nella nostra cucina",
    "Tutto il sistema Station: cassa, cucina, consegne, report",
    "Identità di marca pronta e supporto per allestimento e apertura",
  ],
  form: {
    name: "Il tuo nome",
    city: "Città",
    phone: "Numero di telefono",
    note: "Due parole su di te (facoltativo)",
    notePlaceholder: "La tua esperienza, la sede che hai in mente…",
    submit: "Invia richiesta",
    sending: "Invio…",
    done: "Richiesta ricevuta ✅ Ti contatteremo presto.",
    errName: "Scrivi il tuo nome.",
    errCity: "Scrivi la tua città.",
    errPhone: "Il numero non sembra valido — usa 07XXXXXXXXX",
    errGeneric: "Invio non riuscito — riprova tra poco o chiamaci.",
  },
  visitTitle: "Vieni o chiama",
  addressValue: "Al-Mustawda' St., Fursan Roundabout, Ramadi, Iraq",
  hours: "Orari",
  hoursValue: "Tutti i giorni, 9:00 – 03:00",
  address: "Indirizzo",
  call: "Chiamaci",
  whatsapp: "WhatsApp",
  directions: "Apri nelle mappe",
  staff: "Accesso staff",
  privacy: "Privacy",
  rights: "Station — Ramadi, Iraq",
};

const ku: SiteCopy = {
  metaTitle: "ستەیشن — یەکەم چێشتخانەی تەکنەلۆژی لە ئەنبار",
  metaDescription: "مریشکی برژاوی تەنوک، پیتزا و بەرگەر لە ڕەمادی — لە مۆبایلەکەتەوە داوا بکە و لە چرکەیەکدا لە چێشتخانە دەبێت.",
  tagline: "ستەیشن لەگەڵتدایە",
  heroLead: "مریشکی برژاو بە ڕەچەتەی خۆمان، هەویری هەموو بەیانییەک، و نۆ سۆسی ناوماڵ — لە ڕەمادی، و لە مۆبایلەکەتەوە.",
  heroTitle: "مریشکی تەنوک، پیتزای گەرم",
  scrollCue: "بۆ خوارەوە بڕۆ",
  nav: { about: "دەربارەمان", why: "بۆچی ئێمە", menu: "خواردنەکان", franchise: "نوێنەرایەتی", contact: "پەیوەندی" },
  ticker: ["مریشکی تەنوک", "هەویری ڕۆژانە", "نۆ سۆس", "بەرگەری گۆشتی تازە", "گەیاندنی گەرم", "٩:٠٠ بۆ ٣:٠٠"],
  badge: "یەکەم چێشتخانەی تەکنەلۆژی لە ئەنبار",
  deliveryTitle: "گەرم دەگاتە دەستت",
  deliveryLead: "داواکارییەکەت لە تاوەوە بۆ بەردەرگاکەت دەڕوات — پێشوەخت ناکرێت و لەسەر ڕەف ناوەستێت.",
  deliveryPoints: ["کاتێک داوای دەکەیت دەبرژێنرێت، نەک پێشتر", "قوتووی پاراستنی گەرمی و تەنوکی", "بە نامەی واتساپ چاودێری بکە"],
  faqTitle: "پرسیارە باوەکان",
  faq: [
    { q: "کاتژمێری کارکردن چۆنە؟", a: "هەموو ڕۆژێک لە ٩:٠٠ی بەیانییەوە تا ٣:٠٠ی دواین شەو، و ماڵپەڕەکەش بە درێژایی ئەو کاتە داواکاری وەردەگرێت." },
    { q: "گەیاندنتان هەیە؟", a: "بەڵێ، لە ناو ڕەمادی — لە ماڵپەڕ یان لە واتساپەوە داوا بکە، لە هەر قۆناغێکدا نامەیەکت بۆ دێت." },
    { q: "دەتوانم مێزێک پێشوەخت بگرم؟", a: "مێزەکان بە ڕیزبەندی کاتی هاتن دەبن؛ بۆ بۆنە و میوانداری پەیوەندیمان پێوە بکە و ڕێکی دەخەین." },
    { q: "چۆن لقێکی ستەیشن بکەمەوە؟", a: "فۆرمی نوێنەرایەتی لەم پەڕەیەدا پڕ بکەرەوە، ئێمە پەیوەندیت پێوە دەکەین بۆ ڕوونکردنەوەی مەرج و تێچوون." },
    { q: "گۆشت و مریشک حەڵاڵن؟", a: "بەڵێ، هەموو گۆشتەکانمان حەڵاڵن، لە دابینکەری ناسراوەوە، و ڕۆژانە بە تازەیی دەگەنێ." },
  ],
  order: "ئێستا داوا بکە",
  learnMore: "دەربارەی ئێمە",
  aboutTitle: "ئێمە کێین",
  about: [
    "ستەیشن چێشتخانەیەکە لە ڕەمادی کە بە یەک بیرۆکەوە دەستی پێکرد: خواردنێک شایەنی چاوەڕوانی بێت، و چاوەڕوانییەکەش بە فیڕۆ نەڕوات. مریشک لێرە تامدار دەکرێت و کاتێک داوای دەکەیت دەبرژێنرێت، هەویر هەموو بەیانییەک دەکرێت، و هەر نۆ سۆسەکە لە چێشتخانەی خۆماندا ئامادە دەبن.",
    "ناوەکەی خۆی دەیڵێت: وێستگەیەک کە لێی دەوەستیت، ئەوەی دەتەوێت وەردەگریت و دەڕۆیت. لە مێزەوە، لە ماڵەوە، یان لە ئۆتۆمبێلەکەتەوە — هەمووی لەسەر هەمان سیستەم.",
  ],
  techTitle: "یەکەم چێشتخانەی تەکنەلۆژی لە ئەنبار",
  techLead: "شاشەکان بۆ ڕازاندنەوە نین: هەرچی لێرەیە ئەمڕۆ کار دەکات و هەموو داواکارییەک بەناویدا تێدەپەڕێت.",
  tech: [
    { title: "لە مێزەکەتەوە داوا بکە", body: "کۆدی سەر مێزەکە بە کامێرای مۆبایلەکەت بخوێنەوە: خواردنەکان بە وێنە و نرخەوە دەکرێنەوە و داواکارییەکەت ڕاستەوخۆ دەنێردرێت." },
    { title: "چێشتخانە دەستبەجێ دەیبینێت", body: "هەرکە داواکاری پەسەند بکرێت لەسەر شاشەی چێشتخانە دەردەکەوێت و پسووڵەی ئامادەکردنی بۆ دەردەچێت — هیچ کاغەزێک ون نابێت." },
    { title: "واتساپ ئاگادارت دەکاتەوە", body: "نامەیەک کاتێک داواکارییەکەت وەردەگیرێت، یەکێکی تر کاتێک ئامادە دەبێت، و یەکێک کاتێک گەیەنەر وەریدەگرێت." },
    { title: "هەڵسەنگاندنت دەگاتە بەڕێوەبەر", body: "دوای وەرگرتن، سیستەمەکە دەربارەی خواردن و خزمەتگوزاری پرسیارت لێ دەکات، و وەڵامەکەت ڕاستەوخۆ دەگاتە بەڕێوەبەرایەتی." },
  ],
  qualityTitle: "بۆچی خەڵک دێنەوە",
  qualityLead: "ئەوەی لە وێنەکاندا نادیارە، هەر ئەوەیە تامەکە دروست دەکات.",
  quality: [
    { title: "زەیت بە کاتی خۆی دەگۆڕدرێت", body: "زەیتی برژاندنی باش بەکاردەهێنین و بە خشتەیەکی دیاریکراو دەیگۆڕین، نەک کاتێک ڕەنگی دەگۆڕێت." },
    { title: "مریشکی تازەی ڕۆژانە", body: "تازە دەگاتێ، لە چێشتخانەدا تامدار دەکرێت، و تەنها کاتێک داوای دەکەیت دەبرژێنرێت." },
    { title: "هەویر هەموو بەیانییەک", body: "هەویری پیتزا ڕۆژانە لە چێشتخانەی خۆماندا دەکرێت، بە مۆزارێلای تەواوەوە." },
    { title: "چێشتخانەی کراوە", body: "چێشتخانەکەمان دیارە: پاکوخاوێنی بەشێکە لە خزمەتگوزاری، نە نهێنییەک لە پشت دەرگاوە." },
    { title: "پاکەتی پاراستنی تەنوکی", body: "قوتووی هەناسەدەر — مریشک لە ڕێگادا نەرم نابێت." },
  ],
  menuTitle: "لە خواردنەکانمان",
  menuLead: "مریشک، ستریپس، بەرگەر، پیتزا، ڕیزۆ، فرایز و سۆسەکانی ستەیشن.",
  menuCta: "هەموو خواردنەکان ببینە",
  franchiseTitle: "نوێنەرایەتی ستەیشن — لقی خۆت بکەرەوە",
  franchiseLead:
    "ستەیشن دەرگای بۆ هاوبەشان لە پارێزگاکانی عێراق کردووەتەوە: ناوەکە، ڕەچەتەکان، ڕاهێنان، و ئەو سیستەمەی هەموو چێشتخانەکە بەڕێوە دەبات — لە یەکەم داواکارییەوە تا ژماردنی کۆتایی شەو.",
  franchisePoints: [
    "ڕەچەتەکانمان و ڕاهێنانی تیمەکەت لە چێشتخانەی خۆماندا",
    "سیستەمی ستەیشن بە تەواوی: کاشێر، چێشتخانە، گەیاندن، ڕاپۆرت",
    "ناسنامەی بازرگانی ئامادە و پشتیوانی لە ئامادەکاری و کردنەوەدا",
  ],
  form: {
    name: "ناوت",
    city: "شار",
    phone: "ژمارەی مۆبایل",
    note: "وشەیەک دەربارەی خۆت (ئارەزوومەندانە)",
    notePlaceholder: "ئەزموونەکەت، ئەو شوێنەی لە بیرتدایە…",
    submit: "داواکاری نوێنەرایەتی بنێرە",
    sending: "دەنێردرێت…",
    done: "داواکارییەکەت گەیشت ✅ بەم زووانە پەیوەندیت پێوە دەکەین.",
    errName: "تکایە ناوەکەت بنووسە.",
    errCity: "تکایە شارەکەت بنووسە.",
    errPhone: "ژمارەکە دروست نییە — بەم شێوەیە بنووسە: 07XXXXXXXXX",
    errGeneric: "ئێستا نەنێردرا — دواتر هەوڵ بدەرەوە یان پەیوەندیمان پێوە بکە.",
  },
  visitTitle: "سەردانمان بکە یان پەیوەندیمان پێوە بکە",
  addressValue: "ڕەمادی، شەقامی مەخزەن، خولانەی فوورسان",
  hours: "کاتژمێری کارکردن",
  hoursValue: "هەموو ڕۆژێک لە ٩:٠٠ی بەیانی تا ٣:٠٠ی دواین شەو",
  address: "ناونیشان",
  call: "پەیوەندیمان پێوە بکە",
  whatsapp: "واتساپ",
  directions: "لە نەخشەدا بیکەرەوە",
  staff: "چوونەژوورەوەی کارمەندان",
  privacy: "تایبەتێتی",
  rights: "ستەیشن — ڕەمادی، عێراق",
};

export const SITE: Record<SiteLang, SiteCopy> = { ar, en, tr, it, ku };
