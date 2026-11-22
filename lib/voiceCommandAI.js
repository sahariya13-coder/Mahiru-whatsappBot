const { chatWithMahiruAI } = require('./mahiruAI');

const COMMANDS = {
human:'Human takeover on/off',gid:'Show group ID',gact:'Activate group by ID; owner only',gdeact:'Deactivate group by ID; owner only',simage:'Convert replied sticker to image; needs sticker reply',kick:'Remove mentioned group member; needs real WhatsApp mention',mute:'Mute group; optional minutes',unmute:'Unmute group',ban:'Ban user from bot; needs target',unban:'Unban user; needs target',menu:'Show bot menu',sticker:'Create sticker from replied media',warnings:'Show user warnings; needs mention',warn:'Warn mentioned user',tts:'Speak supplied text; needs text',delete:'Delete replied bot message',attp:'Animated text sticker; needs text',settings:'Show settings',mode:'Set access mode public/private, group/inbox; owner only',anticall:'Anti-call on/off/status',pmblocker:'Private message blocker on/off/status',owner:'Show bot owner',tagall:'Mention everyone in group',tagnotadmin:'Mention non-admin members',hidetag:'Hidden mention with message',tag:'Tag group members with message',antilink:'Anti-link on/off',antitag:'Anti-tag on/off',meme:'Send meme',joke:'Tell joke',quote:'Send quote',fact:'Send fact',weather:'Weather for city; needs city',news:'Latest news',ttt:'Start tic tac toe',move:'Tic tac toe move 1-9',topmembers:'Show top members',hangman:'Start hangman',guess:'Guess hangman letter',trivia:'Start trivia',answer:'Answer trivia',compliment:'Send compliment',insult:'Playful insult','8ball':'Magic 8 ball question',lyrics:'Song lyrics; needs song',simp:'Simp card',stupid:'Its so stupid meme',dare:'Truth or dare: dare',truth:'Truth question',clear:'Clear AI chat',promote:'Promote mentioned member; admin action',demote:'Demote mentioned member; admin action',ping:'Ping bot',alive:'Bot status',mention:'Mention response setting',setmention:'Set mention response text',blur:'Blur replied image',welcome:'Welcome setting/message',goodbye:'Goodbye setting/message',antibadword:'Bad word filter on/off',rule:'Show/set group rule',chatbot:'AI chatbot on/off',take:'Steal/relabel replied sticker',flirt:'Flirt line',character:'Character lookup; needs name',waste:'Wasted meme',ship:'Compatibility result',groupinfo:'Show group information',resetlink:'Reset group invite link; admin action',staff:'Show group admins',tourl:'Upload replied media to URL',emojimix:'Mix two emojis',tg:'Convert replied sticker for Telegram',vv:'Retrieve replied view-once message',clearsession:'Clear session; owner-only',autostatus:'Auto status setting',metallic:'Metallic text image',ice:'Ice text image',snow:'Snow text image',impressive:'Impressive text image',matrix:'Matrix text image',light:'Light text image',neon:'Neon text image',devil:'Devil text image',purple:'Purple text image',thunder:'Thunder text image',leaves:'Leaves text image','1917':'1917 text image',arena:'Arena text image',hacker:'Hacker text image',sand:'Sand text image',blackpink:'Blackpink text image',glitch:'Glitch text image',fire:'Fire text image',antidelete:'Anti-delete on/off',surrender:'Surrender game',cleartmp:'Clear temp files; owner-only',setpp:'Set bot profile picture from replied image',setgdesc:'Set group description',setgname:'Set group name',setgpp:'Set group photo from replied image',instagram:'Download Instagram media; needs URL',igsc:'Instagram story; needs URL/user',igs:'Instagram story; needs URL/user',fb:'Download Facebook media; needs URL',music:'Search music; needs song',spotify:'Spotify search; needs song',play:'Find/download song; needs title',video:'Find/download video; needs title',tiktok:'Download TikTok; needs URL',gpt:'AI prompt',translate:'Translate text; needs text/language',ss:'Website screenshot; needs URL',areact:'Auto reaction on/off',sudo:'Manage sudo; owner-only',goodnight:'Goodnight message',shayari:'Send poetry',roseday:'Rose day greeting',imagine:'Generate image; needs prompt',uid:'Show user ID',jid:'Show group JID',autotyping:'Auto typing on/off',autoread:'Auto read on/off',heart:'Heart meme',horny:'Horny meme',circle:'Circle image',lgbt:'LGBT image',lolice:'Lolice meme',simpcard:'Simp card',tonikawa:'Tonikawa image','its-so-stupid':'Its so stupid meme',namecard:'Name card; needs name',oogway2:'Oogway quote image',oogway:'Oogway quote image',tweet:'Fake tweet image; needs text',ytcomment:'Fake YouTube comment; needs text',comrade:'Comrade meme',gay:'Gay meme',glass:'Glass effect meme',jail:'Jail meme',passed:'Passed meme',triggered:'Triggered meme',animu:'Anime command',nom:'Anime nom reaction',poke:'Anime poke reaction',cry:'Anime cry reaction',kiss:'Anime kiss reaction',pat:'Anime pat reaction',hug:'Anime hug reaction',wink:'Anime wink reaction',facepalm:'Anime facepalm', 'face-palm':'Anime facepalm',animuquote:'Anime quote',loli:'Anime image',crop:'Crop replied sticker',pies:'Country Pies image',china:'China Pies image',indonesia:'Indonesia Pies image',japan:'Japan Pies image',korea:'Korea Pies image',india:'India Pies image',malaysia:'Malaysia Pies image',thailand:'Thailand Pies image',update:'Update bot; owner-only',removebg:'Remove background from replied image',remini:'Enhance replied image',sora:'Generate video; needs prompt'
};

const ALIASES = {help:'menu',bot:'menu',list:'menu',s:'sticker',del:'delete',steal:'take',revoke:'resetlink',infogp:'groupinfo',infogrupo:'groupinfo',mp3:'play',ytmp3:'play',song:'play',ytmp4:'video',insta:'instagram',ig:'instagram',facebook:'fb',trt:'translate',ssweb:'ss',screenshot:'ss',autoreact:'areact',autoreaction:'areact',stickertelegram:'tg',tgsticker:'tg',telesticker:'tg',enhance:'remini',upscale:'remini',rmbg:'removebg',nobg:'removebg',itssostupid:'stupid',iss:'stupid',gn:'goodnight',lovenight:'goodnight',shayri:'shayari',tictactoe:'ttt','youtube-comment':'ytcomment',gai:'chatbot',iai:'chatbot',tt:'tiktok',gemini:'gpt',flux:'imagine',dalle:'imagine',url:'tourl',emix:'emojimix'};

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[।!?.,،؛:]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(mahiru|মাহিরু|মাহিরু-chan)\s+/, '');
}
function parseJson(value) {
  const raw = String(value || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch (error) { return null; }
}
async function convertSpokenCommandToBotCommand(transcript, context = {}) {
  const value = normalize(transcript);
  if (!value) return null;
  if (/^\.[a-z0-9-]+(?:\s|$)/i.test(value)) {
    const match = value.match(/^\.([a-z0-9-]+)([\s\S]*)$/i);
    const name = ALIASES[match[1]] || match[1];
    return Object.prototype.hasOwnProperty.call(COMMANDS, name) ? '.' + name + (match[2] || '') : null;
  }
  const system = [
    'You are Mahiru WhatsApp voice-command intent router. Understand natural Bangla, Banglish, English, synonyms, indirect requests, and mixed language.',
    'Determine if transcript requests one bot command. Do not answer the user. Return JSON only: {"command":"canonical-name-or-null","args":"arguments only","confidence":0.0}.',
    'For normal conversation/questions, greetings, or unclear intent return command null. Select only from the catalogue; never invent commands.',
    'Extract all explicit arguments. Convert spoken Bangla numbers to digits when clear. For toggles use on/off. Preserve song titles, URLs, city names, durations, and user-provided text.',
    'Never invent a mention, JID, group ID, URL, target, or media. Commands requiring a real WhatsApp mention/reply/media may still be selected only if intent is explicit; existing handler will validate context.',
    'Sensitive owner/admin commands require direct explicit requests; never infer them from vague wording. Permission checks in command handlers must remain effective.',
    'Examples: "মেনু দেখাও" => menu; "গ্রুপের সবাইকে ডাকো" => tagall; "লিংক দিলে ডিলিট করো" => antilink args on; "পাঁচ মিনিটের জন্য গ্রুপ মিউট করো" => mute args 5; "এই গানটা চালাও [title]" => play with title; "তুমি কেমন আছো" => null.',
    'Catalogue:\n' + Object.entries(COMMANDS).map(([name, desc]) => name + ': ' + desc).join('\n'),
    'Aliases: ' + Object.entries(ALIASES).map(([a,c]) => a + '=>' + c).join(', '),
    'Context: ' + JSON.stringify({isGroup:!!context.isGroup,hasQuotedMessage:!!context.hasQuotedMessage,hasImage:!!context.hasImage,hasVideo:!!context.hasVideo,hasMention:!!context.hasMention})
  ].join('\n');
  try {
    const reply = await chatWithMahiruAI({uid:'voice-command:' + (context.chatId || 'chat') + ':' + (context.senderId || 'user'),text:value.slice(0,1800),system});
    const parsed = parseJson(reply);
    if (!parsed || typeof parsed !== 'object') return null;
    const rawName = String(parsed.command || '').toLowerCase().replace(/^\./,'').trim();
    if (!rawName || rawName === 'null' || rawName === 'none') return null;
    const name = ALIASES[rawName] || rawName;
    if (!Object.prototype.hasOwnProperty.call(COMMANDS,name)) return null;
    const confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence) || confidence < 0.68) return null;
    const args = String(parsed.args || '').trim().replace(/^[.]+/,'');
    return '.' + name + (args ? ' ' + args : '');
  } catch (error) {
    console.error('[VOICE COMMAND AI] Intent detection failed:',error.message);
    return null;
  }
}
module.exports = {convertSpokenCommandToBotCommand,COMMANDS};
