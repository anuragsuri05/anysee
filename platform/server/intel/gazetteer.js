/**
 * Reference objects the ontology resolves mentions against: countries (with
 * centroids for the globe), AI-sector organisations and topics.
 *
 * Country rows: ISO2 | name | lat | lon | aliases (demonyms, capitals,
 * unambiguous places), separated by commas. Ambiguous English words (Georgia,
 * Chad, Turkey the bird) are matched only through their safer aliases.
 */

const COUNTRY_ROWS = `
AF|Afghanistan|33.9|67.7|Afghan,Kabul,Taliban
AL|Albania|41.2|20.2|Albanian,Tirana
DZ|Algeria|28.0|1.7|Algerian,Algiers
AO|Angola|-11.2|17.9|Angolan,Luanda
AR|Argentina|-38.4|-63.6|Argentine,Argentinian,Buenos Aires,Milei
AM|Armenia|40.1|45.0|Armenian,Yerevan
AU|Australia|-25.3|133.8|Australian,Canberra,Sydney,Melbourne
AT|Austria|47.5|14.6|Austrian,Vienna
AZ|Azerbaijan|40.1|47.6|Azerbaijani,Baku
BH|Bahrain|26.0|50.6|Bahraini,Manama
BD|Bangladesh|23.7|90.4|Bangladeshi,Dhaka
BY|Belarus|53.7|28.0|Belarusian,Minsk,Lukashenko
BE|Belgium|50.5|4.5|Belgian,Brussels
BJ|Benin|9.3|2.3|Beninese,Porto-Novo
BO|Bolivia|-16.3|-63.6|Bolivian,La Paz
BA|Bosnia and Herzegovina|43.9|17.7|Bosnia,Bosnian,Sarajevo
BR|Brazil|-14.2|-51.9|Brazilian,Brasilia,Brasília,Sao Paulo,São Paulo,Rio de Janeiro,Lula
BG|Bulgaria|42.7|25.5|Bulgarian,Sofia
BF|Burkina Faso|12.2|-1.6|Burkinabe,Ouagadougou
MM|Myanmar|21.9|95.9|Burma,Burmese,Naypyidaw,Yangon
BI|Burundi|-3.4|29.9|Burundian
KH|Cambodia|12.6|104.9|Cambodian,Phnom Penh
CM|Cameroon|7.4|12.4|Cameroonian,Yaounde,Yaoundé
CA|Canada|56.1|-106.3|Canadian,Ottawa,Toronto,Montreal,Vancouver,Carney
CF|Central African Republic|6.6|20.9|Bangui
TD|Chad|15.5|18.7|Chadian,N'Djamena
CL|Chile|-35.7|-71.5|Chilean,Santiago de Chile
CN|China|35.9|104.2|Chinese,Beijing,Shanghai,Shenzhen,Xi Jinping,Hong Kong,PRC
CO|Colombia|4.6|-74.3|Colombian,Bogota,Bogotá
CD|DR Congo|-4.0|21.8|Democratic Republic of the Congo,DRC,Congolese,Kinshasa,Goma,M23
CG|Republic of the Congo|-0.2|15.8|Brazzaville
CR|Costa Rica|9.7|-83.8|Costa Rican
HR|Croatia|45.1|15.2|Croatian,Zagreb
CU|Cuba|21.5|-77.8|Cuban,Havana
CY|Cyprus|35.1|33.4|Cypriot,Nicosia
CZ|Czechia|49.8|15.5|Czech Republic,Czech,Prague
DK|Denmark|56.3|9.5|Danish,Copenhagen,Greenland
DO|Dominican Republic|18.7|-70.2|Santo Domingo
EC|Ecuador|-1.8|-78.2|Ecuadorian,Quito
EG|Egypt|26.8|30.8|Egyptian,Cairo,Sisi
SV|El Salvador|13.8|-88.9|Salvadoran,San Salvador,Bukele
ER|Eritrea|15.2|39.8|Eritrean,Asmara
EE|Estonia|58.6|25.0|Estonian,Tallinn
ET|Ethiopia|9.1|40.5|Ethiopian,Addis Ababa,Tigray,Amhara
FI|Finland|61.9|25.7|Finnish,Helsinki
FR|France|46.2|2.2|French,Paris,Macron,Élysée,Elysee
GA|Gabon|-0.8|11.6|Gabonese,Libreville
GE|Georgia|42.3|43.4|Tbilisi,Georgian Dream
DE|Germany|51.2|10.5|German,Berlin,Bundestag,Merz,Munich,Frankfurt
GH|Ghana|7.9|-1.0|Ghanaian,Accra
GR|Greece|39.1|21.8|Greek,Athens
GT|Guatemala|15.8|-90.2|Guatemalan
GN|Guinea|9.9|-9.7|Guinean,Conakry
HT|Haiti|19.0|-72.3|Haitian,Port-au-Prince
HN|Honduras|15.2|-86.2|Honduran,Tegucigalpa
HU|Hungary|47.2|19.5|Hungarian,Budapest,Orban,Orbán
IS|Iceland|65.0|-19.0|Icelandic,Reykjavik
IN|India|20.6|79.0|Indian,New Delhi,Delhi,Mumbai,Bengaluru,Bangalore,Modi,Kashmir
ID|Indonesia|-0.8|113.9|Indonesian,Jakarta,Prabowo
IR|Iran|32.4|53.7|Iranian,Tehran,Khamenei,IRGC
IQ|Iraq|33.2|43.7|Iraqi,Baghdad,Erbil,Mosul
IE|Ireland|53.4|-8.2|Irish,Dublin
IL|Israel|31.0|34.9|Israeli,Jerusalem,Tel Aviv,Netanyahu,IDF
IT|Italy|41.9|12.6|Italian,Rome,Milan,Meloni
CI|Ivory Coast|7.5|-5.5|Côte d'Ivoire,Cote d'Ivoire,Ivorian,Abidjan
JM|Jamaica|18.1|-77.3|Jamaican,Kingston
JP|Japan|36.2|138.3|Japanese,Tokyo,Osaka
JO|Jordan|30.6|36.2|Jordanian,Amman
KZ|Kazakhstan|48.0|66.9|Kazakh,Astana,Almaty
KE|Kenya|-0.0|37.9|Kenyan,Nairobi,Ruto
KP|North Korea|40.3|127.5|Pyongyang,Kim Jong Un,DPRK,North Korean
KR|South Korea|35.9|127.8|South Korean,Seoul,Korean
XK|Kosovo|42.6|20.9|Kosovar,Pristina
KW|Kuwait|29.3|47.5|Kuwaiti,Kuwait City
KG|Kyrgyzstan|41.2|74.8|Kyrgyz,Bishkek
LA|Laos|19.9|102.5|Laotian,Vientiane
LV|Latvia|56.9|24.6|Latvian,Riga
LB|Lebanon|33.9|35.9|Lebanese,Beirut,Hezbollah
LY|Libya|26.3|17.2|Libyan,Tripoli,Benghazi
LT|Lithuania|55.2|23.9|Lithuanian,Vilnius
LU|Luxembourg|49.8|6.1|Luxembourgish
MG|Madagascar|-18.8|46.9|Malagasy,Antananarivo
MW|Malawi|-13.3|34.3|Malawian,Lilongwe
MY|Malaysia|4.2|102.0|Malaysian,Kuala Lumpur
ML|Mali|17.6|-4.0|Malian,Bamako
MR|Mauritania|21.0|-10.9|Mauritanian,Nouakchott
MX|Mexico|23.6|-102.6|Mexican,Mexico City,Sheinbaum,Sinaloa,Tijuana
MD|Moldova|47.4|28.4|Moldovan,Chisinau,Transnistria
MN|Mongolia|46.9|103.8|Mongolian,Ulaanbaatar
ME|Montenegro|42.7|19.4|Montenegrin,Podgorica
MA|Morocco|31.8|-7.1|Moroccan,Rabat,Casablanca
MZ|Mozambique|-18.7|35.5|Mozambican,Maputo,Cabo Delgado
NA|Namibia|-22.9|18.5|Namibian,Windhoek
NP|Nepal|28.4|84.1|Nepali,Nepalese,Kathmandu
NL|Netherlands|52.1|5.3|Dutch,Amsterdam,The Hague
NZ|New Zealand|-40.9|174.9|Wellington,Auckland
NI|Nicaragua|12.9|-85.2|Nicaraguan,Managua
NE|Niger|17.6|8.1|Nigerien,Niamey
NG|Nigeria|9.1|8.7|Nigerian,Abuja,Lagos,Boko Haram
MK|North Macedonia|41.6|21.7|Macedonian,Skopje
NO|Norway|60.5|8.5|Norwegian,Oslo
OM|Oman|21.5|55.9|Omani,Muscat
PK|Pakistan|30.4|69.3|Pakistani,Islamabad,Karachi,Lahore,Balochistan
PS|Palestine|31.9|35.2|Palestinian,Gaza,West Bank,Ramallah,Hamas,Rafah
PA|Panama|8.5|-80.8|Panamanian,Panama Canal
PG|Papua New Guinea|-6.3|143.9|Port Moresby
PY|Paraguay|-23.4|-58.4|Paraguayan,Asuncion,Asunción
PE|Peru|-9.2|-75.0|Peruvian,Lima
PH|Philippines|12.9|121.8|Philippine,Filipino,Manila,Marcos
PL|Poland|51.9|19.1|Polish,Warsaw
PT|Portugal|39.4|-8.2|Portuguese,Lisbon
QA|Qatar|25.4|51.2|Qatari,Doha
RO|Romania|45.9|25.0|Romanian,Bucharest
RU|Russia|61.5|105.3|Russian,Moscow,Kremlin,Putin,St Petersburg
RW|Rwanda|-1.9|29.9|Rwandan,Kigali
SA|Saudi Arabia|23.9|45.1|Saudi,Riyadh,Jeddah,MBS
SN|Senegal|14.5|-14.5|Senegalese,Dakar
RS|Serbia|44.0|21.0|Serbian,Belgrade,Vucic,Vučić
SL|Sierra Leone|8.5|-11.8|Freetown
SG|Singapore|1.35|103.8|Singaporean
SK|Slovakia|48.7|19.7|Slovak,Bratislava,Fico
SI|Slovenia|46.2|14.99|Slovenian,Ljubljana
SO|Somalia|5.2|46.2|Somali,Mogadishu,Al-Shabaab,al-Shabab
ZA|South Africa|-30.6|22.9|South African,Pretoria,Johannesburg,Cape Town,Ramaphosa
SS|South Sudan|6.9|31.3|South Sudanese,Juba
ES|Spain|40.5|-3.7|Spanish,Madrid,Barcelona,Sanchez,Sánchez
LK|Sri Lanka|7.9|80.8|Sri Lankan,Colombo
SD|Sudan|12.9|30.2|Sudanese,Khartoum,Darfur,RSF,El Fasher
SE|Sweden|60.1|18.6|Swedish,Stockholm
CH|Switzerland|46.8|8.2|Swiss,Bern,Geneva,Zurich,Davos
SY|Syria|34.8|39.0|Syrian,Damascus,Aleppo,Idlib
TW|Taiwan|23.7|121.0|Taiwanese,Taipei,Lai Ching-te
TJ|Tajikistan|38.9|71.3|Tajik,Dushanbe
TZ|Tanzania|-6.4|34.9|Tanzanian,Dodoma,Dar es Salaam
TH|Thailand|15.9|100.99|Thai,Bangkok
TN|Tunisia|33.9|9.5|Tunisian,Tunis
TR|Türkiye|38.96|35.2|Turkey's,Turkish,Turkiye,Türkiye,Ankara,Istanbul,Erdogan,Erdoğan
TM|Turkmenistan|38.97|59.6|Turkmen,Ashgabat
UG|Uganda|1.4|32.3|Ugandan,Kampala,Museveni
UA|Ukraine|48.4|31.2|Ukrainian,Kyiv,Kiev,Kharkiv,Odesa,Zelensky,Zelenskyy,Donbas,Donetsk,Zaporizhzhia,Crimea
AE|United Arab Emirates|23.4|53.8|UAE,Emirati,Abu Dhabi,Dubai
GB|United Kingdom|55.4|-3.4|UK,Britain,British,London,Westminster,Downing Street,Starmer,England,Scotland,Wales
US|United States|37.1|-95.7|U.S.,USA,American,Washington,White House,Pentagon,Congress,Trump,New York,California,Texas,Senate
UY|Uruguay|-32.5|-55.8|Uruguayan,Montevideo
UZ|Uzbekistan|41.4|64.6|Uzbek,Tashkent
VE|Venezuela|6.4|-66.6|Venezuelan,Caracas,Maduro
VN|Vietnam|14.1|108.3|Vietnamese,Hanoi,Ho Chi Minh City
YE|Yemen|15.6|48.5|Yemeni,Sanaa,Sana'a,Houthi,Houthis,Aden
ZM|Zambia|-13.1|27.8|Zambian,Lusaka
ZW|Zimbabwe|-19.0|29.2|Zimbabwean,Harare
`;

const AMBIGUOUS_NAMES = new Set(['Georgia', 'Chad', 'Jordan', 'Guinea']);

export const COUNTRIES = COUNTRY_ROWS.trim()
  .split('\n')
  .map((row) => {
    const [iso, name, lat, lon, aliases = ''] = row.split('|');
    return {
      id: `country:${iso}`,
      type: 'country',
      iso,
      name,
      lat: Number(lat),
      lon: Number(lon),
      // Bare ambiguous names are matched only by their aliases.
      aliases: [
        ...(AMBIGUOUS_NAMES.has(name) ? [] : [name]),
        ...aliases.split(',').filter(Boolean),
      ],
    };
  });

/**
 * AI-sector organisations: id | name | kind | HQ lat | HQ lon | ticker |
 * aliases. Kinds: lab, bigtech, chips, infra, startup, gov.
 */
const ORG_ROWS = `
openai|OpenAI|lab|37.76|-122.41||ChatGPT,Sam Altman,Altman,GPT-5,GPT-6,Sora,Codex
anthropic|Anthropic|lab|37.78|-122.40||Claude,Dario Amodei,Amodei
deepmind|Google DeepMind|lab|51.53|-0.12|GOOGL|DeepMind,Gemini,Demis Hassabis
google|Google|bigtech|37.42|-122.08|GOOGL|Alphabet,Sundar Pichai,Google Cloud
meta|Meta|bigtech|37.48|-122.15|META|Meta AI,Llama,Zuckerberg,Facebook,Instagram,WhatsApp
microsoft|Microsoft|bigtech|47.64|-122.13|MSFT|Copilot,Azure,Satya Nadella,Nadella
apple|Apple|bigtech|37.33|-122.01|AAPL|Apple Intelligence,Tim Cook,iPhone,Siri
amazon|Amazon|bigtech|47.62|-122.34|AMZN|AWS,Amazon Web Services,Bedrock,Andy Jassy,Alexa
nvidia|Nvidia|chips|37.37|-121.96|NVDA|NVIDIA,Jensen Huang,Blackwell,Rubin,CUDA
amd|AMD|chips|37.38|-121.96|AMD|Lisa Su,Instinct,MI400,MI450
intel|Intel|chips|37.39|-121.96|INTC|Lip-Bu Tan,Gaudi
tsmc|TSMC|chips|24.77|121.01|TSM|Taiwan Semiconductor
broadcom|Broadcom|chips|37.40|-121.95|AVGO|
arm|Arm|chips|52.20|0.12|ARM|Arm Holdings
asml|ASML|chips|51.40|5.42|ASML|
samsung|Samsung|chips|37.26|127.03||Samsung Electronics
skhynix|SK Hynix|chips|37.24|127.18||SK hynix,HBM
huawei|Huawei|chips|22.65|114.06||Ascend
xai|xAI|lab|37.44|-122.16||Grok,Elon Musk,Colossus
mistral|Mistral AI|lab|48.87|2.33||Mistral,Le Chat,Arthur Mensch
deepseek|DeepSeek|lab|30.27|120.15||DeepSeek-V4,DeepSeek-R2
alibaba|Alibaba|bigtech|30.27|120.03|BABA|Qwen,Alibaba Cloud
moonshot|Moonshot AI|lab|39.98|116.31||Kimi
zhipu|Zhipu AI|lab|39.99|116.33||Z.ai,GLM-5,ChatGLM
minimax|MiniMax|lab|31.23|121.47||
bytedance|ByteDance|bigtech|39.96|116.30||TikTok,Doubao,Seed
baidu|Baidu|bigtech|40.05|116.30|BIDU|Ernie
tencent|Tencent|bigtech|22.54|113.93||Hunyuan
huggingface|Hugging Face|infra|40.74|-73.99||HuggingFace
cohere|Cohere|lab|43.65|-79.38||
perplexity|Perplexity|startup|37.79|-122.40||Perplexity AI,Comet
ssi|Safe Superintelligence|lab|32.08|34.78||SSI,Ilya Sutskever,Sutskever
thinkingmachines|Thinking Machines Lab|lab|37.77|-122.42||Mira Murati,Murati
scaleai|Scale AI|startup|37.77|-122.40||Scale AI,Alexandr Wang
databricks|Databricks|infra|37.79|-122.39||
coreweave|CoreWeave|infra|40.73|-74.03|CRWV|
oracle|Oracle|infra|30.27|-97.74|ORCL|Stargate,Larry Ellison,OCI
palantir|Palantir|infra|39.75|-104.99|PLTR|AIP,Alex Karp
salesforce|Salesforce|bigtech|37.79|-122.40|CRM|Agentforce
ibm|IBM|bigtech|41.11|-73.72|IBM|watsonx,Granite
tesla|Tesla|bigtech|30.22|-97.62|TSLA|Optimus,FSD,Dojo
figure|Figure AI|startup|37.40|-122.03||Figure 03
anysphere|Anysphere|startup|37.77|-122.41||Cursor
cognition|Cognition|startup|37.78|-122.39||Devin,Windsurf
runway|Runway|startup|40.71|-74.01||Runway Gen-4
stability|Stability AI|startup|51.51|-0.13||Stable Diffusion
midjourney|Midjourney|startup|37.44|-122.16||
character|Character.AI|startup|37.40|-122.08||Character AI
`;

export const ORGANIZATIONS = ORG_ROWS.trim()
  .split('\n')
  .map((row) => {
    const [key, name, kind, lat, lon, ticker, aliases = ''] = row.split('|');
    return {
      id: `org:${key}`,
      type: 'organization',
      name,
      kind,
      lat: Number(lat),
      lon: Number(lon),
      ticker: ticker || null,
      aliases: [name, ...aliases.split(',').filter(Boolean)],
    };
  });

/** Topics: id, label, keywords (lower case, matched on word boundaries). */
export const TOPICS = [
  [
    'conflict',
    'Armed conflict',
    [
      'airstrike',
      'air strike',
      'missile',
      'drone strike',
      'shelling',
      'offensive',
      'troops',
      'ceasefire',
      'killed',
      'clashes',
      'invasion',
      'frontline',
      'militants',
      'insurgents',
      'war',
    ],
  ],
  [
    'unrest',
    'Civil unrest',
    [
      'protest',
      'protesters',
      'riot',
      'demonstrators',
      'coup',
      'curfew',
      'crackdown',
      'uprising',
      'martial law',
    ],
  ],
  [
    'terror',
    'Terrorism',
    [
      'terrorist',
      'terror attack',
      'suicide bomb',
      'bombing',
      'hostage',
      'gunmen',
    ],
  ],
  [
    'diplomacy',
    'Diplomacy',
    [
      'summit',
      'talks',
      'sanctions',
      'treaty',
      'envoy',
      'negotiations',
      'ambassador',
      'un security council',
    ],
  ],
  [
    'elections',
    'Elections & politics',
    [
      'election',
      'vote',
      'ballot',
      'parliament',
      'referendum',
      'prime minister',
      'president',
    ],
  ],
  [
    'disaster',
    'Disasters',
    [
      'earthquake',
      'flood',
      'cyclone',
      'hurricane',
      'typhoon',
      'wildfire',
      'tsunami',
      'volcano',
      'landslide',
      'drought',
      'eruption',
    ],
  ],
  [
    'health',
    'Health',
    [
      'outbreak',
      'epidemic',
      'pandemic',
      'cholera',
      'ebola',
      'mpox',
      'measles',
      'virus',
      'world health organization',
    ],
  ],
  [
    'economy',
    'Economy & markets',
    [
      'inflation',
      'tariff',
      'tariffs',
      'recession',
      'interest rate',
      'central bank',
      'gdp',
      'stocks',
      'oil price',
      'bond',
    ],
  ],
  [
    'energy',
    'Energy',
    [
      'oil',
      'gas pipeline',
      'opec',
      'lng',
      'nuclear plant',
      'power grid',
      'blackout',
      'refinery',
    ],
  ],
  [
    'cyber',
    'Cyber',
    [
      'ransomware',
      'cyberattack',
      'cyber attack',
      'data breach',
      'hackers',
      'zero-day',
      'vulnerability',
      'malware',
      'exploit',
      'cve-',
    ],
  ],
  [
    'space',
    'Space',
    ['satellite', 'rocket', 'launch', 'spacex', 'nasa', 'orbit', 'iss'],
  ],
  [
    'ai_models',
    'AI models',
    [
      'model',
      'llm',
      'language model',
      'open-weight',
      'open weights',
      'multimodal',
      'reasoning model',
      'benchmark',
      'agent',
      'agents',
    ],
  ],
  [
    'ai_chips',
    'AI compute & chips',
    [
      'gpu',
      'gpus',
      'chip',
      'chips',
      'semiconductor',
      'data center',
      'datacenter',
      'hbm',
      'compute',
      'export controls',
    ],
  ],
  [
    'ai_funding',
    'AI funding & deals',
    [
      'raises',
      'raised',
      'funding',
      'series a',
      'series b',
      'series c',
      'series d',
      'valuation',
      'acquire',
      'acquisition',
      'ipo',
      'investment',
    ],
  ],
  [
    'ai_policy',
    'AI policy & safety',
    [
      'ai act',
      'regulation',
      'executive order',
      'ai safety',
      'alignment',
      'copyright',
      'lawsuit',
      'ban',
      'guardrails',
      'deepfake',
    ],
  ],
  [
    'ai_research',
    'AI research',
    [
      'arxiv',
      'paper',
      'researchers',
      'dataset',
      'training',
      'fine-tuning',
      'reinforcement learning',
      'transformer',
    ],
  ],
].map(([key, label, keywords]) => ({
  id: `topic:${key}`,
  type: 'topic',
  name: label,
  keywords,
}));

export const ALL_REFERENCE_OBJECTS = [
  ...COUNTRIES,
  ...ORGANIZATIONS,
  ...TOPICS,
];
