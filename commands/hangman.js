const fs = require('fs');

const words = ['javascript', 'bot', 'hangman', 'whatsapp', 'nodejs'];
let hangmanGames = {};

function startHangman(sock, chatId) {
    const word = words[Math.floor(Math.random() * words.length)];
    const maskedWord = '_ '.repeat(word.length).trim();

    hangmanGames[chatId] = {
        word,
        maskedWord: maskedWord.split(' '),
        guessedLetters: [],
        wrongGuesses: 0,
        maxWrongGuesses: 6,
    };

    sock.sendMessage(chatId, { text: `গেম শুরু হয়েছে! শব্দটি হলো: ${maskedWord}` });
}

function guessLetter(sock, chatId, letter) {
    if (!hangmanGames[chatId]) {
        sock.sendMessage(chatId, { text: 'এখন কোনো গেম চলছে না। .hangman দিয়ে নতুন গেম শুরু করুন।' });
        return;
    }

    const game = hangmanGames[chatId];
    const { word, guessedLetters, maskedWord, maxWrongGuesses } = game;

    if (guessedLetters.includes(letter)) {
        sock.sendMessage(chatId, { text: `আপনি ইতিমধ্যে অনুমান করেছেন "${letter}". অন্য অক্ষর দিন।` });
        return;
    }

    guessedLetters.push(letter);

    if (word.includes(letter)) {
        for (let i = 0; i < word.length; i++) {
            if (word[i] === letter) {
                maskedWord[i] = letter;
            }
        }
        sock.sendMessage(chatId, { text: `সঠিক অনুমান! ${maskedWord.join(' ')}` });

        if (!maskedWord.includes('_')) {
            sock.sendMessage(chatId, { text: `অভিনন্দন! আপনি শব্দটি অনুমান করেছেন: ${word}` });
            delete hangmanGames[chatId];
        }
    } else {
        game.wrongGuesses += 1;
        sock.sendMessage(chatId, { text: `ভুল অনুমান! আপনার আর ${maxWrongGuesses - game.wrongGuesses}বার চেষ্টা বাকি।` });

        if (game.wrongGuesses >= maxWrongGuesses) {
            sock.sendMessage(chatId, { text: `গেম শেষ! সঠিক শব্দটি ছিল: ${word}` });
            delete hangmanGames[chatId];
        }
    }
}

module.exports = { startHangman, guessLetter };
