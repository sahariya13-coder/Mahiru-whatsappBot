const axios = require('axios');

let triviaGames = {};

async function startTrivia(sock, chatId) {
    if (triviaGames[chatId]) {
        sock.sendMessage(chatId, { text: 'একটি কুইজ গেম আগে থেকেই চলছে!' });
        return;
    }

    try {
        const response = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple');
        const questionData = response.data.results[0];

        triviaGames[chatId] = {
            question: questionData.question,
            correctAnswer: questionData.correct_answer,
            options: [...questionData.incorrect_answers, questionData.correct_answer].sort(),
        };

        sock.sendMessage(chatId, {
            text: `কুইজের সময়!\n\nপ্রশ্ন: ${triviaGames[chatId].question}\nবিকল্পসমূহ:\n${triviaGames[chatId].options.join('\n')}`
        });
    } catch (error) {
        sock.sendMessage(chatId, { text: 'কুইজের প্রশ্ন আনা যায়নি। পরে আবার চেষ্টা করুন।' });
    }
}

function answerTrivia(sock, chatId, answer) {
    if (!triviaGames[chatId]) {
        sock.sendMessage(chatId, { text: 'এখন কোনো কুইজ গেম চলছে না।' });
        return;
    }

    const game = triviaGames[chatId];

    if (answer.toLowerCase() === game.correctAnswer.toLowerCase()) {
        sock.sendMessage(chatId, { text: `সঠিক উত্তর! উত্তরটি হলো ${game.correctAnswer}` });
    } else {
        sock.sendMessage(chatId, { text: `ভুল উত্তর! সঠিক উত্তর ছিল ${game.correctAnswer}` });
    }

    delete triviaGames[chatId];
}

module.exports = { startTrivia, answerTrivia };
