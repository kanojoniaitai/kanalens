import fs from "fs";
import path from "path";
import crypto from "crypto";
import initSqlJs from "sql.js";
import { nanoid } from "nanoid";

const DB_PATH = process.env.KANALENS_DB_PATH || path.join(process.cwd(), "data", "kanalens.db");
const RUN_ID = process.env.SEED_RUN_ID || "basic-material-v1";
const PER_TOPIC = Number(process.env.SEED_PER_TOPIC || 99);
const TIER = process.env.SEED_TIER || "normal";
const REPAIR_EXISTING = process.env.SEED_REPAIR_EXISTING === "1";
const MODEL_LABEL = "local-structured-seed-v2";
const APPROVED_STATUS = "approved";

const TOPIC_PRESETS = [
  {
    id: "seed-topic-daily-life",
    name: "日常生活",
    prompt: "Write natural Japanese prose about ordinary daily life: mornings, errands, small decisions, neighbors, chores, and quiet discoveries.",
  },
  {
    id: "seed-topic-school-learning",
    name: "学校と学習",
    prompt: "Write a Japanese passage about school, self-study, language learning, exams, clubs, teachers, libraries, or small academic frustrations.",
  },
  {
    id: "seed-topic-work-society",
    name: "仕事と社会",
    prompt: "Write a Japanese passage about workplaces, part-time jobs, meetings, customer service, social expectations, commuting, or career choices.",
  },
  {
    id: "seed-topic-city-transit",
    name: "都市と移動",
    prompt: "Write atmospheric Japanese prose about urban streets, stations, trains, buses, night walks, crowds, announcements, maps, and missed connections.",
  },
  {
    id: "seed-topic-travel-landscape",
    name: "旅と風景",
    prompt: "Write Japanese travel prose about inns, small towns, coastlines, mountains, museums, local shops, weather, and encounters during a journey.",
  },
  {
    id: "seed-topic-food-kitchen",
    name: "食と台所",
    prompt: "Write a Japanese passage centered on food, cooking, shopping streets, family meals, cafes, recipes, smells, textures, or seasonal ingredients.",
  },
  {
    id: "seed-topic-family-relationships",
    name: "家族と人間関係",
    prompt: "Write Japanese prose about family, friendship, distance, reconciliation, messages left unread, small kindnesses, and misunderstandings.",
  },
  {
    id: "seed-topic-health-mind",
    name: "健康と心",
    prompt: "Write a Japanese passage about rest, stress, sleep, habits, illness, clinics, exercise, self-care, or mental state.",
  },
  {
    id: "seed-topic-science-tech",
    name: "科学とテクノロジー",
    prompt: "Write accessible Japanese prose about technology, science news, smartphones, AI, robots, laboratories, environmental measurement, or everyday tools.",
  },
  {
    id: "seed-topic-history-memory",
    name: "歴史と記憶",
    prompt: "Write Japanese prose about memory, old photographs, local history, museums, inherited objects, festivals, archives, or traces of the past.",
  },
  {
    id: "seed-topic-art-music",
    name: "芸術と音楽",
    prompt: "Write a Japanese passage about painting, music practice, concerts, galleries, theater, dance, craft, or the private discipline behind art.",
  },
  {
    id: "seed-topic-mystery",
    name: "ミステリー",
    prompt: "Write a compact Japanese mystery or suspense scene with clues, atmosphere, withheld information, and natural dialogue.",
  },
  {
    id: "seed-topic-nature-seasons",
    name: "自然と季節",
    prompt: "Write Japanese prose about seasons, weather, gardens, rivers, insects, forests, flowers, typhoons, snow, or the feeling of a changing sky.",
  },
  {
    id: "seed-topic-news-commentary",
    name: "ニュースと評論",
    prompt: "Write a Japanese passage in a light essay or commentary style about public life, local news, social habits, media, or community issues.",
  },
  {
    id: "seed-topic-fantasy",
    name: "ファンタジー",
    prompt: "Write a Japanese fantasy scene with a clear situation, magical object, unfamiliar town, forest path, quiet danger, or mythical rule.",
  },
];

const PROFILES = {
  daily: {
    title: ["朝の台所", "小さな用事", "夕方の洗濯物", "商店街の帰り道"],
    setting: seg("台所", "だいどころ", true),
    actor: seg("私", "わたし", true),
    companion: seg("隣人", "りんじん", true),
    object: seg("買い物袋", "かいものぶくろ", true),
    action: seg("片づけた", "かたづけた", true),
    feeling: seg("穏やかな", "おだやかな", true),
    sound: seg("時計", "とけい", true),
    extra: seg("生活", "せいかつ", true),
    gloss: [
      gloss("台所", "だいどころ", "noun", "kitchen"),
      gloss("隣人", "りんじん", "noun", "neighbor"),
      gloss("買い物袋", "かいものぶくろ", "noun", "shopping bag"),
      gloss("片づける", "かたづける", "verb", "to tidy up"),
      gloss("穏やか", "おだやか", "adjective", "calm"),
      gloss("時計", "とけい", "noun", "clock"),
      gloss("生活", "せいかつ", "noun", "daily life"),
      gloss("窓", "まど", "noun", "window"),
    ],
  },
  school: {
    title: ["放課後のノート", "図書室の約束", "試験前の雨", "机の上の消し跡"],
    setting: seg("図書室", "としょしつ", true),
    actor: seg("学生", "がくせい", true),
    companion: seg("先生", "せんせい", true),
    object: seg("ノート", "のーと", false),
    action: seg("書き直した", "かきなおした", true),
    feeling: seg("静かな", "しずかな", true),
    sound: seg("鉛筆", "えんぴつ", true),
    extra: seg("勉強", "べんきょう", true),
    gloss: [
      gloss("図書室", "としょしつ", "noun", "library room"),
      gloss("学生", "がくせい", "noun", "student"),
      gloss("先生", "せんせい", "noun", "teacher"),
      gloss("ノート", "のーと", "noun", "notebook"),
      gloss("書き直す", "かきなおす", "verb", "to rewrite"),
      gloss("静か", "しずか", "adjective", "quiet"),
      gloss("鉛筆", "えんぴつ", "noun", "pencil"),
      gloss("勉強", "べんきょう", "noun", "study"),
    ],
  },
  work: {
    title: ["会議室の午後", "駅前の名刺", "残業前の缶コーヒー", "受付の小さな声"],
    setting: seg("会議室", "かいぎしつ", true),
    actor: seg("社員", "しゃいん", true),
    companion: seg("上司", "じょうし", true),
    object: seg("資料", "しりょう", true),
    action: seg("確認した", "かくにんした", true),
    feeling: seg("慎重な", "しんちょうな", true),
    sound: seg("電話", "でんわ", true),
    extra: seg("仕事", "しごと", true),
    gloss: [
      gloss("会議室", "かいぎしつ", "noun", "meeting room"),
      gloss("社員", "しゃいん", "noun", "employee"),
      gloss("上司", "じょうし", "noun", "supervisor"),
      gloss("資料", "しりょう", "noun", "documents"),
      gloss("確認する", "かくにんする", "verb", "to confirm"),
      gloss("慎重", "しんちょう", "adjective", "careful"),
      gloss("電話", "でんわ", "noun", "telephone"),
      gloss("仕事", "しごと", "noun", "work"),
    ],
  },
  city: {
    title: ["終電前のホーム", "地下道の青い表示", "雨上がりの交差点", "バス停の影"],
    setting: seg("駅", "えき", true),
    actor: seg("旅人", "たびびと", true),
    companion: seg("運転手", "うんてんしゅ", true),
    object: seg("切符", "きっぷ", true),
    action: seg("握りしめた", "にぎりしめた", true),
    feeling: seg("慌ただしい", "あわただしい", true),
    sound: seg("案内放送", "あんないほうそう", true),
    extra: seg("街", "まち", true),
    gloss: [
      gloss("駅", "えき", "noun", "station"),
      gloss("旅人", "たびびと", "noun", "traveler"),
      gloss("運転手", "うんてんしゅ", "noun", "driver"),
      gloss("切符", "きっぷ", "noun", "ticket"),
      gloss("握りしめる", "にぎりしめる", "verb", "to clutch"),
      gloss("慌ただしい", "あわただしい", "adjective", "busy, hurried"),
      gloss("案内放送", "あんないほうそう", "noun", "announcement"),
      gloss("街", "まち", "noun", "town, city"),
    ],
  },
  travel: {
    title: ["岬の宿", "山道の地図", "港町の朝", "古い旅館の廊下"],
    setting: seg("旅館", "りょかん", true),
    actor: seg("旅行者", "りょこうしゃ", true),
    companion: seg("女将", "おかみ", true),
    object: seg("地図", "ちず", true),
    action: seg("広げた", "ひろげた", true),
    feeling: seg("懐かしい", "なつかしい", true),
    sound: seg("波音", "なみおと", true),
    extra: seg("風景", "ふうけい", true),
    gloss: [
      gloss("旅館", "りょかん", "noun", "Japanese inn"),
      gloss("旅行者", "りょこうしゃ", "noun", "traveler"),
      gloss("女将", "おかみ", "noun", "inn hostess"),
      gloss("地図", "ちず", "noun", "map"),
      gloss("広げる", "ひろげる", "verb", "to spread out"),
      gloss("懐かしい", "なつかしい", "adjective", "nostalgic"),
      gloss("波音", "なみおと", "noun", "sound of waves"),
      gloss("風景", "ふうけい", "noun", "landscape"),
    ],
  },
  food: {
    title: ["味噌汁の湯気", "商店街の惣菜", "夜の喫茶店", "台所の白い皿"],
    setting: seg("食堂", "しょくどう", true),
    actor: seg("料理人", "りょうりにん", true),
    companion: seg("客", "きゃく", true),
    object: seg("味噌汁", "みそしる", true),
    action: seg("温めた", "あたためた", true),
    feeling: seg("香ばしい", "こうばしい", true),
    sound: seg("湯気", "ゆげ", true),
    extra: seg("食卓", "しょくたく", true),
    gloss: [
      gloss("食堂", "しょくどう", "noun", "dining hall"),
      gloss("料理人", "りょうりにん", "noun", "cook"),
      gloss("客", "きゃく", "noun", "customer"),
      gloss("味噌汁", "みそしる", "noun", "miso soup"),
      gloss("温める", "あたためる", "verb", "to warm"),
      gloss("香ばしい", "こうばしい", "adjective", "fragrant, savory"),
      gloss("湯気", "ゆげ", "noun", "steam"),
      gloss("食卓", "しょくたく", "noun", "dining table"),
    ],
  },
  relationship: {
    title: ["返信のない夜", "母の古い手紙", "友人の傘", "窓辺の約束"],
    setting: seg("部屋", "へや", true),
    actor: seg("私", "わたし", true),
    companion: seg("友人", "ゆうじん", true),
    object: seg("手紙", "てがみ", true),
    action: seg("読み返した", "よみかえした", true),
    feeling: seg("寂しい", "さびしい", true),
    sound: seg("沈黙", "ちんもく", true),
    extra: seg("約束", "やくそく", true),
    gloss: [
      gloss("部屋", "へや", "noun", "room"),
      gloss("私", "わたし", "pronoun", "I"),
      gloss("友人", "ゆうじん", "noun", "friend"),
      gloss("手紙", "てがみ", "noun", "letter"),
      gloss("読み返す", "よみかえす", "verb", "to reread"),
      gloss("寂しい", "さびしい", "adjective", "lonely"),
      gloss("沈黙", "ちんもく", "noun", "silence"),
      gloss("約束", "やくそく", "noun", "promise"),
    ],
  },
  health: {
    title: ["眠れない朝", "病院の白い廊下", "散歩の呼吸", "薬局の明かり"],
    setting: seg("公園", "こうえん", true),
    actor: seg("私", "わたし", true),
    companion: seg("医師", "いし", true),
    object: seg("薬", "くすり", true),
    action: seg("飲み忘れた", "のみわすれた", true),
    feeling: seg("不安な", "ふあんな", true),
    sound: seg("呼吸", "こきゅう", true),
    extra: seg("健康", "けんこう", true),
    gloss: [
      gloss("公園", "こうえん", "noun", "park"),
      gloss("私", "わたし", "pronoun", "I"),
      gloss("医師", "いし", "noun", "doctor"),
      gloss("薬", "くすり", "noun", "medicine"),
      gloss("飲み忘れる", "のみわすれる", "verb", "to forget to take"),
      gloss("不安", "ふあん", "adjective", "anxious"),
      gloss("呼吸", "こきゅう", "noun", "breathing"),
      gloss("健康", "けんこう", "noun", "health"),
    ],
  },
  tech: {
    title: ["研究室の画面", "古い端末の光", "ロボットの返事", "夜のデータ"],
    setting: seg("研究室", "けんきゅうしつ", true),
    actor: seg("技術者", "ぎじゅつしゃ", true),
    companion: seg("研究者", "けんきゅうしゃ", true),
    object: seg("端末", "たんまつ", true),
    action: seg("観察した", "かんさつした", true),
    feeling: seg("不思議な", "ふしぎな", true),
    sound: seg("機械音", "きかいおん", true),
    extra: seg("技術", "ぎじゅつ", true),
    gloss: [
      gloss("研究室", "けんきゅうしつ", "noun", "laboratory"),
      gloss("技術者", "ぎじゅつしゃ", "noun", "engineer"),
      gloss("研究者", "けんきゅうしゃ", "noun", "researcher"),
      gloss("端末", "たんまつ", "noun", "terminal device"),
      gloss("観察する", "かんさつする", "verb", "to observe"),
      gloss("不思議", "ふしぎ", "adjective", "mysterious"),
      gloss("機械音", "きかいおん", "noun", "machine sound"),
      gloss("技術", "ぎじゅつ", "noun", "technology"),
    ],
  },
  history: {
    title: ["古写真の午後", "蔵の中の名前", "祭りの記憶", "石段に残る声"],
    setting: seg("資料館", "しりょうかん", true),
    actor: seg("案内人", "あんないにん", true),
    companion: seg("祖母", "そぼ", true),
    object: seg("写真", "しゃしん", true),
    action: seg("見つめた", "みつめた", true),
    feeling: seg("遠い", "とおい", true),
    sound: seg("記憶", "きおく", true),
    extra: seg("歴史", "れきし", true),
    gloss: [
      gloss("資料館", "しりょうかん", "noun", "archive museum"),
      gloss("案内人", "あんないにん", "noun", "guide"),
      gloss("祖母", "そぼ", "noun", "grandmother"),
      gloss("写真", "しゃしん", "noun", "photograph"),
      gloss("見つめる", "みつめる", "verb", "to gaze at"),
      gloss("遠い", "とおい", "adjective", "distant"),
      gloss("記憶", "きおく", "noun", "memory"),
      gloss("歴史", "れきし", "noun", "history"),
    ],
  },
  art: {
    title: ["練習室の音", "白い画布", "劇場の裏口", "絵筆の朝"],
    setting: seg("練習室", "れんしゅうしつ", true),
    actor: seg("演奏者", "えんそうしゃ", true),
    companion: seg("画家", "がか", true),
    object: seg("楽譜", "がくふ", true),
    action: seg("重ねた", "かさねた", true),
    feeling: seg("鮮やかな", "あざやかな", true),
    sound: seg("旋律", "せんりつ", true),
    extra: seg("芸術", "げいじゅつ", true),
    gloss: [
      gloss("練習室", "れんしゅうしつ", "noun", "practice room"),
      gloss("演奏者", "えんそうしゃ", "noun", "performer"),
      gloss("画家", "がか", "noun", "painter"),
      gloss("楽譜", "がくふ", "noun", "score"),
      gloss("重ねる", "かさねる", "verb", "to layer"),
      gloss("鮮やか", "あざやか", "adjective", "vivid"),
      gloss("旋律", "せんりつ", "noun", "melody"),
      gloss("芸術", "げいじゅつ", "noun", "art"),
    ],
  },
  mystery: {
    title: ["鍵のない部屋", "消えた足跡", "雨の証言", "封筒の匂い"],
    setting: seg("廊下", "ろうか", true),
    actor: seg("探偵", "たんてい", true),
    companion: seg("証人", "しょうにん", true),
    object: seg("鍵", "かぎ", true),
    action: seg("調べた", "しらべた", true),
    feeling: seg("怪しい", "あやしい", true),
    sound: seg("足音", "あしおと", true),
    extra: seg("謎", "なぞ", true),
    gloss: [
      gloss("廊下", "ろうか", "noun", "corridor"),
      gloss("探偵", "たんてい", "noun", "detective"),
      gloss("証人", "しょうにん", "noun", "witness"),
      gloss("鍵", "かぎ", "noun", "key"),
      gloss("調べる", "しらべる", "verb", "to investigate"),
      gloss("怪しい", "あやしい", "adjective", "suspicious"),
      gloss("足音", "あしおと", "noun", "footsteps"),
      gloss("謎", "なぞ", "noun", "mystery"),
    ],
  },
  nature: {
    title: ["雨上がりの庭", "冬の川音", "桜の影", "台風前の空"],
    setting: seg("庭", "にわ", true),
    actor: seg("私", "わたし", true),
    companion: seg("子供", "こども", true),
    object: seg("花", "はな", true),
    action: seg("見上げた", "みあげた", true),
    feeling: seg("冷たい", "つめたい", true),
    sound: seg("風", "かぜ", true),
    extra: seg("季節", "きせつ", true),
    gloss: [
      gloss("庭", "にわ", "noun", "garden"),
      gloss("私", "わたし", "pronoun", "I"),
      gloss("子供", "こども", "noun", "child"),
      gloss("花", "はな", "noun", "flower"),
      gloss("見上げる", "みあげる", "verb", "to look up"),
      gloss("冷たい", "つめたい", "adjective", "cold"),
      gloss("風", "かぜ", "noun", "wind"),
      gloss("季節", "きせつ", "noun", "season"),
    ],
  },
  news: {
    title: ["町内会の知らせ", "小さな記事", "投票所の朝", "新聞の余白"],
    setting: seg("広場", "ひろば", true),
    actor: seg("記者", "きしゃ", true),
    companion: seg("住民", "じゅうみん", true),
    object: seg("記事", "きじ", true),
    action: seg("比べた", "くらべた", true),
    feeling: seg("冷静な", "れいせいな", true),
    sound: seg("意見", "いけん", true),
    extra: seg("社会", "しゃかい", true),
    gloss: [
      gloss("広場", "ひろば", "noun", "public square"),
      gloss("記者", "きしゃ", "noun", "reporter"),
      gloss("住民", "じゅうみん", "noun", "resident"),
      gloss("記事", "きじ", "noun", "article"),
      gloss("比べる", "くらべる", "verb", "to compare"),
      gloss("冷静", "れいせい", "adjective", "calm"),
      gloss("意見", "いけん", "noun", "opinion"),
      gloss("社会", "しゃかい", "noun", "society"),
    ],
  },
  fantasy: {
    title: ["森の門", "銀色の地図", "灯る石", "夜明けの魔法"],
    setting: seg("森", "もり", true),
    actor: seg("旅人", "たびびと", true),
    companion: seg("魔女", "まじょ", true),
    object: seg("石", "いし", true),
    action: seg("拾い上げた", "ひろいあげた", true),
    feeling: seg("奇妙な", "きみょうな", true),
    sound: seg("鐘", "かね", true),
    extra: seg("魔法", "まほう", true),
    gloss: [
      gloss("森", "もり", "noun", "forest"),
      gloss("旅人", "たびびと", "noun", "traveler"),
      gloss("魔女", "まじょ", "noun", "witch"),
      gloss("石", "いし", "noun", "stone"),
      gloss("拾い上げる", "ひろいあげる", "verb", "to pick up"),
      gloss("奇妙", "きみょう", "adjective", "strange"),
      gloss("鐘", "かね", "noun", "bell"),
      gloss("魔法", "まほう", "noun", "magic"),
    ],
  },
  romance: {
    title: ["月の廊下", "近すぎる沈黙", "旅館の朝", "ためらいの指先"],
    setting: seg("旅館", "りょかん", true),
    actor: seg("彼女", "かのじょ", true),
    companion: seg("彼", "かれ", true),
    object: seg("浴衣", "ゆかた", true),
    action: seg("見つめた", "みつめた", true),
    feeling: seg("危うい", "あやうい", true),
    sound: seg("呼吸", "こきゅう", true),
    extra: seg("距離", "きょり", true),
    gloss: [
      gloss("旅館", "りょかん", "noun", "Japanese inn"),
      gloss("彼女", "かのじょ", "pronoun", "she"),
      gloss("彼", "かれ", "pronoun", "he"),
      gloss("浴衣", "ゆかた", "noun", "yukata"),
      gloss("見つめる", "みつめる", "verb", "to gaze"),
      gloss("危うい", "あやうい", "adjective", "dangerously delicate"),
      gloss("呼吸", "こきゅう", "noun", "breath"),
      gloss("距離", "きょり", "noun", "distance"),
    ],
  },
};

const TIMES = [
  seg("朝", "あさ", true),
  seg("昼下がり", "ひるさがり", true),
  seg("夕暮れ", "ゆうぐれ", true),
  seg("夜", "よる", true),
  seg("雨の日", "あめのひ", true),
  seg("風の強い午後", "かぜのつよいごご", true),
];

const COLORS = [
  seg("青い", "あおい", true),
  seg("白い", "しろい", true),
  seg("薄い金色の", "うすいきんいろの", true),
  seg("灰色の", "はいいろの", true),
  seg("透明な", "とうめいな", true),
  seg("淡い", "あわい", true),
];

const TITLE_MOODS = ["静かな", "雨の", "夕暮れの", "遠い", "白い", "風の", "小さな", "薄明の", "夜明けの", "名残の", "淡い", "見えない"];
const TITLE_MOOD_EN = ["Quiet", "Rainy", "Twilight", "Distant", "White", "Wind-Borne", "Small", "Half-Light", "Daybreak", "Lingering", "Pale", "Unseen"];
const TITLE_SUFFIXES = ["の余韻", "の影", "の声", "の光", "の約束", "の行方", "の窓辺", "の記憶", "の気配", "の道", "の午後", "の沈黙"];
const TITLE_SUFFIX_EN = ["Afterglow", "Shadow", "Voice", "Light", "Promise", "Whereabouts", "Window", "Memory", "Presence", "Path", "Afternoon", "Silence"];

const TITLE_EN = {
  "朝の台所": "Kitchen in the Morning",
  "小さな用事": "Small Errand",
  "夕方の洗濯物": "Evening Laundry",
  "商店街の帰り道": "Way Back from the Shopping Street",
  "放課後のノート": "After-School Notebook",
  "図書室の約束": "Library Room Promise",
  "試験前の雨": "Rain before the Exam",
  "机の上の消し跡": "Eraser Marks on the Desk",
  "会議室の午後": "Afternoon in the Meeting Room",
  "駅前の名刺": "Business Card by the Station",
  "残業前の缶コーヒー": "Canned Coffee before Overtime",
  "受付の小さな声": "Small Voice at Reception",
  "終電前のホーム": "Platform before the Last Train",
  "地下道の青い表示": "Blue Underground Sign",
  "雨上がりの交差点": "Intersection after Rain",
  "バス停の影": "Bus Stop Shadow",
  "岬の宿": "Inn on the Cape",
  "山道の地図": "Map on the Mountain Road",
  "港町の朝": "Morning in the Port Town",
  "古い旅館の廊下": "Corridor of the Old Inn",
  "味噌汁の湯気": "Steam from Miso Soup",
  "商店街の惣菜": "Deli Food from the Shopping Street",
  "夜の喫茶店": "Night Cafe",
  "台所の白い皿": "White Plate in the Kitchen",
  "返信のない夜": "Night without a Reply",
  "母の古い手紙": "Mother's Old Letter",
  "友人の傘": "Friend's Umbrella",
  "窓辺の約束": "Promise by the Window",
  "眠れない朝": "Sleepless Morning",
  "病院の白い廊下": "White Hospital Corridor",
  "散歩の呼吸": "Breath of a Walk",
  "薬局の明かり": "Light of the Pharmacy",
  "研究室の画面": "Screen in the Laboratory",
  "古い端末の光": "Light of the Old Terminal",
  "ロボットの返事": "Robot's Reply",
  "夜のデータ": "Night Data",
  "古写真の午後": "Afternoon of Old Photographs",
  "蔵の中の名前": "Name inside the Storehouse",
  "祭りの記憶": "Memory of the Festival",
  "石段に残る声": "Voice Left on the Stone Steps",
  "練習室の音": "Sound in the Practice Room",
  "白い画布": "White Canvas",
  "劇場の裏口": "Stage Door",
  "絵筆の朝": "Morning of the Paintbrush",
  "鍵のない部屋": "Room without a Key",
  "消えた足跡": "Vanished Footprints",
  "雨の証言": "Testimony in the Rain",
  "封筒の匂い": "Scent of the Envelope",
  "雨上がりの庭": "Garden after Rain",
  "冬の川音": "River Sound in Winter",
  "桜の影": "Cherry Blossom Shadow",
  "台風前の空": "Sky before the Typhoon",
  "町内会の知らせ": "Neighborhood Notice",
  "小さな記事": "Small Article",
  "投票所の朝": "Morning at the Polling Place",
  "新聞の余白": "Margin of the Newspaper",
  "森の門": "Forest Gate",
  "銀色の地図": "Silver Map",
  "灯る石": "Glowing Stone",
  "夜明けの魔法": "Daybreak Magic",
  "月の廊下": "Moonlit Corridor",
  "近すぎる沈黙": "Silence Too Close",
  "旅館の朝": "Morning at the Inn",
  "ためらいの指先": "Hesitant Fingertips",
};

const EN = {
  "朝": "morning",
  "昼下がり": "early afternoon",
  "夕暮れ": "twilight",
  "夜": "night",
  "雨の日": "a rainy day",
  "風の強い午後": "a windy afternoon",
  "青い": "blue",
  "白い": "white",
  "薄い金色の": "pale golden",
  "灰色の": "gray",
  "透明な": "clear",
  "淡い": "pale",
  "台所": "kitchen",
  "私": "I",
  "隣人": "neighbor",
  "買い物袋": "shopping bag",
  "片づけた": "tidying up",
  "穏やかな": "calm",
  "時計": "clock",
  "生活": "daily life",
  "図書室": "library room",
  "学生": "student",
  "先生": "teacher",
  "ノート": "notebook",
  "書き直した": "rewriting it",
  "静かな": "quiet",
  "鉛筆": "pencil",
  "勉強": "study",
  "会議室": "meeting room",
  "社員": "employee",
  "上司": "supervisor",
  "資料": "documents",
  "確認した": "checking it",
  "慎重な": "careful",
  "電話": "phone",
  "仕事": "work",
  "駅": "station",
  "旅人": "traveler",
  "運転手": "driver",
  "切符": "ticket",
  "握りしめた": "clutching it",
  "慌ただしい": "hurried",
  "案内放送": "station announcement",
  "街": "city",
  "旅館": "Japanese inn",
  "旅行者": "traveler",
  "女将": "inn hostess",
  "地図": "map",
  "広げた": "spreading it out",
  "懐かしい": "nostalgic",
  "波音": "sound of waves",
  "風景": "landscape",
  "食堂": "dining hall",
  "料理人": "cook",
  "客": "customer",
  "味噌汁": "miso soup",
  "温めた": "warming it",
  "香ばしい": "savory",
  "湯気": "steam",
  "食卓": "dining table",
  "部屋": "room",
  "友人": "friend",
  "手紙": "letter",
  "読み返した": "rereading it",
  "寂しい": "lonely",
  "沈黙": "silence",
  "約束": "promise",
  "公園": "park",
  "医師": "doctor",
  "薬": "medicine",
  "飲み忘れた": "forgetting to take it",
  "不安な": "anxious",
  "呼吸": "breath",
  "健康": "health",
  "研究室": "laboratory",
  "技術者": "engineer",
  "研究者": "researcher",
  "端末": "terminal device",
  "観察した": "observing it",
  "不思議な": "mysterious",
  "機械音": "machine sound",
  "技術": "technology",
  "資料館": "archive museum",
  "案内人": "guide",
  "祖母": "grandmother",
  "写真": "photograph",
  "見つめた": "gazing at it",
  "遠い": "distant",
  "記憶": "memory",
  "歴史": "history",
  "練習室": "practice room",
  "演奏者": "performer",
  "画家": "painter",
  "楽譜": "score",
  "重ねた": "layering it",
  "鮮やかな": "vivid",
  "旋律": "melody",
  "芸術": "art",
  "廊下": "corridor",
  "探偵": "detective",
  "証人": "witness",
  "鍵": "key",
  "調べた": "investigating it",
  "怪しい": "suspicious",
  "足音": "footsteps",
  "謎": "mystery",
  "庭": "garden",
  "子供": "child",
  "花": "flower",
  "見上げた": "looking up at it",
  "冷たい": "cold",
  "風": "wind",
  "季節": "season",
  "広場": "public square",
  "記者": "reporter",
  "住民": "resident",
  "記事": "article",
  "比べた": "comparing it",
  "冷静な": "calm",
  "意見": "opinion",
  "社会": "society",
  "森": "forest",
  "魔女": "witch",
  "石": "stone",
  "拾い上げた": "picking it up",
  "奇妙な": "strange",
  "鐘": "bell",
  "魔法": "magic",
  "彼女": "she",
  "彼": "he",
  "浴衣": "yukata",
  "危うい": "delicate and dangerous",
  "距離": "distance",
};

function seg(surface, reading, isKanji) {
  return { surface, reading, is_kanji: isKanji };
}

function gloss(word, reading, pos, glossEn) {
  return { word, reading, pos, gloss_en: glossEn };
}

function kana(text) {
  return seg(text, text, false);
}

function pick(items, slot, salt = 0) {
  return items[(slot * 7 + salt * 13) % items.length];
}

function profileKeyFor(template) {
  const id = String(template.id);
  const name = String(template.name);
  const prompt = String(template.prompt ?? "");
  const text = `${name}\n${prompt}`.toLowerCase();

  if (id === "seed-topic-daily-life" || name === "日常生活") return "daily";
  if (id === "seed-topic-school-learning" || name === "学校と学習") return "school";
  if (id === "seed-topic-work-society" || name === "仕事と社会") return "work";
  if (id === "seed-topic-city-transit" || name === "都市と移動") return "city";
  if (id === "seed-topic-travel-landscape" || name === "旅と風景") return "travel";
  if (id === "seed-topic-food-kitchen" || name === "食と台所") return "food";
  if (id === "seed-topic-family-relationships" || name === "家族と人間関係") return "relationship";
  if (id === "seed-topic-health-mind" || name === "健康と心") return "health";
  if (id === "seed-topic-science-tech" || name === "科学とテクノロジー") return "tech";
  if (id === "seed-topic-history-memory" || name === "歴史と記憶") return "history";
  if (id === "seed-topic-art-music" || name === "芸術と音楽") return "art";
  if (id === "seed-topic-mystery" || name === "ミステリー") return "mystery";
  if (id === "seed-topic-nature-seasons" || name === "自然と季節") return "nature";
  if (id === "seed-topic-news-commentary" || name === "ニュースと評論") return "news";
  if (id === "seed-topic-fantasy" || name === "ファンタジー") return "fantasy";
  if (id === "claude-curated" || /novelist|mystery|slice-of-life/.test(text)) return "mystery";
  if (name === "TEST" || name === "TEST2" || name === "NSFW" || name === "Jap") return "romance";
  if (/\bnsfw\b|erotic|porno|pornographic|sexual|penetration|creampie|breeding|cock|pussy|cervix|orgasm|sex|露骨|性行為|大人向け/.test(text)) return "romance";
  if (name === "文学随想") return "daily";

  return "daily";
}

function profileFor(template) {
  return PROFILES[profileKeyFor(template)];
}

function grammarPoints() {
  return [
    {
      pattern: "〜ながら",
      explanation_en: "Indicates that one action happens while another action continues.",
    },
    {
      pattern: "〜てしまう",
      explanation_en: "Shows completion, regret, or an unintended result depending on context.",
    },
    {
      pattern: "〜ように",
      explanation_en: "Expresses manner, resemblance, or an intended state.",
    },
    {
      pattern: "〜からこそ",
      explanation_en: "Emphasizes a reason as especially meaningful or decisive.",
    },
  ];
}

const AUDIBLE_SOUND_SURFACES = new Set(["案内放送", "波音", "機械音", "旋律", "足音", "鐘"]);

function cueSegments(profile) {
  if (profile === PROFILES.food) {
    return [profile.sound, kana("を"), seg("眺め", "ながめ", true), kana("ながら、")];
  }
  if (profile === PROFILES.relationship) {
    return [profile.sound, kana("に"), seg("耳", "みみ", true), kana("を"), seg("澄ませ", "すませ", true), kana("ながら、")];
  }
  if (profile === PROFILES.health) {
    return [profile.sound, kana("を"), seg("整え", "ととのえ", true), kana("ながら、")];
  }
  if (profile === PROFILES.history) {
    return [profile.sound, kana("を"), seg("辿り", "たどり", true), kana("ながら、")];
  }
  if (profile === PROFILES.nature || profile === PROFILES.romance) {
    return [profile.sound, kana("を"), seg("感じ", "かんじ", true), kana("ながら、")];
  }
  if (profile === PROFILES.news) {
    return [profile.sound, kana("に"), seg("耳", "みみ", true), kana("を"), seg("傾け", "かたむけ", true), kana("ながら、")];
  }
  if (profile.sound.surface === "鉛筆") {
    return [profile.sound, kana("の"), seg("走る", "はしる", true), seg("音", "おと", true), kana("を"), seg("聞き", "きき", true), kana("ながら、")];
  }
  if (profile.sound.surface === "電話") {
    return [profile.sound, kana("の"), seg("鳴る", "なる", true), seg("音", "おと", true), kana("を"), seg("聞き", "きき", true), kana("ながら、")];
  }
  if (AUDIBLE_SOUND_SURFACES.has(profile.sound.surface)) {
    return [profile.sound, kana("を"), seg("聞き", "きき", true), kana("ながら、")];
  }
  return [profile.sound, kana("の"), seg("音", "おと", true), kana("を"), seg("聞き", "きき", true), kana("ながら、")];
}

function responseSegments(profile) {
  if (profile === PROFILES.food) {
    return [profile.feeling, profile.sound, kana("の"), seg("向こう", "むこう", true), kana("で"), seg("笑った", "わらった", true), kana("。")];
  }
  return [profile.feeling, seg("声", "こえ", true), kana("で"), seg("笑った", "わらった", true), kana("。")];
}

function buildParagraphs(profile, slot) {
  const time = pick(TIMES, slot, 1);

  const p1 = [
    time,
    kana("、"),
    profile.setting,
    kana("の"),
    seg("片隅", "かたすみ", true),
    kana("に、"),
    profile.object,
    kana("が"),
    profile.actor,
    kana("の"),
    seg("前", "まえ", true),
    kana("に"),
    seg("置かれていた", "おかれていた", true),
    kana("。"),
    profile.actor,
    kana("は"),
    ...cueSegments(profile),
    profile.action,
    kana("ことを"),
    seg("少し", "すこし", true),
    kana("だけ"),
    seg("悔やんで", "くやんで", true),
    kana("しまう。"),
  ];

  const p2 = [
    kana("「"),
    profile.companion,
    kana("も"),
    seg("気づいた", "きづいた", true),
    kana("の？」と"),
    profile.actor,
    kana("が"),
    seg("尋ねる", "たずねる", true),
    kana("と、"),
    profile.companion,
    kana("は"),
    ...responseSegments(profile),
    profile.extra,
    kana("は"),
    seg("水面", "みなも", true),
    kana("の"),
    seg("記憶", "きおく", true),
    kana("のように"),
    seg("揺れ", "ゆれ", true),
    kana("、"),
    profile.setting,
    kana("の"),
    seg("空気", "くうき", true),
    kana("からこそ、"),
    profile.extra,
    kana("という"),
    seg("小さな", "ちいさな", true),
    seg("物語", "ものがたり", true),
    kana("が"),
    seg("始まった", "はじまった", true),
    kana("。"),
  ];

  return [
    { text: p1.map((s) => s.surface).join(""), annotated: p1 },
    { text: p2.map((s) => s.surface).join(""), annotated: p2 },
  ];
}

function englishFor(segment) {
  return EN[segment.surface] ?? segment.surface;
}

function englishSubject(segment) {
  const value = englishFor(segment);
  if (value === "I") return "the narrator";
  if (value === "she" || value === "he") return value;
  return `the ${value}`;
}

function englishReceiver(segment) {
  const value = englishFor(segment);
  if (value === "I") return "the narrator";
  if (value === "she") return "her";
  if (value === "he") return "him";
  return `the ${value}`;
}

function englishObject(segment) {
  const value = englishFor(segment);
  if (/^(I|she|he)$/.test(value)) return value;
  return value;
}

function englishTime(segment) {
  const value = segment.surface;
  if (value === "朝") return "In the morning";
  if (value === "昼下がり") return "In the early afternoon";
  if (value === "夕暮れ") return "At twilight";
  if (value === "夜") return "At night";
  if (value === "雨の日") return "On a rainy day";
  if (value === "風の強い午後") return "On a windy afternoon";
  return `At ${englishFor(segment)}`;
}

function englishConcept(segment) {
  const value = englishFor(segment);
  const unarticled = new Set(["daily life", "study", "work", "health", "technology", "history", "art", "mystery", "society", "magic", "distance"]);
  if (unarticled.has(value)) return value;
  return `the ${value}`;
}

function regretTranslation(segment) {
  const actionBySurface = {
    "片づけた": "having tidied it away",
    "書き直した": "having rewritten it",
    "確認した": "having checked it",
    "握りしめた": "having clutched it",
    "広げた": "having spread it out",
    "温めた": "having warmed it",
    "読み返した": "having reread it",
    "飲み忘れた": "forgetting to take it",
    "観察した": "having observed it",
    "見つめた": "having gazed at it",
    "重ねた": "having layered it",
    "調べた": "having investigated it",
    "見上げた": "having looked up at it",
    "比べた": "having compared it",
    "拾い上げた": "having picked it up",
  };
  return actionBySurface[segment.surface] ?? englishFor(segment);
}

function cueTranslation(profile) {
  if (profile === PROFILES.food) return "While gazing at the steam";
  if (profile === PROFILES.relationship) return "While listening closely to the silence";
  if (profile === PROFILES.health) return "While steadying their breathing";
  if (profile === PROFILES.history) return "While tracing the memory";
  if (profile === PROFILES.nature) return `While feeling the ${englishFor(profile.sound)}`;
  if (profile === PROFILES.romance) return "While sensing the other person's breathing";
  if (profile === PROFILES.news) return "While listening to the surrounding opinions";
  if (profile.sound.surface === "時計") return "While listening to the clock ticking";
  if (profile.sound.surface === "鉛筆") return "While listening to the scratch of a pencil";
  if (profile.sound.surface === "電話") return "As the phone rings nearby";
  if (profile.sound.surface === "波音") return "While listening to the waves";
  if (AUDIBLE_SOUND_SURFACES.has(profile.sound.surface)) return `While listening to the ${englishFor(profile.sound)}`;
  return `While listening to the sound of the ${englishFor(profile.sound)}`;
}

function responseTranslation(profile, companion) {
  if (profile === PROFILES.food) return `${companion} laughs from beyond the savory steam`;
  const laughByFeeling = {
    "穏やかな": `${companion} laughs calmly`,
    "静かな": `${companion} laughs quietly`,
    "慎重な": `${companion} laughs cautiously`,
    "慌ただしい": `${companion} gives a hurried laugh`,
    "懐かしい": `${companion} laughs wistfully`,
    "寂しい": `${companion} laughs with a lonely softness`,
    "不安な": `${companion} laughs uneasily`,
    "不思議な": `${companion} gives a strange little laugh`,
    "遠い": `${companion} laughs as if from far away`,
    "鮮やかな": `${companion} laughs brightly`,
    "怪しい": `${companion} gives a suspicious laugh`,
    "冷たい": `${companion} laughs coolly`,
    "冷静な": `${companion} laughs calmly`,
    "奇妙な": `${companion} laughs oddly`,
    "危うい": `${companion} laughs with a fragile, dangerous softness`,
  };
  return laughByFeeling[profile.feeling.surface] ?? `${companion} laughs softly`;
}

function storyTranslation(profile) {
  const openingBySurface = {
    "生活": "From that ordinary moment",
    "勉強": "From that study-worn moment",
    "仕事": "From that moment at work",
    "街": "From that glimpse of the city",
    "風景": "From that landscape",
    "食卓": "From the dining table",
    "約束": "From that promise",
    "健康": "From that concern for health",
    "技術": "From that brush with technology",
    "歴史": "From that trace of history",
    "芸術": "From that artistic moment",
    "謎": "From that mystery",
    "季節": "From that seasonal moment",
    "社会": "From that glimpse of society",
    "魔法": "From that hint of magic",
    "距離": "From that delicate distance",
  };
  const opening = openingBySurface[profile.extra.surface] ?? `From ${englishConcept(profile.extra)}`;
  return `${opening}, a small story begins to take shape in the air of the ${englishFor(profile.setting)}.`;
}

function adjustedTitleMood(base, moodIndex) {
  let ja = TITLE_MOODS[moodIndex];
  let en = TITLE_MOOD_EN[moodIndex];
  if (ja === "雨の" && base.includes("雨")) {
    ja = "曇りの";
    en = "Clouded";
  }
  if (ja === "白い" && /白|青|銀色/.test(base)) {
    ja = "淡く光る";
    en = "Softly Lit";
  }
  if (ja === "夕暮れの" && /夕方|夕暮れ/.test(base)) {
    ja = "薄暮の";
    en = "Dusk-Lit";
  }
  if (ja === "夜明けの" && base.includes("夜明け")) {
    ja = "始まりの";
    en = "Beginning";
  }
  return { ja, en };
}

function titleParts(profile, slot) {
  const index = Math.max(0, slot - 1);
  const base = profile.title[index % profile.title.length];
  const moodIndex = Math.floor(index / profile.title.length) % TITLE_MOODS.length;
  const suffixIndex = Math.floor(index / (profile.title.length * TITLE_MOODS.length)) % TITLE_SUFFIXES.length;
  return { base, moodIndex, suffixIndex };
}

function buildTitleJa(profile, slot) {
  const { base, moodIndex, suffixIndex } = titleParts(profile, slot);
  const mood = adjustedTitleMood(base, moodIndex);
  return `${mood.ja}${base}${TITLE_SUFFIXES[suffixIndex]}`;
}

function buildTitleEn(profile, slot) {
  const { base, moodIndex, suffixIndex } = titleParts(profile, slot);
  const baseEn = TITLE_EN[base] ?? base;
  const mood = adjustedTitleMood(base, moodIndex);
  return `${mood.en} ${baseEn}: ${TITLE_SUFFIX_EN[suffixIndex]}`;
}

function buildTranslation(profile, slot) {
  const time = pick(TIMES, slot, 1);
  const actor = englishSubject(profile.actor);
  const receiver = englishReceiver(profile.actor);
  const companion = englishSubject(profile.companion);
  return [
    `${englishTime(time)}, in a corner of the ${englishFor(profile.setting)}, the ${englishObject(profile.object)} had been set in front of ${receiver}.`,
    `${cueTranslation(profile)}, ${actor} briefly regrets ${regretTranslation(profile.action)}.`,
    `When ${actor} asks whether ${companion} noticed it too, ${responseTranslation(profile, companion)}. ${storyTranslation(profile)}`,
  ].join(" ");
}

function buildPassage(template, slot) {
  const profile = profileFor(template);
  const titleJa = buildTitleJa(profile, slot);
  const titleEn = buildTitleEn(profile, slot);
  const paragraphs = buildParagraphs(profile, slot);
  const wordGloss = [
    ...profile.gloss,
    gloss("尋ねる", "たずねる", "verb", "to ask"),
    gloss("物語", "ものがたり", "noun", "story"),
  ];

  return {
    title_ja: titleJa,
    title_en: titleEn,
    paragraphs,
    grammar_points: grammarPoints(),
    translation: buildTranslation(profile, slot),
    word_gloss: wordGloss,
  };
}

function createTables(db) {
  db.run(`CREATE TABLE IF NOT EXISTS passages (
    id TEXT PRIMARY KEY,
    title_ja TEXT NOT NULL,
    title_en TEXT NOT NULL,
    paragraphs_json TEXT NOT NULL,
    grammar_points_json TEXT NOT NULL,
    translation TEXT NOT NULL,
    word_gloss_json TEXT NOT NULL,
    jic_sentences_json TEXT,
    jic_code TEXT,
    style_template_id TEXT,
    llm_model TEXT NOT NULL,
    content_hash TEXT,
    source_title TEXT,
    source_author TEXT,
    source_identifier TEXT,
    source_license TEXT,
    source_locator TEXT,
    verification_status TEXT NOT NULL DEFAULT 'approved',
    review_notes TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS style_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prompt TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`);
  db.run(`CREATE TABLE IF NOT EXISTS passage_cache_entries (
    passage_id TEXT PRIMARY KEY,
    style_template_id TEXT,
    generation_tier TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    token_budget INTEGER NOT NULL,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL
  );`);
}

function queryRows(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryValue(db, sql, params = []) {
  const rows = queryRows(db, sql, params);
  return rows[0] ? Object.values(rows[0])[0] : undefined;
}

function ensureTopicCount(db, targetCount = 21) {
  const now = new Date().toISOString();
  const current = Number(queryValue(db, "SELECT COUNT(*) AS count FROM style_templates") ?? 0);
  if (current >= targetCount) return 0;

  const existingIds = new Set(queryRows(db, "SELECT id FROM style_templates").map((row) => row.id));
  const existingNames = new Set(queryRows(db, "SELECT name FROM style_templates").map((row) => row.name));
  const insert = db.prepare("INSERT INTO style_templates (id, name, prompt, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
  let added = 0;
  for (const preset of TOPIC_PRESETS) {
    if (current + added >= targetCount) break;
    if (existingIds.has(preset.id) || existingNames.has(preset.name)) continue;
    insert.run([preset.id, preset.name, preset.prompt, 0, now, now]);
    added += 1;
  }
  insert.free();
  return added;
}

function hashContent(paragraphs) {
  const text = paragraphs.map((p) => p.annotated.map((s) => s.surface).join("")).join("|");
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function promptHash(template, tier) {
  return crypto.createHash("sha256").update(`${template.id}:${template.prompt}:${tier}`).digest("hex").slice(0, 12);
}

function sourceIdentifier(templateId, slot) {
  return `${RUN_ID}:${templateId}:${String(slot).padStart(3, "0")}`;
}

function slotExists(db, templateId, slot) {
  return Number(queryValue(db, "SELECT COUNT(*) AS count FROM passages WHERE source_identifier = ?", [sourceIdentifier(templateId, slot)]) ?? 0) > 0;
}

function insertPassage(db, template, slot, passage) {
  const now = new Date().toISOString();
  const id = nanoid();
  const contentHash = hashContent(passage.paragraphs);
  const sourceId = sourceIdentifier(template.id, slot);
  const insert = db.prepare("INSERT INTO passages (id, title_ja, title_en, paragraphs_json, grammar_points_json, translation, word_gloss_json, jic_sentences_json, jic_code, style_template_id, llm_model, content_hash, source_title, source_author, source_identifier, source_license, source_locator, verification_status, review_notes, reviewed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  insert.run([
    id,
    passage.title_ja,
    passage.title_en,
    JSON.stringify(passage.paragraphs),
    JSON.stringify(passage.grammar_points),
    passage.translation,
    JSON.stringify(passage.word_gloss),
    null,
    null,
    template.id,
    MODEL_LABEL,
    contentHash,
    `Basic material: ${template.name}`,
    "KanaLens local structured generator",
    sourceId,
    "Generated base material for local language study",
    null,
    APPROVED_STATUS,
    profileFor(template) === PROFILES.romance ? "Non-explicit mature literary base material." : null,
    now,
    now,
  ]);
  insert.free();

  const cache = db.prepare("INSERT OR IGNORE INTO passage_cache_entries (passage_id, style_template_id, generation_tier, prompt_hash, token_budget, use_count, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  cache.run([id, template.id, TIER, promptHash(template, TIER), 0, 0, null, now]);
  cache.free();
}

function updatePassage(db, template, slot, passage) {
  const now = new Date().toISOString();
  const sourceId = sourceIdentifier(template.id, slot);
  const contentHash = hashContent(passage.paragraphs);
  const update = db.prepare(`UPDATE passages SET
    title_ja = ?,
    title_en = ?,
    paragraphs_json = ?,
    grammar_points_json = ?,
    translation = ?,
    word_gloss_json = ?,
    jic_sentences_json = NULL,
    jic_code = NULL,
    llm_model = ?,
    content_hash = ?,
    source_title = ?,
    source_author = ?,
    source_license = ?,
    review_notes = ?,
    reviewed_at = ?
    WHERE source_identifier = ?`);
  update.run([
    passage.title_ja,
    passage.title_en,
    JSON.stringify(passage.paragraphs),
    JSON.stringify(passage.grammar_points),
    passage.translation,
    JSON.stringify(passage.word_gloss),
    MODEL_LABEL,
    contentHash,
    `Basic material: ${template.name}`,
    "KanaLens local structured generator",
    "Generated base material for local language study",
    profileFor(template) === PROFILES.romance ? "Non-explicit mature literary base material." : null,
    now,
    sourceId,
  ]);
  update.free();
}

function saveDb(db) {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function validateDb(db) {
  const rows = queryRows(db, "SELECT id, paragraphs_json, grammar_points_json, word_gloss_json FROM passages WHERE source_identifier LIKE ?", [`${RUN_ID}:%`]);
  for (const row of rows) {
    const paragraphs = JSON.parse(row.paragraphs_json);
    const grammar = JSON.parse(row.grammar_points_json);
    const glosses = JSON.parse(row.word_gloss_json);
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) throw new Error(`Invalid paragraphs for ${row.id}`);
    if (!Array.isArray(grammar) || grammar.length === 0) throw new Error(`Invalid grammar for ${row.id}`);
    if (!Array.isArray(glosses) || glosses.length < 5) throw new Error(`Invalid glosses for ${row.id}`);
  }
}

async function main() {
  const SQL = await initSqlJs();
  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : undefined;
  const db = new SQL.Database(existing);
  createTables(db);
  const added = ensureTopicCount(db, 21);
  if (added > 0) console.log(`Added ${added} topics.`);

  const templates = queryRows(db, "SELECT id, name, prompt, is_default, created_at FROM style_templates ORDER BY created_at, id");
  let inserted = 0;
  let updated = 0;
  for (const template of templates) {
    let topicInserted = 0;
    let topicUpdated = 0;
    for (let slot = 1; slot <= PER_TOPIC; slot += 1) {
      const exists = slotExists(db, template.id, slot);
      if (exists && !REPAIR_EXISTING) continue;
      const passage = buildPassage(template, slot);
      if (exists) {
        updatePassage(db, template, slot, passage);
        updated += 1;
        topicUpdated += 1;
      } else {
        insertPassage(db, template, slot, passage);
        inserted += 1;
        topicInserted += 1;
      }
    }
    console.log(`${template.name}: inserted ${topicInserted}, updated ${topicUpdated}, target slots ${PER_TOPIC}`);
  }

  validateDb(db);
  saveDb(db);
  const counts = queryRows(db, `SELECT style_templates.name AS name, COUNT(passages.id) AS total,
    COALESCE(SUM(CASE WHEN passages.source_identifier LIKE ? THEN 1 ELSE 0 END), 0) AS seeded
    FROM style_templates
    LEFT JOIN passages ON passages.style_template_id = style_templates.id AND passages.verification_status = 'approved'
    GROUP BY style_templates.id, style_templates.name
    ORDER BY style_templates.created_at, style_templates.id`, [`${RUN_ID}:%`]);
  console.log(`Inserted ${inserted} new local base passages. Updated ${updated} existing passages.`);
  for (const row of counts) {
    console.log(`${row.name}: total=${row.total} seeded_this_run=${row.seeded}`);
  }
  db.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
