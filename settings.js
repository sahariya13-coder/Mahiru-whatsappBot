require('dotenv').config();

const settings = {
  packname: 'Mahiru',
  author: '‎MSK',
  botName: "Mahiru Shiina",
  botOwner: 'MSK', // Your display name
  ownerUsername: 'MSKBro0', // WhatsApp username without @
  ownerNumber: '8801624235915', // Country code + number, no plus or spaces
  ownerLid: '216123442245856@lid', // Optional: paste your WhatsApp @lid from the .uid command
  giphyApiKey: 'qnl7ssQChTdPjsKta2Ax2LMaGXz303tq',
  commandMode: "public",
  maxStoreMessages: 20, 
  storeWriteInterval: 10000,
  description: "This is a bot for managing group commands and automating tasks.",
  version: "3.0.8",
  updateZipUrl: "https://github.com/mruniquehacker/Knightbot-MD/archive/refs/heads/main.zip",
  // Media / Knight API (song, video, cards, etc.)
  knightApiUrl: process.env.KNIGHT_API_URL || 'https://knightbotapi.stream',
  knightApiKey: process.env.KNIGHT_API_KEY || 'knight',
  mediaApiUrl: process.env.MEDIA_API_URL || 'https://knightbotapi.stream',
  mediaApiKey: process.env.MEDIA_API_KEY || 'knight',
  princeApiUrl: process.env.PRINCE_API_URL || 'https://api.princetechn.com',
  princeApiKey: process.env.PRINCE_API_KEY || 'prince',
  // Optional hosted song APIs (set keys in hosting environment variables)
  vidFetchApiKey: process.env.VIDFETCH_API_KEY || 'vf_live_sk_4cfc16047ffb3ccb87ee93daf5d36999f99da9c53d013246',
};

module.exports = settings;
