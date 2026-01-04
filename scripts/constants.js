/**
 * Audio Tagger - Centralized Constants
 * All module-wide constants and selectors
 */

export const MODULE_ID = "audio-tagger";

// Setting Keys
export const SETTING_TAGS = "tags";
export const SETTING_PRESETS = "colorPresets";
export const SETTING_COLLAPSED = "paletteCollapsed";
export const SETTING_LIMIT_HEADER = "limitPlaylistHeaderHeight";
export const SETTING_NOTIFICATIONS = "enableNotifications";
export const SETTING_DEFAULT_TAG_ICONS = "defaultTagIcons";

// Flag Keys
export const FLAG_TAGS = "assigned-tags";
export const FLAG_SEARCH = "search";

// CSS Selectors
export const SELECTORS = {
    PALETTE: "#audio-tagger-palette",
    TAG_LIST: "#at-list",
    ASSIGNED_TAGS: ".audio-tagger-assigned-tags",
    ASSIGNED_TAG: ".audio-tagger-assigned-tag",
    PLAYLIST: ".playlist",
    SOUND: ".sound",
    PLAYLIST_HEADER: ".playlist-header",
    GLOBAL_VOLUME: ".global-volume",
    CURRENTLY_PLAYING: ".currently-playing",
    WIZARD_BTN: "#at-wizard-btn",
    ADD_BTN: "#at-add-btn",
    SORT_BTN: "#at-sort-btn"
};

// CSS Classes
export const CLASSES = {
    COLLAPSED: "collapsed",
    ACTIVE: "active",
    SELECTED: "selected",
    LIMIT_HEADER: "audio-tagger-limit-header-height"
};

// Default Colors
export const DEFAULT_BG_COLOR = "#6c757d";
export const DEFAULT_TEXT_COLOR = "#ffffff";

// Hex Color Validation
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Validates if a string is a valid hex color.
 * @param {string} hex - The hex color string to validate.
 * @returns {boolean}
 */
export function isValidHexColor(hex) {
    return HEX_COLOR_REGEX.test(hex);
}

/**
 * Normalizes a hex color to uppercase, returning default if invalid.
 * @param {string} hex - The hex color to normalize.
 * @param {string} fallback - Fallback color if invalid.
 * @returns {string}
 */
export function normalizeHexColor(hex, fallback = DEFAULT_BG_COLOR) {
    if (!isValidHexColor(hex)) return fallback;
    return hex.toUpperCase();
}

/**
 * Extended emoji categories with searchable keywords for tag icons.
 * Each emoji has: { e: emoji, k: keywords string for search }
 */
export const EMOJI_CATEGORIES = {
    "Music": [
        { e: "🎵", k: "music note sound melody tune" },
        { e: "🎶", k: "music notes sound melody song" },
        { e: "🎼", k: "music score sheet notes" },
        { e: "🎧", k: "headphones audio listen music" },
        { e: "🎤", k: "microphone singing karaoke voice" },
        { e: "🎸", k: "guitar rock music instrument" },
        { e: "🥁", k: "drum percussion beat rhythm" },
        { e: "🎹", k: "piano keyboard keys music" },
        { e: "🎺", k: "trumpet brass horn fanfare" },
        { e: "🎻", k: "violin fiddle strings classical" },
        { e: "🪕", k: "banjo country folk strings" },
        { e: "🎷", k: "saxophone jazz sax brass" },
        { e: "🔔", k: "bell ring alert notification" },
        { e: "🔊", k: "speaker loud volume sound" },
        { e: "📯", k: "horn postal trumpet fanfare" }
    ],
    "Location": [
        { e: "🏰", k: "castle fortress medieval kingdom" },
        { e: "🏠", k: "house home building dwelling" },
        { e: "⛰️", k: "mountain peak hill rock" },
        { e: "🌲", k: "tree forest pine evergreen" },
        { e: "🏜️", k: "desert sand dune dry" },
        { e: "🌊", k: "ocean wave water sea" },
        { e: "🌃", k: "city night urban skyline" },
        { e: "⛪", k: "church temple religion holy" },
        { e: "🗿", k: "moai statue stone ancient" },
        { e: "🏛️", k: "temple palace museum classical" },
        { e: "🗼", k: "tower building tall structure" },
        { e: "🏚️", k: "abandoned house ruins old" },
        { e: "⛩️", k: "shrine torii japan temple" },
        { e: "🕌", k: "mosque minaret muslim temple" },
        { e: "🏕️", k: "camping tent outdoor camp" },
        { e: "🌋", k: "volcano lava eruption fire" },
        { e: "🏝️", k: "island beach tropical paradise" },
        { e: "🗻", k: "mountain fuji peak snow" },
        { e: "🌄", k: "sunrise mountain dawn morning" },
        { e: "🏞️", k: "park nature landscape scenic" }
    ],
    "Mood": [
        { e: "😊", k: "happy smile joy cheerful" },
        { e: "😢", k: "sad cry tears unhappy" },
        { e: "😱", k: "fear scared horror shock" },
        { e: "😤", k: "angry rage mad frustrated" },
        { e: "🤔", k: "thinking ponder curious wonder" },
        { e: "😴", k: "sleep tired rest dream" },
        { e: "🥳", k: "party celebrate happy joy" },
        { e: "😈", k: "devil evil mischief demon" },
        { e: "👻", k: "ghost spirit spooky haunt" },
        { e: "💀", k: "skull death dead skeleton" },
        { e: "😌", k: "calm peaceful relaxed serene" },
        { e: "🥶", k: "cold freezing frozen chill" },
        { e: "🤩", k: "excited amazed wow star" },
        { e: "😵", k: "dizzy confused dazed stunned" },
        { e: "🤫", k: "quiet shush silence secret" },
        { e: "😏", k: "smirk sly cunning flirt" },
        { e: "😇", k: "angel innocent blessed holy" },
        { e: "🤯", k: "mindblown shocked amazed explode" },
        { e: "😰", k: "anxious worried nervous sweat" },
        { e: "🫣", k: "peek shy hidden curious" }
    ],
    "Action": [
        { e: "⚔️", k: "sword battle fight combat" },
        { e: "🛡️", k: "shield defense protect guard" },
        { e: "🏃", k: "run chase escape sprint" },
        { e: "🔥", k: "fire burn flame hot" },
        { e: "💥", k: "explosion boom crash impact" },
        { e: "✨", k: "sparkle magic shine glitter" },
        { e: "🌀", k: "swirl vortex spiral whirlpool" },
        { e: "⚡", k: "lightning thunder electric storm" },
        { e: "💫", k: "dizzy star spin magic" },
        { e: "🎯", k: "target aim bullseye focus" },
        { e: "💨", k: "wind fast dash speed" },
        { e: "🔍", k: "search find look magnify" },
        { e: "👊", k: "punch fight fist strike" },
        { e: "🤝", k: "handshake deal agree peace" },
        { e: "🙏", k: "pray hope wish please" },
        { e: "👁️", k: "eye watch look see" },
        { e: "✋", k: "stop hand halt wait" },
        { e: "👤", k: "person silhouette shadow figure" },
        { e: "🎭", k: "theater drama masks perform" },
        { e: "🗣️", k: "speak talk voice dialogue" }
    ],
    "Nature": [
        { e: "🌳", k: "tree oak deciduous forest" },
        { e: "🌸", k: "blossom flower cherry spring" },
        { e: "🌧️", k: "rain weather storm cloud" },
        { e: "❄️", k: "snow winter cold ice" },
        { e: "🌙", k: "moon night crescent lunar" },
        { e: "☀️", k: "sun sunny bright day" },
        { e: "🌈", k: "rainbow color weather hope" },
        { e: "🍂", k: "leaves autumn fall maple" },
        { e: "🌿", k: "herb plant leaf green" },
        { e: "🌻", k: "sunflower flower yellow garden" },
        { e: "🍀", k: "clover luck shamrock green" },
        { e: "🌺", k: "hibiscus flower tropical red" },
        { e: "🌴", k: "palm tree tropical beach" },
        { e: "🌵", k: "cactus desert plant dry" },
        { e: "🍁", k: "maple leaf autumn fall" },
        { e: "🌱", k: "seedling sprout grow plant" },
        { e: "💧", k: "water drop rain tear" },
        { e: "🌾", k: "wheat rice grain crop" },
        { e: "🪨", k: "rock stone boulder earth" },
        { e: "🌍", k: "earth globe world planet" }
    ],
    "Objects": [
        { e: "📖", k: "book read open story" },
        { e: "🗝️", k: "key unlock lock secret" },
        { e: "💎", k: "gem diamond jewel crystal" },
        { e: "🏆", k: "trophy award winner prize" },
        { e: "🎪", k: "circus tent carnival show" },
        { e: "🏹", k: "bow arrow archery hunt" },
        { e: "🗡️", k: "dagger knife blade weapon" },
        { e: "🔮", k: "crystal ball magic fortune" },
        { e: "📜", k: "scroll parchment ancient text" },
        { e: "⚱️", k: "urn vase pot ashes" },
        { e: "🕯️", k: "candle light flame dark" },
        { e: "💰", k: "money gold coin treasure" },
        { e: "👑", k: "crown king queen royal" },
        { e: "🎁", k: "gift present box surprise" },
        { e: "📿", k: "beads prayer rosary necklace" },
        { e: "🧿", k: "nazar amulet evil eye protection" },
        { e: "⚗️", k: "alchemy potion flask chemistry" },
        { e: "🔱", k: "trident poseidon sea spear" },
        { e: "🪄", k: "wand magic wizard spell" },
        { e: "⚙️", k: "gear cog machine mechanism" }
    ],
    "Weather": [
        { e: "🌤️", k: "sun clouds partly weather" },
        { e: "⛈️", k: "storm thunder lightning rain" },
        { e: "🌪️", k: "tornado twister wind storm" },
        { e: "🌫️", k: "fog mist haze cloud" },
        { e: "🌨️", k: "snow cloud winter cold" },
        { e: "☁️", k: "cloud overcast sky gray" },
        { e: "💨", k: "wind gust breeze blow" },
        { e: "🌬️", k: "wind face blow breeze" },
        { e: "☔", k: "rain umbrella wet storm" },
        { e: "🌡️", k: "thermometer temperature heat cold" },
        { e: "⛅", k: "sun cloud partly cloudy" },
        { e: "🌥️", k: "cloud sun behind mostly" },
        { e: "🌦️", k: "rain sun shower mixed" },
        { e: "🌩️", k: "lightning cloud thunder electric" },
        { e: "☃️", k: "snowman winter snow cold" }
    ],
    "Fantasy": [
        { e: "🐉", k: "dragon fire mythical beast" },
        { e: "🧙", k: "wizard mage magic sorcerer" },
        { e: "🧝", k: "elf fairy forest magic" },
        { e: "🧛", k: "vampire blood undead night" },
        { e: "🧟", k: "zombie undead dead walking" },
        { e: "👹", k: "ogre demon oni monster" },
        { e: "👺", k: "goblin tengu demon mask" },
        { e: "🧞", k: "genie djinn lamp wish" },
        { e: "🧚", k: "fairy pixie magic wings" },
        { e: "🦄", k: "unicorn horse magic rainbow" },
        { e: "🧜", k: "mermaid merman sea water" },
        { e: "👼", k: "angel cherub holy wing" },
        { e: "🎃", k: "pumpkin halloween jack lantern" },
        { e: "🦇", k: "bat night dark cave" },
        { e: "🕷️", k: "spider web creepy insect" },
        { e: "🦂", k: "scorpion desert sting poison" },
        { e: "🐲", k: "dragon face chinese asian" },
        { e: "👿", k: "devil angry evil demon" },
        { e: "☠️", k: "skull crossbones death pirate" },
        { e: "👾", k: "alien monster space creature" }
    ],
    "Animals": [
        { e: "🐺", k: "wolf howl pack wild" },
        { e: "🦊", k: "fox cunning red forest" },
        { e: "🐻", k: "bear forest grizzly wild" },
        { e: "🦁", k: "lion king jungle cat" },
        { e: "🐯", k: "tiger stripes cat jungle" },
        { e: "🦅", k: "eagle bird fly predator" },
        { e: "🦉", k: "owl night bird wise" },
        { e: "🐍", k: "snake serpent slither venom" },
        { e: "🦈", k: "shark ocean predator fish" },
        { e: "🐙", k: "octopus tentacle sea kraken" },
        { e: "🦋", k: "butterfly insect fly beauty" },
        { e: "🐝", k: "bee honey insect buzz" },
        { e: "🕊️", k: "dove peace bird white" },
        { e: "🦚", k: "peacock bird feather colorful" },
        { e: "🦌", k: "deer stag forest antler" },
        { e: "🐗", k: "boar pig wild forest" },
        { e: "🐊", k: "crocodile alligator swamp reptile" },
        { e: "🦎", k: "lizard reptile gecko scales" },
        { e: "🐢", k: "turtle tortoise shell slow" },
        { e: "🐧", k: "penguin bird ice arctic" }
    ],
    "Symbols": [
        { e: "⭐", k: "star rating favorite shine" },
        { e: "💫", k: "dizzy star sparkle magic" },
        { e: "✨", k: "sparkle magic shine glitter" },
        { e: "❤️", k: "heart love red romance" },
        { e: "💔", k: "broken heart sad love" },
        { e: "☠️", k: "skull death danger pirate" },
        { e: "⚠️", k: "warning caution alert danger" },
        { e: "❌", k: "cross wrong no cancel" },
        { e: "✅", k: "check correct yes done" },
        { e: "❓", k: "question mystery unknown ask" },
        { e: "❗", k: "exclamation alert important attention" },
        { e: "💢", k: "anger symbol mad rage" },
        { e: "💤", k: "sleep zzz tired rest" },
        { e: "💯", k: "hundred perfect score full" },
        { e: "🔴", k: "red circle dot stop" },
        { e: "🟢", k: "green circle dot go" },
        { e: "🔵", k: "blue circle dot color" },
        { e: "⚫", k: "black circle dark void" },
        { e: "⚪", k: "white circle light blank" },
        { e: "🔶", k: "orange diamond shape warn" }
    ]
};
